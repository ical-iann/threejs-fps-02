// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. ?shot=start|buy|play|end with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createState } from './state.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createWeaponRig, WEAPON_DEFS } from './weapons.js';
import { createBots } from './bots.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createMatch } from './rounds.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 22, 55);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);
// A small warm light riding with the camera: it lifts the view model and the
// ground at the player's feet out of the dusk, the way a yard lamp would.
const fillLight = new THREE.PointLight(new THREE.Color('#ffd9a0'), 2.5, 6);
fillLight.position.set(0.3, 0.2, 0.2);
camera.add(fillLight);

const state = createState();
state.timer = 100; // menu shows a full round clock until the match starts
// Debug handle for automated play-tests; harmless in normal play. All lazy,
// so it can sit here before the modules below are created.
window.__meridian = {
  get state() { return state; },
  get player() { return player; },
  get bots() { return bots; },
  get weapon() { return weapon; },
  get combat() { return combat; },
  get playerHp() { return playerHp; },
  get playerAlive() { return playerAlive; },
};
const audio = createAudio();
const effects = createEffects(scene);
const world = createWorld(scene);
const combat = createCombat(scene, world, effects, audio);
const hud = createHud();
const player = createPlayer(world.colliders);
const weapon = createWeaponRig(camera, audio);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 80;

let playerHp = 100;
let playerAlive = true;
let elapsed = 0;
let frozen = false;
let started = false;
let buyOpen = false;
let accumulator = 0;
let lastTime = performance.now();

// The player's hit proxy: an invisible box the bots' rays test against.
const playerProxy = new THREE.Mesh(
  new THREE.BoxGeometry(0.7, 1.7, 0.7),
  new THREE.MeshBasicMaterial({ visible: false }),
);
playerProxy.userData.player = true;
scene.add(playerProxy);

function syncProxy() {
  playerProxy.position.set(player.state.position.x, player.state.position.y + 0.85, player.state.position.z);
}

const bots = createBots(scene, world, {
  rng: random,
  audio,
  combat,
  cell: () => state.cell,
  isLive: () => state.phase === 'live',
  time: () => elapsed,
  playerAlive: () => playerAlive,
  playerPos: () => player.state.position,
  playerProxy: () => playerProxy,
  damagePlayer(amount, fromPos) {
    if (!playerAlive || state.phase !== 'live') return;
    playerHp -= amount;
    audio.hurt();
    hud.damageFlash();
    if (playerHp <= 0) {
      playerHp = 0;
      playerAlive = false;
      state.deaths += 1;
      hud.showBanner('YOU ARE DOWN', 'Your team fights on without you.');
      if (document.pointerLockElement) document.exitPointerLock();
    }
  },
  onBotKilled(bot, byPlayer) {
    const name = bot.team === 'def' ? 'DEFENDER' : 'TEAMMATE';
    hud.killfeed(byPlayer ? `<b>YOU</b> ▸ ${name}` : `<b>TEAM</b> ▸ ${name}`);
    if (byPlayer) {
      match.awardKill();
      audio.kill();
    }
  },
  onDefused() {
    match.onDefused();
  },
});

const match = createMatch(state, {
  resetPositions() {
    player.reset(0, 11.5, 0);
    playerHp = 100;
    playerAlive = true;
    weapon.equip(state.weapon);
    weapon.refill();
    bots.reset();
    syncProxy();
  },
  onBought(name) {
    audio.buy();
    if (name !== 'grenade') weapon.equip(name);
    hud.renderBuy(state.owned, state.grenades, state.money);
  },
  onLiveStart() {
    buyOpen = false;
    hud.showBuy(false);
    hud.showBanner(`ROUND ${state.round}`, 'Plant the cell at Site A or B');
    if (!input.state.locked && !shot) input.requestLock();
  },
  onPlanted(site) {
    audio.plantDone();
    hud.showBanner('CELL PLANTED', `Defend Site ${site} — detonation in 25 seconds`);
  },
  onRoundEnd(won, reason) {
    audio[won ? 'roundWin' : 'roundLose']();
    hud.showOverlay('end', `${won ? 'Round won. ' : 'Round lost. '}${reason} Score ${state.score.atk}–${state.score.def}. Money $${state.money}.`);
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onMatchEnd(won) {
    hud.showOverlay('match', won
      ? `Your team takes the match ${state.score.atk}–${state.score.def}. Meridian Yard is yours.`
      : `The defenders take the match ${state.score.def}–${state.score.atk}. Run it back.`);
    if (document.pointerLockElement) document.exitPointerLock();
  },
});

combat.onBlast((point, radius, damage) => {
  const tmp = new THREE.Vector3();
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = bot.body.position.distanceTo(point);
    if (d > radius) continue;
    tmp.set(bot.body.position.x, bot.body.position.y + 1.25, bot.body.position.z);
    const blocked = !world.hasLineOfSight(point, tmp);
    const amount = damage * (1 - d / radius) * (blocked ? 0.5 : 1);
    bots.damage(bot, Math.max(15, amount), 'player');
  }
  if (playerAlive) {
    const d = player.state.position.distanceTo(point);
    if (d < radius) {
      playerHp -= Math.max(10, damage * (1 - d / radius) * 0.8);
      hud.damageFlash();
      if (playerHp <= 0) {
        playerHp = 0;
        playerAlive = false;
        state.deaths += 1;
        hud.showBanner('YOU ARE DOWN', 'Your team fights on without you.');
      }
    }
  }
});

function playerNearSite() {
  for (const letter of ['A', 'B']) {
    const site = world.sites[letter];
    const d = Math.hypot(site.pos.x - player.state.position.x, site.pos.z - player.state.position.z);
    if (d < 2.4) return letter;
  }
  return null;
}

function syncCamera() {
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - player.state.position.x;
  const dy = point.y - (player.state.position.y + player.state.eye);
  const dz = point.z - player.state.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  player.state.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

const shootDir = new THREE.Vector3();

function shoot(spread) {
  if (!weapon.takeRound()) return false;
  camera.getWorldDirection(shootDir);
  const def = weapon.def();
  const result = combat.shoot(camera.position, shootDir, spread, random, bots.hitMeshes);
  if (result.hit && result.bot) {
    const mult = result.part === 'head' ? def.headMult : result.part === 'legs' ? 0.7 : 1;
    const wasAlive = result.bot.alive;
    bots.damage(result.bot, def.damage * mult, 'player');
    hud.hitMarker(wasAlive && !result.bot.alive, 4000);
    if (wasAlive) audio.hit();
  }
  weapon.pullTrigger();
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  bots.hearShot(player.state.position);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, def.label.toUpperCase());
  return true;
}

function objectiveText() {
  if (state.phase === 'menu') return 'PLANT THE CELL AT SITE A OR B';
  if (state.phase === 'buy') return 'BUY PHASE — PRESS B FOR WEAPONS';
  if (state.phase === 'matchEnd') return state.matchWon ? 'MATCH WON' : 'MATCH LOST';
  if (state.phase === 'ended') return state.lastResult ? state.lastResult.reason.toUpperCase() : '';
  if (state.cell.status === 'planting') return 'PLANTING THE CELL — HOLD E';
  if (state.cell.status === 'planted') return `CELL PLANTED AT SITE ${state.cell.site} — DEFEND IT`;
  if (!playerAlive) return 'YOU ARE DOWN — YOUR TEAM FIGHTS ON';
  return playerNearSite() ? 'HOLD E TO PLANT THE CELL' : 'PLANT THE CELL AT SITE A OR B';
}

function syncHud() {
  hud.setHealth(playerHp);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().label.toUpperCase());
  hud.setTimer(state.timer, state.phase);
  hud.setScore(state.score.atk, state.score.def, state.round);
  hud.setMoney(state.money);
  hud.setAlive(bots.aliveCount('atk') + (playerAlive ? 1 : 0), bots.aliveCount('def'));
  hud.setObjective(objectiveText());
  hud.setSpread(weapon.spread(player.groundSpeed()) * 2200);
  if (state.cell.status === 'planting') {
    hud.setPlant(state.cell.progress / 3, 'PLANTING THE CELL…');
  } else if (state.cell.status === 'planted' && state.cell.progress > 0) {
    hud.setPlant(state.cell.progress / 4, 'ENEMY DEFUSING THE CELL…');
  } else {
    hud.setPlant(null);
  }
  if (state.phase === 'buy') hud.setBuyTimer(state.timer);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (state.phase === 'live' || state.phase === 'buy') {
    if (!buyOpen) hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (state.phase === 'menu') {
    match.startMatch();
    hud.hideOverlay();
    input.requestLock();
  } else if (state.phase === 'ended') {
    match.advance();
    hud.hideOverlay();
    input.requestLock();
  } else if (state.phase === 'matchEnd') {
    match.restartMatch();
    hud.hideOverlay();
    input.requestLock();
  } else {
    input.requestLock();
  }
});

function step(dt) {
  elapsed += dt;
  const live = state.phase === 'live';
  const canMove = (live || state.phase === 'buy') && playerAlive;
  if (canMove) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    player.step(dt, input.state.keys);
  }
  const pressed = input.takePressed();
  if (state.phase === 'buy') {
    if (pressed.has('KeyB')) {
      buyOpen = !buyOpen;
      hud.showBuy(buyOpen);
      if (buyOpen) {
        hud.renderBuy(state.owned, state.grenades, state.money);
        if (document.pointerLockElement) document.exitPointerLock();
      } else {
        input.requestLock();
      }
    }
    if (pressed.has('Digit1')) match.buyWeapon('rifle');
    if (pressed.has('Digit2')) match.buyWeapon('smg');
    if (pressed.has('KeyG')) match.buyGrenade();
  }
  if (pressed.has('Digit1') && state.owned.rifle && state.phase === 'live') weapon.equip('rifle');
  if (pressed.has('Digit2') && state.owned.smg && state.phase === 'live') weapon.equip('smg');
  if (pressed.has('Digit3')) weapon.equip('pistol');
  if (live && playerAlive) {
    const wantFire = weapon.def().auto ? input.state.firing : input.takeClickEdge();
    if (wantFire && weapon.ready()) shoot(shot ? 0 : weapon.spread(player.groundSpeed()));
    if (input.state.keys.has('KeyR')) weapon.reload();
    if (pressed.has('KeyG') && state.grenades > 0) {
      state.grenades -= 1;
      camera.getWorldDirection(shootDir);
      combat.throwGrenade(camera.position, shootDir, 14);
    }
  }
  match.step(dt, {
    playerNearSite,
    playerPlanting: () => input.state.keys.has('KeyE'),
    playerAlive: () => playerAlive,
    aliveAtk: () => bots.aliveCount('atk'),
    aliveDef: () => bots.aliveCount('def'),
  });
  bots.step(dt, elapsed);
  combat.stepGrenades(dt);
  weapon.step(dt, player.groundSpeed());
  effects.step(dt);
  syncProxy();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    syncHud();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function runShot(name) {
  audio.silence();
  hud.hideOverlay();
  hud.hideBanner();
  bots.reset();
  player.reset(0, 11.5, 0);
  if (name === 'start') {
    bots.placeForShot('start');
    player.reset(0, 11.5, 0);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start');
  } else if (name === 'buy') {
    state.phase = 'buy';
    state.timer = 12;
    bots.placeForShot('start');
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showBuy(true);
    hud.renderBuy(state.owned, state.grenades, state.money);
    hud.setBuyTimer(12);
  } else if (name === 'play') {
    state.timer = 87;
    state.weapon = 'rifle';
    state.owned.rifle = true;
    weapon.equip('rifle');
    weapon.refill();
    state.grenades = 1;
    player.reset(0, 0.5, 0);
    bots.placeForShot('play');
    settle(10);
    const d1 = bots.bots[2];
    const d2 = bots.bots[3];
    aimAt(new THREE.Vector3(d1.body.position.x, 1.5, d1.body.position.z));
    for (let r = 0; r < 3; r += 1) {
      shoot(0);
      settle(6);
    }
    aimAt(new THREE.Vector3(d2.body.position.x, 1.5, d2.body.position.z));
    for (let r = 0; r < 3; r += 1) {
      shoot(0);
      settle(6);
    }
    settle(12);
    hud.hitMarker(true, 4000);
    state.phase = 'live';
  } else if (name === 'end') {
    state.phase = 'ended';
    state.timer = 0;
    state.round = 3;
    state.score = { atk: 2, def: 1 };
    state.cell = { status: 'detonated', site: 'A', progress: 0, timer: 0 };
    player.reset(2, 0, 0);
    bots.placeForShot('end'); // staging kills two defenders (kill rewards land here)
    state.money = 1425;
    state.kills = 2;
    state.lastResult = { won: true, reason: 'The cell detonated at Site A.' };
    aimAt(new THREE.Vector3(-13, 1.5, -9));
    hud.showBanner('ROUND WON', 'The cell detonated at Site A. Score 2–1.', 60000);
  }
  syncHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    syncHud();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
syncHud();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
