import { getCharacter } from './characters.js';
import { HARBOR, getLocation } from './map.js';

export const MAX_PLAYERS = 4;

export function getStartBonus(map, path) {
  return path.reduce((bonus, id) => bonus + (getLocation(map, id).startBonus ?? 0), 0);
}

export function createGame(characterIds, map = HARBOR) {
  if (!Array.isArray(characterIds) || characterIds.length < 1 || characterIds.length > MAX_PLAYERS ||
    new Set(characterIds).size !== characterIds.length || !Array.from(characterIds).every(getCharacter)) {
    throw new RangeError(`請為 1–${MAX_PLAYERS} 位玩家各選一名不同的角色。`);
  }

  const players = characterIds.map((characterId, index) => ({
    id: index + 1,
    name: `玩家 ${index + 1}`,
    characterId,
    cash: 600,
    locationId: map.startId,
  }));

  return {
    mapId: map.id,
    mapVersion: map.version,
    players,
    owners: {},
    round: 1,
    activePlayerIndex: 0,
    phase: 'roll',
    die: null,
    lastMove: [],
    startBonus: 0,
    result: null,
  };
}

export function rollDice(state, die, map = HARBOR) {
  if (state.phase !== 'roll') return state;
  if (!Number.isInteger(die) || die < 1 || die > 6) throw new RangeError('骰點必須在 1 到 6 之間。');

  const player = state.players[state.activePlayerIndex];
  let location = getLocation(map, player.locationId);
  const lastMove = [];

  for (let step = 0; step < die; step += 1) {
    location = getLocation(map, location.exits[0]);
    lastMove.push(location.id);
  }

  const startBonus = getStartBonus(map, lastMove);
  const players = state.players.slice();
  const landed = { ...player, cash: player.cash + startBonus, locationId: location.id };
  players[state.activePlayerIndex] = landed;

  let result = { type: 'arrival', locationId: location.id };
  if (location.type === 'property' && Object.hasOwn(state.owners, location.id)) {
    const ownerId = state.owners[location.id];
    if (ownerId === player.id) {
      result = { type: 'owned', locationId: location.id };
    } else {
      const ownerIndex = players.findIndex(({ id }) => id === ownerId);
      const owner = players[ownerIndex];
      const amount = Math.min(landed.cash, location.rent);
      landed.cash -= amount;
      players[ownerIndex] = { ...owner, cash: owner.cash + amount };
      result = { type: 'rent', locationId: location.id, ownerId, amount, due: location.rent };
    }
  } else if (location.type === 'property') {
    result = null;
  } else if (location.type === 'event') {
    const delta = location.eventCash;
    const cash = Math.max(0, landed.cash + delta);
    result = { type: 'event', locationId: location.id, amount: cash - landed.cash, delta };
    landed.cash = cash;
  }

  return {
    ...state,
    players,
    die,
    lastMove,
    startBonus,
    phase: result ? 'result' : 'purchase',
    result,
  };
}

export function buyProperty(state, map = HARBOR) {
  if (state.phase !== 'purchase') return state;
  const player = state.players[state.activePlayerIndex];
  const location = getLocation(map, player.locationId);
  if (location.type !== 'property' || Object.hasOwn(state.owners, location.id) || player.cash < location.price) {
    return state;
  }

  const players = state.players.slice();
  players[state.activePlayerIndex] = { ...player, cash: player.cash - location.price };
  return {
    ...state,
    players,
    owners: { ...state.owners, [location.id]: player.id },
    phase: 'result',
    result: { type: 'bought', locationId: location.id, amount: location.price },
  };
}

export function skipPurchase(state) {
  if (state.phase !== 'purchase') return state;
  return {
    ...state,
    phase: 'result',
    result: { type: 'skipped', locationId: state.players[state.activePlayerIndex].locationId },
  };
}

export function rankPlayers(state, map = HARBOR) {
  const propertyValues = new Map(state.players.map(({ id }) => [id, 0]));
  for (const [locationId, owner] of Object.entries(state.owners)) {
    propertyValues.set(owner, propertyValues.get(owner) + getLocation(map, locationId).price);
  }
  return state.players.map(({ id: playerId, cash }) => {
    const propertyValue = propertyValues.get(playerId);
    return { playerId, cash, propertyValue, total: cash + propertyValue };
  }).sort((a, b) => b.total - a.total || a.playerId - b.playerId)
    .map((row, _, rows) => ({
      ...row,
      rank: rows.findIndex(({ total }) => total === row.total) + 1,
    }));
}

export function finishGame(state, map = HARBOR) {
  if (state.phase !== 'result') return state;
  return { ...state, phase: 'finished', standings: rankPlayers(state, map) };
}

export function endTurn(state) {
  if (state.phase !== 'result') return state;
  const activePlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
  return {
    ...state,
    activePlayerIndex,
    // Keep handoffs playable even when the saved round counter cannot safely grow.
    round: Math.min(Number.MAX_SAFE_INTEGER, state.round + (activePlayerIndex === 0 ? 1 : 0)),
    phase: 'roll',
    die: null,
    lastMove: [],
    startBonus: 0,
    result: null,
  };
}
