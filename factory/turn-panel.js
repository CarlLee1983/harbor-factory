import { getCharacter } from '../src/characters.js';
import { mountTurnPanel as mountSharedTurnPanel } from '../src/turn-panel.js';
import { portrait } from './skin-art.js';

function renderActions({ action, buttonLabel, locked, character, current, next, location, money, resultType }) {
  let controls;
  let finishSlot = '';

  switch (action) {
    case 'roll':
      controls = `<button type="button" class="primary roll-trigger" data-turn-action="roll" aria-label="${buttonLabel}" aria-describedby="turn-player-title">
        ${portrait(character.id)}
        <span class="factory-roll-label"><strong>${character.name}</strong><span>${buttonLabel}</span></span>
        <span class="roll-trigger-icon" aria-hidden="true"></span>
      </button>`;
      break;
    case 'buy':
      controls = `<div class="factory-buy-balance" id="factory-buy-balance" data-after-buy>
        <span>買後現金</span><strong>${money(current.cash - location.price)}</strong>
      </div>
      <button type="button" class="primary" data-turn-action="buy" aria-describedby="factory-buy-balance paper-terms">
        <span>${buttonLabel}</span><strong>${money(location.price)}</strong>
      </button>
      <button type="button" class="text-button" data-turn-action="skip">略過</button>`;
      break;
    case 'skip':
      controls = `<button type="button" class="primary" data-turn-action="skip" aria-describedby="paper-action-detail paper-terms">${buttonLabel}</button>`;
      break;
    case 'end': {
      const nextCharacter = next && getCharacter(next.characterId);
      if (resultType === 'skipped' && current.cash >= location.price) finishSlot = ' data-finish-slot="middle"';
      controls = `<button type="button" class="primary" data-turn-action="end">
        <span>${buttonLabel}</span>
        ${nextCharacter ? `<span class="factory-handoff-recipient">${portrait(nextCharacter.id)}<strong>${nextCharacter.name}</strong></span>` : ''}
      </button>
      <button type="button" class="text-button" data-turn-action="finish" aria-haspopup="dialog">結束對局</button>`;
      break;
    }
  }

  return `<div class="paper-actions factory-turn-actions" data-factory-actions="${action}"${finishSlot} ${locked ? 'inert' : ''}>${controls}</div>`;
}

export function mountTurnPanel(container, map, actions) {
  const panel = mountSharedTurnPanel(container, map, actions, { renderActions, showNextPlayer: false });
  const keyboard = new AbortController();
  container.addEventListener('keydown', (event) => {
    if (event.repeat && event.key === 'Enter' && event.target.closest('button[data-turn-action]')) event.preventDefault();
  }, { signal: keyboard.signal });
  return {
    ...panel,
    destroy() {
      keyboard.abort();
      panel.destroy();
    },
  };
}
