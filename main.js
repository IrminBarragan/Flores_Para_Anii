/* Interfaz: textos, carta, razones, contador y arranque. Los textos vienen de config.js */
(function () {
  'use strict';

  const C = window.CONFIG;
  const $ = id => document.getElementById(id);
  const body = document.body;
  const Garden = window.Garden, Music = window.Music;

  /* ---------- girasol SVG reutilizable (intro y botones de razones) ---------- */
  function buildSunflowerSymbol() {
    let s = '<defs>' +
      '<linearGradient id="gPetal" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e79a00"/><stop offset=".55" stop-color="#ffc21a"/><stop offset="1" stop-color="#ffe170"/></linearGradient>' +
      '<linearGradient id="gPetal2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#f4ab00"/><stop offset=".55" stop-color="#ffd23a"/><stop offset="1" stop-color="#fff0a0"/></linearGradient>' +
      '<radialGradient id="gDisc" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#2b1608"/><stop offset=".7" stop-color="#4d2c11"/><stop offset="1" stop-color="#7a4a1c"/></radialGradient>' +
      '</defs><symbol id="sf" viewBox="0 0 100 100">';
    const n = 16;
    for (let i = 0; i < n; i++) {
      s += '<path transform="rotate(' + (i * 360 / n) + ' 50 50)" d="M50 3 C58 14 58 27 50 36 C42 27 42 14 50 3Z" fill="url(#gPetal)" stroke="#b96f00" stroke-opacity=".35" stroke-width=".5"/>';
    }
    for (let i = 0; i < n; i++) {
      s += '<path transform="rotate(' + (i * 360 / n + 360 / n / 2) + ' 50 50)" d="M50 8 C57 17 57 28 50 37 C43 28 43 17 50 8Z" fill="url(#gPetal2)" stroke="#b96f00" stroke-opacity=".3" stroke-width=".5"/>';
    }
    s += '<circle cx="50" cy="50" r="19.5" fill="url(#gDisc)" stroke="#2a1606" stroke-opacity=".6" stroke-width=".8"/>';
    const N = 46, c = 18.5 / Math.sqrt(N);
    for (let i = 1; i <= N; i++) {
      const r = c * Math.sqrt(i), a = i * 2.399963;
      s += '<circle cx="' + (50 + r * Math.cos(a)).toFixed(2) + '" cy="' + (50 + r * Math.sin(a)).toFixed(2) + '" r=".9" fill="' + (r > 14 ? '#d09030' : (i % 2 ? '#8a5522' : '#3a200c')) + '"/>';
    }
    s += '</symbol>';
    $('defs').innerHTML = s;
  }

  /* ---------- texto de la interfaz ---------- */
  const txt = (id, value) => { $(id).textContent = value; };

  function wrapWords(el, text) {
    const words = text.split(/\s+/);
    words.forEach((w, i) => {
      const s = document.createElement('span');
      s.className = 'w';
      s.style.setProperty('--i', i);
      s.textContent = w;
      el.appendChild(s);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
  }

  function buildContent() {
    txt('introTitle', C.intro.titulo);
    txt('introText', C.intro.texto);
    txt('openBtn', C.intro.boton);
    txt('introNote', C.intro.nota);

    txt('heroName', C.portada.nombre);
    txt('heroSub', C.portada.subtitulo);
    txt('heroCue', C.portada.desliza);

    // carta: cada bloque se "escribe" palabra por palabra al llegar a él
    const card = $('letterCard');
    const blocks = [];
    const salut = document.createElement('p'); salut.className = 'salut';
    wrapWords(salut, C.carta.saludo); blocks.push(salut);
    C.carta.parrafos.forEach(t => { const p = document.createElement('p'); wrapWords(p, t); blocks.push(p); });
    const sign = document.createElement('p'); sign.className = 'sign';
    const d = document.createElement('span'); d.className = 'despedida'; wrapWords(d, C.carta.despedida);
    const f = document.createElement('span'); f.className = 'firma'; wrapWords(f, C.carta.firma);
    sign.appendChild(d); sign.appendChild(f); blocks.push(sign);
    blocks.forEach(b => card.appendChild(b));
    revealOnView(blocks);

    // razones
    txt('reasonsTitle', C.razones.titulo);
    txt('reasonsHint', C.razones.ayuda);
    txt('rall', C.razones.final);
    setCount(0);
    C.razones.items.forEach((_, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'rf';
      b.setAttribute('aria-label', 'Flor ' + (i + 1));
      b.style.setProperty('--d', (i * 0.37).toFixed(2) + 's');
      b.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#sf"/></svg><span>' + (i + 1) + '</span>';
      b.addEventListener('click', () => openReason(i, b));
      $('rgrid').appendChild(b);
    });

    // final
    txt('finalTitle', C.final.titulo);
    txt('finalText', C.final.texto);
    txt('plantBtn', C.final.botonSembrar);
    txt('backBtn', C.final.botonVolver);
    txt('freeHint', C.final.pistaLibre);
  }

  function revealOnView(els) {
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -14% 0px', threshold: 0.15 });
    els.forEach(e => io.observe(e));
  }

  /* ---------- razones ---------- */
  const seen = new Set();
  function setCount(n) { txt('rcount', n + ' / ' + C.razones.items.length + ' ' + C.razones.contador); }

  function openReason(i, btn) {
    const t = $('rtext');
    t.classList.remove('show');
    setTimeout(() => { t.textContent = C.razones.items[i]; t.classList.add('show'); }, 170);

    document.querySelectorAll('.rf.active').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    btn.classList.remove('spin'); void btn.offsetWidth; btn.classList.add('spin');

    if (!seen.has(i)) {
      seen.add(i);
      btn.classList.add('open');
      btn.querySelector('span').textContent = '♥';
      setCount(seen.size);
      if (seen.size === C.razones.items.length) setTimeout(() => $('rall').classList.add('show'), 700);
    }
    const r = btn.getBoundingClientRect();
    Garden.burst(r.left + r.width / 2, r.top + r.height / 2, 10);
    Music.chime();
  }

  /* ---------- contador de tiempo juntos (opcional) ---------- */
  function setupTogether() {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec((C.juntos.fechaInicio || '').trim());
    if (!m) return;
    const start = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    if (isNaN(start) || start > new Date()) return;

    $('together').hidden = false;
    txt('togetherTitle', C.juntos.titulo);
    txt('togetherFoot', C.juntos.pie);
    const cells = {};
    [['d', C.juntos.dias], ['h', C.juntos.horas], ['m', C.juntos.minutos], ['s', C.juntos.segundos]].forEach(([k, label]) => {
      const box = document.createElement('div');
      box.innerHTML = '<b>0</b><small></small>';
      box.querySelector('small').textContent = label;
      cells[k] = box.querySelector('b');
      $('clock').appendChild(box);
    });
    const tick = () => {
      const s = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
      cells.d.textContent = Math.floor(s / 86400);
      cells.h.textContent = Math.floor(s % 86400 / 3600);
      cells.m.textContent = Math.floor(s % 3600 / 60);
      cells.s.textContent = s % 60;
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- avisos ---------- */
  let toastTimer = null;
  function toast(text, ms) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms || 5000);
  }

  /* ---------- progreso de scroll → el jardín crece ---------- */
  function onScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    Garden.setProgress(max > 0 ? window.scrollY / max : 0);
  }

  /* ---------- arranque ---------- */
  function open() {
    body.classList.remove('locked');
    body.classList.add('started');
    $('intro').classList.add('hide');
    setTimeout(() => $('intro').remove(), 2000);

    Garden.start();
    const playing = Music.start();
    const mb = $('musicBtn');
    mb.hidden = false;
    mb.classList.toggle('muted', !playing);
    onScroll();
    setTimeout(() => toast(C.pista, 6500), 4200);
  }

  buildSunflowerSymbol();
  buildContent();
  setupTogether();

  $('openBtn').addEventListener('click', open);
  $('musicBtn').addEventListener('click', () => {
    const on = Music.toggle();
    $('musicBtn').classList.toggle('muted', !on);
    $('musicBtn').setAttribute('aria-label', on ? 'Silenciar música' : 'Activar música');
  });
  $('plantBtn').addEventListener('click', () => {
    body.classList.add('free');
    $('freeUI').setAttribute('aria-hidden', 'false');
    const r = $('plantBtn').getBoundingClientRect();
    Garden.burst(r.left + r.width / 2, r.top + r.height / 2, 16);
  });
  $('backBtn').addEventListener('click', () => {
    body.classList.remove('free');
    $('freeUI').setAttribute('aria-hidden', 'true');
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  window.addEventListener('load', onScroll);
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
})();
