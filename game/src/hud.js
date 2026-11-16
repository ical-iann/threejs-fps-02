// The DOM HUD: health, ammo, timer, score, money, objective, kill feed, the
// buy menu and the overlays. It never touches the simulation; main.js pushes
// numbers in and reads the play callback out. Values are cached so the DOM is
// only touched when something actually changes.
import { WEAPON_DEFS } from './weapons.js';
import { GRENADE_COST, WEAPON_COST } from './state.js';

const COPY = {
  start: {
    title: 'MERIDIAN YARD',
    copy: 'A dusk container yard. Three lanes, two sites, one cell to plant. Your team attacks; the defenders hold A and B. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'MERIDIAN YARD',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  end: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthNum = $('health-num');
  const healthFill = $('health-fill');
  const timerEl = $('timer');
  const scoreAtk = $('score-atk');
  const scoreDef = $('score-def');
  const moneyEl = $('money');
  const roundEl = $('round-num');
  const aliveAtk = $('alive-atk');
  const aliveDef = $('alive-def');
  const objectiveEl = $('objective');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const vignette = $('damage-vignette');
  const buyMenu = $('buy-menu');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const buyTimer = $('buy-timer');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  let hitTimer = 0;
  let bannerTimer = 0;
  const cache = {};

  function setText(el, key, value) {
    if (cache[key] !== value) {
      cache[key] = value;
      el.textContent = value;
    }
  }

  return {
    setAmmo(mag, reserve, label) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'res', `/ ${reserve}`);
      setText(weaponName, 'wname', label);
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setHealth(hp) {
      const shown = Math.max(0, Math.ceil(hp));
      setText(healthNum, 'hp', String(shown));
      const pct = Math.max(0, Math.min(100, shown));
      if (cache.hpPct !== pct) {
        cache.hpPct = pct;
        healthFill.style.width = pct + '%';
        healthFill.classList.toggle('low', pct <= 30);
      }
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = phase === 'buy' ? `BUY ${s}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      setText(timerEl, 'timer', text);
      timerEl.classList.toggle('urgent', phase === 'live' && s <= 15);
    },
    setScore(atk, def, round) {
      setText(scoreAtk, 'satk', String(atk));
      setText(scoreDef, 'sdef', String(def));
      setText(roundEl, 'round', `ROUND ${round}`);
    },
    setMoney(value) {
      setText(moneyEl, 'money', `$${value}`);
      setText(buyMoney, 'buymoney', `$${value}`);
    },
    setAlive(atk, def) {
      setText(aliveAtk, 'aatk', '●'.repeat(Math.max(0, atk)) + '○'.repeat(Math.max(0, 3 - atk)));
      setText(aliveDef, 'adef', '●'.repeat(Math.max(0, def)) + '○'.repeat(Math.max(0, 3 - def)));
    },
    setObjective(text) {
      setText(objectiveEl, 'obj', text);
    },
    setSpread(px) {
      const v = Math.round(px);
      if (cache.spread !== v) {
        cache.spread = v;
        crosshair.style.setProperty('--gap', v + 'px');
      }
    },
    setPlant(progress, label) {
      if (progress === null) {
        if (!plantBar.hidden) plantBar.hidden = true;
        return;
      }
      plantBar.hidden = false;
      setText(plantLabel, 'plantlabel', label);
      const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
      if (cache.plantPct !== pct) {
        cache.plantPct = pct;
        plantFill.style.width = pct + '%';
      }
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      vignette.classList.remove('flash');
      void vignette.offsetWidth;
      vignette.classList.add('flash');
    },
    killfeed(text) {
      const line = document.createElement('div');
      line.innerHTML = text; // callers pass internal markup only (<b> names)
      killfeed.prepend(line);
      while (killfeed.children.length > 4) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    showBanner(titleText, subText, holdMs = 3600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, holdMs);
    },
    hideBanner() {
      banner.hidden = true;
    },
    showBuy(show) {
      buyMenu.hidden = !show;
    },
    renderBuy(owned, grenades, money) {
      buyList.innerHTML = '';
      const rows = [
        { key: 'rifle', name: 'VK-7 Rifle', cost: WEAPON_COST.rifle, desc: WEAPON_DEFS.rifle.desc, hotkey: '1' },
        { key: 'smg', name: 'Hornet SMG', cost: WEAPON_COST.smg, desc: WEAPON_DEFS.smg.desc, hotkey: '2' },
        { key: 'grenade', name: 'Frag Grenade', cost: GRENADE_COST, desc: 'Bounce it round a corner. 110 damage in 6 m.', hotkey: 'G' },
      ];
      for (const row of rows) {
        const ownedNow = row.key === 'grenade' ? grenades > 0 : owned[row.key];
        const div = document.createElement('div');
        div.className = 'buy-row' + (ownedNow ? ' owned' : '') + (money < row.cost && !ownedNow ? ' poor' : '');
        div.innerHTML = `<span class="buy-key">${row.hotkey}</span><span class="buy-name">${row.name}</span><span class="buy-desc">${row.desc}</span><span class="buy-cost">${ownedNow ? 'OWNED' : '$' + row.cost}</span>`;
        buyList.appendChild(div);
      }
      setText(buyTimer, 'buytimer', '');
    },
    setBuyTimer(seconds) {
      setText(buyTimer, 'buytimer', `Buy phase ends in ${Math.max(0, Math.ceil(seconds))}s — press B to close`);
    },
    showOverlay(mode, detail) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = detail || text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
