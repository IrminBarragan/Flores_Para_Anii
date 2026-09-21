/* El jardín: todo se dibuja en un <canvas>.
   - Las flores crecen (tallo → capullo → flor) conforme ella avanza en la página.
   - Al tocar el jardín, brota una flor justo ahí.
   - El cielo pasa poco a poco del atardecer al amanecer dorado. */
(function () {
  'use strict';

  /* ---------- utilidades ---------- */
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function weighted(list) {
    let sum = 0; list.forEach(l => { sum += l[1]; });
    let r = Math.random() * sum;
    for (let i = 0; i < list.length; i++) { r -= list[i][1]; if (r <= 0) return list[i][0]; }
    return list[0][0];
  }

  const hexCache = {};
  const rgb = h => hexCache[h] || (hexCache[h] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  function mixc(a, b, t) {
    const A = rgb(a), B = rgb(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }

  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SWAY = REDUCED ? 0.25 : 1;

  /* ---------- lienzo ---------- */
  const canvas = document.getElementById('garden');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1, U = 0, spriteDPR = 0;

  /* ---------- paletas ---------- */
  const SKY = {
    stops: [0, 0.38, 0.64, 0.84, 1],
    dusk: ['#120c36', '#33176a', '#7d3387', '#dd5f7b', '#ffa45c'],
    dawn: ['#4f7fd4', '#8fa4ea', '#f2b5c6', '#ffd39b', '#fff0b8']
  };
  const SUN_DUSK = ['rgba(255,196,96,.85)', 'rgba(255,120,110,.32)', 'rgba(255,120,110,0)'];
  const SUN_DAWN = ['rgba(255,252,220,.95)', 'rgba(255,228,150,.4)', 'rgba(255,228,150,0)'];

  const HILLS = [
    { base: 0.705, dusk: '#3d2b7c', dawn: '#9dbfa8', a1: 0.020, f1: 1.1, p1: 0.6, a2: 0.008, f2: 2.7, p2: 1.9 },
    { base: 0.790, dusk: '#2a2266', dawn: '#79b47f', a1: 0.018, f1: 1.6, p1: 2.4, a2: 0.007, f2: 3.4, p2: 0.3 },
    { base: 0.870, dusk: '#173a44', dawn: '#55a35e', a1: 0.016, f1: 1.3, p1: 4.1, a2: 0.006, f2: 3.9, p2: 2.2 },
    { base: 0.950, dusk: '#0f2c25', dawn: '#3a8f45', a1: 0.012, f1: 1.9, p1: 1.2, a2: 0.005, f2: 4.6, p2: 3.3 }
  ];
  const hillY = (i, nx) => {
    const h = HILLS[i];
    return H * (h.base + h.a1 * Math.sin(nx * h.f1 * TAU + h.p1) + h.a2 * Math.sin(nx * h.f2 * TAU + h.p2));
  };

  const STEM = { dusk: ['#2b6f55', '#1f7f48', '#28963f'], dawn: ['#5aa66c', '#3f9a4d', '#2f9a3f'] };
  const LEAF = { dusk: ['#27664f', '#237a44', '#2c8f42'], dawn: ['#6cb47a', '#4aa858', '#3aa049'] };
  const GRASS = [
    null,
    { dusk: ['#1d4f4a', '#26605a', '#2c6b5c'], dawn: ['#5aa96a', '#6cb877', '#4c9d5c'] },
    { dusk: ['#1c5a3d', '#257048', '#2c8050'], dawn: ['#4c9f55', '#5fb562', '#3f9147'] },
    { dusk: ['#175232', '#1f6c3e', '#2a8a48'], dawn: ['#3f9a48', '#52ad55', '#37883f'] }
  ];

  /* ---------- tipos de flor ---------- */
  const RADIUS = { sunflower: 0.085, daisy: 0.058, tulip: 0.036, buttercup: 0.036, daffodil: 0.05 };
  const STEM_W = { sunflower: 0.012, daisy: 0.0075, tulip: 0.008, buttercup: 0.006, daffodil: 0.0072 };
  const EXT = {                       // izquierda, derecha, arriba, abajo (en radios) alrededor del punto de unión
    sunflower: [1.12, 1.12, 1.12, 1.12],
    daisy: [1.12, 1.12, 1.12, 1.12],
    buttercup: [1.12, 1.12, 1.12, 1.12],
    daffodil: [1.12, 1.12, 1.12, 1.12],
    tulip: [1.55, 1.55, 2.3, 0.45]
  };
  const ROW_K = [0.58, 0.78, 1];
  const H_RANGE = [[0.10, 0.19], [0.14, 0.27], [0.19, 0.40]];   // largo del tallo (fracción del alto)

  /* ---------- dibujo de las cabezas de flor (se dibujan una vez y se reusan) ---------- */
  function petalPath(g, r0, r1, w) {
    const L = r1 - r0;
    g.beginPath();
    g.moveTo(0, -r0);
    g.bezierCurveTo(w, -r0 - L * 0.28, w * 0.95, -r0 - L * 0.72, 0, -r1);
    g.bezierCurveTo(-w * 0.95, -r0 - L * 0.72, -w, -r0 - L * 0.28, 0, -r0);
    g.closePath();
  }
  function roundPetalPath(g, r0, r1, w) {
    const L = r1 - r0;
    g.beginPath();
    g.moveTo(0, -r0);
    g.bezierCurveTo(w * 1.1, -r0 - L * 0.12, w * 1.3, -r1, 0, -r1);
    g.bezierCurveTo(-w * 1.3, -r1, -w * 1.1, -r0 - L * 0.12, 0, -r0);
    g.closePath();
  }
  function ring(g, n, off, r0, r1, w, cols, round) {
    const grad = g.createLinearGradient(0, -r0, 0, -r1);
    grad.addColorStop(0, cols[0]); grad.addColorStop(0.55, cols[1]); grad.addColorStop(1, cols[2]);
    g.fillStyle = grad;
    g.strokeStyle = 'rgba(150,80,0,.32)';
    g.lineWidth = Math.max(0.5, r1 * 0.012);
    for (let i = 0; i < n; i++) {
      g.save();
      g.rotate(off + i * TAU / n);
      (round ? roundPetalPath : petalPath)(g, r0, r1, w);
      g.fill(); g.stroke();
      g.restore();
    }
  }
  function disc(g, r, fill) {
    g.fillStyle = fill; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  }

  function drawSunflower(g, R, v) {
    const n = v ? 24 : 20, Rd = R * 0.5;
    ring(g, n, 0, Rd * 0.75, R, R * 0.17, ['#dc8c00', '#ffb700', '#ffd54a']);
    ring(g, n, TAU / n / 2, Rd * 0.8, R * 0.92, R * 0.16, ['#f2a300', '#ffc61f', '#ffe680']);
    disc(g, Rd * 1.08, 'rgba(90,45,0,.35)');
    const dg = g.createRadialGradient(0, 0, 0, 0, 0, Rd);
    dg.addColorStop(0, '#2a1508'); dg.addColorStop(0.65, '#4a2a10'); dg.addColorStop(1, '#6f431a');
    disc(g, Rd, dg);
    // semillas en espiral (ángulo áureo)
    const N = Math.max(90, Math.round(Rd * Rd / 6));
    const c = Rd / Math.sqrt(N);
    for (let i = 1; i <= N; i++) {
      const r = c * Math.sqrt(i) * 0.98, a = i * 2.399963, tt = r / Rd;
      g.fillStyle = tt > 0.8 ? '#d09030' : (i % 2 ? '#8a5522' : '#3a200c');
      g.beginPath();
      g.arc(r * Math.cos(a), r * Math.sin(a), Math.max(0.55, c * (0.34 + 0.16 * tt)), 0, TAU);
      g.fill();
    }
    const hl = g.createRadialGradient(-Rd * 0.3, -Rd * 0.35, 0, -Rd * 0.3, -Rd * 0.35, Rd * 0.9);
    hl.addColorStop(0, 'rgba(255,230,170,.24)'); hl.addColorStop(1, 'rgba(255,230,170,0)');
    disc(g, Rd, hl);
    g.strokeStyle = 'rgba(40,20,0,.55)'; g.lineWidth = Math.max(0.8, R * 0.025);
    g.beginPath(); g.arc(0, 0, Rd, 0, TAU); g.stroke();
  }

  function drawDaisy(g, R, v) {
    const n = v ? 15 : 13;
    ring(g, n, 0, R * 0.22, R, R * 0.13, ['#f0a800', '#ffcf1a', '#ffe766'], true);
    ring(g, n, TAU / n / 2, R * 0.22, R * 0.88, R * 0.12, ['#f7bd00', '#ffdb33', '#fff08c'], true);
    const cg = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.3);
    cg.addColorStop(0, '#ffb300'); cg.addColorStop(0.7, '#f08a00'); cg.addColorStop(1, '#c86400');
    disc(g, R * 0.3, cg);
    for (let i = 1; i < 26; i++) {
      const r = R * 0.3 * Math.sqrt(i / 26) * 0.9, a = i * 2.39996;
      g.fillStyle = i % 2 ? '#b45309' : '#ffcf40';
      g.beginPath(); g.arc(r * Math.cos(a), r * Math.sin(a), Math.max(0.4, R * 0.028), 0, TAU); g.fill();
    }
  }

  function drawButtercup(g, R, v) {
    const pr = R * 0.46, cy = -R * 0.55;
    for (let i = 0; i < 5; i++) {
      g.save();
      g.rotate(i * TAU / 5 + v * 0.35);
      const gr = g.createRadialGradient(0, cy - pr * 0.25, pr * 0.1, 0, cy, pr);
      gr.addColorStop(0, '#fff59a'); gr.addColorStop(0.55, '#ffd90f'); gr.addColorStop(1, '#f0b000');
      g.fillStyle = gr; g.strokeStyle = 'rgba(180,110,0,.3)'; g.lineWidth = Math.max(0.5, R * 0.015);
      g.beginPath(); g.arc(0, cy, pr, 0, TAU); g.fill(); g.stroke();
      g.restore();
    }
    const cg = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.2);
    cg.addColorStop(0, '#a9b52a'); cg.addColorStop(1, '#d9b000');
    disc(g, R * 0.2, cg);
    g.fillStyle = '#fff2a0';
    for (let i = 0; i < 10; i++) {
      const a = i * TAU / 10;
      g.beginPath(); g.arc(Math.cos(a) * R * 0.27, Math.sin(a) * R * 0.27, Math.max(0.5, R * 0.04), 0, TAU); g.fill();
    }
  }

  function drawDaffodil(g, R) {
    ring(g, 6, 0, R * 0.1, R, R * 0.33, ['#f7cf3a', '#ffe680', '#fff4b8']);
    ring(g, 6, TAU / 12, R * 0.1, R * 0.96, R * 0.31, ['#f2c52c', '#ffe066', '#fff0a8']);
    const rr = R * 0.4;
    g.beginPath();
    for (let k = 0; k <= 72; k++) {
      const a = k / 72 * TAU, r = rr * (1 + 0.09 * Math.cos(a * 9));
      if (k) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(r, 0);
    }
    g.closePath();
    const cg = g.createRadialGradient(0, 0, rr * 0.1, 0, 0, rr * 1.05);
    cg.addColorStop(0, '#c26400'); cg.addColorStop(0.5, '#ee8b00'); cg.addColorStop(0.85, '#ffb51f'); cg.addColorStop(1, '#ffd24a');
    g.fillStyle = cg; g.fill();
    g.strokeStyle = 'rgba(160,80,0,.4)'; g.lineWidth = Math.max(0.6, R * 0.02); g.stroke();
    disc(g, rr * 0.5, 'rgba(120,50,0,.4)');
  }

  function drawTulip(g, R) {
    const L = R * 1.95, w = R * 0.62, lean = 0.34;
    g.strokeStyle = 'rgba(150,80,0,.4)';
    g.lineWidth = Math.max(0.6, R * 0.03);
    [-1, 1].forEach(dir => {
      g.save();
      g.rotate(dir * lean);
      const gr = g.createLinearGradient(0, 0, 0, -L);
      gr.addColorStop(0, '#dc8a00'); gr.addColorStop(0.5, '#ffc61a'); gr.addColorStop(1, '#ffe06a');
      g.fillStyle = gr;
      petalPath(g, 0, L * 0.96, w); g.fill(); g.stroke();
      g.restore();
    });
    const gr = g.createLinearGradient(0, 0, 0, -L);
    gr.addColorStop(0, '#f0a400'); gr.addColorStop(0.45, '#ffd12b'); gr.addColorStop(1, '#fff08a');
    g.fillStyle = gr;
    petalPath(g, R * 0.05, L, w * 1.08); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = R * 0.08; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-w * 0.4, -L * 0.25); g.quadraticCurveTo(-w * 0.6, -L * 0.6, -w * 0.28, -L * 0.85); g.stroke();
    g.fillStyle = '#2f9a3f';
    g.beginPath(); g.ellipse(0, R * 0.02, R * 0.34, R * 0.2, 0, 0, TAU); g.fill();
  }

  const DRAW = {
    sunflower: drawSunflower, daisy: drawDaisy, buttercup: drawButtercup,
    daffodil: drawDaffodil, tulip: drawTulip
  };

  const sprites = {};
  function makeSprite(type, R, variant) {
    const e = EXT[type];
    const l = Math.ceil(e[0] * R), r = Math.ceil(e[1] * R), t = Math.ceil(e[2] * R), b = Math.ceil(e[3] * R);
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.ceil((l + r) * DPR));
    c.height = Math.max(2, Math.ceil((t + b) * DPR));
    const g = c.getContext('2d');
    g.scale(DPR, DPR);
    g.translate(l, t);
    DRAW[type](g, R, variant);
    return { c: c, l: l, t: t, w: l + r, h: t + b };
  }
  function spriteFor(type, row, variant) {
    const key = type + row + variant;
    return sprites[key] || (sprites[key] = makeSprite(type, RADIUS[type] * U * ROW_K[row], variant));
  }
  function warmSprites() {
    Object.keys(RADIUS).forEach(t => [0, 1, 2].forEach(r => [0, 1].forEach(v => spriteFor(t, r, v))));
  }

  // halo suave para las luciérnagas y las flores
  const glowC = document.createElement('canvas');
  glowC.width = glowC.height = 96;
  (function () {
    const g = glowC.getContext('2d');
    const gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    gr.addColorStop(0, 'rgba(255,240,170,1)');
    gr.addColorStop(0.25, 'rgba(255,214,90,.55)');
    gr.addColorStop(1, 'rgba(255,200,60,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 96, 96);
  })();

  /* ---------- estado ---------- */
  let started = false, startTime = 0, progress = 0, skyMix = 0, finaleDone = false;
  let rows = [[], [], []], all = [], planted = [];
  let grass = [null, [], [], []], stars = [], flies = [];
  const petals = [];
  let wind = 0, last = 0, ambientTimer = 2;

  function makeFlower(row, nx, type, hk) {
    const range = H_RANGE[row];
    const leaves = [];
    if (type === 'tulip' || type === 'daffodil') {
      const s0 = Math.random() < 0.5 ? 1 : -1;
      leaves.push({ kind: 'blade', t: 0.03, side: s0, s: rand(0.85, 1.1) });
      leaves.push({ kind: 'blade', t: 0.06, side: -s0, s: rand(0.7, 0.95) });
    } else {
      const nl = type === 'sunflower' ? 3 : 2;
      const s0 = Math.random() < 0.5 ? 1 : -1;
      for (let i = 0; i < nl; i++) {
        leaves.push({ kind: 'wide', t: 0.2 + i * 0.16 + rand(0, 0.06), side: i % 2 ? -s0 : s0, s: rand(0.85, 1.15) });
      }
    }
    return {
      row: row, nx: nx, type: type,
      hk: hk || rand(range[0], range[1]),
      variant: Math.random() < 0.5 ? 0 : 1,
      size: rand(0.86, 1.12),
      lean: rand(-0.07, 0.07),
      bend: rand(-0.4, 0.4),
      phase: rand(0, TAU), speed: rand(0.75, 1.2),
      leaves: leaves,
      born: null, delay: 0, dur: 3200 * (REDUCED ? 0.5 : 1), unlock: 0
    };
  }

  function seed() {
    rows = [[], [], []]; all = []; planted = [];
    const counts = [
      clamp(Math.round(W / (U * 0.07)), 13, 34),
      clamp(Math.round(W / (U * 0.11)), 9, 22),
      clamp(Math.round(W / (U * 0.17)), 6, 14)
    ];
    const mixes = [
      [['buttercup', 4], ['daisy', 3], ['sunflower', 1]],
      [['daisy', 3], ['tulip', 3], ['sunflower', 3], ['daffodil', 2], ['buttercup', 1]],
      [['sunflower', 5], ['tulip', 3], ['daffodil', 2], ['daisy', 1]]
    ];
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < counts[r]; i++) {
        const nx = clamp((i + 0.5 + rand(-0.4, 0.4)) / counts[r], 0.02, 0.98);
        const f = makeFlower(r, nx, weighted(mixes[r]));
        f.dur = rand(2600, 3800) * (REDUCED ? 0.5 : 1);
        rows[r].push(f); all.push(f);
      }
    }
    // orden de aparición: algunas desde el inicio y el resto conforme ella avanza
    const order = all.slice().sort(() => Math.random() - 0.5);
    const nStart = Math.round(all.length * 0.3);
    order.forEach((f, i) => {
      if (i < nStart) { f.unlock = 0; f.delay = rand(0, 2800); }
      else { f.unlock = rand(0.04, 0.92); f.delay = rand(0, 700); }
    });
    // que al menos un par de flores grandes del frente estén desde el inicio
    rows[2].slice(0, 3).forEach(f => { f.unlock = 0; f.delay = rand(600, 2200); });

    // pasto
    [1, 2, 3].forEach(i => {
      const n = Math.round(W / [10, 7, 6][i - 1]);
      grass[i] = [];
      for (let k = 0; k < n; k++) {
        grass[i].push({ nx: Math.random(), h: rand(0.6, 1) * [0.024, 0.032, 0.05][i - 1], lean: rand(-1, 1), ph: rand(0, TAU), c: k % 3 });
      }
    });
    // estrellas y luciérnagas
    stars = [];
    for (let k = 0; k < 70; k++) stars.push({ x: Math.random(), y: rand(0.02, 0.55), r: rand(0.5, 1.5), a: rand(0.5, 1), sp: rand(0.8, 2.4), ph: rand(0, TAU) });
    flies = [];
    for (let k = 0; k < 34; k++) flies.push({ x: Math.random(), y: rand(0.35, 0.97), ph: rand(0, TAU), sp: rand(0.35, 0.9), s: rand(0.7, 1.5) });
  }

  /* ---------- tamaño ---------- */
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    if (w === W && h === H && dpr === DPR) return;
    W = w; H = h; DPR = dpr;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const nU = Math.min(W, H * 0.9);
    if (!U || Math.abs(nU - U) / U > 0.03 || DPR !== spriteDPR) {
      U = nU; spriteDPR = DPR;
      Object.keys(sprites).forEach(k => { delete sprites[k]; });
      warmSprites();
    }
  }

  /* ---------- partículas ---------- */
  function spawnPetal(x, y, vx, vy, isBurst, life) {
    petals.push({
      x: x, y: y, vx: vx, vy: vy,
      rot: rand(0, TAU), vr: rand(-3, 3), flip: rand(0, TAU), vf: rand(2, 5),
      s: rand(0.011, 0.02) * U, col: pick(['#ffd83a', '#ffc61a', '#ffe680', '#ffb800', '#fff0a0']),
      burst: isBurst, life: life || 99, age: 0
    });
  }
  function burst(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(60, 230);
      spawnPetal(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 120, true, rand(1.1, 2.0));
    }
  }
  function rain(n) {
    for (let i = 0; i < n; i++) spawnPetal(rand(0, W), rand(-H * 0.6, -10), rand(-15, 15), rand(40, 80), false);
  }

  function updatePetals(dt) {
    let falling = 0;
    for (let i = petals.length - 1; i >= 0; i--) {
      const p = petals[i];
      p.age += dt;
      p.rot += p.vr * dt; p.flip += p.vf * dt;
      if (p.burst) {
        p.vy += 380 * dt; p.vx *= 0.985;
        if (p.age > p.life) { petals.splice(i, 1); continue; }
      } else {
        falling++;
        p.vx = Math.sin(p.age * 1.2 + p.rot) * 26 + wind * 14;
        if (p.y > H + 24) { petals.splice(i, 1); continue; }
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    ambientTimer -= dt;
    if (started && !REDUCED && ambientTimer <= 0) {
      ambientTimer = rand(0.9, 1.9);
      if (falling < 14) spawnPetal(rand(0, W), -12, 0, rand(38, 70), false);
    }
  }

  /* ---------- dibujo ---------- */
  function drawSky(t, m) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    for (let i = 0; i < SKY.stops.length; i++) g.addColorStop(SKY.stops[i], mixc(SKY.dusk[i], SKY.dawn[i], m));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    [[SUN_DUSK, 1 - m], [SUN_DAWN, m]].forEach(pair => {
      if (pair[1] < 0.01) return;
      const x = W * 0.72, y = H * 0.73, r = Math.max(W, H) * 0.8;
      const sg = ctx.createRadialGradient(x, y, 0, x, y, r);
      sg.addColorStop(0, pair[0][0]); sg.addColorStop(0.28, pair[0][1]); sg.addColorStop(1, pair[0][2]);
      ctx.globalAlpha = pair[1]; ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
    });
    ctx.globalAlpha = 1;
    const a0 = Math.pow(1 - m, 1.4);
    if (a0 > 0.02) {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        ctx.globalAlpha = a0 * s.a * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph)));
        ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawHill(i, m) {
    const h = HILLS[i];
    const top = mixc(h.dusk, h.dawn, m);
    const bottom = mixc(mixc2(h.dusk, '#0a0620', 0.5), mixc2(h.dawn, '#1f5a2a', 0.45), m);
    const g = ctx.createLinearGradient(0, H * (h.base - 0.03), 0, H);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    ctx.beginPath();
    ctx.moveTo(-10, H + 10);
    for (let x = -10; x <= W + 10; x += 10) ctx.lineTo(x, hillY(i, x / W));
    ctx.lineTo(W + 10, H + 10);
    ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,196,120,' + (0.2 - 0.06 * m) + ')';
    ctx.lineWidth = 1.2; ctx.stroke();
  }
  // mezcla de dos colores hex que devuelve otro hex (para poder volver a mezclarlo)
  function mixc2(a, b, t) {
    const A = rgb(a), B = rgb(b);
    const h = v => ('0' + Math.round(v).toString(16)).slice(-2);
    return '#' + h(A[0] + (B[0] - A[0]) * t) + h(A[1] + (B[1] - A[1]) * t) + h(A[2] + (B[2] - A[2]) * t);
  }

  function drawGrass(i, m, t, grow) {
    if (grow <= 0.01) return;
    const list = grass[i], cols = GRASS[i];
    ctx.lineCap = 'round';
    ctx.lineWidth = [1.4, 1.7, 2.1][i - 1] * Math.max(0.8, U / 500);
    for (let c = 0; c < 3; c++) {
      ctx.strokeStyle = mixc(cols.dusk[c], cols.dawn[c], m);
      ctx.beginPath();
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (b.c !== c) continue;
        const x = b.nx * W, y = hillY(i, b.nx) + 3, h = b.h * H * grow;
        const sw = Math.sin(t * 1.6 + b.ph + b.nx * 6) * h * 0.2 * SWAY + wind * h * 0.12 * SWAY;
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + b.lean * h * 0.15 + sw * 0.4, y - h * 0.6, x + b.lean * h * 0.5 + sw, y - h);
      }
      ctx.stroke();
    }
  }

  const bez = (a, b, c, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;

  function drawFlower(f, now, t, m, stemCol, leafCol) {
    const gr = f.born === null ? 0 : (now - f.born) / f.dur;
    if (gr <= 0) return;
    const g = clamp(gr);
    const rk = ROW_K[f.row];
    const Rb = RADIUS[f.type] * U * rk * f.size;
    const rx = f.nx * W, ry = hillY(f.row + 1, f.nx) + 4;
    const height = f.hk * H;
    const sw = (Math.sin(t * f.speed + f.nx * 5 + f.phase) * 0.65 + wind * 0.35) * height * 0.05 * SWAY;
    const tx = rx + f.lean * height + sw, ty = ry - height;
    const cx = rx + f.lean * height * 0.25 + f.bend * height * 0.32 + sw * 0.35, cy = ry - height * 0.58;

    const stemT = easeOutCubic(clamp(g / 0.66));
    const q1x = rx + (cx - rx) * stemT, q1y = ry + (cy - ry) * stemT;
    const ex = bez(rx, cx, tx, stemT), ey = bez(ry, cy, ty, stemT);

    // tallo
    ctx.strokeStyle = stemCol;
    ctx.lineWidth = Math.max(1.4, STEM_W[f.type] * U * rk * f.size);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.quadraticCurveTo(q1x, q1y, ex, ey); ctx.stroke();

    // hojas
    ctx.fillStyle = leafCol;
    for (let i = 0; i < f.leaves.length; i++) {
      const lf = f.leaves[i];
      if (stemT <= lf.t + 0.03) continue;
      const grow = easeOutCubic(clamp((stemT - lf.t - 0.03) / 0.3));
      const px = bez(rx, cx, tx, lf.t), py = bez(ry, cy, ty, lf.t);
      const dx = 2 * (1 - lf.t) * (cx - rx) + 2 * lf.t * (tx - cx), dy = 2 * (1 - lf.t) * (cy - ry) + 2 * lf.t * (ty - cy);
      const blade = lf.kind === 'blade';
      const ang = Math.atan2(dy, dx) + lf.side * (blade ? 0.32 : 0.95) + Math.sin(t * 1.3 + f.phase + i) * 0.06 * SWAY;
      const LL = (blade ? height * 0.4 : Rb * 1.15) * lf.s * grow;
      const LW = LL * (blade ? 0.085 : 0.32);
      ctx.save();
      ctx.translate(px, py); ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(LL * 0.25, -LW, LL * 0.7, -LW * 0.9, LL, blade ? LL * 0.06 : 0);
      ctx.bezierCurveTo(LL * 0.7, LW * 0.55, LL * 0.25, LW * 0.6, 0, 0);
      ctx.fill();
      if (!blade) {
        ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(LL * 0.85, 0); ctx.stroke();
      }
      ctx.restore();
    }

    // cabeza: capullo → flor
    const bloomT = clamp((g - 0.6) / 0.4);
    let ang = Math.atan2(ex - q1x, -(ey - q1y));
    if (!isFinite(ang) || (Math.abs(ex - q1x) < 0.001 && Math.abs(ey - q1y) < 0.001)) ang = 0;
    ctx.save();
    ctx.translate(ex, ey); ctx.rotate(ang);

    if (bloomT > 0) {
      const gs = Rb * 3.6 * (0.6 + 0.4 * bloomT);
      ctx.globalAlpha = 0.34 * (1 - 0.55 * m) * clamp(bloomT * 2);
      ctx.drawImage(glowC, -gs / 2, -gs / 2, gs, gs);
    }
    const budA = clamp(1 - bloomT * 1.7) * smooth(0.55, 1, stemT);
    if (budA > 0.01) {
      const bw = Rb * 0.32, bh = Rb * 0.55;
      ctx.globalAlpha = budA;
      ctx.fillStyle = leafCol;
      ctx.beginPath(); ctx.ellipse(0, -bh * 0.55, bw, bh, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd230';
      ctx.beginPath(); ctx.ellipse(0, -bh * 1.02, bw * 0.55, bh * 0.5, 0, 0, TAU); ctx.fill();
    }
    if (bloomT > 0) {
      const sp = spriteFor(f.type, f.row, f.variant);
      const s = Math.max(0.01, easeOutBack(bloomT)) * f.size;
      ctx.globalAlpha = clamp(bloomT * 2.4);
      ctx.scale(s, s);
      ctx.drawImage(sp.c, -sp.l, -sp.t, sp.w, sp.h);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawPetals() {
    for (let i = 0; i < petals.length; i++) {
      const p = petals[i];
      ctx.globalAlpha = p.burst ? clamp((p.life - p.age) / (p.life * 0.4)) : 1;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(p.flip)));
      ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.ellipse(0, 0, p.s * 0.5, p.s, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawFlies(t, m) {
    ctx.globalCompositeOperation = 'lighter';
    const base = 1 - 0.55 * m;
    for (let i = 0; i < flies.length; i++) {
      const f = flies[i];
      const x = f.x * W + Math.sin(t * f.sp + f.ph) * 34 * SWAY;
      const y = f.y * H + Math.cos(t * f.sp * 0.8 + f.ph * 1.7) * 22 * SWAY;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.6 + f.ph * 3);
      const sz = (10 + 12 * f.s) * (U / 390 > 1.6 ? 1.6 : Math.max(0.8, U / 390));
      ctx.globalAlpha = (0.25 + 0.75 * pulse) * base * 0.9;
      ctx.drawImage(glowC, x - sz / 2, y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- bucle principal ---------- */
  function frame(now) {
    requestAnimationFrame(frame);
    if (!W || !U) return;
    const t = now / 1000;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;

    skyMix += (smooth(0.08, 0.95, progress) - skyMix) * (1 - Math.exp(-dt * 1.6));
    const m = skyMix;
    wind = Math.sin(t * 0.5) * 0.7 + Math.sin(t * 1.3 + 2) * 0.3;

    // las flores empiezan a crecer cuando ella llega a su parte de la página
    if (started) {
      for (let i = 0; i < all.length; i++) {
        const f = all[i];
        if (f.born === null && progress >= f.unlock) f.born = now + f.delay;
      }
      if (!finaleDone && progress > 0.985) {
        finaleDone = true;
        all.forEach(f => { if (f.born === null) f.born = now + rand(0, 1400); });
        if (!REDUCED) rain(44);
        [0, 380, 760, 1140].forEach(ms => setTimeout(() => { if (window.Music) window.Music.chime(); }, ms));
      }
    }
    updatePetals(dt);

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawSky(t, m);
    drawHill(0, m);
    const grow = started ? easeOutCubic(clamp((now - startTime) / 3200)) : 0;
    for (let r = 0; r < 3; r++) {
      drawHill(r + 1, m);
      const stemCol = mixc(STEM.dusk[r], STEM.dawn[r], m), leafCol = mixc(LEAF.dusk[r], LEAF.dawn[r], m);
      const list = rows[r];
      for (let i = 0; i < list.length; i++) drawFlower(list[i], now, t, m, stemCol, leafCol);
      drawGrass(r + 1, m, t, grow);
    }
    drawPetals();
    drawFlies(t, m);
  }

  /* ---------- sembrar al tocar ---------- */
  function plantAt(x, y) {
    if (!started || !U) return;
    const nx = clamp(x / W, 0.02, 0.98);
    let row = 2;
    for (let r = 0; r < 3; r++) {
      if (hillY(r + 1, nx) - y >= H * 0.07) { row = r; break; }
    }
    const ry = hillY(row + 1, nx);
    const hk = clamp((ry - y) / H, 0.07, 0.62);
    const f = makeFlower(row, nx, weighted([['sunflower', 3], ['tulip', 2], ['daisy', 2], ['daffodil', 2], ['buttercup', 1]]), hk);
    f.born = performance.now(); f.dur = rand(1500, 2100) * (REDUCED ? 0.5 : 1);
    rows[row].push(f); all.push(f); planted.push(f);
    if (planted.length > 90) {
      const old = planted.shift();
      rows[old.row].splice(rows[old.row].indexOf(old), 1);
      all.splice(all.indexOf(old), 1);
    }
    burst(x, y, 14);
    if (window.Music) window.Music.chime();
  }

  canvas.addEventListener('click', e => plantAt(e.clientX, e.clientY));

  /* ---------- arranque ---------- */
  resize();
  seed();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);

  window.Garden = {
    start() { if (!started) { started = true; startTime = performance.now(); } },
    setProgress(p) { progress = clamp(p); },
    burst(x, y, n) { if (U) burst(x, y, n || 12); },
    plant: plantAt
  };
})();
