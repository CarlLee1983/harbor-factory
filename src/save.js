import { getCharacter } from './characters.js';
import { MAX_PLAYERS, getStartBonus, rankPlayers } from './game.js';
import { HARBOR, getLocation } from './map.js';

const SAVE_KEY = 'harbor-board-game';
const SCHEMA_VERSION = 1;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCount(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function validResult(result, location, owners, playerId) {
  if (!isRecord(result) || result.locationId !== location.id) return false;
  const owner = owners[location.id];
  switch (result.type) {
    case 'arrival':
      return location.type === 'start';
    case 'skipped':
      return location.type === 'property' && owner === undefined;
    case 'bought':
      return owner === playerId && result.amount === location.price;
    case 'owned':
      return owner === playerId;
    case 'rent':
      return owner !== undefined && result.ownerId === owner && owner !== playerId &&
        result.due === location.rent && isCount(result.amount, 0, result.due);
    case 'event':
      return location.type === 'event' && result.delta === location.eventCash &&
        isCount(result.amount, result.delta, Math.max(0, result.delta));
    default:
      return false;
  }
}

function validState(state, map) {
  const { players, round, activePlayerIndex, phase, die, lastMove, result, owners, startBonus } = state;
  if (!Array.isArray(players) || !isCount(players.length, 1, MAX_PLAYERS) ||
    !isCount(round, 1) || !isCount(activePlayerIndex, 0, players.length - 1) ||
    !Array.isArray(lastMove)) return false;
  if (!players.every((player, index) => isRecord(player) && player.id === index + 1 &&
    player.name === `玩家 ${index + 1}` && getCharacter(player.characterId) &&
    isCount(player.cash) && getLocation(map, player.locationId))) return false;
  if (new Set(players.map((player) => player.characterId)).size !== players.length) return false;
  if (!isRecord(owners) || !Object.entries(owners).every(([id, owner]) =>
    getLocation(map, id)?.type === 'property' && isCount(owner, 1, players.length))) return false;

  if (phase === 'roll') return die === null && lastMove.length === 0 && result === null && startBonus === 0;
  if (!isCount(die, 1, 6) || lastMove.length !== die) return false;
  const player = players[activePlayerIndex];
  const location = getLocation(map, player.locationId);
  if (lastMove.at(-1) !== location.id || !lastMove.every((id, index) => {
    const step = getLocation(map, id);
    return step && (index === lastMove.length - 1 || step.exits.includes(lastMove[index + 1]));
  }) || startBonus !== getStartBonus(map, lastMove)) return false;
  if (phase === 'purchase') return location.type === 'property' && owners[location.id] === undefined && result === null;
  if (!validResult(result, location, owners, player.id)) return false;
  if (phase === 'result') return true;
  return phase === 'finished' && validStandings(state, map);
}

function validStandings(state, map) {
  const { standings } = state;
  if (!Array.isArray(standings) || standings.length !== state.players.length) return false;
  return rankPlayers(state, map).every((expected, index) => {
    const row = standings[index];
    return isRecord(row) && Object.entries(expected).every(([key, value]) => row[key] === value);
  });
}

function readSnapshot(snapshot, maps) {
  if (snapshot === null) return { status: 'empty' };

  let save;
  try {
    save = JSON.parse(snapshot);
  } catch {
    return { status: 'invalid' };
  }
  if (!isRecord(save) || !isCount(save.version, 1)) return { status: 'invalid' };
  if (save.version !== SCHEMA_VERSION) return { status: 'unsupported' };

  const { state } = save;
  if (!isRecord(state) || typeof state.mapId !== 'string' || !isCount(state.mapVersion, 1)) {
    return { status: 'invalid' };
  }
  const map = maps.find(({ id, version }) => id === state.mapId && version === state.mapVersion);
  if (!map) return { status: 'missing-map' };
  if (!validState(state, map)) return { status: 'invalid' };
  return { status: 'ready', state, map };
}

function withStorageTransaction(write) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(`${SAVE_KEY}-lock`, 1);
    open.onerror = () => reject(open.error);
    open.onupgradeneeded = () => open.result.createObjectStore('slot');
    open.onsuccess = () => {
      const db = open.result;
      try {
        // A read/write transaction serializes writers on LAN HTTP without Web Locks.
        const transaction = db.transaction('slot', 'readwrite');
        const ready = transaction.objectStore('slot').get(SAVE_KEY);
        transaction.onabort = () => reject(transaction.error);
        ready.onsuccess = () => {
          try {
            resolve(write());
          } catch (error) {
            reject(error);
          }
        };
      } catch (error) {
        reject(error);
      } finally {
        db.close();
      }
    };
  });
}

export function createSaveSlot(getStorage, maps = [HARBOR], locks = globalThis.navigator?.locks) {
  return {
    read() {
      let snapshot;
      try {
        snapshot = getStorage().getItem(SAVE_KEY);
      } catch {
        return { status: 'unreadable' };
      }
      return { ...readSnapshot(snapshot, maps), snapshot };
    },
    async write(state, expected = null) {
      function commit() {
        const storage = getStorage();
        if (storage.getItem(SAVE_KEY) !== expected) return { status: 'conflict' };
        // Even identical starting lineups must have distinct snapshots.
        const revision = crypto.getRandomValues(new Uint32Array(4)).join('-');
        const snapshot = JSON.stringify({ version: SCHEMA_VERSION, revision, state });
        storage.setItem(SAVE_KEY, snapshot);
        return { status: 'saved', snapshot };
      }

      try {
        return locks ? await locks.request(SAVE_KEY, commit) : await withStorageTransaction(commit);
      } catch {
        return { status: 'blocked', snapshot: expected };
      }
    },
  };
}
