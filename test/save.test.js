import assert from 'node:assert/strict';
import test from 'node:test';
import { buyProperty, createGame, endTurn, rollDice, skipPurchase } from '../src/game.js';
import { HARBOR } from '../src/map.js';
import { createSaveSlot } from '../src/save.js';

const lineup = ['captain', 'florist', 'courier', 'auntie'];
const locks = { request: (_, write) => write() };
const saveSlot = (getStorage, maps) => createSaveSlot(getStorage, maps, locks);

function memoryStorage() {
  const entries = new Map();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  };
}

test('two tabs cannot commit from the same snapshot or overwrite progress on retry', async () => {
  const storage = memoryStorage();
  const open = () => saveSlot(() => storage);
  const first = open();
  const second = open();
  const offered = rollDice(createGame(lineup), 2);
  await first.write(offered, first.read().snapshot);

  const stale = second.read();
  const handedOff = endTurn(buyProperty(offered));
  await first.write(handedOff, first.read().snapshot);
  const skipped = skipPurchase(stale.state);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assert.equal((await second.write(skipped, stale.snapshot)).status, 'conflict');
    assert.deepEqual(open().read().state, handedOff);
  }
});

test('replacing with an identical lineup still invalidates the prior snapshot', async () => {
  const storage = memoryStorage();
  const slot = saveSlot(() => storage);
  const initial = createGame(lineup);
  const { snapshot } = await slot.write(initial);
  assert.equal((await slot.write(createGame(lineup), snapshot)).status, 'saved');
  assert.equal((await slot.write(rollDice(initial, 2), snapshot)).status, 'conflict');
  assert.deepEqual(slot.read().state, initial);
});

test('resuming validates the round number, start bonus, and positive event payout', async () => {
  const storage = memoryStorage();
  const slot = saveSlot(() => storage);
  const offer = rollDice(createGame(lineup), 2);
  const wind = rollDice(turnAt('harbor-road', 150), 1);
  assert.equal(wind.result.type, 'event');
  assert.equal(wind.result.amount, 60);

  for (const state of [
    { ...offer, round: 0 },
    { ...offer, round: 13.5 },
    { ...offer, round: Number.MAX_SAFE_INTEGER + 1 },
    { ...offer, startBonus: 999 },
    { ...rollDice(turnAt('wharf', 150), 3), startBonus: 0 },
    { ...wind, result: { ...wind.result, amount: 0 } },
  ]) {
    await slot.write(state, slot.read().snapshot);
    assert.equal(slot.read().status, 'invalid');
  }

  await slot.write({ ...wind, round: Number.MAX_SAFE_INTEGER }, slot.read().snapshot);
  assert.equal(slot.read().status, 'ready');
});

test('a save rejects player references outside its lineup', async () => {
  const storage = memoryStorage();
  const slot = saveSlot(() => storage);
  const pair = createGame(lineup.slice(0, 2));
  const rent = rollDice({ ...pair, owners: { lighthouse: 2 } }, 1);
  const cases = [
    ['deed owner absent from the lineup', { ...pair, owners: { salt: 3 } }],
    ['active player absent from the lineup', { ...pair, activePlayerIndex: 2 }],
    ['out-of-range player ID', { ...pair, players: [pair.players[0], { ...pair.players[1], id: 3 }] }],
    ['duplicate player ID', { ...pair, players: [pair.players[0], { ...pair.players[1], id: 1 }] }],
    ['rent recipient absent from the lineup', {
      ...rent, owners: { lighthouse: 3 }, result: { ...rent.result, ownerId: 3 },
    }],
  ];

  for (const [reason, state] of cases) {
    assert.equal((await slot.write(state, slot.read().snapshot)).status, 'saved');
    assert.equal(slot.read().status, 'invalid', reason);
  }
});

test('an existing version 1 four-player save resumes the fourth player and advances to round 13', async () => {
  const storage = memoryStorage();
  const state = {
    mapId: 'harbor', mapVersion: 1,
    players: [
      { id: 1, name: '玩家 1', characterId: 'captain', cash: 600, locationId: 'lighthouse' },
      { id: 2, name: '玩家 2', characterId: 'florist', cash: 600, locationId: 'fish' },
      { id: 3, name: '玩家 3', characterId: 'courier', cash: 600, locationId: 'flower' },
      { id: 4, name: '玩家 4', characterId: 'auntie', cash: 400, locationId: 'salt' },
    ],
    owners: { salt: 4 }, round: 12, activePlayerIndex: 3, phase: 'result',
    die: 2, lastMove: ['lighthouse', 'salt'], startBonus: 0,
    result: { type: 'bought', locationId: 'salt', amount: 200 },
  };
  storage.setItem('harbor-board-game', JSON.stringify({ version: 1, revision: '1-2-3-4', state }));

  const slot = saveSlot(() => storage);
  const resumed = slot.read();
  assert.equal(resumed.status, 'ready');
  assert.deepEqual(resumed.state, state);
  const handedOff = endTurn(resumed.state);
  assert.equal(handedOff.round, 13);
  assert.equal(handedOff.activePlayerIndex, 0);
  assert.equal((await slot.write(handedOff, resumed.snapshot)).status, 'saved');
  assert.deepEqual(saveSlot(() => storage).read().state, handedOff);
});

test('reopening after a roll restores the same die, landing, and purchase decision', async () => {
  const storage = memoryStorage();
  const open = () => saveSlot(() => storage);
  assert.equal(open().read().status, 'empty');
  const landed = rollDice(createGame(lineup), 6);
  assert.equal((await open().write(landed, null)).status, 'saved');

  const resumed = open().read();
  assert.equal(resumed.status, 'ready');
  assert.equal(resumed.state.die, 6);
  assert.equal(resumed.state.players[0].locationId, 'ferry');
  assert.equal(resumed.state.phase, 'purchase');
  assert.deepEqual(resumed.state.players.map((player) => player.characterId), lineup);
});

test('an untrusted player name cannot reach the game UI through a save', async () => {
  const storage = memoryStorage();
  const slot = saveSlot(() => storage);
  const state = createGame(lineup);
  state.players[0].name = '<img src=x onerror=alert(1)>';
  assert.equal((await slot.write(state, null)).status, 'saved');

  assert.equal(slot.read().status, 'invalid');
});

test('an unsuccessful write retains the last snapshot and a later retry saves the latest turn', async () => {
  const storage = memoryStorage();
  const slot = saveSlot(() => storage);
  const original = createGame(lineup);
  const { snapshot } = await slot.write(original, null);
  const latest = endTurn(skipPurchase(rollDice(original, 6)));
  const persist = storage.setItem;
  storage.setItem = () => { throw new DOMException('Storage limit', 'QuotaExceededError'); };

  assert.equal((await slot.write(latest, snapshot)).status, 'blocked');
  assert.equal(slot.read().state.activePlayerIndex, 0);

  storage.setItem = persist;
  assert.equal((await slot.write(latest, snapshot)).status, 'saved');
  const resumed = slot.read().state;
  assert.equal(resumed.activePlayerIndex, 1);
  assert.equal(resumed.phase, 'roll');
  assert.equal(resumed.players[0].locationId, 'ferry');
});

test('reopening selects the original map version and preserves the save when it is unavailable', async () => {
  const storage = memoryStorage();
  const newer = { ...HARBOR, version: HARBOR.version + 1 };
  const slot = saveSlot(() => storage, [newer, HARBOR]);
  assert.equal((await slot.write(createGame(lineup, HARBOR), null)).status, 'saved');
  assert.equal(slot.read().map, HARBOR);
  assert.equal(saveSlot(() => storage, [newer]).read().status, 'missing-map');
  assert.equal(slot.read().map, HARBOR);
});

test('a denied storage getter is recoverable and distinct from an empty slot', async () => {
  const storage = memoryStorage();
  let denied = true;
  const slot = saveSlot(() => {
    if (denied) throw new DOMException('Access denied', 'SecurityError');
    return storage;
  });
  assert.equal(slot.read().status, 'unreadable');
  assert.equal((await slot.write(createGame(lineup), null)).status, 'blocked');
  denied = false;
  assert.equal(slot.read().status, 'empty');
});

test('a malformed or unsupported save stays in the slot until replaced', () => {
  const storage = memoryStorage();
  const slot = saveSlot(() => storage);
  for (const [value, status] of [['{', 'invalid'], ['{"version":2}', 'unsupported']]) {
    storage.setItem('harbor-board-game', value);
    assert.equal(slot.read().status, status);
    assert.equal(storage.getItem('harbor-board-game'), value);
  }
});

function turnAt(locationId, cash) {
  const game = createGame(lineup);
  game.players[0] = { ...game.players[0], locationId, cash };
  return game;
}

function persistAcrossReopens() {
  const storage = memoryStorage();
  return {
    async write(state) {
      const slot = saveSlot(() => storage);
      assert.equal((await slot.write(state, slot.read().snapshot)).status, 'saved');
    },
    reopen() {
      const saved = saveSlot(() => storage).read();
      assert.equal(saved.status, 'ready');
      return saved.state;
    },
  };
}

test('a reopened purchase keeps the start bonus and can be bought or skipped', async () => {
  const save = persistAcrossReopens();
  await save.write(rollDice(turnAt('wharf', 150), 3));

  const offer = save.reopen();
  assert.equal(offer.phase, 'purchase');
  assert.equal(offer.die, 3);
  assert.equal(offer.players[0].locationId, 'salt');
  assert.equal(offer.players[0].cash, 250);
  assert.equal(offer.startBonus, 100);
  assert.deepEqual(offer.owners, {});

  const skipped = skipPurchase(offer);
  assert.deepEqual(skipped.result, { type: 'skipped', locationId: 'salt' });
  assert.equal(skipped.players[0].cash, 250);
  assert.deepEqual(skipped.owners, {});
  assert.equal(endTurn(skipped).activePlayerIndex, 1);

  await save.write(buyProperty(save.reopen()));
  for (let opening = 0; opening < 2; opening += 1) {
    const committed = save.reopen();
    assert.equal(committed.phase, 'result');
    assert.deepEqual(committed.result, { type: 'bought', locationId: 'salt', amount: 200 });
    assert.equal(committed.players[committed.activePlayerIndex].id, 1);
    assert.equal(committed.players[0].cash, 50);
    assert.deepEqual(committed.owners, { salt: 1 });
    assert.equal(buyProperty(committed), committed);
  }

  await save.write(endTurn(save.reopen()));
  const handedOff = save.reopen();
  assert.equal(handedOff.phase, 'roll');
  assert.equal(handedOff.activePlayerIndex, 1);
  assert.equal(handedOff.players[0].cash, 50);
  assert.deepEqual(handedOff.owners, { salt: 1 });
});

test('reopening settled rent preserves the original payer, recipient and transfer', async () => {
  const save = persistAcrossReopens();
  const game = { ...turnAt('salt', 20), owners: { flower: 2 } };
  await save.write(rollDice(game, 1));

  for (let opening = 0; opening < 2; opening += 1) {
    const committed = save.reopen();
    assert.equal(committed.phase, 'result');
    assert.equal(committed.players[committed.activePlayerIndex].id, 1);
    assert.deepEqual(committed.result, { type: 'rent', locationId: 'flower', ownerId: 2, amount: 20, due: 90 });
    assert.deepEqual(committed.players.map(({ cash }) => cash), [0, 620, 600, 600]);
    assert.deepEqual(committed.owners, { flower: 2 });
    assert.equal(rollDice(committed, 1), committed);
  }

  const handedOff = endTurn(save.reopen());
  assert.equal(handedOff.activePlayerIndex, 1);
  assert.deepEqual(handedOff.players.map(({ cash }) => cash), [0, 620, 600, 600]);
});

test('reopening a settled event preserves the original cost and caps the payment once', async () => {
  const save = persistAcrossReopens();
  await save.write(rollDice(turnAt('ferry', 20), 1));

  for (let opening = 0; opening < 2; opening += 1) {
    const committed = save.reopen();
    assert.equal(committed.phase, 'result');
    assert.deepEqual(committed.result, { type: 'event', locationId: 'tide', amount: -20, delta: -40 });
    assert.equal(committed.players[0].cash, 0);
    assert.equal(rollDice(committed, 1), committed);
  }

  const handedOff = endTurn(save.reopen());
  assert.equal(handedOff.activePlayerIndex, 1);
  assert.equal(handedOff.players[0].cash, 0);
});
