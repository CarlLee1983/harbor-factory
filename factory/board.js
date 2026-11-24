import { mountDeed } from '../src/board-deed.js';
import { getCharacter } from '../src/characters.js';
import { factoryScene, locationArt, workerArt } from './art.js';
import './board.css';

const WIDTH = 980;
const HEIGHT = 610;
const STEP_MS = 105;
const LAND_MS = 125;
const SLOTS = [
  [[0, 0]],
  [[-15, 0], [15, 0]],
  [[-15, -13], [15, -13], [0, 13]],
  [[-15, -13], [15, -13], [-15, 13], [15, 13]],
];

function routePoint({ x, z }) {
  return { x: 117 + x * 74.6, y: 90 + z * 43 };
}

function position(element, { x, y }) {
  element.style.left = `${x / WIDTH * 100}%`;
  element.style.top = `${y / HEIGHT * 100}%`;
}

function tilePoint(location) {
  const { x, z } = location;
  const end = z === 0 || z === 10;
  const point = routePoint(location);
  if (x === 0 || x === 10) point.x = x === 0 ? (end ? 81 : 55) : (end ? 899 : 925);
  if (end) point.y = z === 0 ? 42 : 568;
  return point;
}

function makeImage(source) {
  const image = document.createElement('img');
  image.src = source;
  image.alt = '';
  image.draggable = false;
  return image;
}

function makeTile(location) {
  const { id, name, type, x, z, price } = location;
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'factory-tile';
  tile.dataset.location = id;
  tile.dataset.type = type;
  tile.dataset.edge = z === 0 || z === 10 ? (x === 0 || x === 10 ? 'corner' : 'end') : 'side';
  if (tile.dataset.edge === 'side') tile.dataset.side = x === 0 ? 'west' : 'east';
  tile.setAttribute('aria-pressed', 'false');
  if (type === 'property') tile.dataset.price = String(price);
  position(tile, tilePoint(location));

  const art = makeImage(locationArt(id));
  const label = document.createElement('span');
  label.className = 'factory-tile-label';
  const title = document.createElement('strong');
  title.textContent = name;
  const detail = document.createElement('span');
  detail.className = 'factory-tile-detail';
  detail.textContent = type === 'property' ? String(price) : type === 'start' ? '起點' : '事件';
  const owner = document.createElement('span');
  owner.className = 'factory-owner';
  owner.setAttribute('aria-hidden', 'true');
  owner.hidden = true;
  label.append(title, detail);
  tile.append(art, label, owner);
  return { location, tile, detail, owner };
}

function makePawn(player) {
  const character = getCharacter(player.characterId);
  const pawn = document.createElement('div');
  pawn.className = 'factory-pawn';
  pawn.dataset.seat = String(player.id);
  pawn.setAttribute('role', 'img');
  pawn.style.setProperty('--seat-color', character.color);
  const badge = document.createElement('span');
  badge.textContent = String(player.id);
  pawn.append(makeImage(workerArt(player.characterId)), badge);
  return pawn;
}

export function mountBoard(container, map, { deedContainer, onDeedSelection }) {
  const floor = document.createElement('div');
  floor.className = 'factory-floor';
  floor.dataset.renderer = 'pixel';
  const scene = makeImage(factoryScene);
  scene.className = 'factory-scene';
  const conveyor = document.createElement('div');
  conveyor.className = 'factory-conveyor';
  conveyor.setAttribute('aria-hidden', 'true');
  for (const edge of ['north', 'east', 'south', 'west']) {
    const rail = document.createElement('span');
    rail.className = `factory-rail factory-rail-${edge}`;
    conveyor.append(rail);
  }
  const tiles = new Map(map.locations.map(location => [location.id, makeTile(location)]));
  const layer = document.createElement('div');
  layer.className = 'factory-pawns';
  floor.append(scene, conveyor, ...Array.from(tiles.values(), ({ tile }) => tile), layer);
  container.classList.add('factory-board');
  container.append(floor);

  const events = new AbortController();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let current;
  let lineup;
  let pawns = [];
  let moving;
  const deed = mountDeed(deedContainer, map, location => {
    drawSelection();
    onDeedSelection(location);
  });

  function ownerAt(id) {
    const ownerId = current?.owners[id];
    return current?.players.find(player => player.id === ownerId);
  }

  function drawSelection() {
    for (const { location, tile } of tiles.values()) {
      tile.setAttribute('aria-pressed', String(location === deed.location));
    }
    deed.render(deed.location && ownerAt(deed.location.id));
  }

  function drawTiles() {
    const target = current.players[current.activePlayerIndex].locationId;
    for (const { location, tile, detail, owner } of tiles.values()) {
      const holder = ownerAt(location.id);
      const purchasable = !moving && current.phase === 'purchase' && location.id === target;
      tile.toggleAttribute('data-purchasable', purchasable);
      owner.hidden = !holder;
      if (holder) {
        const character = getCharacter(holder.characterId);
        owner.textContent = String(holder.id);
        owner.style.setProperty('--seat-color', character.color);
      }
      if (location.type === 'property') {
        detail.textContent = purchasable ? `可買 ${location.price}` : String(location.price);
      }
      const tileType = location.type === 'property'
        ? `地價 ${location.price} 元，${holder ? holder.name : purchasable ? '可購買' : '無主地'}`
        : detail.textContent;
      tile.setAttribute('aria-label', `${location.name}，${tileType}`);
    }
    drawSelection();
  }

  floor.addEventListener('click', ({ target }) => {
    const tile = target.closest('.factory-tile');
    if (tile) deed.select(tiles.get(tile.dataset.location).location);
    else if (deed.location) deed.select(undefined);
  }, { signal: events.signal });

  function playerPoint(state, player) {
    const peers = state.players.filter(peer => peer.locationId === player.locationId);
    const [side, depth] = SLOTS[peers.length - 1][peers.indexOf(player)];
    const { x, y } = routePoint(tiles.get(player.locationId).location);
    return { x: x + side, y: y + depth };
  }

  function finishMotion() {
    if (!moving) return;
    const { frame, landing, pawn, points, followPawn, resolve } = moving;
    cancelAnimationFrame(frame);
    pawn.removeAttribute('data-moving');
    landing.removeAttribute('data-landing');
    position(pawn, points.at(-1));
    moving = undefined;
    drawTiles();
    if (!events.signal.aborted) followPawn?.();
    resolve();
  }

  function render(next, { animate = false, followPawn } = {}) {
    if (events.signal.aborted) return;
    finishMotion();
    const previous = current;
    current = next;
    const key = next.players.map(({ id, characterId }) => `${id}:${characterId}`).join('/');
    const canMove = lineup === key && previous.phase === 'roll' && next.phase !== 'roll'
      && animate && next.lastMove.length && !reduced.matches;
    if (lineup !== key) {
      pawns = next.players.map(makePawn);
      layer.replaceChildren(...pawns);
      lineup = key;
    }
    const activePawn = pawns[next.activePlayerIndex];
    for (const [index, player] of next.players.entries()) {
      const pawn = pawns[index];
      const active = pawn === activePawn;
      const { location } = tiles.get(player.locationId);
      pawn.toggleAttribute('data-active', active);
      pawn.setAttribute('aria-label', `${active ? '本回合，' : ''}${player.name}，${getCharacter(player.characterId).name}，${location.name}`);
      if (!active || !canMove) position(pawn, playerPoint(next, player));
    }
    if (!canMove) {
      drawTiles();
      followPawn?.();
      return;
    }

    const player = next.players[next.activePlayerIndex];
    const points = [
      playerPoint(previous, previous.players[next.activePlayerIndex]),
      ...next.lastMove.slice(0, -1).map(id => routePoint(tiles.get(id).location)),
      playerPoint(next, player),
    ];
    const landing = tiles.get(player.locationId).tile;
    const travel = (points.length - 1) * STEP_MS;
    let start;
    return new Promise(resolve => {
      moving = { frame: requestAnimationFrame(advance), landing, pawn: activePawn, points, followPawn, resolve };
      activePawn.setAttribute('data-moving', '');
      drawTiles();
      followPawn?.();

      function advance(time) {
        start ??= time;
        const elapsed = time - start;
        if (reduced.matches || elapsed >= travel + LAND_MS) {
          finishMotion();
          return;
        }
        if (elapsed < travel) {
          const step = Math.floor(elapsed / STEP_MS);
          const progress = (elapsed % STEP_MS) / STEP_MS;
          const from = points[step];
          const to = points[step + 1];
          position(activePawn, {
            x: from.x + (to.x - from.x) * progress,
            y: from.y + (to.y - from.y) * progress - Math.sin(progress * Math.PI) * 6,
          });
        } else {
          position(activePawn, points.at(-1));
          landing.setAttribute('data-landing', '');
        }
        followPawn?.();
        moving.frame = requestAnimationFrame(advance);
      }
    });
  }

  return {
    render,
    activePawnBounds() {
      const pawn = pawns[current?.activePlayerIndex];
      if (!pawn) return;
      const bounds = pawn.getBoundingClientRect();
      const badge = pawn.lastElementChild.getBoundingClientRect();
      return {
        left: Math.min(bounds.left, badge.left),
        top: Math.min(bounds.top, badge.top),
        right: Math.max(bounds.right, badge.right),
        bottom: Math.max(bounds.bottom, badge.bottom),
      };
    },
    destroy() {
      if (events.signal.aborted) return;
      events.abort();
      finishMotion();
      deed.destroy();
      floor.remove();
      container.classList.remove('factory-board');
      pawns = [];
    },
  };
}
