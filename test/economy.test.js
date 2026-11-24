import assert from 'node:assert/strict';
import test from 'node:test';
import { buyProperty, createGame, endTurn, rollDice, skipPurchase } from '../src/game.js';
import { HARBOR } from '../src/map.js';

const lineup = ['captain', 'florist', 'courier', 'auntie'];

function turnAt(locationId, cash, owners = {}) {
  const game = createGame(lineup);
  game.players[0] = { ...game.players[0], locationId, cash };
  return { ...game, owners };
}

test('the start pays once whether a move ends there or continues through', () => {
  const game = turnAt('wharf', 150);
  const atStart = rollDice(game, 1);
  assert.equal(atStart.players[0].cash, 250);
  assert.equal(atStart.startBonus, 100);
  const pastStart = rollDice(game, 3);
  assert.equal(pastStart.players[0].cash, 250);
  assert.equal(pastStart.startBonus, 100);
  assert.equal(pastStart.players[0].locationId, 'salt');
  assert.equal(game.players[0].cash, 150);
});

test('the harbor offers thirty properties in three price tiers', () => {
  const properties = HARBOR.locations.filter(({ type }) => type === 'property');
  assert.equal(properties.length, 30);
  assert.equal(HARBOR.locations.filter(({ type }) => type === 'start').length, 1);
  assert.equal(HARBOR.locations.filter(({ type }) => type === 'event').length, 9);
  for (const [price, rent] of [[100, 30], [200, 60], [300, 90]]) {
    assert.equal(properties.filter((tile) => tile.price === price && tile.rent === rent).length, 10);
  }
});

test('a player can spend the start bonus to buy one property exactly once', () => {
  const game = turnAt('wharf', 150);
  const offer = rollDice(game, 3);
  assert.equal(offer.phase, 'purchase');
  assert.equal(offer.players[0].cash, 250);
  const bought = buyProperty(offer);
  assert.deepEqual(bought.owners, { salt: 1 });
  assert.equal(bought.players[0].cash, 50);
  assert.equal(bought.phase, 'result');
  assert.deepEqual(bought.result, { type: 'bought', locationId: 'salt', amount: 200 });
  assert.equal(buyProperty(bought), bought);
});

test('a player short of the asking price can skip and hand off without paying', () => {
  const offer = rollDice(turnAt('lighthouse', 199), 1);
  assert.equal(offer.phase, 'purchase');
  assert.equal(buyProperty(offer), offer);
  const skipped = skipPurchase(offer);
  assert.equal(skipped.players[0].cash, 199);
  assert.deepEqual(skipped.owners, {});
  assert.deepEqual(skipped.result, { type: 'skipped', locationId: 'salt' });
  assert.equal(endTurn(skipped).activePlayerIndex, 1);
});

test('rent pays the owner once, up to the cash the visitor can afford', () => {
  const rented = rollDice(turnAt('salt', 20, { flower: 2 }), 1);
  assert.equal(rented.phase, 'result');
  assert.deepEqual(rented.players.map(({ cash }) => cash), [0, 620, 600, 600]);
  assert.deepEqual(rented.result, { type: 'rent', locationId: 'flower', ownerId: 2, amount: 20, due: 90 });
  assert.equal(rollDice(rented, 1), rented);
  assert.equal(endTurn(rented).result, null);
});

test('the owner can hand off after landing on their own property without paying', () => {
  const owned = rollDice(turnAt('salt', 20, { flower: 1 }), 1);
  assert.equal(owned.phase, 'result');
  assert.deepEqual(owned.result, { type: 'owned', locationId: 'flower' });
  assert.equal(owned.players[0].cash, 20);
  assert.equal(endTurn(owned).activePlayerIndex, 1);
});

test('negative events cap the payment and preserve the original amount until handoff', () => {
  const game = turnAt('ferry', 20);
  const event = rollDice(game, 1);
  assert.equal(event.phase, 'result');
  assert.equal(event.players[0].cash, 0);
  assert.deepEqual(event.result, { type: 'event', locationId: 'tide', amount: -20, delta: -40 });
  assert.equal(rollDice(event, 1), event);
  assert.equal(endTurn(event).players.length, 4);
});

test('landing on an income event adds cash while passing an event has no effect', () => {
  const event = rollDice(turnAt('ferry', 10), 5);
  assert.equal(event.players[0].cash, 70);
  assert.deepEqual(event.result, { type: 'event', locationId: 'wind', amount: 60, delta: 60 });
});
