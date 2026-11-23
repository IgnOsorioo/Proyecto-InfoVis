/* Sonificación (E2, V4): una ovación del público cada vez que cambia lo que suena (país, década o disco), en vez de
   aplausos constantes. Suena un momento y se apaga, para que después la canción se escuche limpia.

   El dato es el mismo que mueve el plato: de todas las ventas de álbumes de ese país en esa década, qué parte fue del
   género del disco puesto (por ejemplo, ventas de discos de rock / ventas totales). Con esa parte (0–1):
   - Intensidad: volumen de 0,15 a 1 (un género marginal es un murmullo; el que domina, un estadio).
   - Cercanía: un filtro pasa-bajos va de apagado y lejano (700 Hz) a brillante y cercano (12 kHz).
   - Duración: de 6 a 20 s (22-nov: antes 2–10 s y pasaba inadvertida); el público se calla antes o sigue aplaudiendo.
   - Más gente: sobre el 40 % se suma una segunda capa de la misma ovación, desfasada y abierta a los lados.

   Grabación: audio/publico.mp3 (aportada por el grupo, 21-nov) trae la misma ovación cuatro veces, de ~10 s cada una
   (empiezan en 4,5, 15, 25,5 y 36 s: pico al primer segundo y luego decae). Cada ovación toma una de las cuatro al azar
   y, si dura más de una grabación, encadena las siguientes con un fundido cruzado, entrando ya pasado el pico para que
   no suene como aplausos que vuelven a empezar.
   Silencio = sin disco, en pausa o sin datos (ahí suena la estática, estatica.js). Si el archivo no carga, suenan los
   aplausos sintéticos de antes (aplausos.js) durante el mismo tiempo. */

const Ovacion = (() => {
  const ARCHIVO = 'audio/publico.mp3';
  const INICIOS = [4.5, 15.0, 25.5, 36.0];     // inicio de cada ovación dentro del archivo (s)
  const LARGO_OVACION = 10.3;                  // duración de una ovación completa (s)
  const DUR_MIN = 6, DUR_MAX = 20;             // s, para 0 % y 100 %
  const CRUCE = 2.5;                           // fundido cruzado entre una grabación y la siguiente (s)
  const SIN_PICO = 1.5;                        // las grabaciones encadenadas entran pasado el grito inicial (s)
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

  /** Una capa de la ovación de `dur` s que empieza en `t`: encadena grabaciones (cada una de LARGO_OVACION s) con un
      fundido cruzado hasta llenar la duración, y al final se apaga con CAIDA. */
  function capa(t, inicio, dur, pico, filtro, pan) {
    let salida = filtro;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(filtro); salida = p; }
    const fin = t + dur;
    // k = la grabación que contiene `inicio` (las capas laterales entran unos décimos después de su comienzo).
    let k = INICIOS.length - 1;
    while (k > 0 && INICIOS[k] > inicio) k--;
    let desde = t, offset = inicio, primera = true;
    while (desde < fin - 0.05) {
      const largo = LARGO_OVACION - (offset - INICIOS[k]);     // lo que queda de esta grabación
      const hasta = Math.min(fin, desde + largo);
      const ultima = hasta >= fin - 0.01;
      const entrada = primera ? ATAQUE : CRUCE;
      const caida = ultima ? Math.min(CAIDA, hasta - desde) : CRUCE;
      const fuente = ctx.createBufferSource();
      fuente.buffer = buffer;
      const volumen = ctx.createGain();
      volumen.gain.setValueAtTime(0, desde);
      volumen.gain.linearRampToValueAtTime(pico, desde + entrada);
      volumen.gain.setValueAtTime(pico, Math.max(desde + entrada, hasta - caida));
      volumen.gain.linearRampToValueAtTime(0, hasta);
      fuente.connect(volumen).connect(salida);
      fuente.start(desde, offset, hasta - desde + 0.1);
      activas.push({ fuente, volumen });
      if (ultima) break;
      // La siguiente grabación entra CRUCE s antes de que esta termine, ya pasado su pico.
      k = (k + 1) % INICIOS.length;
      offset = INICIOS[k] + SIN_PICO;
      desde = hasta - CRUCE;
      primera = false;
    }
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
    capa(t, inicio, dur, pico, filtro, 0);
    if (p > 0.4) {                                    // más gente: la misma ovación desfasada, a los lados
      const otra = INICIOS[(INICIOS.indexOf(inicio) + 1) % INICIOS.length] + 0.3;
      const extra = pico * Math.min(1, (p - 0.4) / 0.6) * 0.7;
      capa(t + 0.12, otra, dur - 0.12, extra / 2, filtro, -0.6);
      capa(t + 0.2, otra + 0.2, dur - 0.2, extra / 2, filtro, 0.6);
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
