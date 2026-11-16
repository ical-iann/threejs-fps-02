// Shooting resolution and grenades. One raycast per shot against the world's
// surfaces plus the target meshes; damage by body part is the caller's job, from
// the part the ray returns. Grenades are simulated spheres with gravity and a
// damped bounce, and explode after a fixed fuse.
import * as THREE from 'three';

const BLAST_RADIUS = 6;
const BLAST_DAMAGE = 110;
const GRENADE_FUSE = 1.5;
const GRENADE_GRAVITY = 12;

export function createCombat(scene, world, effects, audio) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const dir = new THREE.Vector3();
  const spreadVec = new THREE.Vector3();

  function shoot(origin, baseDir, spread, random, targets) {
    dir.copy(baseDir);
    if (spread > 0) {
      spreadVec.set((random() * 2 - 1) * spread, (random() * 2 - 1) * spread, (random() * 2 - 1) * spread);
      dir.add(spreadVec).normalize();
    }
    // Bodies move in the fixed-step sim between renders, so refresh the world
    // matrices here: without it a raycast in a screenshot setup (before the
    // first render) tests bots at the origin instead of where they stand.
    scene.updateMatrixWorld(true);
    raycaster.set(origin, dir);
    const hits = raycaster.intersectObjects(world.shootables.concat(targets), false);
    const hit = hits[0];
    if (!hit) {
      const end = origin.clone().addScaledVector(dir, 60);
      effects.tracer(origin, end);
      return { hit: false };
    }
    effects.tracer(origin, hit.point);
    const hitPlayer = hit.object.userData.player === true;
    if (!hit.object.userData.bot && !hitPlayer) effects.spark(hit.point);
    return {
      hit: true,
      point: hit.point,
      distance: hit.distance,
      bot: hit.object.userData.bot || null,
      part: hit.object.userData.part || null,
      hitPlayer,
    };
  }

  const grenades = [];
  for (let i = 0; i < 4; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x2c323a, roughness: 0.5, metalness: 0.6 }),
    );
    mesh.visible = false;
    scene.add(mesh);
    grenades.push({ mesh, vel: new THREE.Vector3(), fuse: 0, active: false });
  }
  let grenadeNext = 0;
  let blastHandler = null;

  return {
    shoot,
    onBlast(handler) { blastHandler = handler; },
    throwGrenade(origin, throwDir, power = 14) {
      const g = grenades[grenadeNext];
      grenadeNext = (grenadeNext + 1) % grenades.length;
      g.mesh.visible = true;
      g.mesh.position.copy(origin);
      g.vel.copy(throwDir).multiplyScalar(power);
      g.vel.y += 4.5;
      g.fuse = GRENADE_FUSE;
      g.active = true;
      audio.grenadePin();
    },
    grenadesActive() {
      return grenades.some((g) => g.active);
    },
    stepGrenades(dt) {
      for (const g of grenades) {
        if (!g.active) continue;
        g.fuse -= dt;
        g.vel.y -= GRENADE_GRAVITY * dt;
        g.mesh.position.addScaledVector(g.vel, dt);
        // Damped bounce off the world's colliders: push out along the axis of
        // least penetration and reflect that velocity component.
        for (const box of world.colliders) {
          const p = g.mesh.position;
          if (p.x > box.min.x - 0.09 && p.x < box.max.x + 0.09 && p.y > box.min.y - 0.09 && p.y < box.max.y + 0.09 && p.z > box.min.z - 0.09 && p.z < box.max.z + 0.09) {
            const dxMin = p.x - (box.min.x - 0.09);
            const dxMax = (box.max.x + 0.09) - p.x;
            const dyMin = p.y - (box.min.y - 0.09);
            const dyMax = (box.max.y + 0.09) - p.y;
            const dzMin = p.z - (box.min.z - 0.09);
            const dzMax = (box.max.z + 0.09) - p.z;
            const m = Math.min(dxMin, dxMax, dyMin, dyMax, dzMin, dzMax);
            if (m === dxMin || m === dxMax) { g.vel.x *= -0.45; p.x += m === dxMin ? -dxMin : dxMax; }
            else if (m === dyMin || m === dyMax) { g.vel.y *= -0.45; p.y += m === dyMin ? -dyMin : dyMax; }
            else { g.vel.z *= -0.45; p.z += m === dzMin ? -dzMin : dzMax; }
          }
        }
        if (g.fuse <= 0) {
          g.active = false;
          g.mesh.visible = false;
          effects.explosion(g.mesh.position);
          audio.explode();
          if (blastHandler) blastHandler(g.mesh.position.clone(), BLAST_RADIUS, BLAST_DAMAGE);
        }
      }
    },
  };
}
