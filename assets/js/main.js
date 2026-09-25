/* Olivier Cavadenti — pixel cosmos
   Sprites, plasma, card art scenes, playable modular synth, armies demo, Cardwright forge.
   Everything is drawn procedurally at low resolution and upscaled with pixelated rendering. */
(() => {
  'use strict';

  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const C = {
    void: hex('#07030f'), magenta: hex('#ff3df2'), cyan: hex('#00f0ff'), acid: hex('#b6ff3b'),
    sun: hex('#ffb13b'), violet: hex('#8a5cff'), rose: hex('#ff5f8f'), white: [245, 238, 255],
  };
  const PSY = ['#ff3df2', '#8a5cff', '#2a1b8f', '#00f0ff', '#b6ff3b', '#ffb13b', '#ff5f8f'];

  function gradientPalette(stops, n) {
    const cols = stops.map(hex);
    const out = [];
    for (let i = 0; i < n; i++) {
      const p = (i / n) * cols.length;
      const a = Math.floor(p) % cols.length;
      const b = (a + 1) % cols.length;
      const f = p - Math.floor(p);
      const s = f * f * (3 - 2 * f);
      out.push([0, 1, 2].map((k) => Math.round(cols[a][k] + (cols[b][k] - cols[a][k]) * s)));
    }
    return out;
  }
  const PSY_PAL = gradientPalette(PSY, 256);
  const psy = (u) => PSY_PAL[((Math.floor(u * 256) % 256) + 256) % 256];
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16);
  const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

  /* ---------- Tiny pixel buffer ---------- */
  class Pix {
    constructor(canvas, w, h) {
      canvas.width = w;
      canvas.height = h;
      this.canvas = canvas;
      this.w = w;
      this.h = h;
      this.ctx = canvas.getContext('2d');
      this.img = this.ctx.createImageData(w, h);
      this.d = this.img.data;
    }
    clear(c) {
      const d = this.d;
      if (!c) { d.fill(0); return; }
      for (let i = 0; i < d.length; i += 4) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
    }
    set(x, y, c, a = 255) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      const i = (y * this.w + x) * 4, d = this.d;
      if (a >= 255) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; return; }
      const f = a / 255;
      d[i] += (c[0] - d[i]) * f; d[i + 1] += (c[1] - d[i + 1]) * f; d[i + 2] += (c[2] - d[i + 2]) * f;
      d[i + 3] = Math.max(d[i + 3], a);
    }
    rect(x, y, w, h, c, a) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a); }
    line(x0, y0, x1, y1, c, a) {
      x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (let n = 0; n < 2000; n++) {
        this.set(x0, y0, c, a);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
    disc(cx, cy, r, c, a) {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.8) this.set(cx + x, cy + y, c, a);
    }
    ellipse(cx, cy, rx, ry, c, a, from = 0, to = TAU) {
      const steps = Math.ceil((rx + ry) * 4);
      for (let i = 0; i <= steps; i++) {
        const t = from + ((to - from) * i) / steps;
        this.set(Math.round(cx + Math.cos(t) * rx), Math.round(cy + Math.sin(t) * ry), c, a);
      }
    }
    fade(k) { const d = this.d; for (let i = 0; i < d.length; i += 4) { d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; } }
    flush() { this.ctx.putImageData(this.img, 0, 0); }
  }

  /* ---------- Animation registry: runs only what is on screen ---------- */
  const anims = [];
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      for (const e of entries) for (const a of anims) if (a.el === e.target) a.visible = e.isIntersecting;
    }, { rootMargin: '120px' })
    : null;

  function animate(el, fps, draw) {
    const a = { el, fps, draw, visible: !io, last: 0 };
    anims.push(a);
    if (io) io.observe(el);
    draw(RM ? 3.2 : 0);
    return a;
  }
  const t0 = performance.now();
  function loop(now) {
    for (const a of anims) {
      if (!a.visible || now - a.last < 1000 / a.fps - 2) continue;
      a.last = now;
      a.draw((now - t0) / 1000);
    }
    requestAnimationFrame(loop);
  }

  /* ==========================================================================
     Sprites
     ========================================================================== */
  const HULL = ['#1c0f33', '#3b2a66', '#6f68a6', '#b3bce0', '#f4f6ff'].map(hex);

  // Spherical starship (a nod to Perry Rhodan's sphere ships) with a blinking equatorial ring.
  function drawKugel(p, S, frame) {
    const ext = Math.max(2, Math.round(S * 0.2));
    const W = p.w, H = p.h;
    const cx = (W - 1) / 2, cy = (H - 1) / 2, r = S / 2;
    p.clear();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = (x - cx) / r, dy = (y - cy) / r, d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        const nz = Math.sqrt(1 - d2);
        const l = Math.max(0, -0.55 * dx - 0.6 * dy + 0.58 * nz);
        let lvl = Math.floor((l * 0.85 + 0.15) * 4 + bayer(x, y) - 0.35);
        if (Math.abs(Math.abs(dy) - 0.5) < 0.06 || Math.abs(Math.abs(dy) - 0.82) < 0.05) lvl -= 1;
        let c = HULL[clamp(lvl, 0, 4)];
        if (S > 16 && Math.abs(dy + 0.28) < 0.06 && Math.abs(dx) < 0.62 && ((x + frame) % 3 === 0)) {
          c = ((x + frame) % 6 === 0) ? C.acid : C.sun;
        }
        if (d2 > 0.86 && dx > 0.1) c = shade(c, 0.6);
        p.set(x, y, c);
      }
    }
    // equatorial ring
    const rw = r + ext;
    const ringTop = Math.round(cy) - (S > 16 ? 1 : 0);
    const rows = S > 16 ? [hex('#c9d0ec'), hex('#4b3a7a'), hex('#231440')] : [hex('#c9d0ec'), hex('#4b3a7a')];
    const lights = [C.cyan, C.magenta, C.acid];
    for (let j = 0; j < rows.length; j++) {
      for (let x = Math.round(cx - rw); x <= Math.round(cx + rw); x++) {
        let c = rows[j];
        if (j === 1 && ((x + frame) % 4 === 0)) c = lights[Math.floor((x + frame) / 4) % 3];
        const edge = Math.abs(x - cx) > rw - 1;
        p.set(x, ringTop + j, edge ? shade(c, 0.6) : c);
      }
    }
    p.flush();
  }

  function drawPlanet(p, t) {
    const W = p.w, H = p.h, cx = W / 2 - 0.5, cy = H / 2 - 0.5, r = 14;
    const rot = t * 0.35, hueShift = t * 0.02;
    p.clear();
    const ring = (front) => {
      for (let a = 0; a < TAU; a += 0.012) {
        const back = Math.sin(a) < 0;
        if (back === front) continue;
        for (const [rr, col] of [[21, 0.62], [22, 0.64], [24, 0.8], [25, 0.82], [26, 0.84]]) {
          const ex = Math.cos(a) * rr, ey = Math.sin(a) * rr * 0.28;
          const x = cx + ex * 0.96 - ey * 0.28, y = cy + ex * 0.28 * 0.96 * 0.9 + ey;
          const c = psy(col + hueShift + (front ? 0 : 0.02));
          p.set(Math.round(x), Math.round(y), back ? shade(c, 0.55) : c);
        }
      }
    };
    ring(false);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = (x - cx) / r, dy = (y - cy) / r, d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        const nz = Math.sqrt(1 - d2);
        const u = Math.atan2(dx, nz) + rot;
        const band = dy * 2.4 + 0.35 * Math.sin(u * 3 + dy * 4) + 0.18 * Math.sin(u * 7 - dy * 3 + t);
        let c = psy(band * 0.18 + hueShift);
        const l = Math.max(0, -0.6 * dx - 0.35 * dy + 0.72 * nz);
        if (l + bayer(x, y) * 0.3 < 0.32) c = shade(c, 0.35);
        else if (l > 0.93) c = [c[0] * 0.6 + 100, c[1] * 0.6 + 100, c[2] * 0.6 + 100];
        p.set(x, y, c);
      }
    }
    ring(true);
    p.flush();
  }

  const ASTRO = {
    pal: { K: '#1b1030', W: '#f2f0ff', G: '#9d97c4', V: '#2a1b5c', C: '#00f0ff', O: '#ff3df2', A: '#b6ff3b' },
    frames: [
      [
        '....KKKKKK....',
        '...KWWWWWWK...',
        '..KWWVVVVWWK..',
        '..KWVCCVVVWK..',
        '..KWVCVVVVWK..',
        '..KWWVVVVWWK..',
        '...KWWWWWWK...',
        '..KKKWWWWKKK..',
        '.KWWKWOOWKWWK.',
        '.KWWKWWWWKWWK.',
        '.KGWKWGGWKWGK.',
        '.KKKKWWWWKKKK.',
        '....KWWWWK....',
        '....KWKKWK....',
        '...KWWK.KWWK..',
        '...KKKK.KKKK..',
      ],
      [
        '....KKKKKK....',
        '...KWWWWWWK...',
        '..KWWVVVVWWK..',
        '..KWVVCCVVWK..',
        '..KWVVCVVVWK..',
        '..KWWVVVVWWK..',
        '...KWWWWWWK.KK',
        '..KKKWWWWKKKWK',
        '.KWWKWAAWKWWK.',
        '.KWWKWWWWKKK..',
        '.KGWKWGGWK....',
        '.KKKKWWWWK....',
        '....KWWWWK....',
        '....KWKKWK....',
        '...KWWK.KWWK..',
        '...KKKK.KKKK..',
      ],
    ],
  };
  function drawAstro(p, frame) {
    const f = ASTRO.frames[frame % 2];
    p.clear();
    f.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') p.set(x + 1, y, hex(ASTRO.pal[ch])); }));
    p.flush();
  }

  function initSprites() {
    for (const cv of $$('canvas.sprite')) {
      const kind = cv.dataset.sprite;
      if (kind === 'kugel' || kind === 'kugel-mini') {
        const S = kind === 'kugel' ? 26 : 12;
        const ext = Math.max(2, Math.round(S * 0.2));
        const p = new Pix(cv, S + 2 * ext + 1, S + 1);
        animate(cv, 8, (t) => drawKugel(p, S, Math.floor(t * 8)));
      } else if (kind === 'planet') {
        const p = new Pix(cv, 64, 48);
        animate(cv, 12, (t) => drawPlanet(p, t));
      } else if (kind === 'astro') {
        const p = new Pix(cv, 16, 16);
        animate(cv, 2, (t) => drawAstro(p, Math.floor(t * 1.5)));
      }
    }
  }

  /* ==========================================================================
     Hero: psychedelic plasma + warp starfield, all in chunky pixels
     ========================================================================== */
  function initCosmos() {
    const cv = $('#cosmos');
    if (!cv) return;
    const SIN = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) SIN[i] = Math.sin((i / 1024) * TAU);
    const fsin = (v) => SIN[((v * 162.97) | 0) & 1023];
    let p, W, H, PXS;
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const stars = Array.from({ length: 260 }, () => ({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random() }));
    const sparks = [];

    function resize() {
      PXS = window.innerWidth < 700 ? 6 : 4;
      W = Math.max(40, Math.ceil(cv.clientWidth / PXS));
      H = Math.max(40, Math.ceil(cv.clientHeight / PXS));
      p = new Pix(cv, W, H);
    }
    resize();
    window.addEventListener('resize', resize);

    const hero = cv.parentElement;
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      mouse.tx = (e.clientX - r.left) / r.width - 0.5;
      mouse.ty = (e.clientY - r.top) / r.height - 0.5;
      if (!RM && sparks.length < 160) {
        const sx = (e.clientX - r.left) / PXS, sy = (e.clientY - r.top) / PXS;
        for (let i = 0; i < 2; i++) sparks.push({ x: sx, y: sy, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2, life: 1, c: psy(Math.random()) });
      }
    });

    let last = 0;
    animate(cv, 30, (t) => {
      const dt = Math.min(0.1, t - last || 0.033); last = t;
      mouse.x += (mouse.tx - mouse.x) * 0.06;
      mouse.y += (mouse.ty - mouse.y) * 0.06;
      const d = p.d, cx = W * 0.62, cy = H * 0.4, horizon = H * 0.58;
      const cyc = t * 0.06;
      // plasma
      for (let y = 0; y < H; y++) {
        const fadeY = y < horizon ? 1 - (y / horizon) * 0.35 : Math.max(0, 1 - (y - horizon) / (H * 0.25));
        for (let x = 0; x < W; x++) {
          const dx = x - cx, dy = y - cy;
          const v = fsin(x * 0.045 + t * 0.6) + fsin(y * 0.06 - t * 0.45) + fsin((x + y) * 0.03 + t * 0.35) + fsin(Math.sqrt(dx * dx + dy * dy) * 0.075 - t * 0.9);
          const c = psy(v * 0.11 + cyc);
          const k = (0.22 + 0.1 * fsin(v * 1.7)) * fadeY + bayer(x, y) * 0.04;
          const i = (y * W + x) * 4;
          d[i] = 7 + c[0] * k; d[i + 1] = 3 + c[1] * k; d[i + 2] = 15 + c[2] * k; d[i + 3] = 255;
        }
      }
      // warp stars
      const scx = W / 2 - mouse.x * W * 0.12, scy = H * 0.42 - mouse.y * H * 0.12;
      for (const s of stars) {
        s.z -= dt * 0.18;
        if (s.z <= 0.02) { s.z = 1; s.x = (Math.random() - 0.5) * 2; s.y = (Math.random() - 0.5) * 2; }
        const k = 0.5 / s.z;
        const x = scx + s.x * k * W * 0.5, y = scy + s.y * k * H * 0.5;
        if (x < 0 || y < 0 || x >= W || y >= H * 0.62) continue;
        const b = clamp(1.2 - s.z, 0.2, 1);
        const c = s.z < 0.25 ? psy(s.x + t * 0.1) : C.white;
        p.set(x, y, c, 255 * b);
        if (s.z < 0.3) p.set(x + (s.x > 0 ? -1 : 1), y + (s.y > 0 ? -1 : 1), c, 120 * b);
      }
      // cursor sparkles
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx; s.y += s.vy; s.vy += 0.03; s.life -= 0.03;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        p.set(s.x, s.y, s.c, 255 * s.life);
      }
      p.flush();
    });
  }

  /* ==========================================================================
     Card art scenes
     ========================================================================== */
  const SCENES = {};

  SCENES.neural = (p) => {
    const layers = [4, 6, 6, 3];
    const nodes = [];
    layers.forEach((n, li) => {
      for (let i = 0; i < n; i++) nodes.push({ li, x: 22 + li * 38, y: Math.round(p.h / 2 + (i - (n - 1) / 2) * (p.h / (n + 1.3))), flash: 0 });
    });
    const byLayer = (li) => nodes.filter((n) => n.li === li);
    const edges = [];
    for (let li = 0; li < layers.length - 1; li++) for (const a of byLayer(li)) for (const b of byLayer(li + 1)) edges.push([a, b]);
    const pulses = [];
    let lt = 0;
    const spawn = (from) => {
      const outs = edges.filter((e) => e[0] === from);
      if (outs.length) pulses.push({ e: outs[(Math.random() * outs.length) | 0], k: 0, hue: Math.random() });
    };
    return (t) => {
      const dt = Math.min(0.1, t - lt || 0.06); lt = t;
      p.clear([6, 3, 16]);
      for (let y = 4; y < p.h; y += 8) for (let x = 4; x < p.w; x += 8) p.set(x, y, [34, 22, 64]);
      for (const [a, b] of edges) p.line(a.x, a.y, b.x, b.y, [70, 46, 130], 70);
      if (Math.random() < 0.35 || pulses.length < 3) spawn(byLayer(0)[(Math.random() * layers[0]) | 0]);
      for (let i = pulses.length - 1; i >= 0; i--) {
        const q = pulses[i];
        q.k += dt * 1.1;
        const [a, b] = q.e;
        if (q.k >= 1) { b.flash = 1; pulses.splice(i, 1); if (Math.random() < 0.8) spawn(b); continue; }
        const x = a.x + (b.x - a.x) * q.k, y = a.y + (b.y - a.y) * q.k;
        const c = psy(q.hue + t * 0.1);
        p.rect(Math.round(x) - 1, Math.round(y) - 1, 3, 3, c);
        p.set(x - (b.x - a.x) * 0.04, y - (b.y - a.y) * 0.04, c, 120);
      }
      for (const n of nodes) {
        n.flash = Math.max(0, n.flash - dt * 2);
        const base = [120, 92, 210];
        const c = n.flash > 0 ? psy(0.55 + n.li * 0.1 + n.flash * 0.2) : base;
        p.disc(n.x, n.y, 3, [20, 12, 40]);
        p.disc(n.x, n.y, 2, c);
        if (n.flash > 0.5) p.ellipse(n.x, n.y, 5, 5, c, 140);
      }
      p.flush();
    };
  };

  SCENES.patrimind = (p) => {
    const lines = [0, 1, 2, 3, 4, 5, 6].map((k) => ({ y: 16 + k * 6, w: 30 - ((k * 7) % 12), key: k === 1 || k === 3 || k === 5 }));
    const chips = [[74, 12, hex('#2d6fae')], [74, 30, hex('#c9a449')], [74, 48, hex('#c4462e')]];
    return (t) => {
      p.clear([8, 5, 20]);
      const beam = 8 + ((t * 16) % 66);
      // document
      p.rect(12, 8, 42, 58, [246, 239, 221]);
      p.rect(46, 8, 8, 8, [8, 5, 20]);
      p.line(46, 8, 53, 15, [180, 170, 150]);
      p.rect(46, 8, 1, 8, [200, 190, 170]); p.rect(46, 15, 8, 1, [200, 190, 170]);
      lines.forEach((l, i) => {
        const lit = l.key && beam > l.y;
        p.rect(17, l.y, l.w, 2, lit ? (i === 3 ? C.sun : C.acid) : [168, 158, 176]);
        if (lit) {
          const chip = chips[(i - 1) / 2];
          const dash = Math.floor(t * 20);
          for (let x = 17 + l.w + 2; x < chip[0]; x++) {
            const y = Math.round(l.y + (chip[1] + 4 - l.y) * ((x - 17 - l.w) / (chip[0] - 17 - l.w)));
            if ((x + dash) % 3) p.set(x, y, psy(i * 0.15 + t * 0.2));
          }
        }
      });
      chips.forEach(([x, y, c], k) => {
        const lit = beam > lines[k * 2 + 1].y;
        p.rect(x, y, 34, 10, lit ? c : shade(c, 0.35));
        p.rect(x + 3, y + 3, 8, 4, lit ? [255, 255, 255] : [90, 90, 110]);
        p.rect(x + 14, y + 3, 16, 1, lit ? [255, 255, 255] : [90, 90, 110]);
        p.rect(x + 14, y + 6, 11, 1, lit ? [255, 255, 255] : [90, 90, 110]);
        if (lit && Math.sin(t * 8 + k) > 0.7) p.set(x + 33, y - 1, C.white);
      });
      // scanning beam
      for (let x = 10; x < 56; x++) { p.set(x, beam, C.cyan, 230); p.set(x, beam - 1, C.cyan, 90); p.set(x, beam + 1, C.cyan, 60); }
      p.flush();
    };
  };

  SCENES.tamis = (p) => {
    const parts = [];
    const cx = 60, sy = 32, rx = 42, ry = 7;
    return (t) => {
      p.clear([5, 16, 11]);
      for (let y = 0; y < p.h; y++) if (y % 2) for (let x = 0; x < p.w; x += 1) if ((x + y) % 7 === 0) p.set(x, y, [10, 30, 20]);
      for (let i = 0; i < 2; i++) {
        const good = Math.random() < 0.3;
        parts.push({ x: cx - 34 + Math.random() * 68, y: -2, vy: 0.3 + Math.random() * 0.4, s: good ? 1 : 2, good, c: good ? C.acid : [120 + Math.random() * 60, 110 + Math.random() * 40, 130 + Math.random() * 50], stuck: 0 });
      }
      // tray
      p.rect(20, 66, 80, 3, [40, 90, 50]);
      p.rect(20, 66, 80, 1, C.acid, 160);
      // back rim
      p.ellipse(cx, sy, rx, ry, hex('#8a5a18'), 255, Math.PI, TAU);
      // mesh
      for (let x = cx - rx + 4; x < cx + rx; x += 4) {
        const h = ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
        p.line(x, sy - h, x, sy + h, [110, 96, 70], 150);
      }
      for (let y = sy - ry + 2; y < sy + ry; y += 3) {
        const w = rx * Math.sqrt(Math.max(0, 1 - ((y - sy) / ry) ** 2));
        p.line(cx - w, y, cx + w, y, [110, 96, 70], 150);
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        if (q.stuck) {
          q.stuck -= 1;
          if (q.stuck <= 0) { parts.splice(i, 1); continue; }
        } else {
          q.vy += 0.06; q.y += q.vy;
          const onSieve = Math.abs(q.y - sy) < 2 && Math.abs(q.x - cx) < rx - 2;
          if (onSieve && !q.good) { q.stuck = 30 + Math.random() * 30; q.y = sy - 2 + Math.random() * 3; q.vy = 0; }
          if (q.y > 64) { q.y = 64 + Math.random(); q.stuck = 40; q.c = psy(Math.random()); }
        }
        const a = q.stuck ? 255 * Math.min(1, q.stuck / 20) : 255;
        p.rect(Math.round(q.x), Math.round(q.y), q.s, q.s, q.c, a);
      }
      // front rim
      p.ellipse(cx, sy, rx, ry, hex('#f7c85a'), 255, 0, Math.PI);
      p.ellipse(cx, sy + 1, rx, ry, hex('#d9962a'), 255, 0, Math.PI);
      p.flush();
    };
  };

  SCENES.kynna = (p) => {
    const cols = [hex('#4fe07a'), hex('#8be05a'), hex('#ffd23b'), hex('#ffb13b'), hex('#ff7a4e'), hex('#ff5a4e')];
    return (t) => {
      p.clear([7, 10, 30]);
      // speech bubble
      p.rect(7, 10, 44, 24, [230, 240, 255]);
      p.rect(6, 11, 1, 22, [230, 240, 255]); p.rect(51, 11, 1, 22, [230, 240, 255]);
      p.line(12, 34, 10, 39, [230, 240, 255]); p.line(13, 34, 11, 39, [230, 240, 255]); p.line(14, 34, 11, 39, [230, 240, 255]);
      const cyc = (t * 0.6) % 1;
      const w1 = Math.min(34, cyc * 120), w2 = clamp(cyc * 120 - 34, 0, 26);
      p.rect(11, 15, w1, 2, [60, 70, 140]);
      p.rect(11, 20, w2, 2, [60, 70, 140]);
      for (let i = 0; i < 3; i++) {
        const b = Math.sin(t * 8 - i) > 0.4 ? 1 : 0;
        p.rect(13 + i * 5, 27 - b, 3, 3, psy(0.05 + i * 0.12 + t * 0.1));
      }
      // bars
      const base = 64;
      for (let i = 0; i < 6; i++) {
        const v = 0.5 + 0.5 * Math.sin(t * 1.1 + i * 1.3) * Math.cos(t * 0.37 + i);
        const h = Math.round(8 + v * 42);
        p.rect(60 + i * 9, base - h, 7, h, cols[i]);
        p.rect(60 + i * 9, base - h, 7, 1, [255, 255, 255], 170);
      }
      p.rect(58, base, 58, 1, [120, 130, 200]);
      // sentiment line
      let py = null;
      for (let x = 58; x < 116; x++) {
        const y = Math.round(20 + 8 * Math.sin(x * 0.12 + t * 1.5));
        if (py !== null) p.line(x - 1, py, x, y, C.magenta, 200);
        py = y;
      }
      if (Math.sin(t * 3) > 0.6) { p.set(112, 6, C.white); p.set(111, 7, C.white); p.set(113, 7, C.white); p.set(112, 8, C.white); p.set(112, 7, C.acid); }
      // verdict label
      p.rect(7, 46, 38, 10, [36, 70, 160]);
      p.rect(10, 49, 4, 4, C.acid);
      p.rect(17, 50, 24, 2, [220, 230, 255]);
      p.flush();
    };
  };

  SCENES.poddrafts = (p) => {
    const cx = 60, cy = 38, rx = 38, ry = 20;
    const seat = (k) => { const a = (k / 8) * TAU - Math.PI / 2; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; };
    const hues = [0, 0.14, 0.28, 0.42, 0.57, 0.71, 0.85, 0.95];
    return (t) => {
      p.clear([26, 12, 8]);
      for (let y = 0; y < p.h; y += 4) p.rect(0, y, p.w, 1, [34, 17, 10]);
      // table
      for (let y = -ry + 4; y <= ry - 4; y++) {
        const w = (rx - 6) * Math.sqrt(1 - (y / (ry - 4)) ** 2);
        p.line(cx - w, cy + y, cx + w, cy + y, (y + 40) % 5 ? [122, 74, 40] : [104, 62, 32]);
      }
      p.ellipse(cx, cy, rx - 6, ry - 4, [70, 40, 20]);
      p.ellipse(cx, cy + 1, rx - 6, ry - 4, [50, 28, 14]);
      // center pile
      p.rect(cx - 5, cy - 3, 6, 8, [240, 230, 210]); p.rect(cx - 2, cy - 5, 6, 8, [252, 244, 228]);
      p.rect(cx - 1, cy - 3, 4, 3, psy(t * 0.1));
      // players
      for (let k = 0; k < 8; k++) {
        const [x, y] = seat(k);
        const c = psy(hues[k]);
        p.rect(Math.round(x) - 2, Math.round(y) - 4, 5, 4, [238, 200, 160]);
        p.rect(Math.round(x) - 3, Math.round(y), 7, 4, c);
        p.rect(Math.round(x) - 2, Math.round(y) - 5, 5, 1, shade(c, 0.6));
      }
      // packs passing around the table
      for (let i = 0; i < 8; i++) {
        const pos = (t * 0.45 + i) % 8;
        const k = Math.floor(pos), f = pos - k;
        const e = f < 0.6 ? 0 : (f - 0.6) / 0.4;
        const s = e * e * (3 - 2 * e);
        const a = seat(k), b = seat((k + 1) % 8);
        const x = a[0] + (b[0] - a[0]) * s, y = a[1] + (b[1] - a[1]) * s;
        const px = Math.round(cx + (x - cx) * 0.72), py = Math.round(cy + (y - cy) * 0.66);
        p.rect(px - 1, py - 2, 4, 5, [30, 16, 10]);
        p.rect(px - 1, py - 2, 3, 4, [255, 95, 143]);
        p.set(px, py - 1, C.sun);
      }
      p.flush();
    };
  };

  SCENES.meta = (p) => {
    const cols = [hex('#f8f1d4'), hex('#4ea0f0'), hex('#7a5a8c'), hex('#f0643c'), hex('#4fbe6e')];
    const f = [1, 1.3, 0.7, 1.7, 1.1], ph = [0, 1.7, 3.1, 4.4, 5.3];
    return (t) => {
      p.clear([10, 6, 16]);
      const off = t * 9;
      const top = 10, bottom = p.h - 2, H = bottom - top;
      for (let x = 0; x < p.w; x++) {
        const w = f.map((fk, k) => Math.exp(Math.sin((x + off) * 0.045 * fk + ph[k]) * 1.3));
        const sum = w.reduce((a, b) => a + b, 0);
        let y = bottom;
        for (let k = 0; k < 5; k++) {
          const h = (w[k] / sum) * H;
          const y2 = y - h;
          for (let yy = Math.round(y2); yy < Math.round(y); yy++) {
            const c = (yy === Math.round(y2)) ? [255, 255, 255] : cols[k];
            p.set(x, yy, c, yy === Math.round(y2) ? 90 : 255);
          }
          y = y2;
        }
      }
      // year ticks
      for (let x = 0; x < p.w; x++) {
        const gx = x + off;
        if (Math.floor(gx) % 24 === 0) { p.rect(x, 2, 1, 5, [180, 160, 220]); p.rect(x, top, 1, H, [255, 255, 255], 40); }
        else if (Math.floor(gx) % 6 === 0) p.set(x, 5, [120, 100, 160]);
      }
      p.rect(0, 7, p.w, 1, [70, 50, 110]);
      // cursor
      const cxr = 86;
      p.rect(cxr, top, 1, H, C.acid, 220);
      p.rect(cxr - 2, top - 3, 5, 3, C.acid);
      p.flush();
    };
  };

  SCENES.picsql = (p) => {
    const W = p.w, H = p.h;
    const src = new Uint8ClampedArray(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      let r = 40 + x * 1.2, g = 30 + y * 2, b = 120 + 80 * Math.sin((x + y) * 0.12);
      const dx = x - W / 2, dy = y - H / 2, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 26) { r = 250; g = 205; b = 70; }
      if (d < 26 && d > 24) { r = 60; g = 30; b = 20; }
      if ((Math.hypot(dx + 9, dy + 7) < 4) || (Math.hypot(dx - 9, dy + 7) < 4)) { r = 30; g = 20; b = 40; }
      if (dy > 5 && dy < 9 && Math.abs(dx) < 12 && Math.abs(dy - 5 - dx * dx / 40) < 2) { r = 120; g = 20; b = 40; }
      src[i] = r; src[i + 1] = g; src[i + 2] = b;
    }
    return (t) => {
      const k = Math.floor(t * 8) % 50;
      const lag = 5 * (k % 20);
      const d = p.d;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4, i = (y * W + x) * 3;
        const li = (y * W + x - lag + W * H) % (W * H) * 3;
        d[o] = src[li];
        d[o + 1] = (src[i + 1] * k) % 255;
        d[o + 2] = (k * 10) % 255;
        d[o + 3] = 255;
      }
      // scanline cursor like a query executing row by row
      const sy = Math.floor(t * 30) % H;
      for (let x = 0; x < W; x++) p.set(x, sy, C.white, 120);
      p.flush();
    };
  };

  SCENES.warp = (p) => {
    const W = p.w, H = p.h;
    const bg = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = Math.sin(x * 0.07) + Math.sin(y * 0.09 + x * 0.03) + Math.sin(Math.hypot(x - W * 0.3, y - H * 0.6) * 0.09);
      const c = psy(v * 0.1 + 0.1);
      const k = 0.16 + 0.1 * Math.sin(v * 2) + bayer(x, y) * 0.05;
      const i = (y * W + x) * 4;
      bg[i] = 5 + c[0] * k; bg[i + 1] = 2 + c[1] * k; bg[i + 2] = 14 + c[2] * k; bg[i + 3] = 255;
    }
    const stars = Array.from({ length: 90 }, () => ({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random() }));
    let lt = 0;
    return (t) => {
      const dt = Math.min(0.1, t - lt || 0.05); lt = t;
      p.d.set(bg);
      for (const s of stars) {
        const k0 = 0.5 / s.z;
        s.z -= dt * 0.35;
        if (s.z <= 0.03) { s.z = 1; s.x = (Math.random() - 0.5) * 2; s.y = (Math.random() - 0.5) * 2; continue; }
        const k1 = 0.5 / s.z;
        const x0 = W / 2 + s.x * k0 * W * 0.5, y0 = H / 2 + s.y * k0 * H * 0.5;
        const x1 = W / 2 + s.x * k1 * W * 0.5, y1 = H / 2 + s.y * k1 * H * 0.5;
        if (x1 < -5 || y1 < -5 || x1 > W + 5 || y1 > H + 5) continue;
        const c = s.z < 0.4 ? psy(s.x * 0.5 + t * 0.05) : C.white;
        p.line(x0, y0, x1, y1, c, clamp(255 * (1.1 - s.z), 60, 255));
      }
      p.flush();
    };
  };

  SCENES.patch = (p) => {
    const mods = [[4, 10, 34, hex('#2b1850')], [40, 10, 28, hex('#0e1a1f')], [70, 10, 46, hex('#e9e2d0')]];
    const jacks = [[12, 60], [26, 60], [48, 60], [60, 60], [80, 64], [94, 64], [108, 64], [21, 72]];
    const cables = [[0, 5, C.magenta], [1, 2, C.cyan], [3, 6, C.acid], [7, 4, C.sun]];
    return (t) => {
      p.clear([13, 10, 18]);
      p.rect(0, 4, p.w, 4, [150, 144, 162]); p.rect(0, p.h - 8, p.w, 4, [150, 144, 162]);
      for (let x = 3; x < p.w; x += 8) { p.set(x, 5, [20, 16, 26]); p.set(x, p.h - 7, [20, 16, 26]); }
      for (const [x, y, w, c] of mods) p.rect(x, y, w, p.h - 20, c);
      for (let i = 0; i < 4; i++) {
        const kx = 11 + (i % 2) * 15, ky = 22 + Math.floor(i / 2) * 16;
        p.disc(kx, ky, 4, [26, 18, 36]); p.disc(kx, ky, 3, [90, 75, 112]);
        const a = t * (0.4 + i * 0.2) + i;
        p.line(kx, ky, kx + Math.cos(a) * 3, ky + Math.sin(a) * 3, C.white);
      }
      for (let i = 0; i < 3; i++) p.rect(46 + i * 7, 22, 4, 4, Math.sin(t * (3 + i * 2)) > 0 ? psy(i * 0.3) : [40, 20, 30]);
      // mini scope
      p.rect(44, 32, 20, 18, [2, 10, 8]);
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * TAU;
        p.set(54 + Math.sin(a * 2 + t) * 8, 41 + Math.sin(a * 3) * 7, psy(t * 0.1 + i / 200));
      }
      p.rect(78, 20, 32, 8, [27, 20, 32]);
      p.rect(80, 22, 10, 4, C.magenta);
      for (const [x, y] of jacks) { p.disc(x, y, 3, [200, 195, 210]); p.disc(x, y, 1, [5, 3, 8]); }
      cables.forEach(([a, b, c], i) => {
        const [x1, y1] = jacks[a], [x2, y2] = jacks[b];
        const sag = 12 + Math.abs(x2 - x1) * 0.25 + Math.sin(t * 1.6 + i) * 3;
        let px = x1, py = y1;
        for (let s = 1; s <= 40; s++) {
          const u = s / 40, v = 1 - u;
          const x = v * v * v * x1 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x2;
          const y = v * v * v * y1 + 3 * v * v * u * (y1 + sag) + 3 * v * u * u * (y2 + sag) + u * u * u * y2;
          p.line(px, py, x, y, c); p.line(px, py + 1, x, y + 1, shade(c, 0.55));
          px = x; py = y;
        }
      });
      p.flush();
    };
  };

  function initArt() {
    for (const cv of $$('canvas[data-art]')) {
      const make = SCENES[cv.dataset.art];
      if (!make) continue;
      const p = new Pix(cv, cv.width, cv.height);
      const draw = make(p);
      animate(cv, cv.dataset.art === 'picsql' ? 8 : 15, draw);
    }
  }

  /* ==========================================================================
     Magic-card tilt + foil
     ========================================================================== */
  function initTilt() {
    for (const card of $$('.mtg')) {
      card.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') return;
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        if (!RM) {
          card.style.setProperty('--ry', `${(x - 0.5) * 22}deg`);
          card.style.setProperty('--rx', `${(0.5 - y) * 16}deg`);
        }
        card.style.setProperty('--mx', `${x * 100}%`);
        card.style.setProperty('--my', `${y * 100}%`);
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    }
  }

  /* ==========================================================================
     Reveal on scroll + typewriter
     ========================================================================== */
  function initReveal() {
    const els = $$('.reveal');
    if (!('IntersectionObserver' in window) || RM) { els.forEach((e) => e.classList.add('is-in')); return; }
    const ob = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); ob.unobserve(e.target); }
    }, { threshold: 0.12 });
    els.forEach((e) => ob.observe(e));
  }

  function initTypewriter() {
    const el = $('[data-type]');
    if (!el || RM) return;
    const text = el.textContent;
    el.textContent = '';
    let i = 0;
    const step = () => { el.textContent = text.slice(0, ++i); if (i < text.length) setTimeout(step, 28 + Math.random() * 40); };
    setTimeout(step, 400);
  }

  /* ==========================================================================
     Playable modular synth
     ========================================================================== */
  function initSynth() {
    const rack = $('#rack');
    if (!rack) return;
    const params = { freq: 35, ratio: 50, cutoff: 45, lfo: 30 };
    const map = () => ({
      f: 55 * Math.pow(2, (params.freq / 100) * 4),
      ratio: 1 + (params.ratio / 100) * 3,
      cutoff: 180 * Math.pow(2, (params.cutoff / 100) * 6),
      lfo: 0.1 * Math.pow(120, params.lfo / 100),
    });
    let ctx = null, nodes = null;

    const foldCurve = () => {
      const n = 1024, c = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.sin(x * 2.4) * 0.8; }
      return c;
    };
    function apply() {
      if (!nodes) return;
      const m = map(), t = ctx.currentTime;
      nodes.o1.frequency.setTargetAtTime(m.f, t, 0.03);
      nodes.o2.frequency.setTargetAtTime(m.f * m.ratio, t, 0.03);
      nodes.filt.frequency.setTargetAtTime(m.cutoff, t, 0.05);
      nodes.lfoGain.gain.setTargetAtTime(m.cutoff * 0.6, t, 0.05);
      nodes.lfo.frequency.setTargetAtTime(m.lfo, t, 0.05);
    }
    function start() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = ctx || new AC();
      ctx.resume();
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
      const o2 = ctx.createOscillator(); o2.type = 'triangle';
      const g1 = ctx.createGain(); g1.gain.value = 0.5;
      const g2 = ctx.createGain(); g2.gain.value = 0.5;
      const shaper = ctx.createWaveShaper(); shaper.curve = foldCurve();
      const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.Q.value = 7;
      const lfo = ctx.createOscillator(); lfo.type = 'sine';
      const lfoGain = ctx.createGain();
      const master = ctx.createGain();
      master.gain.setValueAtTime(0, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 0.4);
      const aX = ctx.createAnalyser(); aX.fftSize = 1024;
      const aY = ctx.createAnalyser(); aY.fftSize = 1024;
      o1.connect(g1); o2.connect(g2);
      g1.connect(shaper); g2.connect(shaper);
      g1.connect(aX); g2.connect(aY);
      shaper.connect(filt);
      lfo.connect(lfoGain); lfoGain.connect(filt.frequency);
      filt.connect(master); master.connect(ctx.destination);
      o1.start(); o2.start(); lfo.start();
      nodes = { o1, o2, lfo, filt, lfoGain, master, aX, aY, bx: new Float32Array(1024), by: new Float32Array(1024) };
      apply();
      return true;
    }
    function stop() {
      if (!nodes) return;
      const n = nodes, t = ctx.currentTime;
      nodes = null;
      n.master.gain.cancelScheduledValues(t);
      n.master.gain.setTargetAtTime(0, t, 0.08);
      setTimeout(() => { n.o1.stop(); n.o2.stop(); n.lfo.stop(); n.master.disconnect(); }, 500);
    }

    const btn = $('#synth-toggle');
    btn.addEventListener('click', () => {
      if (nodes) { stop(); btn.setAttribute('aria-pressed', 'false'); btn.textContent = '▶ Patch'; }
      else if (start()) { btn.setAttribute('aria-pressed', 'true'); btn.textContent = '■ Stop'; }
    });

    // knobs
    const setKnob = (k, v) => {
      v = clamp(Math.round(v), 0, 100);
      params[k.dataset.param] = v;
      k.setAttribute('aria-valuenow', v);
      k.style.setProperty('--a', `${-135 + v * 2.7}deg`);
      apply();
    };
    for (const k of $$('.knob', rack)) {
      setKnob(k, +k.getAttribute('aria-valuenow'));
      let startY = 0, startV = 0;
      k.addEventListener('pointerdown', (e) => { k.setPointerCapture(e.pointerId); startY = e.clientY; startV = params[k.dataset.param]; e.preventDefault(); });
      k.addEventListener('pointermove', (e) => { if (k.hasPointerCapture(e.pointerId)) setKnob(k, startV + (startY - e.clientY) * 0.6); });
      k.addEventListener('wheel', (e) => { e.preventDefault(); setKnob(k, params[k.dataset.param] - Math.sign(e.deltaY) * 4); }, { passive: false });
      k.addEventListener('keydown', (e) => {
        const d = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5, PageUp: 20, PageDown: -20 }[e.key];
        if (d) { e.preventDefault(); setKnob(k, params[k.dataset.param] + d); }
        if (e.key === 'Home') setKnob(k, 0);
        if (e.key === 'End') setKnob(k, 100);
      });
    }

    // oscilloscope (Lissajous) — real signal when playing, simulated otherwise
    const scope = $('#scope');
    const sctx = scope.getContext('2d');
    const leds = [$('#led-a'), $('#led-b'), $('#led-c')];
    animate(scope, 30, (t) => {
      const m = map(), W = scope.width, H = scope.height, cx = W / 2, cy = H / 2;
      sctx.fillStyle = 'rgba(2, 8, 6, 0.22)';
      sctx.fillRect(0, 0, W, H);
      sctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
      sctx.lineWidth = 1;
      for (let i = 1; i < 8; i++) { sctx.beginPath(); sctx.moveTo((W / 8) * i, 0); sctx.lineTo((W / 8) * i, H); sctx.moveTo(0, (H / 8) * i); sctx.lineTo(W, (H / 8) * i); sctx.stroke(); }
      const hue = (t * 50) % 360;
      sctx.strokeStyle = `hsl(${hue} 100% 62%)`;
      sctx.shadowColor = `hsl(${hue} 100% 60%)`;
      sctx.shadowBlur = 12;
      sctx.lineWidth = 2;
      sctx.beginPath();
      const wob = 0.8 + 0.2 * Math.sin(t * m.lfo * TAU);
      if (nodes) {
        nodes.aX.getFloatTimeDomainData(nodes.bx);
        nodes.aY.getFloatTimeDomainData(nodes.by);
        for (let i = 0; i < 1024; i++) {
          const x = cx + nodes.bx[i] * W * 0.8, y = cy - nodes.by[i] * H * 0.8;
          i ? sctx.lineTo(x, y) : sctx.moveTo(x, y);
        }
      } else {
        const turns = 2 + params.freq / 25;
        for (let i = 0; i <= 700; i++) {
          const a = (i / 700) * TAU * turns;
          const x = cx + Math.sin(a + t * 0.8) * W * 0.38 * wob;
          const y = cy - Math.sin(a * m.ratio + t * 0.3) * H * 0.38 * (0.5 + params.cutoff / 200);
          i ? sctx.lineTo(x, y) : sctx.moveTo(x, y);
        }
      }
      sctx.stroke();
      sctx.shadowBlur = 0;
      leds[0].classList.toggle('on', Math.sin(t * m.lfo * TAU) > 0);
      leds[1].classList.toggle('on', nodes ? Math.sin(t * 9) > 0 : false);
      leds[2].classList.toggle('on', Math.random() < 0.15 + params.cutoff / 300);
    });

    // patch cables
    const svg = $('#cables');
    const NS = 'http://www.w3.org/2000/svg';
    const pairs = [[0, 5, '#ff3df2'], [2, 4, '#00f0ff'], [1, 3, '#b6ff3b']];
    const paths = pairs.map(([, , c]) => { const el = document.createElementNS(NS, 'path'); el.setAttribute('stroke', c); svg.appendChild(el); return el; });
    animate(rack, 30, (t) => {
      const jacks = $$('.jack', rack);
      if (jacks.length < 6) return;
      const R = rack.getBoundingClientRect();
      const pos = jacks.map((j) => { const r = j.getBoundingClientRect(); return [r.left - R.left + r.width / 2, r.top - R.top + r.height / 2]; });
      pairs.forEach(([a, b], i) => {
        const [x1, y1] = pos[a], [x2, y2] = pos[b];
        const sag = 34 + Math.min(40, Math.abs(x2 - x1) * 0.05) + Math.sin(t * 1.3 + i * 2) * 6;
        paths[i].setAttribute('d', `M${x1},${y1} C${x1 + 10},${y1 + sag} ${x2 - 10},${y2 + sag} ${x2},${y2}`);
      });
    });
  }

  /* ==========================================================================
     Armies demo — thousands of pixel soldiers
     ========================================================================== */
  function initArmies() {
    const cv = $('#armies');
    if (!cv) return;
    const p = new Pix(cv, 240, 150);
    const W = p.w, H = p.h;
    const N = 1500, T = N * 2;
    const x = new Float32Array(T), y = new Float32Array(T), vx = new Float32Array(T), vy = new Float32Array(T);
    const ox = new Float32Array(T), oy = new Float32Array(T), alive = new Uint8Array(T), wait = new Float32Array(T);
    const team = (i) => (i < N ? 0 : 1);
    const home = [{ x: 28, y: H / 2 }, { x: W - 28, y: H / 2 }];
    const rally = [{ ...home[0] }, { ...home[1] }];
    let charge = 0, flag = null, nextAuto = 3;
    const sparks = [];
    // a pixel suburb (with a few towers) for the tripod to wreck
    const houses = [];
    for (let hy = 22; hy < H - 24; hy += 7) {
      for (let hx = 80; hx < 160; hx += 7) {
        if (Math.random() < 0.1) continue;
        houses.push({ x: hx, y: hy, up: 1, tower: hx > 128 && hy < 52, lit: Math.random() });
      }
    }
    const tri = { x: 120, y: 75, tx: 120, ty: 75, cool: 0, wander: 0 };
    const lasers = [];
    const CELL = 3, GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL);
    const grid0 = new Uint16Array(GW * GH), grid1 = new Uint16Array(GW * GH);
    const spawn = (i) => {
      const tm = team(i);
      x[i] = tm ? W - 2 - Math.random() * 20 : 2 + Math.random() * 20;
      y[i] = 10 + Math.random() * (H - 20);
      vx[i] = vy[i] = 0; alive[i] = 1;
    };
    for (let i = 0; i < T; i++) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 22;
      ox[i] = Math.cos(a) * r * 0.8; oy[i] = Math.sin(a) * r * 2;
      spawn(i);
      x[i] = home[team(i)].x + ox[i]; y[i] = home[team(i)].y + oy[i];
    }
    const hud = $('#armies-count');
    const order = (px, py) => {
      rally[0] = { x: px, y: py }; rally[1] = { x: px, y: py };
      charge = 4; flag = { x: px, y: py, life: 4 };
    };
    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect();
      order(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H);
      if (RM) step(0.5, 1);
    });

    let lt = 0, frame = 0;
    function step(t, dtOverride) {
      const dt = dtOverride || Math.min(0.1, t - lt || 0.033); lt = t;
      frame++;
      if (charge > 0) {
        charge -= dt;
        if (charge <= 0) { rally[0] = { ...home[0] }; rally[1] = { ...home[1] }; nextAuto = t + 4 + Math.random() * 3; }
      } else if (t > nextAuto) {
        order(W * (0.35 + Math.random() * 0.3), H * (0.3 + Math.random() * 0.4));
      }
      // tripod: walks toward the charge point (or wanders) and lasers the houses
      if (charge > 0) { tri.tx = rally[0].x; tri.ty = rally[0].y; }
      else if (t > tri.wander) { tri.tx = 84 + Math.random() * 72; tri.ty = 26 + Math.random() * (H - 52); tri.wander = t + 3 + Math.random() * 3; }
      const ddx = tri.tx - tri.x, ddy = tri.ty - tri.y, dd = Math.hypot(ddx, ddy);
      if (dd > 1) { tri.x += (ddx / dd) * dt * 14; tri.y += (ddy / dd) * dt * 14; }
      tri.cool -= dt;
      if (tri.cool <= 0) {
        const near = houses.filter((h) => h.up && Math.abs(h.x - tri.x) < 42 && Math.abs(h.y - tri.y) < 34);
        if (near.length) {
          const h = near[(Math.random() * near.length) | 0];
          h.up = 0;
          lasers.push({ x: h.x + 2, y: h.y + 2, life: 1 });
          for (let k = 0; k < 8 && sparks.length < 400; k++) sparks.push({ x: h.x + Math.random() * 4, y: h.y + Math.random() * 4, life: 1, c: k % 2 ? C.sun : hex('#ff5a2a') });
        }
        tri.cool = 0.25 + Math.random() * 0.3;
      }
      const down = houses.filter((h) => !h.up);
      if (down.length > houses.length * 0.7 || Math.random() < 0.02) {
        const h = down[(Math.random() * down.length) | 0];
        if (h) h.up = 1;
      }
      grid0.fill(0); grid1.fill(0);
      const tight = charge > 0 ? 0.35 : 1;
      for (let i = 0; i < T; i++) {
        if (!alive[i]) {
          wait[i] -= dt;
          if (wait[i] <= 0) spawn(i);
          continue;
        }
        const tm = team(i), rp = rally[tm];
        const tx = rp.x + ox[i] * tight, ty = rp.y + oy[i] * tight;
        vx[i] = (vx[i] + (tx - x[i]) * 0.006 + (Math.random() - 0.5) * 0.12) * 0.93;
        vy[i] = (vy[i] + (ty - y[i]) * 0.006 + (Math.random() - 0.5) * 0.12) * 0.93;
        const sp = Math.hypot(vx[i], vy[i]);
        if (sp > 1.3) { vx[i] *= 1.3 / sp; vy[i] *= 1.3 / sp; }
        x[i] = clamp(x[i] + vx[i], 0, W - 1); y[i] = clamp(y[i] + vy[i], 0, H - 1);
        const g = ((y[i] / CELL) | 0) * GW + ((x[i] / CELL) | 0);
        (tm ? grid1 : grid0)[g]++;
      }
      for (let i = 0; i < T; i++) {
        if (!alive[i]) continue;
        const g = ((y[i] / CELL) | 0) * GW + ((x[i] / CELL) | 0);
        const enemies = team(i) ? grid0[g] : grid1[g];
        if (enemies && Math.random() < 0.03 * enemies) {
          alive[i] = 0; wait[i] = 1.5 + Math.random() * 3;
          if (sparks.length < 400) sparks.push({ x: x[i], y: y[i], life: 1, c: Math.random() < 0.5 ? C.sun : C.acid });
        }
      }
    }
    function render(t) {
      p.clear([6, 3, 14]);
      for (let yy = 0; yy < H; yy += 10) for (let xx = (yy / 10) % 2 ? 5 : 0; xx < W; xx += 10) p.set(xx, yy, [26, 16, 44]);
      p.rect(0, 0, 3, H, shade(C.magenta, 0.3)); p.rect(W - 3, 0, 3, H, shade(C.cyan, 0.3));
      p.rect(77, 19, 86, H - 38, [54, 50, 62]);
      for (const h of houses) {
        p.rect(h.x - 1, h.y - 1, 6, 6, [46, 104, 52]);
        if (!h.up) {
          for (let k = 0; k < 6; k++) p.set(h.x + ((k * 7 + h.x) % 5), h.y + ((k * 3 + h.y) % 5), k % 2 ? [110, 84, 60] : [84, 80, 90]);
        } else if (h.tower) {
          p.rect(h.x, h.y, 5, 5, [150, 170, 204]);
          p.rect(h.x + 3, h.y, 2, 5, [110, 128, 166]);
          if (Math.sin(t * 2 + h.lit * 20) > 0.2) p.set(h.x + 1, h.y + 1, [255, 226, 120]);
          if (Math.sin(t * 1.3 + h.lit * 9) > 0) p.set(h.x + 2, h.y + 3, [255, 226, 120]);
        } else {
          p.rect(h.x, h.y, 4, 2, [226, 110, 62]);
          p.rect(h.x, h.y + 2, 4, 2, [178, 78, 42]);
        }
      }
      let count = 0;
      for (let i = 0; i < T; i++) {
        if (!alive[i]) continue;
        count++;
        const c = team(i) ? C.cyan : C.magenta;
        p.set(x[i], y[i], charge > 0 ? c : shade(c, 0.8));
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life -= 0.06;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        const r = Math.round((1 - s.life) * 3);
        p.set(s.x + r, s.y, s.c, 255 * s.life); p.set(s.x - r, s.y, s.c, 255 * s.life);
        p.set(s.x, s.y + r, s.c, 255 * s.life); p.set(s.x, s.y - r, s.c, 255 * s.life);
      }
      // lasers + tripod
      for (let i = lasers.length - 1; i >= 0; i--) {
        const l = lasers[i];
        l.life -= 0.12;
        if (l.life <= 0) { lasers.splice(i, 1); continue; }
        p.line(tri.x, tri.y, l.x, l.y, [255, 60, 40], 255 * l.life);
        p.line(tri.x, tri.y + 1, l.x, l.y + 1, [255, 170, 60], 140 * l.life);
      }
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU + 0.5;
        const fx = tri.x + Math.cos(a) * 7 + Math.sin(t * 5 + k * 2) * 1.5, fy = tri.y + Math.sin(a) * 7 + Math.cos(t * 5 + k * 2) * 1.5;
        p.line(tri.x, tri.y, fx, fy, [200, 200, 212]);
        p.set(fx, fy, [240, 240, 250]);
      }
      p.disc(Math.round(tri.x), Math.round(tri.y), 3, [150, 150, 164]);
      p.disc(Math.round(tri.x) - 1, Math.round(tri.y) - 1, 1, [220, 220, 232]);
      p.set(tri.x + 1, tri.y + 1, [80, 120, 255]);
      if (flag && flag.life > 0) {
        flag.life -= 0.033;
        if (Math.floor(t * 6) % 2) {
          p.rect(flag.x, flag.y - 7, 1, 8, C.white);
          p.rect(flag.x + 1, flag.y - 7, 4, 3, C.acid);
        }
      }
      p.flush();
      if (hud && frame % 10 === 0) hud.textContent = count.toLocaleString('fr-FR');
    }
    if (hud) hud.textContent = T.toLocaleString('fr-FR');
    animate(cv, 30, (t) => { if (!RM) step(t); render(t); });
  }

  /* ==========================================================================
     Cardwright forge — draw your own card
     ========================================================================== */
  function initForge() {
    const cv = $('#drawcard');
    if (!cv) return;
    const BG = [18, 14, 42];
    const p = new Pix(cv, 64, 48);
    p.clear(BG);
    // a starter doodle, so the card is never blank
    const Y = hex('#ffd23b'), R = hex('#ff3b3b');
    p.ellipse(32, 16, 8, 8, Y); p.ellipse(32, 16, 9, 9, Y);
    p.rect(28, 14, 2, 2, R); p.rect(35, 14, 2, 2, R);
    p.line(29, 20, 35, 20, R);
    p.line(26, 24, 18, 40, R); p.line(38, 24, 46, 40, R); p.line(27, 24, 19, 40, R); p.line(37, 24, 45, 40, R);
    p.line(24, 34, 40, 34, Y); p.line(24, 35, 40, 35, Y);
    p.ellipse(22, 42, 3, 2, Y); p.ellipse(42, 42, 3, 2, Y);
    p.flush();

    const colors = ['#ffd23b', '#ff3b3b', '#ff3df2', '#00f0ff', '#4fe07a', '#ffffff'];
    let current = hex(colors[0]);
    const pal = $('#palette');
    const swatches = [];
    colors.concat(['erase']).forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
      if (c === 'erase') {
        b.style.background = 'repeating-linear-gradient(45deg, #120e2a 0 4px, #3a2f66 4px 8px)';
        b.setAttribute('aria-label', 'Gomme');
      } else {
        b.style.background = c;
        b.setAttribute('aria-label', `Couleur ${c}`);
      }
      b.addEventListener('click', () => {
        current = c === 'erase' ? BG : hex(c);
        swatches.forEach((s) => s.setAttribute('aria-pressed', String(s === b)));
      });
      swatches.push(b);
      pal.appendChild(b);
    });
    $('#drawcard-clear').addEventListener('click', () => { p.clear(BG); p.flush(); });

    let drawing = false, lx = 0, ly = 0;
    const at = (e) => { const r = cv.getBoundingClientRect(); return [Math.floor(((e.clientX - r.left) / r.width) * 64), Math.floor(((e.clientY - r.top) / r.height) * 48)]; };
    const stroke = (x0, y0, x1, y1) => { p.line(x0, y0, x1, y1, current); p.line(x0 + 1, y0, x1 + 1, y1, current); p.flush(); };
    cv.addEventListener('pointerdown', (e) => { drawing = true; cv.setPointerCapture(e.pointerId); [lx, ly] = at(e); stroke(lx, ly, lx, ly); e.preventDefault(); });
    cv.addEventListener('pointermove', (e) => { if (!drawing) return; const [x, y] = at(e); stroke(lx, ly, x, y); lx = x; ly = y; });
    const end = () => { drawing = false; };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);

    // keywords update the card text and its cost (the "barème")
    const text = $('#cw-text'), cost = $('.cw-card__cost');
    const kws = $$('#keywords button');
    const render = () => {
      const on = kws.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);
      text.textContent = '';
      if (on.length) { const em = document.createElement('em'); em.textContent = `${on.join(', ')}. `; text.appendChild(em); }
      const b = document.createElement('b'); b.textContent = 'Entrée :'; text.appendChild(b);
      text.appendChild(document.createTextNode(' pioche 2, 2 dégâts à un monstre adverse.'));
      const c = 6 + on.filter((k) => k !== 'Fragile').length - (on.includes('Fragile') ? 1 : 0);
      cost.textContent = clamp(c, 0, 9);
    };
    kws.forEach((b) => b.addEventListener('click', () => { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); render(); }));
  }

  /* ---------- boot ---------- */
  function boot() {
    initSprites();
    initCosmos();
    initArt();
    initTilt();
    initReveal();
    initTypewriter();
    initSynth();
    initArmies();
    initForge();
    if (!RM) requestAnimationFrame(loop);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
