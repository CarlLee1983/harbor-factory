import Phaser from 'phaser';
import { CHARACTERS, getCharacter } from './characters.js';
import { getLocation } from './map.js';
import { paintHarbor } from './harbor-art.js';
import { placeSource } from './place-art.js';
import { pawnSource } from './portraits.js';
import './board-art.css';

const WIDTH = 980;
const HEIGHT = 610;
const INK = 0x173d3c;
const TILE_ACCENTS = [0xb56c51, 0x77946c, 0x648998, 0xd29b5d];
const TILE_HEIGHT = 4;
const TILE_RADIUS = .475;
const BADGE = { x: 14, y: -25, radius: 11 };
// Reserve the lower center of each tile for its owner badge, including around the active pawn.
const PAWN_OFFSETS = [
  [[0, -8]],
  [[-22, 0], [22, 0]],
  [[-22, -17], [22, -17], [-22, 19]],
  [[-22, -17], [22, -17], [-22, 19], [22, 19]],
];

function project(x, z, height = 0) {
  return { x: 490 + (x - z) * 41, y: 294 + (x + z - 10) * 21 - height };
}

function tileAt(tiles, x, y) {
  const caption = tiles.findLast(({ label }) => label.getBounds().contains(x, y));
  if (caption) return caption.location;

  // Landmark images share a depth. The last one drawn is topmost where opaque pixels overlap.
  const landmark = tiles.findLast(({ art }) => {
    const bounds = art.getBounds();
    if (!bounds.contains(x, y)) return false;
    const texelX = Math.floor((x - bounds.x) / art.scaleX);
    const texelY = Math.floor((y - bounds.y) / art.scaleY);
    return art.scene.textures.getPixelAlpha(texelX, texelY, art.texture.key) > 0;
  });
  if (landmark) return landmark.location;

  return tiles.find(({ location }) => {
    const center = project(location.x, location.z, TILE_HEIGHT);
    // Adjacent diamonds meet halfway between their centers, including the thin tile seams.
    return Math.abs(x - center.x) / 41 + Math.abs(y - center.y) / 21 <= 1;
  })?.location;
}

function polygon(graphics, points, color, alpha = 1) {
  graphics.fillStyle(color, alpha);
  graphics.fillPoints(points, true);
}

function block(graphics, x, z, halfWidth, halfDepth, height, top, right, front, base = 0) {
  const corners = [[-halfWidth, -halfDepth], [halfWidth, -halfDepth], [halfWidth, halfDepth], [-halfWidth, halfDepth]];
  const floor = corners.map(([dx, dz]) => project(x + dx, z + dz, base));
  const roof = corners.map(([dx, dz]) => project(x + dx, z + dz, base + height));
  const faces = [[floor[1], floor[2], roof[2], roof[1]], [floor[2], floor[3], roof[3], roof[2]], roof];
  for (const [index, color] of [right, front, top].entries()) polygon(graphics, faces[index], color);
  return { faces, foreground: floor[2].y };
}

function makeWarehouse(scene, labels) {
  const graphics = scene.add.graphics();
  const x = 4.72;
  const z = .72;
  const { faces, foreground } = block(graphics, x, z, .75, .65, 54, 0xb76a52, 0x955a49, 0xa56752);
  const roof = (left, width, upper, lower) => [
    project(x + left, z - .69, lower), project(x + width, z - .69, lower),
    project(x + width, z, upper), project(x + left, z, upper),
  ];
  const highRoof = roof(-.77, .77, 76, 54);
  const lowRoof = [
    project(x - .77, z, 76), project(x + .77, z, 76),
    project(x + .77, z + .69, 54), project(x - .77, z + .69, 54),
  ];
  const gable = [project(x + .75, z - .65, 54), project(x + .75, z + .65, 54), project(x + .75, z, 76)];
  polygon(graphics, gable, 0x955a49);
  polygon(graphics, highRoof, 0xc96d52);
  polygon(graphics, lowRoof, 0xa34e44);
  const markRoof = (start, end, width, color) => {
    graphics.lineStyle(width, color, .74).lineBetween(start.x, start.y, end.x, end.y);
  };
  for (let ridge = -.61; ridge < .62; ridge += .153) {
    const peak = project(x + ridge, z, 76);
    markRoof(project(x + ridge, z - .69, 54), peak, .8, 0xe89269);
    markRoof(peak, project(x + ridge, z + .69, 54), 1, 0x7b3d3b);
  }
  markRoof(highRoof[2], highRoof[3], 2, 0xed9c70);
  markRoof(lowRoof[2], lowRoof[3], 2, 0xc27a57);
  const wall = (left, right, low, high, color) => polygon(graphics, [
    project(x + left, z + .65, low), project(x + right, z + .65, low),
    project(x + right, z + .65, high), project(x + left, z + .65, high),
  ], color);
  for (const bottom of [14, 34]) {
    for (const left of [-.52, -.15, .22]) {
      wall(left, left + .25, bottom, bottom + 13, 0x62433e);
      wall(left + .028, left + .222, bottom + 1.5, bottom + 11, 0xffc76f);
      wall(left + .11, left + .135, bottom + 1.5, bottom + 11, 0x8a624b);
    }
  }
  wall(-.67, .66, 48, 51, 0xce8865);
  wall(-.16, .18, 0, 13, 0x6a5042);
  graphics.setDepth(foreground);
  const triangle = (a, b, c) => new Phaser.Geom.Triangle(a.x, a.y, b.x, b.y, c.x, c.y);
  const triangles = [...faces, highRoof, lowRoof].flatMap(([a, b, c, d]) => [
    triangle(a, b, c), triangle(a, c, d),
  ]);
  triangles.push(triangle(...gable));
  const labelBackings = scene.add.graphics().setDepth(.7);
  for (const label of labels) {
    const area = Phaser.Geom.Rectangle.Inflate(label.getBounds(), 2, 1);
    if (!triangles.some((face) => Phaser.Geom.Intersects.RectangleToTriangle(area, face))) continue;
    labelBackings.fillStyle(0xffedce, .96).fillRoundedRect(area.x, area.y, area.width, area.height, 3);
  }
  return {
    update(pieces) {
      const coversPawn = pieces.some(({ piece, silhouette }) => piece.visible && piece.depth < foreground
        && triangles.some((triangle) => Phaser.Geom.Intersects.RectangleToTriangle(silhouette, triangle)));
      // When the entire building is opaque, keep tile labels and deed markers readable above it.
      graphics.setAlpha(coversPawn ? .22 : 1).setDepth(coversPawn ? foreground : .5);
    },
  };
}

function makeOwnerMarker(scene, point) {
  const badge = scene.add.circle(point.x, point.y + 13, 9)
    .setStrokeStyle(1, 0xfff7e4).setDepth(.75).setVisible(false);
  const seat = scene.add.text(point.x, point.y + 13, '', {
    fontFamily: 'system-ui, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#fff7e4', resolution: 2,
  }).setOrigin(.5).setDepth(.75).setVisible(false);
  seat.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return (owner) => {
    badge.setVisible(Boolean(owner));
    seat.setVisible(Boolean(owner));
    if (owner) {
      const color = Phaser.Display.Color.HexStringToColor(getCharacter(owner.characterId).color).color;
      badge.setFillStyle(color);
      seat.setText(String(owner.id));
    }
  };
}

function makeBoard(scene, map, pixelRatio) {
  const harbor = scene.textures.createCanvas('diorama-harbor', WIDTH * pixelRatio, HEIGHT * pixelRatio);
  const pen = harbor.getContext();
  pen.scale(pixelRatio, pixelRatio);
  paintHarbor(pen, project);
  harbor.refresh();
  scene.add.image(0, 0, 'diorama-harbor').setOrigin(0).setDisplaySize(WIDTH, HEIGHT).setDepth(-2);

  const graphics = scene.add.graphics();
  const ownerMarkers = new Map();
  const tiles = [];
  for (const [index, location] of map.locations.entries()) {
    const { x, z, type } = location;
    const corner = index % 10 === 0;
    const color = type === 'start' ? 0x286557
      : type === 'event' ? 0xa9d7c4 : corner ? 0xf0cb93 : 0xe9d7b1;
    const accent = type === 'start' ? 0xffda82
      : type === 'event' ? 0x55998b : TILE_ACCENTS[Math.floor(index / 10)];
    const { faces } = block(graphics, x, z, TILE_RADIUS, TILE_RADIUS, TILE_HEIGHT, color, 0x98776b, 0xa98367);

    graphics.lineStyle(1.6, 0x563e32, .22).strokePoints(faces[2], true);
    graphics.lineStyle(.8, 0xfff4d7, .82).strokePoints(faces[2], true);
    const bandOffset = TILE_RADIUS - 0.09;
    if (index <= 10 || index > 30) {
      const edge = z + (index <= 10 ? bandOffset : -bandOffset);
      polygon(graphics, [
        project(x - .37, edge - .04, TILE_HEIGHT), project(x + .37, edge - .04, TILE_HEIGHT),
        project(x + .37, edge + .04, TILE_HEIGHT), project(x - .37, edge + .04, TILE_HEIGHT),
      ], accent);
    } else {
      const edge = x + (index <= 20 ? bandOffset : -bandOffset);
      polygon(graphics, [
        project(edge - .04, z - .37, TILE_HEIGHT), project(edge + .04, z - .37, TILE_HEIGHT),
        project(edge + .04, z + .37, TILE_HEIGHT), project(edge - .04, z + .37, TILE_HEIGHT),
      ], accent);
    }

    const point = project(x, z, TILE_HEIGHT);
    scene.add.ellipse(point.x, point.y - 8, 26, 8, INK, .11).setDepth(.55);
    const art = scene.add.image(point.x, point.y - 5, `place-${location.id}`)
      .setOrigin(.5, 1).setDisplaySize(40, 40).setDepth(.6);
    const label = scene.add.text(point.x, point.y + 1, location.name, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: location.name.length > 3 ? '12px' : '13px',
      fontStyle: 'bold',
      color: type === 'start' ? '#fff7e4' : '#253d36',
      resolution: 2,
    }).setOrigin(0.5).setDepth(.75);
    label.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    tiles.push({ location, art, label });
    if (type === 'property') ownerMarkers.set(location.id, makeOwnerMarker(scene, point));
  }
  return { ownerMarkers, tiles };
}

function makePiece(scene, { characterId, id }) {
  const color = Phaser.Display.Color.HexStringToColor(getCharacter(characterId).color).color;
  const piece = scene.add.container(0, 0).setVisible(false);
  const glow = scene.add.ellipse(0, 0, 40, 24, 0xffd36a).setStrokeStyle(2, INK).setVisible(false);
  const shadow = scene.add.ellipse(0, 4, 31, 13, INK, 0.45);
  const base = scene.add.ellipse(0, 0, 30, 14, color).setStrokeStyle(2, 0xfff1cf);
  const figure = scene.add.image(0, 1, `pawn-${characterId}`).setOrigin(.5, 1);
  figure.setScale(Math.min(34 / figure.width, 39 / figure.height));
  const badge = scene.add.circle(BADGE.x, BADGE.y, BADGE.radius, INK).setStrokeStyle(2, 0xf8e9c7);
  const number = scene.add.text(BADGE.x, BADGE.y, String(id), {
    fontFamily: 'system-ui, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#fff7e4', resolution: 2,
  }).setOrigin(0.5);
  number.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  piece.add([shadow, glow, base, figure, badge, number]);
  return {
    piece,
    silhouette: new Phaser.Geom.Rectangle(0, 0, 42, 46),
    setActive(active) {
      glow.setVisible(active);
      badge.setFillStyle(active ? 0xffd36a : INK);
      badge.setStrokeStyle(2, active ? INK : 0xf8e9c7);
      number.setColor(active ? '#173d3c' : '#fff7e4');
    },
    place({ x, y }) {
      piece.setPosition(x, y).setDepth(y).setVisible(true);
      this.silhouette.setPosition(x - 17, y - 39);
    },
  };
}

export function mountBoard(container, map, deed) {
  const pixelRatio = window.devicePixelRatio >= 1.5 ? 2 : 1;
  let scene;
  let warehouse;
  let ownerMarkers;
  let selectionOutline;
  let pieces = [];
  let lineupKey;
  let movingTween;
  let finish;
  let painted;
  let destroyed = false;
  let state;
  let ready;
  const loaded = new Promise((resolve) => { ready = resolve; });
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: container,
    width: WIDTH * pixelRatio,
    height: HEIGHT * pixelRatio,
    transparent: true,
    banner: false,
    audio: { noAudio: true },
    input: { mouse: false, touch: false, keyboard: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: {
      preload() {
        for (const { id } of map.locations) this.load.image(`place-${id}`, placeSource(id));
        for (const { id } of CHARACTERS) this.load.image(`pawn-${id}`, pawnSource(id));
      },
      create() {
        scene = this;
        // Keep game coordinates stable as the camera maps them to the denser backing canvas.
        scene.cameras.main.setOrigin(0, 0).setZoom(pixelRatio);
        const board = makeBoard(scene, map, pixelRatio);
        game.canvas.setAttribute('aria-hidden', 'true');
        game.canvas.dataset.renderer = 'canvas';
        game.canvas.addEventListener('click', ({ clientX, clientY }) => {
          const { left, top, width, height } = game.canvas.getBoundingClientRect();
          const location = tileAt(board.tiles, (clientX - left) * WIDTH / width, (clientY - top) * HEIGHT / height);
          if (location) deed.select(location);
        });
        ownerMarkers = board.ownerMarkers;
        selectionOutline = scene.add.graphics().setDepth(1);
        warehouse = makeWarehouse(scene, board.tiles.map(({ label }) => label));
        ready();
      },
    },
  });

  function drawDeed() {
    if (!state) return;
    const selected = deed.location;
    deed.render(ownerFor(selected?.id));
    selectionOutline?.clear();
    if (selected && selectionOutline) {
      const { x, z } = selected;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const border = corners.map(([dx, dz]) => project(x + dx * TILE_RADIUS, z + dz * TILE_RADIUS, TILE_HEIGHT));
      selectionOutline.lineStyle(5, INK).strokePoints(border, true);
      selectionOutline.lineStyle(2, 0xffd36a).strokePoints(border, true);
    }
  }

  function ownerFor(locationId) {
    const ownerId = state?.owners?.[locationId];
    return state?.players.find(({ id }) => id === ownerId);
  }

  function pointFor(locationId) {
    const { x, z } = getLocation(map, locationId);
    return project(x, z, TILE_HEIGHT);
  }

  function pawnPoint(player) {
    const point = pointFor(player.locationId);
    const peers = state.players.filter(({ locationId }) => locationId === player.locationId);
    const [x, y] = PAWN_OFFSETS[peers.length - 1][peers.indexOf(player)];
    return { x: point.x + x, y: point.y + y };
  }

  function stop() {
    movingTween?.stop();
    movingTween = undefined;
    finish?.();
    finish = undefined;
  }

  return {
    updateSelection: drawDeed,
    activePawnBounds() {
      const pawn = pieces[state?.activePlayerIndex];
      if (!pawn) return;
      const { left, top, width, height } = game.canvas.getBoundingClientRect();
      const { x, y, right, bottom } = pawn.silhouette;
      return {
        left: left + x * width / WIDTH,
        right: left + right * width / WIDTH,
        top: top + y * height / HEIGHT,
        bottom: top + bottom * height / HEIGHT,
      };
    },
    async render(nextState, { animate = false, waitForPaint = false } = {}) {
      await loaded;
      if (destroyed) return;
      stop();
      state = nextState;
      drawDeed();
      for (const [locationId, drawOwner] of ownerMarkers) drawOwner(ownerFor(locationId));
      const key = state.players.map(({ characterId, id }) => `${id}:${characterId}`).join('/');
      if (key !== lineupKey) {
        for (const { piece } of pieces) piece.destroy();
        pieces = state.players.map((player) => makePiece(scene, player));
        lineupKey = key;
      }
      for (const [index, player] of state.players.entries()) {
        const pawn = pieces[index];
        const active = index === state.activePlayerIndex;
        pawn.setActive(active);
        if (!active || !animate || !state.lastMove.length || !pawn.piece.visible) pawn.place(pawnPoint(player));
      }
      warehouse.update(pieces);
      if (!animate || !state.lastMove.length) {
        if (!waitForPaint) return;
        return new Promise(resolve => {
          painted = () => {
            painted = undefined;
            resolve();
          };
          game.events.once(Phaser.Core.Events.POST_RENDER, painted);
        });
      }
      const index = state.activePlayerIndex;
      const pawn = pieces[index];
      const points = [
        { x: pawn.piece.x, y: pawn.piece.y },
        ...state.lastMove.slice(0, -1).map(pointFor),
        pawnPoint(state.players[index]),
      ];
      return new Promise((resolve) => {
        finish = resolve;
        movingTween = scene.tweens.addCounter({
          from: 0,
          to: state.lastMove.length,
          duration: state.lastMove.length * 135,
          onUpdate(tween) {
            const progress = tween.getValue();
            const step = Math.min(Math.floor(progress), state.lastMove.length - 1);
            const fraction = progress - step;
            const from = points[step];
            const to = points[step + 1];
            const hop = Math.sin(fraction * Math.PI) * 10;
            pawn.place({
              x: Phaser.Math.Linear(from.x, to.x, fraction),
              y: Phaser.Math.Linear(from.y, to.y, fraction) - hop,
            });
            warehouse.update(pieces);
          },
          onComplete() {
            pawn.place(points.at(-1));
            warehouse.update(pieces);
            movingTween = undefined;
            finish = undefined;
            resolve();
          },
        });
      });
    },
    destroy() {
      destroyed = true;
      ready();
      stop();
      if (painted) {
        game.events.off(Phaser.Core.Events.POST_RENDER, painted);
        painted();
      }
      game.destroy(true);
    },
  };
}
