import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { CHARACTERS } from '../src/characters.js';
import { HARBOR } from '../src/map.js';

const { chromium } = createRequire(import.meta.url)('playwright-core');
const executablePath = process.env.CHROME_PATH || undefined;
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const base = new URL(process.env.BOARD_URL || 'http://localhost:4173');
const screenshots = process.env.BOARD_SCREENSHOTS;
const characters = ['captain', 'florist', 'courier', 'auntie'];
const characterNames = ['阿海船長', '小棠', '阿哲', '美珠阿嬤'];
const desktop = { viewport: { width: 1360, height: 900 } };
const landscapeTouch = { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true };
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

function savedGame({ positions = [], cash = [], ...overrides } = {}) {
  const players = characters.map((characterId, index) => ({
    id: index + 1,
    name: `玩家 ${index + 1}`,
    characterId,
    cash: cash[index] ?? 600,
    locationId: positions[index] ?? 'start',
  }));
  return {
    version: 1,
    state: {
      mapId: 'harbor', mapVersion: 1, players, owners: {}, round: 1,
      activePlayerIndex: 0, phase: 'roll', die: null, lastMove: [], startBonus: 0, result: null,
      ...overrides,
    },
  };
}

async function check(label, run, { device = desktop, save, launcher = browser, observeArt, ...options } = {}) {
  const context = await launcher.newContext({
    ...device,
    locale: 'zh-TW',
    ...options,
    ...(save && {
      storageState: {
        cookies: [],
        origins: [{ origin: base.origin, localStorage: [{ name: 'harbor-board-game', value: JSON.stringify(save) }] }],
      },
    }),
  });
  const errors = [];
  const act = (button) => device.hasTouch ? button.tap() : button.click();
  context.setDefaultTimeout(15000);
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  try {
    if (observeArt) await context.addInitScript(observeBoardArt);
    const page = await context.newPage();
    await page.goto(base.href);
    await run(page, act, context);
    assert.deepEqual(errors, [], 'Game did not report browser errors');
    console.log(label);
  } finally {
    await context.close();
  }
}

function observeBoardArt() {
  const sources = new Set();
  window.renderedBoardImages = sources;
  // Three uploads a texture when it renders its mesh. Phaser draws the image directly.
  function observe(prototype, method) {
    const render = prototype[method];
    prototype[method] = function (...args) {
      const result = render.apply(this, args);
      const image = args.find((arg) => arg instanceof HTMLImageElement);
      if (image?.currentSrc && this.canvas.closest('#board-canvas')) sources.add(image.currentSrc);
      return result;
    };
  }
  observe(WebGL2RenderingContext.prototype, 'texImage2D');
  observe(WebGL2RenderingContext.prototype, 'texSubImage2D');
  observe(CanvasRenderingContext2D.prototype, 'drawImage');
}

async function verifyArt(image, label, seen, minimumSide) {
  await image.waitFor();
  const { colors, coverage, fingerprint, width, height } = await image.evaluate(async (element) => {
    await element.decode();
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(element, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const colors = new Set();
    let visiblePixels = 0;
    for (let pixel = 0; pixel < data.length; pixel += 4) {
      if (data[pixel + 3] < 128) continue;
      visiblePixels += 1;
      colors.add(data[pixel] * 65536 + data[pixel + 1] * 256 + data[pixel + 2]);
    }
    return {
      colors: colors.size,
      coverage: visiblePixels / (canvas.width * canvas.height),
      fingerprint: canvas.toDataURL(),
      width: canvas.width,
      height: canvas.height,
    };
  });
  assert.ok(width >= minimumSide && height >= minimumSide, `${label} supplies at least ${minimumSide}px of native art on both axes`);
  assert.ok(colors >= 4 && coverage >= .1, `${label} decodes to a detailed image`);
  assert.ok(!seen.has(fingerprint), `${label} has unique artwork`);
  seen.add(fingerprint);
}

async function verifyPortraits(page) {
  const cards = page.locator('.character-deck [data-character]');
  await cards.last().waitFor();
  assert.equal(await cards.count(), 8);
  const seen = new Set();
  for (const { id } of CHARACTERS) {
    await verifyArt(cards.and(page.locator(`[data-character="${id}"]`)).locator('img'), id, seen, 276);
  }
}

async function verifyPlaceArt(page) {
  const picker = page.getByRole('combobox', { name: '查看地塊' });
  await picker.waitFor();
  const options = await picker.locator('option').evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
  assert.equal(options.length, 40);
  assert.deepEqual(options, HARBOR.locations.map(({ id }) => id));
  const image = deed(page).locator('.deed-landmark');
  const seen = new Set();
  for (const { id, name } of HARBOR.locations) {
    await picker.selectOption(id);
    await deed(page).getByText(name, { exact: true }).waitFor();
    await verifyArt(image, id, seen, 192);
    const { width, height } = await image.boundingBox();
    assert.ok(width >= 48 && height >= 48, `The picker shows large artwork for ${id}`);
    await page.waitForFunction(() => {
      const image = document.querySelector('.deed-landmark');
      return window.renderedBoardImages.has(image?.currentSrc);
    }).catch((error) => {
      throw new Error(`The board canvas did not render artwork for ${id}`, { cause: error });
    });
  }
}

const button = (page, name) => page.getByRole('button', { name, exact: true });
const panel = (page) => page.locator('#turn-panel');
const key = 'harbor-board-game';
const snapshot = (page) => page.evaluate((key) => localStorage.getItem(key), key);

async function verifyWebGL(page) {
  const canvas = page.locator('canvas[data-renderer="webgl"]');
  await canvas.waitFor();
  assert.equal(await canvas.evaluate((element) => {
    const gl = element.getContext('webgl2');
    return gl instanceof WebGL2RenderingContext && !gl.isContextLost();
  }), true, 'The board has a live WebGL 2 context');
}

async function verifyCanvasResolution(page, renderer, deviceScaleFactor) {
  await page.waitForFunction(({ renderer, deviceScaleFactor }) => {
    const canvas = document.querySelector(`canvas[data-renderer="${renderer}"]`);
    if (!canvas || window.devicePixelRatio !== deviceScaleFactor) return false;
    if (renderer === 'canvas') return canvas.width === 980 * deviceScaleFactor && canvas.height === 610 * deviceScaleFactor;
    const { width, height } = canvas.getBoundingClientRect();
    const density = Math.min(deviceScaleFactor, 1.75, 1600 / width);
    return Math.abs(canvas.width - width * density) <= 1 && Math.abs(canvas.height - height * density) <= 1;
  }, { renderer, deviceScaleFactor }).catch((error) => {
    throw new Error(`${renderer} draws at the expected backing resolution for DPR ${deviceScaleFactor}`, { cause: error });
  });
}

async function settle(page, act, { cancelFirst = false } = {}) {
  const end = button(page, '結束對局');
  const dialog = page.getByRole('dialog', { name: '結束對局？' });
  if (cancelFirst) {
    await end.waitFor();
    const saved = await snapshot(page);
    const round = await page.locator('#round').textContent();
    const player = await panel(page).getByRole('heading', { level: 2 }).textContent();
    await act(end);
    await act(button(dialog, '取消'));
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await snapshot(page), saved, 'Cancel leaves the saved result unchanged');
    assert.equal(await page.locator('#round').textContent(), round);
    assert.equal(await panel(page).getByRole('heading', { level: 2 }).textContent(), player);
    assert.equal(await page.getByRole('heading', { name: '最終排名', exact: true }).count(), 0);
  }
  await act(end);
  await act(button(dialog, '確認結算'));
  await page.getByRole('heading', { name: '最終排名', exact: true }).waitFor();
}

async function roll(page, act, die) {
  const rollButton = button(page, '擲骰');
  if (die !== undefined) {
    // Stub only the dice draw for this click; the renderer continues using native randomness.
    await rollButton.evaluate((element, value) => element.addEventListener('click', () => {
      const random = Math.random;
      Math.random = () => {
        Math.random = random;
        return (value - 0.5) / 6;
      };
    }, { capture: true, once: true }), die);
  }
  await act(rollButton);
}

async function verifyCenteredRollControl(page) {
  const rollButton = button(page, '擲骰');
  await rollButton.waitFor();
  const center = await rollButton.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2,
      controlWidth: bounds.width, width: innerWidth, height: innerHeight };
  });
  assert.ok(Math.abs(center.x - center.width / 2) <= center.width * .08, 'The roll control is horizontally centered in the viewport');
  assert.ok(Math.abs(center.y - center.height / 2) <= center.height * .08, 'The roll control is vertically centered in the viewport');
  assert.ok(center.controlWidth <= center.width / 2, 'The roll control leaves the rest of the viewport available');
  return center;
}

async function verifyCeremony(page, act, die, { reduced = false, spam = false, hasTouch = false } = {}) {
  const picker = page.locator('.board-deed select');
  if (spam) {
    await pickTile(page, { hasTouch }, 'salt');
    assert.equal(await picker.inputValue(), 'salt', 'Pointer input reaches the tile before the roll');
    await picker.selectOption('flower');
  }
  const center = await verifyCenteredRollControl(page);
  const activePawn = page.locator('.board-seat[aria-current="true"]');
  await activePawn.waitFor();
  await page.evaluate(({ key, spam }) => {
    const probe = window.diceEvidence = { visitedRolling: false, saves: 0 };
    const pawn = document.querySelector('.board-seat[aria-current="true"]');
    const initialLeft = Number.parseFloat(pawn.style.left);
    const initialTop = Number.parseFloat(pawn.style.top);
    if (spam) {
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (name === key) probe.saves += 1;
        return write.call(this, name, value);
      };
    }
    function centered(element, tolerance) {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0
        && Math.abs((box.left + box.right) / 2 - innerWidth / 2) <= innerWidth * tolerance
        && Math.abs((box.top + box.bottom) / 2 - innerHeight / 2) <= innerHeight * tolerance;
    }
    function frontFace(scene) {
      return [...scene.querySelectorAll('.die-face')].map((face) => {
        // Compose the visible face's transforms to measure which normal points toward the viewer.
        let matrix = new DOMMatrixReadOnly();
        for (let element = face; element && element !== scene; element = element.parentElement) {
          const transform = getComputedStyle(element).transform;
          if (transform !== 'none') matrix = new DOMMatrixReadOnly(transform).multiply(matrix);
        }
        return { value: Number(face.dataset.face), pips: face.querySelectorAll('.die-pip').length, front: matrix.m33 };
      }).sort((a, b) => b.front - a.front)[0];
    }
    function frame(time) {
      const stage = document.querySelector('.roll-ceremony:not([hidden])');
      const scene = stage?.querySelector('.die-scene');
      const cube = scene?.querySelector('.die-cube');
      if (document.querySelector('#turn-panel h3')?.textContent === '棋子前進中') probe.visitedMoving = true;
      const pawnMoved = Math.hypot(Number.parseFloat(pawn.style.left) - initialLeft,
        Number.parseFloat(pawn.style.top) - initialTop) > 1;
      if (pawnMoved && !probe.firstMove) {
        probe.firstMove = { time, duringCeremony: Boolean(stage) };
      }
      if (stage?.dataset.stage === 'rolling') {
        probe.visitedRolling = true;
        const animation = cube?.getAnimations().find(({ effect }) => effect.getComputedTiming().duration > 0);
        if (animation) {
          const progress = animation.currentTime / animation.effect.getComputedTiming().duration;
          if (progress >= .25 && progress <= .8) {
            probe.midpoint = { centered: centered(cube, .12), transform: getComputedStyle(cube).transform };
          }
        }
      }
      if (!probe.result && stage?.dataset.stage === 'result' && scene && cube) {
        probe.result = {
          time,
          centered: centered(cube, .05),
          transform: getComputedStyle(cube).transform,
          face: frontFace(scene),
          label: stage.querySelector('.roll-ceremony-value')?.innerText.trim(),
          animating: stage.getAnimations({ subtree: true }).some(animation => animation.playState === 'running'),
        };
      }
      if (probe.result && probe.firstMove) return;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, { key, spam });

  await roll(page, act, die);
  if (spam) {
    await page.locator('.roll-ceremony[data-stage="rolling"]').waitFor();
    const [x, y] = await tilePoint(page, 'salt');
    assert.ok(x >= 0 && x < center.width && y >= 0 && y < center.height, 'The target tile is in the viewport');
    assert.equal(await page.evaluate(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('#board-canvas')), [x, y]),
      false, 'The tile cannot receive pointer input through the ceremony');
    if (hasTouch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    assert.equal(await picker.inputValue(), 'flower', 'Tapping a tile during the ceremony leaves the selected deed alone');
    await page.keyboard.press('Tab');
    assert.equal(await picker.evaluate((element) => {
      if (element === document.activeElement) return true;
      element.focus({ preventScroll: true });
      return element === document.activeElement;
    }), false, 'Keyboard focus cannot reach the deed picker during the ceremony');

    for (let repeat = 0; repeat < 3; repeat += 1) {
      if (hasTouch) await page.touchscreen.tap(center.x, center.y);
      else await page.mouse.click(center.x, center.y);
    }
  }
  await page.waitForFunction(() => window.diceEvidence?.result);
  const { visitedRolling, midpoint, result } = await page.evaluate(() => window.diceEvidence);
  assert.ok(result.centered, 'The settled die is visible near the viewport center');
  assert.equal(result.label, `骰點 ${die}`);
  assert.ok(result.face?.front >= .75, 'The settled face points visibly toward the viewer');
  assert.equal(result.face?.value, die, 'The cube faces the viewer with the reported result');
  assert.equal(result.face?.pips, die, 'The face presents the correct number of pips');
  if (reduced) {
    assert.equal(visitedRolling, false, 'Reduced motion skips the rolling stage');
    assert.equal(result.animating, false, 'The reduced-motion reveal is static');
  } else {
    assert.ok(midpoint?.centered, 'The die is animated near the viewport center in mid-roll');
    assert.notEqual(midpoint.transform, result.transform, 'The cube turns before revealing the final face');
  }
  await page.locator('.roll-ceremony').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.diceEvidence?.firstMove);
  const { firstMove, visitedMoving } = await page.evaluate(() => window.diceEvidence);
  assert.ok(result.time < firstMove.time, 'The result is visible before the active pawn moves');
  assert.equal(firstMove.duringCeremony, false, 'The dice are dismissed before the active pawn moves');
  assert.equal(Boolean(visitedMoving), !reduced, 'Reduced motion skips animated pawn movement');
}

async function reopen(page, context, action = '繼續遊戲') {
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(base.href);
  await button(reopened, action).click();
  return reopened;
}

function tilePoint(page, tile) {
  return page.locator(`.board-tile-label[data-location="${tile}"]`).evaluate((label) => {
    const box = label.closest('.board-projection').getBoundingClientRect();
    return [box.x + Number.parseFloat(label.style.left), box.y + Number.parseFloat(label.style.top)];
  });
}

async function pickTile(page, device, tile) {
  await page.locator('canvas[data-renderer="webgl"]').scrollIntoViewIfNeeded();
  const [screenX, screenY] = await tilePoint(page, tile);
  if (device.hasTouch) await page.touchscreen.tap(screenX, screenY);
  else await page.mouse.click(screenX, screenY);
}

async function verifyDeedAtPoints(page, renderer, points, { hasTouch, scrollCanvas = true } = desktop) {
  const canvas = page.locator(`canvas[data-renderer="${renderer}"]`);
  const picker = page.getByRole('combobox', { name: '查看地塊' });
  for (const [fractionX, fractionY, id] of points) {
    await picker.selectOption('flower');
    if (scrollCanvas) await canvas.scrollIntoViewIfNeeded();
    const { x, y, width, height } = await canvas.boundingBox();
    const screenX = x + fractionX * width;
    const screenY = y + fractionY * height;
    if (hasTouch) await page.touchscreen.tap(screenX, screenY);
    else await page.mouse.click(screenX, screenY);
    assert.equal(await picker.inputValue(), id, `${renderer} hit at (${fractionX}, ${fractionY}) opens ${id}`);
    await deed(page).getByText(HARBOR.locations.find(location => location.id === id).name, { exact: true }).waitFor();
  }
}

async function verifyBoardZoom(page, act, renderer, device) {
  await act(button(page, '繼續遊戲'));
  const canvas = page.locator(`canvas[data-renderer="${renderer}"]`);
  await canvas.waitFor();
  const viewport = page.getByRole('group', { name: '棋盤視窗' });
  const zoom = page.getByRole('group', { name: '棋盤縮放' });
  const enlarge = button(zoom, '放大棋盤');
  const shrink = button(zoom, '縮小棋盤');
  const reset = button(zoom, '適合畫面');
  const output = zoom.locator('output');
  const saved = await snapshot(page);
  const canvasWidth = (scale) => page.waitForFunction(({ scale, renderer }) => {
    const canvas = document.querySelector(`canvas[data-renderer="${renderer}"]`);
    return Math.abs(canvas.getBoundingClientRect().width - scale * document.querySelector('#board-viewport').clientWidth) <= 2;
  }, { scale, renderer });
  await canvasWidth(1);
  assert.equal(await output.textContent(), '100%');
  assert.equal(await shrink.isDisabled(), true);
  assert.equal(await reset.isDisabled(), true);
  for (const scale of [1.5, 2]) {
    await act(enlarge);
    assert.equal(await output.textContent(), `${scale * 100}%`);
    await canvasWidth(scale);
  }
  assert.equal(await enlarge.isDisabled(), true);
  assert.equal(await viewport.evaluate((element) => element.scrollLeft > 0 && element.scrollTop > 0), true,
    'Magnification preserves the center of the scrollable board');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth), true,
    'Magnification stays within the page width');

  const picker = page.getByRole('combobox', { name: '查看地塊' });
  await picker.selectOption('flower');
  await viewport.scrollIntoViewIfNeeded();
  if (device.hasTouch) {
    // Exercise hit-test coordinates after independently moving the board inside its viewport.
    await viewport.evaluate((element) => { element.scrollLeft = 0; });
  } else {
    const { x, y, width, height } = await viewport.boundingBox();
    await page.mouse.move(x + width * .2, y + height * .2);
    await page.mouse.down();
    await page.mouse.move(x + width * .8, y + height * .2, { steps: 6 });
    await page.mouse.up();
    assert.equal(await picker.inputValue(), 'flower', 'Dragging does not select a tile');
  }
  assert.equal(await viewport.evaluate((element) => element.scrollLeft), 0, 'The left side of the zoomed map is reachable');

  // The lighthouse is clear of the fixed roll button on the phone.
  let point = [121 / 980, 311 / 610, 'lighthouse'];
  if (renderer === 'webgl') {
    const { x, y, width, height } = await canvas.boundingBox();
    const [screenX, screenY] = await tilePoint(page, 'salt');
    point = [(screenX - x) / width, (screenY - y) / height, 'salt'];
  }
  await verifyDeedAtPoints(page, renderer, [point], {
    hasTouch: device.hasTouch, scrollCanvas: false,
  });

  await act(shrink);
  await canvasWidth(1.5);
  assert.equal(await output.textContent(), '150%');
  await act(reset);
  await canvasWidth(1);
  assert.equal(await output.textContent(), '100%');
  assert.equal(await viewport.evaluate((element) => element.scrollLeft === 0 && element.scrollTop === 0), true);
  assert.equal(await picker.inputValue(), point[2]);
  assert.equal(await snapshot(page), saved, 'Inspecting the zoomed board preserves the saved game');
  await roll(page, act, 2);
  await button(page, '買下').waitFor();
}

async function verifyZoomedHandoff(page, act, renderer) {
  await startGame(page, act, 2);
  const canvas = page.locator(`canvas[data-renderer="${renderer}"]`);
  await canvas.waitFor();
  const enlarge = button(page, '放大棋盤');
  const viewport = page.locator('#board-viewport');
  const pan = () => viewport.evaluate(({ scrollLeft, scrollTop }) => [scrollLeft, scrollTop]);
  await act(enlarge);
  await act(enlarge);
  await roll(page, act, 1);
  await act(button(page, '買下'));
  await act(button(page, '交給下一位'));
  await page.waitForFunction(() => document.activeElement.matches('.roll-trigger'));
  await verifyCenteredRollControl(page);
  assert.equal(await page.locator('.board-zoom output').textContent(), '200%');

  await verifyActivePawnInView(page, renderer);
  if (renderer === 'webgl') {
    await canvas.evaluate((element) => element.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await verifyActivePawnInView(page, 'canvas');
    await verifyCenteredRollControl(page);
    assert.equal(await page.locator('.board-zoom output').textContent(), '200%');
    assert.equal(await button(page, '擲骰').evaluate((element) => element === document.activeElement), true);
  }

  // Both players are now on the left side of the board, clear of the roll control.
  await roll(page, act, 1);
  const handoff = button(page, '交給下一位');
  await handoff.waitFor();
  const before = await pan();
  await act(handoff);
  await page.waitForFunction(() => document.activeElement.matches('.roll-trigger'));
  assert.deepEqual(await pan(), before, 'A visible next pawn preserves the current pan');
}

async function verifyActivePawnInView(page, renderer) {
  const canvas = page.locator('canvas[data-renderer="canvas"]');
  if (renderer === 'canvas') {
    // Player 2 stands alone on Start. Wait for the active badge to be painted at its known coordinates.
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas[data-renderer="canvas"]');
      const pixel = canvas?.getContext('2d').getImageData(101, 257, 1, 1).data;
      return pixel?.[0] === 255 && pixel[1] === 211 && pixel[2] === 106;
    });
  }
  const seat = renderer === 'webgl' ? page.locator('.board-seat[data-seat="2"][aria-current="true"]') : canvas;
  const visible = await seat.evaluate((element, renderer) => {
    const viewport = document.querySelector('#board-viewport');
    const clip = viewport.getBoundingClientRect();
    const roll = document.activeElement.getBoundingClientRect();
    let { left, top, right, bottom, width, height } = element.getBoundingClientRect();
    if (renderer === 'canvas') {
      // The Canvas figure and seat badge occupy this logical rectangle at Start.
      right = left + 105 * width / 980;
      bottom = top + 289 * height / 610;
      left += 63 * width / 980;
      top += 243 * height / 610;
    }
    return left >= Math.max(clip.left, 0) && top >= Math.max(clip.top, 0) &&
      right <= Math.min(clip.left + viewport.clientWidth, innerWidth) &&
      bottom <= Math.min(clip.top + viewport.clientHeight, innerHeight) &&
      (right <= roll.left || left >= roll.right || bottom <= roll.top || top >= roll.bottom);
  }, renderer);
  assert.equal(visible, true, `The active pawn is visible on ${renderer} and clear of the roll button`);
}

const deed = (page) => page.locator('.board-deed').getByRole('status');

async function startGame(page, act, playerCount = characters.length, assessPortraits = false) {
  await act(button(page, '開始新局'));
  if (assessPortraits) await verifyPortraits(page);
  if (playerCount !== characters.length) {
    await page.getByRole('combobox', { name: '遊玩人數' }).selectOption(String(playerCount));
  }
  for (const character of characters.slice(0, playerCount)) {
    await act(page.locator(`[data-character="${character}"]`));
    await act(button(page, '確認角色'));
  }
  await act(button(page, '開始新局'));
}

async function verifyBadges(page, activeSeat) {
  const badges = page.locator('.board-seat');
  await badges.last().waitFor();
  assert.equal(await badges.count(), 4);
  for (let seat = 1; seat <= 4; seat += 1) {
    const badge = page.locator(`.board-seat[data-seat="${seat}"]`);
    await badge.waitFor();
    assert.equal((await badge.textContent()).trim(), String(seat));
    assert.equal(await badge.getAttribute('aria-current') === 'true', seat === activeSeat);
  }
  const badgeLooks = await badges.evaluateAll((elements) => elements.map((badge) => {
    const { backgroundColor, borderColor, boxShadow, color } = getComputedStyle(badge);
    return [badge.getAttribute('aria-current') === 'true', [backgroundColor, borderColor, boxShadow, color].join('/')];
  }));
  const [, activeLook] = badgeLooks.find(([active]) => active);
  assert.ok(badgeLooks.every(([active, look]) => active || look !== activeLook), 'The active badge is visually distinct');
}

async function verifyOwner(page, property, seat) {
  const owner = page.locator(`.board-tile-label[data-location="${property}"] .board-owner`);
  await owner.waitFor();
  assert.equal((await owner.textContent()).trim(), String(seat));
}

async function warehousePatch(page) {
  const canvas = page.locator('canvas[data-renderer="webgl"]');
  const image = await canvas.screenshot({ scale: 'css', style: '.board-projection, .roll-trigger { visibility: hidden; }' });
  return canvas.evaluate(async (element, png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const projection = element.nextElementSibling;
    const bridge = projection.querySelector('[data-location="bridge"]');
    const neighbor = projection.querySelector('[data-location="storm"]');
    const bridgeX = Number.parseFloat(bridge.style.left);
    const tileStep = bridgeX - Number.parseFloat(neighbor.style.left);
    // Sample the warehouse roof to the bridge's right, clear of projected text and pawn bases.
    const x = bridgeX + .29 * tileStep;
    const y = Number.parseFloat(bridge.style.top) - .38 * tileStep;
    const size = Math.round(tileStep * .25);
    const crop = document.createElement('canvas');
    crop.width = size;
    crop.height = size;
    const context = crop.getContext('2d');
    context.drawImage(image, Math.round(x - size / 2), Math.round(y - size / 2), size, size, 0, 0, size, size);
    return [...context.getImageData(0, 0, size, size).data];
  }, image.toString('base64'));
}

function changedPixels(before, after) {
  assert.equal(before.length, after.length);
  let changed = 0;
  for (let pixel = 0; pixel < before.length; pixel += 4) {
    const distance = Math.abs(before[pixel] - after[pixel]) + Math.abs(before[pixel + 1] - after[pixel + 1]) +
      Math.abs(before[pixel + 2] - after[pixel + 2]);
    if (distance > 35) changed += 1;
  }
  return changed / (before.length / 4);
}

try {
  await check('WebGL：放大、拖曳與點地契後，可重設棋盤並擲骰',
    (page, act) => verifyBoardZoom(page, act, 'webgl', desktop), { save: savedGame(), reducedMotion: 'reduce' });

  await check('WebGL 觸控：放大交棒後切換 Canvas，下一位棋子仍可見',
    (page, act) => verifyZoomedHandoff(page, act, 'webgl'), { device: landscapeTouch });

  await check('離線 WebGL：8 張不同的角色肖像、40 張棋盤與地契插圖、插圖點擊', async (page, act, context) => {
    await context.setOffline(true);
    await startGame(page, act, 1, true);
    await verifyWebGL(page);
    await verifyPlaceArt(page);
    await verifyCanvasResolution(page, 'webgl', 2);
    // The lighthouse roof overhangs the wharf slab. Its transparent edge must still reach the slab.
    const points = [[.14404, .50518, 'lighthouse'], [.13851, .50696, 'wharf']];
    await verifyDeedAtPoints(page, 'webgl', points);
    await page.setViewportSize({ width: 1180, height: 850 });
    await verifyCanvasResolution(page, 'webgl', 2);
    await verifyDeedAtPoints(page, 'webgl', points);
  }, { observeArt: true, reducedMotion: 'reduce', deviceScaleFactor: 2 });

  await check('WebGL 可點選紙燈籠插圖的柔化邊緣，結算後重開仍有效', async (page, act) => {
    // Pin the scale at which a filtered edge pixel of the lantern overlaps the ferry-road slab.
    await page.addStyleTag({ content: '#board-canvas { width: 876px; height: 600px; aspect-ratio: auto; }' });
    const canvas = page.locator('canvas[data-renderer="webgl"]');
    const verifyEdge = async () => {
      await verifyWebGL(page);
      await verifyCanvasResolution(page, 'webgl', 1);
      assert.deepEqual(await canvas.evaluate(element => [element.width, element.height]), [876, 600]);
      await page.getByRole('combobox', { name: '查看地塊' }).selectOption('paper');
      await page.waitForFunction(() => window.renderedBoardImages.has(document.querySelector('.deed-landmark')?.currentSrc));
      await verifyDeedAtPoints(page, 'webgl', [[346.5 / 876, 139.5 / 600, 'paper']]);
    };
    await startGame(page, act, 1);
    await verifyEdge();
    await roll(page, act, 1);
    await act(button(page, '略過'));
    await settle(page, act);
    await canvas.waitFor({ state: 'detached' });
    await page.evaluate(() => window.renderedBoardImages.clear());
    await startGame(page, act, 1);
    await act(button(page, '取代並開始'));
    await verifyEdge();
  }, { observeArt: true, reducedMotion: 'reduce', device: { viewport: { width: 1360, height: 1000 } } });

  await check('手機觸控可點燈塔，魚市場與海關街只顯示選取地名，地主與棋子編號仍可見', async (page, act) => {
    await act(button(page, '繼續遊戲'));
    await verifyWebGL(page);
    await verifyDeedAtPoints(page, 'webgl', [[.14497, .50639, 'lighthouse'], [.12722, .50639, 'start']], phone);
    const picker = page.getByRole('combobox', { name: '查看地塊' });
    const caption = (id) => page.locator(`.board-tile-label[data-location="${id}"] .board-tile-caption > span`);
    for (const [selected, adjacent] of [['fish', 'customs'], ['customs', 'fish']]) {
      await picker.selectOption(selected);
      await caption(selected).waitFor();
      assert.equal(await caption(adjacent).isVisible(), false, `${adjacent} leaves room for the selected title`);
    }
    await verifyOwner(page, 'fish', 1);
    await verifyOwner(page, 'customs', 2);
    await verifyBadges(page, 1);
  }, { device: phone, reducedMotion: 'reduce', save: savedGame({ owners: { fish: 1, customs: 2 } }) });

  await check('窄螢幕擲骰後，焦點與購地按鈕回到可見範圍', async (page, act) => {
    await act(button(page, '繼續遊戲'));
    await page.evaluate(() => window.scrollTo(0, 0));
    await verifyCenteredRollControl(page);
    await roll(page, act, 2);
    const buy = button(page, '買下');
    await buy.waitFor();
    assert.equal(await buy.evaluate((element) => {
      const { top, bottom } = element.getBoundingClientRect();
      return document.activeElement === element && top >= -1 && bottom <= innerHeight + 1;
    }), true, 'The focused purchase action is fully visible without manual scrolling');
  }, { device: { ...phone, viewport: { width: 390, height: 540 } }, reducedMotion: 'reduce', save: savedGame() });

  await check('跨起點購地：關頁後仍為 250 元，買下鹽埕街後剩 50 元，地契歸玩家 1', async (page, act, context) => {
    await act(button(page, '繼續遊戲'));
    await roll(page, act, 3);
    await button(page, '買下').waitFor();
    await panel(page).getByText('250 元', { exact: true }).waitFor();
    await panel(page).getByText('起點收入 100 元。', { exact: true }).waitFor();
    page = await reopen(page, context);
    await panel(page).getByText('250 元', { exact: true }).waitFor();
    await panel(page).getByText('起點收入 100 元。', { exact: true }).waitFor();
    await pickTile(page, desktop, 'salt');
    await deed(page).getByText('無主地', { exact: true }).waitFor();
    await act(button(page, '買下'));
    await panel(page).getByText('50 元', { exact: true }).waitFor();
    await deed(page).getByText('玩家 1・阿海船長', { exact: true }).waitFor();
    await act(button(page, '交給下一位'));
    await panel(page).getByRole('heading', { name: '小棠', exact: true }).waitFor();
  }, { save: savedGame({ positions: ['wharf'], cash: [150] }) });

  await check('事件扣款：潮汐消息支出 40 元、實付 20 元，關頁仍為 0 元並可交棒', async (page, act, context) => {
    await act(button(page, '繼續遊戲'));
    await roll(page, act, 1);
    const event = '潮汐消息支出 40 元，實付 20 元。';
    await panel(page).getByText(event, { exact: true }).waitFor();
    await panel(page).getByText('0 元', { exact: true }).waitFor();
    page = await reopen(page, context);
    await panel(page).getByText(event, { exact: true }).waitFor();
    await panel(page).getByText('0 元', { exact: true }).waitFor();
    await act(button(page, '交給下一位'));
    await panel(page).getByRole('heading', { name: '小棠', exact: true }).waitFor();
  }, { save: savedGame({ positions: ['ferry'], cash: [20] }) });

  await check('付租後結算，玩家 1 與 4 各以 660 元並列第一，關頁後排名相同', async (page, act, context) => {
    await act(button(page, '繼續遊戲'));
    await roll(page, act, 1);
    await panel(page).getByText('在燈塔街付給玩家 1 · 阿海船長 30 元 租金。', { exact: true }).waitFor();
    await settle(page, act);
    const ranking = async (resultPage) => {
      await resultPage.getByRole('heading', { name: '最終排名', exact: true }).waitFor();
      await resultPage.getByRole('heading', { name: '共同奪冠', exact: true }).waitFor();
      const portraits = resultPage.locator('.victory-portraits figure');
      assert.deepEqual(await portraits.locator('figcaption').allTextContents(), ['阿海船長', '美珠阿嬤']);
      const images = await portraits.locator('img').all();
      assert.equal(images.length, 2);
      for (const portrait of images) {
        await portrait.waitFor();
        assert.ok(await portrait.evaluate((image) => image.decode().then(() => image.naturalWidth > 0)),
          'Each tied winner has a visible, decoded portrait');
      }
      return resultPage.getByRole('row').allTextContents().then((rows) => rows.slice(1).map((row) => row.replace(/\s+/g, ' ').trim()));
    };
    const standings = await ranking(page);
    assert.deepEqual(standings, [
      '並列第 1 名 玩家 1阿海船長 560 100 660',
      '並列第 1 名 玩家 4美珠阿嬤 460 200 660',
      '第 3 名 玩家 2小棠 550 0 550',
      '第 4 名 玩家 3阿哲 400 0 400',
    ]);
    assert.deepEqual(await ranking(await reopen(page, context, '查看結算')), standings);
  }, { save: savedGame({ round: 12, activePlayerIndex: 3, cash: [530, 550, 400, 490], owners: { lighthouse: 1, salt: 4 } }) });

  for (const device of [desktop, landscapeTouch]) {
    const input = device.hasTouch ? '模擬單指觸控' : '桌機滑鼠';
    let opaque;
    await check(`${input}：正常選角、擲骰、點地契、購地、交棒`, async (page, act) => {
      await startGame(page, act);
      await verifyWebGL(page);
      await verifyCeremony(page, act, 2, { spam: true, hasTouch: device.hasTouch });
      await button(page, '買下').waitFor();
      const saved = JSON.parse(await snapshot(page)).state;
      assert.equal(saved.die, 2);
      assert.deepEqual(saved.lastMove, ['lighthouse', 'salt']);
      assert.equal(await page.evaluate(() => window.diceEvidence.saves), 1, 'Repeated input commits one roll');
      opaque = await warehousePatch(page);
      await pickTile(page, device, 'salt');
      await deed(page).getByText('鹽埕街', { exact: true }).waitFor();
      await deed(page).getByText('無主地', { exact: true }).waitFor();
      await act(button(page, '買下'));
      await deed(page).getByText('玩家 1・阿海船長', { exact: true }).waitFor();
      await act(button(page, '交給下一位'));
      await panel(page).getByRole('heading', { name: '小棠', exact: true }).waitFor();
      await verifyCenteredRollControl(page);
      assert.equal(await button(page, '擲骰').evaluate((element) => element === document.activeElement), true,
        'The new player receives focus on the roll control');
    }, { device });

    const bridgeSave = (activeSeat) => savedGame({
      positions: Array(4).fill('bridge'), activePlayerIndex: activeSeat - 1, owners: { bridge: 2, lighthouse: 1 },
    });
    async function verifyBridge(page, act, activeSeat, activeCharacter) {
      await act(button(page, '繼續遊戲'));
      await verifyWebGL(page);
      await pickTile(page, device, 'bridge');
      await deed(page).getByText('月光橋', { exact: true }).waitFor();
      for (const value of ['玩家 2・小棠', '300 元', '90 元']) {
        await deed(page).getByText(value, { exact: true }).waitFor();
      }
      await panel(page).getByRole('heading', { name: activeCharacter, exact: true }).waitFor();
      await verifyBadges(page, activeSeat);
      await verifyOwner(page, 'bridge', 2);
    }

    await check(`${input}：月光橋四個棋子編號與玩家 2 外框、倉庫淡化、地契與相鄰地塊`, async (page, act) => {
      await verifyBridge(page, act, 2, '小棠');
      const faded = await warehousePatch(page);
      assert.ok(changedPixels(opaque, faded) > .4, 'The warehouse roof changes as the occluder fades');
      if (screenshots) {
        await page.screenshot({ path: `${screenshots}/board-${device.hasTouch ? 'touch' : 'mouse'}.png` });
      }
      await pickTile(page, device, 'storm');
      await deed(page).getByText('浪潮插曲', { exact: true }).waitFor();
      assert.ok(!(await deed(page).innerText()).includes('玩家 2'), 'The neighboring tile replaces the deed');
      await verifyOwner(page, 'lighthouse', 1);
      for (const player of [2, 3, 4, 1]) {
        await roll(page, act, 6);
        await act(button(page, '略過'));
        if (player !== 1) await act(button(page, '交給下一位'));
      }
      const restored = await warehousePatch(page);
      assert.ok(changedPixels(opaque, restored) < .05, 'The warehouse roof returns to its unoccupied appearance');
    }, { device, save: bridgeSave(2) });

    await check(`${input}：玩家 4 行動時外框改到棋子 4，地契與地主編號維持玩家 2`, async (page, act) => {
      await verifyBridge(page, act, 4, '美珠阿嬤');
      if (screenshots) {
        await page.screenshot({ path: `${screenshots}/board-${device.hasTouch ? 'touch' : 'mouse'}-active-4.png` });
      }
    }, { device, save: bridgeSave(4) });
  }

  await check('離線減少動態效果：六個實際骰面正確，骰點、落點與港灣慶典收入一致', async (page, act, context) => {
    await context.setOffline(true);
    await startGame(page, act, 1);
    const landings = ['lighthouse', 'flower', 'ferry', 'harbor-road', 'festival', 'watchtower'];
    for (const [index, landing] of landings.entries()) {
      const die = index + 1;
      await verifyCeremony(page, act, die, { reduced: true });
      const advance = button(page, '進入下一輪');
      if (landing !== 'festival') await act(button(page, '略過'));
      await advance.waitFor();
      const state = JSON.parse(await snapshot(page)).state;
      assert.equal(state.die, die);
      assert.equal(state.players[0].locationId, landing);
      assert.equal(state.players[0].cash, die < 5 ? 600 : 650);
      await act(advance);
    }
  }, { reducedMotion: 'reduce' });

  for (const playerCount of [1, 2, 3, 4]) {
    const offline = playerCount === 4;
    const rounds = 13;
    const turns = (rounds - 1) * playerCount + 1;
    const names = characterNames.slice(0, playerCount);
    const advanceLabel = playerCount === 1 ? '進入下一輪' : '交給下一位';
    await check(`${playerCount} 人${offline ? '離線' : ''}對局玩到第 ${rounds} 輪，取消或確認後可重新載入結算`, async (page, act, context) => {
      if (offline) await context.setOffline(true);
      await startGame(page, act, playerCount);
      await verifyWebGL(page);
      const verifyRoster = async () => {
        const roster = page.getByRole('list', { name: '玩家與目前位置' });
        await roster.waitFor();
        const players = roster.getByRole('listitem');
        assert.equal(await players.count(), playerCount);
        for (const [index, name] of names.entries()) {
          await players.nth(index).getByText(name, { exact: true }).waitFor();
        }
      };
      await verifyRoster();
      for (let turn = 0; turn < turns; turn += 1) {
        if (!offline && turn === 1) {
          await button(page, '擲骰').waitFor();
          page = await reopen(page, context);
          await verifyRoster();
        }
        const round = Math.floor(turn / playerCount) + 1;
        const seat = turn % playerCount;
        await page.getByText(`第 ${round} 輪`, { exact: true }).waitFor();
        await panel(page).getByText(`輪到玩家 ${seat + 1}`, { exact: true }).waitFor();
        await panel(page).getByRole('heading', { name: names[seat], exact: true }).waitFor();
        await roll(page, act, offline ? undefined : 1);
        const buy = button(page, '買下');
        const skip = button(page, '略過');
        const handoff = button(page, advanceLabel);
        await buy.or(skip).or(handoff).first().waitFor();
        if (await buy.isVisible()) await act(buy);
        else if (await skip.isVisible()) await act(skip);
        if (playerCount === 1) {
          await handoff.waitFor();
          assert.equal(await panel(page).getByText(/^下一位/).count(), 0);
        }
        if (turn === turns - 1) await settle(page, act, { cancelFirst: true });
        else await act(handoff);
      }
      await page.getByRole('heading', { name: '最終排名', exact: true }).waitFor();
      await page.getByText(`第 ${rounds} 輪結算`, { exact: true }).waitFor();
      const standings = await page.getByRole('table').innerText();
      const participants = await page.getByRole('rowheader').allTextContents();
      assert.deepEqual(participants.sort(), names.map((name, index) => `玩家 ${index + 1}${name}`));
      if (offline) await context.setOffline(false);
      const reopened = await reopen(page, context, '查看結算');
      await reopened.getByText(`第 ${rounds} 輪結算`, { exact: true }).waitFor();
      assert.equal(await reopened.getByRole('table').innerText(), standings);
    }, { reducedMotion: 'reduce' });
  }

  const fallback = await chromium.launch({ executablePath, args: ['--disable-webgl'] });
  try {
    await check('Canvas 觸控：放大至 200% 後交棒，下一位棋子仍可見',
      (page, act) => verifyZoomedHandoff(page, act, 'canvas'),
      { launcher: fallback, device: landscapeTouch, reducedMotion: 'reduce' });

    await check('Canvas 觸控：放大、捲動與點地契後，可重設棋盤並擲骰',
      (page, act) => verifyBoardZoom(page, act, 'canvas', phone),
      { launcher: fallback, device: phone, save: savedGame(), reducedMotion: 'reduce' });

    for (const deviceScaleFactor of [1, 2]) {
      await check(`Canvas DPR ${deviceScaleFactor}：點擊燈塔的實色像素打開燈塔地契，透明像素仍可點到起點`, async (page, act) => {
        await startGame(page, act, 1);
        await verifyCanvasResolution(page, 'canvas', deviceScaleFactor);
        // Both pixels are over the start tile in the 980×610 logical board.
        await verifyDeedAtPoints(page, 'canvas', [
          [106.9375 / 980, 296.3125 / 610, 'lighthouse'],
          [101.3125 / 980, 299.4375 / 610, 'start'],
        ]);
      }, { launcher: fallback, reducedMotion: 'reduce', deviceScaleFactor });
    }

    await check('離線停用 WebGL 後仍可開局、繪製 40 張棋盤插圖、查看地契、購地與交棒', async (page, act, context) => {
      await context.setOffline(true);
      await startGame(page, act);
      const canvas = page.locator('#board-canvas canvas');
      await canvas.waitFor();
      assert.equal(await canvas.evaluate((element) => {
        const probe = document.createElement('canvas');
        return probe.getContext('webgl2') === null && element.getContext('2d') instanceof CanvasRenderingContext2D;
      }), true, 'WebGL is disabled and the board uses a 2D canvas');
      await verifyPlaceArt(page);
      await roll(page, act, 2);
      await page.getByRole('combobox', { name: '查看地塊' }).selectOption('salt');
      await deed(page).getByText('無主地', { exact: true }).waitFor();
      await act(button(page, '買下'));
      await deed(page).getByText('玩家 1・阿海船長', { exact: true }).waitFor();
      await act(button(page, '交給下一位'));
      await panel(page).getByRole('heading', { name: '小棠', exact: true }).waitFor();
    }, { launcher: fallback, observeArt: true, reducedMotion: 'reduce' });
  } finally {
    await fallback.close();
  }
} finally {
  await browser.close();
}
