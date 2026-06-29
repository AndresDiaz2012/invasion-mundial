// Procedural sound system — Web Audio API, zero external files
const SFX = (() => {
  let _ctx = null;
  let _enabled = localStorage.getItem('sfx') !== '0';
  let _vol = parseFloat(localStorage.getItem('sfx_vol') || '0.55');

  function ctx() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  function master(v = 1) {
    const g = ctx().createGain();
    g.gain.value = v * _vol;
    g.connect(ctx().destination);
    return g;
  }

  // Basic oscillator note
  function tone(type, freq, t0, dur, g, attack = 0.008, release = 0.08) {
    const c = ctx();
    const o = c.createOscillator();
    const env = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime + t0);
    env.gain.setValueAtTime(0, c.currentTime + t0);
    env.gain.linearRampToValueAtTime(1, c.currentTime + t0 + attack);
    env.gain.linearRampToValueAtTime(0, c.currentTime + t0 + dur - release);
    o.connect(env); env.connect(g);
    o.start(c.currentTime + t0);
    o.stop(c.currentTime + t0 + dur);
  }

  // Frequency glide
  function glide(type, f1, f2, t0, dur, g) {
    const c = ctx();
    const o = c.createOscillator();
    const env = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, c.currentTime + t0);
    o.frequency.exponentialRampToValueAtTime(f2, c.currentTime + t0 + dur);
    env.gain.setValueAtTime(0.8, c.currentTime + t0);
    env.gain.linearRampToValueAtTime(0, c.currentTime + t0 + dur);
    o.connect(env); env.connect(g);
    o.start(c.currentTime + t0);
    o.stop(c.currentTime + t0 + dur + 0.05);
  }

  // White/brown noise burst
  function noise(t0, dur, g, bandFreq = 120, bandQ = 0.4) {
    const c = ctx();
    const samples = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, samples, c.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < samples; i++) { b = 0.97 * b + (Math.random() - 0.5) * 0.12; d[i] = b; }
    const src = c.createBufferSource();
    const filt = c.createBiquadFilter();
    const env = c.createGain();
    src.buffer = buf;
    filt.type = 'bandpass'; filt.frequency.value = bandFreq; filt.Q.value = bandQ;
    env.gain.setValueAtTime(1, c.currentTime + t0);
    env.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t0 + dur);
    src.connect(filt); filt.connect(env); env.connect(g);
    src.start(c.currentTime + t0);
    src.stop(c.currentTime + t0 + dur);
  }

  const sfx = {
    get enabled() { return _enabled; },
    get volume()  { return _vol; },

    toggle() {
      _enabled = !_enabled;
      localStorage.setItem('sfx', _enabled ? '1' : '0');
      if (_enabled) this.click();
      return _enabled;
    },

    setVolume(v) {
      _vol = Math.max(0, Math.min(1, v));
      localStorage.setItem('sfx_vol', _vol);
    },

    // ── UI ─────────────────────────────────────────
    click() {
      if (!_enabled) return;
      try {
        const g = master(0.18);
        tone('sine', 900, 0,    0.07, g, 0.003, 0.05);
        tone('sine', 1100, 0.03, 0.05, g, 0.003, 0.04);
      } catch(e) {}
    },

    hover() {
      if (!_enabled) return;
      try {
        const g = master(0.07);
        tone('sine', 700, 0, 0.05, g, 0.002, 0.04);
      } catch(e) {}
    },

    tab() {
      if (!_enabled) return;
      try {
        const g = master(0.13);
        tone('triangle', 600, 0, 0.09, g, 0.004, 0.07);
      } catch(e) {}
    },

    // ── FEEDBACK ───────────────────────────────────
    success() {
      if (!_enabled) return;
      try {
        const g = master(0.22);
        tone('triangle', 523, 0,    0.14, g, 0.01, 0.08);
        tone('triangle', 659, 0.12, 0.14, g, 0.01, 0.08);
        tone('triangle', 784, 0.22, 0.20, g, 0.01, 0.12);
      } catch(e) {}
    },

    fail() {
      if (!_enabled) return;
      try {
        const g = master(0.18);
        tone('sawtooth', 240, 0,    0.14, g, 0.005, 0.10);
        tone('sawtooth', 180, 0.12, 0.18, g, 0.005, 0.14);
      } catch(e) {}
    },

    alert() {
      if (!_enabled) return;
      try {
        const g = master(0.16);
        tone('sine', 1300, 0,    0.08, g, 0.002, 0.06);
        tone('sine',  900, 0.07, 0.10, g, 0.002, 0.08);
      } catch(e) {}
    },

    // ── GAME EVENTS ────────────────────────────────
    war() {
      if (!_enabled) return;
      try {
        const g = master(0.32);
        // Alarm sirens
        [0, 0.38, 0.76].forEach(t => glide('square', 400, 880, t, 0.32, g));
        // Snare hits
        [0, 0.19, 0.38, 0.57, 0.76, 0.95].forEach(t => noise(t, 0.1, g, 200, 0.6));
        // Bass punch
        tone('sawtooth', 55, 0, 0.5, g, 0.005, 0.4);
      } catch(e) {}
    },

    explosion() {
      if (!_enabled) return;
      try {
        const g = master(0.3);
        noise(0, 0.55, g, 90, 0.35);
        tone('sawtooth', 70, 0,    0.35, g, 0.002, 0.30);
        tone('square',   45, 0.05, 0.25, g, 0.002, 0.22);
      } catch(e) {}
    },

    missile() {
      if (!_enabled) return;
      try {
        const g = master(0.2);
        glide('sawtooth', 800, 200, 0, 0.5, g);
        setTimeout(() => this.explosion(), 480);
      } catch(e) {}
    },

    fanfare() {
      if (!_enabled) return;
      try {
        const g = master(0.24);
        [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, i * 0.11, 0.28, g, 0.01, 0.1));
      } catch(e) {}
    },

    diplomatic() {
      if (!_enabled) return;
      try {
        const g = master(0.18);
        tone('sine', 440, 0,    0.12, g, 0.01, 0.08);
        tone('sine', 550, 0.10, 0.12, g, 0.01, 0.08);
        tone('sine', 660, 0.20, 0.16, g, 0.01, 0.12);
      } catch(e) {}
    },

    tick() {
      if (!_enabled) return;
      try {
        const g = master(0.09);
        tone('square', 660, 0, 0.04, g, 0.001, 0.02);
      } catch(e) {}
    },

    tickUrgent() {
      if (!_enabled) return;
      try {
        const g = master(0.15);
        tone('square', 880, 0,    0.04, g, 0.001, 0.02);
        tone('square', 880, 0.06, 0.04, g, 0.001, 0.02);
      } catch(e) {}
    },

    year() {
      if (!_enabled) return;
      try {
        const g = master(0.26);
        [392, 523, 659, 784].forEach((f, i) => tone('triangle', f, i * 0.18, 0.32 + i * 0.04, g, 0.012, 0.18));
      } catch(e) {}
    },

    nuke() {
      if (!_enabled) return;
      try {
        const g = master(0.4);
        noise(0, 1.8, g, 60, 0.3);
        tone('sawtooth', 28, 0,   1.4, g, 0.08, 1.0);
        tone('square',   40, 0.1, 1.0, g, 0.06, 0.8);
        glide('sawtooth', 500, 20, 0, 1.5, g);
      } catch(e) {}
    },

    collapse() {
      if (!_enabled) return;
      try {
        const g = master(0.22);
        glide('sawtooth', 280, 60, 0,    0.6, g);
        glide('sawtooth', 180, 40, 0.4,  0.6, g);
        noise(0, 0.8, g, 100, 0.5);
      } catch(e) {}
    },

    conquer() {
      if (!_enabled) return;
      try {
        const g = master(0.28);
        tone('triangle', 392, 0,    0.15, g, 0.01, 0.1);
        tone('triangle', 523, 0.12, 0.15, g, 0.01, 0.1);
        tone('triangle', 784, 0.24, 0.30, g, 0.01, 0.22);
        noise(0.24, 0.2, g, 300, 0.8);
      } catch(e) {}
    },

    invest() {
      if (!_enabled) return;
      try {
        const g = master(0.14);
        tone('sine', 350, 0,    0.08, g, 0.004, 0.06);
        tone('sine', 500, 0.07, 0.10, g, 0.004, 0.08);
      } catch(e) {}
    },
  };

  return sfx;
})();
