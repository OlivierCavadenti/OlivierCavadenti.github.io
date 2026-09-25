/* Olivier Cavadenti · planète étrange
   Every drawing is traced in code with a slightly trembling ink line ("line boil"),
   redrawn about ten times a second, like a hand-drawn GIF. */
(() => {
  'use strict';

  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;
  const { sin, cos, min, max, floor, hypot, sqrt } = Math;

  const INK = '#1f2b2e', BLUE = '#3f7fc4', BLUED = '#2a5a94', RED = '#c8472f', OCHRE = '#d6a13e',
    SAGE = '#8fb38a', PINK = '#e3a79c', VIOLET = '#7c6aa8', PAPER = '#f3f4e4', CREAM = '#e9edd6',
    TEAL = '#5fa7a0', STONE = '#c9cdbd';
  const MANA = ['#efe6c4', '#6ea3d8', '#6d5a78', '#d8694c', '#6fae78'];

  /* ---------- ink toolkit ---------- */
  let BOIL = 0;
  const hash = (a, b, c) => { const s = sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - floor(s); };
  const rng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  function ellPts(cx, cy, rx, ry, rot = 0, wob = 0, ws = 0, a0 = 0, a1 = TAU, closedLoop = true) {
    const n = max(12, min(64, ((rx + ry) * 0.35) | 0));
    const cr = cos(rot), sr = sin(rot), pts = [];
    const steps = closedLoop ? n : n + 1;
    for (let i = 0; i < steps; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const k = 1 + wob * sin(a * 3 + ws) + wob * 0.5 * sin(a * 5 - ws * 1.3);
      const ex = cos(a) * rx * k, ey = sin(a) * ry * k;
      pts.push([cx + ex * cr - ey * sr, cy + ex * sr + ey * cr]);
    }
    return pts;
  }

  class Ink {
    constructor(g) { this.g = g; }
    j(x, y) { return [x + (hash(x * 0.37, y * 0.53, BOIL) - 0.5) * 1.7, y + (hash(y * 0.41, x * 0.29, BOIL + 7) - 0.5) * 1.7]; }
    path(pts, closed) {
      const g = this.g, p = pts.map((q) => this.j(q[0], q[1])), n = p.length;
      g.beginPath();
      if (n < 2) return;
      if (closed) {
        g.moveTo((p[n - 1][0] + p[0][0]) / 2, (p[n - 1][1] + p[0][1]) / 2);
        for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
        g.closePath();
      } else {
        g.moveTo(p[0][0], p[0][1]);
        for (let i = 1; i < n - 1; i++) { const a = p[i], b = p[i + 1]; g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
        g.lineTo(p[n - 1][0], p[n - 1][1]);
      }
    }
    draw(pts, { w = 2, c = INK, fill = null, closed = false, alpha = 1 } = {}) {
      const g = this.g;
      g.globalAlpha = alpha;
      this.path(pts, closed || !!fill);
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (w > 0) { g.lineWidth = w; g.strokeStyle = c; g.stroke(); }
      g.globalAlpha = 1;
    }
    line(x1, y1, x2, y2, o) {
      const n = max(2, Math.ceil(hypot(x2 - x1, y2 - y1) / 18)), pts = [];
      for (let i = 0; i <= n; i++) pts.push([x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
      this.draw(pts, o);
    }
    ell(cx, cy, rx, ry, o = {}) { this.draw(ellPts(cx, cy, rx, ry, o.rot || 0, o.wob || 0, o.ws || 0), { ...o, closed: true }); }
    arc(cx, cy, rx, ry, a0, a1, o = {}) { this.draw(ellPts(cx, cy, rx, ry, o.rot || 0, 0, 0, a0, a1, false), o); }
    dot(x, y, r, c = INK) { const g = this.g; g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    // clipped parallel hatching
    hatch(clip, x, y, w, h, { angle = -0.8, gap = 6, c = INK, lw = 1, alpha = 0.6 } = {}) {
      const g = this.g;
      g.save(); clip(); g.clip();
      g.globalAlpha = alpha; g.strokeStyle = c; g.lineWidth = lw;
      const cx = x + w / 2, cy = y + h / 2, R = hypot(w, h) / 2 + gap, ca = cos(angle), sa = sin(angle);
      for (let d = -R; d <= R; d += gap) {
        const x1 = cx - ca * R - sa * d, y1 = cy - sa * R + ca * d, x2 = cx + ca * R - sa * d, y2 = cy + sa * R + ca * d;
        this.path([[x1, y1], [(x1 + x2) / 2, (y1 + y2) / 2], [x2, y2]], false);
        g.stroke();
      }
      g.restore(); g.globalAlpha = 1;
    }
    dots(n, seed, x, y, w, h, { c = INK, r = 0.9, alpha = 0.45, test = null } = {}) {
      const R = rng(seed), g = this.g;
      g.fillStyle = c; g.globalAlpha = alpha;
      for (let i = 0; i < n; i++) {
        const px = x + R() * w, py = y + R() * h, rr = r * (0.6 + R() * 0.8);
        if (test && !test(px, py)) continue;
        g.beginPath(); g.arc(px, py, rr, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    }
    clipEll(cx, cy, rx, ry) { return () => { this.g.beginPath(); this.g.ellipse(cx, cy, rx, ry, 0, 0, TAU); }; }
  }

  /* ---------- shared figures ---------- */
  function eye(ink, x, y, r, lx, ly, blink) {
    if (blink) { ink.arc(x, y, r, r * 0.4, 0.15, Math.PI - 0.15, { w: 2 }); return; }
    ink.ell(x, y, r, r * 0.82, { fill: PAPER, w: 2 });
    const d = hypot(lx, ly) || 1, k = min(1, d / 60) * r * 0.36;
    const ix = x + (lx / d) * k, iy = y + (ly / d) * k * 0.8;
    ink.ell(ix, iy, r * 0.5, r * 0.5, { fill: RED, w: 1.4 });
    ink.dot(ix, iy, r * 0.2, INK);
    ink.dot(ix - r * 0.16, iy - r * 0.18, r * 0.09, '#fff');
  }

  // a tiny human, red, walking (or waving)
  function om(ink, x, y, s, phase, c = RED, wave = null) {
    const step = sin(phase) * 3 * s;
    ink.line(x, y - 9 * s, x, y - 4 * s, { w: 1.8 * s, c });
    ink.line(x, y - 4 * s, x - step, y, { w: 1.6 * s, c });
    ink.line(x, y - 4 * s, x + step, y, { w: 1.6 * s, c });
    if (wave !== null) ink.line(x, y - 8 * s, x + 4 * s, y - 13 * s - sin(wave) * 2 * s, { w: 1.4 * s, c });
    else ink.line(x, y - 8 * s, x + step * 0.7, y - 5 * s, { w: 1.4 * s, c });
    ink.dot(x, y - 11.2 * s, 2.3 * s, c);
  }

  function ground(ink, y = 262, x0 = 16, x1 = 384, seed = 3) {
    ink.line(x0, y, x1, y, { w: 1.8 });
    ink.dots(40, seed, x0, y + 4, x1 - x0, 26, { r: 0.9, alpha: 0.4 });
    ink.line(x0 + 30, y + 9, x0 + 80, y + 9, { w: 1, alpha: 0.5 });
    ink.line(x1 - 120, y + 14, x1 - 60, y + 14, { w: 1, alpha: 0.5 });
  }

  function hills(ink, W, H, base, amp, seed, fill) {
    const pts = [[-30, H + 20]];
    for (let x = -30; x <= W + 30; x += 30) pts.push([x, base + amp * (sin(x * 0.009 + seed) + 0.5 * sin(x * 0.023 + seed * 2))]);
    pts.push([W + 30, H + 20]);
    ink.draw(pts, { fill, w: 0, closed: true });
    ink.draw(pts.slice(1, -1), { w: 2 });
    for (let k = 1; k <= 2; k++) {
      const c = [];
      for (let x = 0; x <= W; x += 40) c.push([x, base + k * 14 + amp * 0.8 * (sin(x * 0.009 + seed + k * 0.3) + 0.5 * sin(x * 0.023 + seed * 2))]);
      ink.draw(c, { w: 1, alpha: 0.35 });
    }
  }

  function giantHead(ink, gx, gy, hr, t, look) {
    ink.draw([[gx - hr * 0.62, gy - hr * 0.35], [gx - hr * 1.35, gy - hr * 0.85], [gx - hr * 1.15, gy - hr * 0.1], [gx - hr * 0.7, gy + hr * 0.15]], { fill: BLUED, closed: true, w: 2 });
    ink.draw([[gx + hr * 0.62, gy - hr * 0.35], [gx + hr * 1.35, gy - hr * 0.85], [gx + hr * 1.15, gy - hr * 0.1], [gx + hr * 0.7, gy + hr * 0.15]], { fill: BLUED, closed: true, w: 2 });
    ink.ell(gx, gy, hr * 0.78, hr, { fill: BLUE, w: 2.4, wob: 0.02 });
    ink.hatch(ink.clipEll(gx, gy, hr * 0.78, hr), gx - hr, gy - hr, hr * 0.62, hr * 2, { c: BLUED, gap: 5, alpha: 0.55, angle: -1.1 });
    ink.arc(gx, gy - hr * 0.5, hr * 0.35, hr * 0.12, Math.PI + 0.3, TAU - 0.3, { w: 1.2, alpha: 0.6 });
    ink.arc(gx, gy - hr * 0.62, hr * 0.25, hr * 0.08, Math.PI + 0.3, TAU - 0.3, { w: 1.2, alpha: 0.5 });
    const blink = (t % 5.3) < 0.2;
    const [lx, ly] = look;
    eye(ink, gx - hr * 0.33, gy - hr * 0.08, hr * 0.22, lx - (gx - hr * 0.33), ly - gy, blink);
    eye(ink, gx + hr * 0.33, gy - hr * 0.08, hr * 0.22, lx - (gx + hr * 0.33), ly - gy, blink);
    ink.line(gx, gy + hr * 0.12, gx - hr * 0.04, gy + hr * 0.3, { w: 1.6 });
    ink.arc(gx, gy + hr * 0.5, hr * 0.18, hr * 0.06, 0.2, Math.PI - 0.2, { w: 1.8 });
  }

  function sphere(ink, x, y, r, t, i) {
    ink.ell(x, y, r, r, { fill: 'rgba(255,255,255,0.45)', w: 1.6 });
    const pts = [];
    for (let k = 0; k < 18; k++) { const a = k * 0.55 + t * 0.6 + i; const rr = r * 0.75 * (1 - k / 22); pts.push([x + cos(a) * rr, y + sin(a) * rr]); }
    ink.draw(pts, { w: 0.9, alpha: 0.4 });
    ink.dot(x, y + r * 0.1, r * 0.22, RED);
    ink.arc(x - r * 0.3, y - r * 0.35, r * 0.35, r * 0.25, Math.PI * 1.1, Math.PI * 1.6, { w: 1.2, c: '#fff' });
  }

  function plant(ink, bx, by, h, kind, t, i, color) {
    const sway = sin(t * 0.8 + i * 1.7) * h * 0.06;
    const hx = bx + sway, hy = by - h;
    const pts = [];
    for (let k = 0; k <= 8; k++) { const u = k / 8; pts.push([bx + sway * u * u - sin(u * 3 + i) * 6 * u, by - h * u]); }
    ink.draw(pts, { w: 2.4 });
    const m = pts[4];
    ink.draw([[m[0], m[1]], [m[0] + 18, m[1] - 14], [m[0] + 30, m[1] - 4], [m[0] + 12, m[1] + 2]], { fill: SAGE, closed: true, w: 1.6 });
    if (kind === 'bulb') {
      ink.ell(hx, hy, 15, 20, { fill: color, w: 2 });
      for (let s = -1; s <= 1; s++) ink.arc(hx + s * 5, hy, 3, 18, -1.3, 1.3, { w: 1, alpha: 0.6 });
    } else if (kind === 'eye') {
      for (let p = 0; p < 7; p++) { const a = (p / 7) * TAU + t * 0.2; ink.ell(hx + cos(a) * 20, hy + sin(a) * 20, 9, 5, { rot: a, fill: color, w: 1.4 }); }
      eye(ink, hx, hy, 12, sin(t * 0.7 + i) * 40, cos(t * 0.5) * 20, ((t + i) % 4.1) < 0.2);
    } else if (kind === 'fan') {
      for (let p = 0; p < 5; p++) { const a = -Math.PI / 2 + (p - 2) * 0.45 + sin(t + i) * 0.05; ink.ell(hx + cos(a) * 18, hy + sin(a) * 18, 18, 7, { rot: a, fill: color, w: 1.5 }); }
      ink.dot(hx, hy, 4, INK);
    } else {
      ink.ell(hx, hy, 13, 13, { fill: color, w: 2 });
      ink.dots(8, i * 13 + 1, hx - 9, hy - 9, 18, 18, { r: 1.4, alpha: 0.8 });
    }
  }

  /* ==========================================================================
     Scenes
     ========================================================================== */
  const SC = {};

  // Hero: the savage planet
  SC.planet = (api) => (t) => {
    const { ink, W, H } = api;
    const narrow = W < 760;
    ink.dots(Math.round((W * H) / 2600), 11, 0, 0, W, H * 0.6, { r: 1, alpha: 0.3 });

    // ringed planet and moon
    const px = W * 0.8, py = H * (narrow ? 0.1 : 0.2), pr = min(95, W * 0.12);
    ink.arc(px, py, pr * 1.9, pr * 0.42, Math.PI, TAU, { rot: -0.35, w: 2 });
    ink.ell(px, py, pr, pr, { fill: '#ecd9a8', w: 2.2 });
    ink.hatch(ink.clipEll(px, py, pr, pr), px - pr * 0.1, py - pr * 0.2, pr * 1.2, pr * 1.3, { gap: 5, alpha: 0.45 });
    ink.arc(px, py, pr * 1.9, pr * 0.42, 0, Math.PI, { rot: -0.35, w: 2.4 });
    ink.arc(px, py, pr * 1.6, pr * 0.34, 0.1, Math.PI - 0.1, { rot: -0.35, w: 1, alpha: 0.6 });
    const mx = W * 0.6 + sin(t * 0.07) * 40, my = H * 0.1 + cos(t * 0.07) * 10;
    ink.ell(mx, my, 20, 20, { fill: PINK, w: 1.8 });
    ink.arc(mx, my, 20, 20, 0.3, 2.3, { w: 1, alpha: 0.5, c: RED });

    // long-winged bird crossing the sky
    const bx = W + 90 - ((t * 38) % (W + 260)), by = H * 0.36 + sin(t * 0.9) * 18, f = sin(t * 7);
    ink.draw([[bx + 16, by], [bx + 50, by - 6], [bx + 90, by + 4 + sin(t * 3) * 4]], { w: 1.4 });
    ink.draw([[bx - 2, by], [bx + 10, by - 34 * f - 6], [bx + 36, by - 22 * f], [bx + 14, by + 2]], { fill: PINK, closed: true, w: 1.6 });
    ink.ell(bx, by, 22, 6, { fill: PINK, w: 1.6 });
    ink.dot(bx - 22, by - 3, 4, INK);
    ink.line(bx - 26, by - 3, bx - 44, by + 2, { w: 1.6 });
    ink.draw([[bx + 2, by], [bx + 16, by + 26 * f + 4], [bx + 30, by + 14 * f], [bx + 18, by + 2]], { fill: '#f1c9bf', closed: true, w: 1.4 });

    // far hills, mid hills
    hills(ink, W, H, H * 0.68, 20, 1.3, '#a9cdbb');
    hills(ink, W, H, H * 0.76, 14, 4.1, '#d8c89c');

    // the blue giant rising behind the near hills
    const hr = max(70, min(150, W * 0.13));
    const gx = W * (narrow ? 0.74 : 0.8), gy = H * 0.7 + sin(t * 0.4) * 4 - hr * 0.3;
    ink.ell(gx, gy + hr * 1.55, hr * 1.7, hr * 0.95, { fill: OCHRE, w: 2.2 });
    ink.dots(70, 5, gx - hr * 1.6, gy + hr * 0.9, hr * 3.2, hr * 1.4, { c: RED, r: 2, alpha: 0.8, test: (x, y) => ((x - gx) / (hr * 1.7)) ** 2 + ((y - gy - hr * 1.55) / (hr * 0.95)) ** 2 < 0.9 });
    ink.draw([[gx - hr * 0.35, gy + hr * 0.7], [gx - hr * 0.42, gy + hr * 1.05], [gx + hr * 0.42, gy + hr * 1.05], [gx + hr * 0.35, gy + hr * 0.7]], { fill: BLUE, closed: true, w: 2 });
    ink.arc(gx, gy + hr * 1.05, hr * 0.6, hr * 0.2, 0, Math.PI, { w: 2 });
    const look = api.mouse() || [gx + sin(t * 0.3) * 200, gy + cos(t * 0.23) * 80];
    giantHead(ink, gx, gy, hr, t, look);

    // meditation spheres
    for (let i = 0; i < 3; i++) {
      const sx = gx - hr * (2.1 - i * 0.9) + sin(t * 0.3 + i) * 10;
      const sy = gy - hr * (0.4 + i * 0.35) + sin(t * 0.5 + i * 2) * 14;
      if (sx > 20) sphere(ink, sx, sy, 14 + i * 5, t, i);
    }

    // near ground
    hills(ink, W, H, H * 0.86, 8, 7.7, CREAM);
    ink.dots(Math.round(W / 6), 21, 0, H * 0.88, W, H * 0.12, { r: 1.1, alpha: 0.4 });

    // flora
    const flora = narrow
      ? [[0.08, 90, 'orb', OCHRE], [0.36, 130, 'fan', VIOLET], [0.95, 150, 'bulb', RED]]
      : [[0.05, 110, 'bulb', RED], [0.14, 70, 'orb', OCHRE], [0.46, 170, 'eye', PINK], [0.55, 120, 'fan', VIOLET], [0.66, 80, 'orb', SAGE], [0.96, 190, 'bulb', RED]];
    flora.forEach(([fx, h, kind, c], i) => plant(ink, W * fx, H * 0.9, h, kind, t, i, c));

    // tiny humans walking along
    for (let i = 0; i < 5; i++) om(ink, ((t * 14 + (i * W) / 5) % (W + 60)) - 30, H * 0.93, 1.3, t * 6 + i);
  };

  // I · Patrimind: stalk-eyed reader
  SC.reader = (api) => (t) => {
    const { ink } = api;
    ground(ink);
    const active = floor(t / 1.6) % 3;
    const pages = [0, 1, 2].map((i) => ({ x: 250 + i * 34 - (i === 1 ? 20 : 0), y: 48 + i * 60 + sin(t * 1.2 + i) * 6, i }));
    pages.forEach((p) => {
      ink.draw([[p.x, p.y], [p.x + 62, p.y + 4], [p.x + 60, p.y + 48], [p.x - 2, p.y + 44]], { fill: p.i === active ? '#fffbe8' : PAPER, closed: true, w: 1.8 });
      for (let k = 0; k < 4; k++) ink.line(p.x + 8, p.y + 12 + k * 8, p.x + 48 - (k % 2) * 14, p.y + 13 + k * 8, { w: 1.1, alpha: 0.75, c: p.i === active && k === 1 ? RED : INK });
    });
    const ap = pages[active];
    ink.draw([[ap.x + 48, ap.y + 21], [352, ap.y + 60], [360, 236]], { w: 1.4, c: RED });
    ink.draw([[344, 236], [376, 236], [376, 254], [344, 254]], { fill: RED, closed: true, w: 1.6 });
    ink.line(350, 245, 370, 245, { w: 1.2, c: PAPER });

    const bx = 120, by = 218;
    for (let k = 0; k < 4; k++) { const lx = bx - 42 + k * 28; ink.draw([[lx, by + 20], [lx - 6 + sin(t * 3 + k) * 3, by + 34], [lx - 2, 262]], { w: 2.2 }); }
    ink.ell(bx, by, 64, 40, { fill: OCHRE, wob: 0.06, ws: 1, w: 2.2 });
    ink.dots(14, 2, bx - 50, by - 30, 100, 60, { r: 3, c: RED, alpha: 0.7, test: (x, y) => ((x - bx) / 58) ** 2 + ((y - by) / 34) ** 2 < 1 });
    const ex = 192 + sin(t * 0.8) * 8, ey = 96 + cos(t * 1.1) * 6;
    const st = [];
    for (let k = 0; k <= 10; k++) { const u = k / 10, v = 1 - u; st.push([v * v * (bx + 24) + 2 * v * u * (bx + 10) + u * u * ex, v * v * (by - 34) + 2 * v * u * 90 + u * u * ey]); }
    ink.draw(st, { w: 3 });
    eye(ink, ex, ey, 20, ap.x + 30 - ex, ap.y + 22 - ey, (t % 3.7) < 0.15);
  };

  // II · Tamis: sieve jellyfish
  SC.sieve = (api) => {
    const parts = [];
    let lt = 0;
    return (t) => {
      const { ink, g } = api;
      const dt = min(0.2, t - lt || 0.1); lt = t;
      ground(ink);
      ink.ell(200, 262, 46, 9, { fill: '#e8d9b6', w: 1.8 });
      const cx = 200, cy = 118 + sin(t * 1.2) * 6, rx = 92, ry = 62;
      for (let i = 0; i < 7; i++) {
        const x0 = cx - 66 + i * 22, pts = [];
        for (let k = 0; k <= 8; k++) pts.push([x0 + sin(t * 2 + i + k * 0.7) * 5 * (k / 8 + 0.2), cy + 6 + k * 14]);
        ink.draw(pts, { w: 1.5, c: i % 2 ? INK : TEAL });
      }
      const bell = ellPts(cx, cy, rx, ry, 0, 0, 0, Math.PI, TAU, false);
      for (let k = 0; k <= 8; k++) bell.push([cx + rx - (k * 2 * rx) / 8, cy + (k % 2 ? 8 : 2)]);
      ink.draw(bell, { fill: 'rgba(95,167,160,0.42)', closed: true, w: 2.2 });
      g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, Math.PI, TAU); g.closePath(); g.clip();
      for (let x = cx - rx; x < cx + rx; x += 12) ink.line(x, cy - ry, x, cy, { w: 0.9, alpha: 0.45 });
      for (let y = cy - ry + 8; y < cy; y += 12) ink.line(cx - rx, y, cx + rx, y, { w: 0.9, alpha: 0.45 });
      g.restore();
      eye(ink, cx - 24, cy - 26, 8, 0, 20, (t % 4.4) < 0.15);
      eye(ink, cx + 24, cy - 26, 8, 0, 20, (t % 4.4) < 0.15);

      if (!RM && parts.length < 60) parts.push({ x: cx - 80 + Math.random() * 160, y: -6, big: Math.random() < 0.6, vy: 30, life: 1, stuck: false });
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        const top = cy - ry * sqrt(max(0, 1 - ((p.x - cx) / rx) ** 2));
        if (p.stuck) {
          p.life -= dt * 0.6;
          p.x += Math.sign(p.x - cx || 1) * dt * 14;
          p.y = cy - ry * sqrt(max(0, 1 - ((p.x - cx) / rx) ** 2)) - 4;
        } else {
          p.vy += dt * 70; p.y += p.vy * dt;
          if (p.big && Math.abs(p.x - cx) < rx - 4 && p.y > top - 4) p.stuck = true;
        }
        if (p.life <= 0 || p.y > 258) { parts.splice(i, 1); continue; }
        g.globalAlpha = max(0, p.life);
        if (p.big) ink.ell(p.x, p.y, 4, 4, { fill: PAPER, w: 1.2, alpha: max(0, p.life) });
        else ink.dot(p.x, p.y, 2.2, RED);
        g.globalAlpha = 1;
      }
      ink.dots(9, 4, 176, 254, 48, 6, { c: RED, r: 2.2, alpha: 0.9 });
    };
  };

  // III · Kynna: talking flower
  SC.bloom = (api) => (t) => {
    const { ink } = api;
    ground(ink);
    const sway = sin(t * 0.9) * 8, cx = 200 + sway, cy = 128;
    ink.draw([[200, 262], [196, 220], [204 + sway * 0.5, 180], [cx, cy + 20]], { w: 3 });
    ink.draw([[199, 225], [168, 205], [150, 214], [180, 232]], { fill: SAGE, closed: true, w: 1.6 });
    ink.draw([[201, 200], [236, 186], [252, 196], [222, 210]], { fill: SAGE, closed: true, w: 1.6 });
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 5 + sin(t * 0.3) * 0.1;
      const open = 0.8 + 0.2 * sin(t * 1.3 + i);
      const bx = cx + cos(a) * 70 * open, by = cy + sin(a) * 58 * open;
      ink.line(cx + cos(a) * 20, cy + sin(a) * 18, bx - cos(a) * 22, by - sin(a) * 14, { w: 1.6 });
      ink.ell(bx, by, 30 * open, 19 * open, { fill: i % 2 ? PAPER : '#fff7e0', w: 1.8, wob: 0.03 });
      const hot = floor(t * 5 + i) % 3;
      [RED, BLUE, OCHRE].forEach((c, k) => ink.dot(bx - 9 + k * 9, by - (hot === k ? 3 : 0), 2.6 * open, c));
    }
    ink.ell(cx, cy, 21, 21, { fill: OCHRE, w: 2 });
    ink.arc(cx - 7, cy - 3, 3, 2, Math.PI, TAU, { w: 1.6 });
    ink.arc(cx + 7, cy - 3, 3, 2, Math.PI, TAU, { w: 1.6 });
    ink.arc(cx, cy + 5, 7, 4, 0.2, Math.PI - 0.2, { w: 1.6 });
  };

  // IV · PodDrafts: eight-armed card dealer
  SC.octo = (api) => (t) => {
    const { ink } = api;
    ground(ink);
    const cx = 200, cy = 108 + sin(t) * 5, tips = [];
    for (let i = 0; i < 8; i++) {
      const base = Math.PI * 0.06 + (i * Math.PI * 0.88) / 7, pts = [];
      for (let k = 0; k <= 10; k++) {
        const u = k / 10, a = base + sin(t * 2 + i + k * 0.5) * 0.22 * u, r = 26 + k * 13;
        pts.push([cx + cos(a) * r * 1.15, cy + 16 + sin(a) * r * 0.82]);
      }
      ink.draw(pts, { w: 5 });
      ink.draw(pts, { w: 2.6, c: VIOLET });
      tips.push(pts[10]);
    }
    const shift = t * 0.7, k0 = floor(shift), fr = shift - k0, e = fr < 0.55 ? 0 : (fr - 0.55) / 0.45, s = e * e * (3 - 2 * e);
    for (let j = 0; j < 8; j++) {
      const a = tips[(j + k0) % 8], b = tips[(j + k0 + 1) % 8];
      const x = a[0] + (b[0] - a[0]) * s, y = a[1] + (b[1] - a[1]) * s - 6, r = sin(t + j) * 0.2;
      const pts = [[-8, -11], [8, -11], [8, 11], [-8, 11]].map(([u, v]) => [x + u * cos(r) - v * sin(r), y + u * sin(r) + v * cos(r)]);
      ink.draw(pts, { fill: MANA[j % 5], closed: true, w: 1.5 });
    }
    ink.ell(cx, cy, 58, 48, { fill: VIOLET, wob: 0.05, ws: t * 0.5, w: 2.4 });
    ink.hatch(ink.clipEll(cx, cy, 58, 48), cx - 60, cy + 10, 120, 50, { gap: 5, alpha: 0.4 });
    const lookAt = tips[(k0 + 3) % 8];
    eye(ink, cx - 20, cy - 8, 12, lookAt[0] - cx, lookAt[1] - cy, (t % 4.9) < 0.15);
    eye(ink, cx + 20, cy - 8, 12, lookAt[0] - cx, lookAt[1] - cy, (t % 4.9) < 0.15);
  };

  // V · MTG Meta History: tree of strata
  SC.strata = (api) => (t) => {
    const { ink, g } = api;
    ground(ink);
    const trunk = [[166, 262], [180, 196], [172, 132], [188, 96], [212, 96], [228, 132], [220, 196], [236, 262]];
    ink.draw(trunk, { fill: '#cdb88a', closed: true, w: 2.2 });
    g.save(); ink.path(trunk, true); g.clip();
    for (let b = 0; b < 12; b++) {
      const y = 262 - ((b * 16 + t * 7) % 192);
      g.globalAlpha = 0.8; g.fillStyle = MANA[b % 5]; g.fillRect(150, y - 10, 100, 11); g.globalAlpha = 1;
      ink.line(150, y - 10, 250, y - 10, { w: 0.9, alpha: 0.6 });
    }
    g.restore();
    ink.draw(trunk, { closed: true, w: 2.2 });
    const tips = [[110, 70], [150, 44], [250, 44], [292, 72], [200, 30]];
    tips.forEach(([x, y], i) => {
      ink.draw([[200, 100], [(200 + x) / 2, (100 + y) / 2 + 10], [x, y]], { w: 2.4 });
      ink.ell(x, y, 30, 20, { fill: SAGE, w: 1.8, wob: 0.08, ws: i });
      ink.hatch(ink.clipEll(x, y, 30, 20), x - 30, y, 60, 22, { gap: 4, alpha: 0.35 });
    });
    tips.forEach(([x, y], i) => {
      const a = sin(t * 1.5 + i) * 0.3, fx = x + sin(a) * 30, fy = y + 14 + cos(a) * 30;
      ink.line(x, y + 12, fx, fy, { w: 1 });
      ink.ell(fx, fy, 8, 8, { fill: MANA[i], w: 1.6 });
    });
  };

  // VI · PicSQL: pixel-shelled beetle
  SC.beetle = (api) => (t) => {
    const { ink, g } = api;
    ground(ink);
    const cx = 200, cy = 168, pal = [RED, OCHRE, BLUE, SAGE, VIOLET, PINK];
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const hx = cx + side * 52, hy = cy - 22 + k * 24, ph = t * 7 + k * 2 + (side > 0 ? Math.PI : 0);
        ink.draw([[hx, hy], [hx + side * 34, hy - 10 + sin(ph) * 5], [hx + side * 46 + sin(ph) * 5, 258]], { w: 2.4 });
      }
    }
    ink.draw([[cx - 10, cy - 88], [cx - 30 + sin(t * 5) * 4, cy - 122], [cx - 44, cy - 128]], { w: 1.8 });
    ink.draw([[cx + 10, cy - 88], [cx + 30 + sin(t * 4 + 1) * 4, cy - 122], [cx + 44, cy - 128]], { w: 1.8 });
    ink.ell(cx, cy - 78, 30, 20, { fill: '#2f3a3c', w: 2 });
    ink.dot(cx - 11, cy - 82, 3, RED); ink.dot(cx + 11, cy - 82, 3, RED);
    ink.ell(cx, cy, 80, 64, { fill: PAPER, w: 2.6 });
    g.save(); g.beginPath(); g.ellipse(cx, cy, 78, 62, 0, 0, TAU); g.clip();
    const f = floor(t * 4);
    for (let i = 0; i < 10; i++) for (let j = 0; j < 8; j++) {
      g.fillStyle = pal[(f + i * 3 + j * 5 + ((i * j) % 3)) % 6];
      g.globalAlpha = 0.85; g.fillRect(cx - 80 + i * 16, cy - 64 + j * 16, 16, 16);
    }
    g.globalAlpha = 1;
    for (let i = 1; i < 10; i++) ink.line(cx - 80 + i * 16, cy - 64, cx - 80 + i * 16, cy + 64, { w: 0.9, alpha: 0.6 });
    for (let j = 1; j < 8; j++) ink.line(cx - 80, cy - 64 + j * 16, cx + 80, cy - 64 + j * 16, { w: 0.9, alpha: 0.6 });
    g.restore();
    ink.line(cx, cy - 64, cx, cy + 64, { w: 2 });
    ink.ell(cx, cy, 80, 64, { w: 2.6 });
  };

  // VII · Unity sandbox: tripod walker razing a town
  SC.tripod = (api) => (t) => {
    const { ink } = api;
    ground(ink);
    const cyc = (t * 0.7) % 10, fallen = floor(cyc);
    for (let i = 0; i < 8; i++) {
      const hx = 44 + i * 44;
      if (i < fallen) {
        ink.draw([[hx - 12, 262], [hx - 4, 252], [hx + 6, 256], [hx + 12, 262]], { fill: STONE, closed: true, w: 1.4 });
        const puff = (t * 20 + i * 13) % 50;
        ink.ell(hx, 248 - puff, 6 + puff * 0.15, 5 + puff * 0.12, { fill: 'rgba(31,43,46,0.08)', w: 1, alpha: max(0, 1 - puff / 50) });
      } else {
        ink.draw([[hx - 11, 262], [hx - 11, 246], [hx + 11, 246], [hx + 11, 262]], { fill: PAPER, closed: true, w: 1.6 });
        ink.draw([[hx - 14, 247], [hx, 234], [hx + 14, 247]], { fill: RED, closed: true, w: 1.6 });
      }
    }
    const wx = 60 + cyc * 32, wy = 92 + sin(t * 3) * 3;
    for (let k = 0; k < 3; k++) {
      const fx = wx + (k - 1) * 54 + sin(t * 3 + k * 2) * 10, kx = (wx + fx) / 2 + (k - 1) * 10, ky = wy + 60 - Math.abs(sin(t * 3 + k * 2)) * 14;
      ink.draw([[wx + (k - 1) * 14, wy + 12], [kx, ky], [fx, 262]], { w: 2.6 });
    }
    const target = 44 + fallen * 44;
    if (fallen < 8 && floor(t * 10) % 3) {
      ink.line(wx, wy + 12, target, 250, { w: 2.6, c: RED });
      ink.ell(target, 250, 8, 6, { fill: OCHRE, w: 1.2 });
    }
    ink.ell(wx, wy, 36, 20, { fill: '#b9c0bf', w: 2.2 });
    ink.hatch(ink.clipEll(wx, wy, 36, 20), wx - 36, wy + 2, 72, 20, { gap: 4, alpha: 0.5 });
    ink.ell(wx, wy - 14, 14, 9, { fill: BLUE, w: 1.8 });
    ink.dot(wx + 20, wy - 2, 3, RED);
  };

  // VIII · Cardwright: scribe bird drawing a card
  SC.quill = (api) => {
    const path = [];
    for (let i = 0; i <= 140; i++) { const a = (i / 140) * TAU * 2.4, r = 3 + i * 0.26; path.push([286 + cos(a) * r, 150 + sin(a) * r * 1.15]); }
    return (t) => {
      const { ink } = api;
      ground(ink);
      ink.draw([[228, 70], [344, 73], [341, 246], [225, 243]], { fill: PAPER, closed: true, w: 2 });
      ink.draw([[236, 96], [334, 98], [332, 206], [234, 204]], { w: 1.2, alpha: 0.6 });
      ink.ell(240, 83, 8, 8, { fill: BLUE, w: 1.4 });
      ink.line(252, 83, 320, 84, { w: 1.2, alpha: 0.6 });
      ink.draw([[262, 226], [310, 226]], { w: 1.2, alpha: 0.6 });
      const prog = min(1, (t * 0.22) % 1.25), n = max(2, floor(prog * path.length));
      ink.draw(path.slice(0, n), { w: 2, c: RED });
      const tip = path[min(n, path.length - 1)];
      const hx = 170 + (tip[0] - 286) * 0.2, hy = 116 + (tip[1] - 150) * 0.25;
      ink.draw([[112, 262], [118, 212]], { w: 2 });
      ink.draw([[140, 262], [138, 214]], { w: 2 });
      ink.draw([[80, 170], [40, 150], [48, 184], [30, 200]], { w: 2, c: TEAL });
      ink.ell(122, 184, 52, 34, { fill: TEAL, w: 2.2, rot: -0.2 });
      ink.hatch(ink.clipEll(122, 184, 52, 34), 70, 190, 110, 30, { gap: 4, alpha: 0.4 });
      ink.draw([[150, 166], [hx - 6, hy + 10]], { w: 7 });
      ink.draw([[150, 166], [hx - 6, hy + 10]], { w: 4, c: TEAL });
      ink.ell(hx, hy, 16, 14, { fill: TEAL, w: 2 });
      eye(ink, hx - 2, hy - 3, 6, tip[0] - hx, tip[1] - hy, (t % 3.3) < 0.12);
      ink.draw([[hx + 12, hy - 3], [tip[0], tip[1]]], { w: 2.4 });
      ink.draw([[hx + 12, hy + 4], [tip[0] - 4, tip[1] + 2]], { w: 1.6 });
    };
  };

  // Perry Rhodan: a sphere ship over a strange world
  SC.sphereship = (api) => (t) => {
    const { ink, W, H } = api;
    ink.dots(90, 31, 0, 0, W, H * 0.7, { r: 1.1, alpha: 0.5 });
    ink.ell(70, 70, 22, 22, { fill: PINK, w: 1.8 });
    ink.hatch(ink.clipEll(70, 70, 22, 22), 70, 50, 30, 50, { gap: 4, alpha: 0.4 });
    ink.ell(200, 690, 330, 330, { fill: SAGE, w: 2.4 });
    ink.hatch(ink.clipEll(200, 690, 330, 330), -130, 360, 660, 120, { gap: 6, alpha: 0.35, angle: 0.4 });
    for (let k = 0; k < 3; k++) ink.arc(200, 690, 330 - 24 - k * 26, 330 - 30 - k * 30, Math.PI + 0.35, TAU - 0.35, { w: 1, alpha: 0.4 });

    const cx = 200, cy = 170 + sin(t * 0.8) * 6, r = 92;
    for (let k = 0; k < 3; k++) {
      const a = Math.PI * (0.3 + k * 0.2), lx = cx + cos(a) * r * 0.7, fx = cx + cos(a) * r * 1.05;
      ink.draw([[lx, cy + r * 0.7], [fx, cy + r * 1.28]], { w: 2.4 });
      ink.ell(fx, cy + r * 1.3, 9, 3, { fill: INK, w: 1 });
    }
    for (let k = 0; k < 3; k++) {
      const u = (t * 0.5 + k / 3) % 1;
      ink.ell(cx, cy + r * 1.35 + u * 60, 20 + u * 30, 4 + u * 6, { w: 1.2, alpha: 1 - u });
    }
    ink.arc(cx, cy, r * 1.22, r * 0.22, Math.PI, TAU, { w: 2.2 });
    ink.ell(cx, cy, r, r, { fill: '#dde1d2', w: 2.6 });
    ink.hatch(ink.clipEll(cx, cy, r, r), cx - r * 0.1, cy - r * 0.3, r * 1.2, r * 1.4, { gap: 5, alpha: 0.45, angle: -0.9 });
    ink.hatch(ink.clipEll(cx, cy, r, r), cx + r * 0.35, cy + r * 0.2, r * 0.7, r * 0.9, { gap: 5, alpha: 0.4, angle: 0.8 });
    for (const lat of [-0.6, -0.3, 0.35, 0.65]) {
      const yy = cy + lat * r, rr = r * sqrt(1 - lat * lat);
      ink.arc(cx, yy, rr, rr * 0.18, 0.05, Math.PI - 0.05, { w: 1, alpha: 0.55 });
    }
    const band = ellPts(cx, cy, r * 1.22, r * 0.22, 0, 0, 0, 0, Math.PI, false);
    band.push([cx - r * 1.22, cy - 2]);
    ink.draw(band, { fill: '#b9c0bf', closed: true, w: 2.4 });
    const on = floor(t * 4);
    for (let k = 0; k < 10; k++) {
      const a = 0.25 + k * 0.29;
      ink.dot(cx + cos(a) * r * 1.1, cy + sin(a) * r * 0.16, 3.2, (k + on) % 4 === 0 ? RED : OCHRE);
    }
    ink.ell(cx - r * 0.35, cy - r * 0.45, r * 0.18, r * 0.12, { fill: 'rgba(255,255,255,0.7)', w: 0, rot: -0.6 });
  };

  // Contact: the giant, and a tiny human signalling from its head
  SC.giant = (api) => (t) => {
    const { ink, W, H } = api;
    const cx = W / 2, cy = H * 0.58, hr = min(W, H) * 0.36;
    const look = api.mouse() || [cx + sin(t * 0.4) * 150, cy + cos(t * 0.3) * 80];
    giantHead(ink, cx, cy, hr, t, look);
    const hx = cx + sin(t * 0.3) * hr * 0.15, hy = cy - hr + 4;
    om(ink, hx, hy, 2, 0, RED, t * 6);
    const fx = hx + 8, fy = hy - 26 - sin(t * 6) * 3;
    for (let k = 0; k < 3; k++) {
      const u = (t * 0.8 + k / 3) % 1, rr = 8 + u * 50;
      ink.arc(fx, fy, rr, rr, -Math.PI * 0.85, -Math.PI * 0.15, { w: 1.6, alpha: 1 - u, c: RED });
    }
  };

  // Footer strip: humans walking past the flora
  SC.walkers = (api) => (t) => {
    const { ink, W, H } = api;
    const gy = H - 16;
    ink.line(-10, gy, W + 10, gy, { w: 1.8 });
    ink.dots(Math.round(W / 8), 9, 0, gy + 3, W, 12, { r: 0.9, alpha: 0.4 });
    [[0.08, 50, 'orb', OCHRE], [0.3, 70, 'bulb', RED], [0.62, 44, 'fan', VIOLET], [0.86, 64, 'eye', PINK]]
      .forEach(([fx, h, k, c], i) => plant(ink, W * fx, gy, min(h, H * 0.6), k, t, i + 3, c));
    for (let i = 0; i < 4; i++) om(ink, ((t * 18 + (i * W) / 4) % (W + 40)) - 20, gy, 1.4, t * 7 + i);
    sphere(ink, W * 0.5 + sin(t * 0.25) * W * 0.3, H * 0.3 + sin(t * 0.6) * 6, 12, t, 1);
  };

  /* ==========================================================================
     Engine: size, observe, redraw at ~10 fps
     ========================================================================== */
  let mouse = null;
  window.addEventListener('pointermove', (e) => { mouse = [e.clientX, e.clientY]; }, { passive: true });

  const scenes = [];
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((es) => es.forEach((e) => { const s = scenes.find((x) => x.cv === e.target); if (s) s.visible = e.isIntersecting; }), { rootMargin: '80px' })
    : null;

  function render(sc, t) {
    const { g, s, dpr } = sc.api;
    if (!sc.api.W) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, sc.cv.width, sc.cv.height);
    g.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
    g.lineJoin = 'round'; g.lineCap = 'round';
    BOIL = floor(t * 5) % 3;
    sc.draw(t);
  }

  const t0 = performance.now();
  const now = () => (RM ? 4 : (performance.now() - t0) / 1000);

  function setup(cv) {
    const name = cv.dataset.scene, make = SC[name];
    if (!make) return;
    const api = { cv, g: cv.getContext('2d'), W: 0, H: 0, s: 1, dpr: 1 };
    api.ink = new Ink(api.g);
    api.mouse = () => {
      if (!mouse) return null;
      const r = cv.getBoundingClientRect();
      return [(mouse[0] - r.left) / api.s, (mouse[1] - r.top) / api.s];
    };
    const fitHeight = name === 'planet';
    const baseW = name === 'walkers' ? 800 : 400;
    const size = () => {
      const cw = cv.clientWidth, ch = cv.clientHeight;
      if (!cw || !ch) return;
      const dpr = min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
      api.dpr = dpr;
      api.s = fitHeight ? ch / 800 : cw / baseW;
      api.W = cw / api.s; api.H = ch / api.s;
    };
    size();
    const sc = { cv, api, draw: make(api), visible: !io, last: 0 };
    scenes.push(sc);
    if (io) io.observe(cv);
    if ('ResizeObserver' in window) new ResizeObserver(() => { size(); render(sc, now()); }).observe(cv);
    render(sc, now());
  }

  function loop(ts) {
    const t = (ts - t0) / 1000;
    for (const sc of scenes) {
      if (!sc.visible || ts - sc.last < 95) continue;
      sc.last = ts;
      render(sc, t);
    }
    requestAnimationFrame(loop);
  }

  function boot() {
    document.querySelectorAll('canvas[data-scene]').forEach(setup);
    if (!RM) requestAnimationFrame(loop);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
