import { getCharacter } from './characters.js';
import { getLocation } from './map.js';
import { portrait } from './portraits.js';
import { placeSource } from './place-art.js';
import './paper.css';

const PIPS = [[4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];

function diceCube(die) {
  const faces = PIPS.map((pips, index) => `<span class="die-face" data-face="${index + 1}" ${index + 1 === die ? 'data-top' : ''}>
    ${pips.map((cell) => `<i class="die-pip" style="grid-area:${Math.floor(cell / 3) + 1} / ${cell % 3 + 1}"></i>`).join('')}
  </span>`).join('');
  return `<div class="die-scene" data-value="${die ?? 1}" aria-hidden="true">
    <div class="die-flight"><div class="die-cube">${faces}</div></div>
  </div>`;
}

function money(amount) {
  return `${amount.toLocaleString('zh-TW')} 元`;
}

function playerName(player) {
  return `${player.name} · ${getCharacter(player.characterId).name}`;
}

function terms(rows) {
  return `<dl class="paper-terms" id="paper-terms">${rows.map(([term, value]) => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}

function paperResult(state, current, location) {
  const { type, amount, due, delta, ownerId } = state.result;
  switch (type) {
    case 'bought':
      return {
        subject: 'property',
        caption: '地契',
        detail: `買下${location.name}，支付 ${money(amount)}。`,
        fields: terms([['所有權人', playerName(current)], ['租金', money(location.rent)]]),
        seal: '取得地契',
      };
    case 'skipped':
      return { subject: 'property', caption: '本回合結果', detail: `略過${location.name}，現金維持不變。` };
    case 'owned':
      return {
        subject: 'property',
        caption: '地契',
        detail: `抵達自有地產${location.name}。`,
        fields: terms([['所有權人', playerName(current)], ['租金', money(location.rent)]]),
      };
    case 'rent': {
      const recipient = playerName(state.players.find(({ id }) => id === ownerId));
      const paid = `在${location.name}付給${recipient} ${money(amount)} 租金。`;
      return {
        subject: 'receipt',
        caption: '租金收據',
        detail: amount < due ? `${paid}原應付 ${money(due)}。` : paid,
        fields: terms([['付款人', playerName(current)], ['收款人', recipient]]),
      };
    }
    case 'event':
      return {
        subject: 'event',
        caption: '港灣事件',
        detail: delta > 0
          ? `${location.name}帶來 ${money(amount)} 收入。`
          : `${location.name}支出 ${money(Math.abs(delta))}，實付 ${money(Math.abs(amount))}。`,
      };
    default:
      return { subject: 'arrival', caption: '本回合結果', detail: `停在${location.name}。` };
  }
}

function turnSummary(state, current, location, moving) {
  if (moving) {
    return { subject: 'dice', title: '棋子前進中', detail: '沿著街區前進，抵達後即可查看落點。' };
  }
  if (state.phase === 'roll') {
    return { subject: 'dice', title: '準備擲骰', detail: `目前位置是${location.name}。`, buttonLabel: '擲骰', action: 'roll' };
  }
  if (state.phase === 'purchase') {
    const canBuy = current.cash >= location.price;
    return {
      subject: 'property',
      caption: '無主地',
      title: location.name,
      detail: canBuy ? '' : '現金不足，請略過購買。',
      fields: terms([['地價', money(location.price)], ['租金', money(location.rent)]]),
      buttonLabel: canBuy ? '買下' : '略過',
      action: canBuy ? 'buy' : 'skip',
    };
  }
  return {
    ...paperResult(state, current, location),
    title: location.name,
    buttonLabel: state.players.length === 1 ? '進入下一輪' : '交給下一位',
    action: 'end',
  };
}

function paperActions({ action, buttonLabel, detail, purchase, locked }) {
  const ready = action === 'roll';
  const result = action === 'end';
  return `<div class="paper-actions${action === 'buy' || result ? ' paper-actions--choice' : ''}${result ? ' paper-actions--result' : ''}" ${locked ? 'inert' : ''}>
    <button type="button" class="primary${ready ? ' roll-trigger' : ''}" data-turn-action="${action}" ${purchase ? `aria-describedby="paper-terms${detail ? ' paper-action-detail' : ''}"` : ''}>
      ${ready ? '<span class="roll-trigger-icon" aria-hidden="true"></span>' : ''}${buttonLabel}${ready ? '' : ' <span aria-hidden="true">→</span>'}
    </button>
    ${action === 'buy' ? '<button type="button" class="text-button" data-turn-action="skip">略過</button>' : ''}
    ${result ? '<button type="button" class="text-button" data-turn-action="finish" aria-haspopup="dialog">結束對局</button>' : ''}
  </div>`;
}

export function mountTurnPanel(container, map, actions, { renderActions = paperActions, showNextPlayer = true } = {}) {
  const events = new AbortController();
  container.classList.add('paper-turn');
  container.addEventListener('click', (event) => {
    const action = event.target.closest('button')?.dataset.turnAction;
    if (action) actions[action]();
  }, { signal: events.signal });

  container.innerHTML = `
    <div class="turn-contents"></div>
    <div class="turn-announcement sr-only" role="status" aria-atomic="true"></div>
    <div class="roll-ceremony" aria-hidden="true" hidden>
      <div class="roll-tray"><div class="roll-ceremony-die"></div><p class="roll-ceremony-value"></p></div>
    </div>`;
  const contents = container.querySelector('.turn-contents');
  const announcement = container.querySelector('.turn-announcement');
  const ceremony = container.querySelector('.roll-ceremony');
  const ceremonyDie = ceremony.querySelector('.roll-ceremony-die');
  const ceremonyValue = ceremony.querySelector('.roll-ceremony-value');
  let finishHold;
  let locked = false;

  return {
    render(state, { moving = false } = {}) {
      const current = state.players[state.activePlayerIndex];
      const next = state.players.length > 1
        ? state.players[(state.activePlayerIndex + 1) % state.players.length]
        : null;
      const character = getCharacter(current.characterId);
      const location = getLocation(map, current.locationId);
      const { subject, caption, title, detail, fields, seal, buttonLabel, action } = turnSummary(state, current, location, moving);
      const bonus = !moving && state.startBonus > 0 ? `起點收入 ${money(state.startBonus)}。` : '';
      const purchase = state.phase === 'purchase' && !moving;
      contents.innerHTML = `
        <div class="turn-player" style="--character:${character.color}">
          <span class="turn-avatar" aria-hidden="true">${portrait(character.id)}</span>
          <div class="paper-player-name"><span class="eyebrow">輪到${current.name}</span><h2 id="turn-player-title">${character.name}</h2></div>
          <div class="turn-metrics"><span>現金</span><strong>${money(current.cash)}</strong></div>
        </div>
        <div class="turn-details paper-document paper-document--${subject}${moving ? ' paper-document--moving' : ''}">
          <div class="paper-heading">
            ${caption ? `<p class="paper-caption">${caption}</p>` : ''}
            <h3>${title}</h3>
            ${state.die === null ? '' : `<div class="paper-die-result">
              ${diceCube(state.die)}<p class="paper-die-value">骰點 ${state.die}</p>
            </div>`}
          </div>
          ${subject === 'dice' ? '' : `<div class="paper-picture">
            <img class="paper-landmark" src="${placeSource(location.id)}" width="64" height="64" alt="">
            ${seal ? `<span class="paper-seal">${seal}</span>` : ''}
          </div>`}
          <div class="paper-facts">
            ${fields ?? ''}
            ${detail ? `<p id="paper-action-detail">${detail}</p>` : ''}
            ${bonus ? `<p class="paper-bonus">${bonus}</p>` : ''}
          </div>
        </div>
        ${showNextPlayer && next ? `<p class="next-player">下一位 <strong>${playerName(next)}</strong></p>` : ''}
        ${action ? renderActions({ action, buttonLabel, detail, purchase, locked, character, current, next, location, money, resultType: state.result?.type }) : ''}`;
      if (!moving) {
        const description = purchase ? `地價 ${money(location.price)}，租金 ${money(location.rent)}。` : '';
        const die = state.die === null ? '' : `骰點 ${state.die}。`;
        announcement.textContent = `${playerName(current)}。${title}。${die}${description}${detail}${bonus}現金 ${money(current.cash)}。`;
      }
    },
    setActionsLocked(value) {
      locked = value;
      const actionGroup = contents.querySelector('.paper-actions');
      if (actionGroup) actionGroup.inert = value;
    },
    async revealRoll({ die }, { reducedMotion }) {
      ceremonyDie.innerHTML = diceCube(die);
      ceremony.dataset.stage = reducedMotion ? 'result' : 'rolling';
      ceremonyValue.textContent = '';
      ceremony.hidden = false;
      container.dispatchEvent(new CustomEvent('harbor-dice-reveal', { bubbles: true, detail: { reducedMotion } }));
      if (!reducedMotion) {
        const animations = ceremony.getAnimations({ subtree: true });
        await Promise.allSettled(animations.map((animation) => animation.finished));
      }
      if (events.signal.aborted || !container.isConnected) return;
      ceremony.dataset.stage = 'result';
      const result = `骰點 ${die}`;
      ceremonyValue.textContent = result;
      announcement.textContent = result;
      await new Promise((resolve) => {
        const timer = setTimeout(() => finishHold(), reducedMotion ? 330 : 460);
        finishHold = () => {
          clearTimeout(timer);
          finishHold = undefined;
          ceremony.hidden = true;
          delete ceremony.dataset.stage;
          ceremonyDie.replaceChildren();
          resolve();
        };
      });
    },
    focusAction({ scrollIntoView }) {
      const action = contents.querySelector('button:not(:disabled)');
      action?.focus({ preventScroll: true });
      if (scrollIntoView) action?.scrollIntoView({ block: 'nearest' });
    },
    destroy() {
      events.abort();
      ceremony.hidden = true;
      finishHold?.();
    },
  };
}
