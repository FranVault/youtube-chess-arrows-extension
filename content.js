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
  const ARROW_COLOR   = '#F6A623';   // amarillo-naranja chess.com
  const ARROW_OPACITY = 0.85;
  const STROKE_WIDTH  = 6;           // grosor del tallo
  const HEAD_SIZE     = 18;          // tamaño de la punta

  // ── Inicialización (espera hasta que el video cargue) ──────────
  function init () {
    const video = document.querySelector('video');
    if (!video) return;

    videoContainer = video.parentElement;
    if (!videoContainer) return;

    // Asegurarse de que el contenedor tenga posición relativa
    const cs = getComputedStyle(videoContainer);
    if (cs.position === 'static') {
      videoContainer.style.position = 'relative';
    }

    createOverlay(video);
    attachEvents();
  }

  // ── Crear el SVG overlay ───────────────────────────────────────
  function createOverlay (video) {
    if (overlay) overlay.remove();

    overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.id = 'yt-chess-arrows-overlay';

    // Definir el marcador de punta de flecha
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

    // Posicionamiento absoluto encima del video
    Object.assign(overlay.style, {
      position:      'absolute',
      top:           '0',
      left:          '0',
      width:         '100%',
      height:        '100%',
      pointerEvents: 'none',   // los eventos van al handler del container
      zIndex:        '9999',
    });

    videoContainer.appendChild(overlay);
    syncOverlaySize(video);

    // Mantener el SVG sincronizado si el video cambia de tamaño
    new ResizeObserver(() => syncOverlaySize(video)).observe(video);
  }

  function syncOverlaySize (video) {
    if (!overlay) return;
    overlay.setAttribute('viewBox', `0 0 ${video.clientWidth} ${video.clientHeight}`);
    overlay.style.width  = video.clientWidth  + 'px';
    overlay.style.height = video.clientHeight + 'px';
    // Reacomodar el overlay respecto al video (puede estar desplazado)
    const vr = video.getBoundingClientRect();
    const cr = videoContainer.getBoundingClientRect();
    overlay.style.left = (vr.left - cr.left) + 'px';
    overlay.style.top  = (vr.top  - cr.top)  + 'px';
  }

  // ── Eventos ────────────────────────────────────────────────────
  function attachEvents () {
    // Usamos el videoContainer para capturar los eventos
    videoContainer.addEventListener('mousedown',  onMouseDown,  true);
    videoContainer.addEventListener('mousemove',  onMouseMove,  true);
    videoContainer.addEventListener('mouseup',    onMouseUp,    true);
    videoContainer.addEventListener('contextmenu', onContextMenu, true);
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
      // Click izquierdo → borrar todo
      clearArrows();
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
    if (isOverVideo(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // ── Helpers ────────────────────────────────────────────────────
  function isOverVideo (e) {
    const video = videoContainer.querySelector('video');
    if (!video) return false;
    const r = video.getBoundingClientRect();
    return (
      e.clientX >= r.left && e.clientX <= r.right &&
      e.clientY >= r.top  && e.clientY <= r.bottom
    );
  }

  /** Convierte coordenadas de pantalla a coordenadas del SVG */
  function videoPos (e) {
    const video = videoContainer.querySelector('video');
    const r = video.getBoundingClientRect();
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
