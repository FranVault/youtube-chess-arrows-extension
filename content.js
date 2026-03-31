// Chess Arrows for YouTube - Content Script

(function () {
  // ── Estado global ──────────────────────────────────────────────
  let arrows = [];          // flechas ya dibujadas
  let drawing = false;      // ¿estamos arrastrando?
  let startX = 0, startY = 0;
  let currentArrow = null;  // flecha temporal mientras se arrastra

  let overlay = null;       // SVG que vive encima del video
  let videoContainer = null;

  // ── Colores ────────────────────────────────────────────────────
  const ARROW_COLOR   = '#54B8F0';   // celeste azul claro
  const ARROW_OPACITY = 0.85;
  const STROKE_WIDTH  = 10;          // grosor del tallo
  const HEAD_SIZE     = 24;          // tamaño de la punta

  // ── Inicialización (espera hasta que el video cargue) ──────────
  function init () {
    const video = document.querySelector('video');
    if (!video) return;

    // Subir por el DOM hasta encontrar el contenedor real del player
    // YouTube usa #movie_player > div.html5-video-container > video
    let el = video;
    while (el && el !== document.body) {
      if (el.id === 'movie_player' || el.classList.contains('html5-video-player')) {
        videoContainer = el;
        break;
      }
      el = el.parentElement;
    }
    if (!videoContainer) videoContainer = video.parentElement;
    if (!videoContainer) return;

    const cs = getComputedStyle(videoContainer);
    if (cs.position === 'static') videoContainer.style.position = 'relative';

    createOverlay(video);
    attachEvents();
  }

  let justCleared = false;  // flag para bloquear el click que sigue al mousedown

  // ── Crear el SVG overlay ───────────────────────────────────────
  function createOverlay (video) {
    if (overlay) overlay.remove();

    overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.id = 'yt-chess-arrows-overlay';

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '4');
    marker.setAttribute('markerHeight', '4');
    marker.setAttribute('refX', '2');
    marker.setAttribute('refY', '2');
    marker.setAttribute('orient', 'auto');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', '0 0, 4 2, 0 4');
    poly.setAttribute('fill', ARROW_COLOR);
    marker.appendChild(poly);
    defs.appendChild(marker);
    overlay.appendChild(defs);

    Object.assign(overlay.style, {
      position:      'absolute',
      top:           '0',
      left:          '0',
      width:         '100%',
      height:        '100%',
      pointerEvents: 'none',
      zIndex:        '9999',
    });

    videoContainer.appendChild(overlay);
    syncOverlaySize();

    new ResizeObserver(() => syncOverlaySize()).observe(videoContainer);
  }

  function syncOverlaySize () {
    if (!overlay) return;
    const cr = videoContainer.getBoundingClientRect();
    overlay.setAttribute('viewBox', `0 0 ${cr.width} ${cr.height}`);
    overlay.style.width  = cr.width  + 'px';
    overlay.style.height = cr.height + 'px';
    overlay.style.left   = '0px';
    overlay.style.top    = '0px';
  }

  // ── Eventos ────────────────────────────────────────────────────
  function attachEvents () {
    // Usamos el videoContainer para capturar los eventos
    videoContainer.addEventListener('mousedown',  onMouseDown,  true);
    videoContainer.addEventListener('mousemove',  onMouseMove,  true);
    videoContainer.addEventListener('mouseup',    onMouseUp,    true);
    videoContainer.addEventListener('contextmenu', onContextMenu, true);
    videoContainer.addEventListener('click',      onClickBlock, true);
  }

  function onMouseDown (e) {
    if (!isOverVideo(e)) return;

    if (e.button === 2) {
      // Click derecho → empezar a dibujar
      e.preventDefault();
      e.stopPropagation();
      const pos = videoPos(e);
      startX  = pos.x;
      startY  = pos.y;
      drawing = true;
      currentArrow = createArrowElement(startX, startY, startX, startY);
      overlay.appendChild(currentArrow);

    } else if (e.button === 0) {
      // Click izquierdo → si hay flechas, borrarlas y bloquear la pausa
      if (arrows.length > 0 || currentArrow) {
        e.preventDefault();
        e.stopPropagation();
        justCleared = true;
        clearArrows();
      }
    }
  }

  // Bloquea el evento 'click' que YouTube usa para pausar/reproducir
  function onClickBlock (e) {
    if (!isOverVideo(e)) return;
    if (justCleared) {
      e.preventDefault();
      e.stopPropagation();
      justCleared = false;
    }
  }

  function onMouseMove (e) {
    if (!drawing || !currentArrow) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = videoPos(e);
    updateArrowElement(currentArrow, startX, startY, pos.x, pos.y);
  }

  function onMouseUp (e) {
    if (e.button !== 2 || !drawing) return;
    e.preventDefault();
    e.stopPropagation();
    drawing = false;

    const pos = videoPos(e);
    const dist = Math.hypot(pos.x - startX, pos.y - startY);

    if (dist < 10) {
      // Movimiento mínimo → descartar
      if (currentArrow) currentArrow.remove();
    } else {
      updateArrowElement(currentArrow, startX, startY, pos.x, pos.y);
      arrows.push(currentArrow);
    }
    currentArrow = null;
  }

  function onContextMenu (e) {
    // Bloquear siempre el menú contextual dentro del player
    e.preventDefault();
    e.stopPropagation();
  }

  // ── Helpers ────────────────────────────────────────────────────
  // True si el cursor está dentro del player (video + barras negras)
  // Excluimos solo la barra de controles inferior (últimos 44px) para
  // no interferir con la barra de progreso de YouTube
  function isOverVideo (e) {
    const r = videoContainer.getBoundingClientRect();
    const controlsHeight = 44;
    return (
      e.clientX >= r.left &&
      e.clientX <= r.right &&
      e.clientY >= r.top &&
      e.clientY <= r.bottom - controlsHeight
    );
  }

  /** Convierte coordenadas de pantalla a coordenadas del SVG (relativas al player) */
  function videoPos (e) {
    const r = videoContainer.getBoundingClientRect();
    return {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
    };
  }

  function createArrowElement (x1, y1, x2, y2) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('stroke', ARROW_COLOR);
    line.setAttribute('stroke-width', STROKE_WIDTH);
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('opacity', ARROW_OPACITY);
    line.setAttribute('marker-end', 'url(#arrowhead)');

    g.appendChild(line);
    updateArrowElement(g, x1, y1, x2, y2);
    return g;
  }

  function updateArrowElement (g, x1, y1, x2, y2) {
    const dx   = x2 - x1;
    const dy   = y2 - y1;
    const len  = Math.hypot(dx, dy);
    if (len < 1) return;

    // Acortar el final para que el tallo no tape la punta
    const shortenBy = HEAD_SIZE * 0.9;
    const ex = x2 - (dx / len) * shortenBy;
    const ey = y2 - (dy / len) * shortenBy;

    // Actualizar marcador con el color (en caso de múltiples instancias)
    const line = g.querySelector('line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', ex);
    line.setAttribute('y2', ey);
  }

  function clearArrows () {
    arrows.forEach(a => a.remove());
    arrows = [];
    if (currentArrow) {
      currentArrow.remove();
      currentArrow = null;
    }
    drawing = false;
  }

  // ── Observador para SPA de YouTube ────────────────────────────
  // YouTube no recarga la página al navegar; hay que reinicializar
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      arrows = [];
      drawing = false;
      currentArrow = null;
      if (overlay) { overlay.remove(); overlay = null; }
      setTimeout(waitForVideo, 1500);
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });

  function waitForVideo () {
    const video = document.querySelector('video');
    if (video) {
      init();
    } else {
      setTimeout(waitForVideo, 500);
    }
  }

  // ── Arrancar ───────────────────────────────────────────────────
  waitForVideo();
})();
