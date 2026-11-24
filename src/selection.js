import { mountCharacterPreview } from './character-preview.js';
import { CHARACTERS, getCharacter } from './characters.js';
import { MAX_PLAYERS } from './game.js';
import { portrait } from './portraits.js';

export function mountSelection(root, { onStart, onExit }) {
  let lineup = Array(MAX_PLAYERS).fill(null);
  let activeSeat = 0;
  let proposed = null;

  root.innerHTML = `
    <header class="page-intro">
      <span class="eyebrow">開局準備</span>
      <h1></h1>
      <p></p>
    </header>
    <div class="selection-layout">
      <div class="player-count">
        <label for="player-count">遊玩人數</label>
        <select id="player-count">
          ${Array.from({ length: MAX_PLAYERS }, (_, index) => `<option value="${index + 1}">${index + 1} 人</option>`).join('')}
        </select>
      </div>
      <section class="character-deck" aria-labelledby="characters-title"></section>
      <aside class="lineup-panel" aria-labelledby="lineup-title">
        <div data-character-preview></div>
        <div data-lineup-details>
          <div class="surface-header"><h2 id="lineup-title">行動順序</h2><span data-lineup-count></span></div>
          <ol class="lineup" role="list"></ol>
        </div>
        <div data-lineup-actions></div>
        <button type="button" class="text-button" data-exit>返回首頁</button>
      </aside>
    </div>`;
  const heading = root.querySelector('h1');
  const instructions = root.querySelector('.page-intro p');
  const countSelect = root.querySelector('#player-count');
  const characterDeck = root.querySelector('.character-deck');
  const lineupDetails = root.querySelector('[data-lineup-details]');
  const lineupCount = root.querySelector('[data-lineup-count]');
  const lineupList = root.querySelector('.lineup');
  const actions = root.querySelector('[data-lineup-actions]');
  const preview = mountCharacterPreview(root.querySelector('[data-character-preview]'));
  countSelect.value = String(lineup.length);

  function draw(focus) {
    const review = activeSeat === null;
    const reviewingLineup = lineup.every(Boolean);
    heading.textContent = review ? '確認陣容' : `玩家 ${activeSeat + 1}，請選擇角色`;
    instructions.textContent = review ? '開始前，仍可更換已選角色。' : '每位玩家選擇一名角色，角色不可重複。';
    characterDeck.innerHTML = `
      <div class="surface-header"><h2 id="characters-title">港灣居民</h2><span>8 名角色</span></div>
      <ul class="character-grid" role="list">
        ${CHARACTERS.map((character) => characterCard(character, review)).join('')}
      </ul>
      <p class="deck-note">角色只有外觀不同，開局資金皆為 600 元。</p>`;
    lineupCount.textContent = `${lineup.filter(Boolean).length} / ${lineup.length}`;
    lineupList.innerHTML = lineup.map((id, index) => lineupRow(id, index, review)).join('');
    actions.innerHTML = `
      ${review ? '<button class="primary" data-start>開始新局 <span aria-hidden="true">→</span></button>' : `
        <button class="primary" data-confirm ${proposed ? '' : 'disabled'}>${reviewingLineup ? '確認更換' : '確認角色'} <span aria-hidden="true">→</span></button>
        ${reviewingLineup ? '<button class="text-button" data-cancel>取消更換</button>' : ''}`}`;
    if (proposed) lineupDetails.before(actions);
    else lineupDetails.after(actions);
    preview.show(getCharacter(proposed));

    if (focus) root.querySelector(focus)?.focus({ preventScroll: true });
  }

  function nextSeat() {
    const next = lineup.indexOf(null);
    return next === -1 ? null : next;
  }

  function changePlayerCount() {
    const count = Number(countSelect.value);
    if (count === lineup.length) return;

    lineup = Array.from({ length: count }, (_, index) => lineup[index] ?? null);
    activeSeat = nextSeat();
    proposed = null;
    draw();
  }

  function characterCard(character, review) {
    const owner = lineup.indexOf(character.id);
    const chosen = character.id === proposed;
    const available = !review && (owner === -1 || owner === activeSeat);
    const tag = owner === -1 ? character.role : `玩家 ${owner + 1} 已選`;
    return `
      <li><button class="character-card" type="button" data-character="${character.id}" style="--character:${character.color}" ${available ? '' : 'disabled'} aria-pressed="${chosen}">
        <span class="portrait-stage">${portrait(character.id)}<span class="character-symbol" aria-hidden="true">${character.art}</span></span>
        <span class="character-data"><strong>${character.name}</strong><small>${tag}</small></span>
        ${chosen ? '<span class="selected-mark" aria-hidden="true">✓</span>' : ''}
      </button></li>`;
  }

  function lineupRow(id, index, review) {
    const active = index === activeSeat;
    const name = id ? getCharacter(id).name : active ? '選角中' : '等待選角';
    return `<li class="lineup-row ${active ? 'choosing' : ''}" ${active ? 'aria-current="step"' : ''}>
      <span class="seat-number" aria-hidden="true">${index + 1}</span>
      ${id ? portrait(id, 'lineup-portrait') : '<span class="lineup-empty" aria-hidden="true">—</span>'}
      <span class="lineup-name"><small>玩家 ${index + 1}</small><strong>${name}</strong></span>
      ${review ? `<button type="button" class="edit-seat" data-seat="${index}" aria-label="更換 玩家 ${index + 1} 的角色">更換</button>` : ''}
    </li>`;
  }

  function handleClick(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.hasAttribute('data-start')) {
      onStart(lineup.slice());
    } else if (button.hasAttribute('data-exit')) {
      onExit();
    } else if (button.hasAttribute('data-character')) {
      proposed = button.dataset.character;
      draw('[data-confirm]');
      if (matchMedia('(max-width: 650px)').matches) preview.reveal();
    } else if (button.hasAttribute('data-seat')) {
      activeSeat = Number(button.dataset.seat);
      proposed = lineup[activeSeat];
      draw('[data-character]:not([disabled])');
    } else if (button.hasAttribute('data-confirm')) {
      lineup[activeSeat] = proposed;
      activeSeat = nextSeat();
      proposed = null;
      draw(activeSeat === null ? '[data-start]' : '[data-character]:not([disabled])');
    } else if (button.hasAttribute('data-cancel')) {
      const seat = activeSeat;
      activeSeat = null;
      proposed = null;
      draw(`[data-seat="${seat}"]`);
    }
  }

  root.addEventListener('click', handleClick);
  countSelect.addEventListener('change', changePlayerCount);
  draw();
  return () => {
    preview.dispose();
    root.removeEventListener('click', handleClick);
    countSelect.removeEventListener('change', changePlayerCount);
  };
}
