import assert from 'node:assert/strict';
import test from 'node:test';
import { buyProperty, createGame, endTurn, finishGame, rollDice } from '../src/game.js';
import { createSaveSlot } from '../src/save.js';

function storageFixture() {
  let raw = null;
  const storage = {
    getItem: () => raw,
    setItem: (_, value) => { raw = value; },
  };
  return { storage, open: () => createSaveSlot(() => storage, undefined, { request: (_, write) => write() }) };
}

function finalRent() {
  const state = createGame(['captain', 'florist', 'courier', 'auntie']);
  state.round = 12;
  state.activePlayerIndex = 3;
  state.owners = { lighthouse: 1 };
  state.players[0].cash = 530;
  state.players[3].cash = 690;
  return rollDice(state, 1);
}

test('a finished version 1 save from the former round limit keeps its standings', () => {
  const { open, storage } = storageFixture();
  const standings = [
    { playerId: 1, rank: 1, cash: 560, propertyValue: 100, total: 660 },
    { playerId: 4, rank: 1, cash: 660, propertyValue: 0, total: 660 },
    { playerId: 2, rank: 3, cash: 600, propertyValue: 0, total: 600 },
    { playerId: 3, rank: 3, cash: 600, propertyValue: 0, total: 600 },
  ];
  const state = { ...finalRent(), phase: 'finished', standings };
  storage.setItem('harbor-board-game', JSON.stringify({ version: 1, revision: '1-2-3-4', state }));

  const reopened = open().read();
  assert.equal(reopened.status, 'ready');
  assert.deepEqual(reopened.state, state);
});

const lineup = ['captain', 'florist', 'courier', 'auntie'];

for (const expectedTotals of [[600], [630, 570], [630, 600, 570], [630, 600, 600, 570]]) {
  const playerCount = expectedTotals.length;
  test(`a ${playerCount}-player game restores the final action and scores`, async () => {
    const { open } = storageFixture();
    const initial = createGame(lineup.slice(0, playerCount));
    const bought = buyProperty(rollDice(initial, 1));
    const lastTurn = playerCount === 1 ? bought : rollDice({
      ...endTurn(bought), round: 24,
    }, 1);

    const { status, snapshot } = await open().write(lastTurn);
    assert.equal(status, 'saved');
    const resumed = open().read();
    assert.equal(resumed.status, 'ready');
    assert.deepEqual(resumed.state, lastTurn);

    const finished = finishGame(resumed.state);
    assert.equal(finished.phase, 'finished');
    assert.equal((await open().write(finished, snapshot)).status, 'saved');
    const reopened = open().read();
    assert.equal(reopened.status, 'ready');
    assert.deepEqual(reopened.state, finished);
    assert.deepEqual(reopened.state.standings.map(({ total }) => total), expectedTotals);
  });
}

test('retrying a failed final write preserves the settled rent and original standings', async () => {
  const { storage, open } = storageFixture();
  const lastTurn = finalRent();
  const { snapshot } = await open().write(lastTurn, null);
  const finished = finishGame(lastTurn);
  const write = storage.setItem;
  storage.setItem = () => { throw new DOMException('Storage limit', 'QuotaExceededError'); };
  assert.equal((await open().write(finished, snapshot)).status, 'blocked');
  const resumed = open().read().state;
  assert.equal(resumed.phase, 'result');
  assert.equal(resumed.result.amount, 30);
  assert.deepEqual(finishGame(resumed), finished);

  storage.setItem = write;
  assert.equal((await open().write(finished, snapshot)).status, 'saved');
  const reopened = open().read();
  assert.equal(reopened.status, 'ready');
  assert.equal(reopened.state.phase, 'finished');
  assert.deepEqual(reopened.state.standings.map(({ rank, total }) => [rank, total]), [
    [1, 660], [1, 660], [3, 600], [3, 600],
  ]);
});

test('a completed save without a settled action or with mismatched standings is invalid', async () => {
  const { open } = storageFixture();
  const finished = finishGame(finalRent());
  const wrongRank = finished.standings.map((row, index) => index === 1 ? { ...row, rank: 2 } : row);
  for (const state of [
    { ...finished, standings: undefined },
    { ...finished, standings: wrongRank },
    { ...finished, result: null },
  ]) {
    const slot = open();
    assert.equal((await slot.write(state, slot.read().snapshot)).status, 'saved');
    assert.equal(open().read().status, 'invalid');
  }
});
