/* Sonificación: un público que aplaude según en cuántos países es #1 la canción que suena.
   La canción (preview de Deezer) no se altera; los aplausos son una capa aparte, encima.

   - Personas = países: cada país de la muestra fija (52) donde la canción es #1 en la fecha es una persona
     aplaudiendo, a su ritmo y en su lugar del estéreo (el país que se mira cuenta aunque esté fuera de la
     muestra). Un hit local: una palma; el #1 de medio mundo: una ovación. La escala es la misma para toda
     canción y fecha.
   - Murmullo de estadio = el mismo dato en su tramo alto: aparece cuando es #1 en más de la mitad de los
     países, más brillante mientras más alto.
   - Silencio = país sin datos (ahí suena la estática de radio, estatica.js).
   Suena mientras corre el tiempo y unos segundos al cambiar de canción o de fecha. Web Audio, sin archivos. */

const Aplausos = (() => {
  const VOLUMEN = 1.3;
  const LOOKAHEAD_S = 0.12;
  const FUNDIDO_FINAL_S = 0.9;            // al final de un pulso los aplausos se apagan de a poco

  let ctx = null, salida = null, ruido = null, gananciaMurmullo = null, filtroMurmullo = null;
  let habilitado = false;
  let personasActivas = 0;                // países con la canción en su top 50
  let total = 1;                          // países de la muestra
  let continuo = false;                   // suena sin parar (mientras corre la línea de tiempo)
  let hasta = 0;                          // si no es continuo, suena hasta este instante (ctx.currentTime)
  let personas = [];
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
    // Murmullo de estadio: ruido continuo filtrado, en silencio hasta que el alcance pasa la mitad.
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
    // Una persona por país posible, cada una con su ritmo y su lugar (paneo). Al subir el alcance se suman
    // personas en orden fijo: las que ya aplaudían siguen igual.
    personas = Array.from({ length: 64 }, () => ({
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

  /** Programa los aplausos de los próximos ~120 ms (se llama cada 40 ms). */
  function programar() {
    if (!ctx || !habilitado) return;
    const ahora = ctx.currentTime, horizonte = ahora + LOOKAHEAD_S;
    const restante = continuo ? Infinity : hasta - ahora;
    const sonando = restante > 0 && personasActivas > 0;
    const factor = sonando ? Math.min(1, restante / FUNDIDO_FINAL_S) : 0;
    const n = sonando ? Math.max(1, Math.round(personasActivas * factor)) : 0;
    const amp = 2.6 / Math.pow(Math.max(1, n), 0.45);
    const nivel = personasActivas / total;

    personas.forEach((p, i) => {
      if (i >= n) { p.proximo = 0; return; }
      if (p.proximo < ahora) p.proximo = ahora + Math.random() * p.periodo;   // se suma con un desfase al azar
      while (p.proximo < horizonte) {
        aplauso(p.proximo, p.pan, amp);
        p.proximo += p.periodo * (0.94 + Math.random() * 0.12);
      }
    });

    fijar(gananciaMurmullo.gain, 'murmullo', sonando ? Math.round(Math.max(0, (nivel - 0.5) / 0.5) * 0.2 * factor * 100) / 100 : 0, 0.3);
    fijar(filtroMurmullo.frequency, 'brillo', Math.round(500 + nivel * 2500), 0.3);
    fijar(salida.gain, 'volumen', sonando ? VOLUMEN : 0, sonando ? 0.05 : 0.3);
  }

  return {
    /** Dentro de un gesto del usuario (click o tecla): crea o reanuda el contexto de audio. */
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
    /** En cuántos de los `de` países de la muestra es #1 la canción en la fecha. */
    actualizar(paises, de) {
      personasActivas = paises;
      total = Math.max(1, de);
    },
    /** Suena unos segundos (al cambiar de canción o de fecha en pausa) y se apaga de a poco. */
    pulso(ms) {
      if (ctx) hasta = Math.max(hasta, ctx.currentTime + ms / 1000);
    },
    /** Suena sin parar mientras corre la línea de tiempo; al pausar se apaga de a poco. */
    continuo(si) {
      continuo = si;
      if (!si && ctx) hasta = ctx.currentTime + FUNDIDO_FINAL_S + 0.3;
    },
  };
})();
