/* Música de cajita musical generada con Web Audio (no necesita archivos).
   Do – Sol – Lam – Fa, en bucle, con arpegios suaves y una melodía que va improvisando. */
(function () {
  'use strict';

  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master = null, bus = null;
  let enabled = false, timer = null, nextTime = 0, step = 0, lastNote = 76;

  const STEP = 0.46;            // duración de cada corchea (segundos)
  const STEPS_PER_CHORD = 8;
  const MASTER_LEVEL = 0.5;

  const midi = m => 440 * Math.pow(2, (m - 69) / 12);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  const CHORDS = [
    { bass: 36, tones: [60, 64, 67, 72] },   // Do
    { bass: 43, tones: [59, 62, 67, 71] },   // Sol
    { bass: 45, tones: [60, 64, 69, 72] },   // La menor
    { bass: 41, tones: [60, 65, 69, 72] }    // Fa
  ];
  const ARP = [0, 1, 2, 3, 2, 1, 2, 1];
  const SCALE = [72, 74, 76, 79, 81, 84, 86];   // pentatónica de Do

  function makeReverb(seconds, decay) {
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function init() {
    if (ctx || !AC) return !!ctx;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const tone = ctx.createBiquadFilter();       // suaviza los agudos
    tone.type = 'lowpass';
    tone.frequency.value = 5200;

    bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(tone);

    const dry = ctx.createGain(); dry.gain.value = 0.75;
    tone.connect(dry); dry.connect(master);

    const conv = ctx.createConvolver();
    conv.buffer = makeReverb(2.8, 3);
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    tone.connect(conv); conv.connect(wet); wet.connect(master);
    return true;
  }

  // Un tono de "campanita": tres parciales con caída exponencial
  function bell(freq, t, dur, vel) {
    const parts = [[1, 1], [2.005, 0.22], [4.1, 0.06]];
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(bus);
    parts.forEach(([mul, amp]) => {
      const o = ctx.createOscillator(), pg = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq * mul;
      pg.gain.value = amp;
      o.connect(pg); pg.connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  }

  // Colchón suave para cada acorde
  function pad(freq, t, dur) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.03, t + 1.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.9);
    o.connect(g); g.connect(bus);
    o.start(t);
    o.stop(t + dur + 1);
  }

  function scheduleStep(n, t) {
    const chord = CHORDS[Math.floor(n / STEPS_PER_CHORD) % CHORDS.length];
    const i = n % STEPS_PER_CHORD;

    if (i === 0) {
      bell(midi(chord.bass), t, 3.2, 0.2);
      chord.tones.slice(0, 3).forEach(m => pad(midi(m - 12), t, STEP * STEPS_PER_CHORD));
    }
    if (i === 4) bell(midi(chord.bass + 12), t, 2.2, 0.09);

    // arpegio de acompañamiento
    bell(midi(chord.tones[ARP[i]]), t, 1.5, 0.075);

    // melodía que vaga por las notas del acorde y la pentatónica
    if (Math.random() < (i % 2 === 0 ? 0.62 : 0.34)) {
      const pool = chord.tones.map(m => m + 12).concat(SCALE);
      const near = pool.filter(m => Math.abs(m - lastNote) <= 5 && m !== lastNote);
      lastNote = near.length ? pick(near) : pick(pool);
      bell(midi(lastNote), t + (Math.random() < 0.25 ? 0.02 : 0), 2.0, 0.13);
    }
  }

  function tick() {
    while (nextTime < ctx.currentTime + 0.4) {
      scheduleStep(step, nextTime);
      nextTime += STEP;
      step++;
    }
  }

  function run() {
    ctx.resume();
    nextTime = ctx.currentTime + 0.15;
    if (!timer) timer = setInterval(tick, 100);
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(MASTER_LEVEL, ctx.currentTime, 0.9);
  }

  function halt() {
    if (timer) { clearInterval(timer); timer = null; }
    if (!ctx) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
    setTimeout(() => { if (!enabled && ctx) ctx.suspend(); }, 700);
  }

  const Music = {
    start() {
      try {
        if (!init()) return false;
        enabled = true;
        run();
        return true;
      } catch (e) { return false; }
    },
    toggle() {
      try {
        if (!ctx) return Music.start();
        enabled = !enabled;
        if (enabled) run(); else halt();
        return enabled;
      } catch (e) { return false; }
    },
    isOn() { return enabled; },
    // una notita al sembrar una flor
    chime() {
      try {
        if (!enabled || !ctx || ctx.state !== 'running') return;
        bell(midi(pick(SCALE) + (Math.random() < 0.3 ? 12 : 0)), ctx.currentTime, 2.2, 0.16);
      } catch (e) { /* sin sonido, no pasa nada */ }
    }
  };

  // Si cambia de pestaña o bloquea el teléfono, pausamos
  document.addEventListener('visibilitychange', () => {
    if (!ctx || !enabled) return;
    if (document.hidden) {
      if (timer) { clearInterval(timer); timer = null; }
      ctx.suspend();
    } else {
      run();
    }
  });

  window.Music = Music;
})();
