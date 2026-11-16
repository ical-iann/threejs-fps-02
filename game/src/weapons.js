// The arsenal: three hitscan weapons plus the grenade slot. The rig owns the
// view model, the magazine, the reload and the spread; main.js owns the ray.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPON_DEFS = {
  pistol: { label: 'P9 Sidearm', mag: 12, reserve: 48, damage: 34, headMult: 2.5, fireGap: 0.22, auto: false, spreadStill: 0.004, spreadMoving: 0.03, reloadTime: 1.4, cost: 0, desc: 'Accurate, free, never runs dry for long.' },
  rifle: { label: 'VK-7 Rifle', mag: 25, reserve: 75, damage: 34, headMult: 2.5, fireGap: 0.11, auto: true, spreadStill: 0.003, spreadMoving: 0.032, reloadTime: 2.2, cost: 700, desc: 'The workhorse: hard hits, tight spread when still.' },
  smg: { label: 'Hornet SMG', mag: 32, reserve: 96, damage: 22, headMult: 2.2, fireGap: 0.07, auto: true, spreadStill: 0.006, spreadMoving: 0.04, reloadTime: 1.9, cost: 500, desc: 'Fast up close, wild at range.' },
};

function buildGun(defName, camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.3 });
  const model = new THREE.Group();
  if (defName === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.24), body);
    const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.07), grip);
    gripMesh.position.set(0, -0.08, 0.08);
    model.add(slide, gripMesh);
  } else if (defName === 'rifle') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.42), grip);
    barrel.position.set(0, 0.025, -0.4);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), accent);
    sight.position.set(0, 0.08, -0.05);
    model.add(receiver, barrel, stock, sight);
  } else {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.34), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), grip);
    barrel.position.set(0, 0.02, -0.3);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), accent);
    mag.position.set(0, -0.11, -0.02);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.16), grip);
    stock.position.set(0, -0.01, 0.24);
    model.add(receiver, barrel, mag, stock);
  }
  model.position.set(0.24, -0.2, -0.42);
  model.visible = false;
  camera.add(model);
  return model;
}

export function createWeaponRig(camera, audio) {
  const models = {};
  for (const name of Object.keys(WEAPON_DEFS)) models[name] = buildGun(name, camera);
  models.pistol.visible = true;

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = { weapon: 'pistol', mag: 12, reserve: 48, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bobTime: 0 };
  let currentDef = WEAPON_DEFS.pistol;

  function equip(name) {
    if (!WEAPON_DEFS[name] || state.weapon === name) return false;
    for (const key of Object.keys(models)) models[key].visible = key === name;
    state.weapon = name;
    currentDef = WEAPON_DEFS[name];
    state.mag = currentDef.mag;
    state.reserve = currentDef.reserve;
    state.cooldown = 0.25;
    state.reloadLeft = 0;
    state.flash = 0;
    state.kick = 0;
    return true;
  }

  function step(dt, moveSpeed) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.weapon];
    state.bobTime += dt * (2 + moveSpeed * 1.6);
    const bob = Math.min(1, moveSpeed / 5.2) * 0.012;
    model.position.z = -0.42 + state.kick;
    model.position.y = -0.2 + Math.sin(state.bobTime * 2) * bob;
    model.position.x = 0.24 + Math.cos(state.bobTime) * bob * 0.6;
    model.rotation.x = state.kick * 2.2;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (currentDef.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = currentDef.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
  }

  return {
    state,
    def() { return currentDef; },
    step,
    equip,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = currentDef.fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
      audio.shot(state.weapon);
    },
    takeRound() {
      if (state.mag <= 0) {
        audio.dryClick();
        return false;
      }
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === currentDef.mag || state.reserve === 0) return;
      state.reloadLeft = currentDef.reloadTime;
      audio.reload();
    },
    spread(speed) {
      return currentDef.spreadStill + Math.min(1, speed / 5.2) * currentDef.spreadMoving;
    },
    refill() {
      state.mag = currentDef.mag;
      state.reserve = currentDef.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}
