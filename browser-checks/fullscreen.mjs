import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createGame } from '../src/game.js';

const { chromium } = createRequire(import.meta.url)('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const base = new URL(process.env.BOARD_URL || 'http://localhost:4173');
const button = (page, name) => page.getByRole('button', { name, exact: true });
const desktop = { viewport: { width: 1360, height: 900 } };
const tablet = { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true };
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const save = JSON.stringify({ version: 1, state: createGame(['captain', 'florist', 'courier', 'auntie']) });

async function check(label, device, run, init) {
  const context = await browser.newContext({
    ...device,
    locale: 'zh-TW',
    reducedMotion: 'reduce',
    storageState: {
      cookies: [],
      origins: [{ origin: base.origin, localStorage: [{ name: 'harbor-board-game', value: save }] }],
    },
  });
  context.setDefaultTimeout(15000);
  const errors = [];
  try {
    if (init) await context.addInitScript(init);
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base.href);
    await run(page, (control) => device.hasTouch ? control.tap() : control.click());
    assert.deepEqual(errors, [], 'Game did not report browser errors');
    console.log(label);
  } finally {
    await context.close();
  }
}

async function enterGame(page, act) {
  await act(button(page, '繼續遊戲'));
  await page.locator('#board-canvas canvas').waitFor();
}

async function rollOne(page, act) {
  const roll = button(page, '擲骰');
  await roll.evaluate((element) => element.addEventListener('click', () => {
    const random = Math.random;
    Math.random = () => {
      Math.random = random;
      return 0;
    };
  }, { capture: true, once: true }));
  await act(roll);
}

async function verifyFocusedInViewport(control) {
  await control.waitFor();
  const focus = await control.evaluate((element) => {
    const { top, right, bottom, left } = element.getBoundingClientRect();
    const center = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    return { active: document.activeElement === element, exposed: element.contains(center), top, right, bottom, left,
      innerWidth, innerHeight };
  });
  assert.equal(focus.active, true, 'The expected control owns keyboard focus');
  assert.ok(focus.exposed && focus.top >= -1 && focus.left >= -1 &&
      focus.bottom <= focus.innerHeight + 1 && focus.right <= focus.innerWidth + 1,
    `The focused control fits the viewport: ${JSON.stringify(focus)}`);
}

async function verifyCompactHeader(page, fullscreenLabel, { boardControls = false } = {}) {
  const header = page.getByRole('banner');
  const brand = header.getByText('港灣街區', { exact: true });
  const audio = button(header, '骰子音效');
  const fullscreen = button(header, fullscreenLabel);
  await fullscreen.waitFor();
  const parts = [brand, audio, fullscreen];
  if (boardControls) {
    parts.push(header.locator('#round'), button(header, '縮小棋盤'), button(header, '放大棋盤'), button(header, '適合畫面'));
  }
  const boxes = await Promise.all(parts.map((part) => part.boundingBox()));
  assert.ok(boxes.every(Boolean), 'All header controls are visible');
  const centerY = boxes[0].y + boxes[0].height / 2;
  boxes.sort((a, b) => a.x - b.x);
  for (let index = 0; index < boxes.length; index += 1) {
    const { x, y, width, height } = boxes[index];
    assert.ok(y <= centerY && centerY <= y + height, `Header controls stay on one row: ${JSON.stringify(boxes)}`);
    assert.ok(x >= 0 && x + width <= page.viewportSize().width, 'Header controls fit the viewport');
    if (index) {
      const previous = boxes[index - 1];
      assert.ok(previous.x + previous.width <= x, 'Header controls have room without overlapping');
    }
  }
}

async function verifyPlayArea(page, actions) {
  const turn = page.locator('#turn-panel');
  await Promise.all(actions.map((name) => button(turn, name).waitFor()));
  const { viewport, documentWidth, scroll, board, panel, controls } = await page.evaluate(() => {
    const bounds = (element) => {
      const { top, right, bottom, left } = element.getBoundingClientRect();
      return { top, right, bottom, left };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      scroll: [scrollX, scrollY],
      board: bounds(document.querySelector('#board-viewport')),
      panel: bounds(document.querySelector('#turn-panel')),
      controls: Array.from(document.querySelectorAll('#turn-panel [data-turn-action]'), (control) => {
        const rect = bounds(control);
        const center = document.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);
        return { ...rect, name: control.textContent.trim(), hittable: control.contains(center) };
      }),
    };
  });
  assert.ok(documentWidth <= viewport.width, 'The document fits the viewport width');
  assert.deepEqual(scroll, [0, 0], 'The turn did not scroll the document');
  assert.ok(board.bottom <= panel.top, 'The turn panel starts below the board');
  for (const [name, rect] of [['Board', board], ['Turn panel', panel], ...controls.map((rect) => [rect.name, rect])]) {
    const { top, right, bottom, left } = rect;
    assert.ok(left >= 0 && top >= 0 && right <= viewport.width + 1 && bottom <= viewport.height + 1
      && right > left && bottom > top, `${name} fits the ${viewport.width}×${viewport.height} viewport: ${JSON.stringify(rect)}`);
  }
  assert.ok(controls.every(({ hittable }) => hittable), 'Each turn control receives pointer input above the fold');
}

try {
  await check('桌面全螢幕：進入、按鈕退出及瀏覽器退出', desktop, async (page, act) => {
    const enter = button(page, '全螢幕');
    const exit = button(page, '退出全螢幕');
    await act(enter);
    await exit.waitFor();
    assert.equal(await page.evaluate(() => document.fullscreenElement === document.documentElement), true);
    await act(exit);
    await enter.waitFor();
    assert.equal(await page.evaluate(() => document.fullscreenElement), null);

    await enterGame(page, act);
    await act(enter);
    await exit.waitFor();
    await page.evaluate(() => document.exitFullscreen());
    await enter.waitFor();
    assert.equal(await page.evaluate(() => document.fullscreenElement), null);
    await button(page, '擲骰').waitFor();
  });

  await check('手機版：單排頁首，不支援全螢幕時可切換及退出放大模式', phone, async (page, act) => {
    await verifyCompactHeader(page, '全螢幕');
    await act(button(page, '全螢幕'));
    await verifyCompactHeader(page, '退出放大模式');
    assert.equal(await page.evaluate(() => document.fullscreenElement), null);

    await enterGame(page, act);
    await verifyCompactHeader(page, '退出放大模式');
    const masthead = page.getByRole('banner');
    async function scrollPastMasthead() {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const { y, height } = await masthead.boundingBox();
      assert.ok(await page.evaluate((height) => window.scrollY >= height, height), 'The normal header would be above the viewport');
      assert.equal(y, 0, 'The masthead stays reachable while scrolling');
    }

    await scrollPastMasthead();
    await button(page, '退出放大模式').press('Enter');
    const enter = button(page, '全螢幕');
    await verifyFocusedInViewport(enter);
    assert.equal(await masthead.evaluate((element) => getComputedStyle(element).position), 'static');

    await act(enter);
    await button(page, '退出放大模式').waitFor();
    await scrollPastMasthead();
    const audio = button(page, '骰子音效');
    await audio.press('Escape');
    await enter.waitFor();
    await verifyFocusedInViewport(audio);
  }, () => Object.defineProperty(document, 'fullscreenEnabled', { value: false }));

  await check('拒絕全螢幕時改用放大模式，Escape 可回到一般版面', desktop, async (page, act) => {
    await act(button(page, '全螢幕'));
    await button(page, '退出放大模式').waitFor();
    assert.equal(await page.evaluate(() => document.fullscreenElement), null);
    await page.keyboard.press('Escape');
    await button(page, '全螢幕').waitFor();
    assert.equal(await page.locator('html[data-viewport-mode]').count(), 0);
  }, () => {
    Element.prototype.requestFullscreen = async () => {
      throw new DOMException('Fullscreen request denied', 'NotAllowedError');
    };
  });

  for (const device of [tablet, desktop]) {
    const { width, height } = device.viewport;
    await check(`${width}×${height} 四人對局：棋盤、購地及交棒控制在首屏內`, device, async (page, act) => {
      await enterGame(page, act);
      await verifyCompactHeader(page, '全螢幕', { boardControls: true });
      async function actWithoutScrolling(control) {
        const { x, y, width, height } = await control.boundingBox();
        const pointer = device.hasTouch ? page.touchscreen : page.mouse;
        const center = [x + width / 2, y + height / 2];
        if (device.hasTouch) await pointer.tap(...center);
        else await pointer.click(...center);
      }
      const roster = page.getByRole('list', { name: '玩家與目前位置' });
      assert.equal(await roster.getByRole('listitem').count(), 4);
      await rollOne(page, act);
      const turn = page.locator('#turn-panel');
      await turn.getByRole('heading', { name: '燈塔街', exact: true }).waitFor();
      await verifyPlayArea(page, ['買下', '略過']);
      await actWithoutScrolling(button(turn, '買下'));
      await turn.getByText('取得地契', { exact: true }).waitFor();
      await verifyPlayArea(page, ['交給下一位', '結束對局']);
      await actWithoutScrolling(button(turn, '交給下一位'));
      await turn.getByRole('heading', { name: '小棠', exact: true }).waitFor();
      await verifyPlayArea(page, ['擲骰']);
    });
  }

  await check('1024×600 平板：存檔失敗後僅本次繼續，購地鍵維持焦點且可見', {
    ...tablet, viewport: { width: 1024, height: 600 },
  }, async (page, act) => {
    await enterGame(page, act);
    await page.evaluate(() => {
      Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    });
    await rollOne(page, act);
    const session = button(page, '僅本次繼續');
    await session.waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-session]').disabled);
    await session.press('Enter');
    await verifyFocusedInViewport(button(page, '買下'));
    await page.keyboard.press('Enter');
    await button(page, '交給下一位').waitFor();
  });
} finally {
  await browser.close();
}
