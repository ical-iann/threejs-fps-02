// Procedural sound: every effect is an oscillator or a noise burst through
// WebAudio, so the game ships no audio files and makes no network request.
// The context is created on the first user gesture; before that every call is
// a silent no-op, which also keeps screenshot mode quiet.
export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (!enabled || ctx) return ctx !== null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    } catch {
      enabled = false;
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, gain, slideTo) {
    if (!ensure()) return;
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), ctx.currentTime + dur);
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(g);
      g.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch { /* sound is never worth crashing the game over */ }
  }

  function noise(dur, gain, lowFreq) {
    if (!ensure()) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowFreq;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start();
    } catch { /* see tone() */ }
  }

  return {
    unlock() { ensure(); },
    silence() { enabled = false; },
    shot(kind) {
      if (kind === 'rifle') { noise(0.09, 0.5, 3200); tone(160, 0.08, 'square', 0.16, 60); }
      else if (kind === 'smg') { noise(0.06, 0.4, 4200); tone(210, 0.05, 'square', 0.12, 80); }
      else { noise(0.11, 0.55, 2400); tone(120, 0.1, 'square', 0.2, 50); }
    },
    enemyShot() { noise(0.07, 0.22, 2400); tone(140, 0.06, 'square', 0.07, 70); },
    hit() { tone(1200, 0.05, 'sine', 0.2, 900); },
    kill() { tone(880, 0.09, 'sine', 0.22, 440); tone(1320, 0.12, 'sine', 0.16, 660); },
    hurt() { tone(220, 0.12, 'sawtooth', 0.14, 110); },
    reload() { tone(500, 0.05, 'square', 0.1); setTimeout(() => tone(700, 0.05, 'square', 0.1), 120); },
    dryClick() { tone(900, 0.03, 'square', 0.08); },
    grenadePin() { tone(1500, 0.04, 'sine', 0.12); },
    explode() { noise(0.7, 0.9, 500); tone(70, 0.6, 'sine', 0.5, 28); },
    beep() { tone(1040, 0.09, 'sine', 0.18); },
    plantDone() { tone(660, 0.12, 'sine', 0.2); tone(990, 0.18, 'sine', 0.2, 990); },
    buy() { tone(780, 0.07, 'sine', 0.16); tone(1170, 0.1, 'sine', 0.14); },
    roundWin() { tone(523, 0.14, 'sine', 0.2); tone(659, 0.14, 'sine', 0.2); tone(784, 0.24, 'sine', 0.22); },
    roundLose() { tone(392, 0.16, 'sine', 0.18); tone(330, 0.16, 'sine', 0.18); tone(262, 0.3, 'sine', 0.2); },
  };
}
