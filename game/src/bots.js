// The bots: two teams of three (player + 2 allies vs 3 defenders). Each bot is a
// small state machine — patrol, engage, investigate, defuse — that steers with the
// shared body physics, sees through the world's line-of-sight test, and shoots
// with the same raycast combat as the player. Defenders hold the sites; when the
// cell is planted the nearest defender runs to defuse it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createBody, stepBody } from './physics.js';

const BOT_SPEED_PATROL = 3.0;
const BOT_SPEED_FIGHT = 3.6;
const BOT_SPEED_DEFUSE = 4.2;
const SEE_RANGE = 40;
const SHOOT_RANGE = 38;
const BURST_SHOTS = 4;
const BURST_GAP = 0.13;
const BURST_PAUSE = 0.9;

const torsoGeo = new THREE.BoxGeometry(0.52, 0.78, 0.3);
const headGeo = new THREE.SphereGeometry(0.155, 16, 12);
const legGeo = new THREE.BoxGeometry(0.42, 0.62, 0.26);
const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.6);

export function createBots(scene, world, ctx) {
  const bots = [];
  const hitMeshes = [];
  let defuser = null; // the one defender currently defusing, if any
  const tmpTarget = new THREE.Vector3();
  const tmpHead = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const tmpChest = new THREE.Vector3();

  function buildBot(team, role, routeName, spawn) {
    const isAlly = team === 'atk';
    const teamColor = isAlly ? PALETTE.teal : PALETTE.ember;
    const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.6, metalness: 0.05 });
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
    const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.1 });
    const group = new THREE.Group();
    const legs = new THREE.Mesh(legGeo, darkMat);
    legs.position.y = 0.31;
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 1.0;
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.53;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.3 }));
    visor.position.set(0, 1.55, -0.14);
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.2, 1.05, -0.3);
    group.add(legs, torso, head, visor, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);
    const bot = {
      team, role, routeName,
      body: createBody(spawn[0], spawn[1]),
      group, torso, head, legs,
      hp: 100, alive: true,
      state: 'patrol',
      routeIndex: 0,
      route: world.routes[routeName].map(([x, z]) => new THREE.Vector3(x, 0, z)),
      home: new THREE.Vector3(spawn[0], 0, spawn[1]),
      target: null, // { kind: 'player' | 'bot', bot?, pos: Vector3 }
      lastSeen: new THREE.Vector3(),
      lastHeard: null,
      hearTime: -99,
      shootTimer: 0,
      burstLeft: 0,
      burstTimer: 0,
      strafeDir: 1,
      strafeTimer: 0,
      fall: 0,
      defuseAt: null,
      seenTime: -99,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    legs.userData.bot = bot;
    legs.userData.part = 'legs';
    hitMeshes.push(torso, head, legs);
    bots.push(bot);
    return bot;
  }

  // 2 allies push from the south; 3 defenders hold the sites and the mid yard.
  buildBot('atk', 'pusher', 'west', world.spawns.atk[0]);
  buildBot('atk', 'pusher', 'east', world.spawns.atk[2]);
  buildBot('def', 'holder', 'holdA', world.spawns.def[0]);
  buildBot('def', 'holder', 'holdB', world.spawns.def[2]);
  buildBot('def', 'roamer', 'mid', world.spawns.def[1]);

  function chestOf(bot) {
    tmpChest.set(bot.body.position.x, bot.body.position.y + 1.25, bot.body.position.z);
    return tmpChest;
  }

  function headPos(bot, out) {
    out.set(bot.body.position.x, bot.body.position.y + 1.5, bot.body.position.z);
    return out;
  }

  function canSee(bot, pos) {
    const dist = bot.body.position.distanceTo(pos);
    if (dist > SEE_RANGE) return false;
    headPos(bot, tmpHead);
    tmpTarget.copy(pos);
    tmpTarget.y = pos.y + 1.25;
    return world.hasLineOfSight(tmpHead, tmpTarget);
  }

  function pickTarget(bot) {
    // Defenders hunt the player first, then the nearest living ally.
    // Attackers hunt the nearest living defender.
    if (bot.team === 'def') {
      if (ctx.playerAlive()) {
        const pp = ctx.playerPos();
        tmpTarget.set(pp.x, pp.y, pp.z);
        if (canSee(bot, tmpTarget)) return { kind: 'player', pos: ctx.playerPos() };
      }
      let best = null;
      let bestDist = Infinity;
      for (const other of bots) {
        if (other.team !== 'atk' || !other.alive) continue;
        const d = bot.body.position.distanceTo(other.body.position);
        if (d < bestDist && canSee(bot, other.body.position)) {
          best = other;
          bestDist = d;
        }
      }
      return best ? { kind: 'bot', bot: best, pos: best.body.position } : null;
    }
    let best = null;
    let bestDist = Infinity;
    for (const other of bots) {
      if (other.team !== 'def' || !other.alive) continue;
      const d = bot.body.position.distanceTo(other.body.position);
      if (d < bestDist && canSee(bot, other.body.position)) {
        best = other;
        bestDist = d;
      }
    }
    return best ? { kind: 'bot', bot: best, pos: best.body.position } : null;
  }

  function faceToward(bot, x, z, dt, rate = 6) {
    const want = Math.atan2(-(x - bot.body.position.x), -(z - bot.body.position.z));
    let diff = want - bot.body.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.body.yaw += Math.max(-rate * dt, Math.min(rate * dt, diff));
  }

  function steer(bot, x, z, speed, dt) {
    const dx = x - bot.body.position.x;
    const dz = z - bot.body.position.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return true;
    stepBody(bot.body, world.colliders, dt, dx / len, dz / len, speed, 30, 8);
    return len < 0.6;
  }

  function botShoot(bot, target, dt) {
    bot.shootTimer -= dt;
    if (bot.burstLeft > 0) {
      bot.burstTimer -= dt;
      if (bot.burstTimer > 0) return;
      bot.burstTimer = BURST_GAP;
      bot.burstLeft -= 1;
    } else {
      if (bot.shootTimer > 0) return;
      bot.shootTimer = BURST_PAUSE;
      bot.burstLeft = BURST_SHOTS;
      bot.burstTimer = 0;
      return;
    }
    // One raycast shot with spread that grows with distance and target speed.
    const targetPos = target.kind === 'player' ? ctx.playerPos() : target.bot.body.position;
    const dist = bot.body.position.distanceTo(targetPos);
    if (dist > SHOOT_RANGE) return;
    headPos(bot, tmpHead);
    tmpDir.set(targetPos.x - tmpHead.x, (targetPos.y + 1.25) - tmpHead.y, targetPos.z - tmpHead.z).normalize();
    const spread = 0.022 + dist * 0.0009;
    const targets = target.kind === 'player' ? [ctx.playerProxy()] : [target.bot.torso, target.bot.head, target.bot.legs];
    const result = ctx.combat.shoot(tmpHead, tmpDir, spread, ctx.rng, targets);
    ctx.audio.enemyShot();
    if (!result.hit) return;
    if (result.bot) {
      const mult = result.part === 'head' ? 2.5 : result.part === 'legs' ? 0.7 : 1;
      damage(result.bot, 26 * mult, 'bot');
    } else if (result.hitPlayer) {
      // The ray hit the player proxy: damage by height (head height hurts more).
      const playerY = ctx.playerPos().y;
      const mult = result.point.y > playerY + 1.35 ? 1.4 : 1;
      ctx.damagePlayer(24 * mult, bot.body.position);
    }
  }

  function damage(bot, amount, byPlayer) {
    if (!bot.alive) return;
    bot.hp -= amount;
    if (bot.hp > 0) return;
    bot.alive = false;
    bot.hp = 0;
    bot.fall = 0.0001;
    if (defuser === bot) defuser = null;
    ctx.onBotKilled(bot, byPlayer === 'player');
  }

  function stepBot(bot, dt, time) {
    if (!bot.alive) {
      if (bot.fall > 0 && bot.fall < 1) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.45;
      }
      return;
    }
    const live = ctx.isLive();
    const cell = ctx.cell();
    // Defenders converge on a planted cell to defuse it.
    if (live && bot.team === 'def' && cell.status === 'planted' && cell.site) {
      const sitePos = world.sites[cell.site].pos;
      const dist = Math.hypot(sitePos.x - bot.body.position.x, sitePos.z - bot.body.position.z);
      if (dist > 1.4) {
        bot.state = 'defuse';
        steer(bot, sitePos.x, sitePos.z, BOT_SPEED_DEFUSE, dt);
        faceToward(bot, sitePos.x, sitePos.z, dt);
      } else {
        bot.state = 'defuse';
        if (!defuser) defuser = bot;
        if (defuser === bot) {
          cell.progress += dt;
          faceToward(bot, sitePos.x, sitePos.z, dt);
          if (cell.progress >= 4) ctx.onDefused();
        }
      }
      bot.group.position.copy(bot.body.position);
      bot.group.rotation.y = bot.body.yaw;
      return;
    }
    if (!live) {
      // Idle sway at the spawn while the buy menu is open.
      bot.group.position.copy(bot.body.position);
      bot.group.rotation.y = bot.body.yaw + Math.sin(time * 0.8 + bot.home.x) * 0.08;
      return;
    }
    bot.target = pickTarget(bot);
    if (bot.target) {
      bot.state = 'engage';
      bot.seenTime = time;
      bot.lastSeen.copy(bot.target.pos);
      const targetPos = bot.target.kind === 'player' ? ctx.playerPos() : bot.target.bot.body.position;
      const dist = bot.body.position.distanceTo(targetPos);
      faceToward(bot, targetPos.x, targetPos.z, dt, 8);
      if (dist > 16) {
        steer(bot, targetPos.x, targetPos.z, BOT_SPEED_FIGHT, dt);
      } else {
        // Hold range and strafe, so a fight is a duel, not a standstill.
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeTimer = 1.2 + ctx.rng() * 0.8;
          bot.strafeDir = -bot.strafeDir;
        }
        const fx = -Math.sin(bot.body.yaw);
        const fz = -Math.cos(bot.body.yaw);
        steer(bot, bot.body.position.x + fz * bot.strafeDir * 2, bot.body.position.z - fx * bot.strafeDir * 2, 1.6, dt);
      }
      botShoot(bot, bot.target, dt);
    } else if (bot.lastHeard && time - bot.hearTime < 6) {
      bot.state = 'investigate';
      const arrived = steer(bot, bot.lastHeard.x, bot.lastHeard.z, BOT_SPEED_PATROL, dt);
      faceToward(bot, bot.lastHeard.x, bot.lastHeard.z, dt);
      if (arrived) {
        bot.lastHeard = null;
        bot.body.yaw += dt * 1.5;
      }
    } else {
      bot.state = 'patrol';
      const wp = bot.route[bot.routeIndex];
      const arrived = steer(bot, wp.x, wp.z, BOT_SPEED_PATROL, dt);
      faceToward(bot, wp.x, wp.z, dt, 3);
      if (arrived) bot.routeIndex = (bot.routeIndex + 1) % bot.route.length;
    }
    bot.group.position.copy(bot.body.position);
    bot.group.rotation.y = bot.body.yaw;
  }

  return {
    bots,
    hitMeshes,
    damage,
    hearShot(pos) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        if (bot.body.position.distanceTo(pos) < 26) {
          bot.lastHeard = pos.clone();
          bot.hearTime = ctx.time();
        }
      }
    },
    step(dt, time) {
      for (const bot of bots) stepBot(bot, dt, time);
    },
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    reset() {
      defuser = null;
      const spawns = { atk: world.spawns.atk, def: world.spawns.def };
      let atkI = 0;
      let defI = 0;
      for (const bot of bots) {
        const list = spawns[bot.team];
        const spawn = bot.team === 'atk' ? list[atkI++ % list.length] : list[defI++ % list.length];
        bot.body.position.set(spawn[0], 0, spawn[1]);
        bot.body.velocity.set(0, 0, 0);
        bot.body.yaw = bot.team === 'atk' ? 0 : Math.PI;
        bot.hp = 100;
        bot.alive = true;
        bot.fall = 0;
        bot.state = 'patrol';
        bot.routeIndex = 0;
        bot.target = null;
        bot.lastHeard = null;
        bot.burstLeft = 0;
        bot.shootTimer = 0;
        bot.group.rotation.set(0, bot.body.yaw, 0);
        bot.group.position.copy(bot.body.position);
      }
    },
    placeForShot(mode) {
      // Deterministic staging for screenshots.
      const [a1, a2, d1, d2, d3] = bots;
      const put = (bot, x, z, yaw) => {
        bot.body.position.set(x, 0, z);
        bot.body.yaw = yaw;
        bot.group.position.copy(bot.body.position);
        bot.group.rotation.set(0, yaw, 0);
      };
      if (mode === 'play') {
        put(a1, -5, 4, 0.4);
        put(a2, 5, 5, -0.4);
        put(d1, -3, -7, Math.PI);
        put(d2, 3, -7, Math.PI);
        put(d3, 0, -10.5, Math.PI);
      } else if (mode === 'end') {
        put(a1, -5, 4, 0.4);
        put(a2, 5, 5, -0.4);
        put(d1, -4.5, -5.5, Math.PI);
        put(d2, 4.5, -6, Math.PI);
        put(d3, 0, -8, Math.PI);
        damage(d1, 200, 'player');
        damage(d2, 200, 'player');
      } else {
        put(a1, -4, 9, 0);
        put(a2, 4, 9, 0);
        put(d1, -13, -9, Math.PI);
        put(d2, 13, -9, Math.PI);
        put(d3, 0, -11, Math.PI);
      }
    },
  };
}
