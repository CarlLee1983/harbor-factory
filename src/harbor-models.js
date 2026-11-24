import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const QUAY_TOP = 0.035;
const WATER_LEVEL = -0.23;
const STONE = '#c49a69';
const CREAM = '#f7dfb9';
const IRON = '#334f57';
const WOOD = '#845a42';

const northQuay = [
  [.53, .53], [9.47, .53], [9.47, 3.11], [8.86, 3.11], [8.62, 3.62],
  [7.65, 3.62], [7.39, 4.23], [5.72, 4.23], [5.4, 4.84],
  [3.75, 4.84], [3.44, 5.47], [.53, 5.47],
];
const southQuay = [
  [.53, 7.87], [2.54, 7.87], [2.79, 7.46], [3.74, 7.46], [4, 6.74],
  [5.45, 6.74], [5.7, 6.16], [7, 6.16], [7.22, 5.64], [8.52, 5.64],
  [8.83, 5.12], [9.47, 5.12], [9.47, 9.47], [.53, 9.47],
];

const palettes = [
  ['#f0c291', '#d66b4d', '#f99c63', '#316b68'],
  ['#f3d699', '#427c8a', '#81bcc2', '#42877e'],
  ['#ecb589', '#b44b48', '#f47d57', '#ce6261'],
  ['#ebd99c', '#47776a', '#92b781', '#528d67'],
  ['#f4d5a7', '#d68a43', '#f6b467', '#b46b40'],
  ['#dfad9c', '#586882', '#a0a6c4', '#746e9a'],
];

// The atlas multiplies the painted geometry. Solid trim and props sample one white texel.
const ATLAS_WIDTH = 512;
const ATLAS_HEIGHT = 256;
const WHITE_UV = [1 - .5 / ATLAS_WIDTH, 1 - .5 / ATLAS_HEIGHT];
const SHINGLES = { x: 0, y: 0, scale: 26 };
const BRICK = { x: 64, y: 0, scale: 34 };
const STUCCO = { x: 0, y: 64, scale: 24 };
const BOARDS = { x: 64, y: 64, scale: 24 };
const COBBLE = { x: 128, y: 0, scale: 12 };

function colorTexture(width, height, pixels) {
  const texture = new THREE.DataTexture(pixels, width, height);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function paintedSurfaces() {
  const pixels = new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT * 4).fill(255);
  function draw(chart, size, valueAt) {
    for (let y = 0; y < size * 2; y++) {
      for (let x = 0; x < size * 2; x++) {
        const value = valueAt(x / 2, y / 2);
        const index = ((chart.y * 2 + y) * ATLAS_WIDTH + chart.x * 2 + x) * 4;
        pixels[index] = value;
        pixels[index + 1] = value;
        pixels[index + 2] = value;
      }
    }
  }
  draw(SHINGLES, 64, (x, y) => {
    const seam = Math.pow(.5 + .5 * Math.cos(y * Math.PI / 2), 11);
    const barrel = Math.sin(x * Math.PI / 3);
    const side = Math.max(0, Math.abs(barrel) - .78);
    const variation = Math.sin(x * .52 + y * 1.1) * 3;
    return 238 + 14 * barrel - 13 * seam - 27 * side + variation;
  });
  draw(BRICK, 64, (x, y) => {
    const row = Math.floor(y / 4);
    const shifted = x + (row % 2) * 4;
    const edge = Math.max(Math.pow(.5 + .5 * Math.cos(y * Math.PI / 2), 12),
      Math.pow(.5 + .5 * Math.cos(shifted * Math.PI / 4), 24));
    return 242 - 22 * edge + 5 * Math.sin(Math.floor(shifted / 8) * 17 + row * 29);
  });
  draw(STUCCO, 64, (x, y) => 243 + 4 * Math.sin(x * .23 + y * .31)
    + 4 * Math.cos(x * .68 - y * .41) + 2 * Math.sin(x * 3.7 + y * 6.7));
  draw(BOARDS, 64, (x, y) => {
    const grain = Math.sin(y * 2.7 + 1.1 * Math.sin(x * .21)) * 4;
    return 242 + grain - 12 * Math.pow(.5 + .5 * Math.cos(y * Math.PI / 2), 8);
  });
  draw(COBBLE, 124, (x, y) => {
    const row = Math.floor(y / 2.6);
    const shifted = x + (row % 2) * 2.2;
    const joints = Math.max(Math.pow(.5 + .5 * Math.cos(y * 2.4), 12),
      Math.pow(.5 + .5 * Math.cos(shifted * 1.43), 16));
    const stone = Math.sin(Math.floor(shifted / 4.4) * 19 + row * 37);
    return 244 + stone * 5 - joints * 13;
  });
  return colorTexture(ATLAS_WIDTH, ATLAS_HEIGHT, pixels);
}

function surfaceUvs(geometry, chart) {
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    let u = WHITE_UV[0];
    let v = WHITE_UV[1];
    if (chart) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const boxFace = Math.floor(i * 6 / positions.count);
      const rounded = geometry instanceof RoundedBoxGeometry;
      const side = rounded ? boxFace < 2 : Math.abs(normals.getX(i)) > Math.abs(normals.getZ(i));
      const horizontal = rounded ? boxFace >= 2 && boxFace < 4 : Math.abs(normals.getY(i)) > .7;
      const across = side ? z : x;
      const along = chart === SHINGLES || horizontal ? (side ? x : z) : y;
      const origin = chart === COBBLE ? 1 : 30;
      u = (chart.x + origin + across * chart.scale) * 2 / ATLAS_WIDTH;
      v = (chart.y + origin + along * chart.scale) * 2 / ATLAS_HEIGHT;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// Each batch shares one shaded material and stores its paint colors on the vertices.
function batch(root, material) {
  const parts = [];
  return {
    add(source, paint, position, rotation, chart) {
      const geometry = source.index ? source.toNonIndexed() : source;
      if (source !== geometry) source.dispose();
      surfaceUvs(geometry, chart);
      if (rotation) geometry.applyQuaternion(rotation);
      if (position) geometry.translate(...position);

      const count = geometry.attributes.position.count;
      const color = new THREE.Color(paint);
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = color.r;
        colors[i + 1] = color.g;
        colors[i + 2] = color.b;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      parts.push(geometry);
    },
    finish(castShadow = true) {
      if (!parts.length) return;
      const geometry = mergeGeometries(parts);
      geometry.computeBoundingSphere();
      parts.forEach(part => part.dispose());
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      root.add(mesh);
    },
  };
}

function box(model, x, y, z, w, h, d, color, rotation, chart) {
  const rounded = chart === STUCCO || chart === BRICK;
  const geometry = rounded ? new RoundedBoxGeometry(w, h, d, 1, .027) : new THREE.BoxGeometry(w, h, d);
  model.add(geometry, color, [x, y, z], rotation, chart);
}

function cylinder(model, x, y, z, topRadius, radius, height, color, sides = 12, rotation) {
  model.add(new THREE.CylinderGeometry(topRadius, radius, height, sides), color, [x, y, z], rotation);
}

function rod(model, start, end, radius, color, sides = 6) {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const axis = to.clone().sub(from);
  const height = axis.length();
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
  cylinder(model, ...from.lerp(to, .5).toArray(), radius, radius, height, color, sides, rotation);
}

function face(model, vertices, paint, toward, chart) {
  const [a, b, c] = vertices.map(point => new THREE.Vector3(...point));
  const normal = b.sub(a).cross(c.sub(a));
  const points = normal.dot(toward) < 0 ? [...vertices].reverse() : vertices;
  const positions = [];
  for (let index = 1; index < points.length - 1; index++) {
    positions.push(...points[0], ...points[index], ...points[index + 1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  model.add(geometry, paint, undefined, undefined, chart);
}

function solid(model, vertices, faces, paints, charts = []) {
  const center = new THREE.Vector3();
  for (const point of vertices) center.add(new THREE.Vector3(...point));
  center.divideScalar(vertices.length);
  faces.forEach((indices, index) => {
    const points = indices.map(vertex => vertices[vertex]);
    const outward = new THREE.Vector3(...points[0]).sub(center);
    face(model, points, paints[index % paints.length], outward, charts[index]);
  });
}

function patch(model, points, height, paint, chart) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geometry = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  model.add(geometry, paint, [0, height, 0], undefined, chart);
}

function group(root, name, x, y, z, occluder = true) {
  const child = new THREE.Group();
  child.name = name;
  child.position.set(x, y, z);
  child.userData.occluder = occluder;
  root.add(child);
  return child;
}

function water(root) {
  const size = 512;
  const width = 11.06;
  const pixels = new Uint8Array(size * size * 4);
  const deep = [27, 91, 115];
  const shallow = [64, 169, 156];
  const shore = [northQuay, southQuay].flatMap(perimeter => perimeter.map(([x, z], i) => {
    const [endX, endZ] = perimeter[(i + 1) % perimeter.length];
    const dx = endX - x;
    const dz = endZ - z;
    return { x, z, dx, dz, inverseLength: 1 / (dx * dx + dz * dz) };
  }));
  for (let row = 0; row < size; row++) {
    const z = 5 + width * (.5 - (row + .5) / size);
    for (let column = 0; column < size; column++) {
      const x = 5 + width * ((column + .5) / size - .5);
      let shoreDistance = Infinity;
      for (const edge of shore) {
        const dx = x - edge.x;
        const dz = z - edge.z;
        const along = THREE.MathUtils.clamp((dx * edge.dx + dz * edge.dz) * edge.inverseLength, 0, 1);
        const ex = dx - along * edge.dx;
        const ez = dz - along * edge.dz;
        shoreDistance = Math.min(shoreDistance, ex * ex + ez * ez);
      }
      const distance = Math.sqrt(shoreDistance);
      const coast = 1 - THREE.MathUtils.smoothstep(distance, .025, .81);
      const bearing = x * 4.1 + z * 8.2;
      const surface = Math.sin(bearing + 1.8 * Math.sin(z * 3.7 - x * 3.0));
      const chop = Math.cos(x * 8.3 - z * 17 + 4.0 * Math.sin(x * 1.45 + z * 1.55));
      const broken = Math.sin(x * 14.2 + z * 5.1 + 1.8 * Math.sin(z * 7));
      const sunPath = Math.max(0, .74 + .26 * Math.sin(x * .39 - z * .45));
      const glints = Math.pow(Math.max(0, surface * .68 + chop * .21 + broken * .11), 7) * sunPath;
      const foam = Math.exp(-Math.pow((distance - .08) / .047, 2))
        * (.48 + .52 * Math.pow(.5 + .5 * chop, 2));
      const light = surface * 2 + chop * 1.3 + glints * 34 + foam * 13;
      const index = (row * size + column) * 4;
      for (let channel = 0; channel < 3; channel++) {
        pixels[index + channel] = THREE.MathUtils.lerp(deep[channel], shallow[channel], coast) + light;
      }
      pixels[index + 3] = 255;
    }
  }

  const material = new THREE.MeshStandardMaterial({ map: colorTexture(size, size, pixels), roughness: .43 });
  const surface = new THREE.PlaneGeometry(width, width).rotateX(-Math.PI / 2);
  surface.translate(5, WATER_LEVEL, 5);
  const sea = new THREE.Mesh(surface, material);
  sea.receiveShadow = true;
  root.add(sea);
}

function quay(model, perimeter, landColor) {
  patch(model, perimeter, QUAY_TOP, landColor, COBBLE);
  const orientation = perimeter.reduce((sum, [x, z], i) => {
    const [nextX, nextZ] = perimeter[(i + 1) % perimeter.length];
    return sum + x * nextZ - nextX * z;
  }, 0) > 0 ? 1 : -1;
  perimeter.forEach(([x, z], i) => {
    const [endX, endZ] = perimeter[(i + 1) % perimeter.length];
    const dx = endX - x;
    const dz = endZ - z;
    const length = Math.hypot(dx, dz);
    const nx = dz / length * orientation;
    const nz = -dx / length * orientation;
    const outward = new THREE.Vector3(nx, 0, nz);
    const line = (distance, height, offset = 0) => [
      x + dx * distance + nx * offset, height, z + dz * distance + nz * offset,
    ];
    face(model, [line(0, -.30), line(1, -.30), line(1, QUAY_TOP), line(0, QUAY_TOP)], '#61554d', outward);
    face(model, [line(0, -.188, .004), line(1, -.188, .004), line(1, -.064, .004),
      line(0, -.064, .004)], '#a78463', outward);
    face(model, [line(0, -.065, .002), line(1, -.065, .002), line(1, QUAY_TOP + .002, -.027),
      line(0, QUAY_TOP + .002, -.027)], '#d1b28d', outward);
    patch(model, [[x - nx * .027, z - nz * .027], [endX - nx * .027, endZ - nz * .027],
      [endX - nx * .076, endZ - nz * .076], [x - nx * .076, z - nz * .076]], QUAY_TOP + .004, CREAM);

    const blocks = Math.ceil(length / .28);
    for (let block = 1; block < blocks; block++) {
      const at = block / blocks;
      const grout = .012 / length;
      face(model, [line(at - grout, -.179, .006), line(at + grout, -.179, .006),
        line(at + grout, -.069, .006), line(at - grout, -.069, .006)], '#876f5e', outward);
      const [tx, , tz] = line(at, QUAY_TOP + .004);
      const [ix, , iz] = line(at, QUAY_TOP + .004, -.077);
      patch(model, [[tx - nx * .027, tz - nz * .027], [ix, iz], [ix + dx * grout, iz + dz * grout],
        [tx + dx * grout - nx * .027, tz + dz * grout - nz * .027]], QUAY_TOP + .005, '#c8a985');
    }
  });
}

function paving(model) {
  quay(model, northQuay, '#e0b789');
  quay(model, southQuay, '#d8b284');
  patch(model, [[.71, 1.82], [9.29, 1.82], [9.29, 2.04], [.71, 2.04]], .039, '#ba9472', COBBLE);
  patch(model, [[.72, 8.12], [3.91, 8.08], [5.27, 7.77], [8.96, 7.37],
    [9.24, 7.68], [5.34, 8.01], [3.94, 8.32], [.71, 8.38]], .039, '#bd9772', COBBLE);
  patch(model, [[.8, 3.73], [2.92, 3.68], [3.39, 4.91], [2.63, 5.31], [.8, 5.23]],
    .04, '#8c9b66', COBBLE);
  patch(model, [[5.72, 7.24], [8.88, 6.96], [9.06, 7.33], [5.79, 7.68]], .041, '#8f9b68', COBBLE);
  patch(model, [[.83, 4.25], [1.7, 4.25], [2.19, 4.54], [3.29, 4.54], [3.37, 4.73],
    [2.15, 4.73], [1.64, 4.43], [.83, 4.43]], .045, '#dac192', COBBLE);
  for (const x of [1.1, 1.36, 1.62, 2.23, 2.49, 2.75, 3.01]) {
    const z = x < 2 ? 4.3 : 4.59;
    patch(model, [[x, z], [x + .17, z], [x + .17, z + .092], [x, z + .092]], .048, '#e8d2a2');
  }
}

function roof(model, width, depth, y, rise, type, roofColor, trimColor, wallColor) {
  const x = width / 2 + .048;
  const z = depth / 2 + .065;
  const end = depth / 2;
  const lower = [[-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z]];
  const top = y + rise;
  const ridgeColor = new THREE.Color(roofColor).lerp(new THREE.Color(trimColor), .35);
  const shade = new THREE.Color(roofColor).multiplyScalar(.76);

  if (type === 'hip') {
    solid(model, [...lower, [-x * .16, top, -z * .61], [x * .16, top, -z * .61],
      [x * .16, top, z * .61], [-x * .16, top, z * .61]], [
      [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7], [0, 1, 2, 3],
    ], [roofColor, shade, ridgeColor, roofColor, ridgeColor, shade],
    [SHINGLES, SHINGLES, SHINGLES, SHINGLES, SHINGLES]);
    box(model, 0, top + .007, 0, x * .31, .022, z * 1.22, trimColor);
  } else if (type === 'parapet') {
    box(model, 0, y + .018, 0, x * 2, .045, z * 2, roofColor, undefined, BOARDS);
    for (const front of [-z, z]) box(model, 0, y + .07, front, x * 2, .092, .042, roofColor);
    for (const side of [-x, x]) box(model, side, y + .07, 0, .043, .092, z * 2, roofColor);
    box(model, 0, y + .063, z, x * 2 + .03, .024, .064, trimColor);
    box(model, -.045, y + .092, -.055, width * .4, .12, depth * .38, wallColor);
    box(model, -.045, y + .154, -.055, width * .46, .035, depth * .42, trimColor);
    return;
  } else {
    solid(model, [...lower, [0, top, -z], [0, top, z]], [
      [0, 1, 4], [1, 2, 5, 4], [2, 3, 5], [3, 0, 4, 5], [0, 1, 2, 3],
    ], [shade, roofColor, shade, ridgeColor, shade], [undefined, SHINGLES, undefined, SHINGLES]);
    for (const front of [-end, end]) {
      solid(model, [[-width / 2, y - .022, front * .95], [width / 2, y - .022, front * .95],
        [0, top - .04, front * .95], [-width / 2, y - .022, front], [width / 2, y - .022, front],
        [0, top - .04, front]], [[0, 1, 2], [3, 4, 5], [0, 1, 4, 3],
        [0, 2, 5, 3], [1, 2, 5, 4]], [wallColor]);
      const outer = Math.sign(front) * (z + .008);
      rod(model, [-x, y, outer], [0, top, outer], .017, trimColor, 4);
      rod(model, [0, top, outer], [x, y, outer], .017, trimColor, 4);
    }
    rod(model, [0, top, -z], [0, top, z], .022, trimColor, 8);
  }
  for (const side of [-x, x]) box(model, side, y + .002, 0, .024, .028, z * 2, trimColor);
}

function windowPane(model, x, y, wall, width, height, trim, shutters = false) {
  box(model, x, y, wall + .009, width + .034, height + .035, .026, '#655044');
  box(model, x, y, wall + .026, width, height, .016, '#31494b');
  box(model, x, y + height * .19, wall + .036, width * .91, height * .37, .008, '#7caaa2');
  box(model, x, y, wall + .042, .014, height, .009, '#b99564');
  box(model, x, y - height / 2 - .022, wall + .033, width + .052, .018, .053, CREAM);
  if (shutters) {
    for (const side of [-1, 1]) {
      box(model, x + side * (width / 2 + .035), y, wall + .019, .031, height + .018, .026, trim);
    }
  }
}

function awning(model, width, top, wall, color) {
  const segments = 7;
  const x = width * .44;
  const length = .18;
  const outward = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < segments; i++) {
    const left = -x + i * 2 * x / segments;
    const right = -x + (i + 1) * 2 * x / segments;
    const paint = i % 2 ? color : '#ffe8b2';
    face(model, [[left, top, wall], [right, top, wall], [right, top - .077, wall + length],
      [left, top - .077, wall + length]], paint, outward);
    const hem = top - (i % 2 ? .13 : .117);
    face(model, [[left, top - .077, wall + length], [right, top - .077, wall + length],
      [right, hem, wall + length], [left, hem, wall + length]], paint, forward);
  }
  for (const side of [-x, x]) {
    rod(model, [side, top - .082, wall + length - .012], [side, top - .155, wall + .006], .008, WOOD);
  }
}

function house(root, material, [x, z, width, depth, height, palette, type, shop, turn = 0]) {
  const building = group(root, shop ? 'Market shop' : 'Harbor townhouse', x, QUAY_TOP, z);
  building.rotation.y = turn;
  const model = batch(building, material);
  const [wallColor, roofColor, trimColor, shutterColor] = palettes[palette];
  const front = depth / 2;
  box(model, 0, height / 2, 0, width, height, depth, wallColor, undefined, STUCCO);
  box(model, 0, .035, 0, width + .021, .075, depth + .017, '#a17c5c');
  box(model, 0, height - .021, 0, width + .022, .031, depth + .022, CREAM);
  roof(model, width, depth, height, .13 + width * .16, type, roofColor, trimColor, wallColor);

  const entryHeight = Math.min(height * .71, .22);
  const door = shop ? width * .21 : 0;
  box(model, door, entryHeight / 2 + .021, front + .01, .136, entryHeight, .025, '#745447');
  box(model, door, entryHeight / 2 + .018, front + .025, .089, entryHeight - .031, .013, shutterColor);
  box(model, door + .022, .106, front + .037, .013, .014, .013, '#f6d08a');
  box(model, door, .023, front + .035, .168, .038, .091, STONE);

  if (shop) {
    windowPane(model, -width * .20, .142, front, width * .26, .121, shutterColor);
    awning(model, width, Math.min(height - .05, .302), front + .015, roofColor);
    const signY = Math.min(height * .75, .31) + .071;
    box(model, -.091, signY, front + .022, .18, .052, .023, '#32464c');
    for (const [offset, size] of [[-.047, .027], [-.008, .033], [.035, .034]]) {
      box(model, -.091 + offset, signY + .004, front + .035, size, .016, .009, CREAM);
    }
  }
  if (height > .40) {
    for (const position of [-.24, .24]) {
      windowPane(model, width * position, height - .112, front, .105, .105, shutterColor, true);
    }
  } else if (!shop) {
    windowPane(model, -width * .25, .16, front, .115, .137, shutterColor);
    windowPane(model, width * .25, .16, front, .115, .137, shutterColor);
  }

  const side = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  for (const row of height > .53 ? [.155, height - .124] : [.157]) {
    box(model, width / 2 + .009, row, depth * .14, .155, .149, .022, '#76594b', side);
    box(model, width / 2 + .024, row, depth * .14, .113, .109, .018, '#31494b', side);
    box(model, width / 2 + .034, row + .025, depth * .14, .101, .037, .009, '#7caaa2', side);
    box(model, width / 2 + .042, row, depth * .14, .013, .105, .011, '#bc965f', side);
  }

  if (palette % 3 === 0 && type !== 'parapet') {
    box(model, -width * .23, height + .185, -depth * .24, .10, .19, .096, '#995e54');
    box(model, -width * .23, height + .284, -depth * .24, .12, .029, .119, CREAM);
  }
  model.finish();
}

function lighthouse(root, material) {
  const tower = group(root, 'Lighthouse', 3.40, QUAY_TOP, 4.54);
  const model = batch(tower, material);
  const red = '#c85142';
  cylinder(model, 0, .034, 0, .43, .452, .089, '#9e7e65', 16);
  cylinder(model, 0, .095, 0, .379, .417, .075, CREAM, 16);

  const levels = [.125, .38, .63, .88, 1.13, 1.38, 1.63];
  const baseRadius = .287;
  const taper = .092;
  for (let band = 0; band < levels.length - 1; band++) {
    const bottom = levels[band];
    const upper = levels[band + 1];
    cylinder(model, 0, (bottom + upper) / 2, 0, baseRadius - taper * upper,
      baseRadius - taper * bottom, upper - bottom, band % 2 ? red : '#ffe2ad', 16);
    if (band > 0) {
      cylinder(model, 0, bottom, 0, baseRadius - taper * bottom + .003,
        baseRadius - taper * bottom + .004, .018, band % 2 ? '#9c3e39' : '#d09b72', 16);
    }
  }
  const doorAngle = .41;
  const facade = group(tower, 'Tower entrance', 0, 0, 0, false);
  facade.rotation.y = doorAngle;
  const doors = batch(facade, material);
  box(doors, 0, .206, .253, .145, .177, .053, '#7e5c4f');
  box(doors, 0, .202, .284, .105, .128, .024, '#44616a');
  box(doors, .025, .185, .3, .019, .019, .011, CREAM);
  box(doors, 0, .110, .308, .204, .035, .14, CREAM);
  for (const [height, width] of [[.568, .084], [1.07, .072], [1.42, .063]]) {
    windowPane(doors, 0, height, baseRadius - taper * height - .014, width, .097, red);
  }
  doors.finish();

  cylinder(model, 0, 1.635, 0, .219, .145, .109, '#a04039', 20);
  cylinder(model, 0, 1.695, 0, .252, .252, .045, CREAM, 20);
  cylinder(model, 0, 1.724, 0, .253, .248, .019, '#984637', 20);
  cylinder(model, 0, 1.763, 0, .149, .165, .075, '#3c5554');
  cylinder(model, 0, 2.005, 0, .158, .164, .042, IRON);
  for (let i = 0; i < 12; i++) {
    const theta = i * Math.PI / 6;
    const next = (i + 1) * Math.PI / 6;
    const x = Math.cos(theta);
    const z = Math.sin(theta);
    const nextX = Math.cos(next);
    const nextZ = Math.sin(next);
    rod(model, [x * .238, 1.726, z * .238], [x * .238, 1.819, z * .238], .008, IRON);
    rod(model, [x * .238, 1.819, z * .238], [nextX * .238, 1.819, nextZ * .238], .009, IRON);
    rod(model, [x * .153, 1.792, z * .153], [x * .145, 2.004, z * .145], .009, IRON);
  }
  cylinder(model, 0, 2.044, 0, .205, .208, .027, '#e6865b', 16);
  cylinder(model, 0, 2.108, 0, .112, .198, .105, red, 16);
  cylinder(model, 0, 2.184, 0, .017, .112, .053, '#aa483b', 16);
  rod(model, [0, 2.195, 0], [0, 2.273, 0], .012, IRON);
  model.add(new THREE.IcosahedronGeometry(.024), '#e1ac65', [0, 2.277, 0]);
  model.finish();

  const lantern = batch(tower, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: .45, emissive: '#f0a638', emissiveIntensity: .46,
  }));
  cylinder(lantern, 0, 1.899, 0, .138, .143, .198, '#ffe0a0');
  lantern.finish(false);
}

function warehouse(root, material, x, z) {
  const building = group(root, 'Harbor warehouse', x, QUAY_TOP, z);
  const model = batch(building, material);
  box(model, 0, .257, 0, 1.41, .514, .71, '#bc9879', undefined, BOARDS);
  box(model, 0, .054, 0, 1.445, .115, .741, '#9e806b');
  box(model, 0, .429, 0, 1.43, .06, .725, '#dcb28a');
  roof(model, 1.42, .72, .512, .305, 'gable', '#435c76', '#8eabb5', '#c59f7b');

  for (const door of [-.36, .29]) {
    box(model, door, .207, .372, .32, .36, .03, '#695047');
    box(model, door, .201, .395, .267, .31, .025, '#557272');
    for (let slat = 0; slat < 6; slat++) {
      box(model, door - .111 + slat * .044, .201, .41, .008, .302, .012, '#3e5b5a');
    }
    box(model, door, .124, .425, .276, .023, .015, '#b5956b');
    box(model, door, .247, .425, .276, .023, .015, '#b5956b');
  }
  windowPane(model, 0, .565, .383, .144, .11, '#724e48');
  box(model, 0, .473, .373, .53, .068, .035, WOOD);
  for (const center of [-.115, .115]) {
    box(model, center, .476, .394, .155, .014, .009, CREAM);
  }
  model.finish();
}

function brickWarehouse(root, material) {
  const building = group(root, 'Red brick warehouse', 4.75, QUAY_TOP, .96);
  const model = batch(building, material);
  const width = .87;
  const depth = .67;
  const height = 1.33;
  const front = depth / 2;
  box(model, 0, height / 2, 0, width, height, depth, '#bd7357', undefined, BRICK);
  box(model, 0, .063, 0, width + .04, .13, depth + .025, '#9d7b63');
  roof(model, width, depth, height, .265, 'gable', '#773e49', '#d99465', '#bd7357');

  for (const at of [.42, .82, 1.21]) {
    box(model, 0, at, 0, width + .022, .034, depth + .019, '#bd795b');
  }
  for (const y of [.63, 1.02]) {
    windowPane(model, -.21, y, front, .108, .146, '#804d47');
    windowPane(model, .21, y, front, .108, .146, '#804d47');
    box(model, width / 2 + .009, y, -.075, .029, .158, .154, '#664a47');
    box(model, width / 2 + .026, y, -.075, .018, .118, .115, '#c69467');
  }
  box(model, .041, .237, front + .023, .26, .348, .060, '#6b4941');
  box(model, .041, .218, front + .055, .204, .284, .018, '#486769');
  box(model, .041, .218, front + .068, .012, .284, .012, '#334d50');
  box(model, .041, .081, front + .077, .29, .075, .13, STONE);
  box(model, 0, 1.317, front + .009, .179, .213, .033, '#644943');
  box(model, 0, 1.344, front + .083, .040, .044, .21, WOOD);
  rod(model, [0, 1.335, front + .179], [0, 1.17, front + .179], .006, '#483b36');
  model.finish();
}

function bollard(model, x, y, z) {
  cylinder(model, x, y + .013, z, .047, .046, .024, '#a68164', 8);
  cylinder(model, x, y + .051, z, .032, .023, .087, IRON, 8);
  cylinder(model, x, y + .092, z, .044, .035, .029, '#556464', 8);
}

function crate(model, x, y, z, size, color = '#b78f5f') {
  box(model, x, y + size / 2, z, size, size, size, color);
  for (const side of [-1, 1]) {
    box(model, x + side * size * .36, y + size / 2, z + size / 2, size * .13, size, .014, '#d0a171');
    box(model, x + size / 2, y + size / 2, z + side * size * .36, .014, size, size * .13, '#ad825c');
  }
  rod(model, [x - size * .32, y + size * .16, z + size * .536],
    [x + size * .32, y + size * .83, z + size * .536], size * .048, WOOD, 4);
  box(model, x, y + size + .007, z, size * .95, .012, size * .085, '#a7815c');
}

function jetty(root, material, x, z, length, turn = 0) {
  const dock = group(root, 'Timber jetty', x, WATER_LEVEL, z, false);
  dock.rotation.y = turn;
  const model = batch(dock, material);
  const width = .361;
  const top = .175;
  const steps = Math.ceil(length / .104);
  const step = length / steps;
  for (let i = 0; i < steps; i++) {
    box(model, 0, top - .02, (i + .5) * step, width + (i % 4 === 0 ? .011 : 0), .04,
      step - .007, ['#c69b77', '#b98d6a', '#d0a581', '#c29873'][i % 4], undefined, BOARDS);
  }
  for (const side of [-1, 1]) {
    box(model, side * .144, top - .055, length / 2, .042, .067, length, WOOD);
    for (const at of [.12, .53, length - .12]) {
      cylinder(model, side * .153, .02, at, .036, .044, .25, '#795746', 7);
    }
    bollard(model, side * .13, top, length - .09);
  }
  model.finish();
}

function tree(model, x, z, size, variant) {
  const top = QUAY_TOP;
  rod(model, [x, top, z], [x + size * .08, top + size * .63, z], size * .069, '#77563d');
  const greens = variant ? ['#667d4d', '#849957', '#a4b76a'] : ['#406b4c', '#598856', '#83a967'];
  const crowns = [[-.15, .48, .075, .35], [.16, .55, -.04, .34], [.01, .73, .018, .37]];
  crowns.forEach(([dx, dy, dz, scale], i) => {
    const canopy = new THREE.SphereGeometry(size * scale, 9, 7).scale(.86, 1, .89);
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.73 + z);
    model.add(canopy, greens[i], [x + dx * size, top + size * dy, z + dz * size], rotation);
  });
}

function lamp(model, x, z) {
  const base = QUAY_TOP;
  cylinder(model, x, base + .023, z, .032, .052, .042, STONE, 8);
  cylinder(model, x, base + .143, z, .015, .019, .252, IRON, 8);
  box(model, x, base + .27, z, .066, .025, .066, IRON);
  cylinder(model, x, base + .306, z, .044, .034, .068, '#ffcf77', 4);
  cylinder(model, x, base + .356, z, .014, .058, .034, IRON, 4);
}

function waterfront(root, material) {
  const canopy = group(root, 'Lighthouse gardens', 0, 0, 0);
  const garden = batch(canopy, material);
  for (const [x, z, size, variant] of [
    [1.06, 3.85, .48, true], [1.17, 4.81, .59, false], [2.00, 4.89, .45, true],
    [2.58, 4.55, .52, false], [2.70, 5.03, .34, true], [2.81, 3.80, .40, false],
  ]) tree(garden, x, z, size, variant);
  garden.finish();

  for (const [index, coordinates] of [
    [[.88, 2.03, .39], [8.97, 2.97, .43], [8.82, .91, .43]],
    [[6.03, 7.46, .32], [6.64, 7.23, .49], [7.06, 7.30, .36], [8.79, 7.22, .47]],
    [[2.42, 8.04, .41], [3.32, 7.82, .37], [9.11, 8.66, .38]],
  ].entries()) {
    const trees = batch(group(root, 'Coastal trees', 0, 0, 0, index === 1), material);
    coordinates.forEach(([x, z, size], i) => tree(trees, x, z, size, i % 2 === 0));
    trees.finish();
  }

  const fixtures = batch(root, material);
  for (const [x, z] of [
    [1.54, 5.26], [3.83, 4.71], [4.88, 4.67], [6.88, 4.03], [8.04, 3.46],
    [8.54, 5.78], [7.22, 6.01], [5.91, 6.44], [3.59, 7.65], [1.47, 8.00],
    [1.05, 9.27], [4.17, 9.24], [7.40, 9.24],
  ]) lamp(fixtures, x, z);
  for (const [x, z] of [
    [1.03, 5.37], [2.39, 5.38], [3.25, 5.34], [4.46, 4.755], [5.07, 4.755],
    [6.32, 4.14], [7.22, 4.14], [8.55, 3.54], [2.05, 7.97], [4.29, 6.82],
    [5.96, 6.24], [7.39, 5.73], [8.30, 5.73], [9.24, 5.21],
  ]) bollard(fixtures, x, QUAY_TOP, z);
  for (const [x, z, size] of [
    [2.82, 5.22, .14], [2.94, 5.07, .14], [6.13, 4.02, .14], [6.29, 3.96, .125],
    [7.38, 6.88, .15], [7.53, 6.92, .13], [8.59, 6.82, .16], [8.75, 6.70, .14],
    [8.89, 6.85, .15], [8.63, 5.83, .135], [4.35, 6.93, .135],
  ]) crate(fixtures, x, QUAY_TOP, z, size);
  for (const side of [-1, 1]) {
    box(fixtures, 2.01 + side * .139, .071, 5.17, .055, .074, .089, STONE);
  }
  box(fixtures, 2.01, .124, 5.17, .36, .04, .088, WOOD);
  fixtures.finish();
}

function boat(root, material, x, z, turn, color, withSails = true) {
  const ship = group(root, withSails ? 'Sailing boat' : 'Fishing boat', x, WATER_LEVEL, z, false);
  ship.rotation.y = turn;
  const model = batch(ship, material);
  const gunwales = [[-.39, .103, 0], [-.25, .088, -.124], [.18, .084, -.117], [.33, .092, -.073],
    [.36, .092, .066], [.16, .084, .115], [-.25, .088, .123]];
  const keel = gunwales.map(([bx, , bz]) => [bx * .80, -.063, bz * .63]);
  const hull = [...gunwales, ...keel];
  const hullSides = gunwales.map((_, i) => {
    const next = (i + 1) % gunwales.length;
    return [i, next, next + gunwales.length, i + gunwales.length];
  });
  solid(model, hull, [...hullSides, gunwales.map((_, i) => i)], [color, color, '#663c3a', color,
    color, '#985047', color, '#bc9a6e']);
  gunwales.forEach((point, i) => rod(model, point, gunwales[(i + 1) % gunwales.length], .018, CREAM));
  for (const side of [-1, 1]) {
    const wake = [[.055, .134], [.14, .138], [.25, .149], [.37, .171], [.48, .199], [.59, .251]];
    const crest = wake.map(([x, z]) => [x, z * side]);
    const trailing = wake.map(([x, z], index) => [x, (z + .019 * Math.sin(index * Math.PI / 5)) * side]).reverse();
    patch(model, [...crest, ...trailing], .009, '#74b8b5');
  }
  if (withSails) {
    box(model, .11, .099, 0, .065, .039, .178, '#87634f');
    rod(model, [-.026, .09, 0], [-.026, .72, 0], .014, WOOD);
    rod(model, [-.026, .24, 0], [.32, .218, .035], .01, '#aa8060');
    const sail = [[-.002, .68, .006], [-.002, .247, .010], [.31, .233, .028], [.091, .401, .055]];
    const bowSail = [[-.061, .611, -.007], [-.339, .199, -.008], [-.061, .226, -.004]];
    const front = new THREE.Vector3(0, 0, 1);
    const back = new THREE.Vector3(0, 0, -1);
    face(model, [sail[0], sail[1], sail[3]], '#fff1c3', front);
    face(model, [sail[0], sail[3], sail[2]], '#f7dca5', front);
    face(model, [sail[1], sail[2], sail[3]], '#d4ad7d', front);
    face(model, [sail[0], sail[1], sail[3]], '#e1c6a0', back);
    face(model, [sail[0], sail[3], sail[2]], '#f2d8aa', back);
    face(model, [sail[1], sail[2], sail[3]], '#ddc095', back);
    face(model, bowSail, '#ecd5a6', front);
    face(model, bowSail, '#d7b88d', back);
    for (const direction of [front, back]) {
      face(model, [[-.026, .724, .002], [.131, .698, .036], [-.026, .662, .002]], color, direction);
    }
  } else {
    box(model, .077, .157, 0, .256, .149, .170, '#dbbe8e');
    box(model, .077, .242, 0, .284, .033, .192, '#456771');
    box(model, -.063, .177, 0, .03, .066, .12, '#3d5558');
    box(model, .077, .171, .086, .132, .056, .014, '#526768');
    rod(model, [.156, .253, 0], [.156, .438, 0], .01, IRON);
    crate(model, -.194, .10, 0, .085);
  }
  model.finish();
}

function buoy(model, x, z) {
  const level = WATER_LEVEL;
  cylinder(model, x, level + .042, z, .095, .104, .096, '#a43d3b', 10);
  cylinder(model, x, level + .091, z, .083, .096, .033, '#f59266', 10);
  cylinder(model, x, level + .142, z, .042, .070, .076, '#f0d1a1', 8);
  cylinder(model, x, level + .183, z, .028, .05, .038, '#c55b47', 8);
  const ring = new THREE.TorusGeometry(.027, .008, 6, 10);
  model.add(ring, IRON, [x, level + .231, z]);
}

const townhouses = [
  // The modest back row leaves the route tile faces visible.
  [1.22, 1.32, .57, .49, .37, 3, 'hip'],
  [1.92, 1.32, .63, .57, .42, 0, 'gable'],
  [2.69, 1.32, .65, .52, .39, 1, 'parapet'],
  [3.47, 1.30, .72, .58, .36, 2, 'gable'],
  [5.89, 1.31, .66, .57, .47, 5, 'gable'],
  [6.68, 1.33, .69, .62, .41, 2, 'parapet'],
  [7.51, 1.32, .69, .57, .42, 4, 'gable'],
  [8.39, 1.35, .73, .59, .40, 1, 'hip'],

  [1.47, 2.79, .76, .69, .56, 1, 'gable', true],
  [2.36, 2.82, .69, .64, .60, 4, 'hip', true],
  [3.38, 2.34, .72, .63, .54, 2, 'gable', true],
  [4.23, 2.41, .66, .64, .54, 4, 'parapet'],
  [5.04, 2.39, .64, .58, .65, 5, 'gable'],
  [5.85, 2.39, .67, .64, .44, 0, 'gable', true],
  [6.72, 2.34, .71, .63, .65, 3, 'hip'],
  [7.55, 2.35, .66, .65, .48, 2, 'gable'],
  [8.47, 2.32, .75, .70, .54, 1, 'gable', true],
  [4.34, 3.53, .72, .69, .62, 0, 'gable', true],
  [5.22, 3.45, .73, .66, .53, 3, 'hip', true],
  [6.11, 3.48, .74, .63, .49, 2, 'gable', true],
  [6.97, 3.38, .67, .61, .46, 4, 'parapet', true],

  [1.27, 8.70, .57, .55, .34, 0, 'gable', true],
  [2.04, 8.67, .65, .60, .40, 5, 'hip', true],
  [2.92, 8.69, .72, .60, .54, 0, 'gable', true],
  [3.81, 8.69, .70, .61, .39, 3, 'parapet', true],
  [4.69, 8.68, .77, .59, .56, 4, 'gable', true],
  [5.58, 8.65, .68, .62, .58, 1, 'hip', true],
  [6.40, 8.62, .68, .60, .43, 2, 'gable', true],
  [7.25, 8.60, .76, .62, .56, 0, 'gable', true],
  [8.16, 8.52, .77, .69, .55, 5, 'hip', true],

  [4.65, 7.27, .76, .70, .55, 2, 'gable', true, Math.PI / 2],
  [5.57, 7.02, .64, .64, .47, 4, 'parapet', true, Math.PI / 2],
  [6.47, 6.74, .66, .63, .53, 3, 'gable', true, Math.PI / 2],
  [8.99, 5.76, .61, .51, .39, 1, 'hip', true, Math.PI / 2],
];

export function buildHarbor() {
  const harbor = new THREE.Group();
  harbor.name = 'Miniature harbor';
  const material = new THREE.MeshStandardMaterial({
    map: paintedSurfaces(), vertexColors: true, roughness: .78,
  });

  water(harbor);
  const ground = batch(harbor, material);
  paving(ground);
  ground.finish(false);
  townhouses.forEach(building => house(harbor, material, building));
  brickWarehouse(harbor, material);
  warehouse(harbor, material, 7.98, 6.34);
  lighthouse(harbor, material);
  waterfront(harbor, material);
  jetty(harbor, material, 2.97, 5.41, 1.47);
  jetty(harbor, material, 7.82, 3.57, 1.05, .17);
  jetty(harbor, material, 8.26, 5.68, .88, Math.PI);
  boat(harbor, material, 1.37, 6.49, .53, '#b95145');
  boat(harbor, material, 4.68, 5.77, -.15, '#aa5346');
  boat(harbor, material, 8.94, 4.32, -.82, '#497e77', false);
  const channel = batch(harbor, material);
  buoy(channel, 2.13, 7.04);
  buoy(channel, 5.71, 5.27);
  buoy(channel, 7.14, 4.83);
  channel.finish();
  return harbor;
}
