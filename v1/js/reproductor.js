/* Reproduce el preview de 30 s de Deezer de la canción bajo el cursor.

   - La API de Deezer no permite fetch desde otro dominio, así que se consulta por JSONP.
   - Las URLs de preview expiran (~15 min): se piden al momento y se guardan en caché por 10 min.
   - Dos elementos <audio> alternados permiten un fundido cruzado al pasar de un país a otro.
     Si el país siguiente tiene la misma canción #1, la música sigue sin cortarse. */

const Reproductor = (() => {
  const VOLUMEN = 0.9;
  const FUNDIDO_MS = 250;
  const VIGENCIA_MS = 10 * 60 * 1000;
  // WAV vacío: se reproduce una vez dentro del click de activación para desbloquear el audio.
  const SILENCIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

  const pistas = [new Audio(), new Audio()];
  pistas.forEach(a => { a.preload = 'auto'; a.loop = true; a.volume = 0; });
  let turno = 0;
  let actual = null;            // { idx, audio }
  let solicitud = 0;            // descarta respuestas de canciones que ya no están bajo el cursor
  let habilitado = false;
  const cache = new Map();      // idx → { url, t }
  let alCambiarEstado = () => {};

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = `__dz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const s = document.createElement('script');
      const limpiar = () => { delete window[cb]; s.remove(); };
      window[cb] = datos => { limpiar(); resolve(datos); };
      s.onerror = () => { limpiar(); reject(new Error('Deezer no respondió')); };
      s.src = `${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=${cb}`;
      document.head.appendChild(s);
    });
  }

  /** URL del preview: por id de Deezer (calculado en el pipeline) o, si no hay, buscando artista + título. */
  async function urlPreview(c) {
    const guardado = cache.get(c.idx);
    if (guardado && Date.now() - guardado.t < VIGENCIA_MS) return guardado.url;
    let url = '';
    if (c.deezer) {
      const pista = await jsonp(`https://api.deezer.com/track/${c.deezer}`);
      url = pista.preview || '';
    } else {
      const q = encodeURIComponent(`${c.artistas.split(', ')[0]} ${c.titulo.replace(/\s*[([].*?[)\]]/g, '')}`);
      const r = await jsonp(`https://api.deezer.com/search?q=${q}&limit=1`);
      url = r.data?.[0]?.preview || '';
    }
    if (!url) throw new Error('Sin preview');
    cache.set(c.idx, { url, t: Date.now() });
    return url;
  }

  /** Cambia el volumen gradualmente. Un fundido nuevo sobre la misma pista cancela el anterior. */
  function fundir(audio, hasta, alTerminar) {
    const id = tomarPista(audio);
    const desde = audio.volume;
    const t0 = performance.now();
    const paso = ahora => {
      if (audio._fundido !== id) return;
      // El timestamp de requestAnimationFrame puede ser anterior a t0: se acota k a [0, 1].
      const k = Math.min(1, Math.max(0, (ahora - t0) / FUNDIDO_MS));
      audio.volume = desde + (hasta - desde) * k;
      if (k < 1) requestAnimationFrame(paso);
      else alTerminar?.();
    };
    requestAnimationFrame(paso);
  }

  function tomarPista(audio) {
    audio._fundido = (audio._fundido || 0) + 1;
    return audio._fundido;
  }

  function soltar(pista) {
    if (!pista?.audio) return;
    const audio = pista.audio;
    fundir(audio, 0, () => audio.pause());
  }

  /** Debe llamarse dentro de un click: desbloquea ambos <audio> para poder reproducir luego con hover. */
  function habilitar() {
    habilitado = true;
    for (const a of pistas) {
      a.src = SILENCIO;
      a.play().then(() => a.pause()).catch(() => {});
    }
  }

  function deshabilitar() {
    habilitado = false;
    detener();
  }

  async function tocar(c) {
    if (!habilitado) { alCambiarEstado('silencio', c); return; }
    if (actual?.idx === c.idx) return;                // misma canción: sigue sonando
    const mia = ++solicitud;
    soltar(actual);
    actual = { idx: c.idx, audio: null };
    alCambiarEstado('cargando', c);
    try {
      const url = await urlPreview(c);
      if (mia !== solicitud) return;
      const audio = pistas[turno = 1 - turno];
      tomarPista(audio);                              // cancela un fundido de salida pendiente en esta pista
      audio.pause();
      audio.src = url;
      audio.volume = 0;
      await audio.play();
      if (mia !== solicitud) { audio.pause(); return; }
      actual.audio = audio;
      fundir(audio, VOLUMEN);
      alCambiarEstado('sonando', c);
    } catch (e) {
      if (mia === solicitud) alCambiarEstado('sin-preview', c);
    }
  }

  function detener() {
    solicitud++;
    soltar(actual);
    actual = null;
  }

  function progreso() {
    const a = actual?.audio;
    return a && a.duration ? a.currentTime / a.duration : 0;
  }

  return {
    habilitar, deshabilitar, tocar, detener, progreso,
    get habilitado() { return habilitado; },
    alCambiar(fn) { alCambiarEstado = fn; },
  };
})();
