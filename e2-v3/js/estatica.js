/* El silencio también es un dato (E2, V3; misma capa de la E1, v4/js/estatica.js): si el país no tiene chart ese
   año, suena una radio sin señal (estática suave) en vez de nada. Es una capa aparte y solo suena con el sonido
   activado. Web Audio, sin archivos: ruido filtrado como el de una radio de onda media, con chasquidos sueltos.

   Nuevo en la E2: al girar la perilla de país suena un golpe corto de estática entre un país y otro, como al
   sintonizar una radio. Calza con el dial: los países son las emisoras. */

const Estatica = (() => {
  const VOLUMEN = 0.06;
  const VOLUMEN_SINTONIA = 0.16;             // el golpe entre un país y otro se oye más que el fondo sin datos
  let timerSintonia = null, sintonizando = false;
  let ctx = null, salida = null, habilitado = false, sonando = false, timerChasquido = null, ruido = null;

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
    const fuente = ctx.createBufferSource();
    fuente.buffer = ruido;
    fuente.loop = true;
    const banda = ctx.createBiquadFilter();            // el siseo de una radio: medios, sin graves ni agudos
    banda.type = 'bandpass';
    banda.frequency.value = 1800;
    banda.Q.value = 0.6;
    const vaiven = ctx.createGain();                   // la señal que va y viene
    const lfo = ctx.createOscillator();
    const profundidad = ctx.createGain();
    lfo.frequency.value = 0.7;
    profundidad.gain.value = 0.35;
    vaiven.gain.value = 0.65;
    lfo.connect(profundidad).connect(vaiven.gain);
    fuente.connect(banda).connect(vaiven).connect(salida);
    fuente.start();
    lfo.start();
    return true;
  }

  /** Un chasquido de estática (~20 ms), al azar mientras suena. */
  function chasquido(forzar) {
    if (!sonando && !sintonizando && !forzar) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = ruido;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    src.connect(g).connect(salida);
    src.start(t, Math.random(), 0.03);
    timerChasquido = setTimeout(chasquido, sintonizando ? 40 + Math.random() * 80 : 120 + Math.random() * 600);
  }

  return {
    /** Dentro de un gesto del usuario (click o tecla). */
    iniciar() {
      if (!ctx && !crear()) return;
      habilitado = true;
      ctx.resume();
    },
    silenciar() {
      habilitado = false;
      this.sonar(false);
    },
    get sonando() { return sonando; },
    /** Golpe corto de estática al cambiar de país (perilla, dial o teclado), como al sintonizar una radio. */
    sintonizar(ms = 380) {
      if (!ctx || !habilitado) return;
      const t = ctx.currentTime;
      salida.gain.cancelScheduledValues(t);
      salida.gain.setTargetAtTime(VOLUMEN_SINTONIA, t, 0.015);
      if (!sintonizando) { sintonizando = true; clearTimeout(timerChasquido); chasquido(true); }
      clearTimeout(timerSintonia);
      timerSintonia = setTimeout(() => {
        sintonizando = false;
        salida.gain.cancelScheduledValues(ctx.currentTime);
        salida.gain.setTargetAtTime(sonando ? VOLUMEN : 0, ctx.currentTime, 0.1);
        clearTimeout(timerChasquido);
        if (sonando) chasquido();
      }, ms);
    },
    /** true mientras el cursor está sobre un país sin datos. */
    sonar(si) {
      si = si && habilitado;
      if (!ctx || si === sonando) return;
      sonando = si;
      if (sintonizando) return;                         // al terminar el golpe se vuelve a este nivel
      salida.gain.cancelScheduledValues(ctx.currentTime);
      salida.gain.setTargetAtTime(si ? VOLUMEN : 0, ctx.currentTime, si ? 0.08 : 0.12);
      clearTimeout(timerChasquido);
      if (si) chasquido();
    },
  };
})();
