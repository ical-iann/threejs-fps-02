// Transient combat effects, all pooled: tracers, impact sparks and explosions.
// Nothing is allocated in a frame; a fired effect reuses the oldest slot.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 24;
const SPARKS = 16;
const BLASTS = 4;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  const sparks = [];
  for (let i = 0; i < SPARKS; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.14),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    scene.add(mesh);
    sparks.push({ mesh, life: 0, vel: new THREE.Vector3() });
  }
  const blasts = [];
  for (let i = 0; i < BLASTS; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false }),
    );
    const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 14);
    scene.add(mesh);
    scene.add(light);
    blasts.push({ mesh, light, life: 0 });
  }
  let tracerNext = 0;
  let sparkNext = 0;
  let blastNext = 0;

  return {
    tracer(from, to) {
      const t = tracers[tracerNext];
      tracerNext = (tracerNext + 1) % TRACERS;
      const attr = t.line.geometry.getAttribute('position');
      attr.setXYZ(0, from.x, from.y, from.z);
      attr.setXYZ(1, to.x, to.y, to.z);
      attr.needsUpdate = true;
      t.line.material.opacity = 0.9;
      t.life = 0.09;
    },
    spark(point) {
      const s = sparks[sparkNext];
      sparkNext = (sparkNext + 1) % SPARKS;
      s.mesh.position.copy(point);
      s.mesh.material.opacity = 1;
      s.mesh.lookAt(point.x + 1, point.y + 1, point.z);
      s.vel.set((Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2);
      s.life = 0.35;
    },
    explosion(point) {
      const b = blasts[blastNext];
      blastNext = (blastNext + 1) % BLASTS;
      b.mesh.position.copy(point);
      b.light.position.copy(point);
      b.mesh.scale.setScalar(0.4);
      b.mesh.material.opacity = 0.85;
      b.light.intensity = 60;
      b.life = 0.5;
    },
    step(dt) {
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      }
      for (const s of sparks) {
        if (s.life <= 0) continue;
        s.life -= dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        s.vel.y -= 6 * dt;
        s.mesh.material.opacity = Math.max(0, s.life / 0.35);
        s.mesh.rotation.z += dt * 9;
      }
      for (const b of blasts) {
        if (b.life <= 0) continue;
        b.life -= dt;
        const k = 1 - Math.max(0, b.life / 0.5);
        b.mesh.scale.setScalar(0.4 + k * 5.2);
        b.mesh.material.opacity = Math.max(0, 0.85 * (1 - k));
        b.light.intensity = Math.max(0, 60 * (1 - k));
      }
    },
  };
}
