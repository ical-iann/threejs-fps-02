// The whole match in one object. Every module reads or writes this state; none
// keeps its own copy of the round, the score or the money.
export const WEAPON_COST = { pistol: 0, rifle: 700, smg: 500 };
export const GRENADE_COST = 300;
export const ROUND_WIN_MONEY = 325;
export const ROUND_LOSS_MONEY = 200;
export const KILL_MONEY = 300;
export const PLANT_MONEY = 300;
export const MATCH_TARGET = 3;
export const ROUND_SECONDS = 100;
export const BUY_SECONDS = 15;
export const DETONATE_SECONDS = 25;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 4;

export function createState() {
  return {
    phase: 'menu', // menu | buy | live | ended | matchEnd
    round: 1,
    timer: 0,
    score: { atk: 0, def: 0 },
    money: 800,
    kills: 0,
    deaths: 0,
    lastResult: null, // { won, reason }
    matchWon: false,
    cell: {
      status: 'carried', // carried | planting | planted | defused | detonated
      site: null, // 'A' | 'B'
      progress: 0, // plant or defuse progress, seconds
      timer: 0, // detonation countdown once planted
    },
    owned: { pistol: true, rifle: false, smg: false },
    grenades: 0,
    weapon: 'pistol',
  };
}

export function resetRoundState(state) {
  state.phase = 'buy';
  state.timer = BUY_SECONDS;
  state.cell = { status: 'carried', site: null, progress: 0, timer: 0 };
  state.lastResult = null;
}
