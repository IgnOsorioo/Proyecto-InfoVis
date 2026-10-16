/* Sonificación del mensaje: ¿el mundo escucha lo mismo?
   Una voz sintetizada por continente, debajo de la canción (que nunca se altera).

   - Tono: la altura de cada voz codifica qué parte de ese continente NO escucha el #1 global. Si todos sus
     países lo escuchan, la voz está en la nota base; mientras más se aleja, más se separa hacia un intervalo
     disonante. Mundo que escucha lo mismo = unísono limpio; mundo dividido = acorde disperso.
   - Timbre: voces cercanas pero no iguales "baten" (aspereza); el oído percibe la divergencia como roce.
   - Espacio: cada continente en su lugar del estéreo, de izquierda a derecha: América, Europa, África y
     Medio Oriente, Asia, Oceanía.
   - Un continente sin datos (o con menos de 2 países) calla.
   Suena mientras corre la línea de tiempo y unos segundos tras mover la fecha a mano. Web Audio, sin archivos. */

const Armonia = (() => {
  const BASE_HZ = 196;                        // sol 3: grave, para no competir con la voz de la canción
  // Hacia dónde se separa cada voz (en semitonos, con la divergencia máxima): arriba y abajo, alternando,
  // para que juntas formen un racimo disonante en vez de un acorde consonante.
  const DESVIO = { america: 6, europa: -5, africa: 4, asia: -3, oceania: 2 };
  const PANEO = { america: -0.8, europa: -0.35, africa: 0, asia: 0.45, oceania: 0.85 };
  const VOLUMEN = 0.16;
  const GLISADO_S = 0.35;                     // las voces se deslizan, no saltan
  const FUNDIDO_FINAL_S = 1.2;

  let ctx = null, salida = null, habilitado = false;
  const voces = {};                           // continente → {osc, osc2, ganancia}
  let continuo = false, hasta = 0, timer = null, sonandoAntes = false;

  function crear() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    salida = ctx.createGain();
    salida.gain.value = 0;
    const filtro = ctx.createBiquadFilter();  // quita el brillo áspero del diente de sierra
    filtro.type = 'lowpass';
    filtro.frequency.value = 1100;
    filtro.Q.value = 0.4;
    salida.connect(filtro).connect(ctx.destination);
    for (const [k, pan] of Object.entries(PANEO)) {
      const ganancia = ctx.createGain();
      ganancia.gain.value = 0;
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (p) { p.pan.value = pan; ganancia.connect(p).connect(salida); } else ganancia.connect(salida);
      // Dos osciladores por voz, apenas desafinados entre sí: una voz "cálida" y estable cuando está sola.
      const osc = ctx.createOscillator(), osc2 = ctx.createOscillator();
      osc.type = 'sawtooth'; osc2.type = 'triangle';
      osc.frequency.value = osc2.frequency.value = BASE_HZ;
      osc2.detune.value = 5;
      osc.connect(ganancia); osc2.connect(ganancia);
      osc.start(); osc2.start();
      voces[k] = { osc, osc2, ganancia };
    }
    return true;
  }

  /** Revisa cada 100 ms si debe sonar (continuo o dentro de un pulso) y funde la salida. */
  function vigilar() {
    if (!ctx) return;
    const sonando = habilitado && (continuo || ctx.currentTime < hasta);
    if (sonando !== sonandoAntes) {
      salida.gain.cancelScheduledValues(ctx.currentTime);
      salida.gain.setTargetAtTime(sonando ? VOLUMEN : 0, ctx.currentTime, sonando ? 0.15 : FUNDIDO_FINAL_S / 3);
      sonandoAntes = sonando;
    }
  }

  return {
    /** Dentro de un gesto del usuario (click o tecla): crea o reanuda el audio. */
    iniciar() {
      if (!ctx && !crear()) return;
      habilitado = true;
      ctx.resume();
      timer ??= setInterval(vigilar, 100);
    },
    silenciar() {
      habilitado = false;
      vigilar();
    },
    /** fracciones: {continente: fracción de sus países que escuchan el #1 global (0–1), o null sin datos}. */
    actualizar(fracciones) {
      if (!ctx) return;
      const t = ctx.currentTime;
      for (const [k, v] of Object.entries(voces)) {
        const f = fracciones[k];
        v.ganancia.gain.setTargetAtTime(f === null || f === undefined ? 0 : 1 / 5, t, 0.2);
        if (f === null || f === undefined) continue;
        const hz = BASE_HZ * 2 ** ((1 - f) * DESVIO[k] / 12);
        v.osc.frequency.setTargetAtTime(hz, t, GLISADO_S / 3);
        v.osc2.frequency.setTargetAtTime(hz, t, GLISADO_S / 3);
      }
    },
    /** Suena unos segundos (al mover la fecha a mano) y se apaga de a poco. */
    pulso(ms) {
      if (ctx) hasta = Math.max(hasta, ctx.currentTime + ms / 1000);
    },
    /** Suena sin parar mientras corre la línea de tiempo. */
    continuo(si) {
      continuo = si;
      if (!si && ctx) hasta = Math.max(hasta, ctx.currentTime + 0.6);
    },
  };
})();
