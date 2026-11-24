import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createGame, rollDice } from '../src/game.js';

const { chromium } = createRequire(import.meta.url)('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--disable-webgl'],
});
const base = process.env.BOARD_URL || 'http://localhost:4173';
const lineup = ['captain', 'florist', 'courier', 'auntie'];
const key = 'harbor-board-game';
const button = (page, name) => page.getByRole('button', { name, exact: true });

async function open(context, url = base) {
  const page = await context.newPage();
  page.setDefaultTimeout(3500);
  await page.goto(url);
  return page;
}

async function seed(page, state) {
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify({ version: 1, state })),
    { key, state });
  await page.reload();
}

async function snapshot(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)).state, key);
}

async function roll(page, die) {
  await page.evaluate((die) => document.addEventListener('click', () => {
    const random = Math.random;
    Math.random = () => {
      Math.random = random;
      return (die - 0.5) / 6;
    };
  }, { capture: true, once: true }), die);
  await button(page, '擲骰').click();
}

async function denyWrites(page) {
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    window.restoreWrites = () => { Storage.prototype.setItem = write; };
  });
}

async function selectLineup(page) {
  await button(page, '開始新局').click();
  for (const character of lineup) {
    await page.locator(`[data-character="${character}"]`).click();
    await button(page, '確認角色').click();
  }
}

const context = await browser.newContext({ locale: 'zh-TW', reducedMotion: 'reduce' });
context.setDefaultTimeout(3500);
try {
  const active = await open(context);
  await seed(active, createGame(lineup));
  const home = await open(context);
  const stale = await open(context);
  const offline = await open(context);
  const replacing = await open(context);
  for (const page of [active, stale, offline]) await button(page, '繼續遊戲').click();
  await selectLineup(replacing);
  await button(replacing, '開始新局').click();
  await replacing.getByRole('dialog').waitFor();

  await denyWrites(offline);
  await roll(offline, 1);
  await button(offline, '重試儲存').waitFor();
  assert.equal((await snapshot(active)).phase, 'roll');

  await active.emulateMedia({ reducedMotion: 'no-preference' });
  await roll(active, 2);
  await active.getByRole('heading', { name: '棋子前進中' }).waitFor();
  assert.equal((await snapshot(active)).phase, 'purchase');
  await active.reload();
  await button(active, '繼續遊戲').click();
  await button(active, '買下').click();
  await button(active, '交給下一位').click();
  await active.getByRole('heading', { name: '小棠' }).waitFor();
  const handedOff = await snapshot(active);
  assert.equal(handedOff.activePlayerIndex, 1);
  assert.deepEqual(handedOff.owners, { salt: 1 });

  await button(home, '繼續遊戲').click();
  await home.getByRole('heading', { name: '小棠' }).waitFor();
  await roll(stale, 1);
  await button(stale, '載入最新存檔').waitFor();
  await button(stale, '僅本次繼續').click();
  await button(stale, '略過').click();
  await button(stale, '交給下一位').click();
  assert.deepEqual(await snapshot(stale), handedOff);

  await offline.evaluate(() => window.restoreWrites());
  await button(offline, '重試儲存').click();
  await button(offline, '載入最新存檔').click();
  await offline.getByRole('heading', { name: '小棠' }).waitFor();
  assert.deepEqual(await snapshot(offline), handedOff);
  await button(replacing, '取代並開始').click();
  await button(replacing, '載入最新存檔').waitFor();
  assert.deepEqual(await snapshot(replacing), handedOff);
  console.log('Roll is saved before animation. Stale home, live play, failed-write retry and replacement all preserve the purchase and handoff.');

  await seed(active, createGame(lineup));
  await button(active, '繼續遊戲').click();
  await roll(active, 3);
  await active.locator('.roll-ceremony[data-stage="result"]').waitFor();
  const revealed = await snapshot(active);
  assert.equal(revealed.phase, 'purchase');
  assert.equal(revealed.die, 3);
  assert.deepEqual(revealed.lastMove, ['lighthouse', 'salt', 'flower']);
  await active.reload();
  await active.evaluate(() => {
    window.replayedRoll = false;
    new MutationObserver(() => {
      const ceremony = document.querySelector('.roll-ceremony:not([hidden])');
      const moving = document.querySelector('#turn-panel h3')?.textContent === '棋子前進中';
      if (ceremony || moving) window.replayedRoll = true;
    }).observe(document.querySelector('#app'), { childList: true, subtree: true, attributes: true });
  });
  await button(active, '繼續遊戲').click();
  await button(active, '買下').waitFor();
  await active.getByText('骰點 3', { exact: true }).waitFor();
  assert.equal(await active.evaluate(() => window.replayedRoll), false);
  assert.deepEqual(await snapshot(active), revealed);
  console.log('Reloading during the centered reveal restores the saved landing without replaying the toss or pawn movement.');

  const purchase = rollDice(createGame(lineup), 2);
  await seed(active, purchase);
  await home.reload();
  for (const page of [active, home]) await button(page, '繼續遊戲').click();
  await offline.evaluate((key) => {
    window.lockReady = new Promise((ready) => {
      navigator.locks.request(key, () => new Promise((release) => {
        window.releaseSaveLock = release;
        ready();
      }));
    });
    return window.lockReady;
  }, key);
  await button(active, '買下').click();
  await button(home, '略過').click();
  await offline.waitForFunction(async (key) => (await navigator.locks.query()).pending
    .filter(({ name }) => name === key).length === 2, key);
  await offline.evaluate(() => window.releaseSaveLock());
  await button(active, '交給下一位').waitFor();
  await button(home, '載入最新存檔').waitFor();
  assert.deepEqual((await snapshot(home)).owners, { salt: 1 });
  console.log('Two writes queued on the same browser lock. The first committed and the second raised a conflict.');

  const lastTurn = createGame(lineup);
  lastTurn.round = 12;
  lastTurn.activePlayerIndex = 3;
  lastTurn.owners = { lighthouse: 1 };
  lastTurn.players[0].cash = 530;
  lastTurn.players[3].cash = 690;
  await seed(active, lastTurn);
  await button(active, '繼續遊戲').click();
  await active.emulateMedia({ reducedMotion: 'reduce' });
  await denyWrites(active);
  await roll(active, 1);
  await button(active, '僅本次繼續').click();
  await button(active, '結束對局').click();
  await button(active.getByRole('dialog', { name: '結束對局？' }), '確認結算').click();
  await active.getByText('第 12 輪結算', { exact: true }).waitFor();
  assert.equal(await active.getByText('並列第 1 名').count(), 2);

  await button(active, '返回首頁').click();
  await button(active, '查看結算').click();
  await selectLineup(active);
  await button(active, '開始新局').click();
  await button(active, '取消').click();
  await button(active, '返回首頁').click();
  await button(active, '查看結算').click();
  assert.equal(await active.getByText('並列第 1 名').count(), 2);
  assert.deepEqual(await snapshot(active), lastTurn);
  await active.evaluate(() => window.restoreWrites());
  await button(active, '重試儲存').click();
  await active.getByText('已儲存目前進度。').waitFor();
  await active.reload();
  await button(active, '查看結算').click();
  assert.equal(await active.getByText('並列第 1 名').count(), 2);
  assert.deepEqual((await snapshot(active)).standings.map(({ total }) => total), [660, 660, 600, 600]);
  console.log('Session-only standings survive home and cancelled replacement, and retry persists the same 660/660 tie.');

  await seed(active, lastTurn);
  await active.addInitScript(() => {
    const accessible = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Access denied', 'SecurityError'); },
    });
    window.restoreAccess = () => Object.defineProperty(window, 'localStorage', accessible);
  });
  await active.reload();
  await button(active, '重試讀取').waitFor();
  await selectLineup(active);
  await button(active, '開始新局').click();
  await button(active, '取代並開始').click();
  await button(active, '僅本次繼續').click();
  await roll(active, 2);
  await button(active, '買下').click();
  await button(active, '交給下一位').click();
  await active.evaluate(() => window.restoreAccess());
  await button(active, '重試儲存').click();
  await button(active, '確認取代舊局').click();
  await button(active, '取消').click();
  assert.deepEqual(await snapshot(active), lastTurn);

  await button(active, '確認取代舊局').click();
  await home.reload();
  await button(home, '繼續遊戲').click();
  await roll(home, 1);
  await button(home, '結束對局').waitFor();
  const newer = await snapshot(home);
  await button(active, '取代並儲存').click();
  await button(active, '確認取代舊局').waitFor();
  assert.deepEqual(await snapshot(active), newer);

  await button(active, '確認取代舊局').click();
  await button(active, '取代並儲存').click();
  await active.getByText('已儲存目前進度。').waitFor();
  await active.getByRole('heading', { name: '小棠' }).waitFor();
  assert.deepEqual((await snapshot(active)).owners, { salt: 1 });
  assert.equal((await snapshot(active)).activePlayerIndex, 1);
  console.log('After storage access recovers, reconfirmation preserves local progress and checks for newer writes.');

  if (process.env.LAN_URL) {
    const a = await open(context, process.env.LAN_URL);
    const b = await open(context, process.env.LAN_URL);
    assert.equal(await a.evaluate(() => isSecureContext || Boolean(navigator.locks)), false);
    await seed(a, purchase);
    await b.reload();
    for (const page of [a, b]) await button(page, '繼續遊戲').click();
    await Promise.all([button(a, '買下').click(), button(b, '略過').click()]);
    await Promise.race([button(a, '載入最新存檔').waitFor(), button(b, '載入最新存檔').waitFor()]);
    const conflicted = await button(a, '載入最新存檔').isVisible() ? a : b;
    const winner = conflicted === a ? b : a;
    await button(winner, '交給下一位').click();
    await winner.getByRole('heading', { name: '小棠' }).waitFor();
    const saved = await snapshot(winner);
    assert.equal(saved.activePlayerIndex, 1);
    assert.deepEqual(saved.owners, winner === a ? { salt: 1 } : {});
    await winner.reload();
    await button(winner, '繼續遊戲').click();
    await winner.getByRole('heading', { name: '小棠' }).waitFor();
    console.log('LAN HTTP without Web Locks saves and reopens, with one winner when two tabs compete.');
  }
} finally {
  await browser.close();
}
