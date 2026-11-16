// Shared body physics: an axis-aligned box moved against the world's colliders one
// axis at a time, so a wall never swallows a body. The player and every bot use
// the same step, so they collide with the map the same way. Preallocated probes:
// no object is made in a step.
import * as THREE from 'three';

const GRAVITY = 20;
const RADIUS = 0.34;

export function createBody(x, z, height = 1.72) {
  return {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: 1.6,
    height,
    radius: RADIUS,
    crouching: false,
    onGround: true,
  };
}

const probe = new THREE.Box3();

function overlaps(body, colliders, x, y, z, height, lift) {
  probe.min.set(x - body.radius, y + lift, z - body.radius);
  probe.max.set(x + body.radius, y + height - lift, z + body.radius);
  for (let i = 0; i < colliders.length; i += 1) {
    if (probe.intersectsBox(colliders[i])) return colliders[i];
  }
  return null;
}

export function bodyBlocked(body, colliders, x, y, z, height) {
  return overlaps(body, colliders, x, y, z, height, 0.02) !== null;
}

// wishX/wishZ is the desired horizontal direction (already normalised, may be 0).
// speed is the target speed, accel the approach rate. Handles gravity, landing
// and standing on low boxes; the caller sets velocity.y for a jump first.
export function stepBody(body, colliders, dt, wishX, wishZ, speed, accel, friction) {
  const blend = Math.min(1, (accel * dt) / Math.max(speed, 0.01));
  body.velocity.x += (wishX * speed - body.velocity.x) * blend;
  body.velocity.z += (wishZ * speed - body.velocity.z) * blend;
  if (body.onGround && wishX === 0 && wishZ === 0) {
    const damp = Math.max(0, 1 - friction * dt);
    body.velocity.x *= damp;
    body.velocity.z *= damp;
  }
  body.velocity.y -= GRAVITY * dt;

  const nextX = body.position.x + body.velocity.x * dt;
  if (!overlaps(body, colliders, nextX, body.position.y, body.position.z, body.height, 0.04)) {
    body.position.x = nextX;
  } else {
    body.velocity.x = 0;
  }
  const nextZ = body.position.z + body.velocity.z * dt;
  if (!overlaps(body, colliders, body.position.x, body.position.y, nextZ, body.height, 0.04)) {
    body.position.z = nextZ;
  } else {
    body.velocity.z = 0;
  }

  body.position.y += body.velocity.y * dt;
  body.onGround = false;
  const hit = overlaps(body, colliders, body.position.x, body.position.y, body.position.z, body.height, 0);
  if (hit && body.velocity.y <= 0) {
    body.position.y = hit.max.y;
    body.velocity.y = 0;
    body.onGround = true;
  } else if (hit) {
    body.position.y = hit.min.y - body.height;
    body.velocity.y = 0;
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    body.onGround = true;
  }
  body.velocity.y = Math.max(-30, body.velocity.y);
}

export function groundSpeed(body) {
  return Math.hypot(body.velocity.x, body.velocity.z);
}
