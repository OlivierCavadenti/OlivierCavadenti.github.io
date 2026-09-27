/* Olivier Cavadenti · « Mon parcours »
   A 96-second journey in nine stations, synced to a soundtrack whose sections were composed
   to the same timings as CHAPTERS. One GSAP timeline drives the type, the SVG and the shader
   uniforms; a WebGL pass melts the fal.ai prints (and the real portrait) into screen-print
   colour. Loaded on demand by main.js, torn down on close. Everything is a pure function of the
   playhead, so scrubbing, skipping chapters and replaying all land on the same frame. */
(() => {
  'use strict';
  if (window.OCParcours) return;

  const gsap = window.gsap;
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const K = RM ? 0 : 1;                      // motion amplitude: nothing swirls under reduced motion
  const ROOT = new URL('../parcours/', document.currentScript.src).href;
  const { min, max, abs, floor, sin, cos, PI, round } = Math;
  const TAU = PI * 2;
  const rand = gsap.utils.random;
  const clamp = (v, a, b) => max(a, min(b, v));

  const END = 96;
  const CHAPTERS = [
    { at: 0, n: '◉', label: 'Portail' },
    { at: 6, n: 'I', label: 'Des parties' },
    { at: 16, n: 'II', label: 'Apprendre à voir' },
    { at: 25, n: 'III', label: 'Fouiller les motifs' },
    { at: 39, n: 'IV', label: 'Construire les machines' },
    { at: 51, n: 'V', label: 'Les machines parlent' },
    { at: 59, n: 'VI', label: 'Dresser des agents' },
    { at: 69, n: 'VII', label: 'Intellectuality' },
    { at: 79, n: 'VIII', label: 'Ce qui pousse ici' },
    { at: 91, n: 'IX', label: 'Signal' },
  ];
  // what the shader shows; tr = length of the ink-rimmed dissolve from the previous shot
  const SHOTS = [
    { at: 0, src: 'portal', video: true, tr: 0 },
    { at: 3.2, src: 'face', poster: 1, scale: 0.42, tr: 0.9 },   // the real face: a wall of mirrored screen prints
    { at: 6, src: 'games', tr: 1.1 },
    { at: 16, src: 'eyes', video: true, tr: 1.2 },
    { at: 25, src: 'cathedral', tr: 1.2 },
    { at: 39, src: 'machines', video: true, tr: 1.2, clip: 3.8 },  // the clip thins out after 4 s
    { at: 51, src: 'oracle', tr: 1.0 },
    { at: 59, src: 'draag', video: true, tr: 1.2 },
    { at: 69, src: 'citadel', tr: 1.2 },
    { at: 79, src: 'mandala', video: true, tr: 1.4 },
    { at: 86.5, src: 'face', poster: 1, scale: 0.5, tr: 1.0 },
    { at: 91, src: 'mandala', video: true, tr: 1.6, loop: true },
  ];
  SHOTS.forEach((s, i) => {
    const next = SHOTS[i + 1];
    s.len = next ? next.at - s.at : 12;
    s.rate = clamp(5.9 / s.len, 0.45, 1);     // stretch each 6 s clip over its shot
  });
  const IMAGES = ['portal', 'face', 'games', 'eyes', 'cathedral', 'machines', 'oracle', 'draag', 'citadel', 'mandala'];
  const VIDEOS = ['portal', 'eyes', 'machines', 'draag', 'mandala'];
  const FIRST = ['portal', 'face', 'games'];

  /* ---------- dom helpers ---------- */
  const SVGNS = 'http://www.w3.org/2000/svg';
  function h(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function s(tag, attrs = {}, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.append(e);
    return e;
  }
  const hash = (a, b = 0) => { const v = sin(a * 127.1 + b * 311.7) * 43758.5453; return v - floor(v); };
  const PAL = ['#c1473b', '#f2c230', '#8fb4de', '#3456a0', '#a5c63b', '#e58a2f', '#b9b4c4'];
  const INK = '#161616', PAPER = '#f7f4ec';

  /* ==========================================================================
     WebGL: one fullscreen pass. Two texture slots, noise dissolve with an ink rim,
     liquid warp, kaleidoscope, tunnel, screen-print posterisation, contour field, hue spin.
     ========================================================================== */
  const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime;
uniform sampler2D uA; uniform sampler2D uB; uniform vec2 uSA; uniform vec2 uSB; uniform float uPA; uniform float uPB; uniform float uKA; uniform float uKB;
uniform float uMix, uWarp, uKal, uKalAmt, uZoom, uSpin, uTunnel, uField, uChroma, uHue, uDark, uBeat, uGrain;
uniform vec2 uMouse;
#define TAU 6.2831853
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; } return v; }
vec3 pal(float x){ x = fract(x) * 6.;
  if (x < 1.) return vec3(.757, .278, .231); if (x < 2.) return vec3(.949, .761, .188);
  if (x < 3.) return vec3(.561, .706, .871); if (x < 4.) return vec3(.204, .337, .627);
  if (x < 5.) return vec3(.647, .776, .231); return vec3(.898, .541, .184); }
vec3 hueShift(vec3 c, float a){ const vec3 k = vec3(.57735); float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1. - ca); }
vec2 rot(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
vec2 toTex(vec2 q, vec2 size, float k){
  float sa = uRes.x / uRes.y, ta = size.x / size.y;
  vec2 uv = vec2(q.x / sa, q.y) / k;
  if (sa > ta) uv.y *= ta / sa; else uv.x *= sa / ta;
  uv += .5;
  vec2 m = mod(uv, 2.); return 1. - abs(m - 1.);
}
vec3 samp(sampler2D t, vec2 q, vec2 size, float poster, float k){
  vec2 d = normalize(q + 1e-4) * uChroma;
  vec3 c = vec3(texture2D(t, toTex(q + d, size, k)).r, texture2D(t, toTex(q, size, k)).g, texture2D(t, toTex(q - d, size, k)).b);
  if (poster > 0.) {
    float l = dot(c, vec3(.299, .587, .114));
    l = clamp((l - .12) * 1.35, 0., 1.);
    vec3 pc = pal(floor(l * 5.) / 5. * 1.2 + uHue * .159 + .03);
    pc *= smoothstep(.5, .43, abs(fract(l * 5.) - .5));
    pc = mix(vec3(.086), pc, step(.16, l));
    c = mix(c, pc, poster);
  }
  return c;
}
void main(){
  float t = uTime;
  vec2 q = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  q += uMouse * .012;
  q = rot(q, uSpin);
  q /= uZoom * (1. + .022 * uBeat);
  vec2 w = vec2(0.);
  if (uWarp > .001) {
    w = vec2(fbm(q * 2.2 + vec2(t * .07, -t * .05)), fbm(q * 2.2 + vec2(5.2 - t * .06, 1.3 + t * .08))) - .5;
    q += w * uWarp * (1. + .5 * uBeat);
  }
  if (uKalAmt > .001) {
    float r = length(q), a = atan(q.y, q.x) + t * .06;
    float seg = TAU / max(uKal, 1.);
    a = mod(a, seg); a = abs(a - seg * .5);
    q = mix(q, r * vec2(cos(a), sin(a)), uKalAmt);
  }
  float r0 = length(q);
  if (uTunnel > .001) {
    float a = atan(q.y, q.x);
    vec2 tq = vec2((abs(a) / 3.14159 - .5) * uRes.x / uRes.y * .8, fract(.16 / max(r0, .001) + t * .28) - .5);
    q = mix(q, tq, uTunnel);
  }
  vec3 A = samp(uA, q, uSA, uPA, uKA);
  vec3 col = A;
  if (uMix > .001) {
    vec3 B = samp(uB, q, uSB, uPB, uKB);
    float n = fbm(q * 3. + 7.1 + t * .1);
    float th = mix(-.08, 1.08, uMix);
    col = mix(A, B, 1. - smoothstep(th - .02, th, n));
    float d = abs(n - th), live = step(.001, uMix) * step(uMix, .999);
    col = mix(col, vec3(.949, .761, .188), live * (1. - smoothstep(.012, .03, d)));
    col = mix(col, vec3(.086), live * (1. - smoothstep(.004, .012, d)));
  }
  if (uField > .001) {
    float b = fbm(q * 1.6 + w * 2. + t * .05) * 6. + t * .12;
    vec3 fc = pal(floor(b) / 6.) * smoothstep(.5, .45, abs(fract(b) - .5));
    col = mix(col, fc, uField);
  }
  col *= mix(1., smoothstep(0., .22, r0), uTunnel * .9);
  col = clamp(hueShift(col, uHue), 0., 1.);
  col = mix(col, col * col * (3. - 2. * col), .22);
  vec2 uv = gl_FragCoord.xy / uRes;
  col *= mix(.7, 1., smoothstep(1.2, .35, length((uv - .5) * vec2(uRes.x / uRes.y, 1.))));
  col += (hash(gl_FragCoord.xy + fract(t * 7.) * 91.) - .5) * uGrain;
  gl_FragColor = vec4(mix(col, vec3(.086), uDark), 1.);
}`;

  function makeGL(canvas) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) return null;
    const sh = (type, src) => {
      const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
      return o;
    };
    const prog = gl.createProgram();
    try {
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }'));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (err) { console.warn('parcours: shader', err); return null; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uni = {};
    ['uRes', 'uTime', 'uA', 'uB', 'uSA', 'uSB', 'uPA', 'uPB', 'uKA', 'uKB', 'uMix', 'uWarp', 'uKal', 'uKalAmt', 'uZoom', 'uSpin', 'uTunnel', 'uField', 'uChroma', 'uHue', 'uDark', 'uBeat', 'uGrain', 'uMouse']
      .forEach((n) => { uni[n] = gl.getUniformLocation(prog, n); });
    gl.uniform1i(uni.uA, 0); gl.uniform1i(uni.uB, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    const texs = {};
    const blank = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, blank);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([22, 22, 22, 255]));
    function upload(name, el, w, h) {
      let t = texs[name];
      if (!t) {
        t = texs[name] = { tex: gl.createTexture(), w: 1, h: 1 };
        gl.bindTexture(gl.TEXTURE_2D, t.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      }
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el); t.w = w; t.h = h; } catch (err) { /* frame not ready */ }
    }
    function draw(W, H, u, a, b) {
      gl.viewport(0, 0, W, H);
      gl.uniform2f(uni.uRes, W, H);
      const ta = texs[a.src], tb = b && texs[b.src];
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ta ? ta.tex : blank);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tb ? tb.tex : blank);
      gl.uniform2f(uni.uSA, ta ? ta.w : 16, ta ? ta.h : 9);
      gl.uniform2f(uni.uSB, tb ? tb.w : 16, tb ? tb.h : 9);
      gl.uniform1f(uni.uPA, a.poster || 0);
      gl.uniform1f(uni.uPB, (b && b.poster) || 0);
      gl.uniform1f(uni.uKA, a.scale || 1);
      gl.uniform1f(uni.uKB, (b && b.scale) || 1);
      gl.uniform1f(uni.uMix, b ? u.mix : 0);
      for (const k of ['Time', 'Warp', 'Kal', 'KalAmt', 'Zoom', 'Spin', 'Tunnel', 'Field', 'Chroma', 'Hue', 'Dark', 'Beat', 'Grain']) gl.uniform1f(uni['u' + k], u[k.toLowerCase()]);
      gl.uniform2f(uni.uMouse, u.mx, u.my);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    return { upload, draw, has: (n) => !!texs[n], lose: () => { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } };
  }

  /* ==========================================================================
     State
     ========================================================================== */
  const U = { time: 0, mix: 0, warp: 0.05, kal: 6, kalamt: 0, zoom: 1.35, spin: 0, tunnel: 0, field: 0, chroma: 0.002, hue: 0, dark: 1, beat: 0, grain: 0.07, mx: 0, my: 0 };
  let root = null, stage, svg, glc, fallback, gl = null, tl = null, hud = {}, live, pulse = null;
  let audio = null, actx = null, analyser = null, freq = null;
  const media = { img: {}, vid: {} };
  const S = { t: 0, playing: false, last: 0, raf: 0, chapter: -1, muted: false, from: null, open: false, level: 0 };

  /* ---------- scene building blocks ---------- */
  function title(lines, cls = '') {
    const el = h('h2', 'od-title ' + cls);
    el.setAttribute('aria-label', lines.join(' '));
    lines.forEach((line) => {
      const l = h('span', 'od-line');
      l.setAttribute('aria-hidden', 'true');
      line.split(' ').forEach((w, i, arr) => {
        const ws = h('span', 'od-w');
        [...w].forEach((ch) => { const c = h('span', 'od-c'); c.textContent = ch; ws.append(c); });
        l.append(ws);
        if (i < arr.length - 1) l.append(' ');
      });
      el.append(l);
    });
    return el;
  }
  const kicker = (n, text) => h('p', 'od-kicker', `<b>${n}</b><span>${text}</span>`);
  const cap = (text, cls = '') => h('p', 'od-cap ' + cls, text);
  function scene(cls) { const sc = h('section', 'od-scene ' + cls); stage.append(sc); return sc; }
  const show = (el, a, b) => { gsap.set(el, { autoAlpha: 0 }); tl.set(el, { autoAlpha: 1 }, a); if (b != null) tl.set(el, { autoAlpha: 0 }, b); };
  const inKicker = (el, at) => tl.fromTo(el, { clipPath: 'inset(0 100% 0 0)', x: -24 * K }, { clipPath: 'inset(0 0% 0 0)', x: 0, duration: 0.7, ease: 'expo.out' }, at);
  const inTitle = (el, at, each = 0.03) => tl.fromTo(el.querySelectorAll('.od-c'),
    { yPercent: 120 * K, rotateX: -100 * K, opacity: 0, transformPerspective: 500 },
    { yPercent: 0, rotateX: 0, opacity: 1, duration: 1.05, ease: 'expo.out', stagger: each }, at);
  const inCap = (el, at) => tl.fromTo(el, { clipPath: 'inset(0 0 100% 0)', y: 34 * K, rotate: -2.5 * K }, { clipPath: 'inset(0 0 0% 0)', y: 0, rotate: 0, duration: 0.85, ease: 'power4.out' }, at);
  function outAll(sc, at) {
    const cs = sc.querySelectorAll('.od-c');
    if (cs.length) tl.to(cs, {
      x: () => rand(-320, 320) * K, y: () => rand(-260, 260) * K, rotation: () => rand(-170, 170) * K,
      scale: () => (K ? rand(0.2, 2.2) : 1), opacity: 0, duration: 0.75, ease: 'power3.in', stagger: { each: 0.005, from: 'random' },
    }, at);
    const rest = sc.querySelectorAll('.od-kicker, .od-cap, .od-fx, .od-by, .od-chips');
    if (rest.length) tl.to(rest, { opacity: 0, y: -24 * K, duration: 0.5, ease: 'power2.in' }, at + 0.1);
  }
  function bigYear(sc, text, at, end, cls = '') {
    const y = h('p', 'od-year ' + cls, text);
    y.setAttribute('aria-hidden', 'true');
    sc.prepend(y);
    tl.fromTo(y, { opacity: 0, xPercent: 18 * K }, { opacity: 1, xPercent: 0, duration: 1.4, ease: 'expo.out' }, at);
    tl.to(y, { xPercent: -10 * K, duration: end - at - 1.4, ease: 'none' }, at + 1.4);
  }
  // shader uniforms as keyframe lists: each value is reached at its time, tweened from the previous one
  function keys(prop, list, ease = 'sine.inOut') {
    U[prop] = list[0][1];
    for (let i = 1; i < list.length; i++) {
      const [t0] = list[i - 1], [t1, v] = list[i];
      if (t1 > t0) tl.to(U, { [prop]: v, duration: t1 - t0, ease }, t0);
      else tl.set(U, { [prop]: v }, t1);
    }
  }
  function drawOn(els, at, dur = 1.2, each = 0.05) {
    els.forEach((e) => {
      const len = e.getTotalLength ? e.getTotalLength() : 1000;
      e.style.strokeDasharray = `${len} ${len}`;
      e.style.strokeDashoffset = len;
      e.dataset.len = len;
    });
    tl.to(els, { strokeDashoffset: 0, duration: dur, ease: 'power2.inOut', stagger: each }, at);
  }
  function gear(cx, cy, r, teeth, parent, fill) {
    let d = '';
    for (let i = 0; i < teeth * 2; i++) {
      const a0 = (i / (teeth * 2)) * TAU, a1 = ((i + 1) / (teeth * 2)) * TAU, rr = i % 2 ? r * 0.84 : r;
      d += `${i ? 'L' : 'M'}${cx + cos(a0) * rr},${cy + sin(a0) * rr} L${cx + cos(a1) * rr},${cy + sin(a1) * rr} `;
    }
    const g = s('g', { class: 'od-gear' }, parent);
    s('path', { d: d + 'Z', fill, stroke: INK, 'stroke-width': 5, 'stroke-linejoin': 'round' }, g);
    s('circle', { cx, cy, r: r * 0.5, fill: PAPER, stroke: INK, 'stroke-width': 5 }, g);
    s('circle', { cx, cy, r: r * 0.2, fill: INK }, g);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; s('line', { x1: cx + cos(a) * r * 0.22, y1: cy + sin(a) * r * 0.22, x2: cx + cos(a) * r * 0.48, y2: cy + sin(a) * r * 0.48, stroke: INK, 'stroke-width': 4 }, g); }
    g.style.transformOrigin = `${cx}px ${cy}px`;
    return g;
  }

  /* ==========================================================================
     The score: nine stations
     ========================================================================== */
  function compose() {
    tl = gsap.timeline({ paused: true });

    // ---- shader choreography (one list per uniform, read top to bottom as a dope sheet)
    keys('dark', [[0, 1], [1.8, 0], [90.6, 0], [92.2, 0.4]]);
    keys('zoom', [[0, 1.35], [3.2, 1.0], [5.2, 0.9], [6.0, 1.22], [7.1, 1.0], [16, 1.12], [17.2, 1.0], [25, 1.1], [26.2, 1.0], [39, 1.14], [40.2, 1.0],
      [51, 1.16], [52, 1.03], [59, 1.1], [60.2, 1.0], [69, 1.08], [70.2, 1.0], [79, 1.08], [80.4, 1.0], [86.5, 1.18], [87.5, 1.0], [91, 1.1], [92.6, 1.0], [END, 1.04]]);
    // the real face gets two clean beats (4.1 → 5.2 and 87.5 → 87.9) before the trip swallows it
    keys('warp', [[0, 0.05], [5.2, 0.05], [6.0, 0.22], [7.1, 0.06], [16, 0.06], [18.5, 0.15], [24.5, 0.1], [26, 0.04], [51, 0.05], [52.8, 0.3], [58.4, 0.26],
      [60, 0.05], [79, 0.06], [83, 0.15], [86.3, 0.15], [87, 0.03], [87.9, 0.03], [88.8, 0.3], [90.4, 0.3], [92.2, 0.03]].map(([a, b]) => [a, b * K]));
    tl.set(U, { kal: 6 }, 16); tl.set(U, { kal: 8 }, 80);
    keys('kalamt', [[0, 0], [18.8, 0], [20.4, 1], [23, 1], [24.6, 0], [81, 0], [82.6, 1], [85.6, 1], [86.6, 0], [87.9, 0], [88.8, 0.92], [90.3, 0.92], [91.7, 0]].map(([a, b]) => [a, b * K]));
    keys('tunnel', [[0, 0], [5.2, 0], [6.0, 0.8], [6.3, 0.8], [7.1, 0], [87.9, 0], [88.8, 0.72], [90.3, 0.72], [91.5, 0]].map(([a, b]) => [a, b * K]));
    keys('field', [[0, 0], [25, 0], [27, 0.12], [38, 0.12], [39.5, 0], [51, 0], [52.6, 0.24], [58, 0.24], [59.6, 0], [88.4, 0], [89.2, 0.22], [90.3, 0.22], [91.5, 0]]);
    keys('chroma', [[0, 0.002], [5.2, 0.004], [6, 0.012], [7, 0.003], [51, 0.003], [52.6, 0.011], [59, 0.003], [87.9, 0.004], [88.8, 0.018], [90.5, 0.018], [91.6, 0.002]].map(([a, b]) => [a, b * K]));
    keys('hue', [[0, 0], [5.2, 0], [6.1, 1.2], [7.2, 0], [19, 0], [22, 1.0], [24.8, 0], [52, 0], [58.4, 2.2], [60, 0], [83, 0], [86.5, PI], [90.5, TAU * 1.5], [92, TAU * 2]].map(([a, b]) => [a, b * K]));
    keys('spin', [[0, 0], [5.2, 0], [6, 0.3], [7.1, 0], [87.9, 0], [90.5, 1.2], [92, 0]].map(([a, b]) => [a, b * K]));

    /* ---- 0 · Portail ---------------------------------------------------- */
    {
      const sc = scene('od-scene--center od-scene--intro');
      const k = kicker('◉', 'Un voyage en neuf stations');
      const t1 = title(['Mon', 'parcours'], 'od-title--xl');
      const by = h('p', 'od-by', 'Olivier Cavadenti · de la fouille de données aux agents');
      sc.append(k, t1, by);
      show(sc, 0, 6);
      inKicker(k, 0.7); inTitle(t1, 1.0, 0.05);
      tl.fromTo(by, { opacity: 0, letterSpacing: K ? '0.6em' : '0.16em' }, { opacity: 1, letterSpacing: '0.16em', duration: 1.6, ease: 'expo.out' }, 2.1);
      outAll(sc, 4.1);
      const g = s('g', { class: 'od-fx-rings' }, svg);
      const rings = [];
      for (let i = 0; i < 14; i++) rings.push(s('circle', { cx: 800, cy: 450, r: 50 + i * 46, fill: 'none', stroke: PAL[i % 6], 'stroke-width': 12 }, g));
      rings.forEach((r) => { r.style.transformOrigin = '800px 450px'; });
      show(g, 0, 6);
      drawOn(rings, 0.2, 1.6, 0.06);
      tl.fromTo(g, { rotation: 0, transformOrigin: '800px 450px' }, { rotation: 140 * K, duration: 5, ease: 'power1.inOut' }, 0.2);
      tl.to(rings, { scale: K ? 3.2 : 1, opacity: 0, duration: 1.4, ease: 'power3.in', stagger: { each: 0.04, from: 'end' } }, 3.0);
    }

    /* ---- I · Des parties ------------------------------------------------ */
    {
      const sc = scene('od-scene--left');
      const k = kicker('I', 'Au commencement');
      const t1 = title(['Des', 'parties']);
      const c1 = cap('StarCraft&nbsp;II, Dota&nbsp;2&nbsp;: chaque clic laisse une trace. Et chaque trace raconte un joueur.');
      const c2 = cap('Un jeu est un système. Il suffit d’apprendre à le lire.', 'od-cap--yellow');
      sc.append(k, t1, c1, c2);
      show(sc, 6, 16);
      inKicker(k, 6.6); inTitle(t1, 7.0); inCap(c1, 8.3); inCap(c2, 11.2);
      outAll(sc, 15.1);
      // pixel constellations popping in the margins
      const g = s('g', {}, svg);
      const px = [];
      for (let i = 0; i < 70; i++) {
        const side = i % 2, x = side ? 1080 + hash(i, 1) * 480 : 40 + hash(i, 2) * 260, y = 60 + hash(i, 3) * 780, sz = 10 + floor(hash(i, 4) * 3) * 8;
        const r = s('rect', { x, y, width: sz, height: sz, fill: PAL[i % 6], stroke: INK, 'stroke-width': 3 }, g);
        r.style.transformOrigin = `${x + sz / 2}px ${y + sz / 2}px`;
        px.push(r);
      }
      show(g, 6, 16);
      tl.fromTo(px, { scale: 0 }, { scale: 1, duration: 0.35, ease: 'back.out(3)', stagger: { each: 0.03, from: 'random' } }, 7.2);
      tl.to(px, { y: () => rand(-40, 40) * K, x: () => rand(-30, 30) * K, duration: 6, ease: 'sine.inOut' }, 9.3);
      tl.to(px, { scale: 0, duration: 0.3, ease: 'power2.in', stagger: { each: 0.008, from: 'random' } }, 15.0);
    }

    /* ---- II · Apprendre à voir ------------------------------------------ */
    {
      const sc = scene('od-scene--right od-scene--bottom');
      bigYear(sc, '2013', 16.2, 25, 'od-year--left');
      const k = kicker('II', '2013 · Université de Bourgogne');
      const t1 = title(['Apprendre', 'à voir'], 'od-title--blue');
      const c1 = cap('Master recherche en traitement d’images. Avant de fouiller les données, apprendre à regarder.');
      sc.append(k, t1, c1);
      show(sc, 16, 25);
      inKicker(k, 16.6); inTitle(t1, 17.0); inCap(c1, 18.4);
      outAll(sc, 24.1);
      const g = s('g', { class: 'od-beat' }, svg);
      pulse = { el: g, from: 16, to: 25 };
      const ticks = [];
      [[330, 72, 26], [390, 120, 16], [440, 36, 40]].forEach(([r, n, len], j) => {
        const ring = s('g', {}, g);
        ring.style.transformOrigin = '800px 450px';
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          ticks.push(s('line', { x1: 800 + cos(a) * r, y1: 450 + sin(a) * r, x2: 800 + cos(a) * (r + len), y2: 450 + sin(a) * (r + len), stroke: j === 1 ? '#f2c230' : PAPER, 'stroke-width': j === 2 ? 7 : 4, 'stroke-linecap': 'round' }, ring));
        }
        tl.fromTo(ring, { rotation: 0 }, { rotation: (j % 2 ? -1 : 1) * 90 * K, duration: 9, ease: 'none' }, 16);
      });
      show(g, 16, 25);
      // stroke-opacity, not opacity: 228 translucent elements would each need their own compositing pass
      tl.fromTo(ticks, { attr: { 'stroke-opacity': 0 } }, { attr: { 'stroke-opacity': 0.9 }, duration: 0.2, stagger: { each: 0.006, from: 'random' } }, 16.3);
      tl.to(ticks, { attr: { 'stroke-opacity': 0 }, duration: 0.25, stagger: { each: 0.003, from: 'random' } }, 24.2);
    }

    /* ---- III · Fouiller les motifs -------------------------------------- */
    {
      const sc = scene('od-scene--left');
      const k = kicker('III', '2013 → 2016 · INSA Lyon · LIRIS');
      const t1 = title(['Fouiller', 'les motifs']);
      const c1 = cap('Thèse CIFRE avec Actemium&nbsp;: découvrir des motifs dans des collections de traces, et ce qu’ils disent des anomalies.');
      // a tiny sequential pattern miner: five traces, one frequent pattern lights up in all of them
      const mine = h('figure', 'od-mine od-fx');
      const vb = s('svg', { viewBox: '0 0 560 330', role: 'img', 'aria-label': 'Un motif fréquent retrouvé dans cinq traces' });
      mine.append(vb);
      s('text', { x: 0, y: 18, class: 'od-mine__lab' }, vb).textContent = 'motif fréquent · 5 / 5 traces';
      const PATTERN = [0, 1, 2], tokens = [], hits = [], paths = [];
      for (let row = 0; row < 5; row++) {
        const y = 60 + row * 58, pos = [1 + row % 3, 5 + (row * 2) % 3, 9 + (row % 2) * 2];
        let pts = '';
        for (let i = 0; i < 13; i++) {
          const x = 22 + i * 41, m = pos.indexOf(i), kind = m >= 0 ? PATTERN[m] : floor(hash(row, i) * 4);
          const col = ['#c1473b', '#f2c230', '#8fb4de', '#a5c63b'][kind];
          let el;
          if (kind === 0) el = s('circle', { cx: x, cy: y, r: 12 }, vb);
          else if (kind === 1) el = s('path', { d: `M${x},${y - 14} L${x + 13},${y + 10} L${x - 13},${y + 10}Z` }, vb);
          else if (kind === 2) el = s('rect', { x: x - 11, y: y - 11, width: 22, height: 22 }, vb);
          else el = s('path', { d: `M${x},${y - 14} L${x + 13},${y} L${x},${y + 14} L${x - 13},${y}Z` }, vb);
          el.setAttribute('fill', col); el.setAttribute('stroke', INK); el.setAttribute('stroke-width', 3);
          el.style.transformOrigin = `${x}px ${y}px`;
          tokens.push(el);
          if (m >= 0) { hits.push(el); pts += `${pts ? 'L' : 'M'}${x},${y} `; }
        }
        paths.push(s('path', { d: pts, fill: 'none', stroke: INK, 'stroke-width': 4, 'stroke-dasharray': '1 0' }, vb));
      }
      vb.append(...hits);                        // hits above their link
      sc.append(k, t1, c1, mine);
      show(sc, 25, 31.6);
      inKicker(k, 25.5); inTitle(t1, 25.8); inCap(c1, 27.0);
      tl.fromTo(mine, { opacity: 0, y: 30 * K }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 27.3);
      tl.fromTo(tokens, { scale: 0 }, { scale: 1, duration: 0.3, ease: 'back.out(2.5)', stagger: { each: 0.012, grid: [5, 13], from: 'start' } }, 27.4);
      tl.to(tokens.filter((t) => !hits.includes(t)), { opacity: 0.22, duration: 0.5 }, 28.9);
      tl.to(hits, { scale: 1.45, duration: 0.45, ease: 'back.out(3)', stagger: 0.04 }, 28.9);
      drawOn(paths, 29.2, 0.9, 0.12);
      outAll(sc, 31.0);

      // three papers fly through the reader
      const sc2 = scene('od-scene--center od-scene--3d');
      const papers = [
        ['IEEE DSAA · Paris · 2015', 'When Cyberathletes Conceal Their Game', 'retrouver les alias des joueurs de StarCraft&nbsp;II'],
        ['EGC · Reims · 2016', 'Motifs intelligibles et anomalies dans les traces unitaires', 'fouille de traces'],
        ['IEEE DSAA · Montréal · 2016', 'What Did I Do Wrong in My MOBA Game?', 'motifs de comportements déviants dans Dota&nbsp;2'],
      ].map(([v, t, d], i) => {
        const p = h('article', 'od-paper', `<p class="od-paper__v">${v}</p><h3>${t}</h3><p class="od-paper__d">${d}</p>`);
        p.style.setProperty('--tilt', `${[-4, 3, -2][i]}deg`);
        sc2.prepend(p);
        return p;
      });
      show(sc2, 31.4, 36.2);
      papers.forEach((p, i) => {
        const at = 31.5 + i * 1.35, x = [-22, 20, -4][i];
        tl.fromTo(p, { z: -1600 * K, xPercent: x * 3 * K - 50, yPercent: -50, opacity: 0, rotationY: 30 * K },
          { z: 0, xPercent: x - 50, rotationY: -6 * K, opacity: 1, duration: 1.1, ease: 'expo.out' }, at);
        tl.to(p, { z: 900 * K, opacity: 0, xPercent: x * 2 - 50, rotationY: -24 * K, duration: 0.8, ease: 'power3.in' }, at + 1.55);
      });

      // stamped: 27 September 2016
      const sc3 = scene('od-scene--center');
      const stamp = h('p', 'od-stamp', '27·09·2016');
      const t3 = title(['Docteur.'], 'od-title--paper');
      const years = new Date().getFullYear() - 2016 - ((new Date().getMonth() < 8 || (new Date().getMonth() === 8 && new Date().getDate() < 27)) ? 1 : 0);
      const today = new Date().getMonth() === 8 && new Date().getDate() === 27;
      const by = h('p', 'od-by', today ? `Il y a ${years} ans, jour pour jour.` : `Soutenance à l’INSA Lyon, il y a ${years} ans.`);
      sc3.append(stamp, t3, by);
      show(sc3, 35.9, 39);
      tl.fromTo(stamp, { scale: K ? 3.4 : 1, rotation: -18 * K, opacity: 0 }, { scale: 1, rotation: -7, opacity: 1, duration: 0.5, ease: 'power4.in' }, 35.95);
      inTitle(t3, 36.6, 0.05);
      tl.fromTo(by, { opacity: 0, y: 14 * K }, { opacity: 1, y: 0, duration: 0.6 }, 37.2);
      outAll(sc3, 38.35);
      tl.to(stamp, { scale: K ? 0.4 : 1, opacity: 0, rotation: 20 * K, duration: 0.5, ease: 'power3.in' }, 38.4);
    }

    /* ---- IV · Construire les machines ----------------------------------- */
    {
      const sc = scene('od-scene--left od-scene--bottom');
      bigYear(sc, '2016', 39.3, 51, 'od-year--right');
      const k = kicker('IV', '2016 → 2023 · Ingénieur full-stack');
      const t1 = title(['Construire', 'les machines'], 'od-title--red');
      const c1 = cap('Prosol, Business Geografic, Kuzzle&nbsp;: logiciels métier, visualisation de données, back-ends IoT temps réel.');
      sc.append(k, t1, c1);
      show(sc, 39, 51);
      inKicker(k, 39.5); inTitle(t1, 39.8); inCap(c1, 41.0);
      outAll(sc, 50.1);
      // tech words rushing at the camera
      const sc2 = scene('od-scene--3d od-scene--tunnel');
      const words = ['Java', 'Kotlin', 'Node.js', 'Python', 'TypeScript', 'Elasticsearch', 'Redis', 'PostgreSQL', 'Docker', 'IoT', 'JavaScript', 'SQL'];
      show(sc2, 41.6, 50.8);
      words.forEach((w, i) => {
        const el = h('span', 'od-word', w);
        el.style.background = PAL[i % 6];
        el.style.color = i % 6 === 3 ? PAPER : INK;
        sc2.append(el);
        const a = i * 2.39996, r = 30 + (i % 3) * 7;  // golden-angle spiral, in vmin
        const at = 41.8 + i * 0.62;
        tl.fromTo(el, { xPercent: -50, yPercent: -50, x: `${cos(a) * r}vmin`, y: `${sin(a) * r * 0.8}vmin`, z: -2600 * K, opacity: 0, rotation: rand(-12, 12) },
          { z: 700 * K, opacity: 1, duration: 2.6, ease: 'power2.in' }, at);
        tl.to(el, { opacity: 0, duration: 0.3 }, at + 2.3);
      });
      const g = s('g', {}, svg);
      const g1 = gear(150, 790, 170, 14, g, '#e58a2f'), g2 = gear(1470, 120, 120, 10, g, '#a5c63b'), g3 = gear(1290, 150, 70, 7, g, '#c1473b');
      show(g, 39, 51);
      tl.fromTo([g1, g2, g3], { scale: 0 }, { scale: 1, duration: 0.8, ease: 'back.out(1.8)', stagger: 0.15 }, 39.4);
      tl.fromTo(g1, { rotation: 0 }, { rotation: 200 * K, duration: 11.6, ease: 'none' }, 39.4);
      tl.fromTo(g2, { rotation: 0 }, { rotation: -280 * K, duration: 11.6, ease: 'none' }, 39.4);
      tl.fromTo(g3, { rotation: 0 }, { rotation: 480 * K, duration: 11.6, ease: 'none' }, 39.4);
      tl.to([g1, g2, g3], { scale: 0, duration: 0.5, ease: 'power3.in' }, 50.4);
    }

    /* ---- V · Les machines parlent ---------------------------------------- */
    {
      const sc = scene('od-scene--center');
      const k = kicker('V', '2023 · Carnet de bord');
      const t1 = title(['Puis les machines', 'se mirent à parler'], 'od-title--m od-title--paper');
      const chips = h('ul', 'od-chips');
      ['LLM Papers', 'Build Interpreters with ANTLR4 and GPT', 'Return Kotlin Objects from GPT Output'].forEach((c) => chips.append(h('li', '', c)));
      sc.append(k, t1, chips);
      show(sc, 51, 59);
      inKicker(k, 51.3);
      // the title decodes itself out of noise tokens
      const cs = [...t1.querySelectorAll('.od-c')], real = cs.map((c) => c.textContent), GLY = '▚▞◐◑⟁∑λ#{}<>01/*';
      const dec = { p: 0 };
      tl.set(cs, { opacity: 1 }, 51.4);
      tl.fromTo(dec, { p: 0 }, {
        p: 1, duration: 2.4, ease: 'none',
        onUpdate: () => {
          const step = floor(dec.p * 36);
          cs.forEach((c, i) => { c.textContent = dec.p * (cs.length + 10) > i + 10 ? real[i] : GLY[floor(hash(i, step) * GLY.length)]; });
        },
      }, 51.5);
      tl.fromTo(chips.children, { opacity: 0, y: 20 * K, scale: 0.8 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(2)', stagger: 0.25 }, 54.2);
      outAll(sc, 58.2);
      const rain = h('div', 'od-rain od-fx');
      rain.setAttribute('aria-hidden', 'true');
      const TOK = ['▁le', '▁sens', '</s>', '{', '}', 'λ', '∑', '▁agent', '##ing', '▁RAG', '▁monde', '0.93', '→', '<s>', '▁vecteur', 'tok', '▁GPT', '▁Kotlin', '▁motif', '[CLS]', '▁trace', 'ANTLR', '▁source', '▁?'];
      sc.prepend(rain);
      TOK.concat(TOK).forEach((w, i) => {
        const el = h('span', '', w);
        el.style.left = `${hash(i, 9) * 96}%`;
        el.style.fontSize = `${0.8 + hash(i, 7) * 1.4}rem`;
        rain.append(el);
        const at = 51.2 + hash(i, 5) * 5.5;
        tl.fromTo(el, { y: '110vh', opacity: 0 }, { y: '-20vh', opacity: 1, duration: 2.6 + hash(i, 6) * 2, ease: 'none' }, at);
      });
    }

    /* ---- VI · Dresser des agents ------------------------------------------ */
    {
      const sc = scene('od-scene--right od-scene--top');
      const k = kicker('VI', '2024 → · Freelance IA');
      const t1 = title(['Dresser', 'des agents'], 'od-title--blue');
      const c1 = cap('RAG, LLM et agents sur mesure pour Passerel, Diginov, Smartfire. De petites créatures qui lisent, cherchent et agissent.');
      const bub = h('p', 'od-bubble od-fx', 'À vous de jouer, petits agents&nbsp;!');
      sc.append(k, t1, c1, bub);
      show(sc, 59, 69);
      inKicker(k, 59.6); inTitle(t1, 59.9); inCap(c1, 61.2);
      tl.fromTo(bub, { scale: 0, rotation: -12 * K, opacity: 0 }, { scale: 1, rotation: -3, opacity: 1, duration: 0.6, ease: 'back.out(2.6)' }, 63.4);
      outAll(sc, 68.2);
      // orbits around the palm
      const g = s('g', { class: 'od-orbits' }, svg);
      const cx = 1130, cy = 680, dots = [];
      [[170, 60], [250, 90], [330, 120]].forEach(([rx, ry], j) => {
        const e = s('ellipse', { cx, cy, rx, ry, fill: 'none', stroke: PAPER, 'stroke-width': 3, 'stroke-dasharray': '2 10', 'stroke-linecap': 'round', transform: `rotate(-12 ${cx} ${cy})` }, g);
        dots.push({ e, rx, ry, j });
      });
      const LAB = ['RAG', 'LLM', 'outils', 'mémoire', 'agents', 'sources'];
      const sats = LAB.map((l, i) => {
        const sg = s('g', {}, g);
        s('circle', { r: 16, fill: PAL[i % 6], stroke: INK, 'stroke-width': 4 }, sg);
        const tx = s('text', { class: 'od-sat', x: 22, y: 6 }, sg);
        tx.textContent = l;
        return { sg, o: dots[floor(i / 2)], ph: (i % 2) * PI + floor(i / 2) * 1.1 };   // two moons per orbit, facing each other
      });
      show(g, 59.4, 69);
      tl.fromTo(g, { opacity: 0, scale: 0.6, transformOrigin: `${cx}px ${cy}px` }, { opacity: 1, scale: 1, duration: 1, ease: 'expo.out' }, 60.2);
      const orb = { a: 0 };
      tl.fromTo(orb, { a: 0 }, {
        a: TAU * 1.4 * (K || 0.001), duration: 8.8, ease: 'none',
        onUpdate: () => sats.forEach(({ sg, o, ph }) => {
          const a = orb.a * (1.3 - o.j * 0.3) + ph, c = cos(-0.21), sn = sin(-0.21);
          const x = cos(a) * o.rx, y = sin(a) * o.ry;
          sg.setAttribute('transform', `translate(${cx + x * c - y * sn} ${cy + x * sn + y * c})`);
        }),
      }, 60.2);
      tl.to(g, { opacity: 0, scale: 1.3, duration: 0.6, ease: 'power2.in' }, 68.3);
    }

    /* ---- VII · Intellectuality ------------------------------------------- */
    {
      const sc = scene('od-scene--left od-scene--top');
      const k = kicker('VII', '2025 → · Co-fondateur · direction scientifique');
      const t1 = title(['Intellectuality'], 'od-title--m');
      const c1 = cap('L’IA au service des métiers du chiffre. Avec Patrimind, chaque conclusion est reliée à sa source.');
      sc.append(k, t1, c1);
      show(sc, 69, 79);
      inKicker(k, 69.6); inTitle(t1, 69.9, 0.035); inCap(c1, 71.3);
      outAll(sc, 78.2);
      const g = s('g', {}, svg);
      const cx = 1060, cy = 400, links = [], nodes = [];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU + hash(i, 2), r = 230 + hash(i, 3) * 260;
        const x = cx + cos(a) * r * 1.2, y = cy + sin(a) * r * 0.7;
        links.push(s('path', { d: `M${x},${y} Q${(x + cx) / 2 + (hash(i, 4) - 0.5) * 160},${(y + cy) / 2 - 60} ${cx},${cy}`, fill: 'none', stroke: i % 3 ? PAPER : '#f2c230', 'stroke-width': 2.5 }, g));
        const n = s('g', {}, g);
        s('rect', { x: x - 11, y: y - 14, width: 22, height: 28, fill: PAPER, stroke: INK, 'stroke-width': 3 }, n);
        s('line', { x1: x - 6, y1: y - 5, x2: x + 6, y2: y - 5, stroke: INK, 'stroke-width': 2 }, n);
        s('line', { x1: x - 6, y1: y + 2, x2: x + 4, y2: y + 2, stroke: INK, 'stroke-width': 2 }, n);
        n.style.transformOrigin = `${x}px ${y}px`;
        nodes.push(n);
      }
      const star = s('g', {}, g);
      for (let i = 0; i < 4; i++) s('circle', { cx, cy, r: 34 - i * 8, fill: PAL[i], stroke: INK, 'stroke-width': 4 }, star);
      star.style.transformOrigin = `${cx}px ${cy}px`;
      show(g, 70, 79);
      tl.fromTo(nodes, { scale: 0 }, { scale: 1, duration: 0.4, ease: 'back.out(3)', stagger: { each: 0.05, from: 'random' } }, 70.8);
      drawOn(links, 72.0, 1.1, 0.07);
      tl.fromTo(star, { scale: 0 }, { scale: 1, duration: 0.8, ease: 'elastic.out(1, .4)' }, 73.4);
      tl.to(star, { rotation: 180 * K, duration: 4, ease: 'none' }, 74.2);
      tl.to(g, { opacity: 0, duration: 0.6 }, 78.2);
    }

    /* ---- VIII · Ce qui pousse ici ------------------------------------------ */
    {
      const sc = scene('od-scene--center od-scene--bottom');
      const k = kicker('VIII', 'Aujourd’hui · Morlaix, planète Terre');
      const t1 = title(['Ce qui pousse ici'], 'od-title--m');
      sc.append(k, t1);
      show(sc, 79, 86.4);
      inKicker(k, 79.6); inTitle(t1, 79.9, 0.03);
      outAll(sc, 85.9);
      // a carousel of everything that grows here, orbiting the mandala
      const sc2 = scene('od-scene--3d od-scene--carousel');
      const ring = h('div', 'od-ring');
      sc2.append(ring);
      const ITEMS = ['Patrimind', 'Tamis', 'Kynna', 'PodDrafts', 'MTG Meta History', 'PicSQL', 'Armées', 'Cardwright', 'Synthés modulaires', 'Magic', 'Perry Rhodan', 'Intellectuality'];
      const items = ITEMS.map((t, i) => {
        const el = h('span', 'od-item', t);
        el.style.background = PAL[i % 6];
        el.style.color = i % 6 === 3 ? PAPER : INK;
        el.style.transform = `translate(-50%, -50%) rotateY(${(i / ITEMS.length) * 360}deg) translateZ(var(--ring-r))`;
        ring.append(el);
        return el;
      });
      show(sc2, 80.6, 86.6);
      tl.fromTo(items, { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.08 }, 80.8);
      tl.fromTo(ring, { rotationY: 0, rotationX: -8 }, { rotationY: -300 * (K || 0.05), duration: 5.8, ease: 'power1.inOut' }, 80.8);
      tl.to(ring, { scale: K ? 2.6 : 1, opacity: 0, duration: 0.7, ease: 'power3.in' }, 85.9);

      // climax: what he makes, in three marquees over the posterised face
      const sc3 = scene('od-scene--marquee');
      sc3.setAttribute('aria-label', 'Des agents, des outils et des jeux');
      const rows = ['des agents', 'des outils', 'des jeux'].map((w, i) => {
        const row = h('p', 'od-marq' + (i === 1 ? ' od-marq--fill' : ''));
        row.setAttribute('aria-hidden', 'true');
        row.innerHTML = `<span>${`${w} ✺ `.repeat(8)}</span>`;
        sc3.append(row);
        return row;
      });
      show(sc3, 88.1, 91);
      rows.forEach((row, i) => {
        const dir = i % 2 ? 1 : -1;
        tl.fromTo(row.firstChild, { xPercent: dir > 0 ? -50 : 0 }, { xPercent: dir > 0 ? 0 : -50, duration: 2.9, ease: 'none' }, 88.1);
        tl.fromTo(row, { scaleY: 0, skewY: -6 * K }, { scaleY: 1, skewY: -6 * K, duration: 0.5, ease: 'expo.out' }, 88.2 + i * 0.2);
        tl.to(row, { scaleY: 0, duration: 0.4, ease: 'power3.in' }, 90.3 + i * 0.08);
      });
    }

    /* ---- IX · Signal ----------------------------------------------------- */
    {
      const sc = scene('od-scene--center od-scene--end');
      const k = kicker('IX', 'Fin de la transmission');
      const t1 = title(['Olivier', 'Cavadenti'], 'od-title--xl');
      const lede = h('p', 'od-lede', 'Docteur en data mining, freelance en IA. Je fabrique des agents, des outils et des jeux.');
      const acts = h('p', 'od-acts');
      acts.innerHTML = '<a class="btn" href="https://calendly.com/olivier-cavadenti/contact" target="_blank" rel="noopener">Envoyer un signal</a>'
        + '<button class="btn btn--ghost" type="button" data-od="replay">Revoir le voyage</button>'
        + '<button class="btn btn--ghost" type="button" data-od="close">Retour sur Terre</button>';
      sc.append(k, t1, lede, acts);
      show(sc, 91.2);
      inKicker(k, 91.5); inTitle(t1, 91.8, 0.05);
      tl.fromTo(lede, { opacity: 0, y: 20 * K }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, 93.0);
      tl.fromTo(acts.children, { opacity: 0, y: 20 * K }, { opacity: 1, y: 0, duration: 0.6, ease: 'back.out(2)', stagger: 0.12 }, 93.5);
      tl.set(sc, { pointerEvents: 'auto' }, 93.5);
    }

    tl.set({}, {}, END);
  }

  /* ==========================================================================
     Media
     ========================================================================== */
  function loadImage(n) {
    if (media.img[n]) return media.img[n].p;
    const im = new Image();
    im.decoding = 'async';
    const p = new Promise((res) => {
      im.onload = () => { if (gl) gl.upload(n, im, im.naturalWidth, im.naturalHeight); res(); };
      im.onerror = () => res();
    });
    im.src = ROOT + (n === 'face' ? 'face.jpg' : `${n}.webp`);
    media.img[n] = { el: im, p };
    return p;
  }
  function loadVideo(n) {
    if (RM || media.vid[n]) return media.vid[n] ? media.vid[n].p : Promise.resolve();
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.loop = n === 'mandala';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    const p = new Promise((res) => {
      v.addEventListener('loadeddata', res, { once: true });
      v.addEventListener('error', res, { once: true });
      setTimeout(res, 9000);
    });
    v.src = ROOT + `${n}.mp4`;
    v.load();
    media.vid[n] = { el: v, p };
    return p;
  }
  function loadAudio(given) {
    audio = audio || given || new Audio();
    audio.preload = 'auto';
    if (!audio.src) audio.src = ROOT + 'music.mp3';
    audio.muted = S.muted;
    try {
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) actx = new AC();
      }
      if (actx && !analyser) {
        const src = actx.createMediaElementSource(audio);
        analyser = actx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.6;
        src.connect(analyser); analyser.connect(actx.destination);
        freq = new Uint8Array(analyser.frequencyBinCount);
      }
    } catch (err) { analyser = null; }
    return new Promise((res) => {
      if (audio.readyState >= 3) return res();
      audio.addEventListener('canplaythrough', res, { once: true });
      audio.addEventListener('error', res, { once: true });
      setTimeout(res, 10000);
    });
  }

  /* ==========================================================================
     Playhead
     ========================================================================== */
  function shotAt(t) {
    let i = 0;
    while (i < SHOTS.length - 1 && SHOTS[i + 1].at <= t) i++;
    return i;
  }
  function syncVideos(t, i) {
    const cur = SHOTS[i], prev = SHOTS[i - 1], inTr = prev && cur.tr && t - cur.at < cur.tr;
    for (const n in media.vid) {
      const v = media.vid[n].el;
      const active = (cur.video && cur.src === n) ? cur : (inTr && prev.video && prev.src === n ? prev : null);
      if (!active || !S.playing) { if (!v.paused) v.pause(); if (active) seekVideo(v, active, t); continue; }
      const dur = v.duration || 6;
      if (active.loop) { v.playbackRate = 0.75; if (v.paused) v.play().catch(() => {}); continue; }
      const local = min((t - active.at) * active.rate, (active.clip || dur) - 0.05);
      v.playbackRate = active.rate;
      if (local >= (active.clip || dur) - 0.06) { if (!v.paused) v.pause(); }
      else if (v.paused) v.play().catch(() => {});
      if (abs(v.currentTime - local) > 0.35) v.currentTime = local;
    }
  }
  function seekVideo(v, shot, t) {
    const dur = v.duration || 6;
    const local = shot.loop ? ((t - shot.at) * 0.75) % dur : min(max(0, (t - shot.at) * shot.rate), (shot.clip || dur) - 0.05);
    if (abs(v.currentTime - local) > 0.2) v.currentTime = local;
  }
  function syncAudio() {
    if (!audio) return;
    const dur = audio.duration || END;
    if (!S.playing || S.t >= dur) { if (!audio.paused) audio.pause(); return; }
    if (audio.paused && !S.blocked) audio.play().catch((err) => { if (err.name === 'NotAllowedError') { S.blocked = true; mute(true); } });
    const now = performance.now();
    if (abs(audio.currentTime - S.t) > 0.25 && now - audSeek > 1000) { audSeek = now; audio.currentTime = S.t; }
  }
  function beat() {
    let lv;
    if (analyser && S.playing && !S.muted) {
      analyser.getByteFrequencyData(freq);
      let sum = 0;
      for (let i = 1; i < 8; i++) sum += freq[i];
      lv = (sum / 7 / 255) ** 2.4;
    } else lv = S.playing ? 0.25 + 0.25 * sin(S.t * TAU * 1.83) : 0;
    S.level += (lv - S.level) * (lv > S.level ? 0.5 : 0.12);
    return S.level * K;
  }

  let W = 0, H = 0, quality = 1, fpsN = 0, fpsT = 0, audT = -1, audWall = 0, audSeek = 0, bufSince = 0;
  function resize() {
    if (!glc) return;
    const dpr = min(window.devicePixelRatio || 1, 1.5) * quality;
    let w = innerWidth * dpr, hh = innerHeight * dpr;
    const cap = 2.2e6 / (w * hh);
    if (cap < 1) { w *= Math.sqrt(cap); hh *= Math.sqrt(cap); }
    W = glc.width = round(w); H = glc.height = round(hh);
  }

  function frame(ts) {
    if (!S.open) return;
    const dt = S.last ? min(0.25, (ts - S.last) / 1000) : 0;
    S.last = ts;
    // adaptive resolution: a struggling GPU renders fewer pixels rather than fewer frames
    // (26 fps floor, so phones capped at 30 Hz in low-power mode keep full resolution)
    if (S.playing) {
      fpsN++;
      if (!fpsT) fpsT = ts;
      else if (ts - fpsT > 1000) {
        if ((fpsN * 1000) / (ts - fpsT) < 26 && quality > 0.45) { quality *= 0.8; resize(); }
        fpsN = 0; fpsT = ts;
      }
    }
    // while the soundtrack runs it is the clock, so a slow machine drops frames instead of drifting
    // (only if it is really moving: a muted sink or a suspended context can report "playing" and stand still)
    if (audio && audio.currentTime !== audT) { audT = audio.currentTime; audWall = ts; }
    const aud = audio && S.playing && !audio.paused && audio.readyState >= 3 && ts - audWall < 350 && S.t < (audio.duration || END) - 0.3;
    // and while it buffers, the picture waits for it like a video player would
    let buffering = audio && !audio.error && S.playing && !audio.paused && audio.readyState < 3 && S.t < (audio.duration || END) - 0.3;
    if (!buffering) bufSince = 0; else if (!bufSince) bufSince = ts; else if (ts - bufSince > 3000) buffering = false;   // not forever
    if (aud && abs(audio.currentTime - S.t) < 1) S.t = audio.currentTime;
    else if (S.playing && !buffering) S.t += dt;
    tl.time(min(S.t, END), false);

    const i = shotAt(S.t), cur = SHOTS[i], prev = SHOTS[i - 1];
    syncVideos(S.t, i);
    syncAudio();
    U.beat = beat();
    // only the element that pulses gets the beat: an inherited custom property on the root
    // would restyle every letter span of every scene on every frame
    if (pulse && S.t >= pulse.from && S.t < pulse.to) pulse.el.style.transform = `scale(${(1 + U.beat * 0.07).toFixed(4)})`;
    U.time = S.t * K;
    const mix = prev && cur.tr ? clamp((S.t - cur.at) / cur.tr, 0, 1) : 1;
    // live video frames go straight into their textures
    for (const sh of [cur, mix < 1 ? prev : null]) {
      if (!sh || !sh.video || !gl) continue;
      const v = media.vid[sh.src] && media.vid[sh.src].el;
      if (v && v.readyState >= 2 && v.videoWidth) gl.upload(sh.src, v, v.videoWidth, v.videoHeight);
    }
    if (gl) {
      if (mix < 1) { U.mix = mix; gl.draw(W, H, U, prev, cur); }
      else gl.draw(W, H, U, cur, null);
    } else if (fallback) {
      const want = ROOT + (cur.src === 'face' ? 'face.jpg' : `${cur.src}.webp`);
      if (fallback.dataset.src !== want) { fallback.dataset.src = want; fallback.src = want; }
      fallback.style.opacity = String(1 - U.dark);
    }
    hudUpdate();
    S.raf = requestAnimationFrame(frame);
  }

  /* ==========================================================================
     HUD
     ========================================================================== */
  const fmt = (t) => `${floor(t / 60)}:${String(floor(t % 60)).padStart(2, '0')}`;
  function chapterAt(t) { let c = 0; CHAPTERS.forEach((ch, i) => { if (ch.at <= t) c = i; }); return c; }
  function hudUpdate() {
    const p = min(S.t, END) / END;
    hud.fill.style.transform = `scaleX(${p})`;
    hud.time.textContent = `${fmt(min(S.t, END))} / ${fmt(END)}`;
    hud.track.setAttribute('aria-valuenow', String(round(min(S.t, END))));
    hud.track.setAttribute('aria-valuetext', `${fmt(min(S.t, END))}, ${CHAPTERS[chapterAt(S.t)].label}`);
    const c = chapterAt(S.t);
    if (c !== S.chapter) {
      S.chapter = c;
      hud.chap.innerHTML = `<b>${CHAPTERS[c].n}</b> ${CHAPTERS[c].label}`;
      hud.ticks.forEach((tk, i) => tk.classList.toggle('is-on', i <= c));
      live.textContent = `${CHAPTERS[c].n === '◉' ? '' : 'Chapitre ' + CHAPTERS[c].n + ' : '}${CHAPTERS[c].label}`;
    }
  }
  function setPlaying(on) {
    S.playing = on;
    hud.play.setAttribute('aria-label', S.playing ? 'Pause' : 'Lecture');
    hud.play.classList.toggle('is-paused', !S.playing);
    if (!S.playing) { if (audio) audio.pause(); for (const n in media.vid) media.vid[n].el.pause(); }
    if (S.playing && actx && actx.state === 'suspended') actx.resume();
  }
  function seek(t) {
    S.t = clamp(t, 0, END);
    if (audio && audio.duration) audio.currentTime = min(S.t, audio.duration - 0.05);
    const i = shotAt(S.t);
    for (const sh of [SHOTS[i], SHOTS[i - 1]]) {
      if (sh && sh.video && media.vid[sh.src]) seekVideo(media.vid[sh.src].el, sh, S.t);
    }
    tl.time(min(S.t, END), false);
  }
  function jump(d) {
    const c = chapterAt(S.t);
    const target = d < 0 && S.t - CHAPTERS[c].at > 1.5 ? c : clamp(c + d, 0, CHAPTERS.length - 1);
    seek(CHAPTERS[target].at + (target ? 0.01 : 0));
    setPlaying(true);
  }
  function mute(on) {
    S.muted = on;
    if (audio) audio.muted = on;
    // a click on the sound button is the gesture a blocked autoplay was waiting for
    if (!on && S.blocked && audio) { S.blocked = false; if (S.playing) audio.play().catch(() => {}); }
    hud.sound.setAttribute('aria-pressed', String(!on));
    hud.sound.setAttribute('aria-label', on ? 'Activer le son' : 'Couper le son');
    hud.sound.classList.toggle('is-muted', on);
  }

  /* ==========================================================================
     Open / close
     ========================================================================== */
  function build() {
    root = h('div', 'od');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Mon parcours : voyage animé');
    glc = h('canvas', 'od__gl');
    glc.setAttribute('aria-hidden', 'true');
    root.append(glc);
    try { gl = makeGL(glc); } catch (err) { gl = null; }
    if (!gl) {
      glc.remove();
      fallback = h('img', 'od__fallback');
      fallback.alt = '';
      root.append(fallback);
    }
    svg = s('svg', { class: 'od__svg', viewBox: '0 0 1600 900', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' });
    stage = h('div', 'od__stage');
    root.append(svg, stage, h('div', 'od__grain'));

    const top = h('header', 'od__top');
    top.innerHTML = `<p class="od__brand">Mon parcours <span>· Olivier Cavadenti</span></p>
      <div class="od__btns">
        <button class="od__ib od__ib--sound" type="button" data-od="sound" aria-pressed="true" aria-label="Couper le son"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path class="od__wave" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/><path class="od__x" d="M16 9l6 6M22 9l-6 6"/></svg></button>
        <button class="od__ib" type="button" data-od="close" aria-label="Fermer (Échap)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg></button>
      </div>`;
    const bar = h('footer', 'od__bar');
    bar.innerHTML = `<button class="od__ib od__ib--play" type="button" data-od="play" aria-label="Pause"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="od__pause" d="M7 5v14M17 5v14"/><path class="od__tri" d="M7 4.5l13 7.5-13 7.5z"/></svg></button>
      <p class="od__chap" aria-hidden="true"></p>
      <div class="od__track" role="slider" tabindex="0" aria-label="Position dans le voyage" aria-valuemin="0" aria-valuemax="${END}"><div class="od__fill"></div></div>
      <span class="od__time" aria-hidden="true"></span>`;
    root.append(top, bar);
    hud.play = bar.querySelector('[data-od="play"]');
    hud.sound = top.querySelector('[data-od="sound"]');
    hud.close = top.querySelector('[data-od="close"]');
    hud.chap = bar.querySelector('.od__chap');
    hud.track = bar.querySelector('.od__track');
    hud.fill = bar.querySelector('.od__fill');
    hud.time = bar.querySelector('.od__time');
    hud.ticks = CHAPTERS.map((ch, i) => {
      const b = h('button', 'od__tick');
      b.type = 'button';
      b.style.left = `${(ch.at / END) * 100}%`;
      b.setAttribute('aria-label', `Aller au chapitre ${ch.label}`);
      b.innerHTML = `<span>${ch.n} · ${ch.label}</span>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); seek(ch.at + (i ? 0.01 : 0)); setPlaying(true); });
      hud.track.append(b);
      return b;
    });

    const loader = h('div', 'od__loader');
    loader.innerHTML = '<div class="od__disc" aria-hidden="true"></div><p class="od__ltitle">Ouverture du portail</p><p class="od__lpct">0&nbsp;%</p><p class="od__lhint">Son conseillé · Espace pause · ← → chapitres · Échap pour revenir</p>';
    root.append(loader);
    hud.loader = loader;
    live = h('p', 'od__live');
    live.setAttribute('aria-live', 'polite');
    root.append(live);

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-od]');
      if (!b) return;
      const a = b.dataset.od;
      if (a === 'close') close();
      else if (a === 'play') setPlaying(!S.playing);
      else if (a === 'sound') mute(!S.muted);
      else if (a === 'replay') { seek(0); setPlaying(true); }
    });
    // scrub along the track
    let drag = false;
    const scrub = (e) => { const r = hud.track.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * END); };
    hud.track.addEventListener('pointerdown', (e) => { if (e.target.closest('.od__tick')) return; drag = true; hud.track.setPointerCapture(e.pointerId); scrub(e); });
    hud.track.addEventListener('pointermove', (e) => { if (drag) scrub(e); });
    hud.track.addEventListener('pointerup', () => { drag = false; });
    root.addEventListener('pointermove', (e) => {
      if (RM) return;
      gsap.to(U, { mx: (e.clientX / innerWidth - 0.5) * 2, my: -(e.clientY / innerHeight - 0.5) * 2, duration: 1.2, ease: 'power2.out', overwrite: true });
    });
    document.body.append(root);
    compose();
  }

  function onKey(e) {
    if (!S.open) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === ' ' && !e.target.closest('a, button:not(.od__track)')) { e.preventDefault(); setPlaying(!S.playing); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); jump(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); jump(-1); }
    else if (e.key === 'm' || e.key === 'M') mute(!S.muted);
    else if (e.key === 'Tab') {                 // keep focus inside the dialog
      const f = [...root.querySelectorAll('button, a[href], [tabindex="0"]')].filter((x) => x.offsetParent !== null && getComputedStyle(x).visibility !== 'hidden');
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }

  async function open({ x = innerWidth / 2, y = innerHeight / 2, from = null, audio: given = null, ctx = null } = {}) {
    if (S.open) return;
    S.from = from;
    if (ctx && !actx) actx = ctx;
    if (!root) build();
    else root.hidden = false;
    S.open = true;
    document.documentElement.classList.add('is-od');
    resize();
    addEventListener('resize', resize);
    addEventListener('keydown', onKey);
    root.style.setProperty('--ox', `${x}px`);
    root.style.setProperty('--oy', `${y}px`);
    gsap.fromTo(root, { clipPath: `circle(0% at ${x}px ${y}px)` }, { clipPath: `circle(150% at ${x}px ${y}px)`, duration: RM ? 0.01 : 1.1, ease: 'expo.inOut' });
    hud.play.focus({ preventScroll: true });
    S.t = 0; S.last = 0; S.chapter = -1;
    tl.time(0, false);
    setPlaying(false);
    S.raf = requestAnimationFrame(frame);

    // preload: the soundtrack and the first three shots gate the start, the rest streams behind
    const need = [loadAudio(given), ...FIRST.map(loadImage), loadVideo('portal')];
    let done = 0;
    const pct = hud.loader.querySelector('.od__lpct');
    need.forEach((p) => p.then(() => { done++; pct.textContent = `${round((done / need.length) * 100)} %`; }));
    hud.loader.classList.remove('is-gone');
    await Promise.all(need);
    IMAGES.forEach(loadImage);
    VIDEOS.forEach(loadVideo);
    if (!S.open) return;
    gsap.to(hud.loader, { autoAlpha: 0, scale: 1.2, duration: 0.6, ease: 'power2.in', onComplete: () => hud.loader.classList.add('is-gone') });
    setTimeout(() => { if (S.open) { seek(0); setPlaying(true); } }, 450);
  }

  function close() {
    if (!S.open) return;
    setPlaying(false);
    const x = parseFloat(root.style.getPropertyValue('--ox')) || innerWidth / 2, y = parseFloat(root.style.getPropertyValue('--oy')) || innerHeight / 2;
    removeEventListener('keydown', onKey);
    removeEventListener('resize', resize);
    gsap.to(root, {
      clipPath: `circle(0% at ${x}px ${y}px)`, duration: RM ? 0.01 : 0.8, ease: 'expo.inOut',
      onComplete: () => {
        S.open = false;
        cancelAnimationFrame(S.raf);
        root.hidden = true;
        document.documentElement.classList.remove('is-od');
        gsap.set(hud.loader, { autoAlpha: 1, scale: 1 });
        if (S.from) S.from.focus({ preventScroll: true });
      },
    });
  }

  window.OCParcours = { open, close, seek, play: setPlaying };
})();
