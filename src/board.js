import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mountBoard as mountFallbackBoard } from './board-fallback.js';
import { getCharacter } from './characters.js';
import { getLocation } from './map.js';
import { mountDeed } from './board-deed.js';
import { buildHarbor } from './harbor-models.js';
import { createPawn } from './pawn-model.js';
import { placeSource } from './place-art.js';
import './board-3d.css';

const TILE_TOP = .20;
const TILE_SIZE = .95;
const ART_SIZE = .91;
const ACCENTS = [0xbc7458, 0x6d976d, 0x567f9c, 0xc89e5b];
const HOP_MS = 155;
const LAND_MS = 320;
// Screen-horizontal and board-depth offsets, rotated back onto the two world axes.
const PAWN_SLOTS = [
  [[0, -.08]],
  [[-.23, -.03], [.23, -.03]],
  [[-.22, -.23], [.22, -.23], [0, .23]],
  [[-.22, -.24], [.22, -.24], [-.22, .24], [.22, .24]],
];
function makeBoardBase() {
  const base = new THREE.Group();
  function section(width, height, y, color, roughness = .85) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, width, 2, .055),
      new THREE.MeshStandardMaterial({ color, roughness }));
    mesh.position.set(5, y, 5);
    mesh.receiveShadow = true;
    base.add(mesh);
  }
  section(11.24, .23, -.48, 0x284754);
  section(11.10, .13, -.325, 0x60767a);
  // Leave the center open down to water level so the harbor channel can remain below the quay.
  const paving = new THREE.MeshStandardMaterial({ color: 0x514c3b, roughness: .9 });
  const deckSides = new THREE.BoxGeometry(11.02, .25, .98);
  const deckEnds = new THREE.BoxGeometry(9.06, .25, .98);
  for (const [x, z, rotation, geometry] of [
    [5, -.02, 0, deckSides], [5, 10.02, 0, deckSides],
    [-.02, 5, Math.PI / 2, deckEnds], [10.02, 5, Math.PI / 2, deckEnds],
  ]) {
    const strip = new THREE.Mesh(geometry, paving);
    strip.position.set(x, -.125, z);
    strip.rotation.y = rotation;
    strip.receiveShadow = true;
    base.add(strip);
  }
  const wall = new RoundedBoxGeometry(.47, .14, .10, 1, .016);
  const mortar = new THREE.MeshStandardMaterial({ color: 0x607c78, roughness: .95 });
  for (const [x, z, angle] of [[5, 10.54, 0], [10.54, 5, Math.PI / 2]]) {
    const bricks = new THREE.InstancedMesh(wall, mortar, 22);
    const block = new THREE.Object3D();
    for (let i = 0; i < bricks.count; i++) {
      const along = (i - 10.5) * .5;
      block.position.set(x + Math.cos(angle) * along, -.305, z + Math.sin(angle) * along);
      block.rotation.y = angle;
      block.updateMatrix();
      bricks.setMatrixAt(i, block.matrix);
      bricks.setColorAt(i, new THREE.Color([0xffffff, 0xcbd8cc, 0xe6cda2][(i * 5 + Math.floor(i / 3)) % 3]));
    }
    base.add(bricks);
  }
  const rail = new THREE.BoxGeometry(11.08, .048, .12);
  const rim = new THREE.MeshStandardMaterial({ color: 0xdcac77, roughness: .9 });
  for (const [x, z, angle] of [[5, -.49, 0], [5, 10.49, 0], [-.49, 5, Math.PI / 2], [10.49, 5, Math.PI / 2]]) {
    const side = new THREE.Mesh(rail, rim);
    side.position.set(x, -.10, z);
    side.rotation.y = angle;
    side.receiveShadow = true;
    base.add(side);
  }
  // Paint the sheltered water and quay reflection in world space so it holds still during play.
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(54, 54), new THREE.ShaderMaterial({
    uniforms: { center: { value: new THREE.Vector2(5, 5) } },
    vertexShader: `
      varying vec2 point;
      void main() {
        point = (modelMatrix * vec4(position, 1.0)).xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec2 center;
      varying vec2 point;
      void main() {
        vec2 p = point - center;
        vec2 edge = abs(p) - vec2(5.43);
        float distanceToQuay = length(max(edge, 0.0)) + min(max(edge.x, edge.y), 0.0) - .13;
        float shore = max(distanceToQuay, 0.0);
        vec2 screen = vec2(p.x - p.y, p.x + p.y);
        float swell = sin(screen.y * 13.0 + sin(screen.x * 2.7) * 1.1)
          * sin(screen.y * 6.1 - screen.x * 1.4);
        float pools = .5 + .25 * sin(p.x * 1.3 + p.y * .37) + .25 * cos(p.y * 1.6 - p.x * .4);
        float ripples = pow(clamp(swell, 0.0, 1.0), 6.0) * (.24 + .76 * pools);
        float shallows = exp(-shore * .92);
        float foam = exp(-pow((shore - .29 + swell * .025) / .095, 2.0)) * pools;
        float contact = exp(-shore * 6.5);
        float sky = exp(-dot(p - vec2(-3.8), p - vec2(-3.8)) * .018);
        vec3 sea = mix(vec3(.013, .044, .069), vec3(.024, .149, .163), shallows);
        sea += sky * vec3(.008, .026, .028);
        sea += foam * vec3(.026, .071, .070) + ripples * vec3(.015, .031, .033);
        sea *= 1.0 - contact * .49;
        gl_FragColor = vec4(sea, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(5, -.68, 5);
  base.add(sea);
  return base;
}

function makeTileDeck(scene, map, overlay, camera, onArtReady) {
  const geometry = new RoundedBoxGeometry(TILE_SIZE, TILE_TOP, TILE_SIZE, 1, .033);
  const bandGeometry = new RoundedBoxGeometry(.78, .028, .075, 1, .014);
  const artGeometry = new THREE.PlaneGeometry(ART_SIZE, ART_SIZE);
  const loader = new THREE.TextureLoader();
  const side = new THREE.MeshStandardMaterial({ color: 0xa57a5e, roughness: .83 });
  const faces = {
    start: new THREE.MeshStandardMaterial({ color: 0x488b6e, roughness: .76 }),
    corner: new THREE.MeshStandardMaterial({ color: 0xd8af78, roughness: .77 }),
    event: new THREE.MeshStandardMaterial({ color: 0x8cb9a6, roughness: .76 }),
    property: new THREE.MeshStandardMaterial({ color: 0xe4c79f, roughness: .77 }),
  };
  const bands = [...ACCENTS, 0xf5c570, 0x4a8c7d]
    .map(color => new THREE.MeshStandardMaterial({ color, roughness: .73 }));
  return map.locations.map((location, index) => {
    const { id, name, type, x, z } = location;
    const outward = new THREE.Vector2(x === 0 ? -1 : x === 10 ? 1 : 0, z === 0 ? -1 : z === 10 ? 1 : 0).normalize();
    const top = faces[type === 'property' && index % 10 === 0 ? 'corner' : type];
    const slab = new THREE.Mesh(geometry, [side, side, top, side, side, side]);
    slab.position.set(x, TILE_TOP / 2, z);
    slab.receiveShadow = true;
    slab.userData.location = location;
    scene.add(slab);

    const band = new THREE.Mesh(bandGeometry, bands[type === 'start' ? 4
      : type === 'event' ? 5 : Math.floor(index / 10)]);
    band.position.set(x, TILE_TOP + .006, z);
    const edge = .405;
    const xEdge = x === 0 || x === 10;
    const zEdge = z === 0 || z === 10;
    if (xEdge && !zEdge) {
      band.position.x += outward.x * edge;
      band.rotation.y = Math.PI / 2;
    } else {
      band.position.z += Math.sign(outward.y) * edge;
    }
    scene.add(band);

    const source = placeSource(id);
    let art;
    if (source) {
      art = new THREE.Mesh(artGeometry, new THREE.MeshBasicMaterial({
        alphaTest: .4, toneMapped: false, transparent: true, depthWrite: false,
      }));
      art.name = name;
      art.userData.location = location;
      art.visible = false;
      art.quaternion.copy(camera.quaternion);
      art.position.set(x - outward.x * .19, TILE_TOP + .35, z - outward.y * .19);
      const texture = loader.load(source, () => {
        art.visible = true;
        onArtReady();
      });
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      art.material.map = texture;
      scene.add(art);
    }

    const anchor = document.createElement('span');
    anchor.className = 'board-tile-label';
    anchor.dataset.location = id;
    anchor.dataset.kind = type;
    const label = document.createElement('span');
    label.className = 'board-tile-caption';
    const title = document.createElement('span');
    title.className = 'board-tile-title';
    title.textContent = name;
    const owner = document.createElement('b');
    owner.className = 'board-owner';
    owner.hidden = true;
    label.append(title, owner);
    anchor.append(label);
    overlay.append(anchor);
    return { anchor, label, owner, slab, art, location, outward };
  });
}

function makePawnShadow() {
  const size = 32;
  const pixels = new Uint8Array(size * size * 4).fill(255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const radius = Math.hypot(2 * (x + .5) / size - 1, 2 * (y + .5) / size - 1);
      pixels[(y * size + x) * 4 + 3] = 255 * (1 - THREE.MathUtils.smoothstep(radius, .27, 1));
    }
  }
  const map = new THREE.DataTexture(pixels, size, size);
  map.minFilter = map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(.53, .47),
    new THREE.MeshBasicMaterial({ color: 0x242e35, map, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  return shadow;
}

function outline(color) {
  const radius = TILE_SIZE / 2 - .022;
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-radius, 0, -radius), new THREE.Vector3(radius, 0, -radius),
    new THREE.Vector3(radius, 0, radius), new THREE.Vector3(-radius, 0, radius),
  ]);
  const edge = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color }));
  const backing = new THREE.Mesh(new THREE.RingGeometry(.42, .45, 4, 1, Math.PI / 4),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .56, depthWrite: false }));
  backing.geometry.scale(1.48, 1.48, 1);
  backing.rotation.x = -Math.PI / 2;
  const group = new THREE.Group();
  group.add(edge, backing);
  group.visible = false;
  return group;
}

function disposeTree(root, retainedMaterials = []) {
  const geometries = new Set();
  const materials = new Set(retainedMaterials);
  const textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
      }
    }
    if (object.isLight || object.isInstancedMesh || object.isBatchedMesh) object.dispose();
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  root.removeFromParent();
}

function prepareOccluders(town, originalMaterials) {
  const occluders = [];
  town.updateMatrixWorld(true);
  town.traverse(group => {
    if (!group.userData.occluder) return;
    const shared = new Map();
    function instanceOf(material) {
      if (!shared.has(material)) {
        originalMaterials.add(material);
        shared.set(material, material.clone());
      }
      return shared.get(material);
    }
    group.traverse(object => {
      if (!object.material) return;
      object.material = Array.isArray(object.material)
        ? object.material.map(instanceOf) : instanceOf(object.material);
    });
    occluders.push({
      bounds: new THREE.Box3().setFromObject(group),
      materials: [...shared.values()].map(material => ({
        material, opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite,
      })),
      faded: false,
    });
  });
  return occluders;
}

function addLighting(scene) {
  const fill = new THREE.HemisphereLight(0xf0f6ff, 0x81a0af, 1.44);
  const key = new THREE.DirectionalLight(0xffe3b9, 1.84);
  key.position.set(-1, 11, 8);
  key.target.position.set(5, 0, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  Object.assign(key.shadow.camera, { near: 1, far: 25, left: -8.8, right: 8.8, top: 8.8, bottom: -8.8 });
  key.shadow.normalBias = .022;
  key.shadow.bias = -.00025;
  key.shadow.radius = 3.2;
  key.shadow.intensity = .78;
  scene.add(fill, key, key.target);
}

function mountThreeBoard(container, map, renderer, deed, onContextLost) {
  const canvas = renderer.domElement;
  canvas.dataset.renderer = 'webgl';
  canvas.setAttribute('aria-hidden', 'true');
  const overlay = document.createElement('div');
  overlay.className = 'board-projection';
  overlay.setAttribute('aria-hidden', 'true');
  container.classList.add('board-3d');
  container.append(canvas, overlay);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x244356);
  scene.add(makeBoardBase());
  const town = buildHarbor();
  scene.add(town);
  const originalMaterials = new Set();
  const occluders = prepareOccluders(town, originalMaterials);

  const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, .1, 65);
  camera.position.set(17, 12.4, 17);
  camera.lookAt(5, .28, 5);
  camera.updateMatrixWorld();
  const sight = camera.getWorldDirection(new THREE.Vector3()).negate();
  const sightRay = new THREE.Ray(new THREE.Vector3(), sight);
  const world = new THREE.Vector3();
  const pointer = new THREE.Vector2();
  const pickerRay = new THREE.Raycaster();
  const tiles = makeTileDeck(scene, map, overlay, camera, queueDraw);
  const pickable = tiles.flatMap(({ slab, art }) => art ? [slab, art] : [slab]);
  const artwork = new Set(tiles.map(tile => tile.art).filter(Boolean));
  const sampleTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const sampleScene = new THREE.Scene();
  const sampleCamera = camera.clone();
  const sampleColor = new Uint8Array(4);
  const clearColor = new THREE.Color();
  let sampleMesh;
  const selection = outline(0x6d3d2a);
  const landing = outline(0xffcf71);
  scene.add(selection, landing);
  addLighting(scene);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  let width = 0;
  let height = 0;
  let current;
  let lineupKey;
  let pieces = [];
  let motion;
  let closed = false;
  let artFrame;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointerEvents = new AbortController();

  function ownerAt(id) {
    return current?.players.find(player => player.id === current.owners[id]);
  }

  function updateSelection() {
    drawDeed();
    draw();
  }

  function drawDeed() {
    const selected = deed.location;
    deed.render(ownerAt(selected?.id));
    selection.visible = Boolean(selected);
    if (selected) selection.position.set(selected.x, TILE_TOP + .037, selected.z);
    for (const { anchor, owner, location } of tiles) {
      anchor.toggleAttribute('data-selected', location.id === selected?.id);
      const player = ownerAt(location.id);
      owner.hidden = !player;
      if (player) {
        owner.textContent = String(player.id);
        owner.style.setProperty('--seat-color', getCharacter(player.characterId).color);
      }
    }
    measureCaptions();
  }

  function project(element, x, y, z) {
    world.set(x, y, z).project(camera);
    element.style.left = `${(world.x + 1) * width / 2}px`;
    element.style.top = `${(1 - world.y) * height / 2}px`;
  }

  function measureCaptions() {
    const origin = overlay.getBoundingClientRect();
    for (const { label } of tiles) {
      label.style.removeProperty('--clear-x');
      label.style.removeProperty('--clear-y');
    }
    for (const tile of tiles) {
      const { label } = tile;
      const rect = label.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        tile.caption = undefined;
        continue;
      }
      tile.caption = {
        left: rect.left - origin.left,
        top: rect.top - origin.top,
        right: rect.right - origin.left,
        bottom: rect.bottom - origin.top,
      };
    }
  }

  function positionSeats() {
    const badgeBounds = [];
    for (const { pawn, seat, head, seatLift, seatSide } of pieces) {
      const { x, y, z } = pawn.position;
      const spread = width <= 500 && seatSide;
      const half = !motion || spread ? seat.offsetWidth / 2 + 1 : 0;
      project(seat, x, y + head + seatLift, z);
      let left = (world.x + 1) * width / 2;
      let top = (1 - world.y) * height / 2;
      if (spread) {
        // On compact boards, put the four seat numbers beside the figures.
        left = THREE.MathUtils.clamp(left + seatSide * 2 * half, half, width - half);
        top = Math.max(half, top - (seatLift > .15 ? half + 1 : 0));
        seat.style.left = `${left}px`;
        seat.style.top = `${top}px`;
      }
      if (motion) continue;
      badgeBounds.push({ left: left - half, top: top - half, right: left + half, bottom: top + half });
    }
    if (!motion) clearCaptions(badgeBounds);
  }

  function clearCaptions(badgeBounds) {
    const boxes = tiles.map(tile => tile.caption);
    function overlaps(box, other) {
      return box.left < other.right && box.right > other.left
        && box.top < other.bottom && box.bottom > other.top;
    }
    for (const [i, { label, outward, caption }] of tiles.entries()) {
      if (!caption) continue;
      let dx = 0;
      let dy = 0;
      if (badgeBounds.some(badge => overlaps(caption, badge))) {
        const side = Math.sign(outward.x - outward.y);
        const up = Math.sign(outward.x + outward.y);
        // Keep the badge attached to its pawn and move the sign directly seaward.
        for (let distance = 4; distance <= 60; distance += 4) {
          const x = distance * side;
          const y = Math.round(distance * up * (side ? .45 : 1));
          const next = { left: caption.left + x, top: caption.top + y,
            right: caption.right + x, bottom: caption.bottom + y };
          if (next.left < 0 || next.right > width || next.top < 0 || next.bottom > height) break;
          if (badgeBounds.some(badge => overlaps(next, badge))
            || boxes.some((other, j) => other && j !== i && overlaps(next, other))) continue;
          dx = x;
          dy = y;
          boxes[i] = next;
          break;
        }
      }
      label.style.setProperty('--clear-x', `${dx}px`);
      label.style.setProperty('--clear-y', `${dy}px`);
    }
  }

  function updateOcclusion() {
    for (const occluder of occluders) {
      const faded = pieces.some(({ pawn, head }) => {
        for (const y of [head * .96, head * .58]) {
          sightRay.origin.copy(pawn.position);
          sightRay.origin.y += y;
          if (sightRay.intersectsBox(occluder.bounds)) return true;
        }
        return false;
      });
      if (faded === occluder.faded) continue;
      occluder.faded = faded;
      for (const { material, opacity, transparent, depthWrite } of occluder.materials) {
        material.opacity = faded ? opacity * .18 : opacity;
        material.transparent = faded || transparent;
        material.depthWrite = !faded && depthWrite;
        material.needsUpdate = true;
      }
    }
  }

  function draw() {
    if (!width || !height || closed) return;
    updateOcclusion();
    renderer.render(scene, camera);
    positionSeats();
  }

  function queueDraw() {
    if (closed || motion || artFrame !== undefined) return;
    artFrame = requestAnimationFrame(() => {
      artFrame = undefined;
      draw();
    });
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    if (!width || !height) return;
    const scale = Math.min(window.devicePixelRatio || 1, 1.75, 1600 / width);
    renderer.setSize(Math.round(width * scale), Math.round(height * scale), false);
    const aspect = width / height;
    const vertical = Math.max(10.95, 16.65 / aspect);
    camera.left = -vertical * aspect / 2;
    camera.right = vertical * aspect / 2;
    camera.top = vertical / 2;
    camera.bottom = -vertical / 2;
    camera.updateProjectionMatrix();
    for (const { anchor, label, location, outward } of tiles) {
      const { x, z } = location;
      project(anchor, x, TILE_TOP, z);
      const centerX = world.x, centerY = world.y;
      // The rear captions sit above the artwork in open water. The front captions sit on the quay lip.
      const back = outward.x + outward.y < 0;
      const offset = back ? .92 : .52;
      world.set(x + outward.x * offset, TILE_TOP - (back ? 0 : .16), z + outward.y * offset).project(camera);
      label.style.setProperty('--out-x', `${Math.round((world.x - centerX) * width / 2)}px`);
      label.style.setProperty('--out-y', `${Math.round((centerY - world.y) * height / 2)}px`);
    }
    measureCaptions();
    draw();
  }

  function place(piece, point, lift = 0) {
    piece.pawn.position.set(point.x, TILE_TOP + lift, point.z);
    piece.base.position.set(point.x, TILE_TOP + .013, point.z);
    piece.base.material.opacity = .50 - Math.min(lift, .32);
  }

  function makePiece(player) {
    const character = getCharacter(player.characterId);
    const pawn = createPawn(character, queueDraw);
    pawn.traverse(object => {
      if (object.isGroup) object.renderOrder = 3;
      object.castShadow = false;
      // Keep figures clear above translucent scenery, with normal depth tests against opaque meshes.
      if (!object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.transparent = true;
    });
    const head = new THREE.Box3().setFromObject(pawn).max.y;
    const base = makePawnShadow();
    const aura = new THREE.Mesh(new THREE.RingGeometry(.156, .189, 36),
      new THREE.MeshBasicMaterial({ color: 0xffdb81, side: THREE.DoubleSide }));
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = .027;
    aura.visible = false;
    pawn.add(aura);
    scene.add(base, pawn);
    const seat = document.createElement('span');
    seat.className = 'board-seat';
    seat.dataset.seat = String(player.id);
    seat.style.setProperty('--seat-color', character.color);
    seat.textContent = String(player.id);
    overlay.append(seat);
    return { pawn, seat, head, base, aura, seatLift: .15 };
  }

  function clearPieces() {
    for (const { pawn, seat, base } of pieces) {
      seat.remove();
      disposeTree(pawn);
      disposeTree(base);
    }
    pieces = [];
  }

  function playerPoint(player) {
    const location = getLocation(map, player.locationId);
    const peers = current.players.filter(other => other.locationId === player.locationId);
    const [side, depth] = PAWN_SLOTS[peers.length - 1][peers.indexOf(player)];
    return { x: location.x + (side + depth) * Math.SQRT1_2, z: location.z + (depth - side) * Math.SQRT1_2 };
  }

  function finishMotion(waitFor) {
    renderer.setAnimationLoop(null);
    const pending = motion;
    motion = undefined;
    landing.visible = false;
    if (pending) {
      place(pending.piece, pending.points.at(-1));
      pending.resolve(waitFor);
    }
  }

  function render(next, { animate = false } = {}) {
    if (closed) return;
    finishMotion();
    current = next;
    const key = next.players.map(({ characterId, id }) => `${id}:${characterId}`).join('/');
    const canMove = key === lineupKey && animate && next.lastMove.length && !reduced.matches;
    if (key !== lineupKey) {
      clearPieces();
      pieces = next.players.map(makePiece);
      lineupKey = key;
    }
    for (const [i, player] of next.players.entries()) {
      const active = i === next.activePlayerIndex;
      const piece = pieces[i];
      piece.aura.visible = active;
      if (active) piece.seat.setAttribute('aria-current', 'true');
      else piece.seat.removeAttribute('aria-current');
      const peers = current.players.filter(other => other.locationId === player.locationId);
      const slot = peers.indexOf(player);
      piece.seatLift = peers.length > 2 && slot < 2 ? .33 : .15;
      piece.seatSide = peers.length === 4 ? Math.sign(PAWN_SLOTS[3][slot][0]) : 0;
      if (!active || !canMove) place(piece, playerPoint(player));
    }
    drawDeed();
    draw();
    if (!canMove) return;

    const piece = pieces[next.activePlayerIndex];
    const player = next.players[next.activePlayerIndex];
    const points = [
      { x: piece.pawn.position.x, z: piece.pawn.position.z },
      ...next.lastMove.slice(0, -1).map(id => getLocation(map, id)),
      playerPoint(player),
    ];
    const travel = (points.length - 1) * HOP_MS;
    let started;
    return new Promise(resolve => {
      motion = { piece, points, resolve };
      renderer.setAnimationLoop(time => {
        started ??= time;
        const elapsed = time - started;
        if (reduced.matches || elapsed >= travel + LAND_MS) {
          finishMotion();
        } else if (elapsed < travel) {
          const step = Math.floor(elapsed / HOP_MS);
          const fraction = elapsed / HOP_MS - step;
          const smooth = fraction * fraction * (3 - 2 * fraction);
          const from = points[step];
          const to = points[step + 1];
          place(piece, {
            x: THREE.MathUtils.lerp(from.x, to.x, smooth),
            z: THREE.MathUtils.lerp(from.z, to.z, smooth),
          }, Math.sin(fraction * Math.PI) * .32);
        } else {
          place(piece, points.at(-1));
          const destination = getLocation(map, player.locationId);
          landing.position.set(destination.x, TILE_TOP + .042, destination.z);
          landing.visible = true;
          const finish = (elapsed - travel) / LAND_MS;
          landing.scale.setScalar(.72 + finish * .32);
          landing.children[1].material.opacity = (1 - finish) * .68;
        }
        draw();
      });
    });
  }

  function sampleArt(art, x, y) {
    // Keep the full canvas projection and its texture derivatives at the sampled pixel.
    sampleCamera.copy(camera);
    sampleCamera.setViewOffset(canvas.width, canvas.height, x, y, 1, 1);
    if (!sampleMesh) {
      sampleMesh = new THREE.Mesh(art.geometry, art.material);
      sampleMesh.matrixAutoUpdate = false;
      sampleScene.add(sampleMesh);
    }
    sampleMesh.material = art.material;
    sampleMesh.matrix.copy(art.matrixWorld);
    sampleMesh.matrixWorldNeedsUpdate = true;

    const previousTarget = renderer.getRenderTarget();
    renderer.getClearColor(clearColor);
    const clearAlpha = renderer.getClearAlpha();
    try {
      renderer.setRenderTarget(sampleTarget);
      renderer.setClearColor(0, 0);
      renderer.render(sampleScene, sampleCamera);
      renderer.readRenderTargetPixels(sampleTarget, 0, 0, 1, 1, sampleColor);
      return sampleColor[3] > 0;
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(clearColor, clearAlpha);
    }
  }

  canvas.addEventListener('click', ({ clientX, clientY }) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.floor((clientX - rect.left) / rect.width * canvas.width);
    const y = Math.floor((clientY - rect.top) / rect.height * canvas.height);
    pointer.set((x + .5) / canvas.width * 2 - 1, 1 - (y + .5) / canvas.height * 2);
    pickerRay.setFromCamera(pointer, camera);
    let sceneryDepth;
    const hit = pickerRay.intersectObjects(pickable, false).find(({ object, distance }) => {
      if (!object.visible) return false;
      if (!artwork.has(object)) return true;
      // A landmark can sit partly behind a harbor model. Only the exposed pixels pick its deed.
      sceneryDepth ??= pickerRay.intersectObject(town, true).find(({ object: mesh, face }) => {
        const material = Array.isArray(mesh.material) ? mesh.material[face.materialIndex] : mesh.material;
        return mesh.visible && material.visible && material.depthWrite;
      })?.distance ?? Infinity;
      return distance <= sceneryDepth && sampleArt(object, x, y);
    });
    if (hit) deed.select(hit.object.userData.location);
  }, { signal: pointerEvents.signal });
  overlay.addEventListener('click', event => {
    const caption = event.target.closest('.board-tile-caption');
    if (caption) deed.select(getLocation(map, caption.parentElement.dataset.location));
  }, { signal: pointerEvents.signal });
  canvas.addEventListener('webglcontextlost', onContextLost, { signal: pointerEvents.signal });
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  return {
    render,
    updateSelection,
    activePawnBounds() {
      const piece = pieces[current?.activePlayerIndex];
      if (!piece) return;
      const { min, max } = new THREE.Box3().setFromObject(piece.pawn);
      const origin = overlay.getBoundingClientRect();
      const { left, top, right, bottom } = piece.seat.getBoundingClientRect();
      const bounds = { left, top, right, bottom };
      for (const x of [min.x, max.x]) {
        for (const y of [min.y, max.y]) {
          for (const z of [min.z, max.z]) {
            world.set(x, y, z).project(camera);
            const screenX = origin.left + (world.x + 1) * width / 2;
            const screenY = origin.top + (1 - world.y) * height / 2;
            bounds.left = Math.min(bounds.left, screenX);
            bounds.right = Math.max(bounds.right, screenX);
            bounds.top = Math.min(bounds.top, screenY);
            bounds.bottom = Math.max(bounds.bottom, screenY);
          }
        }
      }
      return bounds;
    },
    destroy(waitFor) {
      if (closed) return;
      closed = true;
      finishMotion(waitFor);
      if (artFrame !== undefined) cancelAnimationFrame(artFrame);
      observer.disconnect();
      pointerEvents.abort();
      disposeTree(scene, originalMaterials);
      sampleTarget.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      overlay.remove();
      container.classList.remove('board-3d');
    },
  };
}

export function mountBoard(container, map, { deedContainer, onDeedSelection, beforeFallback }) {
  let board;
  let latest;
  let closed = false;
  const deed = mountDeed(deedContainer, map, (location) => {
    board?.updateSelection();
    onDeedSelection(location);
  });
  const canvas = document.createElement('canvas');
  const attributes = { antialias: true };
  let renderer;
  try {
    const context = canvas.getContext('webgl2', attributes);
    if (context) renderer = new THREE.WebGLRenderer({ canvas, context, ...attributes });
  } catch {
    // Unsupported or restricted WebGL setups use the same game with the existing Canvas board.
  }
  board = renderer
    ? mountThreeBoard(container, map, renderer, deed, () => {
      if (closed) return;
      const previous = board;
      const restoreView = beforeFallback(previous.activePawnBounds());
      board = mountFallbackBoard(container, map, deed);
      const replacementFrame = latest && board.render(latest, { waitForPaint: true });
      if (restoreView) replacementFrame?.then(restoreView);
      // A roll awaiting the old renderer should continue only after the fallback paints its landing.
      previous.destroy(replacementFrame);
    })
    : mountFallbackBoard(container, map, deed);

  return {
    render(state, options) {
      if (closed) return;
      latest = state;
      return board.render(state, options);
    },
    activePawnBounds: () => board?.activePawnBounds(),
    destroy() {
      closed = true;
      board?.destroy();
      board = undefined;
      deed.destroy();
    },
  };
}
