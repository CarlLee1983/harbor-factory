import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { HARBOR } from '../src/map.js';

const { chromium } = createRequire(import.meta.url)('playwright-core');
const base = process.env.FACTORY_URL || 'http://localhost:4192/factory/';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const button = (scope, name) => scope.getByRole('button', { name, exact: true });

async function firstScreen(locator, { centered = false } = {}) {
  await locator.waitFor();
  const bounds = await locator.evaluate((element) => {
    const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
    return { left, top, right, bottom, width, height, vw: innerWidth, vh: innerHeight };
  });
  const { left, top, right, bottom, width, height, vw, vh } = bounds;
  assert.ok(width > 0 && height > 0 && left >= 0 && top >= 0 && right <= vw && bottom <= vh,
    `${locator} fits in the first ${vw}×${vh} screen (${JSON.stringify(bounds)})`);
  if (centered) {
    assert.ok(Math.abs((left + right) / 2 - vw / 2) <= vw * .08, 'Roll is horizontally centered');
    assert.ok(Math.abs((top + bottom) / 2 - vh / 2) <= vh * .08, 'Roll is vertically centered');
  }
}

function pawnInView(pawn) {
  return pawn.evaluate(element => {
    const view = element.closest('#board-viewport').getBoundingClientRect();
    const pawn = element.getBoundingClientRect();
    const roll = document.querySelector('.roll-trigger')?.getBoundingClientRect();
    return pawn.left >= Math.max(view.left, 0) && pawn.top >= Math.max(view.top, 0)
      && pawn.right <= Math.min(view.right, innerWidth) && pawn.bottom <= Math.min(view.bottom, innerHeight)
      && (!roll || pawn.right <= roll.left || pawn.left >= roll.right || pawn.bottom <= roll.top || pawn.top >= roll.bottom);
  });
}

async function touchBounds(control, minimum) {
  const bounds = await control.boundingBox();
  assert.ok(bounds && bounds.width >= minimum && bounds.height >= minimum,
    `${control} has a touch target of at least ${minimum} CSS pixels`);
  return bounds;
}

async function roll(button, act, die) {
  await button.evaluate((element, die) => element.addEventListener('click', () => {
    const random = Math.random;
    Math.random = () => {
      Math.random = random;
      return (die - .5) / 6;
    };
  }, { capture: true, once: true }), die);
  await act(button);
}

const devices = [
  { viewport: { width: 1360, height: 900 } },
  { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true },
  { viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true },
];

try {
  for (const device of devices) {
    const page = await browser.newPage({ ...device, locale: 'zh-TW', reducedMotion: 'reduce' });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const act = (control) => device.hasTouch ? control.tap() : control.click();
    const turn = page.locator('#turn-panel');
    const viewport = page.getByRole('group', { name: '棋盤視窗' });
    const zoom = page.getByRole('group', { name: '棋盤縮放' });
    const rollButton = button(turn, '擲骰');
    const tiles = viewport.locator('.factory-tile');
    const salt = tiles.and(page.getByRole('button', { name: /^鹽埕街，/ }));
    const deed = page.locator('.board-deed').getByRole('status');
    const verifyZoom = async (percent) => {
      assert.equal(await zoom.locator('output').textContent(), `${percent}%`);
      const { boardWidth, viewWidth } = await viewport.evaluate(element => ({
        boardWidth: element.querySelector('.factory-floor').getBoundingClientRect().width,
        viewWidth: element.clientWidth,
      }));
      assert.ok(Math.abs(boardWidth - percent / 100 * viewWidth) <= 2, 'The rendered board scales with zoom');
    };
    await page.goto(base);

    await act(button(page, '開始新局'));
    await page.getByRole('combobox', { name: '遊玩人數' }).selectOption('2');
    for (const character of ['captain', 'florist']) {
      await act(page.locator(`[data-character="${character}"]`));
      const image = page.locator('.character-preview-image');
      await image.waitFor();
      assert.equal(await image.getAttribute('data-view'), 'front');
      const front = await image.getAttribute('src');
      await act(button(page, '向右轉'));
      assert.equal(await image.getAttribute('data-view'), 'right');
      assert.notEqual(await image.getAttribute('src'), front);
      await image.evaluate(element => element.decode());
      await act(button(page, '確認角色'));
    }
    await act(button(page, '開始新局'));
    await firstScreen(turn.getByRole('heading', { name: '阿海船長', exact: true }));
    await firstScreen(turn.getByText('600 元', { exact: true }));
    await firstScreen(rollButton, { centered: true });
    await touchBounds(rollButton, 56);
    await firstScreen(button(zoom, '放大棋盤'));
    await salt.waitFor();
    const locations = await tiles.evaluateAll(elements => elements.map(element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { id: element.dataset.location, point: `${x},${y}`, width, height };
    }));
    assert.equal(locations.length, 40);
    assert.deepEqual(locations.map(({ id }) => id).sort(), HARBOR.locations.map(({ id }) => id).sort());
    assert.equal(new Set(locations.map(({ point }) => point)).size, 40);
    assert.ok(locations.every(({ width, height }) => width > 0 && height > 0));

    await act(salt);
    assert.equal(await salt.getAttribute('aria-pressed'), 'true');
    await deed.getByText('鹽埕街', { exact: true }).waitFor();
    await deed.getByText('無主地', { exact: true }).waitFor();
    for (const percent of [150, 200]) {
      await act(button(zoom, '放大棋盤'));
      await verifyZoom(percent);
    }
    const firstPawn = viewport.locator('.factory-pawn[data-seat="1"]');
    await viewport.evaluate(element => element.scrollTo({ left: element.scrollWidth, top: 0, behavior: 'instant' }));
    assert.equal(await pawnInView(firstPawn), false, 'Before rolling, the player can inspect another section freely');
    await roll(rollButton, act, 2);
    const buy = turn.getByRole('button', { name: /買下.*200|200.*買下/ });
    await firstScreen(buy);
    assert.equal(await pawnInView(firstPawn), true, 'A zoomed roll reveals the landing before the purchase decision');
    assert.match(await turn.locator('[data-after-buy]').innerText(), /400/);
    assert.equal(await turn.locator('.paper-die-value').textContent(), '骰點 2');
    await firstScreen(button(turn, '略過'));
    const buyBounds = await touchBounds(buy, 56);
    const skipBounds = await touchBounds(button(turn, '略過'), 48);
    const gap = Math.max(skipBounds.x - buyBounds.x - buyBounds.width, buyBounds.x - skipBounds.x - skipBounds.width,
      skipBounds.y - buyBounds.y - buyBounds.height, buyBounds.y - skipBounds.y - skipBounds.height);
    assert.ok(gap >= 8, 'Buy and skip have distinct touch targets separated by 8 CSS pixels');
    if (device.hasTouch) {
      await act(buy);
    } else {
      await buy.focus();
      await page.keyboard.down('Enter');
    }
    await deed.getByText('玩家 1・阿海船長', { exact: true }).waitFor();
    assert.equal(await salt.locator('.factory-owner').textContent(), '1');
    const handoff = turn.getByRole('button', { name: /交給.*小棠/ });
    await firstScreen(handoff);
    await firstScreen(button(turn, '結束對局'));
    if (!device.hasTouch) {
      await page.keyboard.down('Enter');
      await page.keyboard.up('Enter');
      assert.equal(await handoff.isVisible(), true, 'Holding Enter on Buy leaves the receipt available');
    }
    await touchBounds(handoff, 56);
    await touchBounds(button(turn, '結束對局'), 48);
    if (device.hasTouch) {
      await page.touchscreen.tap(buyBounds.x + buyBounds.width / 2, buyBounds.y + buyBounds.height / 2);
      assert.equal(await handoff.isVisible(), true, 'A second tap at the buy position preserves the receipt');
      assert.equal(await page.locator('dialog[open]').count(), 0);
    }

    await viewport.evaluate(element => element.scrollTo({ left: element.scrollWidth, top: element.scrollHeight, behavior: 'instant' }));
    const nextPawn = viewport.locator('.factory-pawn[data-seat="2"]');
    assert.equal(await pawnInView(nextPawn), false, 'Panning away clips the next pawn before handoff');
    await act(handoff);
    await nextPawn.and(page.locator('[data-active]')).waitFor();
    await firstScreen(rollButton, { centered: true });
    assert.equal(await pawnInView(nextPawn), true, 'Handoff reveals the next pawn clear of the roll control');
    await verifyZoom(200);
    await act(button(zoom, '適合畫面'));
    await verifyZoom(100);
    assert.deepEqual(await viewport.evaluate(element => [element.scrollLeft, element.scrollTop]), [0, 0]);

    const { version, state } = await page.evaluate(() => JSON.parse(localStorage.getItem('harbor-board-game')));
    assert.equal(version, 1);
    assert.equal(state.mapId, HARBOR.id);
    assert.equal(state.activePlayerIndex, 1);
    assert.deepEqual(state.owners, { salt: 1 });
    await page.reload();
    await act(button(page, '繼續遊戲'));
    await firstScreen(turn.getByRole('heading', { name: '小棠', exact: true }));
    await salt.locator('.factory-owner:not([hidden])').waitFor();
    await roll(rollButton, act, 2);
    await turn.getByText('租金收據', { exact: true }).waitFor();
    await act(button(turn, '結束對局'));
    const dialog = page.getByRole('dialog', { name: '結束對局？' });
    await act(button(dialog, '確認結算'));
    await page.getByRole('heading', { name: '最終排名', exact: true }).waitFor();
    assert.deepEqual(await page.getByRole('rowheader').allTextContents(), ['玩家 1阿海船長', '玩家 2小棠']);
    assert.deepEqual(errors, []);
    console.log(`${device.viewport.width}×${device.viewport.height} ${device.hasTouch ? 'touch' : 'desktop'}: selection, 40 tiles, deed, purchase, zoomed handoff, resume and settlement passed`);
    await page.close();
  }
} finally {
  await browser.close();
}
