/* Olivier Cavadenti · synthétiseur modulaire
   Every module is a handful of Web Audio nodes and every cable a real audio connection, so any
   output can drive any input: sound, pitch, gates and envelopes are all just signals. Clocks,
   sequencers, envelopes, chaos, drums and the plucked string run sample by sample in an
   AudioWorklet. Cables carry a visible pulse of their own signal, and the print at the top of
   the page listens to the output. */
(() => {
  'use strict';

  const { min, max, pow, round, floor, abs, hypot, sin, cos, sqrt, tanh, exp, log, PI } = Math;
  const clamp = (v, a, b) => max(a, min(b, v));
  const C4 = 261.6256;
  const CABLE_COLORS = ['#c1473b', '#f2c230', '#3456a0', '#a5c63b', '#e58a2f', '#7d5ba6', '#2c8c80', '#e7a3a0'];
  const NOTES = ['do', 'do♯', 'ré', 'ré♯', 'mi', 'fa', 'fa♯', 'sol', 'sol♯', 'la', 'la♯', 'si'];
  const VOWELS = ['A', 'E', 'I', 'O', 'U'];
  const STORE = 'oc-synth-v2';
  const SVGNS = 'http://www.w3.org/2000/svg';

  /* ==========================================================================
     Audio-thread processors
     ========================================================================== */
  const WORKLET = `
const rise = (v, p) => v > 0.5 && p <= 0.5;

class Clock extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bpm', defaultValue: 120, minValue: 10, maxValue: 600, automationRate: 'k-rate' },
      { name: 'run', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor() { super(); this.ph = 0; this.beat = -1; }
  process(ins, outs, p) {
    const run = p.run[0] > 0.5, inc = run ? p.bpm[0] / 60 / sampleRate : 0, n = outs[0][0].length, mult = [4, 2, 1, 0.5, 0.25];
    for (let i = 0; i < n; i++) {
      this.ph += inc;
      for (let k = 0; k < 5; k++) outs[k][0][i] = run && (this.ph * mult[k]) % 1 < 0.5 ? 1 : 0;
    }
    const b = Math.floor(this.ph);
    if (run && b !== this.beat) { this.beat = b; this.port.postMessage(b); }
    return true;
  }
}
registerProcessor('oc-clock', Clock);

class Seq extends AudioWorkletProcessor {
  constructor() {
    super();
    this.v = [0, 0, 0, 0, 0, 0, 0, 0]; this.g = [1, 1, 1, 1, 1, 1, 1, 1]; this.len = 8;
    this.step = -1; this.pc = 0; this.pr = 0;
    this.port.onmessage = (e) => { const d = e.data; if (d.v) this.v = d.v; if (d.g) this.g = d.g; if (d.len) this.len = d.len; };
  }
  process(ins, outs) {
    const clk = ins[0][0], rst = ins[1][0], P = outs[0][0], G = outs[1][0];
    let moved = false;
    for (let i = 0; i < P.length; i++) {
      const c = clk ? clk[i] : 0, r = rst ? rst[i] : 0;
      if (rise(r, this.pr)) { this.step = -1; moved = true; }
      if (rise(c, this.pc)) { this.step = (this.step + 1) % this.len; moved = true; }
      this.pc = c; this.pr = r;
      const s = Math.max(0, this.step);
      P[i] = this.v[s];
      G[i] = this.step >= 0 && c > 0.5 && this.g[s] ? 1 : 0;
    }
    if (moved) this.port.postMessage(this.step);
    return true;
  }
}
registerProcessor('oc-seq', Seq);

// euclidean rhythm: k pulses spread as evenly as possible over n steps
class Euclid extends AudioWorkletProcessor {
  constructor() {
    super();
    this.n = 16; this.k = 5; this.rot = 0; this.i = -1; this.pc = 0; this.pr = 0;
    this.port.onmessage = (e) => Object.assign(this, e.data);
  }
  hit(i) { const j = (((i - this.rot) % this.n) + this.n) % this.n; return this.k > 0 && (j * this.k) % this.n < this.k; }
  process(ins, outs) {
    const clk = ins[0][0], rst = ins[1][0], H = outs[0][0], M = outs[1][0];
    let moved = false;
    for (let s = 0; s < H.length; s++) {
      const c = clk ? clk[s] : 0, r = rst ? rst[s] : 0;
      if (rise(r, this.pr)) { this.i = -1; moved = true; }
      if (rise(c, this.pc)) { this.i = (this.i + 1) % this.n; moved = true; }
      this.pc = c; this.pr = r;
      const on = this.i >= 0 && c > 0.5, h = this.hit(Math.max(0, this.i));
      H[s] = on && h ? 1 : 0; M[s] = on && !h ? 1 : 0;
    }
    if (moved) this.port.postMessage(this.i);
    return true;
  }
}
registerProcessor('oc-euclid', Euclid);

class Adsr extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return ['a', 'd', 's', 'r'].map((name, i) => ({ name, defaultValue: [0.01, 0.2, 0.5, 0.3][i], minValue: 0, maxValue: 20, automationRate: 'k-rate' }));
  }
  constructor() { super(); this.env = 0; this.st = 0; this.pg = false; this.man = false; this.port.onmessage = (e) => { this.man = !!e.data; }; }
  process(ins, outs, p) {
    const g = ins[0][0], o = outs[0][0], sr = sampleRate;
    const a = 1 / (Math.max(0.0005, p.a[0]) * sr), s = p.s[0];
    const kd = 1 - Math.exp(-4.6 / (Math.max(0.001, p.d[0]) * sr)), kr = 1 - Math.exp(-4.6 / (Math.max(0.001, p.r[0]) * sr));
    for (let i = 0; i < o.length; i++) {
      const on = (g ? g[i] > 0.5 : false) || this.man;
      if (on && !this.pg) this.st = 1; else if (!on && this.pg) this.st = 3;
      this.pg = on;
      if (this.st === 1) { this.env += a; if (this.env >= 1) { this.env = 1; this.st = 2; } }
      else if (this.st === 2) this.env += (s - this.env) * kd;
      else if (this.st === 3) this.env -= this.env * kr;
      o[i] = this.env;
    }
    return true;
  }
}
registerProcessor('oc-adsr', Adsr);

class SampleHold extends AudioWorkletProcessor {
  constructor() { super(); this.h = 0; this.pt = 0; }
  process(ins, outs) {
    const x = ins[0][0], t = ins[1][0], o = outs[0][0];
    for (let i = 0; i < o.length; i++) {
      const tv = t ? t[i] : 0;
      if (rise(tv, this.pt)) this.h = x ? x[i] : Math.random() * 2 - 1;
      this.pt = tv; o[i] = this.h;
    }
    return true;
  }
}
registerProcessor('oc-sh', SampleHold);

class Quant extends AudioWorkletProcessor {
  constructor() { super(); this.sc = [0, 3, 5, 7, 10]; this.li = NaN; this.lo = 0; this.port.onmessage = (e) => { this.sc = e.data; this.li = NaN; }; }
  process(ins, outs) {
    const x = ins[0][0], o = outs[0][0];
    for (let i = 0; i < o.length; i++) {
      const v = x ? x[i] : 0;
      if (v !== this.li) {
        this.li = v;
        const semi = v * 12, oct = Math.floor(semi / 12) * 12;
        let best = 0, bd = 1e9;
        for (const c of this.sc) for (const k of [-12, 0, 12]) { const d = Math.abs(oct + c + k - semi); if (d < bd) { bd = d; best = oct + c + k; } }
        this.lo = best / 12;
      }
      o[i] = this.lo;
    }
    return true;
  }
}
registerProcessor('oc-quant', Quant);

// Lorenz attractor, from a slow drift up to audio rate
class Lorenz extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rate', defaultValue: 1, minValue: 0, maxValue: 400, automationRate: 'k-rate' },
      { name: 'rho', defaultValue: 28, minValue: 5, maxValue: 80, automationRate: 'k-rate' },
    ];
  }
  constructor() { super(); this.x = 0.1; this.y = 0; this.z = 20; this.blk = 0; }
  process(ins, outs, p) {
    const cv = ins[0][0], rho = p.rho[0], X = outs[0][0], Y = outs[1][0], Z = outs[2][0], base = p.rate[0] / sampleRate;
    for (let i = 0; i < X.length; i++) {
      const dt = Math.min(0.01, base * (cv ? Math.pow(2, cv[i]) : 1));
      const dx = 10 * (this.y - this.x), dy = this.x * (rho - this.z) - this.y, dz = this.x * this.y - (8 / 3) * this.z;
      this.x += dx * dt; this.y += dy * dt; this.z += dz * dt;
      if (!Number.isFinite(this.x + this.y + this.z)) { this.x = 0.1; this.y = 0; this.z = 20; }
      X[i] = this.x / 20; Y[i] = this.y / 27; Z[i] = (this.z - rho + 3) / 25;
    }
    if (++this.blk % 3 === 0) this.port.postMessage([this.x, this.z]);
    return true;
  }
}
registerProcessor('oc-lorenz', Lorenz);

// synthetic drum: a sine that falls in pitch, plus a burst of filtered noise
class Drum extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [['pitch', 55], ['sweep', 0.6], ['decay', 0.4], ['noise', 0], ['tone', 0.5]]
      .map(([name, d]) => ({ name, defaultValue: d, minValue: 0, maxValue: 1000, automationRate: 'k-rate' }));
  }
  constructor() { super(); this.ph = 0; this.env = 0; this.pe = 0; this.ne = 0; this.lp = 0; this.pt = 0; }
  process(ins, outs, p) {
    const t = ins[0][0], cv = ins[1][0], o = outs[0][0], sr = sampleRate;
    const kA = Math.exp(-1 / (Math.max(0.01, p.decay[0]) * sr)), kN = Math.exp(-1 / (Math.max(0.005, p.decay[0] * 0.45) * sr)), kP = Math.exp(-1 / ((0.01 + 0.03 * p.sweep[0]) * sr));
    const f0 = p.pitch[0], sw = p.sweep[0] * 7, nz = p.noise[0], tone = 0.05 + p.tone[0] * 0.9;
    for (let i = 0; i < o.length; i++) {
      const tv = t ? t[i] : 0;
      if (rise(tv, this.pt)) { this.env = 1; this.pe = 1; this.ne = 1; this.ph = 0; }
      this.pt = tv;
      const f = f0 * (cv ? Math.pow(2, cv[i]) : 1) * (1 + sw * this.pe);
      this.ph += f / sr;
      this.lp += tone * (Math.random() * 2 - 1 - this.lp);
      const body = Math.sin(2 * Math.PI * this.ph) * this.env, hiss = this.lp * this.ne * 1.6;
      o[i] = Math.tanh((body * (1 - nz * 0.6) + hiss * nz) * 1.1);
      this.env *= kA; this.ne *= kN; this.pe *= kP;
    }
    return true;
  }
}
registerProcessor('oc-drum', Drum);

// break machine: a 16-step grid of kick, snare and hat, played with short acoustic-ish voices.
// Chop replays another step of the break (or stutters the last one), ratchet retriggers inside a step.
class Breaks extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [['chop', 0], ['ratchet', 0], ['kick', 62], ['snare', 0.5], ['hat', 0.05], ['lvl', 0.8]]
      .map(([name, d]) => ({ name, defaultValue: d, minValue: 0, maxValue: 1000, automationRate: 'k-rate' }));
  }
  constructor() {
    super();
    const z = () => new Array(16).fill(0);
    this.grid = { k: z(), s: z(), h: z() };
    this.step = -1; this.src = 0; this.pc = 0; this.pr = 0; this.n = 0; this.last = 0; this.period = sampleRate / 8; this.trigs = [];
    this.k = { ph: 0, env: 0, pe: 0, click: 0 }; this.s = { env: 0, ne: 0, ph1: 0, ph2: 0, hp: 0, x: 0 }; this.h = { env: 0, x: 0 };
    this.port.onmessage = (e) => { if (e.data.grid) this.grid = e.data.grid; };
  }
  hit(lane, vel) {
    if (lane === 'k') { const k = this.k; k.env = vel; k.pe = 1; k.ph = 0; k.click = vel; }
    else if (lane === 's') { this.s.env = vel; this.s.ne = vel; }
    else this.h.env = vel;
  }
  process(ins, outs, p) {
    const clk = ins[0][0], rst = ins[1][0], sr = sampleRate, O = outs.map((o) => o[0]);
    const chop = p.chop[0], rat = p.ratchet[0], kf = p.kick[0], tone = p.snare[0], lvl = p.lvl[0];
    const kA = Math.exp(-1 / (0.18 * sr)), kP = Math.exp(-1 / (0.012 * sr)), kC = Math.exp(-1 / (0.003 * sr));
    const sT = Math.exp(-1 / (0.06 * sr)), sN = Math.exp(-1 / ((0.08 + 0.12 * tone) * sr)), hA = Math.exp(-1 / (Math.max(0.01, p.hat[0]) * sr));
    let moved = false;
    for (let i = 0; i < O[0].length; i++) {
      this.n++;
      const c = clk ? clk[i] : 0, r = rst ? rst[i] : 0;
      if (rise(r, this.pr)) this.step = -1;
      if (rise(c, this.pc)) {
        if (this.last) this.period = Math.min(sr, this.n - this.last);
        this.last = this.n;
        this.step = (this.step + 1) % 16; moved = true;
        let src = this.step;
        if (Math.random() < chop) src = Math.random() < 0.5 ? this.src : Math.floor(Math.random() * 16);
        this.src = src;
        const reps = Math.random() < rat ? [2, 3, 4][Math.floor(Math.random() * 3)] : 1;
        for (const lane of ['k', 's', 'h']) {
          const v = this.grid[lane][src];
          if (!v) continue;
          const vel = v === 2 ? 0.32 : 1, n = lane === 'k' ? 1 : reps;
          for (let j = 0; j < n; j++) this.trigs.push([this.n + Math.floor((j * this.period) / n), lane, j ? vel * (0.55 + 0.45 * (j / n)) : vel]);
        }
      }
      this.pc = c; this.pr = r;
      for (let t = this.trigs.length - 1; t >= 0; t--) if (this.trigs[t][0] <= this.n) { this.hit(this.trigs[t][1], this.trigs[t][2]); this.trigs.splice(t, 1); }
      const nz = Math.random() * 2 - 1;
      // kick: a short thud that drops from about 2.5 times its pitch, with a beater click
      const k = this.k;
      k.ph += (kf * (1 + 1.5 * k.pe)) / sr;
      const kick = Math.sin(2 * Math.PI * k.ph) * k.env + nz * k.click * 0.3;
      k.env *= kA; k.pe *= kP; k.click *= kC;
      // snare: two body tones and a burst of bright noise
      const s = this.s;
      s.ph1 += 185 / sr; s.ph2 += 330 / sr;
      s.hp = 0.62 * (s.hp + nz - s.x); s.x = nz;
      const snare = (Math.sin(2 * Math.PI * s.ph1) * 0.6 + Math.sin(2 * Math.PI * s.ph2) * 0.4) * s.env * (0.9 - tone * 0.5) + s.hp * s.ne * (0.45 + tone * 0.6);
      s.env *= sT; s.ne *= sN;
      // hat: the difference of white noise keeps only its top end
      const h = this.h, hat = (nz - h.x) * 0.45 * h.env;
      h.x = nz; h.env *= hA;
      O[1][i] = kick; O[2][i] = snare; O[3][i] = hat;
      O[0][i] = Math.tanh((kick * 0.85 + snare * 0.7 + hat * 0.5) * lvl);
      const on = this.step >= 0 && this.n - this.last < this.period * 0.5;
      O[4][i] = on && this.grid.k[this.src] ? 1 : 0;
      O[5][i] = on && this.grid.s[this.src] ? 1 : 0;
    }
    if (moved) this.port.postMessage([this.step, this.src]);
    return true;
  }
}
registerProcessor('oc-breaks', Breaks);

// Karplus-Strong plucked string
class Pluck extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [['freq', 130], ['fb', 0.995], ['bright', 0.5]]
      .map(([name, d]) => ({ name, defaultValue: d, minValue: 0, maxValue: 20000, automationRate: 'k-rate' }));
  }
  constructor() { super(); this.buf = new Float32Array(8192); this.w = 0; this.prev = 0; this.pt = 0; }
  process(ins, outs, p) {
    const t = ins[0][0], cv = ins[1][0], o = outs[0][0], sr = sampleRate, B = this.buf, M = 8191;
    const fb = p.fb[0], br = p.bright[0], f0 = p.freq[0];
    for (let i = 0; i < o.length; i++) {
      const f = Math.min(4000, Math.max(20, f0 * (cv ? Math.pow(2, cv[i]) : 1))), L = sr / f;
      const tv = t ? t[i] : 0;
      if (rise(tv, this.pt)) {
        let lp = 0;
        for (let k = 0, n = Math.ceil(L) + 2; k < n; k++) { lp += (0.15 + br * 0.85) * (Math.random() * 2 - 1 - lp); const j = (this.w - k) & M; B[j] = B[j] * 0.25 + lp * 0.9; }
      }
      this.pt = tv;
      const r = this.w - L, r0 = Math.floor(r), fr = r - r0;
      const y = B[r0 & M] * (1 - fr) + B[(r0 + 1) & M] * fr;
      const yf = br * y + (1 - br) * 0.5 * (y + this.prev);
      this.prev = y;
      this.w = (this.w + 1) & M;
      B[this.w] = yf * fb;
      o[i] = y;
    }
    return true;
  }
}
registerProcessor('oc-pluck', Pluck);

// three formant band-passes that glide between vowels
const VOW = [[730, 1090, 2440], [530, 1840, 2480], [270, 2290, 3010], [570, 840, 2410], [300, 870, 2240]];
class Voice extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [['vowel', 0], ['cv', 1], ['q', 0.5]]
      .map(([name, d]) => ({ name, defaultValue: d, minValue: -10, maxValue: 10, automationRate: 'k-rate' }));
  }
  constructor() { super(); this.lo = [0, 0, 0]; this.bp = [0, 0, 0]; }
  process(ins, outs, p) {
    const x = ins[0][0], cv = ins[1][0], o = outs[0][0], sr = sampleRate;
    const q = 1 / (4 + p.q[0] * 16), gains = [1, 0.7, 0.4];
    for (let i = 0; i < o.length; i++) {
      const m = Math.max(0, Math.min(3.999, p.vowel[0] + (cv ? cv[i] * p.cv[0] : 0))), a = Math.floor(m), fr = m - a;
      const inp = x ? x[i] : 0;
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        const fc = VOW[a][k] * (1 - fr) + VOW[a + 1][k] * fr, f = 2 * Math.sin(Math.PI * fc / sr);
        const hi = inp - this.lo[k] - q * this.bp[k];
        this.bp[k] += f * hi; this.lo[k] += f * this.bp[k];
        sum += this.bp[k] * gains[k] * q * 2.6;
      }
      o[i] = Math.tanh(sum * 1.5);
    }
    return true;
  }
}
registerProcessor('oc-voice', Voice);

// fewer bits, fewer samples
class Crush extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [['bits', 6], ['down', 4]].map(([name, d]) => ({ name, defaultValue: d, minValue: 1, maxValue: 64, automationRate: 'k-rate' }));
  }
  constructor() { super(); this.c = 0; this.h = 0; }
  process(ins, outs, p) {
    const x = ins[0][0], o = outs[0][0], lv = Math.pow(2, p.bits[0] - 1), d = p.down[0];
    for (let i = 0; i < o.length; i++) {
      if ((this.c += 1) >= d) { this.c -= d; this.h = Math.round((x ? x[i] : 0) * lv) / lv; }
      o[i] = this.h;
    }
    return true;
  }
}
registerProcessor('oc-crush', Crush);
`;

  /* ==========================================================================
     Audio helpers
     ========================================================================== */
  let AC = null, SINK = null;
  const live = { on: false, level: 0, bands: new Float32Array(9), beatAt: 0 };
  const gain = (v = 1) => { const g = AC.createGain(); g.gain.value = v; return g; };
  const konst = (v = 0) => { const c = AC.createConstantSource(); c.offset.value = v; c.start(); return c; };
  const glide = (param, v, tc = 0.012) => param.setTargetAtTime(v, AC.currentTime, tc);
  const setP = (node, name, v) => node.parameters.get(name).setTargetAtTime(v, AC.currentTime, 0.01);
  const osc = (type, f = 440) => { const o = AC.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
  const worklet = (name, nIn, nOut) => new AudioWorkletNode(AC, name, { numberOfInputs: nIn, numberOfOutputs: nOut, outputChannelCount: new Array(nOut).fill(1) });
  const shaper = (fn, n = 4096) => {
    const w = AC.createWaveShaper(), c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
    w.curve = c; w.oversample = '4x';
    return w;
  };
  const filter = (type, f, q = 0.7) => { const b = AC.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };

  // stereo reverb tail: noise under an exponential decay, darkened as it fades
  function impulse(size, damp) {
    const sr = AC.sampleRate, len = floor(sr * size), buf = AC.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let y = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len, c = 1 - damp * (0.25 + 0.7 * t);
        y += c * (Math.random() * 2 - 1 - y);
        d[i] = y * exp((-6.9 * i) / len) * min(1, i / (sr * 0.004));
      }
    }
    return buf;
  }

  /* ==========================================================================
     Module catalogue
     ========================================================================== */
  const F = {
    hz: (v) => (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + ' kHz' : (v < 10 ? v.toFixed(2) : round(v)) + ' Hz'),
    s: (v) => (v < 1 ? round(v * 1000) + ' ms' : v.toFixed(2) + ' s'),
    pct: (v) => round(v * 100) + ' %',
    x: (v) => '×' + (v < 10 ? v.toFixed(v < 1 ? 2 : 1) : round(v)),
    st: (v) => (v > 0 ? '+' : '') + round(v) + ' dt',
    ct: (v) => (v > 0 ? '+' : '') + round(v) + ' ct',
    oct: (v) => (v > 0 ? '+' : '') + (Number.isInteger(v) ? v : v.toFixed(1)) + ' oct',
    bi: (v) => (v > 0 ? '+' : '') + v.toFixed(2),
    int: (v) => String(round(v)),
    bpm: (v) => round(v) + ' BPM',
    bits: (v) => round(v) + ' bits',
    note: (v) => NOTES[round(v) % 12] + (v >= 24 ? '⁺⁺' : v >= 12 ? '⁺' : ''),
    win: (v) => (v / 48).toFixed(1) + ' ms',
    vowel: (v) => { const a = floor(min(3.999, v)), f = v - a; return f < 0.1 ? VOWELS[a] : f > 0.9 ? VOWELS[a + 1] : VOWELS[a] + '→' + VOWELS[a + 1]; },
  };
  const K = (id, label, lo, hi, def, o = {}) => ({ id, label, lo, hi, def, log: !!o.log, step: o.step || 0, fmt: o.fmt || F.bi, size: o.size || 'm', fixed: !!o.fixed });
  const SW = (id, label, opts, def = 0) => ({ id, label, opts, def, sw: true });
  const J = (id, label) => ({ id, label });
  const out = (node, idx = 0) => ({ node, idx });
  // the Amen break, one character per sixteenth: 1 a hit, 2 a ghost note
  const AMEN = { k: '1010000000110000', s: '0000100202001002', h: '1010101010101010' };
  const grid = (k, sn, hh) => Object.fromEntries([['k', k], ['s', sn], ['h', hh]].flatMap(([l, pat]) => [...pat].map((c, i) => [l + i, +c])));

  const DEFS = {
    clock: {
      name: 'Horloge', tag: 'CLK', hp: 4, cat: 'ctrl', custom: 'clock',
      controls: [K('bpm', 'Tempo', 30, 300, 110, { step: 1, fmt: F.bpm, size: 'l' }), SW('run', 'Marche', ['MARCHE', 'ARRÊT'])],
      ins: [], outs: [J('x4', '1/16'), J('x2', '1/8'), J('x1', '1/4'), J('d2', '1/2'), J('d4', 'MESURE')],
      build(m) {
        const n = worklet('oc-clock', 0, 5);
        n.port.onmessage = () => { m.flash('beat'); live.beatAt = performance.now(); };
        return {
          ins: {}, outs: { x4: out(n, 0), x2: out(n, 1), x1: out(n, 2), d2: out(n, 3), d4: out(n, 4) },
          set(id, v) {
            if (id === 'bpm') n.parameters.get('bpm').setValueAtTime(v, AC.currentTime);
            else n.parameters.get('run').setValueAtTime(v ? 0 : 1, AC.currentTime);
          },
        };
      },
    },
    seq: {
      name: 'Séquenceur', tag: 'SEQ', hp: 12, cat: 'ctrl', custom: 'seq',
      controls: [
        ...Array.from({ length: 8 }, (_, i) => K('s' + i, 'Pas ' + (i + 1), 0, 24, 0, { step: 1, fmt: F.note, size: 's' })),
        ...Array.from({ length: 8 }, (_, i) => SW('g' + i, 'Pas ' + (i + 1), ['ON', 'OFF'])),
        K('len', 'Longueur', 1, 8, 8, { step: 1, fmt: F.int, size: 's', fixed: true }),
      ],
      ins: [J('clk', 'HORL.'), J('rst', 'RAZ')], outs: [J('pitch', '1V/OCT'), J('gate', 'PORTE')],
      build(m) {
        const n = worklet('oc-seq', 2, 2);
        n.port.onmessage = (e) => m.step(e.data);
        const push = () => {
          const v = m.values, idx = [0, 1, 2, 3, 4, 5, 6, 7];
          n.port.postMessage({ v: idx.map((i) => v['s' + i] / 12), g: idx.map((i) => (v['g' + i] ? 0 : 1)), len: v.len });
        };
        return { ins: { clk: out(n, 0), rst: out(n, 1) }, outs: { pitch: out(n, 0), gate: out(n, 1) }, set: push };
      },
    },
    keys: {
      name: 'Clavier', tag: 'KBD', hp: 12, cat: 'ctrl', custom: 'keys',
      controls: [K('glide', 'Glissé', 0, 1, 0, { fmt: F.s, size: 's' })],
      ins: [], outs: [J('pitch', '1V/OCT'), J('gate', 'PORTE')],
      build(m) {
        const p = konst(0), g = konst(0);
        m.kbd = { p: p.offset, g: g.offset };
        return { ins: {}, outs: { pitch: out(p), gate: out(g) }, set() {} };
      },
    },
    euclid: {
      name: 'Euclide', tag: 'EUC', hp: 5, cat: 'ctrl', custom: 'euclid',
      controls: [K('n', 'Pas', 2, 16, 16, { step: 1, fmt: F.int, size: 's', fixed: true }), K('k', 'Coups', 0, 16, 5, { step: 1, fmt: F.int, size: 's' }), K('rot', 'Rotation', 0, 15, 0, { step: 1, fmt: F.int, size: 's' })],
      ins: [J('clk', 'HORL.'), J('rst', 'RAZ')], outs: [J('hit', 'COUP'), J('miss', 'SILENCE')],
      build(m) {
        const n = worklet('oc-euclid', 2, 2);
        n.port.onmessage = (e) => m.ring(e.data);
        return {
          ins: { clk: out(n, 0), rst: out(n, 1) }, outs: { hit: out(n, 0), miss: out(n, 1) },
          set() { const v = m.values; n.port.postMessage({ n: v.n, k: min(v.k, v.n), rot: v.rot }); },
        };
      },
    },
    breaks: {
      name: 'Boîte à breaks', tag: 'BRK', hp: 8, cat: 'ctrl', custom: 'breaks',
      controls: [
        ...[['k', AMEN.k], ['s', AMEN.s], ['h', AMEN.h]].flatMap(([l, pat]) => Array.from({ length: 16 }, (_, i) => SW(l + i, l + i, ['·', '●', '○'], +pat[i]))),
        K('chop', 'Hachage', 0, 1, 0, { fmt: F.pct, size: 's' }), K('ratchet', 'Roulements', 0, 1, 0, { fmt: F.pct, size: 's' }),
        K('kick', 'Gr. caisse', 40, 120, 62, { log: true, fmt: F.hz, size: 's' }), K('snare', 'Timbre', 0, 1, 0.5, { fmt: F.pct, size: 's' }),
        K('hat', 'Charley', 0.015, 0.3, 0.05, { log: true, fmt: F.s, size: 's' }), K('lvl', 'Niveau', 0, 1.5, 0.8, { fmt: F.pct, size: 's' }),
      ],
      ins: [J('clk', 'HORL.'), J('rst', 'RAZ')],
      outs: [J('mix', 'MIX'), J('k', 'G.C.'), J('s', 'C.C.'), J('h', 'CH.'), J('gk', 'P. G.C.'), J('gs', 'P. C.C.')],
      build(m) {
        const n = worklet('oc-breaks', 2, 6);
        n.port.onmessage = (e) => m.step(e.data);
        const lane = (l) => Array.from({ length: 16 }, (_, i) => m.values[l + i]);
        return {
          ins: { clk: out(n, 0), rst: out(n, 1) },
          outs: { mix: out(n, 0), k: out(n, 1), s: out(n, 2), h: out(n, 3), gk: out(n, 4), gs: out(n, 5) },
          set(id, v) { if (/^[ksh]\d+$/.test(id)) n.port.postMessage({ grid: { k: lane('k'), s: lane('s'), h: lane('h') } }); else setP(n, id, v); },
        };
      },
    },
    lfo: {
      name: 'Balancier', tag: 'LFO', hp: 4, cat: 'mod',
      controls: [K('rate', 'Vitesse', 0.02, 30, 0.5, { log: true, fmt: F.hz, size: 'l' }), K('amp', 'Ampleur', 0, 1, 1, { fmt: F.pct })],
      ins: [J('rate', 'VIT.')], outs: [J('sin', 'SIN'), J('tri', 'TRI'), J('saw', 'SCIE'), J('sqr', 'CARRÉ')],
      build() {
        const rate = gain(1200), outs = {}, os = [];
        for (const [k, t] of [['sin', 'sine'], ['tri', 'triangle'], ['saw', 'sawtooth'], ['sqr', 'square']]) {
          const o = osc(t, 0.5), a = gain(1);
          o.connect(a); rate.connect(o.detune); os.push(o); outs[k] = out(a);
        }
        return {
          ins: { rate: out(rate) }, outs,
          set(id, v) { if (id === 'rate') os.forEach((o) => glide(o.frequency, v)); else Object.values(outs).forEach((o) => glide(o.node.gain, v)); },
        };
      },
    },
    chaos: {
      name: 'Attracteur', tag: 'LORENZ', hp: 4, cat: 'mod', custom: 'chaos',
      controls: [K('rate', 'Vitesse', 0.05, 300, 0.6, { log: true, fmt: F.x }), K('rho', 'Rhô', 5, 80, 28, { fmt: F.int, size: 's' })],
      ins: [J('rate', 'VIT.')], outs: [J('x', 'X'), J('y', 'Y'), J('z', 'Z')],
      build(m) {
        const n = worklet('oc-lorenz', 1, 3);
        n.port.onmessage = (e) => m.trail(e.data);
        return { ins: { rate: out(n) }, outs: { x: out(n, 0), y: out(n, 1), z: out(n, 2) }, set(id, v) { setP(n, id, v); } };
      },
    },
    sh: {
      name: 'Bloqueur', tag: 'S&H', hp: 3, cat: 'mod', note: 'IN vide : une valeur au hasard à chaque déclenchement',
      controls: [], ins: [J('in', 'IN'), J('trig', 'DÉCL.')], outs: [J('out', 'OUT')],
      build() { const n = worklet('oc-sh', 2, 1); return { ins: { in: out(n, 0), trig: out(n, 1) }, outs: { out: out(n) }, set() {} }; },
    },
    quant: {
      name: 'Gammes', tag: 'QNT', hp: 4, cat: 'mod',
      controls: [SW('scale', 'Gamme', ['PENTA', 'MAJEURE', 'MINEURE', 'BLUES', 'CHROM.']), K('trans', 'Transpo.', -12, 12, 0, { step: 1, fmt: F.st })],
      ins: [J('in', 'IN')], outs: [J('out', 'OUT')],
      build() {
        const n = worklet('oc-quant', 1, 1), off = konst(0), sum = gain(1);
        n.connect(sum); off.connect(sum);
        const SC = [[0, 3, 5, 7, 10], [0, 2, 4, 5, 7, 9, 11], [0, 2, 3, 5, 7, 8, 10], [0, 3, 5, 6, 7, 10], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]];
        return {
          ins: { in: out(n) }, outs: { out: out(sum) },
          set(id, v) { if (id === 'scale') n.port.postMessage(SC[v]); else off.offset.setValueAtTime(v / 12, AC.currentTime); },
        };
      },
    },
    att: {
      name: 'Dosage', tag: 'ATT', hp: 4, cat: 'mod',
      controls: [K('a1', 'Gain 1', -1, 1, 1), K('o1', 'Décal. 1', -2, 2, 0), K('a2', 'Gain 2', -1, 1, 1), K('o2', 'Décal. 2', -2, 2, 0)],
      ins: [J('in1', 'IN 1'), J('in2', 'IN 2')], outs: [J('out1', 'OUT 1'), J('out2', 'OUT 2')],
      build() {
        const P = {};
        for (const k of ['1', '2']) { const a = gain(1), o = konst(0), s = gain(1); a.connect(s); o.connect(s); P[k] = { a, o, s }; }
        return {
          ins: { in1: out(P[1].a), in2: out(P[2].a) }, outs: { out1: out(P[1].s), out2: out(P[2].s) },
          set(id, v) { const p = P[id[1]]; glide(id[0] === 'a' ? p.a.gain : p.o.offset, v); },
        };
      },
    },
    vco: {
      name: 'Oscillateur', tag: 'VCO', hp: 5, cat: 'src',
      controls: [K('oct', 'Octave', -3, 3, 0, { step: 1, fmt: F.oct }), K('tune', 'Accord', -12, 12, 0, { step: 1, fmt: F.st }),
        K('fine', 'Fin', -50, 50, 0, { fmt: F.ct, size: 's' }), K('fm', 'FM', 0, 1, 0, { fmt: F.pct, size: 's' })],
      ins: [J('pitch', '1V/OCT'), J('fm', 'FM')], outs: [J('sin', 'SIN'), J('tri', 'TRI'), J('saw', 'SCIE'), J('sqr', 'CARRÉ'), J('sub', 'SUB')],
      build(m) {
        const pitch = gain(1200), fm = gain(0), outs = {}, os = {};
        for (const [k, t] of [['sin', 'sine'], ['tri', 'triangle'], ['saw', 'sawtooth'], ['sqr', 'square'], ['sub', 'square']]) {
          const o = osc(t); pitch.connect(o.detune); fm.connect(o.frequency); os[k] = o; outs[k] = out(o);
        }
        return {
          ins: { pitch: out(pitch), fm: out(fm) }, outs,
          set(id, v) {
            if (id === 'fm') { glide(fm.gain, v * v * 3000); return; }
            const hz = C4 * pow(2, m.values.oct + m.values.tune / 12 + m.values.fine / 1200);
            for (const k in os) glide(os[k].frequency, k === 'sub' ? hz / 2 : hz, 0.004);
          },
        };
      },
    },
    noise: {
      name: 'Bruit', tag: 'NSE', hp: 3, cat: 'src',
      controls: [K('drift', 'Dérive', 0.1, 20, 1, { log: true, fmt: F.hz })],
      ins: [], outs: [J('white', 'BLANC'), J('dark', 'SOMBRE'), J('drift', 'DÉRIVE')],
      build() {
        const len = AC.sampleRate * 3, buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = AC.createBufferSource(); src.buffer = buf; src.loop = true; src.start();
        const white = gain(0.8), dark = filter('lowpass', 700), darkG = gain(1.8), s1 = filter('lowpass', 1, 0.5), s2 = filter('lowpass', 1, 0.5), slowG = gain(1);
        src.connect(white); src.connect(dark); dark.connect(darkG); src.connect(s1); s1.connect(s2); s2.connect(slowG);
        return {
          ins: {}, outs: { white: out(white), dark: out(darkG), drift: out(slowG) },
          set(id, v) { glide(s1.frequency, v); glide(s2.frequency, v); glide(slowG.gain, 0.3 / sqrt((2 * v) / AC.sampleRate)); },
        };
      },
    },
    pluck: {
      name: 'Corde', tag: 'PLUCK', hp: 4, cat: 'src',
      controls: [K('oct', 'Octave', -3, 2, -1, { step: 1, fmt: F.oct }), K('decay', 'Tenue', 0, 1, 0.7, { fmt: F.pct }), K('bright', 'Éclat', 0, 1, 0.5, { fmt: F.pct, size: 's' })],
      ins: [J('trig', 'PINCER'), J('pitch', '1V/OCT')], outs: [J('out', 'OUT')],
      build() {
        const n = worklet('oc-pluck', 2, 1);
        return {
          ins: { trig: out(n, 0), pitch: out(n, 1) }, outs: { out: out(n) },
          set(id, v) {
            if (id === 'oct') setP(n, 'freq', C4 * pow(2, v));
            else if (id === 'decay') setP(n, 'fb', 1 - pow(10, -1.6 - v * 2.4));
            else setP(n, 'bright', v);
          },
        };
      },
    },
    drum: {
      name: 'Percussion', tag: 'DRUM', hp: 5, cat: 'src',
      controls: [K('pitch', 'Hauteur', 25, 600, 55, { log: true, fmt: F.hz }), K('sweep', 'Chute', 0, 1, 0.6, { fmt: F.pct }), K('decay', 'Durée', 0.02, 2, 0.4, { log: true, fmt: F.s }),
        K('noise', 'Bruit', 0, 1, 0, { fmt: F.pct, size: 's' }), K('tone', 'Timbre', 0, 1, 0.5, { fmt: F.pct, size: 's' })],
      ins: [J('trig', 'FRAPPE'), J('pitch', '1V/OCT')], outs: [J('out', 'OUT')],
      build() {
        const n = worklet('oc-drum', 2, 1);
        return { ins: { trig: out(n, 0), pitch: out(n, 1) }, outs: { out: out(n) }, set(id, v) { setP(n, id, v); } };
      },
    },
    mix: {
      name: 'Mixeur', tag: 'MIX', hp: 5, cat: 'shape',
      controls: [1, 2, 3, 4].map((i) => K('l' + i, 'Voie ' + i, 0, 1, 0.8, { fmt: F.pct })),
      ins: [J('in1', 'IN 1'), J('in2', 'IN 2'), J('in3', 'IN 3'), J('in4', 'IN 4')], outs: [J('out', 'OUT')],
      build() {
        const sum = gain(1), ch = {};
        for (const i of [1, 2, 3, 4]) { ch[i] = gain(0.8); ch[i].connect(sum); }
        return { ins: { in1: out(ch[1]), in2: out(ch[2]), in3: out(ch[3]), in4: out(ch[4]) }, outs: { out: out(sum) }, set(id, v) { glide(ch[id[1]].gain, v); } };
      },
    },
    vcf: {
      name: 'Filtre', tag: 'VCF', hp: 5, cat: 'shape',
      controls: [K('freq', 'Coupure', 20, 16000, 1200, { log: true, fmt: F.hz, size: 'l' }), K('res', 'Résonance', 0, 1, 0.2, { fmt: F.pct }),
        SW('mode', 'Mode', ['BAS', 'BANDE', 'HAUT', 'COUPE']), K('cv1', 'CV 1', -5, 5, 0, { fmt: F.oct, size: 's' }), K('cv2', 'CV 2', -5, 5, 0, { fmt: F.oct, size: 's' })],
      ins: [J('in', 'IN'), J('cv1', 'CV 1'), J('cv2', 'CV 2')], outs: [J('out', 'OUT')],
      build(m) {
        const input = gain(1), f = AC.createBiquadFilter(), c1 = gain(0), c2 = gain(0);
        input.connect(f); c1.connect(f.detune); c2.connect(f.detune);
        // lowpass and highpass read Q in dB, bandpass and notch as a quality factor
        const q = () => { const r = m.values.res; glide(f.Q, m.values.mode % 2 === 0 ? -3 + r * 27 : 0.4 * pow(75, r)); };
        return {
          ins: { in: out(input), cv1: out(c1), cv2: out(c2) }, outs: { out: out(f) },
          set(id, v) {
            if (id === 'freq') glide(f.frequency, v);
            else if (id === 'res') q();
            else if (id === 'mode') { f.type = ['lowpass', 'bandpass', 'highpass', 'notch'][v]; q(); }
            else glide((id === 'cv1' ? c1 : c2).gain, v * 1200);
          },
        };
      },
    },
    voice: {
      name: 'Voyelles', tag: 'VOX', hp: 4, cat: 'shape',
      controls: [K('vowel', 'Voyelle', 0, 4, 0, { fmt: F.vowel, size: 'l' }), K('cv', 'CV', -4, 4, 1, { fmt: F.bi, size: 's' }), K('q', 'Netteté', 0, 1, 0.5, { fmt: F.pct, size: 's' })],
      ins: [J('in', 'IN'), J('cv', 'CV')], outs: [J('out', 'OUT')],
      build() { const n = worklet('oc-voice', 2, 1); return { ins: { in: out(n, 0), cv: out(n, 1) }, outs: { out: out(n) }, set(id, v) { setP(n, id, v); } }; },
    },
    adsr: {
      name: 'Enveloppe', tag: 'ADSR', hp: 4, cat: 'mod', custom: 'adsr',
      controls: [K('a', 'Attaque', 0.001, 5, 0.01, { log: true, fmt: F.s }), K('d', 'Déclin', 0.005, 5, 0.3, { log: true, fmt: F.s }),
        K('s', 'Maintien', 0, 1, 0.5, { fmt: F.pct }), K('r', 'Relâche', 0.005, 8, 0.4, { log: true, fmt: F.s })],
      ins: [J('gate', 'PORTE')], outs: [J('env', 'ENV'), J('inv', '−ENV')],
      build(m) {
        const n = worklet('oc-adsr', 1, 1), inv = gain(-1);
        n.connect(inv);
        m.hold = (on) => n.port.postMessage(on);
        return { ins: { gate: out(n) }, outs: { env: out(n), inv: out(inv) }, set(id, v) { n.parameters.get(id).setValueAtTime(v, AC.currentTime); } };
      },
    },
    vca: {
      name: 'Ampli', tag: 'VCA', hp: 3, cat: 'shape',
      controls: [K('base', 'Niveau', 0, 1, 0, { fmt: F.pct }), K('cv', 'CV', 0, 1, 1, { fmt: F.pct })],
      ins: [J('in', 'IN'), J('cv', 'CV')], outs: [J('out', 'OUT')],
      build() {
        const a = gain(0), c = gain(1);
        c.connect(a.gain);
        return { ins: { in: out(a), cv: out(c) }, outs: { out: out(a) }, set(id, v) { glide(id === 'base' ? a.gain : c.gain, v); } };
      },
    },
    ring: {
      name: 'Anneau', tag: 'RING', hp: 3, cat: 'shape', note: 'A × B',
      controls: [K('lvl', 'Niveau', 0, 1.5, 1, { fmt: F.pct })],
      ins: [J('a', 'A'), J('b', 'B')], outs: [J('out', 'OUT')],
      build() {
        const x = gain(0), o = gain(1);
        x.connect(o);
        return { ins: { a: out(x), b: { param: x.gain } }, outs: { out: out(o) }, set(id, v) { glide(o.gain, v); } };
      },
    },
    drive: {
      name: 'Saturation', tag: 'DRV', hp: 4, cat: 'shape',
      controls: [K('drive', 'Gain', 1, 40, 4, { log: true, fmt: F.x, size: 'l' }), K('lvl', 'Niveau', 0, 1.5, 0.7, { fmt: F.pct })],
      ins: [J('in', 'IN')], outs: [J('out', 'OUT')],
      build() {
        const pre = gain(4), ws = shaper((x) => tanh(x * 3) / tanh(3)), post = gain(0.7);
        pre.connect(ws); ws.connect(post);
        return { ins: { in: out(pre) }, outs: { out: out(post) }, set(id, v) { glide(id === 'drive' ? pre.gain : post.gain, id === 'drive' ? v / 3 : v); } };
      },
    },
    fold: {
      name: 'Replieur', tag: 'FOLD', hp: 4, cat: 'shape',
      controls: [K('fold', 'Repli', 1, 8, 1.5, { fmt: F.x, size: 'l' }), K('cv', 'CV', 0, 4, 0, { fmt: F.x, size: 's' }), K('lvl', 'Niveau', 0, 1.5, 0.8, { fmt: F.pct, size: 's' })],
      ins: [J('in', 'IN'), J('cv', 'CV')], outs: [J('out', 'OUT')],
      build() {
        const FMAX = 12, pre = gain(1.5 / FMAX), cv = gain(0), ws = shaper((x) => sin((x * FMAX * PI) / 2)), post = gain(0.8);
        pre.connect(ws); ws.connect(post); cv.connect(pre.gain);
        return {
          ins: { in: out(pre), cv: out(cv) }, outs: { out: out(post) },
          set(id, v) { if (id === 'fold') glide(pre.gain, v / FMAX); else if (id === 'cv') glide(cv.gain, v / FMAX); else glide(post.gain, v); },
        };
      },
    },
    crush: {
      name: 'Broyeur', tag: 'BITS', hp: 3, cat: 'shape',
      controls: [K('bits', 'Bits', 1, 16, 6, { step: 1, fmt: F.bits }), K('down', 'Sous-éch.', 1, 48, 4, { log: true, fmt: F.x })],
      ins: [J('in', 'IN')], outs: [J('out', 'OUT')],
      build() { const n = worklet('oc-crush', 1, 1); return { ins: { in: out(n) }, outs: { out: out(n) }, set(id, v) { n.parameters.get(id).setValueAtTime(v, AC.currentTime); } }; },
    },
    chorus: {
      name: 'Chorus', tag: 'CHO', hp: 4, cat: 'fx',
      controls: [K('rate', 'Vitesse', 0.05, 6, 0.5, { log: true, fmt: F.hz }), K('depth', 'Profondeur', 0, 1, 0.5, { fmt: F.pct }), K('mix', 'Mélange', 0, 1, 0.5, { fmt: F.pct })],
      ins: [J('in', 'IN')], outs: [J('l', 'G'), J('r', 'D')],
      build() {
        const input = gain(1), dry = gain(0.5), L = gain(1), R = gain(1), l1 = osc('sine', 0.5), l2 = osc('triangle', 0.7);
        const dL = AC.createDelay(0.1), dR = AC.createDelay(0.1), mL = gain(0.003), mR = gain(0.003), wL = gain(0.5), wR = gain(0.5);
        dL.delayTime.value = 0.012; dR.delayTime.value = 0.019;
        l1.connect(mL); mL.connect(dL.delayTime); l2.connect(mR); mR.connect(dR.delayTime);
        input.connect(dry); dry.connect(L); dry.connect(R);
        input.connect(dL); dL.connect(wL); wL.connect(L);
        input.connect(dR); dR.connect(wR); wR.connect(R);
        return {
          ins: { in: out(input) }, outs: { l: out(L), r: out(R) },
          set(id, v) {
            if (id === 'rate') { glide(l1.frequency, v); glide(l2.frequency, v * 1.37); }
            else if (id === 'depth') { glide(mL.gain, v * 0.006); glide(mR.gain, v * 0.006); }
            else { glide(dry.gain, 1 - v); glide(wL.gain, v); glide(wR.gain, v); }
          },
        };
      },
    },
    delay: {
      name: 'Écho', tag: 'DLY', hp: 5, cat: 'fx',
      controls: [K('time', 'Temps', 0.01, 2, 0.35, { log: true, fmt: F.s, size: 'l' }), K('fb', 'Réinjection', 0, 0.95, 0.45, { fmt: F.pct }),
        K('tone', 'Couleur', 300, 12000, 3500, { log: true, fmt: F.hz }), K('mix', 'Mélange', 0, 1, 0.35, { fmt: F.pct })],
      ins: [J('in', 'IN'), J('time', 'TEMPS')], outs: [J('out', 'OUT')],
      build() {
        const input = gain(1), d = AC.createDelay(2.5), fb = gain(0.45), tone = filter('lowpass', 3500), dry = gain(0.65), wet = gain(0.35), sum = gain(1), tcv = gain(0.25);
        input.connect(dry); dry.connect(sum);
        input.connect(d); d.connect(tone); tone.connect(fb); fb.connect(d); tone.connect(wet); wet.connect(sum);
        tcv.connect(d.delayTime);
        return {
          ins: { in: out(input), time: out(tcv) }, outs: { out: out(sum) },
          set(id, v) {
            if (id === 'time') glide(d.delayTime, v, 0.06);
            else if (id === 'fb') glide(fb.gain, v);
            else if (id === 'tone') glide(tone.frequency, v);
            else { glide(dry.gain, 1 - v); glide(wet.gain, v); }
          },
        };
      },
    },
    reverb: {
      name: 'Réverb', tag: 'REV', hp: 4, cat: 'fx',
      controls: [K('size', 'Durée', 0.3, 10, 3, { log: true, fmt: F.s, size: 'l' }), K('damp', 'Étouffé', 0, 1, 0.4, { fmt: F.pct }), K('mix', 'Mélange', 0, 1, 0.35, { fmt: F.pct })],
      ins: [J('in', 'IN')], outs: [J('out', 'OUT')],
      build(m) {
        const input = gain(1), conv = AC.createConvolver(), dry = gain(0.65), wet = gain(0.35), sum = gain(1);
        input.connect(dry); dry.connect(sum); input.connect(conv); conv.connect(wet); wet.connect(sum);
        let timer = 0;
        return {
          ins: { in: out(input) }, outs: { out: out(sum) },
          set(id, v) {
            if (id === 'mix') { glide(dry.gain, 1 - v * 0.7); glide(wet.gain, v); return; }
            clearTimeout(timer);
            timer = setTimeout(() => { conv.buffer = impulse(m.values.size, m.values.damp); }, 120);
          },
        };
      },
    },
    scope: {
      name: 'Oscilloscope', tag: 'SCP', hp: 8, cat: 'util', custom: 'scope',
      controls: [K('time', 'Fenêtre', 64, 2048, 512, { log: true, step: 1, fmt: F.win, fixed: true }), K('zoom', 'Zoom', 0.25, 4, 1, { log: true, fmt: F.x, fixed: true })],
      ins: [J('a', 'A'), J('b', 'B')], outs: [],
      build(m) {
        const a = AC.createAnalyser(), b = AC.createAnalyser();
        a.fftSize = b.fftSize = 4096;
        m.an = [a, b];
        return { ins: { a: out(a), b: out(b) }, outs: {}, extra: [a, b], set() {} };
      },
    },
    out: {
      name: 'Sortie', tag: 'OUT', hp: 5, cat: 'util', custom: 'out',
      controls: [K('vol', 'Volume', 0, 1, 0.5, { fmt: F.pct, size: 'l', fixed: true })],
      ins: [J('mix', 'MONO'), J('l', 'G'), J('r', 'D')], outs: [],
      build(m) {
        const mono = gain(1), l = gain(1), r = gain(1), merge = AC.createChannelMerger(2), master = gain(0.25), dc = filter('highpass', 8),
          lim = AC.createDynamicsCompressor(), an = AC.createAnalyser(), rec = AC.createMediaStreamDestination();
        l.connect(merge, 0, 0); r.connect(merge, 0, 1);
        mono.connect(master); merge.connect(master); master.connect(dc); dc.connect(lim);
        lim.connect(AC.destination); lim.connect(an); lim.connect(rec);
        lim.threshold.value = -8; lim.knee.value = 4; lim.ratio.value = 16; lim.attack.value = 0.002; lim.release.value = 0.15;
        an.fftSize = 2048; an.minDecibels = -90; an.maxDecibels = -20; an.smoothingTimeConstant = 0.75;
        m.an = an; m.stream = rec.stream;
        return { ins: { mix: out(mono), l: out(l), r: out(r) }, outs: {}, set(id, v) { glide(master.gain, v * v); } };
      },
    },
  };

  const CAT = { ctrl: 'var(--yellow)', mod: 'var(--sage)', src: 'var(--ochre)', shape: 'var(--blue)', fx: 'var(--red)', util: 'var(--lilac)' };
  const RACK = [
    ['clock', 'clock'], ['seq', 'seq'], ['keys', 'keys'], ['breaks', 'breaks'], ['euclid', 'euclid'], ['lfo1', 'lfo'], ['lfo2', 'lfo'], ['chaos', 'chaos'], ['sh', 'sh'], null,
    ['quant', 'quant'], ['vco1', 'vco'], ['vco2', 'vco'], ['vco3', 'vco'], ['noise', 'noise'], ['mix', 'mix'], ['vcf1', 'vcf'], ['vcf2', 'vcf'], ['voice', 'voice'], ['adsr1', 'adsr'], ['adsr2', 'adsr'], ['vca1', 'vca'], ['vca2', 'vca'], null,
    ['att', 'att'], ['pluck', 'pluck'], ['drum', 'drum'], ['ring', 'ring'], ['drive', 'drive'], ['fold', 'fold'], ['crush', 'crush'], ['chorus', 'chorus'], ['delay', 'delay'], ['reverb', 'reverb'], ['scope', 'scope'], ['out', 'out'],
  ];

  /* ==========================================================================
     Patches
     ========================================================================== */
  const seqVals = (notes, gates = '11111111') => Object.fromEntries([
    ...notes.map((v, i) => ['s' + i, v]),
    ...[...gates].map((g, i) => ['g' + i, g === '1' ? 0 : 1]),
  ]);
  const PRESETS = {
    jungle: {
      name: 'Jungle de Lorenz',
      values: {
        clock: { bpm: 132 }, euclid: { n: 16, k: 7, rot: 0 }, drum: { pitch: 56, sweep: 0.5, decay: 0.28, noise: 0.1, tone: 0.4 },
        chaos: { rate: 0.35, rho: 28 }, pluck: { oct: -1, decay: 0.75, bright: 0.55 }, voice: { vowel: 1.5, cv: 1.8, q: 0.6 },
        drive: { drive: 2.5, lvl: 0.55 }, delay: { time: 0.34, fb: 0.5, tone: 3000, mix: 0.35 }, reverb: { size: 5, damp: 0.35, mix: 0.35 },
        adsr2: { a: 0.001, d: 0.04, s: 0, r: 0.03 }, vca2: { cv: 0.35 }, vcf2: { freq: 8000, mode: 2, res: 0.2 }, out: { vol: 0.55 }, scope: { time: 700 },
      },
      cables: [['clock.x4', 'euclid.clk'], ['euclid.hit', 'drum.trig'], ['drum.out', 'drive.in'], ['drive.out', 'out.mix'],
        ['chaos.x', 'quant.in'], ['quant.out', 'pluck.pitch'], ['clock.x2', 'pluck.trig'], ['pluck.out', 'voice.in'], ['chaos.z', 'voice.cv'],
        ['voice.out', 'delay.in'], ['delay.out', 'reverb.in'], ['reverb.out', 'out.mix'],
        ['euclid.miss', 'adsr2.gate'], ['adsr2.env', 'vca2.cv'], ['noise.white', 'vcf2.in'], ['vcf2.out', 'vca2.in'], ['vca2.out', 'out.mix'],
        ['voice.out', 'scope.a'], ['chaos.x', 'scope.b']],
    },
    signal: {
      name: 'Basse acide',
      values: {
        clock: { bpm: 116 }, seq: seqVals([0, 12, 3, 0, 7, 10, 0, 15], '11011101'),
        vco1: { oct: -2 }, vco2: { oct: -2, fine: 8 }, mix: { l1: 0.8, l2: 0.45 },
        vcf1: { freq: 260, res: 0.72, cv1: 3.4, cv2: 0.7 }, lfo1: { rate: 0.12 },
        adsr1: { a: 0.003, d: 0.22, s: 0.12, r: 0.16 },
        delay: { time: 0.39, fb: 0.42, tone: 2800, mix: 0.3 }, reverb: { size: 2.4, damp: 0.5, mix: 0.2 }, out: { vol: 0.55 }, scope: { time: 900 },
      },
      cables: [['clock.x2', 'seq.clk'], ['seq.pitch', 'vco1.pitch'], ['seq.pitch', 'vco2.pitch'], ['vco1.saw', 'mix.in1'], ['vco2.sqr', 'mix.in2'],
        ['mix.out', 'vcf1.in'], ['seq.gate', 'adsr1.gate'], ['adsr1.env', 'vcf1.cv1'], ['lfo1.sin', 'vcf1.cv2'], ['adsr1.env', 'vca1.cv'],
        ['vcf1.out', 'vca1.in'], ['vca1.out', 'delay.in'], ['delay.out', 'reverb.in'], ['reverb.out', 'out.mix'], ['vca1.out', 'scope.a'], ['adsr1.env', 'scope.b']],
    },
    nappe: {
      name: 'Nappe cosmique',
      values: {
        keys: { glide: 0.08 }, vco1: { oct: -1, fine: -7 }, vco2: { oct: -1, fine: 7 }, vco3: { oct: -2 }, mix: { l1: 0.7, l2: 0.7, l3: 0.6 },
        vcf1: { freq: 620, res: 0.35, cv1: 1.6, cv2: 1.4 }, lfo1: { rate: 0.07 }, lfo2: { rate: 5.2 }, att: { a1: 0.015 },
        adsr2: { a: 0.9, d: 1.5, s: 0.75, r: 3.2 }, chorus: { rate: 0.35, depth: 0.7, mix: 0.5 }, reverb: { size: 7, damp: 0.35, mix: 0.5 },
        out: { vol: 0.6 }, scope: { time: 1400 },
      },
      cables: [['keys.pitch', 'vco1.pitch'], ['keys.pitch', 'vco2.pitch'], ['keys.pitch', 'vco3.pitch'], ['lfo2.sin', 'att.in1'], ['att.out1', 'vco1.pitch'], ['att.out1', 'vco2.pitch'],
        ['vco1.saw', 'mix.in1'], ['vco2.saw', 'mix.in2'], ['vco3.tri', 'mix.in3'], ['mix.out', 'vcf1.in'], ['lfo1.tri', 'vcf1.cv1'], ['keys.gate', 'adsr2.gate'],
        ['adsr2.env', 'vcf1.cv2'], ['adsr2.env', 'vca1.cv'], ['vcf1.out', 'vca1.in'], ['vca1.out', 'chorus.in'], ['chorus.l', 'out.l'], ['chorus.r', 'out.r'],
        ['chorus.l', 'reverb.in'], ['reverb.out', 'out.mix'], ['vca1.out', 'scope.a'], ['adsr2.env', 'scope.b']],
    },
    hasard: {
      name: 'Machine à hasard',
      values: {
        clock: { bpm: 124 }, vco1: { oct: 0 }, fold: { fold: 2.2, cv: 1.6, lvl: 0.8 }, lfo2: { rate: 0.13 }, crush: { bits: 7, down: 3 },
        adsr1: { a: 0.002, d: 0.14, s: 0, r: 0.12 }, delay: { time: 0.36, fb: 0.62, tone: 4200, mix: 0.42 }, reverb: { size: 4.5, damp: 0.3, mix: 0.35 },
        out: { vol: 0.5 }, scope: { time: 300 },
      },
      cables: [['clock.x4', 'sh.trig'], ['noise.white', 'sh.in'], ['sh.out', 'quant.in'], ['quant.out', 'vco1.pitch'], ['clock.x4', 'adsr1.gate'],
        ['vco1.tri', 'fold.in'], ['lfo2.sin', 'fold.cv'], ['fold.out', 'crush.in'], ['crush.out', 'vca1.in'], ['adsr1.env', 'vca1.cv'], ['vca1.out', 'delay.in'],
        ['delay.out', 'reverb.in'], ['reverb.out', 'out.mix'], ['vca1.out', 'scope.a'], ['quant.out', 'scope.b']],
    },
    bourdon: {
      name: 'Bourdon chaotique',
      values: {
        chaos: { rate: 140, rho: 34 }, noise: { drift: 0.3 }, vcf1: { freq: 900, res: 0.6, cv1: 2 }, vcf2: { freq: 1400, res: 0.7, mode: 1, cv1: 2.5 },
        lfo1: { rate: 0.09 }, lfo2: { rate: 0.13 }, voice: { vowel: 2, cv: 1.5 }, reverb: { size: 8, damp: 0.3, mix: 0.55 }, out: { vol: 0.45 }, scope: { time: 1600, zoom: 0.8 },
      },
      cables: [['noise.drift', 'chaos.rate'], ['chaos.x', 'vcf1.in'], ['chaos.y', 'vcf2.in'], ['lfo1.sin', 'vcf1.cv1'], ['lfo2.tri', 'vcf2.cv1'],
        ['vcf1.out', 'out.l'], ['vcf2.out', 'voice.in'], ['lfo1.tri', 'voice.cv'], ['voice.out', 'out.r'], ['vcf1.out', 'reverb.in'], ['voice.out', 'reverb.in'],
        ['reverb.out', 'out.mix'], ['chaos.x', 'scope.a'], ['chaos.y', 'scope.b']],
    },
    drill: {
      name: 'Drill & bass',
      values: {
        clock: { bpm: 172 },
        breaks: { ...grid(AMEN.k, AMEN.s, AMEN.h), chop: 0.35, ratchet: 0.3, kick: 58, snare: 0.6, hat: 0.04, lvl: 0.75 },
        crush: { bits: 8, down: 3 }, delay: { time: 0.087, fb: 0.35, tone: 5000, mix: 0.9 }, lfo2: { rate: 0.35, amp: 0.12 },
        seq: seqVals([0, 0, 12, 0, 3, 0, 10, 7], '10110101'),
        vco1: { oct: -2 }, mix: { l1: 0.8, l2: 0.6 }, vcf1: { freq: 220, res: 0.55, cv1: 3 }, adsr1: { a: 0.002, d: 0.15, s: 0.1, r: 0.06 },
        euclid: { n: 16, k: 5, rot: 3 }, pluck: { oct: 2, decay: 0.05, bright: 1 }, att: { a2: 0.3 }, reverb: { size: 0.9, damp: 0.3, mix: 0.3 },
        out: { vol: 0.6 }, scope: { time: 1200 },
      },
      cables: [['clock.x4', 'breaks.clk'], ['clock.d4', 'breaks.rst'], ['breaks.mix', 'out.mix'],
        ['breaks.s', 'crush.in'], ['crush.out', 'delay.in'], ['lfo2.sqr', 'delay.time'], ['delay.out', 'out.mix'],
        ['clock.x4', 'seq.clk'], ['clock.d2', 'seq.rst'], ['seq.pitch', 'vco1.pitch'], ['vco1.saw', 'mix.in1'], ['vco1.sub', 'mix.in2'], ['mix.out', 'vcf1.in'],
        ['seq.gate', 'adsr1.gate'], ['adsr1.env', 'vcf1.cv1'], ['adsr1.env', 'vca1.cv'], ['vcf1.out', 'vca1.in'], ['vca1.out', 'out.mix'],
        ['clock.x4', 'euclid.clk'], ['clock.d4', 'euclid.rst'], ['euclid.hit', 'pluck.trig'], ['clock.x4', 'sh.trig'], ['sh.out', 'pluck.pitch'],
        ['pluck.out', 'att.in2'], ['att.out2', 'reverb.in'], ['reverb.out', 'out.mix'],
        ['breaks.mix', 'scope.a'], ['vca1.out', 'scope.b']],
    },
    breaks: {
      name: 'Breakbeat',
      values: {
        clock: { bpm: 128 },
        breaks: { ...grid('1000000100100000', '0000100002001020', '1212121212121212'), ratchet: 0.04, kick: 64, snare: 0.45, hat: 0.045, lvl: 0.8 },
        reverb: { size: 1.1, damp: 0.4, mix: 0.6 },
        seq: seqVals([0, 0, 0, 10, 0, 0, 7, 0], '10010010'),
        vco1: { oct: -2 }, mix: { l1: 0.8, l2: 0.6 }, vcf1: { freq: 500, res: 0.25, cv1: 1.5 }, adsr1: { a: 0.003, d: 0.3, s: 0.3, r: 0.15 },
        out: { vol: 0.6 }, scope: { time: 1200 },
      },
      cables: [['clock.x4', 'breaks.clk'], ['clock.d4', 'breaks.rst'], ['breaks.mix', 'out.mix'], ['breaks.s', 'reverb.in'], ['reverb.out', 'out.mix'],
        ['clock.x4', 'seq.clk'], ['clock.d2', 'seq.rst'], ['seq.pitch', 'vco1.pitch'], ['vco1.tri', 'mix.in1'], ['vco1.sub', 'mix.in2'], ['mix.out', 'vcf1.in'],
        ['seq.gate', 'adsr1.gate'], ['adsr1.env', 'vcf1.cv1'], ['adsr1.env', 'vca1.cv'], ['vcf1.out', 'vca1.in'], ['vca1.out', 'out.mix'],
        ['breaks.mix', 'scope.a'], ['vca1.out', 'scope.b']],
    },
    cloches: {
      name: 'Cloches et bruit',
      values: {
        clock: { bpm: 92 }, seq: seqVals([0, 7, 12, 5, 3, 10, 7, 14], '10110110'),
        vco2: { oct: 1, tune: 7, fine: 3 }, adsr1: { a: 0.001, d: 1.4, s: 0, r: 1.4 }, adsr2: { a: 0.001, d: 0.05, s: 0, r: 0.04 },
        vcf2: { freq: 7500, res: 0.3, mode: 2 }, vca2: { cv: 0.5 },
        delay: { time: 0.49, fb: 0.35, mix: 0.25 }, reverb: { size: 6, damp: 0.4, mix: 0.45 }, out: { vol: 0.55 }, scope: { time: 700 },
      },
      cables: [['clock.x2', 'seq.clk'], ['seq.pitch', 'vco1.pitch'], ['seq.pitch', 'vco2.pitch'], ['vco1.sin', 'ring.a'], ['vco2.sin', 'ring.b'],
        ['ring.out', 'vca1.in'], ['seq.gate', 'adsr1.gate'], ['adsr1.env', 'vca1.cv'], ['vca1.out', 'delay.in'], ['delay.out', 'reverb.in'],
        ['reverb.out', 'out.mix'], ['clock.x4', 'adsr2.gate'], ['adsr2.env', 'vca2.cv'], ['noise.white', 'vcf2.in'], ['vcf2.out', 'vca2.in'],
        ['vca2.out', 'out.mix'], ['vca1.out', 'scope.a'], ['vca2.out', 'scope.b']],
    },
  };

  /* ==========================================================================
     Rack UI
     ========================================================================== */
  const rack = document.getElementById('rack'), svg = document.getElementById('cables');
  if (!rack || !svg) return;
  const statusEl = document.getElementById('synth-status');
  const mods = [], byId = {}, jackEls = {};
  const state = { values: {}, cables: [] };
  let colorIx = 0;

  const h = (tag, attrs = {}, html = '') => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (html) el.innerHTML = html;
    return el;
  };
  const say = (msg) => { if (statusEl) statusEl.textContent = msg; };

  const toN = (c, v) => (c.log ? log(v / c.lo) / log(c.hi / c.lo) : (v - c.lo) / (c.hi - c.lo));
  const fromN = (c, n) => {
    let v = c.log ? c.lo * pow(c.hi / c.lo, n) : c.lo + n * (c.hi - c.lo);
    if (c.step) v = round(v / c.step) * c.step;
    return clamp(v, c.lo, c.hi);
  };
  const pt = (a, r) => [24 + r * sin((a * PI) / 180), 24 - r * cos((a * PI) / 180)];
  const arc = (a0, a1, r = 21) => {
    const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };

  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE, JSON.stringify({ values: state.values, cables: state.cables.map(({ from, to, color }) => ({ from, to, color })) })); } catch (e) { /* storage unavailable */ }
    }, 300);
  }

  function setValue(m, id, v) {
    m.values[id] = v;
    if (m.ui[id]) m.ui[id](v);
    if (m.audio) m.audio.set(id, v);
    if (m.redraw) m.redraw();
    save();
  }

  function makeKnob(m, c) {
    const el = h('div', { class: `knob knob--${c.size}`, role: 'slider', tabindex: '0', 'aria-label': `${m.title} · ${c.label}`, 'aria-valuemin': c.lo, 'aria-valuemax': c.hi });
    el.innerHTML = `<span class="knob__val"></span><svg viewBox="0 0 48 48" aria-hidden="true"><path class="knob__track" d="${arc(-135, 135)}"/><path class="knob__fill"/><circle class="knob__cap" cx="24" cy="24" r="14.5"/><line class="knob__ptr" x1="24" y1="24" x2="24" y2="11.5"/></svg><span class="knob__label">${c.label}</span>`;
    const fill = el.querySelector('.knob__fill'), ptr = el.querySelector('.knob__ptr'), val = el.querySelector('.knob__val');
    const zero = c.lo < 0 && c.hi > 0 ? toN(c, 0) : 0;
    let n = 0, start = null;
    m.ui[c.id] = (v) => {
      n = toN(c, v);
      const a = -135 + 270 * n, a0 = -135 + 270 * zero, txt = c.fmt(v);
      ptr.setAttribute('transform', `rotate(${a.toFixed(1)} 24 24)`);
      fill.setAttribute('d', abs(a - a0) < 1 ? '' : arc(min(a0, a), max(a0, a)));
      val.textContent = txt;
      el.setAttribute('aria-valuenow', v); el.setAttribute('aria-valuetext', txt);
    };
    const set = (nn) => { const v = fromN(c, clamp(nn, 0, 1)); if (v !== m.values[c.id]) setValue(m, c.id, v); };
    const stepN = c.step && !c.log ? c.step / (c.hi - c.lo) : 0;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, n };
      el.classList.add('is-turning');
      el.focus({ preventScroll: true });
    });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      set(start.n + (start.y - e.clientY + (e.clientX - start.x) * 0.5) * (e.shiftKey ? 0.0012 : 0.0055));
    });
    const end = () => { start = null; el.classList.remove('is-turning'); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('dblclick', () => setValue(m, c.id, c.def));
    el.addEventListener('keydown', (e) => {
      const s = stepN || (e.shiftKey ? 0.1 : 0.02);
      const d = { ArrowUp: s, ArrowRight: s, ArrowDown: -s, ArrowLeft: -s, PageUp: 0.1, PageDown: -0.1 }[e.key];
      if (d !== undefined) { e.preventDefault(); set(n + d); }
      else if (e.key === 'Home') { e.preventDefault(); set(0); }
      else if (e.key === 'End') { e.preventDefault(); set(1); }
    });
    return el;
  }

  function makeSwitch(m, c) {
    const b = h('button', { class: 'sw', type: 'button' }, `<span class="sw__val"></span><span class="sw__label">${c.label}</span>`);
    const v = b.querySelector('.sw__val');
    m.ui[c.id] = (x) => { v.textContent = c.opts[x]; b.setAttribute('aria-label', `${m.title} · ${c.label} : ${c.opts[x]}`); };
    b.addEventListener('click', () => setValue(m, c.id, (m.values[c.id] + 1) % c.opts.length));
    return b;
  }

  function makeJack(m, j, dir) {
    const key = `${m.id}.${j.id}`;
    const b = h('button', { class: `jack jack--${dir}`, type: 'button', 'data-jack': key, 'data-dir': dir, 'aria-label': `${m.title} · ${dir === 'in' ? 'entrée' : 'sortie'} ${j.label}` },
      `<span class="jack__hole"></span><span class="jack__label">${j.label}</span>`);
    jackEls[key] = b;
    return b;
  }

  function render(m) {
    const d = m.def;
    const el = h('section', { class: `mod mod--${m.type}${d.hp <= 3 ? ' mod--narrow' : d.hp === 4 ? ' mod--slim' : ''}`, style: `--w:${d.hp};--cat:${CAT[d.cat]}`, 'aria-label': `${d.name} (${m.title})` });
    el.append(h('header', { class: 'mod__head' }, `<span class="mod__tag">${m.title}</span><h3 class="mod__name">${d.name}</h3>`));
    const body = h('div', { class: 'mod__body' });
    const ctrl = (c) => (c.sw ? makeSwitch(m, c) : makeKnob(m, c));

    if (d.custom === 'seq') renderSeq(m, body, ctrl);
    else if (d.custom === 'keys') renderKeys(m, body, ctrl);
    else if (d.custom === 'breaks') renderBreaks(m, body, ctrl);
    else {
      if (d.custom === 'scope') { m.canvas = h('canvas', { class: 'scope', role: 'img', 'aria-label': 'Écran de l’oscilloscope' }); body.append(m.canvas); }
      if (d.custom === 'chaos') renderChaos(m, body);
      if (d.custom === 'euclid') renderEuclid(m, body);
      if (d.custom === 'out') body.append(h('button', { class: 'power power--small', type: 'button', 'data-power': '', 'aria-pressed': 'false' }, 'Allumer'));
      if (d.controls.length) { const box = h('div', { class: 'ctrls' }); d.controls.forEach((c) => box.append(ctrl(c))); body.append(box); }
    }
    if (d.custom === 'clock') body.append(h('div', { class: 'leds' }, '<span class="led" data-led="beat"></span><span class="leds__label">Noire</span>'));
    if (d.custom === 'out') {
      m.vu = h('div', { class: 'vu', 'aria-hidden': 'true' }, '<i></i>'.repeat(10));
      body.append(m.vu, h('button', { class: 'rec', type: 'button', 'data-action': 'rec', 'aria-pressed': 'false' }, 'Enregistrer'));
    }
    if (d.custom === 'adsr') {
      const t = h('button', { class: 'hold', type: 'button', 'aria-label': `${m.title} · déclencher à la main` }, 'Tester');
      const on = (e) => { e.preventDefault(); t.setPointerCapture?.(e.pointerId); powerOn().then(() => m.hold && m.hold(true)); };
      const off = () => m.hold && m.hold(false);
      t.addEventListener('pointerdown', on); t.addEventListener('pointerup', off); t.addEventListener('pointercancel', off);
      body.append(t);
    }
    if (d.note) body.append(h('p', { class: 'mod__note' }, d.note));
    el.append(body);

    const jacks = h('div', { class: 'mod__jacks' });
    if (d.ins.length) { const g = h('div', { class: 'jacks jacks--in' }); d.ins.forEach((j) => g.append(makeJack(m, j, 'in'))); jacks.append(g); }
    if (d.outs.length) { const g = h('div', { class: 'jacks jacks--out' }); d.outs.forEach((j) => g.append(makeJack(m, j, 'out'))); jacks.append(g); }
    el.append(jacks);

    m.flash = (name) => {
      const l = el.querySelector(`[data-led="${name}"]`);
      if (!l) return;
      l.classList.add('on'); clearTimeout(l._t); l._t = setTimeout(() => l.classList.remove('on'), 90);
    };
    m.el = el;
    return el;
  }

  function renderSeq(m, body, ctrl) {
    const grid = h('div', { class: 'seq' }), leds = [];
    for (let i = 0; i < 8; i++) {
      const col = h('div', { class: 'seq__col' }), led = h('span', { class: 'led' });
      const g = h('button', { class: 'step-gate', type: 'button' });
      const gid = 'g' + i;
      m.ui[gid] = (x) => { g.setAttribute('aria-pressed', x ? 'false' : 'true'); g.setAttribute('aria-label', `Pas ${i + 1} ${x ? 'muet' : 'actif'}`); };
      g.addEventListener('click', () => setValue(m, gid, m.values[gid] ? 0 : 1));
      leds.push(led);
      col.append(led, ctrl(m.def.controls[i]), g);
      grid.append(col);
    }
    body.append(grid);
    const row = h('div', { class: 'ctrls' });
    row.append(ctrl(m.def.controls[16]));
    body.append(row);
    m.step = (s) => leds.forEach((l, i) => l.classList.toggle('on', i === s));
  }

  // the break grid: click a cell to cycle empty, hit, ghost note. The playhead runs along the
  // columns, and a chopped step lights up the column it was taken from.
  function renderBreaks(m, body, ctrl) {
    const g = h('div', { class: 'brk', role: 'group', 'aria-label': 'Motif de batterie, 16 pas' }), cells = [];
    for (const [lane, name, full] of [['k', 'GC', 'Grosse caisse'], ['s', 'CC', 'Caisse claire'], ['h', 'CH', 'Charley']]) {
      g.append(h('span', { class: 'brk__lane', title: full }, name));
      for (let i = 0; i < 16; i++) {
        const id = lane + i, b = h('button', { class: 'brk__cell' + (i % 4 === 0 ? ' is-beat' : ''), type: 'button', 'data-col': i });
        m.ui[id] = (v) => { b.dataset.v = v; b.setAttribute('aria-label', `${full}, pas ${i + 1} : ${['vide', 'frappe', 'note fantôme'][v]}`); };
        b.addEventListener('click', () => setValue(m, id, (m.values[id] + 1) % 3));
        cells.push(b); g.append(b);
      }
    }
    body.append(g);
    const box = h('div', { class: 'ctrls' });
    m.def.controls.filter((c) => !c.sw).forEach((c) => box.append(ctrl(c)));
    body.append(box);
    m.step = ([st, src]) => cells.forEach((b) => { const c = +b.dataset.col; b.classList.toggle('is-now', c === st); b.classList.toggle('is-chop', c === src && src !== st); });
  }

  // the euclidean ring: every step a dot, the pulses inked in, the playhead in red
  function renderEuclid(m, body) {
    const ring = document.createElementNS(SVGNS, 'svg');
    ring.setAttribute('viewBox', '0 0 100 100'); ring.setAttribute('class', 'euclid'); ring.setAttribute('aria-hidden', 'true');
    body.append(ring);
    let cur = -1;
    m.redraw = () => {
      const { n, k, rot } = m.values;
      let s = '<circle cx="50" cy="50" r="38" class="euclid__track"/>';
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * PI - PI / 2, j = (((i - rot) % n) + n) % n, hit = k > 0 && (j * min(k, n)) % n < min(k, n);
        s += `<circle cx="${(50 + cos(a) * 38).toFixed(1)}" cy="${(50 + sin(a) * 38).toFixed(1)}" r="${hit ? 6.5 : 4}" class="euclid__dot${hit ? ' is-hit' : ''}${i === cur ? ' is-cur' : ''}"/>`;
      }
      s += `<text x="50" y="55" class="euclid__txt">${min(k, n)}/${n}</text>`;
      ring.innerHTML = s;
    };
    m.ring = (i) => { cur = i; m.redraw(); };
  }

  // a trace of the attractor, drawn from the state the worklet sends back
  function renderChaos(m, body) {
    const cv = h('canvas', { class: 'chaos', role: 'img', 'aria-label': 'Trajectoire de l’attracteur de Lorenz' });
    body.append(cv);
    const pts = [];
    m.trail = (p) => { pts.push(p); if (pts.length > 260) pts.shift(); };
    m.drawTrail = () => {
      const g = cv.getContext('2d'), dpr = min(1.5, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
      if (!W || !H) return;
      if (cv.width !== round(W * dpr)) { cv.width = round(W * dpr); cv.height = round(H * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#f7f4ec'; g.fillRect(0, 0, W, H);
      const rho = m.values.rho, X = (x) => W / 2 + (x / 24) * W * 0.46, Y = (z) => H - 6 - (z / (rho * 1.7)) * (H - 12);
      for (let i = 1; i < pts.length; i++) {
        g.strokeStyle = `rgba(193,71,59,${(i / pts.length).toFixed(2)})`; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(X(pts[i - 1][0]), Y(pts[i - 1][1])); g.lineTo(X(pts[i][0]), Y(pts[i][1])); g.stroke();
      }
      const l = pts[pts.length - 1];
      if (l) { g.fillStyle = '#161616'; g.beginPath(); g.arc(X(l[0]), Y(l[1]), 3, 0, 2 * PI); g.fill(); }
    };
  }

  /* ---------- keyboard: on-screen, computer keys, MIDI ---------- */
  const KEYMAP = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16 };
  const AZERTY = { KeyA: 'Q', KeyW: 'Z', KeyS: 'S', KeyE: 'E', KeyD: 'D', KeyF: 'F', KeyT: 'T', KeyG: 'G', KeyY: 'Y', KeyH: 'H', KeyU: 'U', KeyJ: 'J', KeyK: 'K', KeyO: 'O', KeyL: 'L', KeyP: 'P', Semicolon: 'M' };
  const keyEls = [], held = [];
  let octave = 0;

  function renderKeys(m, body, ctrl) {
    const kbd = h('div', { class: 'kbd', role: 'group', 'aria-label': 'Clavier à l’écran' });
    const whites = [];
    for (let s = 0; s <= 24; s++) {
      const black = [1, 3, 6, 8, 10].includes(s % 12);
      const k = h('span', { class: black ? 'kbd__b' : 'kbd__w', 'data-n': s }, black ? '' : '<b class="kbd__lbl"></b>');
      if (black) k.style.left = `${(whites.length / 15) * 100}%`;
      else whites.push(k);
      keyEls[s] = k;
      kbd.append(k);
    }
    const codeOf = Object.fromEntries(Object.entries(KEYMAP).map(([c, i]) => [i, c]));
    const label = (map) => keyEls.forEach((k, i) => { const l = k.querySelector('.kbd__lbl'), c = codeOf[i]; if (l) l.textContent = c ? map(c) || '' : ''; });
    label((c) => AZERTY[c]);
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then((lm) => label((c) => (lm.get(c) || '').toUpperCase())).catch(() => {});

    let cur = null;
    const at = (e) => { const t = document.elementFromPoint(e.clientX, e.clientY); const k = t && t.closest('[data-n]'); return k && kbd.contains(k) ? +k.dataset.n : null; };
    kbd.addEventListener('pointerdown', (e) => {
      const n = at(e); if (n === null) return;
      e.preventDefault(); kbd.setPointerCapture(e.pointerId);
      cur = n; noteOn(n + octave * 12);
    });
    kbd.addEventListener('pointermove', (e) => {
      if (cur === null) return;
      const n = at(e);
      if (n !== null && n !== cur) { noteOff(cur + octave * 12); cur = n; noteOn(n + octave * 12); }
    });
    const up = () => { if (cur !== null) noteOff(cur + octave * 12); cur = null; };
    kbd.addEventListener('pointerup', up); kbd.addEventListener('pointercancel', up);
    body.append(kbd);

    const bar = h('div', { class: 'kbd__bar' });
    const octEl = h('span', { class: 'kbd__oct' });
    const showOct = () => { octEl.textContent = 'Oct. ' + (octave > 0 ? '+' : '') + octave; };
    const down = h('button', { class: 'sw__val kbd__btn', type: 'button', 'aria-label': 'Octave plus grave' }, '−');
    const upB = h('button', { class: 'sw__val kbd__btn', type: 'button', 'aria-label': 'Octave plus aiguë' }, '+');
    down.addEventListener('click', () => { octave = max(-3, octave - 1); showOct(); });
    upB.addEventListener('click', () => { octave = min(3, octave + 1); showOct(); });
    const midi = h('button', { class: 'sw__val kbd__btn kbd__midi', type: 'button' }, 'MIDI');
    midi.addEventListener('click', connectMidi);
    showOct();
    bar.append(down, octEl, upB, midi, ctrl(m.def.controls[0]));
    body.append(bar);
    body.append(h('p', { class: 'mod__note' }, 'Ou votre clavier : la rangée du milieu joue les touches blanches.'));
  }

  function applyNote(n, retrig) {
    const k = byId.keys;
    if (!k.kbd || !AC) return;
    const t = AC.currentTime, p = k.kbd.p, g = k.kbd.g, gl = k.values.glide;
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t);
    if (gl > 0.002) p.setTargetAtTime(n / 12, t, gl / 3); else p.setValueAtTime(n / 12, t);
    if (retrig) { g.cancelScheduledValues(t); g.setValueAtTime(0, t); g.setValueAtTime(1, t + 0.004); }
  }
  function lightKeys() { keyEls.forEach((k, i) => k.classList.toggle('on', held.includes(i + octave * 12))); }
  function noteOn(n) {
    if (held.includes(n)) return;
    held.push(n); lightKeys();
    powerOn().then(() => { if (held[held.length - 1] === n) applyNote(n, true); });
  }
  function noteOff(n) {
    const i = held.indexOf(n);
    if (i < 0) return;
    held.splice(i, 1); lightKeys();
    if (!AC || !byId.keys.kbd) return;
    if (held.length) applyNote(held[held.length - 1], false);
    else { const g = byId.keys.kbd.g; g.cancelScheduledValues(AC.currentTime); g.setValueAtTime(0, AC.currentTime); }
  }
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || !(e.code in KEYMAP)) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    noteOn(KEYMAP[e.code] + octave * 12);
  });
  window.addEventListener('keyup', (e) => { if (e.code in KEYMAP) noteOff(KEYMAP[e.code] + octave * 12); });
  window.addEventListener('blur', () => [...held].forEach(noteOff));

  function connectMidi() {
    const btn = document.querySelector('.kbd__midi');
    if (!navigator.requestMIDIAccess) { say('MIDI n’est pas disponible dans ce navigateur.'); return; }
    navigator.requestMIDIAccess().then((acc) => {
      const bind = () => {
        let count = 0;
        acc.inputs.forEach((inp) => {
          count++;
          inp.onmidimessage = (e) => {
            const [st, note, vel] = e.data, cmd = st & 0xf0;
            if (cmd === 0x90 && vel > 0) noteOn(note - 60);
            else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) noteOff(note - 60);
          };
        });
        btn.classList.toggle('is-on', count > 0);
        say(count ? `MIDI : ${count} entrée${count > 1 ? 's' : ''} branchée${count > 1 ? 's' : ''}.` : 'MIDI : aucun instrument détecté.');
      };
      bind(); acc.onstatechange = bind;
    }).catch(() => say('Accès MIDI refusé.'));
  }

  /* ---------- cables: real connections, drawn as swinging rubber with a pulse of their signal ---------- */
  function port(key, dir) {
    const [mid, pid] = key.split('.'), m = byId[mid];
    return m && m.audio ? (dir === 'out' ? m.audio.outs[pid] : m.audio.ins[pid]) : null;
  }
  function wire(c, on) {
    const s = port(c.from, 'out'), d = port(c.to, 'in');
    if (!s || !d) return;
    const target = d.param || d.node, args = d.param ? [s.idx || 0] : [s.idx || 0, d.idx || 0];
    try { if (on) s.node.connect(target, ...args); else s.node.disconnect(target, ...args); } catch (e) { /* already (dis)connected */ }
    if (on) {
      if (!c.meter) { c.meter = AC.createAnalyser(); c.meter.fftSize = 256; c.meter.connect(SINK); }
      try { s.node.connect(c.meter, s.idx || 0); } catch (e) { /* ignore */ }
    } else if (c.meter) {
      try { s.node.disconnect(c.meter, s.idx || 0); } catch (e) { /* ignore */ }
    }
  }

  const center = (key) => {
    const r = jackEls[key].firstChild.getBoundingClientRect(), R = rack.getBoundingClientRect();
    return [r.left + r.width / 2 - R.left, r.top + r.height / 2 - R.top];
  };
  const cablePath = (a, b, k = 1) => {
    const dx = b[0] - a[0], sag = min(170, 26 + hypot(dx, b[1] - a[1]) * 0.28) * k;
    return `M${a[0].toFixed(1)} ${a[1].toFixed(1)}C${(a[0] + dx * 0.15).toFixed(1)} ${(a[1] + sag).toFixed(1)} ${(b[0] - dx * 0.15).toFixed(1)} ${(b[1] + sag).toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  };
  function cableEls(col) {
    const g = document.createElementNS(SVGNS, 'g');
    g.innerHTML = `<path class="cable__shadow"/><path class="cable__body" stroke="${col}"/><path class="cable__shine"/><path class="cable__pulse"/>`
      + `<circle class="plug" r="7" fill="${col}"/><circle class="plug__pin" r="2.4"/><circle class="plug" r="7" fill="${col}"/><circle class="plug__pin" r="2.4"/>`;
    svg.append(g);
    return { g, paths: [...g.querySelectorAll('path')], plugs: [...g.querySelectorAll('circle')] };
  }
  function shape(c, now) {
    const age = (now - c.born) / 1000, k = 1 + (age < 2.2 ? 0.45 * exp(-age * 2.8) * sin(age * 11) : 0);
    const d = cablePath(c.a, c.b, k);
    c.el.paths.forEach((p) => p.setAttribute('d', d));
    [c.a, c.a, c.b, c.b].forEach(([x, y], i) => { c.el.plugs[i].setAttribute('cx', x.toFixed(1)); c.el.plugs[i].setAttribute('cy', y.toFixed(1)); });
  }
  function layoutCables() {
    const now = performance.now();
    for (const c of state.cables) { c.a = center(c.from); c.b = center(c.to); shape(c, now); }
    if (drag) { drag.a = center(drag.fixed); drawDrag(); }
  }

  function addCable(from, to, color) {
    if (!jackEls[from] || !jackEls[to] || state.cables.some((c) => c.from === from && c.to === to)) return;
    const c = { from, to, color: color || CABLE_COLORS[colorIx++ % CABLE_COLORS.length], born: performance.now(), lvl: 0, off: 0 };
    c.el = cableEls(c.color);
    c.a = center(from); c.b = center(to); shape(c, c.born);
    state.cables.push(c);
    if (AC) wire(c, true);
    patched(); save();
  }
  function removeCable(c) {
    const i = state.cables.indexOf(c);
    if (i < 0) return;
    state.cables.splice(i, 1);
    if (AC) wire(c, false);
    c.el.g.remove();
    patched(); save();
  }
  function patched() {
    const used = new Set(state.cables.flatMap((c) => [c.from, c.to]));
    for (const [k, el] of Object.entries(jackEls)) el.classList.toggle('is-patched', used.has(k));
  }

  let drag = null, dragEl = null;
  function drawDrag() {
    if (!dragEl) return;
    const d = cablePath(drag.a, [drag.x, drag.y], 0.7);
    dragEl.paths.forEach((p) => p.setAttribute('d', d));
    [drag.a, drag.a, [drag.x, drag.y], [drag.x, drag.y]].forEach(([x, y], i) => { dragEl.plugs[i].setAttribute('cx', x); dragEl.plugs[i].setAttribute('cy', y); });
  }
  rack.addEventListener('pointerdown', (e) => {
    const j = e.target.closest('.jack');
    if (!j || e.button !== 0) return;
    e.preventDefault();
    const key = j.dataset.jack;
    let fixed = key, fdir = j.dataset.dir, color = null;
    if (fdir === 'in') {
      // pick up the last cable plugged here and carry it from its other end
      const c = [...state.cables].reverse().find((x) => x.to === key);
      if (c) { removeCable(c); fixed = c.from; fdir = 'out'; color = c.color; }
    }
    const R = rack.getBoundingClientRect();
    drag = { fixed, fdir, color: color || CABLE_COLORS[colorIx++ % CABLE_COLORS.length], pid: e.pointerId, x: e.clientX - R.left, y: e.clientY - R.top, a: center(fixed) };
    dragEl = cableEls(drag.color);
    dragEl.g.classList.add('is-drag');
    rack.setPointerCapture(e.pointerId);
    rack.dataset.drag = fdir;
    drawDrag();
  });
  rack.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const R = rack.getBoundingClientRect();
    drag.x = e.clientX - R.left; drag.y = e.clientY - R.top;
    drawDrag();
  });
  const drop = (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const hit = e.type === 'pointerup' && document.elementFromPoint(e.clientX, e.clientY);
    const t = hit && hit.closest('.jack');
    if (t && t.dataset.dir !== drag.fdir) {
      if (drag.fdir === 'out') addCable(drag.fixed, t.dataset.jack, drag.color);
      else addCable(t.dataset.jack, drag.fixed, drag.color);
    }
    dragEl.g.remove(); dragEl = null; drag = null;
    delete rack.dataset.drag;
  };
  rack.addEventListener('pointerup', drop);
  rack.addEventListener('pointercancel', drop);
  rack.addEventListener('dblclick', (e) => {
    const j = e.target.closest('.jack');
    if (j) state.cables.filter((c) => c.from === j.dataset.jack || c.to === j.dataset.jack).forEach(removeCable);
  });

  /* ---------- power ---------- */
  let powering = null;
  function setPowerUi(on) {
    live.on = on;
    document.querySelectorAll('[data-power]').forEach((b) => { b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.textContent = on ? 'Éteindre' : 'Allumer'; });
    rack.classList.toggle('is-on', on);
    document.body.classList.toggle('synth-on', on);
  }
  function powerOn() {
    if (AC && AC.state === 'running') return Promise.resolve();
    if (AC && !powering) return AC.resume().then(() => setPowerUi(true));
    if (powering) return powering;
    powering = (async () => {
      AC = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      try { await AC.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }))); }
      catch (e) { await AC.audioWorklet.addModule('data:text/javascript;charset=utf-8,' + encodeURIComponent(WORKLET)); }
      SINK = gain(0); SINK.connect(AC.destination);
      for (const m of mods) {
        m.audio = m.def.build(m);
        for (const c of m.def.controls) m.audio.set(c.id, m.values[c.id]);
        // everything feeds a silent sink so that unpatched clocks and scopes keep running
        for (const o of Object.values(m.audio.outs)) o.node.connect(SINK, o.idx || 0);
        (m.audio.extra || []).forEach((n) => n.connect(SINK));
      }
      state.cables.forEach((c) => wire(c, true));
      if (AC.state !== 'running') await AC.resume();
      setPowerUi(true);
      say('');
    })().catch((err) => {
      console.error(err);
      AC = null;
      say('Le son ne démarre pas dans ce navigateur.');
    }).finally(() => { powering = null; });
    return powering;
  }
  function powerOff() { if (AC) AC.suspend(); setPowerUi(false); if (recorder) recorder.stop(); }

  /* ---------- recording the output ---------- */
  let recorder = null;
  function toggleRec(btn) {
    if (recorder) { recorder.stop(); return; }
    powerOn().then(() => {
      const m = byId.out;
      if (!m.stream || !window.MediaRecorder) { say('L’enregistrement n’est pas disponible dans ce navigateur.'); return; }
      const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const chunks = [], started = Date.now();
      recorder = new MediaRecorder(m.stream, type ? { mimeType: type } : undefined);
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), ext = /mp4/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm';
        const a = h('a', { href: URL.createObjectURL(blob), download: `synthe-oc-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}` });
        document.body.append(a); a.click(); a.remove();
        say(`Enregistrement de ${round((Date.now() - started) / 1000)} s téléchargé.`);
        recorder = null;
        document.querySelectorAll('[data-action="rec"]').forEach((b) => { b.setAttribute('aria-pressed', 'false'); b.textContent = 'Enregistrer'; });
      };
      recorder.start();
      document.querySelectorAll('[data-action="rec"]').forEach((b) => { b.setAttribute('aria-pressed', 'true'); b.textContent = 'Arrêter'; });
      say('Enregistrement en cours…');
    });
  }

  /* ---------- scope, meter, cable pulses ---------- */
  const bufA = new Float32Array(4096), bufB = new Float32Array(4096), bufO = new Float32Array(2048), bufM = new Float32Array(256), spec = new Uint8Array(1024);
  const EDGES = [40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20000];
  function drawScope() {
    const m = byId.scope, cv = m.canvas, g = cv.getContext('2d');
    const dpr = min(1.5, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== round(W * dpr)) { cv.width = round(W * dpr); cv.height = round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#f7f4ec'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(22,22,22,.13)'; g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < 8; i++) { g.moveTo((W * i) / 8, 0); g.lineTo((W * i) / 8, H); }
    for (let i = 1; i < 6; i++) { g.moveTo(0, (H * i) / 6); g.lineTo(W, (H * i) / 6); }
    g.stroke();
    g.strokeStyle = 'rgba(22,22,22,.4)'; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    if (!m.an) return;
    const N = round(m.values.time), z = m.values.zoom;
    m.an[0].getFloatTimeDomainData(bufA); m.an[1].getFloatTimeDomainData(bufB);
    let t0 = 0;
    for (let i = 1; i < 4096 - N; i++) if (bufA[i - 1] < 0 && bufA[i] >= 0) { t0 = i; break; }
    const trace = (buf, col, key) => {
      if (!jackEls[key].classList.contains('is-patched')) return;
      g.strokeStyle = col; g.lineWidth = 2.2; g.lineJoin = 'round';
      g.beginPath();
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * W, y = H / 2 - clamp(buf[t0 + i] * z, -1.2, 1.2) * H * 0.4;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    };
    trace(bufB, '#3456a0', 'scope.b');
    trace(bufA, '#c1473b', 'scope.a');
  }
  function listen() {
    const m = byId.out;
    if (!m.an) return;
    m.an.getFloatTimeDomainData(bufO);
    let pk = 0, sq = 0;
    for (let i = 0; i < bufO.length; i++) { const v = bufO[i]; pk = max(pk, abs(v)); sq += v * v; }
    const lit = Math.ceil(clamp(pk, 0, 1) * 10);
    [...m.vu.children].forEach((l, i) => l.classList.toggle('on', i < lit));
    live.level = live.level * 0.7 + clamp(sqrt(sq / bufO.length) * 3.2, 0, 1) * 0.3;
    m.an.getByteFrequencyData(spec);
    const bin = AC.sampleRate / 2048;
    for (let b = 0; b < 9; b++) {
      const i0 = max(1, floor(EDGES[b] / bin)), i1 = max(i0 + 1, min(1023, floor(EDGES[b + 1] / bin)));
      let s = 0;
      for (let i = i0; i < i1; i++) s += spec[i];
      live.bands[b] = clamp((s / (i1 - i0) / 255 - 0.15) / 0.7, 0, 1);
    }
  }
  function pulses() {
    for (const c of state.cables) {
      if (!c.meter) continue;
      c.meter.getFloatTimeDomainData(bufM);
      let pk = 0;
      for (let i = 0; i < 256; i += 2) pk = max(pk, abs(bufM[i]));
      c.lvl = max(min(1, pk), c.lvl * 0.86);
      c.off -= 2.4 + c.lvl * 7;
      const p = c.el.paths[3];
      p.style.opacity = (0.1 + c.lvl * 0.9).toFixed(2);
      p.style.strokeDashoffset = c.off.toFixed(1);
      c.el.paths[1].style.strokeWidth = (4.6 + c.lvl * 1.8).toFixed(2);
    }
  }
  // meters, scope and cable pulses refresh at ~30 fps, and only while the rack is on screen;
  // the listening print keeps its level and spectrum either way
  let rackSeen = true, lastUi = 0;
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { rackSeen = es[0].isIntersecting; }, { rootMargin: '100px' }).observe(rack);
  function frame(now) {
    for (const c of state.cables) if (now - c.born < 2300) shape(c, now);
    if (AC && AC.state === 'running') {
      if (now - lastUi > 32) {
        lastUi = now;
        listen();
        if (rackSeen) { drawScope(); pulses(); if (byId.chaos.drawTrail) byId.chaos.drawTrail(); }
      }
    } else live.level *= 0.9;
    requestAnimationFrame(frame);
  }

  /* ---------- patches: presets, storage, links, mutation ---------- */
  function loadPatch(p) {
    [...state.cables].forEach(removeCable);
    for (const m of mods) for (const c of m.def.controls) {
      const v = p.values && p.values[m.id] && p.values[m.id][c.id];
      setValue(m, c.id, Number.isFinite(v) ? clamp(v, c.sw ? 0 : c.lo, c.sw ? c.opts.length - 1 : c.hi) : c.def);
    }
    colorIx = 0;
    (p.cables || []).forEach((c) => (Array.isArray(c) ? addCable(c[0], c[1], c[2]) : addCable(c.from, c.to, c.color)));
  }
  function markPreset(key) { document.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.preset === key ? 'true' : 'false')); }

  // a patch fits in the address bar: only the knobs away from their default, and the cables
  function patchToHash() {
    const v = {};
    for (const m of mods) for (const c of m.def.controls) if (m.values[c.id] !== c.def) (v[m.id] = v[m.id] || {})[c.id] = +m.values[c.id].toFixed(4);
    const json = JSON.stringify({ v, c: state.cables.map((c) => [c.from, c.to]) });
    return '#patch=' + btoa(unescape(encodeURIComponent(json))).replace(/=+$/, '');
  }
  function hashToPatch() {
    const m = location.hash.match(/^#patch=([A-Za-z0-9+/]+)/);
    if (!m) return null;
    try { const d = JSON.parse(decodeURIComponent(escape(atob(m[1])))); return { values: d.v || {}, cables: d.c || [] }; } catch (e) { return null; }
  }

  function mutate() {
    for (const m of mods) {
      if (m.type === 'out') continue;
      for (const c of m.def.controls) {
        if (c.sw || c.fixed || Math.random() < 0.45) continue;
        setValue(m, c.id, fromN(c, clamp(toN(c, m.values[c.id]) + (Math.random() - 0.5) * 0.28, 0, 1)));
      }
    }
    markPreset(null);
    say('Mutation : les réglages ont dérivé.');
  }

  document.addEventListener('click', (e) => {
    const pw = e.target.closest('[data-power]');
    if (pw) { if (pw.getAttribute('aria-pressed') === 'true') powerOff(); else powerOn(); return; }
    const p = e.target.closest('[data-preset]');
    if (p && PRESETS[p.dataset.preset]) {
      loadPatch(PRESETS[p.dataset.preset]); markPreset(p.dataset.preset);
      say(`Patch « ${PRESETS[p.dataset.preset].name} » chargé.`);
      powerOn();
      return;
    }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const act = a.dataset.action;
    if (act === 'clear') { [...state.cables].forEach(removeCable); markPreset(null); say('Tous les câbles sont débranchés.'); }
    else if (act === 'ghost') a.setAttribute('aria-pressed', rack.classList.toggle('is-ghost') ? 'true' : 'false');
    else if (act === 'mutate') mutate();
    else if (act === 'rec') toggleRec(a);
    else if (act === 'share') {
      const url = location.href.split('#')[0] + patchToHash();
      history.replaceState(null, '', url);
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(
        () => say('Lien du patch copié.'),
        () => say('Lien du patch placé dans la barre d’adresse.'),
      );
    }
  });

  /* ---------- build ---------- */
  const counts = {};
  RACK.forEach((r) => { if (r) counts[r[1]] = (counts[r[1]] || 0) + 1; });
  const seen = {};
  for (const r of RACK) {
    if (!r) { rack.append(h('div', { class: 'rack__break', 'aria-hidden': 'true' })); continue; }
    const [id, type] = r, def = DEFS[type];
    seen[type] = (seen[type] || 0) + 1;
    const m = { id, type, def, values: {}, ui: {}, audio: null, title: def.tag + (counts[type] > 1 ? ' ' + seen[type] : '') };
    for (const c of def.controls) m.values[c.id] = c.def;
    state.values[id] = m.values;
    mods.push(m); byId[id] = m;
    rack.append(render(m));
  }
  for (const m of mods) { for (const c of m.def.controls) m.ui[c.id](m.values[c.id]); if (m.redraw) m.redraw(); }

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { saved = null; }
  const linked = hashToPatch();
  if (linked) { loadPatch(linked); say('Patch chargé depuis le lien.'); }
  else if (saved && saved.values && Array.isArray(saved.cables)) { loadPatch(saved); colorIx = saved.cables.length; }
  else { loadPatch(PRESETS.jungle); markPreset('jungle'); }

  if ('ResizeObserver' in window) new ResizeObserver(layoutCables).observe(rack);
  window.addEventListener('resize', layoutCables);
  if (document.fonts) document.fonts.ready.then(layoutCables);
  requestAnimationFrame(frame);

  /* ==========================================================================
     The print that listens: the blue giant in headphones, spectrum tentacles
     ========================================================================== */
  const O = window.OCInk, print = document.querySelector('canvas[data-scene="listener"]');
  if (!O || !print) return;
  const { C } = O;
  let tt = 0, lt = 0, lastBeat = 0;
  const notes = [];
  O.SC.listener = (api) => (t) => {
    const { ink, W, H } = api, on = live.on, lvl = on ? live.level : 0, b = live.bands;
    const dt = clamp(t - lt, 0, 0.2); lt = t; tt += dt * (0.25 + lvl * 5);
    O.field(api, on ? C.RED : C.LILAC);
    ink.dots(140, 3, 0, 0, W, H * 0.7, { c: C.WHITE, r: 1.3, alpha: 0.85 });
    O.streaks(api, tt, on ? 24 : 6, 7, { scale: 1.3 });
    [[62, 70, 26, [C.YEL, C.ORANGE, C.GREEN, C.INK]], [350, 58, 17, [C.GREEN, C.YEL, C.INK]], [346, 190, 12, [C.ORANGE, C.YEL, C.INK]]]
      .forEach(([x, y, r, cols], i) => ink.rings(x, y, r * (1 + (on ? b[i * 2] : 0) * 0.6), cols, { rot: tt * (0.6 + i * 0.3) }));

    // spectrum tentacles rising behind the giant: lows on the left, highs on the right
    for (let i = 0; i < 9; i++) {
      const left = i < 5, k = left ? i : i - 5, x = left ? 12 + k * 22 : W - 12 - (3 - k) * 24, e = on ? b[i] : 0.04;
      const sp = O.spine(x, H + 24, -PI / 2 + (left ? 0.25 : -0.25) + (k - 1.5) * 0.06, 70 + e * 250, (left ? 1 : -1) * (0.5 + e * 1.4), 16, 0.1, t * 1.6, i);
      ink.tube(sp, (u) => 15 * pow(1 - u, 0.8) + 3, { bands: 1, seed: 60 + i, claw: i % 2 === 0, side: left ? 1 : -1 });
    }

    // the giant bobs on the clock's beat
    const beat = on ? exp(-(performance.now() - live.beatAt) / 170) : 0;
    const gx = 212, gy = 214 + beat * 9 + sin(t * 0.7) * 3, hr = 100, rot = -0.08 + (on ? sin(tt * 0.9) * 0.1 : 0.05);
    O.giantBody(ink, gx, gy, hr, rot, gx + 6, gy + hr * 1.13, H);
    const hx = 118, hy = H - 72 + beat * 5, hs = 0.72;
    const arm = [[hx + 110, H + 30], [hx + 88, hy + 36], [hx + 62 * hs, hy + 2]];
    const [fx, fy] = [hx - 6 * hs, hy - 11 * hs];
    const loud = lvl > 0.42;
    O.giantHead(ink, gx, gy, hr, t, [fx, fy - 30], rot, on ? clamp(lvl * 2.2, 0, 1) : false, !on || loud);

    // headphones
    const P = (dx, dy) => [gx + (dx * cos(rot) - dy * sin(rot)) * hr, gy + (dx * sin(rot) + dy * cos(rot)) * hr];
    const band = [];
    for (let k = 0; k <= 18; k++) { const a = PI + 0.12 + (k / 18) * (PI - 0.24); band.push(P(cos(a) * 0.9, sin(a) * 1.1 - 0.02)); }
    ink.draw(band, { w: 12 }); ink.draw(band, { w: 5, c: C.YEL });
    for (const sx of [-1, 1]) {
      const [x, y] = P(sx * 0.88, 0.02);
      ink.ell(x, y, hr * 0.16, hr * 0.3, { fill: C.INK, w: 2, rot });
      ink.rings(x + sx * hr * 0.04, y, hr * (0.19 + (on ? b[1] : 0) * 0.05), [C.YEL, C.ORANGE, C.YEL, C.INK], { rot: tt * sx });
    }

    // arm, hand and the Earthling dancing on it
    O.sleeve(ink, arm, 28, 17, 45);
    O.hand(ink, hx, hy, hs, t);
    O.cuff(ink, arm, 17);
    const dancing = on && lvl > 0.02;
    O.human(ink, fx, fy, 2.9, { step: dancing ? tt * 7 : null, wave: dancing ? tt * 9 : null, suit: C.YEL, trim: C.INK });

    // notes fly off the headphones on each beat
    if (on && lvl > 0.03 && live.beatAt !== lastBeat) {
      lastBeat = live.beatAt;
      const sx = notes.length % 2 ? 1 : -1, [x, y] = P(sx * 1.05, -0.2);
      notes.push({ x, y, vx: sx * (12 + Math.random() * 18), vy: -30 - Math.random() * 25, life: 1, r: Math.random() * 0.6 - 0.3 });
    }
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      n.x += n.vx * dt; n.y += n.vy * dt; n.life -= dt * 0.45;
      if (n.life <= 0) { notes.splice(i, 1); continue; }
      const a = min(1, n.life * 2);
      ink.ell(n.x, n.y, 7, 5, { fill: C.YEL, w: 2, rot: -0.4 + n.r, alpha: a });
      ink.line(n.x + 6, n.y - 1, n.x + 6, n.y - 26, { w: 2.2, alpha: a });
      ink.draw([[n.x + 6, n.y - 26], [n.x + 14, n.y - 20], [n.x + 13, n.y - 12]], { w: 2.2, alpha: a });
    }

    if (!on) O.bubble(ink, 18, 150, ['ALLUMEZ', 'LE SYNTHÉ !'], fx - 4, fy - 48, 22);
    else if (lvl < 0.01) O.bubble(ink, 18, 150, ['BRANCHEZ', 'LA SORTIE !'], fx - 4, fy - 48, 22);
  };
  O.mount(print);
})();
