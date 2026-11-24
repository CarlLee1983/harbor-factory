import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ink = '#263142';
const ivory = '#fff1d0';
const brass = '#eab456';
const polished = '#ffe2a0';
const sphere = new THREE.SphereGeometry(1, 24, 16);
const smallSphere = new THREE.SphereGeometry(1, 14, 10);
const detailSphere = new THREE.SphereGeometry(1, 10, 7);
const disc = new THREE.CylinderGeometry(1, 1, 1, 28);
const coat = new THREE.CylinderGeometry(.76, 1, 1, 24);
const brim = new THREE.CylinderGeometry(1, .93, 1, 28);

const styles = {
  captain: {
    face: [.104, .109, .082, .511], build: [.119, .111, .068], skin: '#c58560',
    shade: '#a5564c', hair: '#c5bbb0', shirt: '#335572', light: '#4a6b84', trousers: '#30455e',
    eyes: '#53776c', boots: '#344157', feet: [-.055, .054], arms: [[-.132, .255, .033], [.126, .252, .067]],
  },
  florist: {
    face: [.086, .111, .077, .519], build: [.088, .101, .056], skin: '#eaa583',
    shade: '#d67a71', hair: '#633b3a', shirt: '#427f6c', light: '#76a38b', trousers: '#8a675c',
    eyes: '#58715c', boots: '#644536', feet: [-.044, .045], arms: [[-.107, .264, .066], [.109, .301, .096]],
  },
  courier: {
    face: [.086, .103, .078, .518], build: [.094, .108, .058], skin: '#c27a52',
    shade: '#a95b43', hair: '#402e2a', shirt: '#3b6096', light: '#6d92b9', trousers: '#355370',
    eyes: '#674532', boots: '#263f53', feet: [-.075, .067], arms: [[-.119, .292, .061], [.103, .262, .067]],
  },
  auntie: {
    face: [.098, .096, .080, .481], build: [.105, .126, .073], skin: '#e4a98b',
    shade: '#c37870', hair: '#c8c1bd', shirt: '#805677', light: '#a6778d', trousers: '#614057',
    eyes: '#5e534c', boots: '#4c344d', feet: [-.052, .050], arms: [[-.107, .257, .055], [.113, .291, .109]],
  },
  engineer: {
    face: [.095, .105, .081, .516], build: [.107, .106, .068], skin: '#9e6045',
    shade: '#814b45', hair: '#372e34', shirt: '#bd7847', light: '#e2a45b', trousers: '#436369',
    eyes: '#46332f', boots: '#4e3b35', feet: [-.063, .057], arms: [[-.116, .244, .048], [.118, .288, .074]],
  },
  painter: {
    face: [.081, .116, .074, .512], build: [.089, .11, .056], skin: '#da9776',
    shade: '#ba6a62', hair: '#784639', shirt: '#36746c', light: '#569287', trousers: '#694765',
    eyes: '#674460', boots: '#563b43', feet: [-.059, .063], arms: [[-.111, .271, .103], [.111, .313, .079]],
  },
  diver: {
    face: [.086, .108, .077, .515], build: [.100, .101, .058], skin: '#b7785b',
    shade: '#a55650', hair: '#333c3e', shirt: '#347a79', light: '#6ea99b', trousers: '#2c6466',
    eyes: '#514039', boots: '#2e5e66', feet: [-.054, .055], arms: [[-.112, .271, .044], [.116, .275, .051]],
  },
  baker: {
    face: [.111, .101, .085, .504], build: [.129, .123, .085], skin: '#d08d68',
    shade: '#b26860', hair: '#897b76', shirt: '#a35555', light: '#bd7568', trousers: '#7b5449',
    eyes: '#61534a', boots: '#5b4140', feet: [-.068, .063], arms: [[-.118, .287, .117], [.132, .247, .052]],
  },
};

function sculpture() {
  const matte = [];
  const glazed = [];
  const orientation = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const size = new THREE.Vector3();
  const color = new THREE.Color();

  function add(geometry, tint, polish) {
    // One mesh per finish keeps the board from needing a draw call for each detail.
    geometry.deleteAttribute('uv');
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    const points = geometry.attributes.position;
    for (let index = 0; index < points.count; index++) {
      color.set(typeof tint === 'function' ? tint(points.getX(index), points.getY(index), points.getZ(index)) : tint);
      color.toArray(colors, index * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    (polish ? glazed : matte).push(geometry);
  }

  function part(geometry, tint, [x, y, z], [sx, sy, sz], angle = 0, polish = false) {
    position.set(x, y, z);
    size.set(sx, sy, sz);
    orientation.setFromEuler(new THREE.Euler(0, 0, angle));
    matrix.compose(position, orientation, size);
    add(geometry.clone().applyMatrix4(matrix), tint, polish);
  }

  function strand(tint, thickness, points, polish = false) {
    const path = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
    add(new THREE.TubeGeometry(path, 10, thickness, 7, false), tint, polish);
  }

  function finish(group) {
    const finishes = [
      [matte, { roughness: .76 }],
      [glazed, { roughness: .28, envMapIntensity: .7 }],
    ];
    for (const [parts, options] of finishes) {
      if (!parts.length) continue;
      const geometry = mergeGeometries(parts);
      for (const geometry of parts) geometry.dispose();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        vertexColors: true,
        ...options,
      }));
      group.add(mesh);
    }
  }

  return {
    ellipsoid(tint, position, radii, angle, polish) {
      const span = Math.max(...radii);
      const geometry = span < .020 ? detailSphere : span < .065 ? smallSphere : sphere;
      part(geometry, tint, position, radii, angle, polish);
    },
    puck: (tint, position, radii, angle, polish) => part(disc, tint, position, radii, angle, polish),
    hem: (tint, position, radii, angle, polish) => part(coat, tint, position, radii, angle, polish),
    band: (tint, position, radii, angle, polish) => part(brim, tint, position, radii, angle, polish),
    strand,
    mesh: add,
    finish,
  };
}

const faces = {
  captain: { jaw: .11, cheek: .04, nose: [.026,.021,-.18], eyes: [.020,.005,.39,.13], smile: .008, brow: .005, age: .9, hairline: .42, strands: 7 },
  florist: { jaw: -.23, cheek: .08, nose: [.017,.015,-.15], eyes: [.021,.008,.38,.17], smile: .021, brow: .002, age: 0, hairline: .46, strands: 5 },
  courier: { jaw: -.10, cheek: .025, nose: [.022,.016,-.12], eyes: [.018,.006,.38,.20], smile: .014, brow: .008, age: .08, hairline: .43, strands: 4 },
  auntie: { jaw: .045, cheek: .15, nose: [.022,.019,-.17], eyes: [.020,.004,.40,.12], smile: .017, brow: .002, age: 1, hairline: .43, strands: 7 },
  engineer: { jaw: .18, cheek: .06, nose: [.026,.021,-.14], eyes: [.019,.006,.36,.12], smile: .006, brow: .006, age: .25, hairline: .44, strands: 13 },
  painter: { jaw: -.28, cheek: .09, nose: [.025,.015,-.15], eyes: [.021,.006,.38,.14], smile: .011, brow: .009, age: .19, hairline: .45, strands: 8 },
  diver: { jaw: -.10, cheek: .05, nose: [.020,.017,-.15], eyes: [.019,.006,.37,.12], smile: .014, brow: .003, age: .08, hairline: .48, strands: 6 },
  baker: { jaw: .14, cheek: .13, nose: [.027,.021,-.21], eyes: [.019,.004,.38,.13], smile: .025, brow: .004, age: .84, hairline: .52, strands: 9 },
};

function surface(columns, rows, point, { loop = false, reverse = false } = {}) {
  const vertices = [];
  const triangles = [];
  const stride = loop ? columns : columns + 1;
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x < stride; x++) {
      vertices.push(...point(x / columns, y / rows));
      if (y === rows || (!loop && x === columns)) continue;
      const corner = y * stride + x;
      const right = y * stride + (x + 1) % stride;
      const a = corner, b = right, c = corner + stride, d = right + stride;
      triangles.push(...(reverse ? [a,c,b,b,c,d] : [a,b,c,b,d,c]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  return geometry;
}

function sweep(knots, sections = 16, sides = 12) {
  const centers = new THREE.CatmullRomCurve3(knots.map(([x,y,z]) => new THREE.Vector3(x,y,z)));
  const sizes = new THREE.CatmullRomCurve3(knots.map(([, , , width, depth]) => new THREE.Vector3(width, depth, 0)));
  const forward = new THREE.Vector3(0,0,1);
  return surface(sides, sections, (u, v) => {
    const theta = u * Math.PI * 2;
    const tangent = centers.getTangent(v);
    const widthVector = new THREE.Vector3().crossVectors(tangent, forward).normalize();
    const depthVector = new THREE.Vector3().crossVectors(widthVector, tangent);
    const {x, y} = sizes.getPoint(v);
    return centers.getPoint(v)
      .addScaledVector(widthVector, Math.cos(theta) * Math.max(.0001, x))
      .addScaledVector(depthVector, Math.sin(theta) * Math.max(.0001, y))
      .toArray();
  }, { loop: true, reverse: true });
}

function gaussian(value) {
  return Math.exp(-value * value);
}

function headSurface(style, features) {
  const [width, height, depth, center] = style.face;
  const middle = .009;
  const [nose, noseWidth, noseY] = features.nose;
  const [, , eyeSpace, eyeY] = features.eyes;
  function crossSection(v) {
    const arch = Math.sqrt(Math.max(.0003, 1 - v * v));
    const jaw = features.jaw * gaussian((v + .51) / .31);
    const cheek = features.cheek * gaussian((v + .13) / .38);
    return [width * arch * (1 + jaw + cheek), depth * arch, middle - depth * .09 * v];
  }
  function front(x, v, radius, offset, normal) {
    const angle = normal ** 2;
    const eyeSocket = -.007 * gaussian((Math.abs(x) - width * eyeSpace) / .022) * gaussian((v - eyeY) / .15);
    const noseBridge = nose * .56 * gaussian(x / (noseWidth * .64)) * gaussian((v - .02) / .32);
    const noseTip = nose * .78 * gaussian((x - .002) / noseWidth) * gaussian((v - noseY) / .12);
    const nostril = .0055 * gaussian((Math.abs(x) - noseWidth * .60) / .007) * gaussian((v - noseY + .07) / .095);
    const lips = .006 * gaussian(x / .029) * gaussian((v + .44) / .13);
    const chin = .007 * gaussian(x / .034) * gaussian((v + .72) / .16);
    const cheek = .006 * gaussian((Math.abs(x) - width * .56) / .022) * gaussian((v + .11) / .22);
    return offset + radius * normal + angle * (eyeSocket + noseBridge + noseTip + nostril + lips + chin + cheek);
  }
  function point(angle, v, scalp = 0) {
    const [xRadius, zRadius, back] = crossSection(v);
    const cosine = Math.cos(angle);
    const x = (xRadius + scalp) * Math.sin(angle);
    const z = cosine > 0 && !scalp
      ? front(x, v, zRadius, back, cosine)
      : back + (zRadius + scalp) * cosine;
    return [x, center + height * v, z];
  }
  function project(x, y, raise = 0) {
    const v = THREE.MathUtils.clamp((y - center) / height, -.997, .997);
    const [radius, depth, offset] = crossSection(v);
    const normal = Math.sqrt(Math.max(.002, 1 - (x / radius) ** 2));
    return [x, y, front(x, v, depth, offset, normal) + raise];
  }
  return { project, point, center, width, height };
}

function hairScalp({ mesh }, head, style, id, features) {
  const trim = { captain: -.29, florist: -.06, courier: -.25, auntie: .02,
    engineer: -.14, painter: .11, diver: -.20, baker: -.19 }[id];
  const silver = id === 'auntie' || id === 'captain';
  mesh(surface(56, 24, (u, v) => {
    const angle = u * Math.PI * 2;
    const front = Math.max(0, Math.cos(angle));
    const sweep = (id === 'florist' || id === 'painter' || id === 'diver')
      ? .22 * Math.sin(angle * 1.9) : .045 * Math.sin(angle * 3.1);
    const lower = -.46 - trim + (features.hairline + .46 + trim) * front ** .90 + sweep;
    const groove = Math.cos(angle * features.strands + 1.6 * Math.sin(v * 3));
    const scalp = (.0035 + .005 * Math.sin(v * Math.PI) + .0022 * groove) * Math.sqrt(1 - v);
    return head.point(angle, THREE.MathUtils.lerp(lower, .999, v), scalp);
  }, { loop: true }), (x,y,z) => {
    const tone = new THREE.Color(style.hair);
    const warm = new THREE.Color(silver ? '#dfd5bf' : '#b87c58');
    const direction = Math.atan2(x, z);
    const highlight = .04 + .11 * gaussian((x + .048) / .054)
      + .055 * (.5 + .5 * Math.sin(direction * features.strands + y * 18));
    return tone.lerp(warm, highlight);
  });
}

function figureBody({ ellipsoid, mesh, strand }, style, id) {
  const [width, rise, depth] = style.build;
  const waist = .229;
  const shoulder = waist + rise + .028;
  const hem = id === 'auntie' ? .162 : id === 'captain' || id === 'baker' ? .183 : .208;
  const sash = id === 'auntie' ? 1.15 : 1;
  mesh(sweep([
    [0,hem-.002,.000,width * .75 * sash,depth * .72],
    [0,hem+.003,.002,width * .88 * sash,depth * .87],
    [0,waist+.016,.005,width*(id === 'florist' ? .70 : .81),depth*.83],
    [0,shoulder-.030,.000,width*.94,depth],
    [0,shoulder-.012,-.002,width*.83,depth*.82],
    [0,shoulder+.006,.009,width*.47,depth*.62],
    [0,shoulder+.010,.009,.0005,.0005],
  ], 26, 32), (x,y) => {
    const textile = new THREE.Color(style.shirt);
    const highlight = new THREE.Color(style.light);
    const fold = .1 + .22 * gaussian((x + width * .42) / (width * .25)) * gaussian((y - shoulder) / .089);
    return textile.lerp(highlight, fold);
  });
  const neckTop = style.face[3] - style.face[1] + .043;
  mesh(sweep([
    [0,shoulder-.007,.009,width*.47,depth*.45],
    [0,shoulder+.023,.009,width*.37,depth*.54],
    [0,neckTop,.011,width*.37,depth*.51],
    [0,neckTop+.008,.011,.001,.001],
  ], 14),style.skin);
  strand(style.light,.004,
    [[-width*.43,shoulder+.004,depth*.38],[0,shoulder-.005,depth*.72],
      [width*.42,shoulder+.005,depth*.40]]);

  const backPleat = id === 'captain' || id === 'auntie' || id === 'baker';
  if (backPleat) {
    strand(style.light, .0027, [[0, shoulder - .028, -depth * .93],
      [0, waist + .023, -depth * .85], [0, hem + .010, -depth * .88]]);
  }

  for (const [index, x] of style.feet.entries()) {
    const side = index ? 1 : -1;
    const back = id === 'courier' && side < 0 ? -.025 : .007;
    const toe = id === 'diver' ? .082 : id === 'baker' ? .063 : .051;
    mesh(sweep([
      [x,.049,back+.014,.0003,.0003],
      [x,.051,back+.014,.029,toe*.81],
      [x,.060,back+.022,.037,toe],
      [x-side*.004,.085,back+.017,.035,toe*.82],
      [x-side*.005,.104,back-.002,.028,.029],
      [x-side*.006,.123,back-.003,.022,.022],
    ], 14, 15),style.boots);
    strand(style.light,.0023,[[x-.021,.066,back+.051],[x,.063,back+toe*.97],[x+.021,.068,back+.051]]);
    mesh(sweep([
      [x-side*.005,.096,back,.028,.026],
      [x-side*.007,.124,back-.001,.029,.027],
      [x-side*.013,.163,back-.006,.032,.033],
      [x*.72,.203,-.002,.036,.035],
      [x*.64,.237,-.006,.026,.025],
    ], 17, 16),style.trousers);
    if (id !== 'auntie') strand(style.light,.0019,[[x+side*.019,.112,back+.015],[x+side*.021,.157,.019],[x*.8+side*.026,.200,.015]]);

    const [hx, hy, hz] = style.arms[index];
    const elbow = [side * (width + .011), (shoulder + hy) / 2 -.007,
      (id === 'courier' && index === 0 ? -.007 : 0) + hz / 2];
    mesh(sweep([
      [side*width*.66,shoulder-.010,-.007,.028,.032],
      [side*width*.88,shoulder-.023,.001,.032,.032],
      [...elbow,.025,.027],
      [hx,hy+.006,hz,.022,.024],
      [hx,hy-.004,hz+.004,.021,.021],
    ], 21, 17),style.shirt);
    mesh(sweep([
      [hx,hy+.012,hz-.002,.022,.024],
      [hx,hy+.004,hz+.004,.025,.024],
      [hx,hy-.005,hz+.008,.022,.022],
    ], 8),style.light);
    const end = [hx + side*.003,hy-.035,hz+.014];
    mesh(sweep([
      [hx,hy+.004,hz+.006,.017,.015],
      [hx,hy-.012,hz+.011,.022,.016],
      [end[0],end[1]+.007,end[2],.021,.016],
      [end[0]-side*.005,end[1],end[2]+.004,.013,.011],
      [end[0]-side*.006,end[1]-.002,end[2]+.004,.002,.003],
    ], 14, 15),style.skin);
    mesh(sweep([
      [hx - side*.009,hy-.009,hz+.016,.009,.010],
      [hx - side*.017,hy-.015,hz+.023,.008,.009],
      [hx - side*.019,hy-.024,hz+.028,.006,.006],
      [hx - side*.016,hy-.026,hz+.031,.002,.002],
    ], 10, 9),style.skin);
    for (const spacing of [-.008, 0, .008]) {
      const px = end[0] + spacing - side * .002;
      strand(style.shade,.0012,[[px,end[1]+.005,end[2]+.013],[px+side*.0005,end[1]+.009,end[2]+.015],[px+side*.0015,end[1]+.014,end[2]+.015]]);
    }
  }
}

function face(model, style, id) {
  const { mesh, ellipsoid, strand } = model;
  const features = faces[id];
  const head = headSurface(style, features);
  const { project, center, width, height } = head;
  const [eyeWidth, opening, separation, eyeLevel] = features.eyes;
  mesh(surface(68, 59, (u, v) => head.point(u * Math.PI * 2, 2 * v - 1), { loop: true }),
    (x, y, z) => {
      const skin = new THREE.Color(style.skin);
      const rose = new THREE.Color(style.shade);
      const v = (y - center) / height;
      const front = z > .023 ? 1 : .25;
      const cheek = gaussian((Math.abs(x) - width * .55) / .026) * gaussian((v + .17) / .23);
      const temple = .17 * (Math.abs(x) / width) ** 2;
      const mouth = .17 * gaussian(x / .030) * gaussian((v + .52) / .15);
      const warm = .22 * features.age * gaussian((v + .15) / .40);
      return skin.lerp(rose, front * (.21 * cheek + temple + mouth + warm));
    });
  hairScalp(model, head, style, id, features);
  for (const side of [-1,1]) {
    // An inset helix rather than a contrasting disc gives the ear its depth.
    const earX = side * width * .97;
    const earY = center - height * .085;
    ellipsoid(style.skin,[earX,earY,-.002],[.016,.022,.012],side*-.28);
    strand(style.shade,.0024,[[earX-side*.006,earY+.009,.008],[earX+side*.004,earY+.010,.009],
      [earX+side*.007,earY+.001,.010],[earX+side*.003,earY-.007,.009]]);
    const x = side * width * separation;
    const y = center + height * eyeLevel + side * (id === 'painter' ? .003 : .0008);
    const tip = (t) => side * (id === 'engineer' ? -.0035 : id === 'baker' ? -.0007 : .0031) * t;
    const shape = (t) => Math.sin(Math.PI * t) ** .81;
    const upper = (t) => y + tip(2*t-1) + shape(t) * opening;
    const lower = (t) => y + tip(2*t-1) - shape(t) * opening * .59;
    if (id !== 'diver') {
      const squint = id === 'baker' || id === 'auntie';
      if (!squint) {
        mesh(surface(13,6,(u,v) => {
          const ex = x + (u*2-1)*eyeWidth;
          return project(ex,THREE.MathUtils.lerp(lower(u),upper(u),v),
            .001 + .0038*Math.sin(v*Math.PI)*shape(u));
        }), '#f6e7d3', true);
        const gaze = id === 'courier' ? .005 : id === 'captain' ? .001 : -.001;
        const eye = project(x+gaze,y+.001,.0039);
        ellipsoid(style.eyes,eye,[opening*.86,opening*.93,.0011],0,true);
        ellipsoid(ink,[eye[0]+.0006,eye[1]+.0001,eye[2]+.0016],[opening*.46,opening*.59,.0011],0,true);
        ellipsoid(ivory,[eye[0]-.0015,eye[1]+.002,eye[2]+.0026],[.0013,.0013,.0007],0,true);
      }
      const lid = Array.from({length:7},(_,n) => {
        const t=n/6;
        return [...project(x+(2*t-1)*eyeWidth,upper(t),.0015),.0013+shape(t)*.0016,.0012+shape(t)*.0015];
      });
      mesh(sweep(lid,14,8),squint ? '#574146' : '#47343b');
    }
    const brow = Array.from({length:6},(_,n) => {
      const t=n/5;
      const fx=x+eyeWidth*(2*t-1)*1.06;
      const fy=y+.019+Math.sin(t*Math.PI)*features.brow+(side*2*t-side)*features.brow*.55;
      return [...project(fx,fy,.001),.0009+shape(t)*(id === 'engineer' ? .0033 : .0025),.001+shape(t)*.0012];
    });
    mesh(sweep(brow,14,8),style.hair);
    if (features.age > .6) {
      for (const lift of [.009,.014]) {
        strand(style.shade,.0012,[-.75,0,.72].map(t => project(x+t*eyeWidth,y-lift+Math.abs(t)*.003,.001)));
      }
    }
    const [nose, noseWidth, noseY] = features.nose;
    const nostril = project(side*noseWidth*.65,center + (noseY-.07)*height,.0008);
    ellipsoid(style.shade,nostril,[nose*.105,.0018,.001],side*.22);
  }
  const mouth = width * (id === 'florist' || id === 'baker' ? .31 : .27);
  const lipY = center - height * .47;
  const arc = (t) => lipY + features.smile*(t*t-.17)*.66 + t*(id === 'courier' || id === 'painter' ? .004 : .001);
  mesh(surface(16,5,(u,v) => {
    const t = u*2-1;
    const lip = (v * .011 - .006) * Math.sin(u*Math.PI);
    return project(t * mouth, arc(t) + lip, .0017);
  }),style.shade);
  const line = Array.from({length:7},(_,n) => {
    const t=(n-3)/3;
    return [...project(t * mouth, arc(t),.0026),.0006+(1-Math.abs(t))*.0014,.0014];
  });
  mesh(sweep(line,16,8),'#6a3d44');
  if (id === 'florist' || id === 'auntie') {
    strand('#e7c7a9',.0015,[-.38,0,.5].map(t => project(t*mouth,arc(t)+.0015,.004)));
  }
  if (features.age > .7) {
    for (const side of [-1,1]) {
      strand(style.shade,.0012,[[.018,-.023],[.031,-.034],[.038,-.045]]
        .map(([x,y])=>project(x*side,center+y,.001)));
    }
  }
  return head;
}

function collar({ strand, ellipsoid }, from, to, color, width = .008) {
  for (const s of [-1, 1]) {
    strand(color, width, [[s * from, .372, .038], [s * ((from + to) / 2), .341, .056], [s * to, .314, .070]]);
  }
  ellipsoid(brass, [0, .329, .074], [.010, .010, .004], 0, true);
}

function sweptHair({ mesh }, color, catches, paths) {
  for (const knots of paths) {
    mesh(sweep(knots, 18, 14), (x, y, z) => {
      const hair = new THREE.Color(color);
      const ridges = .5 + .5 * Math.sin((x - y * .6) * 280);
      return hair.lerp(new THREE.Color(catches), .07 + .28 * gaussian((z - .086) / .022) * ridges);
    });
  }
}

function tailoredPanel({ mesh }, tint, bands) {
  mesh(surface(24, 18, (u, v) => {
    const row = v * (bands.length - 1);
    const lower = Math.min(Math.floor(row), bands.length - 2);
    const [y, width, z, curve] = bands[lower].map((value, index) =>
      THREE.MathUtils.lerp(value, bands[lower + 1][index], row - lower));
    const edge = 2 * u - 1;
    return [width * edge, y + curve * edge ** 2, z - .019 * edge ** 2];
  }), (x, y) => new THREE.Color(tint).lerp(new THREE.Color('#f5e1ba'),
    .05 + .14 * (.5 + .5 * Math.sin(x * 105 + y * 21)) ** 3));
}

function capCrown({ mesh }, tint, highlight, rings, lobes = 0, amplitude = 0, polish = false) {
  const profile = new THREE.CatmullRomCurve3(rings.map(([y, width, depth]) =>
    new THREE.Vector3(width, y, depth)));
  mesh(surface(48, 20, (u, v) => {
    const angle = 2 * Math.PI * u;
    const {x, y, z} = profile.getPoint(v);
    const fold = 1 + amplitude * Math.cos(lobes * angle) * Math.sin(v * Math.PI);
  const tilt = .09 * Math.sin(angle) * x;
    return [Math.sin(angle) * x * fold - .012 * v, y + tilt, Math.cos(angle) * z * fold - .007];
  }, { loop: true }), (x, y, z) => new THREE.Color(tint).lerp(new THREE.Color(highlight),
    .17 + .46 * gaussian((x + .056) / .096) * gaussian((z - .027) / .144)
      * gaussian((y - rings.at(-1)[0]) / .12)), polish);
}

function captain(model, style, head) {
  const { ellipsoid, mesh, puck, strand } = model;
  mesh(surface(44, 22, (u, v) => {
    const edge = 2 * u - 1;
    const tuft = Math.cos(12 * Math.PI * u + 2 * v);
    const y = .403 + .038 * Math.abs(edge) ** 1.65 + (.082 + .027 * edge ** 2) * v + .002 * tuft;
    const x = edge * (.049 + .043 * Math.sin(v * Math.PI / 2));
    const volume = Math.sin(Math.PI * v) * (.019 + .0035 * tuft) * (1 - .53 * edge ** 2);
    return head.project(x, y, volume + .003);
  }), (x, y) => new THREE.Color('#b7a595').lerp(new THREE.Color('#f8e9cb'),
    .35 + .21 * Math.sin(x * 372 + y * 33) + .22 * gaussian((x + .034) / .062)));
  for (const side of [-1, 1]) {
    mesh(sweep([[side*.003,.484,.108,.002,.004],[side*.019,.482,.105,.010,.011],
      [side*.035,.476,.101,.008,.010],[side*.054,.473,.084,.0007,.001]], 16), '#ebdcc1');
  }
  capCrown(model, '#d9d1ba', '#fff4d5',
    [[.603,.088,.075],[.616,.110,.091],[.643,.107,.087],[.660,.075,.069],[.673,.001,.001]]);
  puck('#203e55', [0,.609,.004], [.100,.023,.087], .035);
  ellipsoid('#23364b', [.008,.597,.080], [.095,.012,.050], .04, true);
  strand(brass,.004,[[-.082,.608,.055],[-.027,.610,.084],[.041,.611,.085],[.081,.615,.061]]);
  ellipsoid('#364b62',[0,.636,.079],[.020,.018,.010]);
  strand(polished,.004,[[0,.646,.089],[0,.634,.090],[0,.629,.090]],true);
  strand(brass,.004,[[-.011,.635,.090],[-.009,.631,.090],[0,.626,.090],[.010,.631,.090],[.011,.635,.089]],true);
  ellipsoid(polished,[0,.648,.090],[.006,.006,.002],0,true);
  collar(model,.061,.022,ivory,.012);
  for (const x of [-.035,.035]) for (const y of [.214,.257,.291]) {
    ellipsoid(brass, [x,y,.066],[.009,.009,.005],0,true);
    ellipsoid(polished,[x-.002,y+.002,.071],[.004,.004,.002],0,true);
  }
  for (const index of [0,1,2]) {
    const y = .350 - index*.012;
    strand(index % 2 ? brass : polished,.004,[[-.087,y+.018,.051],[-.107,y,.058],[-.091,y-.032,.066],[-.066,y-.030,.072]],true);
  }
}

function florist(model, style) {
  const { ellipsoid, hem, strand } = model;
  sweptHair(model, style.hair, '#a76a4b', [
    [[.051,.572,-.040,.022,.016],[.062,.614,-.043,.047,.040],[.060,.647,-.040,.036,.035],[.052,.664,-.035,.001,.001]],
    [[.061,.617,.016,.016,.016],[.025,.617,.047,.022,.022],[-.024,.594,.072,.023,.019],[-.063,.559,.068,.016,.013],[-.070,.530,.045,.001,.001]],
    [[.069,.603,.017,.017,.018],[.082,.580,.032,.018,.014],[.080,.552,.033,.012,.012],[.072,.529,.029,.001,.001]],
  ]);
  strand('#a07058',.0038,[[.065,.621,.011],[.090,.633,-.005],[.096,.622,-.020]]);
  for (const [x,y] of [[.073,.621],[.090,.631],[.100,.617]]) {
    flower(model,x,y,.043,'#dc8b76');
  }
  for (const side of [-1,1]) {
    strand(brass,.0024,[[side*.086,.497,.007],[side*.089,.483,.014],
      [side*.086,.477,.019]],true);
    ellipsoid(brass,[side*.086,.475,.019],[.007,.009,.007],0,true);
    strand(ivory,.006,[[side*.060,.349,.045],[side*.050,.317,.058],[side*.048,.274,.068]]);
  }
  tailoredPanel(model, '#e0cda4', [[.191,.064,.062,.010],[.209,.067,.068,.004],
    [.281,.053,.077,-.003],[.318,.041,.068,.006]]);
  strand('#968e6f',.002,[[-.044,.283,.068],[0,.277,.079],[.044,.283,.069]]);
  for (const side of [-1,1]) {
    strand('#cebd91',.005,[[side*.060,.349,.008],[side*.054,.323,-.043],[side*.028,.274,-.055],
      [side*.013,.249,-.052]]);
  }
  strand('#e2ceaa',.004,[[-.040,.232,-.044],[0,.246,-.053],[.037,.227,-.041]]);
  strand('#629683',.006,[[-.037,.253,.078],[-.005,.247,.082],[.036,.253,.079]]);
  hem('#b57554',[.114,.281,.123],[.031,.055,.028]);
  ellipsoid('#d28f65',[.114,.308,.122],[.030,.011,.028]);
  for (const [x,y,color] of [[.094,.351,'#f1bd65'],[.132,.372,'#c97159'],[.147,.339,'#e9ded0']]) {
    strand('#5a8361',.005,[[.113,.308,.123],[x,.329,.120],[x,y,.116]]);
    ellipsoid('#78a175',[x-.009,y-.019,.120],[.009,.019,.004],.67);
    flower(model,x,y,.125,color);
  }
}

function flower({ ellipsoid }, x, y, z, color) {
  for (let index = 0; index < 5; index++) {
    const angle = index * Math.PI * .4;
    ellipsoid(color,[x+Math.cos(angle)*.011,y+Math.sin(angle)*.011,z],[.012,.007,.006],angle);
  }
  ellipsoid(brass,[x,y,z+.005],[.007,.007,.004],0,true);
  ellipsoid(polished,[x-.001,y+.002,z+.009],[.0025,.003,.002],0,true);
}

function courier(model, style) {
  const { ellipsoid, puck, strand } = model;
  sweptHair(model, style.hair, '#83553d', [
    [[-.055,.606,.032,.019,.016],[-.037,.591,.063,.022,.015],[.005,.563,.079,.022,.012],[.036,.548,.069,.001,.001]],
    [[.058,.599,.009,.020,.018],[.075,.574,.026,.017,.017],[.077,.544,.044,.014,.013],[.071,.521,.039,.001,.001]],
  ]);
  capCrown(model, '#3c6199', '#7197c7',
    [[.586,.083,.074],[.600,.100,.085],[.630,.093,.083],[.651,.063,.063],[.663,.001,.001]]);
  puck('#324a71',[0,.599,.014],[.101,.018,.082],-.10);
  ellipsoid('#2c496e',[.027,.589,.086],[.100,.011,.058],-.10,true);
  strand('#7398bf',.004,[[-.046,.649,.037],[-.060,.635,.055],[-.068,.615,.064],[-.065,.601,.063]]);
  ellipsoid('#d57c62',[-.018,.623,.070],[.031,.014,.006],-.12);
  strand(ivory,.004,[[-.036,.625,.077],[-.020,.625,.078],[-.005,.625,.077]]);
  strand(brass,.0024,[[-.084,.497,.007],[-.087,.485,.013],[-.084,.478,.018]],true);
  ellipsoid(brass,[-.084,.479,.017],[.007,.009,.007],0,true);
  collar(model,.049,.018,'#84a2a9',.007);
  strand('#e08b73',.011,[[-.104,.338,.011],[-.092,.323,.037],[-.087,.309,.045]]);
  strand('#a3cac2',.010,[[.082,.338,.026],[.103,.315,.043],[.108,.282,.055]]);
  strand('#b1835c',.015,[[-.067,.354,.046],[-.021,.306,.074],[.048,.257,.071],[.103,.223,.043]]);
  strand('#dfb184',.004,[[-.067,.358,.058],[-.021,.312,.088],[.038,.268,.086],[.099,.231,.063]]);
  ellipsoid('#916048',[.102,.223,.045],[.057,.049,.041],-.14);
  ellipsoid('#c89664',[.099,.235,.075],[.052,.034,.021],-.14);
  ellipsoid(ivory,[.112,.231,.093],[.019,.013,.003],-.12);
  strand('#a77b59',.0025,[[.097,.238,.095],[.111,.230,.097],[.125,.236,.096]]);
  strand('#b1835c',.008,[[-.066,.356,.037],[-.077,.334,-.033],[-.035,.309,-.060],
    [.039,.272,-.053],[.096,.235,.024]]);
}

function auntie(model, style) {
  const { ellipsoid, hem, strand } = model;
  sweptHair(model, style.hair, '#fff0d3', [
    [[.019,.552,-.060,.017,.021],[.028,.584,-.074,.048,.033],[.020,.611,-.065,.038,.027],[.012,.635,-.058,.001,.001]],
    [[.045,.560,-.041,.018,.019],[-.001,.576,.009,.031,.023],[-.045,.554,.053,.024,.015],[-.077,.512,.044,.014,.014],[-.084,.487,.019,.001,.001]],
    [[.007,.565,.029,.011,.018],[.043,.562,.048,.024,.018],[.083,.523,.042,.017,.016],[.088,.476,.002,.001,.001]],
  ]);
  for (const side of [-1,1]) {
    const x = side*.039;
    const points = Array.from({length:13},(_,index) => {
      const angle = index*Math.PI/6;
      return [x+Math.cos(angle)*.031,.496+Math.sin(angle)*.024,.102-.19*Math.abs(x+Math.cos(angle)*.031)];
    });
    strand('#744b6c',.0056,points,true);
    strand(brass,.0027,[[side*.093,.468,.006],[side*.097,.459,.016],
      [side*.092,.453,.027]],true);
    ellipsoid(brass,[side*.092,.453,.027],[.007,.009,.006],0,true);
  }
  strand('#754d66',.005,[[-.009,.499,.102],[0,.505,.109],[.010,.499,.104]]);
  ellipsoid('#c77c79',[0,.36,.030],[.075,.028,.047],-.07);
  strand('#e4a192',.007,[[-.058,.361,.048],[-.020,.345,.071],[.041,.353,.062]]);
  ellipsoid('#d89988',[-.013,.317,.064],[.021,.042,.015],-.45);
  ellipsoid('#ca8078',[.018,.319,.066],[.020,.035,.016],.43);
  ellipsoid(brass,[.009,.340,.081],[.012,.012,.006],0,true);
  hem('#91b7a6',[.114,.291,.124],[.032,.041,.028],0,true);
  ellipsoid('#542f2a',[.115,.311,.125],[.028,.003,.024]);
  strand('#f3dec2',.003,[[.088,.312,.126],[.097,.312,.143],[.117,.312,.148],[.139,.312,.136],[.142,.312,.119]]);
  strand('#9dc7b2',.006,[[.141,.305,.116],[.159,.306,.119],[.165,.294,.122],[.157,.283,.121],[.140,.279,.119]],true);
  strand('#c18d9d',.003,[[.063,.363,-.021],[.037,.378,-.035],[-.032,.375,-.037],[-.058,.365,-.025]]);
}

function engineer(model, style) {
  const { ellipsoid, band, strand } = model;
  sweptHair(model, style.hair, '#7e5447', [
    [[-.065,.601,.025,.018,.017],[-.074,.575,.047,.020,.015],[-.074,.554,.049,.013,.013],[-.080,.537,.039,.001,.002]],
    [[.055,.601,.031,.019,.017],[.066,.571,.049,.021,.016],[.072,.550,.051,.013,.012],[.086,.532,.035,.001,.001]],
  ]);
  band('#ca7c31',[0,.607,.004],[.116,.015,.106],-.02,true);
  capCrown(model, '#d99743', '#ffcd71',
    [[.595,.105,.091],[.610,.110,.092],[.642,.092,.084],[.676,.059,.051],[.690,.001,.001]],
    3, .024, true);
  strand('#ffc976',.006,[[0,.619,.096],[-.004,.659,.078],[-.008,.687,.024],[-.011,.673,-.053]],true);
  strand('#f5c46c',.004,[[-.09,.611,.045],[-.076,.610,.081],[-.041,.609,.102],[-.005,.608,.109],[.030,.608,.109],[.079,.606,.079],[.099,.607,.04]]);
  ellipsoid('#528d83',[.032,.634,.083],[.019,.011,.005],-.1);
  ellipsoid(ivory,[.027,.634,.089],[.005,.005,.002],0,true);
  strand(brass,.0023,[[.091,.494,.006],[.096,.481,.013],[.094,.472,.023]],true);
  ellipsoid(brass,[.094,.472,.023],[.007,.008,.006],0,true);
  tailoredPanel(model, '#526c6c', [[.179,.056,.059,.012],[.204,.068,.073,.007],
    [.257,.058,.081,.002],[.300,.047,.078,.004]]);
  tailoredPanel(model, '#6b8781', [[.239,.022,.083,.004],[.249,.035,.088,0],[.277,.038,.088,0]]);
  strand('#a09e80',.004,[[-.028,.269,.081],[-.021,.259,.083],[.010,.257,.085],[.025,.264,.083]]);
  for (const side of [-1,1]) {
    strand('#617b76',.010,[[side*.060,.353,.037],[side*.052,.311,.054],[side*.040,.279,.073]]);
    ellipsoid(brass,[side*.041,.278,.083],[.009,.009,.003],0,true);
    strand('#6a8176',.007,[[side*.060,.357,.005],[side*.057,.323,-.041],
      [side*.035,.267,-.065],[side*.041,.196,-.050]]);
  }
  strand('#aababb',.009,[[.116,.251,.094],[.123,.295,.106],[.132,.344,.108]],true);
  strand('#bdc5be',.007,[[.119,.355,.109],[.113,.342,.111],[.122,.333,.111],[.134,.341,.111],[.142,.356,.108],[.139,.366,.105]],true);
}

function painter(model, style) {
  const { ellipsoid, strand } = model;
  sweptHair(model, style.hair, '#ae7451', [
    [[.034,.610,.025,.017,.013],[.008,.600,.061,.028,.016],[-.035,.576,.067,.023,.017],[-.069,.538,.048,.020,.014],[-.072,.495,.054,.014,.011],[-.056,.469,.057,.001,.002]],
    [[.055,.602,.031,.016,.013],[.069,.578,.050,.017,.014],[.084,.533,.030,.019,.016],[.080,.487,.048,.018,.014],[.059,.458,.051,.001,.001]],
  ]);
  capCrown(model, '#65516b', '#a87591',
    [[.590,.092,.075],[.604,.105,.078],[.626,.111,.088],[.645,.085,.075],[.654,.001,.001]]);
  ellipsoid('#5c4b64',[-.002,.601,.017],[.096,.012,.075],.10);
  ellipsoid('#735670',[-.032,.654,.012],[.009,.012,.008],.36);
  collar(model,.056,.022,'#e0c7a1',.012);
  ellipsoid('#c86b68',[.006,.341,.075],[.022,.017,.011],.03);
  strand('#d78a73',.009,[[.004,.339,.079],[-.012,.313,.085],[-.027,.294,.074]]);
  strand('#a14e5b',.009,[[.010,.339,.074],[.020,.314,.078],[.021,.304,.072]]);
  ellipsoid('#b78363',[-.111,.252,.127],[.052,.034,.013],.49);
  ellipsoid('#d8ab7f',[-.112,.257,.136],[.044,.027,.010],.49);
  for (const [tint,x,y] of [['#4a998c',-.136,.262],['#e8ac62',-.116,.277],['#cc745d',-.093,.269],[ivory,-.112,.246]]) {
    ellipsoid(tint,[x,y,.146],[.010,.008,.004],.2,true);
  }
  strand('#7a5039',.006,[[.096,.248,.101],[.117,.305,.117],[.138,.371,.124]]);
  strand(brass,.008,[[.136,.363,.124],[.140,.376,.126],[.141,.380,.126]],true);
  ellipsoid('#d4796b',[.145,.391,.128],[.010,.016,.011],-.26);
  ellipsoid('#debaa1',[.147,.401,.128],[.009,.006,.008],-.26);
}

function diver(model, style) {
  const { ellipsoid, mesh, puck, strand } = model;
  sweptHair(model, style.hair, '#607466', [
    [[.056,.600,.023,.016,.018],[.021,.611,.052,.024,.016],[-.027,.589,.069,.023,.015],[-.053,.553,.056,.019,.014],[-.073,.509,.034,.001,.001]],
    [[.046,.598,-.040,.021,.017],[.055,.616,-.066,.031,.034],[.057,.590,-.082,.031,.028],[.062,.567,-.079,.001,.001]],
  ]);
  strand('#78ab97',.005,[[-.079,.528,.034],[-.073,.569,.058],[-.048,.602,.053],[-.016,.614,.043],[.038,.606,.045]]);
  strand('#263943',.008,[[-.086,.529,.030],[0,.522,.102],[.085,.528,.032]]);
  for (const side of [-1,1]) {
    const x = side*.035;
    ellipsoid('#223943',[x,.528,.094],[.036,.025,.015],side*.14,true);
    ellipsoid('#488b8c',[x,.529,.104],[.031,.021,.013],side*.14,true);
    ellipsoid('#8ec7b8',[x-.007,.534,.111],[.021,.012,.009],side*.22,true);
    ellipsoid('#b9e0ce',[x-.010,.539,.118],[.013,.004,.002],.45,true);
    ellipsoid('#e6f4d8',[x-.020,.540,.119],[.004,.004,.002],.45,true);
    strand('#94bdaf',.007,[[side*.047,.343,.041],[side*.060,.285,.062],[side*.059,.228,.051]]);
  }
  strand('#d39146',.011,[[.091,.627,.027],[.103,.580,.038],[.106,.509,.043],[.081,.457,.058],[.058,.453,.082]]);
  strand('#f1b663',.004,[[.085,.624,.037],[.095,.581,.046],[.096,.513,.052],[.074,.465,.070]]);
  puck('#b55747',[.091,.630,.027],[.015,.024,.015],.08,true);
  mesh(sweep([[0,.190,-.079,.004,.006],[0,.202,-.087,.046,.041],[0,.232,-.088,.057,.050],
    [0,.304,-.086,.058,.052],[0,.339,-.079,.042,.042],[0,.350,-.076,.017,.021]],
  20, 24), (x, y) => new THREE.Color('#ba8545').lerp(new THREE.Color('#eac288'),
    .26 + .42 * gaussian((x + .023) / .035) * gaussian((y - .29) / .13)));
  for (const y of [.232,.287]) {
    strand('#385a5a',.006,[[-.052,y,-.065],[-.040,y,-.122],[0,y,-.140],
      [.044,y,-.120],[.056,y,-.066]]);
  }
  puck('#42686b',[0,.351,-.073],[.022,.018,.021],0,true);
  strand('#dcaf68',.006,[[0,.358,-.070],[.046,.354,-.056],[.095,.331,.005],[.104,.300,.047]]);
  strand('#3e555d',.007,[[0,.347,.059],[0,.289,.074],[0,.233,.059]]);
  ellipsoid(brass,[0,.300,.080],[.008,.011,.004],0,true);
}

function baker(model, style) {
  const { ellipsoid, puck, strand } = model;
  sweptHair(model, style.hair, '#c6a99a', [
    [[-.002,.462,.100,.001,.001],[-.021,.463,.106,.010,.009],[-.035,.457,.100,.007,.007],[-.053,.452,.089,.001,.001]],
    [[.003,.461,.101,.001,.001],[.022,.463,.106,.010,.010],[.037,.457,.100,.007,.007],[.055,.452,.088,.001,.001]],
  ]);
  puck('#dac7af',[0,.590,.001],[.098,.038,.081]);
  capCrown(model, '#e3d0b3', '#fff5d6',
    [[.599,.091,.075],[.620,.111,.081],[.656,.108,.083],[.686,.075,.061],[.698,.001,.001]],
    7, .12);
  strand('#bfb4a5',.004,[[-.079,.607,.038],[-.050,.603,.069],[0,.606,.081],[.053,.611,.072],[.079,.616,.039]]);
  tailoredPanel(model, '#c69876', [[.160,.085,.077,.012],[.195,.093,.086,.004],
    [.255,.077,.099,-.004],[.293,.060,.094,.004]]);
  tailoredPanel(model, '#dbb994', [[.210,.046,.093,.004],[.226,.055,.103,.001],[.257,.058,.103,0]]);
  strand('#8f6552',.0026,[[-.055,.257,.098],[0,.254,.106],[.055,.257,.098]]);
  ellipsoid(brass,[.06,.27,.095],[.007,.008,.005],0,true);
  strand('#d6ad87',.010,[[-.066,.350,.055],[-.059,.306,.070],[-.061,.271,.089]]);
  strand('#b78a72',.010,[[.071,.352,.057],[.066,.308,.076],[.059,.271,.089]]);
  strand('#d6baa0',.016,[[.087,.320,.061],[.098,.276,.083],[.101,.231,.086]]);
  for (const y of [.244,.259,.274]) {
    strand('#af7d74',.003,[[.090,y,.097],[.103,y-.003,.102],[.114,y-.004,.096]]);
  }
  strand('#d6ad87',.006,[[.080,.238,-.015],[.048,.234,-.067],[0,.230,-.079],
    [-.052,.235,-.072],[-.084,.244,-.021]]);
  model.mesh(sweep([[-.177,.257,.138,.003,.004],[-.151,.271,.143,.025,.027],
    [-.122,.285,.146,.034,.033],[-.089,.300,.146,.026,.028],[-.063,.306,.141,.002,.004]],
  20, 22), (x, y, z) => new THREE.Color('#ad663e').lerp(new THREE.Color('#e9b267'),
    .27 + .51 * gaussian((y - .302) / .027) * gaussian((z - .167) / .04)));
  for (const [x,y,z] of [[-.153,.275,.170],[-.130,.287,.181],[-.103,.296,.180]]) {
    strand('#a36442',.005,[[x+.007,y+.009,z],[x-.001,y+.012,z+.003],[x-.009,y+.024,z-.006]]);
    strand('#ffde9e',.003,[[x+.007,y+.014,z+.001],[x-.001,y+.017,z+.003],[x-.008,y+.025,z-.006]]);
  }
}

const outfits = { captain, florist, courier, auntie, engineer, painter, diver, baker };

export function createPawn(character) {
  const pawn = new THREE.Group();
  pawn.name = character.id;
  pawn.rotation.y = Math.PI / 4;
  const base = new THREE.Group();
  base.name = 'stand';
  const stand = sculpture();
  stand.puck('#654838', [0,.016,0], [.167,.032,.167]);
  stand.puck(character.color, [0,.034,0], [.169,.013,.169]);
  stand.puck('#9e6546', [0,.045,0], [.157,.012,.157]);
  stand.finish(base);
  pawn.add(base);

  const model = sculpture();
  const figure = new THREE.Group();
  figure.name = `${character.id}-figure`;
  const style = styles[character.id];
  figureBody(model, style, character.id);
  const head = face(model, style, character.id);
  outfits[character.id](model, style, head);
  model.finish(figure);
  // A common top keeps the seat labels aligned while leaving the real silhouette intact.
  const box = new THREE.Box3().setFromObject(figure);
  figure.scale.y = (.77 - .05) / (box.max.y - .05);
  figure.position.y = .05 * (1 - figure.scale.y);
  pawn.add(figure);
  return pawn;
}
