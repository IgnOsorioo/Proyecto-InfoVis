/* Sonificación (E2, V4): una ovación del público cada vez que cambia lo que suena (país, década o disco), en vez de
   aplausos constantes. Suena un momento y se apaga, para que después la canción se escuche limpia.

   El dato es el mismo que mueve el plato: de todas las ventas de álbumes de ese país en esa década, qué parte fue del
   género del disco puesto (por ejemplo, ventas de discos de rock / ventas totales). Con esa parte (0–1):
   - Intensidad: volumen de 0,15 a 1 (un género marginal es un murmullo; el que domina, un estadio).
   - Cercanía: un filtro pasa-bajos va de apagado y lejano (700 Hz) a brillante y cercano (12 kHz).
   - Duración: de 2 a 10 s; el público se calla antes o aplaude hasta el final.
   - Más gente: sobre el 40 % se suma una segunda capa de la misma ovación, desfasada y abierta a los lados.

   Grabación: audio/publico.mp3 (aportada por el grupo, 21-nov) trae la misma ovación cuatro veces, de ~10 s cada una
   (empiezan en 4,5, 15, 25,5 y 36 s: pico al primer segundo y luego decae). Cada ovación toma una de las cuatro al azar.
   Silencio = sin disco, en pausa o sin datos (ahí suena la estática, estatica.js). Si el archivo no carga, suenan los
   aplausos sintéticos de antes (aplausos.js) durante el mismo tiempo. */

const Ovacion = (() => {
  const ARCHIVO = 'audio/publico.mp3';
  const INICIOS = [4.5, 15.0, 25.5, 36.0];     // inicio de cada ovación dentro del archivo (s)
  const LARGO_OVACION = 10.3;                  // duración de una ovación completa (s)
  const DUR_MIN = 2, DUR_MAX = 10;             // s, para 0 % y 100 %
  const ESPERA_MS = 450;                       // al girar la perilla rápido no se encadena una ovación por posición
  const ATAQUE = 0.08, CAIDA = 1.2;            // fundidos de entrada y salida (s)

  let ctx = null, buffer = null, cargando = null, sinArchivo = false;
  let ultimaClave = null, timer = null, timerSintetico = null;
  let activas = [];                            // nodos de la ovación que suena

  async function cargar() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Sin Web Audio');
    ctx = new AC();
    const r = await fetch(ARCHIVO);
    if (!r.ok) throw new Error('Sin archivo del público');
    buffer = await ctx.decodeAudioData(await r.arrayBuffer());
  }

  /** Corta la ovación que esté sonando (con un fundido corto). */
  function cortar(fundido = 0.3) {
    clearTimeout(timerSintetico);
    if (sinArchivo || !buffer) Aplausos.continuo(false);
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const { fuente, volumen } of activas) {
      volumen.gain.cancelScheduledValues(t);
      volumen.gain.setValueAtTime(volumen.gain.value, t);
      volumen.gain.linearRampToValueAtTime(0, t + fundido);
      try { fuente.stop(t + fundido + 0.05); } catch (e) { /* ya terminó */ }
    }
    activas = [];
  }

  function capa(t, inicio, dur, pico, filtro, pan) {
    const fuente = ctx.createBufferSource();
    fuente.buffer = buffer;
    const volumen = ctx.createGain();
    volumen.gain.setValueAtTime(0, t);
    volumen.gain.linearRampToValueAtTime(pico, t + ATAQUE);
    volumen.gain.setValueAtTime(pico, t + Math.max(ATAQUE, dur - CAIDA));
    volumen.gain.linearRampToValueAtTime(0, t + dur);
    let nodo = fuente;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; fuente.connect(p); nodo = p; }
    nodo.connect(volumen).connect(filtro);
    fuente.start(t, inicio, dur + 0.1);
    activas.push({ fuente, volumen });
  }

  /** Una ovación para una parte `p` (0–1) del género. */
  function sonar(p) {
    if (!buffer && cargando && !sinArchivo) { cargando.then(() => sonar(p)); return; }   // todavía cargando
    cortar(0.15);
    const dur = DUR_MIN + (DUR_MAX - DUR_MIN) * p;
    if (sinArchivo || !buffer) {                      // respaldo: los aplausos sintéticos, el mismo tiempo
      Aplausos.actualizar(Math.max(1, Math.round(p * 50)), 50);
      Aplausos.continuo(true);
      timerSintetico = setTimeout(() => Aplausos.continuo(false), dur * 1000);
      return;
    }
    const t = ctx.currentTime + 0.02;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass'; filtro.Q.value = 0.5;
    filtro.frequency.value = Math.round(700 * Math.pow(18, p));     // 700 Hz → 12,6 kHz
    filtro.connect(ctx.destination);
    const inicio = INICIOS[Math.floor(Math.random() * INICIOS.length)];
    const pico = 0.15 + 0.85 * p;
    capa(t, inicio, Math.min(dur, LARGO_OVACION), pico, filtro, 0);
    if (p > 0.4) {                                    // más gente: la misma ovación desfasada, a los lados
      const otra = INICIOS[(INICIOS.indexOf(inicio) + 1) % INICIOS.length] + 0.3;
      const extra = pico * Math.min(1, (p - 0.4) / 0.6) * 0.7;
      capa(t + 0.12, otra, Math.min(dur, LARGO_OVACION) - 0.12, extra / 2, filtro, -0.6);
      capa(t + 0.2, otra + 0.2, Math.min(dur, LARGO_OVACION) - 0.2, extra / 2, filtro, 0.6);
    }
  }

  return {
    /** Dentro de un gesto del usuario (clic o tecla): crea o reanuda el audio y carga la grabación. */
    iniciar() {
      Aplausos.iniciar();
      if (ctx) { ctx.resume(); return; }
      if (cargando || sinArchivo) return;
      cargando = cargar().catch(() => { sinArchivo = true; ctx = null; });
    },
    /** Lo que suena ahora: `parte` (0–1) del género o null si el disco no gira; `clave` identifica país, década y disco.
        Aplaude solo cuando la clave cambia o el disco vuelve a girar, no mientras sigue igual. */
    actualizar(parte, clave) {
      if (parte === null) {                           // sin disco, en pausa o sin datos: silencio
        clearTimeout(timer);
        if (ultimaClave !== null) cortar();
        ultimaClave = null;
        return;
      }
      if (clave === ultimaClave) return;
      ultimaClave = clave;
      clearTimeout(timer);
      timer = setTimeout(() => sonar(Math.max(0, Math.min(1, parte))), ESPERA_MS);
    },
    silenciar() { clearTimeout(timer); ultimaClave = null; cortar(); },
    get conArchivo() { return !!buffer; },
  };
})();
