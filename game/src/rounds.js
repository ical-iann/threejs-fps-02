// The match: buy phase, live round, plant/defuse, and the first-to-three match.
// One place owns the timers and the win conditions; the HUD and the bots only
// read state and call the buy actions.
import {
  BUY_SECONDS, ROUND_SECONDS, DETONATE_SECONDS, PLANT_SECONDS,
  ROUND_WIN_MONEY, ROUND_LOSS_MONEY, KILL_MONEY, PLANT_MONEY,
  MATCH_TARGET, WEAPON_COST, GRENADE_COST,
} from './state.js';

export function createMatch(state, api) {
  function endRound(won, reason) {
    if (state.phase !== 'live') return;
    state.phase = 'ended';
    state.timer = 4;
    state.lastResult = { won, reason };
    if (won) {
      state.score.atk += 1;
      state.money += ROUND_WIN_MONEY;
    } else {
      state.score.def += 1;
      state.money += ROUND_LOSS_MONEY;
    }
    api.onRoundEnd(won, reason);
  }

  function nextRound() {
    if (state.score.atk >= MATCH_TARGET || state.score.def >= MATCH_TARGET) {
      state.phase = 'matchEnd';
      state.matchWon = state.score.atk >= MATCH_TARGET;
      api.onMatchEnd(state.matchWon);
      return;
    }
    state.round += 1;
    state.phase = 'buy';
    state.timer = BUY_SECONDS;
    state.cell = { status: 'carried', site: null, progress: 0, timer: 0 };
    state.lastResult = null;
    api.resetPositions();
  }

  return {
    startMatch() {
      state.phase = 'buy';
      state.timer = BUY_SECONDS;
      api.resetPositions();
    },
    advance() {
      if (state.phase === 'ended') nextRound();
    },
    restartMatch() {
      state.round = 1;
      state.score = { atk: 0, def: 0 };
      state.money = 800;
      state.kills = 0;
      state.deaths = 0;
      state.matchWon = false;
      state.owned = { pistol: true, rifle: false, smg: false };
      state.grenades = 0;
      state.weapon = 'pistol';
      state.cell = { status: 'carried', site: null, progress: 0, timer: 0 };
      state.lastResult = null;
      state.phase = 'buy';
      state.timer = BUY_SECONDS;
      api.resetPositions();
    },
    buyWeapon(name) {
      if (state.phase !== 'buy') return false;
      const cost = WEAPON_COST[name];
      if (cost === undefined || state.owned[name] || state.money < cost) return false;
      state.money -= cost;
      state.owned[name] = true;
      state.weapon = name;
      api.onBought(name);
      return true;
    },
    buyGrenade() {
      if (state.phase !== 'buy') return false;
      if (state.money < GRENADE_COST || state.grenades >= 2) return false;
      state.money -= GRENADE_COST;
      state.grenades += 1;
      api.onBought('grenade');
      return true;
    },
    awardKill() {
      state.kills += 1;
      state.money += KILL_MONEY;
    },
    onDefused() {
      if (state.phase === 'live' && state.cell.status === 'planted') {
        state.cell.status = 'defused';
        endRound(false, 'The cell was defused.');
      }
    },
    step(dt, ctx) {
      if (state.phase === 'buy') {
        state.timer -= dt;
        if (state.timer <= 0) {
          state.phase = 'live';
          state.timer = ROUND_SECONDS;
          api.onLiveStart();
        }
        return;
      }
      if (state.phase === 'ended') {
        state.timer -= dt;
        if (state.timer <= 0) nextRound();
        return;
      }
      if (state.phase !== 'live') return;

      // Planting: hold E beside a site for three seconds.
      const site = ctx.playerNearSite();
      if (state.cell.status === 'carried' || state.cell.status === 'planting') {
        if (site && ctx.playerPlanting()) {
          state.cell.status = 'planting';
          state.cell.site = site;
          state.cell.progress += dt;
          if (state.cell.progress >= PLANT_SECONDS) {
            state.cell.status = 'planted';
            state.cell.timer = DETONATE_SECONDS;
            state.cell.progress = 0;
            state.money += PLANT_MONEY;
            api.onPlanted(site);
          }
        } else {
          state.cell.status = 'carried';
          state.cell.site = null;
          state.cell.progress = 0;
        }
      } else if (state.cell.status === 'planted') {
        state.cell.timer -= dt;
        if (state.cell.timer <= 0) {
          state.cell.status = 'detonated';
          endRound(true, 'The cell detonated at Site ' + state.cell.site + '.');
          return;
        }
      }

      state.timer -= dt;
      if (state.timer <= 0) {
        endRound(false, 'Time ran out. The defenders hold the yard.');
        return;
      }
      if (ctx.aliveDef() === 0) {
        endRound(true, 'Enemy team eliminated.');
        return;
      }
      if (!ctx.playerAlive() && ctx.aliveAtk() === 0) {
        endRound(false, 'Your team was eliminated.');
      }
    },
  };
}
