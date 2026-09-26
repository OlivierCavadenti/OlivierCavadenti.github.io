/* Olivier Cavadenti · planète étrange
   Screen-print scenes traced in code: engraved stippling, ringed tentacles, concentric
   discs, flat red and yellow fields. Every ink line trembles slightly from frame to frame
   ("line boil") and the scenes redraw about ten times a second, like a hand-drawn GIF. */
(() => {
  'use strict';

  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;
  const { sin, cos, min, max, floor, hypot, sqrt, abs } = Math;
  const clamp = (v, a, b) => max(a, min(b, v));

  const INK = '#161616', WHITE = '#f7f4ec', RED = '#c1473b', YEL = '#f2c230', BLUE = '#8fb4de',
    BLUED = '#3456a0', LILAC = '#b9b4c4', GREEN = '#a5c63b', ORANGE = '#e58a2f', MAROON = '#6e2a22',
    PINK = '#e7a3a0';
  const MANA = ['#f7f0cf', '#6ea3d8', '#6d5a78', '#e0643f', '#79b35a'];

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
    const n = max(12, min(72, ((rx + ry) * 0.35) | 0));
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
  const dirAt = (sp, i) => {
    const a = sp[max(0, i - 1)], b = sp[min(sp.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  // a curling spine: start point, start angle, length, curl, n points
  function spine(x, y, ang, len, curl, n = 16, wave = 0, t = 0, ph = 0) {
    const pts = [[x, y]], step = len / (n - 1);
    for (let i = 1; i < n; i++) {
      const u = i / (n - 1);
      ang += curl * u * 0.25 + sin(t * 0.9 + ph + u * 3) * wave * u;
      x += cos(ang) * step; y += sin(ang) * step;
      pts.push([x, y]);
    }
    return pts;
  }

  class Ink {
    constructor(g) { this.g = g; this.jk = 1; }
    j(x, y) { const k = 1.7 * this.jk; return [x + (hash(x * 0.37, y * 0.53, BOIL) - 0.5) * k, y + (hash(y * 0.41, x * 0.29, BOIL + 7) - 0.5) * k]; }
    // straight edges, subdivided so the boil still makes them tremble: pages, cards, houses
    pathSharp(pts, closed) {
      const g = this.g, n = pts.length, seg = [];
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const a = pts[i], b = pts[(i + 1) % n], k = max(1, Math.ceil(hypot(b[0] - a[0], b[1] - a[1]) / 14));
        for (let s = 0; s < k; s++) seg.push([a[0] + ((b[0] - a[0]) * s) / k, a[1] + ((b[1] - a[1]) * s) / k]);
      }
      if (!closed) seg.push(pts[n - 1]);
      g.beginPath();
      seg.forEach((q, i) => { const p = this.j(q[0], q[1]); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
      if (closed) g.closePath();
    }
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
    draw(pts, { w = 2, c = INK, fill = null, closed = false, alpha = 1, sharp = false } = {}) {
      const g = this.g;
      g.globalAlpha = alpha;
      if (sharp) this.pathSharp(pts, closed || !!fill);
      else this.path(pts, closed || !!fill);
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
    clipEll(cx, cy, rx, ry, rot = 0) { return () => { this.g.beginPath(); this.g.ellipse(cx, cy, rx, ry, rot, 0, TAU); }; }
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
    // engraved stippling on an ellipse, lit from the upper left
    stip(cx, cy, rx, ry, { seed = 1, dens = 1, c = INK, s = 1.4 } = {}) {
      const R = rng(seed), g = this.g, count = floor(rx * ry * 0.42 * dens);
      g.fillStyle = c;
      for (let k = 0; k < count; k++) {
        const a = R() * TAU, rr = sqrt(R()), keep = R();
        const nx = cos(a) * rr, ny = sin(a) * rr, nz = sqrt(max(0, 1 - rr * rr));
        const lit = max(0, -0.5 * nx - 0.6 * ny + 0.62 * nz), dark = 1 - lit;
        if (keep > dark * dark * 1.15) continue;
        g.fillRect(cx + nx * rx - s / 2, cy + ny * ry - s / 2, s, s);
      }
    }
    // ringed organic tube along a spine, stippled on its shadow side, optional black claw
    tube(sp, rf, { fill = WHITE, w = 2, bands = 1, stip = 1, seed = 1, claw = false, side = 1 } = {}) {
      const g = this.g, n = sp.length, L = [], R = [];
      for (let i = 0; i < n; i++) {
        const d = dirAt(sp, i), r = rf(i / (n - 1));
        L.push([sp[i][0] - d[1] * r, sp[i][1] + d[0] * r]);
        R.push([sp[i][0] + d[1] * r, sp[i][1] - d[0] * r]);
      }
      const poly = L.concat(R.slice().reverse());
      this.draw(poly, { fill, w: 0, closed: true });
      if (stip) {
        g.save(); this.path(poly, true); g.clip();
        const Rn = rng(seed), count = floor(n * 7 * rf(0.4) * stip);
        g.fillStyle = fill === INK ? WHITE : INK;
        for (let k = 0; k < count; k++) {
          const u = Rn(), v = Rn() * 2 - 1, keep = Rn();
          const dk = clamp(v * side * 0.85 + 0.3, 0, 1);
          if (keep > dk * dk) continue;
          const i = min(n - 1, floor(u * (n - 1))), d = dirAt(sp, i), r = rf(u);
          g.fillRect(sp[i][0] - d[1] * r * v - 0.7, sp[i][1] + d[0] * r * v - 0.7, 1.4, 1.4);
        }
        g.restore();
      }
      if (bands) {
        for (let i = bands; i < n - 1; i += bands) {
          const d = dirAt(sp, i), r = rf(i / (n - 1));
          this.draw([L[i], [sp[i][0] + d[0] * r * 0.35, sp[i][1] + d[1] * r * 0.35], R[i]], { w: 1, alpha: 0.85, c: fill === INK ? WHITE : INK });
        }
      }
      this.draw(L, { w }); this.draw(R, { w });
      const d = dirAt(sp, n - 1), e = sp[n - 1], r = rf(1);
      if (claw) this.draw([L[n - 1], [e[0] + d[0] * r * 3.4 - d[1] * r * 1.8, e[1] + d[1] * r * 3.4 + d[0] * r * 1.8], R[n - 1]], { fill: INK, closed: true, w: 1.4 });
      else this.draw([L[n - 1], [e[0] + d[0] * r * 1.1, e[1] + d[1] * r * 1.1], R[n - 1]], { w, fill });
    }
    // concentric disc
    rings(cx, cy, r, cols, { rot = 0, w = 1.8 } = {}) {
      cols.forEach((c, k) => { const rr = r * (1 - k / cols.length); this.ell(cx, cy, rr, rr, { fill: c, w: k ? 1 : w }); });
      for (let k = 0; k < 16; k++) { const a = rot + (k / 16) * TAU; this.dot(cx + cos(a) * r * 0.9, cy + sin(a) * r * 0.9, max(1, r * 0.04), INK); }
      this.arc(cx - r * 0.2, cy - r * 0.2, r * 0.5, r * 0.5, Math.PI * 1.05, Math.PI * 1.45, { w: 1.4, c: WHITE });
    }
  }

  const field = (api, c) => { api.g.fillStyle = c; api.g.fillRect(-4, -4, api.W + 8, api.H + 8); };

  // yellow meteor streaks falling on a diagonal, as on a screen print
  function streaks(api, t, n, seed, { col = YEL, scale = 1, speed = 1 } = {}) {
    const { g, W, H } = api, R = rng(seed);
    g.strokeStyle = col; g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x0 = R() * (W + H * 0.5), y0 = R() * H, len = (18 + R() * 60) * scale, wd = (3 + R() * 5) * scale, sp = (40 + R() * 70) * speed * scale;
      const p = ((y0 + t * sp) % (H + 200)) - 100;
      let x = x0 - (t * sp) * 0.5;
      x = ((x % (W + H * 0.5 + 100)) + W + H * 0.5 + 100) % (W + H * 0.5 + 100) - 50;
      g.lineWidth = wd;
      g.beginPath(); g.moveTo(x, p); g.lineTo(x + len * 0.45, p - len * 0.9); g.stroke();
    }
  }

  /* ---------- shared figures ---------- */
  function eye(ink, x, y, r, lx, ly, blink) {
    if (blink) { ink.arc(x, y, r, r * 0.4, 0.15, Math.PI - 0.15, { w: 2.2 }); return; }
    ink.ell(x, y, r, r * 0.84, { fill: WHITE, w: 2 });
    const d = hypot(lx, ly) || 1, k = min(1, d / 60) * r * 0.34;
    const ix = x + (lx / d) * k, iy = y + (ly / d) * k * 0.8;
    ink.ell(ix, iy, r * 0.56, r * 0.56, { fill: RED, w: 1.6 });
    ink.arc(ix, iy, r * 0.4, r * 0.4, 0.4, 2.2, { w: 1, alpha: 0.6 });
    ink.dot(ix, iy, r * 0.22, INK);
    ink.dot(ix - r * 0.18, iy - r * 0.2, r * 0.1, '#fff');
  }

  // a small Earthling in a bubble helmet, feet at (x, y), about 16·s tall.
  // step: walk phase (null = standing), wave: waving phase for the raised arm (null = arms down)
  function human(ink, x, y, s, { step = null, wave = null, suit = RED, trim = YEL } = {}) {
    const P = (u, v) => [x + u * s, y + v * s], lw = max(1, s * 0.36), jk = ink.jk;
    ink.jk = clamp(s / 6, 0.3, 1);
    const limb = (pts, c) => {
      const q = pts.map(([u, v]) => P(u, v));
      ink.draw(q, { w: s * 1.9, c: INK });
      ink.draw(q, { w: s * 1.9 - lw * 1.6, c });
    };
    const a = step === null ? 0 : sin(step) * 1.5, lift = step === null ? 0 : max(0, cos(step)) * 0.6;
    // legs, far one first, then boots
    const legs = [[-0.8, -a, lift], [0.8, a, step === null ? 0 : max(0, -cos(step)) * 0.6]];
    legs.forEach(([hx, d, up]) => limb([[hx, -6.4], [hx + d * 0.5, -3.4 - up], [hx * 1.4 + d, -0.6 - up]], suit));
    legs.forEach(([hx, d, up]) => ink.ell(...P(hx * 1.4 + d + 0.3, -0.5 - up), 1.2 * s, 0.7 * s, { fill: INK, w: 0 }));
    // arms behind the body when they hang, in front when one waves
    const armL = [[-2, -10.6], [-3.1 + a * 0.3, -8.4], [-2.9 + a * 0.5, -6.4]];
    const armR = wave === null ? [[2, -10.6], [3.1 - a * 0.3, -8.4], [2.9 - a * 0.5, -6.4]]
      : [[2, -10.6], [4, -12.2], [4.4 + sin(wave) * 1.1, -15.2]];
    limb(armL, suit);
    if (wave === null) limb(armR, suit);
    // torso: suit, belt, badge
    ink.ell(...P(0, -8.6), 2.5 * s, 3.1 * s, { fill: suit, w: lw });
    ink.line(...P(-2.3, -6.9), ...P(2.3, -6.9), { w: lw * 1.4, c: trim });
    ink.dot(...P(-1, -9.6), 0.55 * s, trim);
    if (wave !== null) limb(armR, suit);
    for (const h of [armL[2], armR[2]]) ink.ell(...P(h[0], h[1]), 0.95 * s, 0.95 * s, { fill: WHITE, w: lw * 0.8 });
    // head in a glass helmet
    ink.ell(...P(0, -13.6), 2.8 * s, 2.7 * s, { fill: '#dde9f2', w: lw });
    ink.ell(...P(0, -13.3), 1.8 * s, 1.9 * s, { fill: PINK, w: lw * 0.6 });
    ink.draw([P(-1.8, -13.6), P(-1.2, -15.4), P(0.6, -15.5), P(1.8, -13.9), P(0.6, -14.6), P(-0.9, -14.4)], { fill: MAROON, closed: true, w: 0 });
    ink.dot(...P(-0.65, -13.2), 0.3 * s, INK); ink.dot(...P(0.65, -13.2), 0.3 * s, INK);
    ink.arc(...P(0, -12.5), 0.7 * s, 0.4 * s, 0.3, Math.PI - 0.3, { w: lw * 0.6 });
    ink.arc(...P(-0.4, -14.2), 1.8 * s, 1.8 * s, Math.PI * 1.1, Math.PI * 1.4, { w: lw * 0.9, c: '#fff' });
    ink.jk = jk;
  }

  function ground(ink, y = 262, c = INK) {
    ink.line(10, y, 390, y, { w: 2, c });
    ink.dots(70, 3, 10, y + 3, 380, 30, { r: 1, alpha: 0.6, c });
    ink.line(40, y + 9, 100, y + 9, { w: 1, alpha: 0.6, c });
    ink.line(260, y + 15, 330, y + 15, { w: 1, alpha: 0.6, c });
  }

  function ship(ink, x, y, s, t) {
    const P = (pts) => pts.map(([u, v]) => [x + u * s, y + v * s]);
    ink.draw(P([[-330, -70], [110, -140], [340, -50], [260, 40], [60, 120], [-40, 210], [-60, 100], [-250, 40]]), { fill: INK, closed: true, w: 2 });
    ink.draw(P([[-60, 100], [-40, 210], [-10, 115]]), { fill: INK, closed: true, w: 1.5 });
    const hull = P([[-330, -70], [110, -140], [340, -50], [260, 40], [60, 120], [-40, 210], [-60, 100], [-250, 40]]);
    ink.hatch(() => ink.path(hull, true), x - 330 * s, y - 140 * s, 670 * s, 350 * s, { c: WHITE, gap: 9 * s, alpha: 0.28, angle: 0.35 });
    ink.draw(P([[-280, -40], [-60, -80], [100, -100]]), { w: 1.4, c: WHITE, alpha: 0.8 });
    ink.draw(P([[-200, 20], [-40, 0], [80, 60], [230, 20]]), { w: 1.2, c: WHITE, alpha: 0.7 });
    ink.dots(40, 8, x - 300 * s, y - 100 * s, 600 * s, 200 * s, { c: WHITE, r: 1.2, alpha: 0.7, test: (px, py) => py < y + 60 * s - (px - x) * 0.1 });
    ink.rings(x + 20 * s, y - 20 * s, 58 * s, [YEL, '#f7d765', YEL, '#e9b21f'], { rot: t * 0.3 });
    ink.rings(x + 190 * s, y + 10 * s, 40 * s, [YEL, '#f7d765', YEL], { rot: -t * 0.4 });
    for (let k = 0; k < 3; k++) ink.arc(x + 20 * s, y - 20 * s, (20 + k * 12) * s, (14 + k * 8) * s, 0.4, 1.4, { w: 1.2, c: WHITE, alpha: 0.9 });
    ink.draw(P([[-250, 40], [-150, 120], [-120, 60 + sin(t) * 8], [-60, 150]]), { w: 1.4, c: WHITE, alpha: 0.9 });
    ink.draw(P([[260, 40], [280, 140 + sin(t * 1.3) * 10], [240, 220]]), { w: 1.4, c: WHITE, alpha: 0.9 });
  }

  // the blue giant's head: (gx, gy) centre, hr half-height, rot tilt; talk opens the mouth
  function giantHead(ink, gx, gy, hr, t, look, rot = -0.16, talk = false, closed = false) {
    const g = ink.g, P = (dx, dy) => [gx + (dx * cos(rot) - dy * sin(rot)) * hr, gy + (dx * sin(rot) + dy * cos(rot)) * hr];
    // antennae with ringed bobbles, behind the skull
    for (const sx of [-1, 1]) {
      const b = P(sx * 0.3, -0.82);
      const sp = spine(b[0], b[1], -Math.PI / 2 + rot + sx * 0.5, hr * 0.42, sx * 1.1, 9, 0.12, t * 1.3, sx);
      ink.tube(sp, (u) => hr * (0.045 - u * 0.02), { fill: BLUE, bands: 3, stip: 0, w: 2 });
      const e = sp[sp.length - 1];
      ink.rings(e[0], e[1], hr * 0.08, [YEL, ORANGE, INK], { rot: t * sx });
    }
    // fin ears with ribs
    for (const sx of [-1, 1]) {
      ink.draw([P(sx * 0.7, -0.12), P(sx * 1.06, -0.3), P(sx * 0.98, -0.06), P(sx * 1.1, 0.12), P(sx * 0.94, 0.24), P(sx * 0.7, 0.3)], { fill: BLUED, closed: true, w: 2 });
      for (let k = 0; k < 3; k++) ink.line(...P(sx * 0.72, 0.02 + k * 0.1), ...P(sx * (1 - k * 0.03), -0.18 + k * 0.16), { w: 1.2, c: BLUE });
    }
    ink.ell(gx, gy, hr * 0.8, hr, { fill: BLUE, w: 2.8, rot });
    g.save(); ink.clipEll(gx, gy, hr * 0.8, hr, rot)(); g.clip();
    ink.stip(gx, gy, hr * 0.8, hr, { seed: 5, dens: 0.6, c: BLUED, s: 1.6 });
    g.restore();
    // forehead folds
    ink.arc(...P(0, -0.5), hr * 0.3, hr * 0.07, Math.PI + 0.35, TAU - 0.35, { w: 1.4, alpha: 0.55, rot });
    ink.arc(...P(0, -0.6), hr * 0.2, hr * 0.05, Math.PI + 0.4, TAU - 0.4, { w: 1.2, alpha: 0.45, rot });
    // cheeks
    for (const sx of [-1, 1]) ink.ell(...P(sx * 0.46, 0.24), hr * 0.14, hr * 0.08, { fill: PINK, w: 0, alpha: 0.75, rot });
    // eyes under heavy lids, brows
    const blink = closed || (t % 5.3) < 0.2, [lx, ly] = look;
    for (const sx of [-1, 1]) {
      const [ex, ey] = P(sx * 0.33, -0.06), r = hr * 0.2;
      eye(ink, ex, ey, r, lx - ex, ly - ey, blink);
      if (!blink) {
        const lid = ellPts(ex, ey, r * 1.04, r * 0.88, 0, 0, 0, Math.PI + 0.42, TAU - 0.42, false);
        lid.push([ex, ey - r * 0.28]);
        ink.draw(lid, { fill: BLUE, closed: true, w: 2 });
      }
      ink.draw([P(sx * 0.16, -0.32 - (blink ? 0 : 0.02)), P(sx * 0.32, -0.38), P(sx * 0.5, -0.33)], { w: 4 });
    }
    // nose: bridge and two nostrils
    ink.draw([P(-0.02, 0.06), P(0.03, 0.2), P(0.0, 0.26)], { w: 1.6, alpha: 0.8 });
    ink.dot(...P(-0.06, 0.28), hr * 0.02, INK); ink.dot(...P(0.07, 0.28), hr * 0.02, INK);
    // mouth
    // talk: true animates the mouth, a number (0..1) sets how wide it opens
    const open = typeof talk === 'number' ? (talk > 0.04 ? 0.02 + talk * 0.11 : 0) : talk ? 0.05 + 0.05 * abs(sin(t * 2.6)) : 0;
    if (open) {
      const [mx, my] = P(0, 0.48);
      ink.ell(mx, my, hr * 0.15, hr * open, { fill: MAROON, w: 2.2, rot });
      g.save(); ink.clipEll(mx, my, hr * 0.15, hr * open, rot)(); g.clip();
      ink.ell(mx, my + hr * open * 0.9, hr * 0.09, hr * 0.05, { fill: PINK, w: 1.2 });
      g.restore();
    } else {
      ink.draw([P(-0.22, 0.42), P(-0.1, 0.5), P(0.08, 0.5), P(0.22, 0.41)], { w: 2.4 });
      ink.line(...P(-0.25, 0.39), ...P(-0.2, 0.45), { w: 1.6 });
      ink.line(...P(0.25, 0.38), ...P(0.2, 0.44), { w: 1.6 });
    }
    ink.arc(...P(0, 0.64), hr * 0.08, hr * 0.03, 0.3, Math.PI - 0.3, { w: 1.3, alpha: 0.6, rot });
  }

  // shoulders, turtleneck collar and neck; (cx, cy) is the centre of the collar
  function giantBody(ink, gx, gy, hr, rot, cx, cy, H) {
    const g = ink.g, top = [gx - 0.72 * hr * sin(rot), gy + 0.72 * hr * cos(rot)];
    const body = [[cx - 1.45 * hr, H + 80], [cx - 1.42 * hr, cy + 0.95 * hr], [cx - 1.28 * hr, cy + 0.42 * hr], [cx - 0.95 * hr, cy + 0.12 * hr],
      [cx - 0.45 * hr, cy], [cx + 0.45 * hr, cy], [cx + 0.95 * hr, cy + 0.12 * hr], [cx + 1.28 * hr, cy + 0.42 * hr], [cx + 1.42 * hr, cy + 0.95 * hr], [cx + 1.45 * hr, H + 80]];
    ink.draw(body, { fill: BLUED, closed: true, w: 2.6 });
    g.save(); ink.path(body, true); g.clip();
    ink.stip(cx + 0.3 * hr, cy + 1.3 * hr, 1.5 * hr, 1.2 * hr, { seed: 4, dens: 0.3, c: INK });
    g.restore();
    for (const sx of [-1, 1]) ink.draw([[cx + sx * 0.92 * hr, cy + 0.14 * hr], [cx + sx * 0.84 * hr, cy + 0.6 * hr], [cx + sx * 0.9 * hr, cy + 1.2 * hr]], { w: 1.4, alpha: 0.7 });
    const orx = 0.5 * hr, ory = 0.15 * hr, irx = 0.3 * hr, iry = 0.07 * hr;
    ink.ell(cx, cy, orx, ory, { fill: YEL, w: 2.4 });
    ink.tube([top, [(top[0] + cx) / 2, (top[1] + cy) / 2], [cx, cy]], () => 0.27 * hr, { fill: BLUE, bands: 0, stip: 0.5, seed: 6, side: 1, w: 2.4 });
    const band = ellPts(cx, cy, orx, ory, 0, 0, 0, 0, Math.PI, false).concat(ellPts(cx, cy - ory * 0.5, irx, iry, 0, 0, 0, Math.PI, 0, false));
    ink.draw(band, { fill: YEL, closed: true, w: 2.2 });
    for (let k = 1; k < 6; k++) { const a = (k / 6) * Math.PI; ink.line(cx + cos(a) * irx, cy - ory * 0.5 + sin(a) * iry, cx + cos(a) * orx * 0.97, cy + sin(a) * ory * 0.95, { w: 1, alpha: 0.6 }); }
    ink.rings(cx + 0.62 * hr, cy + 0.62 * hr, 0.13 * hr, [YEL, ORANGE, YEL, INK], { rot: 0.4 });
  }

  // open hand, palm up, seen from above and in front: wrist on the right, fingers fanning out to
  // the left with their tips lifting, thumb hooked toward the viewer on the index side.
  // (hx, hy) = centre of the palm. Returns where a figure standing in the palm puts its feet.
  const PALM = '#b8d0ec';
  // one finger: a single outline with a rounded tip, knuckle creases and a line of shade underneath
  function digit(ink, sp, rf, creases = [0.36, 0.68]) {
    const n = sp.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const d = dirAt(sp, i), r = rf(i / (n - 1));
      L.push([sp[i][0] - d[1] * r, sp[i][1] + d[0] * r]);
      R.push([sp[i][0] + d[1] * r, sp[i][1] - d[0] * r]);
    }
    const e = sp[n - 1], d = dirAt(sp, n - 1), r = rf(1), a0 = Math.atan2(d[1], d[0]), cap = [];
    for (let k = 1; k < 8; k++) { const a = a0 + Math.PI / 2 - (k / 8) * Math.PI; cap.push([e[0] + cos(a) * r * 1.05, e[1] + sin(a) * r * 1.05]); }
    ink.draw(L.concat(cap, R.slice().reverse()), { fill: PALM, closed: true, w: 2.2 });
    const shade = [];
    for (let i = 1; i < n - 1; i++) { const q = dirAt(sp, i), rr = rf(i / (n - 1)) * 0.52; shade.push([sp[i][0] + q[1] * rr, sp[i][1] - q[0] * rr]); }
    ink.draw(shade, { w: 1.6, c: BLUE });
    for (const u of creases) {
      const i = Math.round(u * (n - 1)), q = dirAt(sp, i), rr = rf(u);
      ink.draw([L[i], [sp[i][0] + q[0] * rr * 0.3, sp[i][1] + q[1] * rr * 0.3], R[i]], { w: 1.2, alpha: 0.75 });
    }
  }

  // open hand, palm up, seen from above and in front: wrist on the right, fingers fanning out to
  // the left with their tips lifting, thumb hooked toward the viewer on the index side.
  // (hx, hy) = centre of the palm. Returns where a figure standing in the palm puts its feet.
  function hand(ink, hx, hy, s, t) {
    const g = ink.g, P = (u, v) => [hx + u * s, hy + v * s];
    const surf = [[54, -13], [55, 7], [32, 16], [4, 19], [-26, 18], [-45, 10], [-52, -2], [-47, -15], [-22, -22], [16, -21]];
    // the edge of the hand, seen as a thick band under the palm
    const side = surf.map(([u, v]) => P(u, v + 9));
    ink.draw(side, { fill: BLUE, closed: true, w: 2.4 });
    g.save(); ink.path(side, true); g.clip();
    ink.stip(...P(0, 22), 62 * s, 12 * s, { seed: 9, dens: 1.3, c: BLUED });
    g.restore();
    // fingers fan out from the far rim: little finger at the back, index at the front
    [[-44, -14, 0.62, 29, 8.5], [-50, -5, 0.3, 37, 9.5], [-51, 5, 0.02, 41, 10], [-43, 13, -0.3, 36, 10]].forEach(([u, v, a, l, w], k) => {
      // roots start under the palm so that it covers them
      digit(ink, spine(...P(u + 10 * cos(a), v + 10 * sin(a)), Math.PI + a, (l + 10) * s, 0.45, 11, 0.04, t, k * 1.7), (q) => (w - q * 2.2) * s, [0.45, 0.72]);
    });
    // the palm itself, drawn over the roots of the fingers, with its creases and the mound of the thumb
    ink.draw(surf.map(([u, v]) => P(u, v)), { fill: PALM, closed: true, w: 2.4 });
    ink.draw([P(-44, -7), P(-28, -12), P(-4, -15)], { w: 1.3, alpha: 0.5 });
    ink.draw([P(-18, -17), P(-10, 0), P(8, 11)], { w: 1.3, alpha: 0.5 });
    // thumb, nearest the viewer: it leaves the palm by its near edge and hooks up at the tip;
    // the mound at its root is filled over the joint so no seam shows
    digit(ink, spine(...P(20, 7), 2.0, 40 * s, 1.35, 11, 0.05, t, 11), (q) => (13 - q * 3.4) * s, [0.66]);
    ink.ell(...P(22, 5), 15 * s, 10 * s, { fill: PALM, w: 0 });
    ink.arc(...P(24, 5), 18 * s, 9 * s, Math.PI * 1.02, Math.PI * 1.72, { w: 1.3, c: BLUE });
    return P(-8, -3);
  }

  // blue sleeve up to a yellow cuff at the wrist; pts run from the elbow to the wrist
  function sleeve(ink, pts, r0, r1, seed) {
    ink.tube(pts, (u) => r0 + (r1 - r0) * u, { fill: BLUED, bands: 0, stip: 0.5, seed, side: -1, w: 2.4 });
  }
  function cuff(ink, pts, r) {
    const n = pts.length, e = pts[n - 1], [dx, dy] = dirAt(pts, n - 1), R = r * 1.1;
    const at = (a, b) => [e[0] + dx * a - dy * b, e[1] + dy * a + dx * b];
    ink.draw([at(-r * 0.7, -R), at(r * 0.15, -R), at(r * 0.15, R), at(-r * 0.7, R)], { fill: YEL, closed: true, w: 2.2, sharp: true });
    ink.line(...at(-r * 0.28, -R), ...at(-r * 0.28, R), { w: 1, alpha: 0.6 });
  }

  function bubble(ink, x, y, lines, tx, ty, size) {
    const g = ink.g, w = size * 5.6, h = size * (lines.length * 1.15 + 0.9);
    ink.draw([[x + w * 0.35, y + h * 0.4], [tx, ty], [x + w * 0.55, y + h * 0.42]], { fill: WHITE, closed: true, w: 2 });
    ink.ell(x + w / 2, y + h / 2, w * 0.56, h * 0.62, { fill: WHITE, w: 2.2, wob: 0.03 });
    g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${size}px "Patrick Hand SC", "Comic Sans MS", cursive`;
    lines.forEach((l, i) => g.fillText(l, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * size * 1.1));
  }

  /* ==========================================================================
     Scenes
     ========================================================================== */
  const SC = {};

  // Hero print: red field, black ship, the blue giant holding a tiny human, a tangle of tentacles
  SC.planet = (api) => (t) => {
    const { ink, W, H } = api;
    field(api, RED);
    ink.dots(180, 3, 0, 0, W, H * 0.75, { c: WHITE, r: 1.4, alpha: 0.85 });
    const R = rng(12);
    for (let k = 0; k < 12; k++) { const x = R() * W, y = R() * H * 0.7, s = 4 + R() * 5; ink.line(x - s, y, x + s, y, { w: 1.2, c: WHITE }); ink.line(x, y - s, x, y + s, { w: 1.2, c: WHITE }); }
    streaks(api, t, 30, 7, { scale: 1.6 });

    [[110, 250, 48, [YEL, ORANGE, GREEN, YEL, ORANGE, INK]], [255, 390, 24, [ORANGE, YEL, INK]], [735, 330, 30, [GREEN, YEL, ORANGE, INK]]]
      .forEach(([x, y, r, cols], i) => ink.rings(x + sin(t * 0.4 + i) * 6, y + cos(t * 0.5 + i) * 8, r, cols, { rot: t * (0.5 + i * 0.2) }));
    for (let i = 0; i < 6; i++) {
      const x = 60 + i * 130 + sin(i * 7) * 30, y = 480 + sin(t * 0.6 + i) * 14 + (i % 2) * 70, r = 9 + (i % 3) * 5;
      ink.ell(x, y, r, r, { fill: MAROON, w: 1.6 });
      ink.arc(x - r * 0.25, y - r * 0.25, r * 0.5, r * 0.5, Math.PI * 1.05, Math.PI * 1.5, { w: 1.4, c: WHITE });
      ink.dot(x + r * 0.2, y + r * 0.1, r * 0.25, INK);
    }

    ship(ink, 440 + sin(t * 0.18) * 24, 70 + sin(t * 0.4) * 8, 0.95, t);

    // the giant
    const gx = 600, gy = 500 + sin(t * 0.5) * 5, hr = 145, rot = -0.14;
    giantBody(ink, gx, gy, hr, rot, 612, 700, H);
    const look = api.mouse() || [340 + sin(t * 0.3) * 30, 720];
    giantHead(ink, gx, gy, hr, t, look, rot, true);
    // forearm rising from below in its sleeve, then the open hand with the Earthling on it
    const hx = 360, hy = 800 + sin(t * 0.5 + 1) * 4, hs = 1.6;
    const arm = [[hx + 190, H + 40], [hx + 160, 930], [hx + 120, hy + 40], [hx + 62 * hs, hy + 2]];
    sleeve(ink, arm, 50, 30, 44);
    const [fx, fy] = hand(ink, hx, hy, hs, t);
    cuff(ink, arm, 30);
    human(ink, fx, fy, 5.4, { wave: t * 5, suit: RED, trim: YEL });

    // foreground tangle of ringed tentacles
    const roots = [[-20, -1.1, 330, 0.9], [90, -1.35, 420, -0.6], [210, -1.2, 250, 1.4], [320, -1.5, 190, -1.8], [760, -2.0, 280, -0.8], [830, -2.3, 360, 1.0]];
    roots.forEach(([x, a, len, curl], i) => {
      const sp = spine(x, H + 30, a, len, curl, 18, 0.05, t, i);
      ink.tube(sp, (u) => 34 * Math.pow(1 - u, 0.85) + 4, { bands: 1, seed: 60 + i, claw: i % 2 === 0, side: i % 2 ? 1 : -1 });
    });
    // eye-stalk critter
    const cx = 170, cy = 930;
    for (let k = 0; k < 3; k++) {
      const sp = spine(cx - 20 + k * 20, cy - 20, -1.9 + k * 0.4, 70, 0.6 - k * 0.6, 10, 0.08, t, k * 2);
      ink.tube(sp, (u) => 6 - u * 3, { bands: 1, seed: 80 + k, stip: 0.5 });
      const e = sp[sp.length - 1];
      eye(ink, e[0], e[1], 12, look[0] - e[0], look[1] - e[1], ((t + k) % 4.3) < 0.15);
    }
    ink.ell(cx, cy, 58, 40, { fill: WHITE, w: 2.4 });
    ink.g.save(); ink.clipEll(cx, cy, 58, 40)(); ink.g.clip(); ink.stip(cx, cy, 58, 40, { seed: 3, dens: 1.1 }); ink.g.restore();
    ink.draw([[cx - 30, cy + 10], [cx, cy + 20], [cx + 30, cy + 8]], { w: 2 });
    streaks(api, t, 3, 99, { scale: 2.2, speed: 1.3 });
    bubble(ink, 80, 530, ['BIENVENUE,', 'TERRIEN !'], fx - 10, fy - 96, 30);
  };

  // I · Patrimind: slug with a stalk eye, reading pages and threading them to their source
  SC.reader = (api) => (t) => {
    const { ink } = api;
    field(api, YEL);
    ground(ink);
    const active = floor(t / 1.6) % 3;
    const pages = [0, 1, 2].map((i) => ({ x: 248 + i * 34 - (i === 1 ? 20 : 0), y: 40 + i * 62 + sin(t * 1.2 + i) * 6, i }));
    pages.forEach((p) => {
      ink.draw([[p.x, p.y], [p.x + 64, p.y + 4], [p.x + 62, p.y + 50], [p.x - 2, p.y + 46]], { fill: WHITE, closed: true, w: 2, sharp: true });
      ink.draw([[p.x + 50, p.y + 3], [p.x + 64, p.y + 4], [p.x + 63, p.y + 16]], { fill: '#e2dccd', closed: true, w: 1.4, sharp: true });
      for (let k = 0; k < 4; k++) ink.line(p.x + 8, p.y + 12 + k * 8, p.x + 50 - (k % 2) * 14, p.y + 13 + k * 8, { w: 1.2, c: p.i === active && k === 1 ? RED : INK });
    });
    const ap = pages[active];
    ink.draw([[ap.x + 50, ap.y + 21], [356, ap.y + 60], [362, 232]], { w: 1.8, c: RED });
    ink.rings(362, 244, 14, [RED, WHITE, RED], { rot: t });
    const body = []; for (let i = 0; i < 16; i++) { const u = i / 15; body.push([34 + 170 * u, 240 - sin(u * Math.PI) * 26]); }
    for (let k = 0; k < 6; k++) ink.draw([[52 + k * 28, 250], [46 + k * 28 + sin(t * 4 + k) * 3, 262]], { w: 3.2 });
    ink.tube(body, (u) => 4 + 30 * Math.pow(sin(Math.PI * u), 0.7), { bands: 1, seed: 7, side: 1 });
    const ex = 190 + sin(t * 0.8) * 8, ey = 92 + cos(t * 1.1) * 6, st = [];
    for (let k = 0; k <= 12; k++) { const u = k / 12, v = 1 - u; st.push([v * v * 150 + 2 * v * u * 150 + u * u * ex, v * v * 214 + 2 * v * u * 120 + u * u * ey]); }
    ink.tube(st, (u) => 7 - u * 3, { bands: 1, seed: 8, stip: 0.5 });
    eye(ink, ex, ey, 22, ap.x + 30 - ex, ap.y + 22 - ey, (t % 3.7) < 0.15);
  };

  // II · Tamis: a sieve jellyfish
  SC.sieve = (api) => {
    const parts = [];
    let lt = 0;
    return (t) => {
      const { ink, g } = api;
      const dt = min(0.2, t - lt || 0.1); lt = t;
      field(api, LILAC);
      ground(ink);
      ink.ell(200, 262, 50, 10, { fill: WHITE, w: 2 });
      const cx = 200, cy = 112 + sin(t * 1.2) * 6, rx = 96, ry = 64;
      for (let i = 0; i < 8; i++) {
        const sp = spine(cx - 72 + i * 20, cy + 6, Math.PI / 2 + (i - 3.5) * 0.04, 120 + (i % 3) * 16, 0, 12, 0.35, t * 2, i);
        ink.tube(sp, (u) => 4 - u * 2.6, { bands: 2, stip: 0.4, seed: 30 + i });
      }
      const bell = ellPts(cx, cy, rx, ry, 0, 0, 0, Math.PI, TAU, false);
      for (let k = 0; k <= 10; k++) bell.push([cx + rx - (k * 2 * rx) / 10, cy + (k % 2 ? 10 : 2)]);
      ink.draw(bell, { fill: WHITE, closed: true, w: 0 });
      g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, Math.PI, TAU); g.closePath(); g.clip();
      ink.stip(cx, cy, rx, ry, { seed: 2, dens: 0.9 });
      for (let x = cx - rx; x < cx + rx; x += 12) ink.line(x, cy - ry, x, cy, { w: 1, alpha: 0.6 });
      for (let y = cy - ry + 8; y < cy; y += 12) ink.line(cx - rx, y, cx + rx, y, { w: 1, alpha: 0.6 });
      g.restore();
      ink.draw(bell, { closed: true, w: 2.6 });
      eye(ink, cx - 26, cy - 28, 10, 0, 20, (t % 4.4) < 0.15);
      eye(ink, cx + 26, cy - 28, 10, 0, 20, (t % 4.4) < 0.15);
      if (!RM && parts.length < 60) parts.push({ x: cx - 84 + Math.random() * 168, y: -6, big: Math.random() < 0.55, vy: 30, life: 1, stuck: false });
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i], top = cy - ry * sqrt(max(0, 1 - ((p.x - cx) / rx) ** 2));
        if (p.stuck) { p.life -= dt * 0.6; p.x += Math.sign(p.x - cx || 1) * dt * 14; p.y = cy - ry * sqrt(max(0, 1 - ((p.x - cx) / rx) ** 2)) - 5; }
        else { p.vy += dt * 70; p.y += p.vy * dt; if (p.big && abs(p.x - cx) < rx - 4 && p.y > top - 5) p.stuck = true; }
        if (p.life <= 0 || p.y > 258) { parts.splice(i, 1); continue; }
        if (p.big) ink.ell(p.x, p.y, 5, 5, { fill: WHITE, w: 1.4, alpha: max(0, p.life) });
        else { ink.dot(p.x, p.y, 3, INK); ink.dot(p.x, p.y, 2, YEL); }
      }
      ink.dots(10, 4, 170, 254, 60, 6, { c: YEL, r: 2.6, alpha: 1 });
    };
  };

  // III · Kynna: a talking flower with a concentric heart
  SC.bloom = (api) => (t) => {
    const { ink } = api;
    field(api, RED);
    ground(ink);
    const sway = sin(t * 0.9) * 8, cx = 200 + sway, cy = 124;
    ink.tube([[200, 264], [197, 226], [203 + sway * 0.5, 188], [cx, cy + 34]], (u) => 7 - u * 2, { bands: 1, seed: 3, stip: 0.8 });
    for (const [x, y, a] of [[198, 226, -2.6], [202, 200, -0.4]]) {
      const sp = spine(x, y, a, 58, a < -1 ? -1.5 : 1.5, 10);
      ink.tube(sp, (u) => 12 * sin(Math.PI * max(0.05, u)) + 1, { bands: 2, seed: 9 + x, stip: 0.8 });
    }
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 5 + sin(t * 0.3) * 0.1, open = 0.82 + 0.18 * sin(t * 1.3 + i);
      const bx = cx + cos(a) * 76 * open, by = cy + sin(a) * 60 * open;
      ink.line(cx + cos(a) * 34, cy + sin(a) * 30, bx - cos(a) * 24, by - sin(a) * 14, { w: 2 });
      ink.ell(bx, by, 32 * open, 20 * open, { fill: WHITE, w: 2, wob: 0.04 });
      const hot = floor(t * 5 + i) % 3;
      for (let k = 0; k < 3; k++) ink.line(bx - 18 * open, by - 7 * open + k * 7 * open, bx + (k === hot ? 18 : 6) * open, by - 7 * open + k * 7 * open, { w: 1.6 });
    }
    ink.rings(cx, cy, 36, [YEL, ORANGE, GREEN, YEL, ORANGE, INK], { rot: t * 0.8 });
  };

  // IV · PodDrafts: an eight-armed card dealer
  SC.octo = (api) => (t) => {
    const { ink } = api;
    field(api, BLUE);
    ground(ink);
    const cx = 200, cy = 100 + sin(t) * 5, tips = [];
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * 0.08 + (i * Math.PI * 0.84) / 7;
      const sp = spine(cx + cos(a) * 30, cy + 20 + sin(a) * 20, a, 150, (i < 4 ? -1 : 1) * 0.8, 14, 0.12, t * 2, i);
      ink.tube(sp, (u) => 11 * (1 - u) + 2, { bands: 1, seed: 40 + i, claw: i % 2 === 0, side: i < 4 ? 1 : -1 });
      tips.push(sp[sp.length - 1]);
    }
    const shift = t * 0.7, k0 = floor(shift), fr = shift - k0, e = fr < 0.55 ? 0 : (fr - 0.55) / 0.45, s = e * e * (3 - 2 * e);
    for (let j = 0; j < 8; j++) {
      const a = tips[(j + k0) % 8], b = tips[(j + k0 + 1) % 8];
      const x = a[0] + (b[0] - a[0]) * s, y = a[1] + (b[1] - a[1]) * s - 8, r = sin(t + j) * 0.2;
      const R2 = ([u, v]) => [x + u * cos(r) - v * sin(r), y + u * sin(r) + v * cos(r)];
      ink.draw([[-9, -12], [9, -12], [9, 12], [-9, 12]].map(R2), { fill: MANA[j % 5], closed: true, w: 1.8, sharp: true });
      ink.draw([[-5.5, -8], [5.5, -8], [5.5, 2], [-5.5, 2]].map(R2), { fill: WHITE, closed: true, w: 1, sharp: true });
    }
    ink.ell(cx, cy, 62, 50, { fill: WHITE, wob: 0.05, ws: t * 0.5, w: 2.6 });
    ink.g.save(); ink.clipEll(cx, cy, 62, 50)(); ink.g.clip(); ink.stip(cx, cy, 62, 50, { seed: 6, dens: 1 }); ink.g.restore();
    ink.dots(9, 5, cx - 50, cy - 40, 100, 30, { r: 4, alpha: 1 });
    const la = tips[(k0 + 3) % 8];
    eye(ink, cx - 23, cy + 2, 16, la[0] - cx, la[1] - cy, (t % 4.9) < 0.15);
    eye(ink, cx + 23, cy + 2, 16, la[0] - cx, la[1] - cy, (t % 4.9) < 0.15);
    ink.draw([[cx - 12, cy + 26], [cx, cy + 32], [cx + 12, cy + 25]], { w: 2.2 });
  };

  // V · MTG Meta History: a tree whose trunk shows the strata of the metagame
  SC.strata = (api) => (t) => {
    const { ink, g } = api;
    field(api, YEL);
    ground(ink);
    const trunk = [[164, 264], [180, 196], [172, 132], [188, 96], [212, 96], [228, 132], [220, 196], [238, 264]];
    ink.draw(trunk, { fill: WHITE, closed: true, w: 0 });
    g.save(); ink.path(trunk, true); g.clip();
    for (let b = 0; b < 12; b++) {
      const y = 264 - ((b * 16 + t * 7) % 192);
      g.fillStyle = MANA[b % 5]; g.fillRect(150, y - 10, 100, 11);
      ink.line(150, y - 10, 250, y - 10, { w: 1 });
    }
    ink.stip(200, 180, 50, 90, { seed: 11, dens: 0.8 });
    g.restore();
    ink.draw(trunk, { closed: true, w: 2.6 });
    const tips = [[108, 66], [150, 40], [252, 40], [294, 70], [200, 26]];
    tips.forEach(([x, y], i) => {
      ink.tube([[200, 102], [(200 + x) / 2, (102 + y) / 2 + 12], [x, y]], (u) => 7 - u * 3, { bands: 1, seed: 50 + i, stip: 0.6 });
      ink.ell(x, y, 30, 20, { fill: WHITE, w: 2, wob: 0.08, ws: i });
      g.save(); ink.clipEll(x, y, 30, 20)(); g.clip(); ink.stip(x, y, 30, 20, { seed: 20 + i }); g.restore();
    });
    tips.forEach(([x, y], i) => {
      const a = sin(t * 1.5 + i) * 0.3, fx = x + sin(a) * 30, fy = y + 14 + cos(a) * 30;
      ink.line(x, y + 12, fx, fy, { w: 1.2 });
      ink.rings(fx, fy, 10, [MANA[i], WHITE, MANA[i]], { rot: t });
    });
  };

  // VI · PicSQL: beetle with a pixel shell
  SC.beetle = (api) => (t) => {
    const { ink, g } = api;
    field(api, GREEN);
    ground(ink);
    const cx = 200, cy = 170, pal = [RED, YEL, BLUED, ORANGE, WHITE, INK, BLUE];
    for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
      const hx = cx + side * 52, hy = cy - 22 + k * 24, ph = t * 7 + k * 2 + (side > 0 ? Math.PI : 0);
      const kx = hx + side * 36, ky = hy - 12 + sin(ph) * 5;
      ink.draw([[hx, hy], [kx, ky], [hx + side * 48 + sin(ph) * 5, 258]], { w: 4.2 });
      ink.dot(kx, ky, 3.4, INK);
    }
    ink.tube(spine(cx - 12, cy - 92, -2.0, 60, -1.2, 10, 0.1, t * 3, 1), (u) => 3 - u * 1.5, { bands: 1, stip: 0 });
    ink.tube(spine(cx + 12, cy - 92, -1.15, 60, 1.2, 10, 0.1, t * 3, 2), (u) => 3 - u * 1.5, { bands: 1, stip: 0 });
    ink.ell(cx, cy - 80, 32, 22, { fill: WHITE, w: 2.2 });
    g.save(); ink.clipEll(cx, cy - 80, 32, 22)(); g.clip(); ink.stip(cx, cy - 80, 32, 22, { seed: 8, dens: 1.2 }); g.restore();
    ink.dot(cx - 12, cy - 84, 3.4, RED); ink.dot(cx + 12, cy - 84, 3.4, RED);
    ink.ell(cx, cy, 82, 66, { fill: WHITE, w: 0 });
    g.save(); g.beginPath(); g.ellipse(cx, cy, 80, 64, 0, 0, TAU); g.clip();
    const f = floor(t * 4);
    for (let i = 0; i < 11; i++) for (let j = 0; j < 9; j++) { g.fillStyle = pal[(f + i * 3 + j * 5 + ((i * j) % 4)) % pal.length]; g.fillRect(cx - 88 + i * 16, cy - 72 + j * 16, 16, 16); }
    for (let i = 1; i < 11; i++) ink.line(cx - 88 + i * 16, cy - 70, cx - 88 + i * 16, cy + 70, { w: 1.2 });
    for (let j = 1; j < 9; j++) ink.line(cx - 90, cy - 72 + j * 16, cx + 90, cy - 72 + j * 16, { w: 1.2 });
    g.restore();
    ink.line(cx, cy - 66, cx, cy + 66, { w: 2.4 });
    ink.ell(cx, cy, 82, 66, { w: 3 });
  };

  // VII · Unity sandbox: a black tripod razing a little town
  SC.tripod = (api) => (t) => {
    const { ink } = api;
    field(api, RED);
    streaks(api, t, 10, 3);
    ground(ink);
    const cyc = (t * 0.7) % 10, fallen = floor(cyc);
    for (let i = 0; i < 8; i++) {
      const hx = 44 + i * 44;
      if (i < fallen) {
        ink.draw([[hx - 13, 262], [hx - 9, 254], [hx - 4, 250], [hx + 1, 256], [hx + 7, 253], [hx + 13, 262]], { fill: WHITE, closed: true, w: 1.6, sharp: true });
        const puff = (t * 20 + i * 13) % 50;
        ink.ell(hx, 244 - puff, 7 + puff * 0.18, 6 + puff * 0.14, { fill: WHITE, w: 1.2, alpha: max(0, 1 - puff / 50) });
      } else {
        ink.draw([[hx - 11, 262], [hx - 11, 246], [hx + 11, 246], [hx + 11, 262]], { fill: WHITE, closed: true, w: 1.8, sharp: true });
        ink.draw([[hx - 14, 247], [hx, 233], [hx + 14, 247]], { fill: INK, closed: true, w: 1.6, sharp: true });
        ink.draw([[hx - 4, 254], [hx + 1, 254], [hx + 1, 262], [hx - 4, 262]], { fill: INK, closed: true, w: 0, sharp: true });
        ink.draw([[hx + 4, 250], [hx + 8, 250], [hx + 8, 254], [hx + 4, 254]], { fill: YEL, closed: true, w: 1, sharp: true });
      }
    }
    const wx = 60 + cyc * 32, wy = 90 + sin(t * 3) * 3;
    for (let k = 0; k < 3; k++) {
      const fx = wx + (k - 1) * 58 + sin(t * 3 + k * 2) * 10, kx = (wx + fx) / 2 + (k - 1) * 12, ky = wy + 64 - abs(sin(t * 3 + k * 2)) * 14;
      ink.tube([[wx + (k - 1) * 14, wy + 12], [kx, ky], [fx, 262]], (u) => 5 - u * 2.5, { fill: INK, bands: 0, stip: 0, w: 1.6 });
    }
    const target = 44 + fallen * 44;
    if (fallen < 8 && floor(t * 10) % 3) {
      const g = api.g;
      g.strokeStyle = YEL; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(wx, wy + 12); g.lineTo(target, 248); g.stroke();
      g.strokeStyle = WHITE; g.lineWidth = 2; g.stroke();
      ink.rings(target, 248, 11, [YEL, WHITE, YEL]);
    }
    ink.ell(wx, wy, 40, 22, { fill: INK, w: 2 });
    ink.rings(wx - 12, wy - 2, 9, [YEL, '#f7d765', YEL], { rot: t });
    ink.rings(wx + 14, wy + 2, 7, [YEL, '#f7d765'], { rot: -t });
    ink.draw([[wx - 40, wy], [wx - 60, wy - 22], [wx - 30, wy - 8]], { fill: INK, closed: true, w: 1.4 });
  };

  // VIII · Cardwright: a scribe bird drawing a card
  SC.quill = (api) => {
    const path = [];
    for (let i = 0; i <= 140; i++) { const a = (i / 140) * TAU * 2.4, r = 3 + i * 0.26; path.push([286 + cos(a) * r, 150 + sin(a) * r * 1.15]); }
    return (t) => {
      const { ink, g } = api;
      field(api, LILAC);
      ground(ink);
      ink.draw([[228, 66], [346, 69], [343, 248], [225, 245]], { fill: WHITE, closed: true, w: 2.4, sharp: true });
      ink.draw([[236, 94], [336, 96], [334, 208], [234, 206]], { closed: true, w: 1.4, sharp: true });
      ink.rings(241, 80, 9, [BLUED, WHITE, BLUED]);
      ink.line(256, 80, 326, 81, { w: 1.4 });
      ink.line(262, 228, 312, 228, { w: 1.4 });
      const prog = min(1, (t * 0.22) % 1.25), n = max(2, floor(prog * path.length));
      ink.draw(path.slice(0, n), { w: 2.4, c: RED });
      const tip = path[min(n, path.length - 1)];
      const hx = 168 + (tip[0] - 286) * 0.2, hy = 112 + (tip[1] - 150) * 0.25;
      for (const [fx, kx] of [[112, 118], [140, 137]]) {
        ink.draw([[fx, 261], [kx - 3, 238], [kx, 214]], { w: 3 });
        ink.line(fx, 261, fx + 10, 262, { w: 2.4 }); ink.line(fx, 261, fx - 7, 262, { w: 2.4 }); ink.line(fx, 261, fx + 6, 257, { w: 2 });
      }
      for (let k = 0; k < 3; k++) ink.draw([[80, 176], [34 - k * 6, 150 + k * 18], [28 - k * 4, 176 + k * 16]], { fill: INK, closed: true, w: 1.4 });
      ink.ell(122, 184, 54, 36, { fill: WHITE, w: 2.4, rot: -0.2 });
      g.save(); ink.clipEll(122, 184, 54, 36, -0.2)(); g.clip(); ink.stip(122, 184, 54, 36, { seed: 12, dens: 1.1 }); g.restore();
      const flap = sin(t * 2) * 3;
      ink.draw([[88, 180], [112, 166 - flap], [146, 170 - flap], [156, 184], [134, 198], [100, 198]], { fill: WHITE, closed: true, w: 2 });
      for (let k = 0; k < 3; k++) ink.draw([[98 + k * 4, 184 + k * 4], [120 + k * 3, 180 + k * 5 - flap * 0.5], [146 - k * 4, 180 + k * 4]], { w: 1.2, alpha: 0.8 });
      ink.draw([[88, 180], [72, 196], [100, 198]], { fill: INK, closed: true, w: 1.4 });
      ink.tube([[150, 166], [(150 + hx) / 2 + 6, (166 + hy) / 2 + 8], [hx - 6, hy + 10]], (u) => 8 - u * 2, { bands: 1, seed: 13, stip: 0.7 });
      ink.ell(hx, hy, 17, 15, { fill: WHITE, w: 2.2 });
      g.save(); ink.clipEll(hx, hy, 17, 15)(); g.clip(); ink.stip(hx, hy, 17, 15, { seed: 14 }); g.restore();
      eye(ink, hx - 2, hy - 3, 7, tip[0] - hx, tip[1] - hy, (t % 3.3) < 0.12);
      ink.draw([[hx + 12, hy - 5], [tip[0], tip[1]], [hx + 12, hy + 5]], { fill: INK, closed: true, w: 1.4 });
    };
  };

  // Perry Rhodan: an engraved sphere ship over a strange world
  SC.sphereship = (api) => (t) => {
    const { ink, g, W, H } = api;
    field(api, RED);
    ink.dots(120, 31, 0, 0, W, H * 0.7, { c: WHITE, r: 1.3, alpha: 0.85 });
    streaks(api, t, 14, 5);
    ink.rings(70, 70, 26, [YEL, ORANGE, GREEN, INK], { rot: t * 0.5 });
    ink.ell(200, 700, 340, 340, { fill: WHITE, w: 0 });
    g.save(); ink.clipEll(200, 700, 340, 340)(); g.clip(); ink.stip(200, 700, 340, 340, { seed: 17, dens: 0.35 }); g.restore();
    ink.ell(200, 700, 340, 340, { w: 2.6 });
    [[40, 372, -1.7, 70, 1.2], [340, 372, -1.4, 60, -1.4], [300, 378, -1.9, 40, 1]].forEach(([x, y, a, l, c], i) => ink.tube(spine(x, y, a, l, c, 10, 0.08, t, i), (u) => 7 * (1 - u) + 2, { bands: 1, seed: 70 + i, claw: true }));

    const cx = 200, cy = 170 + sin(t * 0.8) * 6, r = 92;
    for (let k = 0; k < 3; k++) {
      const a = Math.PI * (0.3 + k * 0.2);
      ink.tube([[cx + cos(a) * r * 0.7, cy + r * 0.66], [cx + cos(a) * r * 1.06, cy + r * 1.28]], (u) => 4 - u, { fill: INK, bands: 0, stip: 0, w: 1.4 });
      ink.ell(cx + cos(a) * r * 1.06, cy + r * 1.3, 10, 3.5, { fill: INK, w: 1 });
    }
    for (let k = 0; k < 3; k++) { const u = (t * 0.5 + k / 3) % 1; ink.ell(cx, cy + r * 1.4 + u * 60, 20 + u * 30, 4 + u * 6, { w: 1.6, c: YEL, alpha: 1 - u }); }
    ink.arc(cx, cy, r * 1.24, r * 0.22, Math.PI, TAU, { w: 2.4 });
    ink.ell(cx, cy, r, r, { fill: WHITE, w: 0 });
    g.save(); ink.clipEll(cx, cy, r, r)(); g.clip();
    ink.stip(cx, cy, r, r, { seed: 19, dens: 1.2 });
    for (const lat of [-0.62, -0.32, 0.34, 0.66]) { const yy = cy + lat * r, rr = r * sqrt(1 - lat * lat); ink.arc(cx, yy, rr, rr * 0.18, 0.05, Math.PI - 0.05, { w: 1.2 }); }
    g.restore();
    ink.ell(cx, cy, r, r, { w: 2.8 });
    const band = ellPts(cx, cy, r * 1.24, r * 0.22, 0, 0, 0, 0, Math.PI, false);
    band.push([cx - r * 1.24, cy - 2]);
    ink.draw(band, { fill: WHITE, closed: true, w: 2.6 });
    const on = floor(t * 4);
    for (let k = 0; k < 9; k++) { const a = 0.3 + k * 0.32; ink.rings(cx + cos(a) * r * 1.1, cy + sin(a) * r * 0.15, 5.5, (k + on) % 3 ? [YEL, INK] : [ORANGE, YEL, INK]); }
    ink.arc(cx - r * 0.3, cy - r * 0.4, r * 0.28, r * 0.2, Math.PI * 1.05, Math.PI * 1.5, { w: 3, c: '#fff' });
  };

  // Contact: the giant holding a tiny human who sends a signal
  SC.giant = (api) => (t) => {
    const { ink, W, H } = api;
    field(api, LILAC);
    for (let i = 0; i < 7; i++) {
      const x = 30 + ((i * 97) % 350), y = 30 + ((i * 53) % 150) + sin(t * 0.6 + i) * 8, r = 7 + (i % 3) * 4;
      ink.ell(x, y, r, r, { fill: MAROON, w: 1.4 });
      ink.arc(x - r * 0.25, y - r * 0.25, r * 0.5, r * 0.5, Math.PI * 1.05, Math.PI * 1.5, { w: 1.2, c: WHITE });
    }
    const cx = W * 0.58, cy = H * 0.4, hr = min(W, H) * 0.28, rot = -0.18;
    giantBody(ink, cx, cy, hr, rot, cx + 8, cy + hr * 1.12, H);
    const hx = W * 0.28, hy = H * 0.86 + sin(t * 0.6) * 3, hs = 0.85;
    const look = api.mouse() || [hx, hy - 50];
    giantHead(ink, cx, cy, hr, t, look, rot);
    const arm = [[hx + 100, H + 30], [hx + 80, hy + 34], [hx + 62 * hs, hy + 2]];
    sleeve(ink, arm, 28, 17, 45);
    const [px, py] = hand(ink, hx, hy, hs, t);
    cuff(ink, arm, 17);
    human(ink, px, py, 2.8, { wave: t * 6, suit: RED, trim: YEL });
    // the signal, sent from the raised hand
    const fx = px + 4.4 * 2.8, fy = py - 15.5 * 2.8;
    for (let k = 0; k < 3; k++) { const u = (t * 0.8 + k / 3) % 1, rr = 8 + u * 60; ink.arc(fx, fy, rr, rr, -Math.PI * 0.9, -Math.PI * 0.1, { w: 2, alpha: 1 - u, c: RED }); }
  };

  // Footer strip
  SC.walkers = (api) => (t) => {
    const { ink, W, H } = api;
    field(api, RED);
    streaks(api, t, 18, 21);
    const gy = H - 18;
    ink.line(-10, gy, W + 10, gy, { w: 2 });
    ink.dots(Math.round(W / 6), 9, 0, gy + 3, W, 14, { r: 1, alpha: 0.6 });
    [[0.06, 0.8, -1.4, 1], [0.24, 0.6, -1.8, -1], [0.72, 0.7, -1.3, 1.2], [0.9, 0.9, -1.9, -1]].forEach(([fx, l, a, c], i) =>
      ink.tube(spine(W * fx, gy, a, H * l, c, 12, 0.08, t, i), (u) => 9 * (1 - u) + 2, { bands: 1, seed: 90 + i, claw: i % 2 === 0 }));
    const suits = [YEL, WHITE, BLUE, GREEN];
    for (let i = 0; i < 4; i++) human(ink, ((t * 18 + (i * W) / 4) % (W + 40)) - 20, gy, 2.4, { step: t * 7 + i * 1.7, suit: suits[i], trim: INK });
    ink.rings(W * 0.48 + sin(t * 0.25) * W * 0.2, H * 0.35 + sin(t * 0.6) * 6, min(20, H * 0.18), [YEL, ORANGE, GREEN, INK], { rot: t });
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
  const BASE = { planet: 800, walkers: 800 };

  function setup(cv) {
    const name = cv.dataset.scene, make = SC[name];
    if (!make || cv._ink) return;
    cv._ink = true;
    const api = { cv, g: cv.getContext('2d'), W: 0, H: 0, s: 1, dpr: 1 };
    api.ink = new Ink(api.g);
    api.mouse = () => {
      if (!mouse) return null;
      const r = cv.getBoundingClientRect();
      return [(mouse[0] - r.left) / api.s, (mouse[1] - r.top) / api.s];
    };
    const baseW = BASE[name] || 400;
    const size = () => {
      const cw = cv.clientWidth, ch = cv.clientHeight;
      if (!cw || !ch) return;
      const dpr = min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
      api.dpr = dpr; api.s = cw / baseW; api.W = baseW; api.H = ch / api.s;
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

  // other pages (the synthesizer) register their own scenes with the same pen
  window.OCInk = {
    SC, mount: setup, spine, human, hand, sleeve, cuff, giantHead, giantBody, bubble, field, streaks,
    C: { INK, WHITE, RED, YEL, BLUE, BLUED, LILAC, GREEN, ORANGE, MAROON, PINK },
  };

  function boot() {
    document.querySelectorAll('canvas[data-scene]').forEach(setup);
    if (!RM) requestAnimationFrame(loop);
    // redraw once the lettering font for the speech bubble has arrived
    if (document.fonts && RM) document.fonts.ready.then(() => scenes.forEach((sc) => render(sc, now())));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
