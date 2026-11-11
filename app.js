'use strict';

/* ===================== estado ===================== */
const S = {
  data: null,
  yo: 'HERODES',
  seleccion: new Set(),
  seq: [],
  idx: 0,
  token: 0,
  pausado: false,
  hablando: false,
  voces: [],
  ajustes: {
    voz: '',
    velocidad: 0.95,
    tono: 1,
    pausa: 800,
    acotaciones: false,
    campana: true,
    grabar: false,
    escuchar: true,
    silencio: 1200,
    sensibilidad: 1,
    voces: {},
  },
  grabando: false,
  mediaRecorder: null,
  trozos: [],
  grabacionUrl: null,
  grabacionIdx: -1,
  tele: { escena: null, tam: 24, vel: 30, soloMias: false, sonando: false, raf: 0 },
};

const $ = (id) => document.getElementById(id);
const CLAVE_AJUSTES = 'lhp_ajustes_v1';
const CLAVE_PROGRESO = 'lhp_progreso_v1';
const CLAVE_YO = 'lhp_personaje_v1';
/* en el APK el motor de voz y el micrófono los pone Android */
const PUENTE = (typeof window.AndroidVoz !== 'undefined') ? window.AndroidVoz : null;

/* ===================== utilidades ===================== */
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (n) => (n === 'FINAL' ? 'Final' : String(n));

function aviso(texto, ms = 4200) {
  const caja = $('aviso');
  caja.textContent = texto;
  caja.hidden = false;
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => (caja.hidden = true), ms);
}

function escapar(t) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* acotaciones dentro del diálogo, en gris y cursiva */
function conFormato(t) {
  return escapar(t).replace(/\(([^)]+)\)/g, '<em>($1)</em>');
}

/* ===================== voces ===================== */
const FEMENINAS = ['maría', 'maria', 'noa', 'adina', 'narrador', 'vecina', 'posadera', 'madre', 'habitante', 'todos', 'coro'];

function esMujer(q) {
  const n = q.toLowerCase();
  if (n === 'sombra') return false;
  return FEMENINAS.some((f) => n === f || n.startsWith(f));
}

/* ---------- reparto de voces (se busca por el nombre de la voz instalada) ---------- */
const REPARTO = {
  HERODES: 'Jorge',
  MALQUÍAS: 'Alonso',
  JOSÉ: 'Mateo',
  ZERAH: 'Lorenzo',
  GABRIEL: 'Rodrigo',
  ANCIANO: 'Emilio',
  PADRE: 'Mario',
  JOAB: 'Javier',
  ELIAB: 'Alex',
  ELAZAR: 'Andrés',
  'SABIO 1': 'Federico',
  'SABIO 2': 'Roberto',
  'SABIO 3': 'Sebastián',
  SOLDADO: 'Manuel',
  GUARDIAS: 'Luis',
  MENSAJERO: 'Carlos',
  'POSADERO 1': 'Gonzalo',
  'POSADERO 2': 'Tomás',
  'MALQUÍAS NIÑO': 'Andrés',
  SOMBRA: 'Álvaro',
  HABITANTE: 'Jorge',
  NARRADOR: 'Catalina',
  NARRADORA: 'Catalina',
  MARÍA: 'Dalia',
  NOA: 'Camila',
  ADINA: 'Valentina',
  'NOA NIÑA': 'Sofía',
  'VECINA 1': 'Paola',
  'VECINA 2': 'Tania',
  POSADERA: 'Karla',
  'MADRE 1': 'Margarita',
  'MADRE 2': 'Lorena',
  'MADRE 3': 'Yolanda',
  TODOS: 'Salomé',
  CORO: 'Ximena',
};

/* con las voces neuronales basta un toque: no hay que exagerar el tono */
const TONO_NAT = { SOMBRA: 0.9, ANCIANO: 0.95, JOAB: 0.96, PADRE: 0.96, 'NOA NIÑA': 1.18, 'MALQUÍAS NIÑO': 1.18 };
const LENTO_NAT = { SOMBRA: 0.86, ANCIANO: 0.9, JOAB: 0.93, NARRADOR: 0.97 };

const TONO = {
  HERODES: 0.78, SOMBRA: 0.5, ANCIANO: 0.8, JOAB: 0.85, PADRE: 0.85,
  GABRIEL: 0.95, ZERAH: 0.88, GUARDIAS: 0.8, SOLDADO: 0.85,
  MARÍA: 1.08, NOA: 1.04, ADINA: 1.0, 'NOA NIÑA': 1.45, 'MALQUÍAS NIÑO': 1.45,
  NARRADOR: 1.0, 'SABIO 1': 1.0, 'SABIO 2': 1.02, 'SABIO 3': 0.98,
};
const LENTO = { SOMBRA: 0.86, ANCIANO: 0.92, JOAB: 0.94, NARRADOR: 0.95, PADRE: 0.95 };

const NOMBRES_MUJER = ['dalia', 'camila', 'valentina', 'catalina', 'elvira', 'salome', 'salomé', 'maria', 'maría',
  'belkys', 'ramona', 'andrea', 'ximena', 'teresa', 'marta', 'karla', 'yolanda', 'margarita', 'karina', 'tania',
  'lorena', 'paloma', 'paola', 'sofia', 'sofía', 'helena', 'laura', 'sabina', 'monica', 'mónica', 'paulina',
  'isabel', 'lucia', 'lucía', 'zira', 'renata', 'elena'];

const esNatural = (v) => !!v && /online \(natural\)/i.test(v.name);

/* nombre corto para mostrar: "Jorge", "Catalina"... */
function nombreCorto(v) {
  if (!v) return 'sin voz';
  return v.name
    .replace(/^Microsoft\s+/i, '')
    .replace(/\s*Online \(Natural\)\s*/i, '')
    .replace(/\s*-\s*.*$/, '')
    .trim();
}

function vozMujer(v) {
  const n = (v.name + ' ' + (v.voiceURI || '')).toLowerCase();
  return NOMBRES_MUJER.some((m) => n.includes(m));
}

function vozPara(q) {
  if (!S.voces.length) return null;
  const forzada = S.ajustes.voces && S.ajustes.voces[q];
  if (forzada) {
    const v = S.voces.find((x) => x.name === forzada);
    if (v) return v;
  }
  const quieroMujer = esMujer(q);
  const delGenero = (lista) => lista.filter((v) => (quieroMujer ? vozMujer(v) : !vozMujer(v)));
  const naturales = S.voces.filter(esNatural);
  const preferida = REPARTO[q];
  if (preferida) {
    const busqueda = preferida.toLowerCase();
    const candidatas = (naturales.length ? naturales : S.voces).filter((v) => v.name.toLowerCase().includes(busqueda));
    const conGenero = candidatas.filter((v) => (quieroMujer ? vozMujer(v) : !vozMujer(v)));
    if (conGenero.length) return conGenero[0];
    if (candidatas.length) return candidatas[0];
  }
  const base = naturales.length ? naturales : S.voces;
  const genero = delGenero(base);
  const lista = genero.length ? genero : base;
  let h = 0;
  for (const c of q) h = (h * 31 + c.charCodeAt(0)) % 97;
  return lista[h % lista.length];
}

function cargarVoces() {
  if (PUENTE) {
    try {
      const lista = JSON.parse(PUENTE.vocesTelefono() || '[]');
      S.voces = lista.map((v) => ({ name: v.name, lang: v.lang, localService: !v.red, movil: true }));
    } catch (e) {
      S.voces = [];
    }
    llenarSelectVoces();
    $('nota-voces').textContent = S.voces.length
      ? `El teléfono tiene ${S.voces.length} ${S.voces.length === 1 ? 'voz' : 'voces'} en español. Podés elegir cuál usa cada personaje en Ajustes.`
      : 'El teléfono no tiene voces en español. Instalá "Síntesis de voz de Google" o el motor SherpaTTS.';
    if (S.data) llenarSelectsPersonajes();
    return;
  }
  if (!('speechSynthesis' in window)) return;
  const todas = speechSynthesis.getVoices();
  const espa = todas.filter((v) => (v.lang || '').toLowerCase().startsWith('es'));
  S.voces = espa.length ? espa : todas;
  llenarSelectVoces();
  const nat = S.voces.filter(esNatural).length;
  const n = S.voces.length;
  $('nota-voces').textContent = n
    ? (nat
      ? `${nat} voces naturales en español (hombre y mujer). Cada personaje tiene la suya.`
      : `Voces encontradas: ${n}. Para que suenen naturales, abre la app con Microsoft Edge.`)
    : 'No se encontró ninguna voz instalada. Revisa la configuración de voz de Windows.';
  if (S.data) llenarSelectsPersonajes();
}

function limpiarParaVoz(t) {
  return t
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function trocear(t) {
  const limpio = limpiarParaVoz(t);
  if (!limpio) return [];
  const frases = limpio.split(/(?<=[.!?…])\s+/);
  const trozos = [];
  let actual = '';
  for (const f of frases) {
    if ((actual + ' ' + f).trim().length > 170) {
      if (actual) trozos.push(actual.trim());
      if (f.length > 170) {
        const partes = f.match(/.{1,160}(\s|$)/g) || [f];
        partes.forEach((p) => trozos.push(p.trim()));
        actual = '';
      } else actual = f;
    } else actual = (actual + ' ' + f).trim();
  }
  if (actual) trozos.push(actual.trim());
  return trozos;
}

function hablarTexto(texto, { q = null, rate = null, pitch = null } = {}) {
  if (PUENTE) {
    return new Promise((resolver) => {
      const trozos = trocear(texto);
      if (!trozos.length) return resolver();
      const base = S.ajustes.velocidad;
      const r = rate ?? base * (q ? (LENTO[q] ?? 1) : 1);
      const p = pitch ?? (q ? (TONO[q] ?? 1) : 1);
      let terminado = false;
      S.hablando = true;
      window.__vozFin = () => {
        if (terminado) return;
        terminado = true;
        S.hablando = false;
        resolver();
      };
      const vozElegida = (q && S.ajustes.voces && S.ajustes.voces[q]) || '';
      try { PUENTE.hablar(trozos.join(' '), q || '', r, p, vozElegida); }
      catch (e) { window.__vozFin(); }
    });
  }
  return new Promise((resolver) => {
    if (!('speechSynthesis' in window)) return resolver();
    const trozos = trocear(texto);
    if (!trozos.length) return resolver();
    const v = q ? vozPara(q) : (S.ajustes.voz ? S.voces.find((x) => x.name === S.ajustes.voz) : vozPara('NARRADOR'));
    const natural = esNatural(v);
    const base = S.ajustes.velocidad;
    const factorLento = natural ? (LENTO_NAT[q] ?? 1) : (LENTO[q] ?? 1);
    const r = rate ?? base * (q ? factorLento : 1);
    const p = pitch ?? (natural
      ? (1 + (S.ajustes.tono - 1) * 0.5) * (TONO_NAT[q] ?? 1)
      : S.ajustes.tono * (TONO[q] ?? 1));
    let i = 0;
    let intentoLocal = false;
    S.hablando = true;

    const local = () => {
      const quiereMujer = q ? esMujer(q) : true;
      return S.voces.find((x) => !esNatural(x) && (quiereMujer ? vozMujer(x) : !vozMujer(x))) || null;
    };

    const hablarTramo = (tramo, voz) => {
      const u = new SpeechSynthesisUtterance(tramo);
      if (voz) u.voice = voz;
      u.lang = voz?.lang || 'es-MX';
      u.rate = Math.min(2, Math.max(0.4, r));
      u.pitch = Math.min(2, Math.max(0.1, p));
      u.onend = siguiente;
      u.onerror = (ev) => {
        const err = ev && ev.error;
        /* si la voz natural falla (sin internet), se repite ese tramo con la voz local */
        if (!intentoLocal && natural && (err === 'synthesis-failed' || err === 'network' || err === 'not-allowed')) {
          intentoLocal = true;
          const alternativa = local();
          if (alternativa) {
            setTimeout(() => hablarTramo(tramo, alternativa), 80);
            return;
          }
        }
        siguiente();
      };
      speechSynthesis.speak(u);
    };

    const siguiente = () => {
      if (i >= trozos.length) { S.hablando = false; return resolver(); }
      hablarTramo(trozos[i++], v);
    };
    siguiente();
  });
}

function callar() {
  if (PUENTE) {
    try { PUENTE.detener(); } catch (e) { /* nada */ }
    if (window.__vozFin) window.__vozFin();
    S.hablando = false;
    return;
  }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  S.hablando = false;
}

function campana() {
  if (!S.ajustes.campana) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const tocar = (f, t0, dur) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t0);
      g.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t0 + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + dur + 0.05);
    };
    tocar(880, 0, 0.25);
    tocar(1174, 0.16, 0.3);
    setTimeout(() => ctx.close(), 900);
  } catch (e) { /* sin audio, no pasa nada */ }
}

/* ===================== micrófono (escucha y grabación) ===================== */
const Micro = {
  stream: null,
  ctx: null,
  anal: null,
  buf: null,
  pidiendo: null,
  async activar() {
    if (PUENTE) {
      /* el micrófono lo maneja Android, no el navegador */
      try {
        const ok = PUENTE.empezarMicro();
        if (ok !== false) { this.stream = { movil: true }; this.anal = { movil: true }; return true; }
      } catch (e) { /* sigue abajo */ }
      return false;
    }
    if (this.stream && this.anal) {
      if (this.ctx && this.ctx.state === 'suspended') { try { await this.ctx.resume(); } catch (e) {} }
      return true;
    }
    if (this.pidiendo) return this.pidiendo;
    this.pidiendo = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        const fuente = ctx.createMediaStreamSource(stream);
        const anal = ctx.createAnalyser();
        anal.fftSize = 1024;
        anal.smoothingTimeConstant = 0.3;
        fuente.connect(anal);
        this.stream = stream;
        this.ctx = ctx;
        this.anal = anal;
        this.buf = new Float32Array(anal.fftSize);
        return true;
      } catch (e) {
        this.stream = null; this.anal = null;
        return false;
      } finally {
        this.pidiendo = null;
      }
    })();
    return this.pidiendo;
  },
  nivel() {
    if (PUENTE) { try { return Number(PUENTE.nivel()) || 0; } catch (e) { return 0; } }
    if (!this.anal) return 0;
    this.anal.getFloatTimeDomainData(this.buf);
    let suma = 0;
    for (let i = 0; i < this.buf.length; i++) suma += this.buf[i] * this.buf[i];
    return Math.sqrt(suma / this.buf.length);
  },
};

const escucha = { activa: false, raf: 0, hablado: false, silencio: 0, ultimo: 0, idx: -1, umbral: 0.012, cal: 0, sumaCal: 0, nCal: 0, pico: 0 };

async function prepararMicro() {
  if (!S.ajustes.escuchar) return false;
  const ok = await Micro.activar();
  if (!ok) {
    aviso('No pude usar el micrófono. Si el navegador pregunta, elige "Permitir". Si no pregunta nada, abre la app con "Libreto Herodes - CON MICROFONO".', 10000);
    S.ajustes.escuchar = false;
    guardarAjustes();
    if ($('aj-escuchar')) $('aj-escuchar').checked = false;
    return false;
  }
  return true;
}

function empezarEscuchaTurno() {
  if (!S.ajustes.escuchar) return;
  const idxTurno = S.idx;
  if (!Micro.stream) {
    /* puede ser la primera vez: el permiso se está pidiendo. Reintenta cuando esté listo */
    Micro.activar().then((ok) => {
      if (!ok) {
        const ahora = performance.now();
        if (!empezarEscuchaTurno._ultimo || ahora - empezarEscuchaTurno._ultimo > 12000) {
          empezarEscuchaTurno._ultimo = ahora;
          aviso('El micrófono no está activo: la app no te puede oír. Dale permiso al micrófono o aprieta "Ya la dije" para seguir.', 8000);
        }
        return;
      }
      if (S.idx === idxTurno && !escucha.activa) empezarEscuchaTurno();
    });
    return;
  }
  detenerEscucha();
  escucha.activa = true;
  escucha.hablado = false;
  escucha.sonando = 0;
  escucha.silencio = 0;
  escucha.pico = 0;
  escucha.umbral = 0.012;
  escucha.cal = performance.now();
  escucha.sumaCal = 0;
  escucha.nCal = 0;
  escucha.idx = S.idx;
  escucha.ultimo = performance.now();
  const ind = document.getElementById('escucha-ind');
  if (ind) { ind.hidden = false; ind.classList.remove('detectado'); }
  const et = document.querySelector('#escucha-ind .etiqueta');
  if (et) et.textContent = 'Te escucho…';
  escucha.raf = requestAnimationFrame(bucleEscucha);
}

function bucleEscucha(ts) {
  if (!escucha.activa) return;
  const dt = Math.min(250, Math.max(0, ts - escucha.ultimo));
  escucha.ultimo = ts;
  const n = Micro.nivel();

  /* los primeros 500 ms sirven para medir el ruido de la pieza */
  if (!escucha.hablado && ts - escucha.cal < 500) {
    escucha.sumaCal += n;
    escucha.nCal++;
    escucha.umbral = Math.max(0.009, (escucha.sumaCal / Math.max(1, escucha.nCal)) * 3.2);
  }

  const sobre = n > escucha.umbral * S.ajustes.sensibilidad;
  if (sobre) {
    escucha.sonando = (escucha.sonando || 0) + dt;
    if (escucha.sonando >= 220) escucha.hablado = true;   /* un golpe o un pitido no cuenta como línea */
    escucha.silencio = 0;
    if (escucha.hablado) escucha.pico = Math.max(escucha.pico, n);
  } else {
    escucha.sonando = 0;
    if (escucha.hablado) escucha.silencio += dt;
  }

  const barra = document.querySelector('#escucha-ind .nivel i');
  if (barra) barra.style.width = Math.min(100, (n / (escucha.umbral * 4 || 0.05)) * 100).toFixed(0) + '%';
  const ind = document.getElementById('escucha-ind');
  if (ind) ind.classList.toggle('detectado', escucha.hablado && escucha.silencio < 200);
  const et = document.querySelector('#escucha-ind .etiqueta');
  if (et && escucha.hablado) et.textContent = 'Te oí. Sigo cuando calles…';

  if (escucha.hablado && escucha.silencio >= S.ajustes.silencio && escucha.idx === S.idx) {
    detenerEscucha();
    siguiente();
    return;
  }
  escucha.raf = requestAnimationFrame(bucleEscucha);
}

function detenerEscucha() {
  escucha.activa = false;
  if (escucha.raf) cancelAnimationFrame(escucha.raf);
  escucha.raf = 0;
  const ind = document.getElementById('escucha-ind');
  if (ind) { ind.hidden = true; ind.classList.remove('detectado'); }
}

/* ===================== datos ===================== */
async function cargar() {
  if (window.LIBRETO) {
    S.data = window.LIBRETO;
  } else {
    const r = await fetch('/api/libreto', { cache: 'no-store' });
    S.data = await r.json();
  }
  S.yo = localStorage.getItem(CLAVE_YO) || 'HERODES';
  if (!S.data.personajes.includes(S.yo)) S.yo = 'HERODES';

  const guardado = JSON.parse(localStorage.getItem(CLAVE_AJUSTES) || '{}');
  Object.assign(S.ajustes, guardado);

  llenarPersonajes();
  pintarEscenas();
  pintarAjustes();
  pintarTeleEscenas();
  marcarBotonContinuar();
}

function llenarPersonajes() {
  const opciones = S.data.personajes.map((p) => {
    const n = S.data.escenas.reduce((a, e) => a + e.b.filter((b) => b.t === 'd' && b.q === p).length, 0);
    return `<option value="${escapar(p)}"${p === S.yo ? ' selected' : ''}>${escapar(p)} — ${n} líneas</option>`;
  }).join('');
  $('sel-personaje').innerHTML = opciones;
  $('sel-personaje-2').innerHTML = opciones;
  $('sel-personaje-2').value = S.yo;
}

function escenasDe() { return S.data.escenas; }

function misLineasEn(escena) {
  return escena.b.filter((b) => b.t === 'd' && b.q === S.yo).length;
}

function pintarEscenas() {
  const cont = $('lista-escenas');
  cont.innerHTML = '';
  escenasDe().forEach((e) => {
    const n = misLineasEn(e);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'escena-chip' + (S.seleccion.has(String(e.n)) ? ' marcada' : '');
    b.dataset.escena = String(e.n);
    b.innerHTML = `<span class="num">${num(e.n)}</span>
      <span class="tit">${escapar(tituloEscena(e))}</span>
      <span class="cuenta">${n ? n + (n === 1 ? ' mía' : ' mías') : 'sin tus líneas'}</span>
      <span class="tick"><svg viewBox="0 0 24 24"><path d="M5 12.5 9.5 17 19 7"/></svg></span>`;
    b.addEventListener('click', () => {
      const k = String(e.n);
      if (S.seleccion.has(k)) S.seleccion.delete(k); else S.seleccion.add(k);
      b.classList.toggle('marcada');
      actualizarNotaEscenas();
    });
    cont.appendChild(b);
  });
  if (!S.seleccion.size) {
    escenasDe().forEach((e) => { if (misLineasEn(e)) S.seleccion.add(String(e.n)); });
    [...cont.children].forEach((c) => {
      c.classList.toggle('marcada', S.seleccion.has(c.dataset.escena));
    });
  }
  actualizarNotaEscenas();
}

function tituloEscena(e) {
  return (e.t || 'Escena ' + num(e.n)).replace(/\s+/g, ' ').trim();
}

function actualizarNotaEscenas() {
  const total = S.seqTotal ? '' : '';
  const esc = S.seleccion.size;
  const mias = escenasDe().filter((e) => S.seleccion.has(String(e.n))).reduce((a, e) => a + misLineasEn(e), 0);
  $('btn-empezar').disabled = esc === 0;
  $('nota-voces').dataset.escenas = String(esc);
  if (esc === 0) $('nota-voces').textContent = 'Marca al menos una escena.';
}

/* ===================== ensayo ===================== */
function construirSecuencia(desdeEscena = null) {
  S.seq = [];
  for (const e of escenasDe()) {
    if (desdeEscena !== null) {
      if (String(e.n) !== String(desdeEscena)) continue;
    } else if (!S.seleccion.has(String(e.n))) continue;
    for (const b of e.b) S.seq.push({ esc: e, b });
  }
}

async function empezar(escena = null, indice = 0) {
  construirSecuencia(escena);
  if (!S.seq.length) return aviso('No hay nada que ensayar con esa selección.');
  S.idx = Math.max(0, Math.min(indice, S.seq.length - 1));
  $('preparacion').hidden = true;
  $('ensayo').hidden = false;
  pintarSelectorEscenasEnsayo();
  if (S.ajustes.escuchar) {
    /* si el navegador está esperando que aceptes el micrófono, no se queda pegado: arranca igual */
    await Promise.race([prepararMicro(), esperar(7000)]);
  }
  reiniciarReproduccion();
}

function salir() {
  cancelar();
  $('ensayo').hidden = true;
  $('preparacion').hidden = false;
  marcarBotonContinuar();
}

function cancelar() {
  S.token++;
  detenerEscucha();
  callar();
  detenerGrabacion(true);
}

let grabacionAuto = false;

function reiniciarReproduccion() {
  cancelar();
  grabacionAuto = false;
  S.pausado = false;
  correr(S.idx);
}

function pintarSelectorEscenasEnsayo() {
  const sel = $('ens-escena-sel');
  const actual = S.seq[S.idx]?.esc;
  sel.innerHTML = S.seq
    .filter((x, i, arr) => arr.findIndex((y) => y.esc === x.esc) === i)
    .map((x) => `<option value="${escapar(String(x.esc.n))}">Escena ${num(x.esc.n)} · ${escapar(tituloEscena(x.esc))}</option>`)
    .join('');
  if (actual) sel.value = String(actual.n);
}

async function correr(desde) {
  const miToken = ++S.token;
  for (let i = desde; i < S.seq.length; i++) {
    if (miToken !== S.token) return;
    while (S.pausado) {
      if (miToken !== S.token) return;
      await esperar(220);
    }
    S.idx = i;
    const { b, esc } = S.seq[i];
    pintarLinea();
    guardarProgreso();

    if (b.t === 'd' && b.q === S.yo) {
      campana();
      if (S.ajustes.grabar) { grabacionAuto = true; iniciarGrabacion(); }
      empezarEscuchaTurno();
      return;
    }
    if (b.t === 'd') {
      const tarjeta = document.querySelector('.tarjeta.otro');
      if (tarjeta) tarjeta.classList.add('hablando');
      await hablarTexto(b.x, { q: b.q });
      if (miToken !== S.token) return;
      if (tarjeta) tarjeta.classList.remove('hablando');
    } else if (b.t === 'a') {
      if (S.ajustes.acotaciones) { await hablarTexto(b.x, { rate: 0.85, pitch: 0.9 }); if (miToken !== S.token) return; }
      else await esperar(320);
    } else {
      await esperar(900);
    }
    await esperar(S.ajustes.pausa);
  }
  if (miToken === S.token) {
    S.idx = S.seq.length - 1;
    pintarLinea();
    aviso('Terminaste esta selección de escenas.', 6000);
  }
}

function pintarLinea() {
  const actual = S.seq[S.idx];
  if (!actual) return;
  const { b, esc } = actual;

  $('ens-escena').textContent = `Escena ${num(esc.n)} · ${tituloEscena(esc)}`;
  const totalEsc = S.seq.filter((x) => x.esc === esc).length;
  const posEsc = S.seq.slice(0, S.idx + 1).filter((x) => x.esc === esc).length;
  $('ens-posicion').textContent = `bloque ${posEsc} de ${totalEsc} de la escena`;
  $('progreso-relleno').style.width = ((S.idx + 1) / S.seq.length * 100).toFixed(1) + '%';

  const cont = $('tarjetas');
  cont.innerHTML = '';

  const prev = S.seq[S.idx - 1];
  if (prev && prev.esc === esc && prev.b.t === 'd') {
    const d = document.createElement('div');
    d.className = 'tarjeta otro';
    d.style.opacity = '.55';
    d.innerHTML = `<div class="quien"><span class="punto"></span>${escapar(prev.b.q)}</div>
      <div class="texto">${conFormato(prev.b.x)}</div>`;
    cont.appendChild(d);
  }

  const card = document.createElement('div');
  if (b.t === 'd' && b.q === S.yo) {
    card.className = 'tarjeta mia';
    card.innerHTML = `<div class="quien"><span class="punto"></span>Tu turno · ${escapar(b.q)}</div>
      <div class="texto">${conFormato(b.x)}</div>
      <div class="escucha" id="escucha-ind" hidden>
        <span class="etiqueta">Te escucho…</span>
        <span class="nivel"><i></i></span>
      </div>`;
    const acc = document.createElement('div');
    acc.className = 'acciones-tarjeta';

    const bEscuchar = document.createElement('button');
    bEscuchar.className = 'boton mini';
    bEscuchar.innerHTML = icono('altavoz') + 'Escuchar mi línea';
    bEscuchar.addEventListener('click', async () => {
      cancelar();
      S.pausado = false;
      await hablarTexto(b.x, { q: b.q });
      if (S.idx === S.seq.indexOf(actual)) empezarEscuchaTurno();
    });
    acc.appendChild(bEscuchar);

    let bGrabar = null;
    if (!PUENTE) {
      bGrabar = document.createElement('button');
      bGrabar.className = 'boton mini';
      bGrabar.id = 'btn-grabar';
      bGrabar.innerHTML = icono('micro') + (S.grabando ? 'Detener grabación' : 'Grabar mi voz');
      bGrabar.addEventListener('click', () => (S.grabando ? detenerGrabacion() : iniciarGrabacion(false)));
      acc.appendChild(bGrabar);
    }

    if (S.grabacionUrl && S.grabacionIdx === S.idx) {
      const bOir = document.createElement('button');
      bOir.className = 'boton mini';
      bOir.innerHTML = icono('play') + 'Oír mi grabación';
      bOir.addEventListener('click', () => {
        const a = $('reproductor');
        a.src = S.grabacionUrl;
        a.play();
      });
      acc.appendChild(bOir);
    }
    if (S.grabando) {
      const g = document.createElement('span');
      g.className = 'grabando';
      g.textContent = 'grabando';
      acc.appendChild(g);
    }
    card.appendChild(acc);
  } else if (b.t === 'a') {
    card.className = 'tarjeta acotacion';
    card.innerHTML = `<div class="texto">${escapar(b.x)}</div>`;
  } else if (b.t === 'c') {
    card.className = 'tarjeta cancion';
    card.innerHTML = `<div class="texto">${escapar(b.x)}</div>`;
  } else {
    card.className = 'tarjeta otro';
    card.innerHTML = `<div class="quien"><span class="punto"></span>${escapar(b.q)}</div>
      <div class="texto">${conFormato(b.x)}</div>`;
  }
  cont.appendChild(card);

  const sig = S.seq[S.idx + 1];
  if (sig) {
    const quien = sig.b.t === 'd' ? sig.b.q : 'Acotación';
    const texto = sig.b.x.length > 130 ? sig.b.x.slice(0, 130) + '…' : sig.b.x;
    $('siguiente').innerHTML = `<span class="rotulo">Después</span><span class="cita">${escapar(quien)}: ${escapar(texto)}</span>`;
  } else {
    $('siguiente').innerHTML = `<span class="rotulo">Fin</span><span class="cita">Se acabaron las escenas elegidas.</span>`;
  }

  const esMia = b.t === 'd' && b.q === S.yo;
  $('btn-siguiente').innerHTML = esMia ? 'Ya la dije → <span class="tecla">espacio</span>' : 'Siguiente <span class="tecla">espacio</span>';
  $('btn-pausa').innerHTML = S.pausado ? icono('play') : icono('pausa');
  pintarSelectorEscenasEnsayo();
}

function icono(nombre) {
  const mapa = {
    altavoz: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
    micro: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg>',
    pausa: '<svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg>',
  };
  return mapa[nombre] || '';
}

function siguiente() {
  detenerGrabacion(true);
  if (S.idx >= S.seq.length - 1) return aviso('Ya estás en la última línea de esta selección.');
  cancelar();
  S.pausado = false;
  correr(S.idx + 1);
}

function anterior() {
  cancelar();
  S.pausado = false;
  const i = S.idx > 0 ? S.idx - 1 : 0;
  correr(i);
}

function repetir() {
  cancelar();
  S.pausado = false;
  correr(S.idx);
}

function alternarPausa() {
  S.pausado = !S.pausado;
  if (S.pausado) {
    if ('speechSynthesis' in window) speechSynthesis.pause();
  } else if ('speechSynthesis' in window) {
    speechSynthesis.resume();
  }
  $('btn-pausa').innerHTML = S.pausado ? icono('play') : icono('pausa');
}

function reiniciarEscena() {
  const actual = S.seq[S.idx];
  if (!actual) return;
  const esc = actual.esc;
  const pos = S.seq.findIndex((x) => x.esc === esc);
  cancelar();
  S.pausado = false;
  correr(pos >= 0 ? pos : 0);
  aviso(`Escena ${num(esc.n)} desde el principio.`, 2200);
}

/* ===================== grabación ===================== */
async function iniciarGrabacion(auto = true) {
  if (S.grabando) return;
  const ok = await Micro.activar();
  if (!ok) {
    aviso('No pude usar el micrófono. Revisa el permiso del navegador y vuelve a intentar.', 7000);
    grabacionAuto = false;
    return;
  }
  try {
    const stream = Micro.stream;
    S.trozos = [];
    const rec = new MediaRecorder(stream);
    S.mediaRecorder = rec;
    rec.ondataavailable = (e) => { if (e.data.size) S.trozos.push(e.data); };
    rec.onstop = () => {
      if (!S.trozos.length) return;
      const blob = new Blob(S.trozos, { type: S.trozos[0].type || 'audio/webm' });
      if (S.grabacionUrl) URL.revokeObjectURL(S.grabacionUrl);
      S.grabacionUrl = URL.createObjectURL(blob);
      S.grabacionIdx = S.idx;
      S.grabando = false;
      pintarLinea();
    };
    rec.start();
    S.grabando = true;
    pintarLinea();
    empezarEscuchaTurno();
  } catch (e) {
    aviso('No se pudo grabar. Revisa el permiso del micrófono.', 6000);
    grabacionAuto = false;
  }
}

function detenerGrabacion(silencio = false) {
  if (!S.grabando || !S.mediaRecorder) return;
  try { S.mediaRecorder.stop(); } catch (e) { /* ya estaba detenido */ }
  S.grabando = false;
  if (!silencio) pintarLinea();
}

/* ===================== teleprónter ===================== */
function pintarTeleEscenas() {
  const sel = $('tele-escena');
  sel.innerHTML = escenasDe().map((e) => `<option value="${escapar(String(e.n))}">Escena ${num(e.n)} · ${escapar(tituloEscena(e))}</option>`).join('');
  S.tele.escena = String(escenasDe()[0].n);
  pintarTele();
}

function pintarTele() {
  const e = escenasDe().find((x) => String(x.n) === String(S.tele.escena));
  if (!e) return;
  const trozos = [];
  trozos.push(`<div class="t-escena">Escena ${num(e.n)}</div><h2 class="t-titulo">${escapar(tituloEscena(e))}</h2>`);
  if (e.subt) trozos.push(`<div class="t-acot">${escapar(e.subt)}</div>`);
  let ultimoFueMio = false;
  e.b.forEach((b, i) => {
    const mia = b.t === 'd' && b.q === S.yo;
    if (S.tele.soloMias) {
      const esEntrada = b.t === 'd' && !mia && !ultimoFueMio;
      if (!mia && !esEntrada) return;
    }
    if (b.t === 'd') {
      trozos.push(`<div class="t-linea ${mia ? 'mia' : ''}"><span class="q">${escapar(b.q)}</span>${escapar(b.x)}</div>`);
    } else if (b.t === 'c') {
      trozos.push(`<div class="t-cancion">${escapar(b.x)}</div>`);
    } else {
      trozos.push(`<div class="t-acot">${escapar(b.x)}</div>`);
    }
    ultimoFueMio = mia;
  });
  $('tele-texto').innerHTML = trozos.join('');
  $('tele-texto').style.fontSize = S.tele.tam + 'px';
  $('tele-lienzo').scrollTop = 0;
}

function alternarTele() {
  S.tele.sonando = !S.tele.sonando;
  $('tele-play').innerHTML = S.tele.sonando ? icono('pausa') : icono('play');
  if (S.tele.sonando) moverTele(); else cancelAnimationFrame(S.tele.raf);
}

function moverTele() {
  const caja = $('tele-lienzo');
  const paso = (S.tele.vel / 100) * 3.2;
  const avanzar = () => {
    if (!S.tele.sonando) return;
    caja.scrollTop += paso;
    if (caja.scrollTop + caja.clientHeight >= caja.scrollHeight - 2) {
      S.tele.sonando = false;
      $('tele-play').innerHTML = icono('play');
      return;
    }
    S.tele.raf = requestAnimationFrame(avanzar);
  };
  cancelAnimationFrame(S.tele.raf);
  S.tele.raf = requestAnimationFrame(avanzar);
}

/* ===================== mis líneas ===================== */
function pintarMisLineas() {
  const cont = $('lista-mias');
  cont.innerHTML = '';
  let total = 0;
  const trozos = [];
  escenasDe().forEach((e) => {
    const idx = [];
    e.b.forEach((b, i) => { if (b.t === 'd' && b.q === S.yo) idx.push(i); });
    if (!idx.length) return;
    total += idx.length;
    trozos.push(`<div class="t-escena" style="font-family:'Segoe UI',sans-serif;font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--oro);margin:20px 0 4px">Escena ${num(e.n)} · ${escapar(tituloEscena(e))}</div>`);
    idx.forEach((i) => {
      const b = e.b[i];
      let entrada = null;
      for (let j = i - 1; j >= 0; j--) {
        if (e.b[j].t === 'd') { entrada = e.b[j]; if (entrada.q === S.yo) entrada = null; break; }
      }
      trozos.push(`<div class="item-linea">
        <div class="meta">${escapar(b.q)}${entrada ? ' · entrada: ' + escapar(entrada.q) : ''}</div>
        ${entrada ? `<div class="entrada">${escapar(entrada.x)}</div>` : ''}
        <div class="mia-txt">${conFormato(b.x)}</div>
        <div class="botones">
          ${entrada ? `<button class="boton mini" data-oir-entrada="${escapar(String(e.n))}|${i}">${icono('altavoz')}Oír la entrada</button>` : ''}
          <button class="boton mini" data-oir-mia="${escapar(String(e.n))}|${i}">${icono('altavoz')}Oír mi línea</button>
          <button class="boton mini" data-ensayar="${escapar(String(e.n))}|${i}">Empezar desde aquí</button>
        </div>
      </div>`);
    });
  });
  cont.innerHTML = trozos.join('') || '<p class="nota">Este personaje no tiene líneas en el libreto.</p>';
  $('contador-mias').textContent = total + (total === 1 ? ' línea' : ' líneas');

  cont.querySelectorAll('[data-oir-entrada]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const [n, i] = btn.dataset.oirEntrada.split('|');
      const e = escenasDe().find((x) => String(x.n) === n);
      let entrada = null;
      for (let j = Number(i) - 1; j >= 0; j--) if (e.b[j].t === 'd') { entrada = e.b[j]; break; }
      if (!entrada) return;
      cancelar();
      await hablarTexto(entrada.x, { q: entrada.q });
      campana();
    });
  });
  cont.querySelectorAll('[data-oir-mia]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const [n, i] = btn.dataset.oirMia.split('|');
      const e = escenasDe().find((x) => String(x.n) === n);
      cancelar();
      await hablarTexto(e.b[Number(i)].x, { q: S.yo });
    });
  });
  cont.querySelectorAll('[data-ensayar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [n, i] = btn.dataset.ensayar.split('|');
      cambiarVista('ensayo');
      S.seleccion = new Set(escenasDe().map((x) => String(x.n)));
      pintarEscenas();
      construirSecuencia();
      const pos = S.seq.findIndex((x) => String(x.esc.n) === n && x.b === escenasDe().find((y) => String(y.n) === n).b[Number(i)]);
      empezar(null, pos >= 0 ? pos : 0);
    });
  });
}

/* ===================== ajustes ===================== */
function llenarSelectVoces() {
  const sel = $('sel-voz');
  if (!sel) return;
  sel.innerHTML = '<option value="">Automática (la del narrador)</option>' +
    S.voces.map((v) => `<option value="${escapar(v.name)}"${v.name === S.ajustes.voz ? ' selected' : ''}>${escapar(nombreCorto(v))} — ${escapar((v.lang || '').replace('es-', ''))}</option>`).join('');
}

function pintarAjustes() {
  llenarSelectVoces();
  $('aj-velocidad').value = S.ajustes.velocidad;
  $('aj-velocidad-val').textContent = S.ajustes.velocidad.toFixed(2).replace('.', ',') + '×';
  $('aj-tono').value = S.ajustes.tono;
  $('aj-tono-val').textContent = S.ajustes.tono.toFixed(2).replace('.', ',');
  $('aj-pausa').value = String(S.ajustes.pausa);
  $('aj-acotaciones').checked = !!S.ajustes.acotaciones;
  $('aj-campana').checked = !!S.ajustes.campana;
  $('aj-grabar').checked = !!S.ajustes.grabar;
  $('aj-escuchar').checked = !!S.ajustes.escuchar;
  $('aj-silencio').value = String(S.ajustes.silencio);
  $('aj-sensibilidad').value = String(S.ajustes.sensibilidad);
  $('rango-velocidad').value = S.ajustes.velocidad;
  $('valor-velocidad').textContent = S.ajustes.velocidad.toFixed(2).replace('.', ',') + '×';
}

function llenarSelectsPersonajes() {
  const cont = $('rejilla-personajes');
  if (!cont || !S.data || !S.voces.length) return;
  const lista = S.data.personajes
    .map((p) => ({ p, n: S.data.escenas.reduce((a, e) => a + e.b.filter((b) => b.t === 'd' && b.q === p).length, 0) }))
    .filter((x) => x.n >= 3)
    .sort((a, b) => b.n - a.n);

  cont.innerHTML = lista.map(({ p, n }) => {
    const auto = vozPara(p);
    const autoNombre = nombreCorto(auto);
    const elegida = (S.ajustes.voces && S.ajustes.voces[p]) || '';
    const opciones = S.voces.map((v) => {
      const nombre = nombreCorto(v) + (esNatural(v) ? '' : ' (local)');
      return `<option value="${escapar(v.name)}"${v.name === elegida ? ' selected' : ''}>${escapar(nombre)}</option>`;
    }).join('');
    return `<div class="fila-personaje">
      <div class="nom"><strong>${escapar(p)}</strong><span>${n} ${n === 1 ? 'línea' : 'líneas'}</span></div>
      <select data-personaje="${escapar(p)}" title="Voz de ${escapar(p)}">
        <option value="">Automática (${escapar(autoNombre)})</option>
        ${opciones}
      </select>
      <button class="boton mini" data-probar="${escapar(p)}" title="Oír una muestra">${icono('altavoz')}</button>
    </div>`;
  }).join('') || '<p class="nota">No se encontraron personajes con líneas.</p>';

  cont.querySelectorAll('select[data-personaje]').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      const quien = sel.dataset.personaje;
      if (!S.ajustes.voces) S.ajustes.voces = {};
      if (e.target.value) S.ajustes.voces[quien] = e.target.value;
      else delete S.ajustes.voces[quien];
      guardarAjustes();
      const linea = lineaDe(quien);
      if (linea) { cancelar(); hablarTexto(linea, { q: quien }); }
    });
  });
  cont.querySelectorAll('[data-probar]').forEach((b) => {
    b.addEventListener('click', () => {
      const linea = lineaDe(b.dataset.probar);
      if (linea) { cancelar(); hablarTexto(linea, { q: b.dataset.probar }); }
    });
  });
}

function lineaDe(q) {
  for (const e of S.data.escenas) for (const b of e.b) if (b.t === 'd' && b.q === q) return b.x;
  return '';
}

function guardarAjustes() {
  localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(S.ajustes));
}

function guardarProgreso() {
  const actual = S.seq[S.idx];
  if (!actual) return;
  localStorage.setItem(CLAVE_PROGRESO, JSON.stringify({
    escena: String(actual.esc.n),
    idx: S.idx,
    seleccion: [...S.seleccion],
    personaje: S.yo,
  }));
  marcarBotonContinuar();
}

function marcarBotonContinuar() {
  const p = JSON.parse(localStorage.getItem(CLAVE_PROGRESO) || 'null');
  const btn = $('btn-continuar');
  if (!p || p.personaje !== S.yo) { btn.hidden = true; return; }
  const e = escenasDe()?.find((x) => String(x.n) === p.escena);
  if (!e) { btn.hidden = true; return; }
  btn.hidden = false;
  btn.textContent = `Continuar en la escena ${num(e.n)}`;
}

/* ===================== navegación ===================== */
function cambiarVista(vista) {
  document.querySelectorAll('.pestana').forEach((b) => b.classList.toggle('activa', b.dataset.vista === vista));
  document.querySelectorAll('.vista').forEach((v) => v.classList.toggle('activa', v.id === 'vista-' + vista));
  if (vista !== 'ensayo') { cancelar(); S.pausado = false; }
  if (vista === 'mislineas') pintarMisLineas();
  if (vista === 'teleprompter') pintarTele();
  if (vista === 'ajustes') llenarSelectsPersonajes();
}

/* ===================== eventos ===================== */
function conectar() {
  document.querySelectorAll('.pestana').forEach((b) => b.addEventListener('click', () => cambiarVista(b.dataset.vista)));

  $('sel-personaje').addEventListener('change', (e) => {
    S.yo = e.target.value;
    localStorage.setItem(CLAVE_YO, S.yo);
    $('sel-personaje-2').value = S.yo;
    pintarEscenas();
    llenarPersonajes();
    $('sel-personaje').value = S.yo;
    marcarBotonContinuar();
  });
  $('sel-personaje-2').addEventListener('change', (e) => {
    S.yo = e.target.value;
    localStorage.setItem(CLAVE_YO, S.yo);
    llenarPersonajes();
    pintarEscenas();
    pintarMisLineas();
    marcarBotonContinuar();
  });

  $('btn-todas').addEventListener('click', () => {
    S.seleccion = new Set(escenasDe().map((e) => String(e.n)));
    pintarEscenas();
  });
  $('btn-ninguna').addEventListener('click', () => {
    S.seleccion.clear();
    pintarEscenas();
    $('btn-empezar').disabled = true;
  });
  $('btn-mias').addEventListener('click', () => {
    S.seleccion = new Set(escenasDe().filter((e) => misLineasEn(e)).map((e) => String(e.n)));
    pintarEscenas();
  });

  $('btn-empezar').addEventListener('click', () => empezar());
  $('btn-continuar').addEventListener('click', () => {
    const p = JSON.parse(localStorage.getItem(CLAVE_PROGRESO) || 'null');
    if (!p) return;
    S.seleccion = new Set(p.seleccion || [p.escena]);
    pintarEscenas();
    construirSecuencia();
    const pos = S.seq.findIndex((x) => String(x.esc.n) === p.escena);
    empezar(null, pos >= 0 ? pos : 0);
  });

  $('btn-siguiente').addEventListener('click', siguiente);
  $('btn-anterior').addEventListener('click', anterior);
  $('btn-repetir').addEventListener('click', repetir);
  $('btn-pausa').addEventListener('click', alternarPausa);
  $('btn-salir').addEventListener('click', salir);
  $('btn-reiniciar').addEventListener('click', reiniciarEscena);
  $('btn-reiniciar-2').addEventListener('click', reiniciarEscena);

  $('rango-velocidad').addEventListener('input', (e) => {
    S.ajustes.velocidad = Number(e.target.value);
    $('valor-velocidad').textContent = S.ajustes.velocidad.toFixed(2).replace('.', ',') + '×';
    guardarAjustes();
  });

  $('ens-escena-sel')?.addEventListener('change', (e) => {
    const pos = S.seq.findIndex((x) => String(x.esc.n) === e.target.value);
    if (pos >= 0) { cancelar(); S.pausado = false; correr(pos); }
  });

  document.addEventListener('keydown', (ev) => {
    if (!$('vista-ensayo').classList.contains('activa') || $('ensayo').hidden) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(ev.target.tagName)) return;
    if (ev.code === 'Space' || ev.key === 'Enter') { ev.preventDefault(); siguiente(); }
    else if (ev.key.toLowerCase() === 'r') { ev.preventDefault(); repetir(); }
    else if (ev.key.toLowerCase() === 'p') { ev.preventDefault(); alternarPausa(); }
    else if (ev.key === 'Home') { ev.preventDefault(); reiniciarEscena(); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); anterior(); }
  });

  // teleprónter
  $('tele-escena').addEventListener('change', (e) => { S.tele.escena = e.target.value; pintarTele(); });
  $('tele-tam-mas').addEventListener('click', () => { S.tele.tam = Math.min(40, S.tele.tam + 2); pintarTele(); });
  $('tele-tam-menos').addEventListener('click', () => { S.tele.tam = Math.max(14, S.tele.tam - 2); pintarTele(); });
  $('tele-mias').addEventListener('click', (ev) => {
    S.tele.soloMias = !S.tele.soloMias;
    ev.currentTarget.classList.toggle('primario', S.tele.soloMias);
    pintarTele();
  });
  $('tele-inicio').addEventListener('click', () => { $('tele-lienzo').scrollTop = 0; });
  $('tele-velocidad').addEventListener('input', (e) => { S.tele.vel = Number(e.target.value); });
  $('tele-play').addEventListener('click', alternarTele);

  // ajustes
  $('sel-voz').addEventListener('change', (e) => { S.ajustes.voz = e.target.value; guardarAjustes(); });
  $('aj-velocidad').addEventListener('input', (e) => {
    S.ajustes.velocidad = Number(e.target.value);
    $('aj-velocidad-val').textContent = S.ajustes.velocidad.toFixed(2).replace('.', ',') + '×';
    $('rango-velocidad').value = S.ajustes.velocidad;
    $('valor-velocidad').textContent = S.ajustes.velocidad.toFixed(2).replace('.', ',') + '×';
    guardarAjustes();
  });
  $('aj-tono').addEventListener('input', (e) => {
    S.ajustes.tono = Number(e.target.value);
    $('aj-tono-val').textContent = S.ajustes.tono.toFixed(2).replace('.', ',');
    guardarAjustes();
  });
  $('aj-pausa').addEventListener('change', (e) => { S.ajustes.pausa = Number(e.target.value); guardarAjustes(); });
  $('aj-acotaciones').addEventListener('change', (e) => { S.ajustes.acotaciones = e.target.checked; guardarAjustes(); });
  $('aj-campana').addEventListener('change', (e) => { S.ajustes.campana = e.target.checked; guardarAjustes(); });
  $('aj-grabar').addEventListener('change', (e) => { S.ajustes.grabar = e.target.checked; guardarAjustes(); });
  $('aj-escuchar').addEventListener('change', async (e) => {
    S.ajustes.escuchar = e.target.checked;
    guardarAjustes();
    if (S.ajustes.escuchar) {
      const ok = await prepararMicro();
      if (ok) aviso('Micrófono listo: cuando termines de hablar, la app sigue sola.', 5000);
    } else {
      detenerEscucha();
    }
  });
  $('aj-silencio').addEventListener('change', (e) => { S.ajustes.silencio = Number(e.target.value); guardarAjustes(); });
  $('aj-sensibilidad').addEventListener('change', (e) => { S.ajustes.sensibilidad = Number(e.target.value); guardarAjustes(); });

  $('btn-voces-auto').addEventListener('click', () => {
    S.ajustes.voces = {};
    guardarAjustes();
    llenarSelectsPersonajes();
    aviso('Voces devueltas al reparto automático.', 3000);
  });

  $('btn-probar-voz').addEventListener('click', async () => {
    cancelar();
    const frase = S.yo === 'HERODES'
      ? 'El poderoso gobierna. El débil obedece. Y Dios solo permanece en silencio.'
      : 'Nuestro padre decía que mientras una lámpara permaneciera encendida, la noche todavía no habría ganado.';
    await hablarTexto(frase, { q: S.yo });
  });

  if ('speechSynthesis' in window) {
    speechSynthesis.addEventListener('voiceschanged', cargarVoces);
  }
}

/* ===================== arranque ===================== */
window.__avisoVoz = (texto) => aviso(texto, 10000);

(async function inicio() {
  conectar();
  if (PUENTE) {
    document.body.classList.add('movil');
    const ajusteGrabar = $('aj-grabar') && $('aj-grabar').closest('.interruptor');
    if (ajusteGrabar) ajusteGrabar.hidden = true;
    const panelVoces = $('rejilla-personajes') && $('rejilla-personajes').closest('.panel');
    if (panelVoces) panelVoces.hidden = false;
  } else if (window.matchMedia('(max-width: 620px)').matches) {
    /* en el navegador del teléfono también se usa la pantalla angosta */
    document.body.classList.add('movil');
  }
  try {
    await cargar();
  } catch (e) {
    aviso('No se pudo cargar el libreto. Revisa que la ventana negra siga abierta.', 9000);
    return;
  }
  cargarVoces();
  setTimeout(cargarVoces, 400);
})();
