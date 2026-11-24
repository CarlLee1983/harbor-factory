import './style.css';
import './theme.css';
import './dice-sound.js';
import { mountBoard } from './board.js';
import { mountBoardViewport } from './board-viewport.js';
import { getCharacter } from './characters.js';
import { buyProperty, createGame, endTurn, finishGame, rollDice, skipPurchase } from './game.js';
import { HARBOR, getLocation } from './map.js';
import { portrait } from './portraits.js';
import { createSaveSlot } from './save.js';
import { mountSelection } from './selection.js';
import { renderStandings } from './standings.js';
import { mountTurnPanel } from './turn-panel.js';

const app = document.querySelector('#app');
const saveSlot = createSaveSlot(() => window.localStorage);
let localGame = null;

const saveErrors = {
  unreadable: '瀏覽器無法讀取存檔。',
  invalid: '存檔內容有誤，無法繼續遊戲。',
  unsupported: '此存檔格式與目前的遊戲版本不相容。',
  'missing-map': '目前無法載入存檔所需的地圖版本。',
};

function getResumeAction(state) {
  if (state.phase === 'roll') return '擲骰';
  if (state.phase === 'purchase') return '處理買地';
  return state.players.length === 1 ? '查看回合結果並進入下一輪' : '查看回合結果並交棒';
}

function showHome({ focus = false } = {}) {
  const saved = localGame ? { status: 'ready', ...localGame } : saveSlot.read();
  app.innerHTML = `
    <section class="home-cover" aria-labelledby="home-title">
      <div class="home-panel" aria-label="遊戲選單" role="group">
        <h1 id="home-title">港灣街區</h1>
        <p class="home-description">地產桌遊</p>
        <p class="resume-summary" data-summary hidden></p>
        <button type="button" class="primary" data-resume hidden>繼續遊戲 <span aria-hidden="true">→</span></button>
        <button type="button" class="primary" data-retry hidden>重試讀取</button>
        <button type="button" class="primary" data-new>開始新局 <span aria-hidden="true">→</span></button>
      </div>
    </section>`;

  const summary = app.querySelector('[data-summary]');
  const resume = app.querySelector('[data-resume]');
  const retry = app.querySelector('[data-retry]');
  if (saved.status === 'ready') {
    const { state, map } = saved;
    const current = state.players[state.activePlayerIndex];
    if (state.phase === 'finished') {
      summary.textContent = `${map.name} · 第 ${state.round} 輪結算`;
      resume.textContent = '查看結算';
    } else {
      summary.textContent = `${map.name} · 第 ${state.round} 輪 · ${current.name}（${getCharacter(current.characterId).name}） · ${getResumeAction(state)}`;
    }
    if (localGame) summary.textContent += ' · 此頁面尚未儲存';
    summary.hidden = false;
    resume.hidden = false;
    resume.addEventListener('click', () => {
      if (localGame) {
        const { state, map, save, sessionOnly } = localGame;
        showGame(state, map, save, sessionOnly);
        return;
      }
      const latest = saveSlot.read();
      if (latest.status === 'ready') showSavedGame(latest);
      else showHome({ focus: true });
    });
  } else if (saved.status !== 'empty') {
    summary.textContent = saveErrors[saved.status];
    summary.setAttribute('role', 'alert');
    summary.hidden = false;
    retry.hidden = false;
    retry.addEventListener('click', () => showHome({ focus: true }));
  }

  const newGame = app.querySelector('[data-new]');
  newGame.addEventListener('click', showSelection);
  if (focus) app.querySelector('button:not([hidden])').focus();
}

function confirmAction(title, detail, action, onConfirm) {
  app.insertAdjacentHTML('beforeend', `
    <dialog class="replace-dialog lineup-panel" aria-labelledby="confirmation-title" aria-describedby="confirmation-detail">
      <h2 id="confirmation-title">${title}</h2>
      <p id="confirmation-detail">${detail}</p>
      <form method="dialog">
        <button class="primary" value="cancel" autofocus>取消</button>
        <button class="text-button" value="confirm">${action}</button>
      </form>
    </dialog>`);
  const dialog = app.querySelector('.replace-dialog');
  dialog.addEventListener('close', () => {
    const confirmed = dialog.returnValue === 'confirm';
    dialog.remove();
    if (confirmed) onConfirm();
  }, { once: true });
  dialog.showModal();
}

function showSelection() {
  let starting = false;
  const dispose = mountSelection(app, {
    onStart(lineup) {
      if (starting) return;
      const previous = saveSlot.read();

      async function start() {
        starting = true;
        app.querySelector('.selection-layout').inert = true;
        const state = createGame(lineup, HARBOR);
        const save = await saveSlot.write(state, previous.snapshot);
        save.canReconfirm = previous.status === 'unreadable';
        dispose();
        showGame(state, HARBOR, save);
      }

      if (!localGame && previous.status === 'empty') {
        start();
        return;
      }

      const localProgress = localGame ? '開始新局會取代此頁面的未儲存進度。' : '';
      confirmAction('取代舊局？', `${localProgress}新局儲存成功後，將取代這個瀏覽器原有的進度。`, '取代並開始', start);
    },
    onExit() {
      if (starting) return;
      dispose();
      showHome({ focus: true });
    },
  });
  app.querySelector('#player-count')?.focus({ preventScroll: true });
}

function showSavedGame({ state, map, snapshot }) {
  showGame(state, map, { status: 'saved', snapshot });
}

function showGame(initialState, map, initialSave, initialSessionOnly = false) {
  let state = initialState;
  let moving = false;
  let saving = false;
  let save = initialSave;
  let sessionOnly = initialSessionOnly;
  let handoffRollButton;

  app.innerHTML = `
    <header class="page-intro game-intro">
      <div><span class="eyebrow" hidden></span><h1 tabindex="-1">${map.name}</h1></div>
      <strong class="round" id="round"></strong>
    </header>
    <section class="save-notice" aria-label="存檔狀態" hidden>
      <p role="status" data-save-message></p>
      <div class="save-actions">
        <button type="button" class="primary" data-retry-save>重試儲存</button>
        <button type="button" class="primary" data-reconfirm-save>確認取代舊局</button>
        <button type="button" class="primary" data-load-latest>載入最新存檔</button>
        <button type="button" class="primary" data-session>僅本次繼續</button>
      </div>
    </section>
    <p class="sr-only" role="status" data-save-feedback></p>
    <div data-game-view>
      <div class="game-layout">
        <section class="board-panel" id="board-play" aria-label="環線棋盤" tabindex="-1">
          <div class="board-toolbar">
            <a class="table-details-link" href="#board-details">地契與玩家 ↓</a>
            <div class="board-zoom" role="group" aria-labelledby="board-zoom-label">
              <span id="board-zoom-label">棋盤縮放</span>
              <button type="button" data-zoom-out aria-label="縮小棋盤" aria-controls="board-viewport" aria-disabled="true">−</button>
              <output>100%</output>
              <button type="button" data-zoom-in aria-label="放大棋盤" aria-controls="board-viewport" aria-disabled="false">+</button>
              <button type="button" data-zoom-fit aria-controls="board-viewport" aria-disabled="true">適合畫面</button>
            </div>
          </div>
          <div class="board-viewport" id="board-viewport" role="group" aria-label="棋盤視窗" tabindex="-1">
            <div class="board-canvas" id="board-canvas"></div>
          </div>
        </section>
        <aside class="turn-panel" id="turn-panel" aria-labelledby="turn-player-title"></aside>
        <section class="table-details" id="board-details" aria-labelledby="board-details-title" tabindex="-1">
          <div class="table-details-heading">
            <h2 id="board-details-title">地契與玩家</h2>
            <a href="#board-play">回到棋盤 ↑</a>
          </div>
          <div class="board-inspector">
            <ul class="board-key" role="list" aria-label="棋盤圖例">
              <li><i class="key-start" aria-hidden="true"></i>起點</li>
              <li><i class="key-property" aria-hidden="true"></i>地產</li>
              <li><i class="key-event" aria-hidden="true"></i>事件</li>
            </ul>
          </div>
          <ol id="players" class="players" role="list" aria-label="玩家與目前位置"></ol>
        </section>
      </div>
    </div>`;

  const gameView = app.querySelector('[data-game-view]');
  const title = app.querySelector('h1');
  const round = app.querySelector('#round');
  const notice = app.querySelector('.save-notice');
  const message = app.querySelector('[data-save-message]');
  const retry = app.querySelector('[data-retry-save]');
  const reconfirm = app.querySelector('[data-reconfirm-save]');
  const loadLatest = app.querySelector('[data-load-latest]');
  const session = app.querySelector('[data-session]');
  const feedback = app.querySelector('[data-save-feedback]');
  const finished = state.phase === 'finished';
  const boardPanel = gameView.querySelector('.board-panel');
  const boardViewport = boardPanel.querySelector('#board-viewport');
  const boardDetails = gameView.querySelector('#board-details');
  const toolbar = boardPanel.querySelector('.board-toolbar');
  const detailsLink = toolbar.querySelector('.table-details-link');
  const board = finished ? null : mountBoard(gameView.querySelector('#board-canvas'), map, {
    deedContainer: boardDetails.querySelector('.board-inspector'),
    onDeedSelection(location) {
      detailsLink.textContent = location ? `${location.name}詳情 ↓` : '地契與玩家 ↓';
    },
    beforeFallback(pawn) {
      if (!handoffRollButton?.isConnected) return;
      return viewport.preservePawnVisibility(pawn, board.activePawnBounds, handoffRollButton);
    },
  });
  const viewport = finished ? null : mountBoardViewport(boardPanel, boardViewport);
  const toolbarPlacement = new AbortController();
  if (!finished) {
    toolbar.prepend(round);
    const landscape = matchMedia('(min-width: 980px) and (orientation: landscape)');
    const mastheadControls = document.querySelector('.masthead .table-controls');
    function placeToolbar() {
      const active = document.activeElement;
      if (landscape.matches) mastheadControls.before(toolbar);
      else boardPanel.prepend(toolbar);
      if (toolbar.contains(active)) active.focus({ preventScroll: true });
    }
    landscape.addEventListener('change', placeToolbar, { signal: toolbarPlacement.signal });
    placeToolbar();
  }
  const players = gameView.querySelector('#players');
  const turnPanel = gameView.querySelector('#turn-panel');
  const turn = finished ? null : mountTurnPanel(turnPanel, map, {
    roll: () => transition((game) => rollDice(game, Math.floor(Math.random() * 6) + 1, map), true),
    buy: () => transition((game) => buyProperty(game, map)),
    skip: () => transition(skipPurchase),
    end: () => transition(endTurn),
    finish: confirmFinish,
  });

  function confirmFinish() {
    if (moving || saving || needsSaveDecision() || state.phase !== 'result') return;
    confirmAction('結束對局？', '將依目前的現金與地產結算排名。', '確認結算',
      () => transition((game) => finishGame(game, map)));
  }

  function needsSaveDecision() {
    return save.status !== 'saved' && !sessionOnly;
  }

  function drawSaveStatus() {
    const conflict = save.status === 'conflict';
    const canReconfirm = conflict && save.canReconfirm;
    const saved = save.status === 'saved';
    notice.hidden = saved;
    if (!saved) {
      message.textContent = conflict
        ? `${canReconfirm ? '目前可讀取瀏覽器存檔，可確認取代舊局。' : '存檔已在其他分頁變更。'}也可載入最新存檔，或僅在此頁面繼續。關閉頁面後將失去此頁面的進度。`
        : '目前進度尚未儲存。關閉頁面後，可能回到上次儲存的進度，或需要重新開局。';
    }
    retry.hidden = conflict;
    reconfirm.hidden = !canReconfirm;
    loadLatest.hidden = !conflict;
    session.hidden = sessionOnly;
    const busy = moving || saving;
    retry.disabled = busy;
    reconfirm.disabled = busy;
    loadLatest.disabled = busy;
    session.disabled = busy;
    const locked = busy || needsSaveDecision();
    if (state.phase === 'finished') gameView.querySelector('.standings-actions').inert = locked;
    else turn.setActionsLocked(locked);
    localGame = saved ? null : { state, map, save, sessionOnly };
  }

  function focusSaveAction() {
    const action = save.status === 'conflict' ? (save.canReconfirm ? reconfirm : loadLatest) : retry;
    action.focus();
  }

  function focusAction({ scrollIntoView = false } = {}) {
    if (state.phase === 'finished') title.focus();
    else turn.focusAction({ scrollIntoView });
  }

  async function persist(expected) {
    if (saving) return;
    saving = true;
    feedback.textContent = '';
    drawSaveStatus();
    const result = await saveSlot.write(state, expected);
    save = { ...result, canReconfirm: save.canReconfirm };
    saving = false;
    if (save.status !== 'blocked') sessionOnly = false;
    drawSaveStatus();
    if (save.status === 'saved') {
      feedback.textContent = '已儲存目前進度。';
      if (!moving) focusAction({ scrollIntoView: state.phase !== 'roll' });
    } else if (save.status === 'conflict') {
      focusSaveAction();
    } else {
      feedback.textContent = '仍無法儲存目前進度。';
      retry.focus({ preventScroll: true });
    }
  }

  retry.addEventListener('click', () => {
    if (save.status === 'blocked') persist(save.snapshot);
  });
  reconfirm.addEventListener('click', () => {
    if (save.status !== 'conflict' || !save.canReconfirm || saving) return;
    const previous = saveSlot.read();
    if (previous.status === 'unreadable') {
      message.textContent = saveErrors.unreadable;
      return;
    }
    confirmAction('取代舊局？', '儲存此頁面的進度後，將取代這個瀏覽器目前的存檔。', '取代並儲存',
      () => persist(previous.snapshot));
  });
  loadLatest.addEventListener('click', () => {
    const latest = saveSlot.read();
    if (latest.status !== 'ready') {
      message.textContent = saveErrors[latest.status] ?? '目前沒有可載入的存檔。';
      return;
    }
    disposePlayArea();
    showSavedGame(latest);
  });
  session.addEventListener('click', () => {
    sessionOnly = true;
    drawSaveStatus();
    if (!moving) focusAction({ scrollIntoView: state.phase !== 'roll' });
  });

  function disposePlayArea() {
    toolbarPlacement.abort();
    toolbar.remove();
    turn?.destroy();
    board?.destroy();
    viewport?.destroy();
  }

  function finish() {
    disposePlayArea();
    round.textContent = `第 ${state.round} 輪結算`;
    const intro = app.querySelector('.game-intro');
    intro.append(round);
    const mapLabel = intro.querySelector('.eyebrow');
    mapLabel.textContent = map.name;
    mapLabel.hidden = false;
    title.textContent = '最終排名';
    gameView.innerHTML = renderStandings(state);
    gameView.querySelector('[data-standings-new]').addEventListener('click', showSelection);
    gameView.querySelector('[data-standings-home]').addEventListener('click', () => showHome({ focus: true }));
    drawSaveStatus();
    if (needsSaveDecision()) focusSaveAction();
    else focusAction();
  }

  function draw() {
    round.textContent = `第 ${state.round} 輪`;
    turn.render(state);
    players.innerHTML = state.players.map((player, index) => {
      const character = getCharacter(player.characterId);
      const location = getLocation(map, player.locationId);
      return `<li class="player-card" style="--character:${character.color}" ${index === state.activePlayerIndex ? 'aria-current="true"' : ''}>
        <span class="player-avatar">${portrait(character.id)}</span>
        <span class="player-identity"><small>${player.name}${index === state.activePlayerIndex ? ' · 行動中' : ''}</small><strong>${character.name}</strong><small>${location.name}</small></span>
        <strong class="cash">${player.cash.toLocaleString('zh-TW')} 元</strong>
      </li>`;
    }).join('');
  }

  async function transition(apply, roll = false) {
    if (moving || saving || needsSaveDecision()) return;
    const next = apply(state);
    if (next === state) return;
    // Commit the whole landing before showing the roll or moving the pawn.
    moving = roll;
    if (save.status === 'saved') {
      saving = true;
      drawSaveStatus();
      save = await saveSlot.write(next, save.snapshot);
      saving = false;
      feedback.textContent = '';
    }
    if (!gameView.isConnected) return;
    state = next;
    if (state.phase === 'finished') {
      finish();
      return;
    }
    if (roll) {
      drawSaveStatus();
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const canReveal = !needsSaveDecision();
      if (canReveal) {
        boardPanel.inert = true;
        boardDetails.inert = true;
        toolbar.inert = true;
        try {
          await turn.revealRoll(state, { reducedMotion });
        } finally {
          boardPanel.inert = false;
          boardDetails.inert = false;
          toolbar.inert = false;
        }
      }
      if (!gameView.isConnected) return;
      const animate = canReveal && !reducedMotion && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (animate) turn.render(state, { moving: true });
      await board.render(state, {
        animate,
        followPawn: () => viewport.revealPawn(board.activePawnBounds, { scrollPage: true }),
      });
      if (!gameView.isConnected) return;
      moving = false;
    }
    draw();
    drawSaveStatus();
    if (!roll) await board.render(state);
    if (!gameView.isConnected) return;
    if (needsSaveDecision()) focusSaveAction();
    else if (!saving && !notice.contains(document.activeElement)) {
      focusAction({ scrollIntoView: roll });
      if (apply === endTurn) {
        const { top } = boardPanel.getBoundingClientRect();
        if (turnPanel.getBoundingClientRect().top > top && (top < 0 || top >= innerHeight)) {
          boardPanel.scrollIntoView({ block: 'start', behavior: 'instant' });
        }
        if (state.players.length > 1) {
          handoffRollButton = turnPanel.querySelector('.roll-trigger');
          viewport.revealPawn(board.activePawnBounds, { rollButton: handoffRollButton });
        }
      }
    }
  }

  if (state.phase === 'finished') {
    finish();
    return;
  }
  draw();
  drawSaveStatus();
  board.render(state);
  if (needsSaveDecision()) focusSaveAction();
  else focusAction({ scrollIntoView: state.phase !== 'roll' });
}

showHome();
