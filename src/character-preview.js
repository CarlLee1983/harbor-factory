import * as THREE from 'three';
import './character-preview.css';
import { createPawn } from './pawn-model.js';
import { pawnSource } from './portraits.js';

export function mountCharacterPreview(root) {
  root.className = 'character-preview';
  root.hidden = true;
  root.innerHTML = `
    <div class="character-preview-caption">
      <strong></strong><span></span>
    </div>
    <div class="character-preview-stage">
      <img class="character-preview-image" alt="" width="192" height="208">
    </div>
    <div class="character-preview-controls" hidden>
      <button type="button" data-turn="-1"><span aria-hidden="true">↶</span> 向左轉</button>
      <button type="button" data-turn="1"><span aria-hidden="true">↷</span> 向右轉</button>
    </div>`;

  const caption = root.querySelector('strong');
  const role = root.querySelector('.character-preview-caption span');
  const stage = root.querySelector('.character-preview-stage');
  const fallback = root.querySelector('img');
  const controls = root.querySelector('.character-preview-controls');
  const observer = new ResizeObserver(draw);
  let character;
  let renderer;
  let scene;
  let camera;
  let pawn;
  let bounds;
  let unavailable = false;

  function startRenderer() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', { alpha: true, antialias: true });
    if (!context) return false;

    try {
      renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true });
    } catch {
      context.getExtension('WEBGL_lose_context')?.loseContext();
      return false;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    canvas.className = 'character-preview-canvas';
    canvas.setAttribute('role', 'img');
    canvas.addEventListener('webglcontextlost', useFallback);
    stage.append(canvas);

    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff6df, 0xb1b6c2, 1.8));
    const key = new THREE.DirectionalLight(0xffedcf, 2.1);
    key.position.set(-2, 4, 3);
    const fill = new THREE.DirectionalLight(0xd1edff, 1.1);
    fill.position.set(2, 2, -3);
    scene.add(key, fill);

    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10);
    observer.observe(stage);
    return true;
  }

  function clearPawn() {
    if (!pawn) return;
    pawn.removeFromParent();
    pawn.traverse((part) => {
      if (!part.isMesh) return;
      part.geometry.dispose();
      part.material.dispose();
    });
    pawn = null;
  }

  function releaseRenderer() {
    observer.disconnect();
    clearPawn();
    if (!renderer) return;
    const canvas = renderer.domElement;
    canvas.removeEventListener('webglcontextlost', useFallback);
    renderer.dispose();
    if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
    canvas.remove();
    renderer = null;
  }

  function useFallback() {
    unavailable = true;
    // Move focus before hiding the controls if WebGL was lost during an inspection.
    if (controls.contains(document.activeElement)) {
      root.closest('.lineup-panel')?.querySelector('[data-confirm]')?.focus({ preventScroll: true });
    }
    controls.hidden = true;
    fallback.hidden = false;
    releaseRenderer();
  }

  function draw() {
    if (!pawn || !stage.clientWidth || !stage.clientHeight) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const aspect = width / height;
    const halfHeight = Math.max(bounds.height * .62, bounds.radius * 1.15 / aspect);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    renderer.render(scene, camera);
  }

  controls.addEventListener('click', (event) => {
    const button = event.target.closest('[data-turn]');
    if (!button || !pawn) return;
    pawn.rotation.y += Number(button.dataset.turn) * Math.PI / 6;
    renderer.render(scene, camera);
  });

  return {
    show(next) {
      if (next === character) return;
      character = next;
      clearPawn();
      root.hidden = !character;
      if (!character) return;

      caption.textContent = character.name;
      role.textContent = character.role;
      root.style.setProperty('--preview-color', character.color);
      const description = `${character.name}的全身棋子`;
      fallback.alt = description;
      fallback.src = pawnSource(character.id);
      if (unavailable) return;
      if (!renderer && !startRenderer()) {
        useFallback();
        return;
      }

      pawn = createPawn(character);
      pawn.rotation.y = 0;
      const { min, max } = new THREE.Box3().setFromObject(pawn);
      bounds = {
        height: max.y - min.y,
        radius: Math.hypot(Math.max(-min.x, max.x), Math.max(-min.z, max.z)),
      };
      const center = (min.y + max.y) / 2;
      camera.position.set(0, center + .24, 2.3);
      camera.lookAt(0, center, 0);
      pawn.rotation.y = -.22;
      scene.add(pawn);
      renderer.domElement.setAttribute('aria-label', description);
      fallback.hidden = true;
      controls.hidden = false;
      draw();
    },
    reveal() {
      if (!root.hidden) root.scrollIntoView({ block: 'nearest' });
    },
    dispose: releaseRenderer,
  };
}
