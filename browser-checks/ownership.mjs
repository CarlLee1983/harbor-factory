import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createGame } from '../src/game.js';

const { chromium } = createRequire(import.meta.url)('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const base = process.env.BOARD_URL || 'http://localhost:4173';
const key = 'harbor-board-game';
const lineup = ['captain', 'florist', 'courier', 'auntie'];
// These properties represent each of the four sides of the board.
const properties = ['salt', 'tea', 'bridge', 'sunset'];

async function seed(page, property, count, activePlayerIndex) {
  const state = createGame(lineup);
  state.owners[property] = 1;
  state.activePlayerIndex = activePlayerIndex;
  for (const player of state.players.slice(0, count)) player.locationId = property;
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify({ version: 1, state })), { key, state });
  await page.reload();
  await page.getByRole('button', { name: '繼續遊戲', exact: true }).click();
  const canvas = page.locator('canvas[data-renderer="webgl"]');
  await canvas.waitFor();
  assert.equal(await canvas.evaluate((element) => {
    const gl = element.getContext('webgl2');
    return gl instanceof WebGL2RenderingContext && !gl.isContextLost();
  }), true, 'The board has a live WebGL 2 context');
}

async function verifyOwner(page, property, count, activePlayerIndex) {
  const label = page.locator(`.board-tile-label[data-location="${property}"]`);
  const owner = label.locator('.board-owner');
  await owner.waitFor();
  assert.equal((await owner.textContent()).trim(), '1');
  const clear = await owner.evaluate((marker, count) => {
    const bounds = marker.getBoundingClientRect();
    const seats = Array.from({ length: count }, (_, index) =>
      document.querySelector(`.board-seat[data-seat="${index + 1}"]`));
    return seats.every((seat) => {
      const pawn = seat.getBoundingClientRect();
      return bounds.right <= pawn.left || pawn.right <= bounds.left ||
        bounds.bottom <= pawn.top || pawn.bottom <= bounds.top;
    });
  }, count);
  assert.ok(clear, `${property}: owner numeral remains clear of ${count} seat numerals (active seat ${activePlayerIndex + 1})`);
}

try {
  for (const device of [
    { viewport: { width: 1360, height: 900 } },
    { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true },
  ]) {
    const page = await browser.newPage({ ...device, locale: 'zh-TW', reducedMotion: 'reduce' });
    page.setDefaultTimeout(15000);
    await page.goto(base);
    for (const property of properties) {
      for (const count of [0, 3, 1, 2, 4]) {
        for (let active = 0; active < Math.max(count, 1); active += 1) {
          await seed(page, property, count, active);
          await verifyOwner(page, property, count, active);
        }
      }
    }
    console.log(`${device.hasTouch ? 'Landscape touch' : 'Desktop'} preserves owner digits with one to four pawns on all four board edges`);
    await page.close();
  }
} finally {
  await browser.close();
}
