import './board-viewport.css';

const zoomLevels = [1, 1.5, 2];
const arrowPan = new Map([
  ['ArrowLeft', [-40, 0]],
  ['ArrowRight', [40, 0]],
  ['ArrowUp', [0, -40]],
  ['ArrowDown', [0, 40]],
]);

export function mountBoardViewport(panel, viewport) {
  const board = viewport.querySelector('#board-canvas');
  const controls = panel.querySelector('.board-zoom');
  const zoomOut = controls.querySelector('[data-zoom-out]');
  const zoomIn = controls.querySelector('[data-zoom-in]');
  const fit = controls.querySelector('[data-zoom-fit]');
  const scale = controls.querySelector('output');
  const events = new AbortController();
  const { signal } = events;
  let level = 0;
  let drag;
  let dragged = false;

  function setZoom(nextLevel) {
    if (nextLevel === level || nextLevel < 0 || nextLevel >= zoomLevels.length) return;
    const { width, height } = board.getBoundingClientRect();
    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / width;
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / height;
    level = nextLevel;
    const zoom = zoomLevels[level];
    viewport.style.setProperty('--board-zoom', zoom);
    viewport.toggleAttribute('data-zoomed', level > 0);
    viewport.tabIndex = level > 0 ? 0 : -1;
    zoomOut.setAttribute('aria-disabled', level === 0);
    fit.setAttribute('aria-disabled', level === 0);
    zoomIn.setAttribute('aria-disabled', level === zoomLevels.length - 1);
    scale.value = `${zoom * 100}%`;

    const resized = board.getBoundingClientRect();
    viewport.scrollTo({
      left: centerX * resized.width - viewport.clientWidth / 2,
      top: centerY * resized.height - viewport.clientHeight / 2,
    });
  }

  zoomOut.addEventListener('click', () => setZoom(level - 1), { signal });
  zoomIn.addEventListener('click', () => setZoom(level + 1), { signal });
  fit.addEventListener('click', () => setZoom(0), { signal });

  viewport.addEventListener('keydown', (event) => {
    if (level === 0 || event.target !== viewport || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const offset = arrowPan.get(event.key);
    if (!offset) return;
    const [left, top] = offset;
    event.preventDefault();
    viewport.scrollBy({ left, top });
  }, { signal });

  viewport.addEventListener('pointerdown', (event) => {
    dragged = false;
    if (event.pointerType !== 'mouse' || event.button !== 0 || level === 0 || !board.contains(event.target)) return;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
  }, { signal });

  viewport.addEventListener('pointermove', (event) => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!dragged) {
      if (Math.hypot(dx, dy) < 5) return;
      viewport.setPointerCapture(event.pointerId);
      viewport.setAttribute('data-dragging', '');
      dragged = true;
    }
    viewport.scrollTo({ left: drag.left - dx, top: drag.top - dy });
  }, { signal });

  function stopDrag(event) {
    if (drag?.id !== event.pointerId) return;
    drag = undefined;
    viewport.removeAttribute('data-dragging');
  }

  viewport.addEventListener('pointerup', stopDrag, { signal });
  viewport.addEventListener('pointercancel', stopDrag, { signal });
  viewport.addEventListener('lostpointercapture', stopDrag, { signal });
  viewport.addEventListener('pointerleave', (event) => {
    if (!viewport.hasPointerCapture(event.pointerId)) stopDrag(event);
  }, { signal });
  viewport.addEventListener('click', (event) => {
    if (!dragged || event.detail === 0) return;
    event.preventDefault();
    event.stopPropagation();
  }, { signal, capture: true });

  function pawnViewRegions(rollButton) {
    const rect = viewport.getBoundingClientRect();
    const clip = {
      left: Math.max(rect.left + viewport.clientLeft, 0),
      top: Math.max(rect.top + viewport.clientTop, 0),
      right: Math.min(rect.left + viewport.clientLeft + viewport.clientWidth, innerWidth),
      bottom: Math.min(rect.top + viewport.clientTop + viewport.clientHeight, innerHeight),
    };
    if (!rollButton) return [clip];
    const roll = rollButton.getBoundingClientRect();
    // A pawn is clear of the fixed roll button if it fits entirely on any one side.
    return [
      { ...clip, right: Math.min(clip.right, roll.left) },
      { ...clip, left: Math.max(clip.left, roll.right) },
      { ...clip, bottom: Math.min(clip.bottom, roll.top) },
      { ...clip, top: Math.max(clip.top, roll.bottom) },
    ];
  }

  function pawnIsVisible(pawn, regions) {
    return regions.some(({ left, top, right, bottom }) =>
      pawn.left >= left && pawn.right <= right && pawn.top >= top && pawn.bottom <= bottom);
  }

  function revealPawn(getBounds, { rollButton, scrollPage = false } = {}) {
    if (level === 0) return;
    const pawn = getBounds();
    if (!pawn) return;
    const regions = pawnViewRegions(rollButton);
    if (pawnIsVisible(pawn, regions)) return;

    const { scrollLeft, scrollTop, scrollWidth, scrollHeight, clientWidth, clientHeight } = viewport;
    const inset = 8;
    let best;
    for (const region of regions) {
      const minX = Math.max(-scrollLeft, pawn.right - region.right + inset);
      const maxX = Math.min(scrollWidth - clientWidth - scrollLeft, pawn.left - region.left - inset);
      const minY = Math.max(-scrollTop, pawn.bottom - region.bottom + inset);
      const maxY = Math.min(scrollHeight - clientHeight - scrollTop, pawn.top - region.top - inset);
      if (minX > maxX || minY > maxY) continue;
      const left = Math.min(Math.max(0, minX), maxX);
      const top = Math.min(Math.max(0, minY), maxY);
      const distance = Math.hypot(left, top);
      if (!best || distance < best.distance) best = { left, top, distance };
    }
    if (best) {
      viewport.scrollBy({ left: best.left, top: best.top, behavior: 'instant' });
    } else if (scrollPage) {
      // Try the board's scroll limits before moving the page enough to expose the pawn.
      const remainingDown = scrollHeight - clientHeight - scrollTop;
      const minY = Math.ceil(pawn.bottom - remainingDown - innerHeight + inset);
      const maxY = Math.floor(pawn.top + scrollTop - inset);
      const top = Math.min(Math.max(0, minY), maxY);
      if (minY <= maxY && top) {
        window.scrollBy({ top, behavior: 'instant' });
        revealPawn(getBounds);
      }
    }
  }

  function preservePawnVisibility(pawn, getBounds, rollButton) {
    if (level === 0 || !pawn || !pawnIsVisible(pawn, pawnViewRegions(rollButton))) return;
    const zoom = level;
    const { scrollLeft, scrollTop } = viewport;
    const pageX = window.scrollX;
    const pageY = window.scrollY;
    // The fallback loads asynchronously, so the player can pan or zoom before it paints.
    return () => {
      if (signal.aborted || !rollButton.isConnected || rollButton.closest('[inert]')) return;
      if (level !== zoom || viewport.scrollLeft !== scrollLeft || viewport.scrollTop !== scrollTop ||
          window.scrollX !== pageX || window.scrollY !== pageY) return;
      revealPawn(getBounds, { rollButton });
    };
  }

  return { revealPawn, preservePawnVisibility, destroy: () => events.abort() };
}
