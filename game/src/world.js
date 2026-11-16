// Meridian Yard: an original dusk container yard, 36 x 28 m, with three lanes.
// West and east lanes run along the walls; the mid yard crosses a container plaza
// between the two objective sites, A (west) and B (east). Every box is a collider
// for bodies and a surface a bullet stops on. No models, no textures from files:
// the site letters are canvas textures drawn at runtime.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WALL_HEIGHT = 5;

function letterTexture(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)';
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = color;
  g.font = 'bold 64px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 64, 70);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const colliders = [];
  const shootables = [];
  const wallMeshes = [];

  function box(width, height, depth, x, y, z, material, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
      wallMeshes.push(mesh);
    }
    return mesh;
  }

  // Ground and perimeter: 36 x 28 m, walls 5 m high, open dusk sky above.
  box(36.4, 0.4, 28.4, 0, -0.2, 0, 'canvas');
  box(0.4, WALL_HEIGHT, 28.4, -18.2, WALL_HEIGHT / 2, 0, 'surface');
  box(0.4, WALL_HEIGHT, 28.4, 18.2, WALL_HEIGHT / 2, 0, 'surface');
  box(36.4, WALL_HEIGHT, 0.4, 0, WALL_HEIGHT / 2, -14.2, 'surface');
  box(36.4, WALL_HEIGHT, 0.4, 0, WALL_HEIGHT / 2, 14.2, 'surface');

  // Mid plaza: two stacked containers split the middle lane, crates to crouch behind.
  box(3.6, 2.6, 1.4, -3.2, 1.3, -2.0, 'sand');
  box(3.6, 2.6, 1.4, 3.2, 1.3, -2.0, 'hairline');
  box(3.6, 1.3, 1.4, -3.2, 3.25, -2.0, 'surface');
  box(1.2, 1.1, 1.2, -7.5, 0.55, 1.5, 'hairline');
  box(1.2, 1.1, 1.2, 7.5, 0.55, 1.5, 'hairline');
  box(2.4, 0.9, 1.2, -1.0, 0.45, 5.6, 'hairline');
  box(2.4, 0.9, 1.2, 1.0, 0.45, 5.6, 'surface');
  // A low loading platform you can jump onto for a sightline over the plaza.
  box(4.0, 0.9, 2.4, 0, 0.45, 3.2, 'sand');
  // North sightline breaker between the two sites.
  box(1.4, 3.4, 1.4, 0, 1.7, -8.6, 'surface');

  // West lane: container wall with a gap, crates at the site approach.
  box(1.4, 2.6, 6.0, -12.5, 1.3, -2.0, 'hairline');
  box(1.4, 2.6, 4.0, -12.5, 1.3, 6.0, 'sand');
  box(1.2, 1.1, 1.2, -15.5, 0.55, -5.5, 'hairline');
  box(1.2, 1.1, 1.2, -10.0, 0.55, -11.5, 'hairline');
  // East lane mirrors it.
  box(1.4, 2.6, 6.0, 12.5, 1.3, -2.0, 'sand');
  box(1.4, 2.6, 4.0, 12.5, 1.3, 6.0, 'hairline');
  box(1.2, 1.1, 1.2, 15.5, 0.55, -5.5, 'hairline');
  box(1.2, 1.1, 1.2, 10.0, 0.55, -11.5, 'hairline');
  // South spawn cover: two crates either side of the attacker gate.
  box(1.2, 1.1, 1.2, -6.0, 0.55, 10.5, 'hairline');
  box(1.2, 1.1, 1.2, 6.0, 0.55, 10.5, 'hairline');

  // Objective sites: a floor ring, a beacon column and a floating letter.
  function site(letter, x, z, colorName) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 1.9, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE[colorName]), side: THREE.DoubleSide, transparent: true, opacity: 0.7 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.02, z);
    group.add(ring);
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 5, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE[colorName]), transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    beacon.position.set(x, 2.5, z);
    group.add(beacon);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({ map: letterTexture(letter, PALETTE[colorName]), transparent: true, side: THREE.DoubleSide, depthWrite: false }),
    );
    sign.position.set(x, 3.4, z);
    group.add(sign);
    const light = new THREE.PointLight(new THREE.Color(PALETTE[colorName]), 14, 12);
    light.position.set(x, 2.2, z);
    group.add(light);
    return { letter, pos: new THREE.Vector3(x, 0, z), ring, beacon, sign };
  }
  const sites = {
    A: site('A', -13, -9, 'teal'),
    B: site('B', 13, -9, 'ember'),
  };

  // Light: low dusk sun from the south-west, cool sky fill, warm yard lamps.
  scene.add(new THREE.HemisphereLight(new THREE.Color(PALETTE.sky), new THREE.Color(PALETTE.canvas), 1.35));
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.6);
  sun.position.set(-14, 18, 16);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -22;
  sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.5);
  fill.position.set(10, 12, -12);
  scene.add(fill);

  // Routes bots patrol: each a loop of waypoints through the yard.
  const routes = {
    west: [[-15.5, 8], [-15.5, -1], [-13, -6], [-9, -9], [-9, -4], [-13, 2], [-15.5, 8]],
    east: [[15.5, 8], [15.5, -1], [13, -6], [9, -9], [9, -4], [13, 2], [15.5, 8]],
    mid: [[-6, 10], [-6, 3], [0, 0], [6, 3], [6, 10], [0, 8], [-6, 10]],
    holdA: [[-15, -11], [-11, -11], [-11, -7], [-15, -7], [-15, -11]],
    holdB: [[15, -11], [11, -11], [11, -7], [15, -7], [15, -11]],
  };

  const raycaster = new THREE.Raycaster();
  raycaster.far = 100;
  const losDir = new THREE.Vector3();

  return {
    colliders,
    shootables,
    wallMeshes,
    sites,
    routes,
    spawns: {
      atk: [[-4, 11], [0, 11.5], [4, 11]],
      def: [[-13, -11.5], [0, -12], [13, -11.5]],
    },
    // True when nothing solid stands between the two points.
    hasLineOfSight(a, b) {
      losDir.subVectors(b, a);
      const dist = losDir.length();
      if (dist < 0.01) return true;
      losDir.divideScalar(dist);
      raycaster.set(a, losDir);
      raycaster.far = dist;
      return raycaster.intersectObjects(wallMeshes, false).length === 0;
    },
  };
}
