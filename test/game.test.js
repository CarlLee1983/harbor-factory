import assert from 'node:assert/strict';
import test from 'node:test';
import { HARBOR } from '../src/map.js';
import { createGame, rollDice, skipPurchase, endTurn, finishGame } from '../src/game.js';

const lineup = ['captain', 'florist', 'courier', 'auntie'];

test('four distinct players start with 600 at the same start tile', () => {
  const game = createGame(lineup);
  assert.deepEqual(game.players.map(({ characterId, cash, locationId }) => [characterId, cash, locationId]), [
    ['captain', 600, 'start'], ['florist', 600, 'start'],
    ['courier', 600, 'start'], ['auntie', 600, 'start'],
  ]);
  assert.equal(game.round, 1);
  assert.equal(game.activePlayerIndex, 0);
  assert.equal(game.phase, 'roll');
  assert.throws(() => createGame(['captain', 'captain', 'courier', 'auntie']), RangeError);
  assert.throws(() => createGame([]), RangeError);
  assert.throws(() => createGame([...lineup, 'engineer']), RangeError);
  assert.throws(() => createGame(['captain', 'florist', 'courier', 'unknown']), RangeError);
});

test('a six follows six exits once and waits for the landing decision', () => {
  const game = createGame(lineup);
  const landed = rollDice(game, 6);
  assert.equal(landed.phase, 'purchase');
  assert.equal(landed.die, 6);
  assert.deepEqual(landed.lastMove, ['lighthouse', 'salt', 'flower', 'fish', 'customs', 'ferry']);
  assert.equal(landed.players[0].locationId, 'ferry');
  assert.equal(game.players[0].locationId, 'start');
  assert.equal(rollDice(landed, 2), landed);
  assert.throws(() => rollDice(game, 0), RangeError);
});

test('the harbor route visits 40 unique locations before returning to its start', () => {
  const visited = new Set();
  let id = HARBOR.startId;
  for (let step = 0; step < 40; step += 1) {
    const tile = HARBOR.locations.find((location) => location.id === id);
    assert.equal(tile.exits.length, 1);
    visited.add(id);
    [id] = tile.exits;
  }
  assert.equal(visited.size, 40);
  assert.equal(id, HARBOR.startId);
});

test('skipping keeps the result in view until manual handoff; four handoffs advance the round', () => {
  let state = createGame(lineup);
  for (let playerIndex = 0; playerIndex < 4; playerIndex += 1) {
    const landed = rollDice(state, 2);
    assert.equal(endTurn(landed), landed);
    const done = skipPurchase(landed);
    assert.equal(done.activePlayerIndex, playerIndex);
    assert.equal(done.round, 1);
    assert.equal(done.phase, 'result');
    assert.deepEqual(done.result, { type: 'skipped', locationId: 'salt' });
    assert.equal(done.players[playerIndex].cash, 600);
    state = endTurn(done);
    assert.equal(state.phase, 'roll');
    assert.equal(state.result, null);
    assert.equal(state.activePlayerIndex, (playerIndex + 1) % 4);
  }
  assert.equal(state.round, 2);
});

for (const playerCount of [1, 2, 3, 4]) {
  test(`a ${playerCount}-player game continues past twelve rounds in selection order`, () => {
    const characters = lineup.slice(0, playerCount);
    let state = createGame(characters);
    assert.deepEqual(state.players.map(({ characterId }) => characterId), characters);

    for (let round = 1; round <= 15; round += 1) {
      for (let playerIndex = 0; playerIndex < playerCount; playerIndex += 1) {
        assert.equal(state.phase, 'roll');
        assert.equal(state.round, round);
        assert.equal(state.activePlayerIndex, playerIndex);
        const settled = skipPurchase(rollDice(state, 1));
        assert.equal(settled.phase, 'result');
        state = endTurn(settled);
      }
    }
    assert.equal(state.phase, 'roll');
    assert.equal(state.round, 16);
    assert.equal(state.activePlayerIndex, 0);
  });
}

test('the round counter remains saveable at its safe integer limit', () => {
  const game = { ...createGame(lineup.slice(0, 1)), round: Number.MAX_SAFE_INTEGER };
  const advanced = endTurn(skipPurchase(rollDice(game, 1)));
  assert.equal(advanced.phase, 'roll');
  assert.equal(advanced.round, Number.MAX_SAFE_INTEGER);
});

test('the first player may finish after resolving their very first landing', () => {
  const initial = createGame(lineup);
  assert.equal(finishGame(initial), initial);
  const offer = rollDice(initial, 1);
  assert.equal(finishGame(offer), offer);
  const settled = skipPurchase(offer);
  const finished = finishGame(settled);
  assert.equal(finished.phase, 'finished');
  assert.equal(finished.round, 1);
  assert.equal(finished.activePlayerIndex, 0);
  assert.deepEqual(finished.result, settled.result);
  assert.equal(finishGame(finished), finished);
  assert.equal(endTurn(finished), finished);
  assert.equal(rollDice(finished, 1), finished);
});

test('the final rent leaves the payer and owner tied for first at 660', () => {
  const state = {
    ...createGame(lineup),
    round: 23,
    activePlayerIndex: 3,
    owners: { lighthouse: 1, flower: 1, fish: 4 },
  };
  state.players[0].cash = 230;
  state.players[2].cash = 500;
  state.players[3].cash = 590;
  const settled = rollDice(state, 1);
  assert.equal(settled.result.amount, 30);
  assert.equal(settled.phase, 'result');
  assert.deepEqual(finishGame(settled).standings, [
    { playerId: 1, rank: 1, cash: 260, propertyValue: 400, total: 660 },
    { playerId: 4, rank: 1, cash: 560, propertyValue: 100, total: 660 },
    { playerId: 2, rank: 3, cash: 600, propertyValue: 0, total: 600 },
    { playerId: 3, rank: 4, cash: 500, propertyValue: 0, total: 500 },
  ]);
});
