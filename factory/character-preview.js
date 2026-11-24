import { workerArt } from './art.js';

const views = ['front', 'right', 'back', 'left'];

export function mountCharacterPreview(root) {
  root.className = 'character-preview';
  root.hidden = true;
  root.innerHTML = `
    <div class="character-preview-caption">
      <strong></strong><span></span>
    </div>
    <div class="character-preview-stage">
      <img class="character-preview-image" alt="" width="24" height="28">
    </div>
    <div class="character-preview-controls">
      <button type="button" data-turn="-1"><span aria-hidden="true">↶</span> 向左轉</button>
      <button type="button" data-turn="1"><span aria-hidden="true">↷</span> 向右轉</button>
    </div>`;

  const caption = root.querySelector('strong');
  const role = root.querySelector('.character-preview-caption span');
  const image = root.querySelector('img');
  const controls = root.querySelector('.character-preview-controls');
  const listeners = new AbortController();
  let character;
  let facing = 0;

  function showView() {
    const view = views[facing];
    image.dataset.view = view;
    image.src = workerArt(character.id, facing % 2 ? 'side' : view);
  }

  controls.addEventListener('click', (event) => {
    const button = event.target.closest('[data-turn]');
    if (!button || !character) return;
    facing = (facing + Number(button.dataset.turn) + views.length) % views.length;
    showView();
  }, { signal: listeners.signal });

  return {
    show(next) {
      if (next === character) return;
      character = next;
      root.hidden = !character;
      if (!character) return;

      caption.textContent = character.name;
      role.textContent = character.role;
      root.style.setProperty('--preview-color', character.color);
      image.alt = `${character.name}的全身棋子`;
      facing = 0;
      showView();
    },
    reveal() {
      if (!root.hidden) root.scrollIntoView({ block: 'nearest' });
    },
    dispose() {
      listeners.abort();
    },
  };
}
