/* Sonificación de datos: un público que aplaude según la popularidad de la canción seguida en el tiempo.
   La canción (preview de Deezer) no se altera; los aplausos suenan sobre ella.

   - Ritmo / densidad = reproducciones de la semana (suma de los charts de los 70 países, escala logarítmica):
     cuántas personas aplauden. Con pocas reproducciones se oyen aplausos sueltos, uno a uno; con un éxito
     mundial, una ovación densa.
   - Timbre = mismo dato en su tramo alto: sobre ~55 % aparece el murmullo de un estadio, más brillante
     mientras más popular.
   - Vítores (silbidos de celebración) = en cuántos países es #1: no hay si no es #1 en ninguno, y son más
     frecuentes mientras en más países lo sea.
   - Silencio = esa semana la canción no está en ningún chart.

   Todo se sintetiza con la Web Audio API (ruido filtrado y osciladores), sin archivos de audio. */

const Aplausos = (() => {
  const LOG_MIN = Math.log10(30e3);       // ≈ 30 mil reproducciones semanales: una sola persona
  const LOG_MAX = Math.log10(120e6);      // ≈ 120 millones (el máximo del dataset): ovación completa
  const MAX_PERSONAS = 48;
  const VOLUMEN = 1.4;
  const LOOKAHEAD_S = 0.12;
  const FUNDIDO_FINAL_S = 0.9;            // al final de un pulso los aplausos se apagan de a poco

  let ctx = null, salida = null, ruido = null, gananciaMurmullo = null, filtroMurmullo = null;
  let habilitado = false;
  let nivel = 0;                          // 0..1 popularidad (0 = fuera de los charts: silencio)
  let paisesNumero1 = 0;
  let continuo = false;                   // suena sin parar (mientras corre la línea de tiempo)
  let hasta = 0;                          // si no es continuo, suena hasta este instante (ctx.currentTime)
  let personas = [];
  let proximoVitor = 0;
  let timer = null;
  const objetivos = {};                   // último valor pedido a cada parámetro (para no repetir automatizaciones)

  function crear() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    salida = ctx.createGain();
    salida.gain.value = 0;
    salida.connect(ctx.destination);
    ruido = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = ruido.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Murmullo de estadio: ruido continuo filtrado, en silencio hasta que la popularidad es alta.
    const murmullo = ctx.createBufferSource();
    murmullo.buffer = ruido;
    murmullo.loop = true;
    filtroMurmullo = ctx.createBiquadFilter();
    filtroMurmullo.type = 'lowpass';
    filtroMurmullo.frequency.value = 500;
    gananciaMurmullo = ctx.createGain();
    gananciaMurmullo.gain.value = 0;
    murmullo.connect(filtroMurmullo).connect(gananciaMurmullo).connect(salida);
    murmullo.start();
    // Cada persona aplaude a su propio ritmo y en su lugar (paneo). Al subir la popularidad se suman
    // personas en orden fijo: las que ya aplaudían siguen igual.
    personas = Array.from({ length: MAX_PERSONAS }, () => ({
      proximo: 0, periodo: 0.28 + Math.random() * 0.16, pan: Math.random() * 1.6 - 0.8,
    }));
    return true;
  }

  function fijar(param, clave, valor, constante) {
    if (objetivos[clave] === valor) return;
    objetivos[clave] = valor;
    param.cancelScheduledValues(ctx.currentTime);
    param.setTargetAtTime(valor, ctx.currentTime, constante);
  }

  function conPaneo(nodo, pan) {
    if (!ctx.createStereoPanner) return nodo.connect(salida);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    return nodo.connect(p).connect(salida);
  }

  /** Un aplauso: un golpe de ruido filtrado de ~60–110 ms. */
  function aplauso(t, pan, amp) {
    const src = ctx.createBufferSource();
    src.buffer = ruido;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.frequency.value = 900 + Math.random() * 1500;
    filtro.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06 + Math.random() * 0.05);
    src.connect(filtro).connect(g);
    conPaneo(g, pan);
    src.start(t, Math.random() * 1.8, 0.13);
  }

  /** Un silbido de celebración que sube y baja (~0,35 s). */
  function silbido(t) {
    const o = ctx.createOscillator();
    const f = 1700 + Math.random() * 500;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.45, t + 0.18);
    o.frequency.exponentialRampToValueAtTime(f * 1.1, t + 0.33);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.03);
    g.gain.setValueAtTime(0.06, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g);
    conPaneo(g, Math.random() * 1.4 - 0.7);
    o.start(t);
    o.stop(t + 0.4);
  }

  const esperaExponencial = porSegundo => -Math.log(1 - Math.random()) / porSegundo;

  /** Programa los sonidos de los próximos ~120 ms (se llama cada 40 ms). */
  function programar() {
    if (!ctx || !habilitado) return;
    const ahora = ctx.currentTime, horizonte = ahora + LOOKAHEAD_S;
    const restante = continuo ? Infinity : hasta - ahora;
    const sonando = restante > 0 && nivel > 0;
    const factor = sonando ? Math.min(1, restante / FUNDIDO_FINAL_S) : 0;
    const n = sonando ? Math.max(1, Math.round((1 + nivel * (MAX_PERSONAS - 1)) * factor)) : 0;
    const amp = 2.6 / Math.pow(Math.max(1, n), 0.45);

    personas.forEach((p, i) => {
      if (i >= n) { p.proximo = 0; return; }
      if (p.proximo < ahora) p.proximo = ahora + Math.random() * p.periodo;   // se suma con un desfase al azar
      while (p.proximo < horizonte) {
        aplauso(p.proximo, p.pan, amp);
        p.proximo += p.periodo * (0.94 + Math.random() * 0.12);
      }
    });

    if (sonando && paisesNumero1 > 0) {
      const porSegundo = Math.min(3, 0.3 + paisesNumero1 * 0.12) * factor;
      if (proximoVitor < ahora) proximoVitor = ahora + esperaExponencial(porSegundo);
      while (proximoVitor < horizonte) {
        silbido(proximoVitor);
        proximoVitor += esperaExponencial(porSegundo);
      }
    }

    fijar(gananciaMurmullo.gain, 'murmullo', sonando ? Math.round(Math.max(0, (nivel - 0.55) / 0.45) * 0.2 * factor * 100) / 100 : 0, 0.3);
    fijar(filtroMurmullo.frequency, 'brillo', Math.round(500 + nivel * 2500), 0.3);
    fijar(salida.gain, 'volumen', sonando ? VOLUMEN : 0, sonando ? 0.05 : 0.3);
  }

  return {
    /** Debe llamarse dentro de un gesto del usuario (click o tecla): crea o reanuda el contexto de audio. */
    iniciar() {
      if (!ctx && !crear()) return;
      habilitado = true;
      ctx.resume();
      if (!timer) timer = setInterval(programar, 40);
    },
    silenciar() {
      habilitado = false;
      continuo = false;
      hasta = 0;
      if (ctx) fijar(salida.gain, 'volumen', 0, 0.05);
    },
    /** Datos del período: reproducciones semanales y en cuántos países es #1. */
    actualizar({ streams, numero1 }) {
      nivel = streams > 0 ? Math.min(1, Math.max(0.02, (Math.log10(streams) - LOG_MIN) / (LOG_MAX - LOG_MIN))) : 0;
      paisesNumero1 = numero1;
    },
    /** Suena unos segundos (al fijar una canción o mover la línea de tiempo en pausa) y se apaga de a poco. */
    pulso(ms) {
      if (ctx) hasta = Math.max(hasta, ctx.currentTime + ms / 1000);
    },
    /** Suena sin parar mientras corre la línea de tiempo; al pausar se apaga de a poco. */
    continuo(si) {
      continuo = si;
      if (!si && ctx) hasta = ctx.currentTime + FUNDIDO_FINAL_S + 0.3;
    },
    detener() {
      continuo = false;
      hasta = 0;
    },
    get nivel() { return nivel; },
  };
})();
