/* Punto de entrada: conecta el mapa, el panel lateral, el audio y el reproductor (línea de tiempo). */

(() => {
  const $ = id => document.getElementById(id);
  const slider = $('slider');
  const botonPlay = $('play');
  const ESPERA_AUDIO_MS = 120;   // al barrer el mapa con el cursor no se piden previews de cada país que se cruza
  const ESPERA_SALIDA_MS = 350;
  let raf = null, ultimoPaso = 0;
  let timerAudio = null, timerSalida = null;

  // ---------- Tiempo ----------

  function irAPeriodo(p) {
    Estado.periodo = p;
    slider.value = p;
    const n = window.PERIODOS[Estado.grano].n;
    slider.style.setProperty('--avance', `${(n > 1 ? p / (n - 1) : 1) * 100}%`);   // relleno de la línea
    $('fecha').textContent = textoPeriodoCorto(Estado.grano, p);
    actualizarSaltos();
    // Si el cursor está sobre un país, su #1 puede cambiar con la fecha; si no, la canción elegida se mantiene.
    if (Estado.paisActivo) elegirDesdePais(Estado.paisActivo);
    Mapa.dibujar();
    Panel.tiempo();
  }

  function cambiarGrano(grano) {
    const fecha = fechaDePeriodo(Estado.grano, Estado.periodo);
    Estado.grano = grano;
    slider.max = window.PERIODOS[grano].n - 1;
    document.querySelectorAll('.granos button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.grano === grano)));
    irAPeriodo(periodoDeFecha(grano, fecha));
  }

  /** Período al que lleva saltar `delta` años desde el actual (misma fecha, acotado al rango de datos). */
  function periodoTrasSalto(delta) {
    const f = fechaDePeriodo(Estado.grano, Estado.periodo);
    f.setUTCFullYear(f.getUTCFullYear() + delta);
    return periodoDeFecha(Estado.grano, f);
  }

  function saltarAnio(delta) {
    const p = periodoTrasSalto(delta);
    if (p !== Estado.periodo) irAPeriodo(p);
  }

  /** Botones de año anterior/siguiente: muestran el año de destino y se desactivan en los extremos. */
  function actualizarSaltos() {
    for (const [id, delta] of [['anio-anterior', -1], ['anio-siguiente', 1]]) {
      const p = periodoTrasSalto(delta);
      const posible = p !== Estado.periodo;
      const etiqueta = posible ? `Ir a ${textoPeriodo(Estado.grano, p)}` : (delta < 0 ? 'No hay datos anteriores' : 'No hay datos posteriores');
      $(id).disabled = !posible;
      $(id).setAttribute('aria-label', etiqueta);
      $(id).title = etiqueta;
      $(`${id}-txt`).textContent = posible ? String(fechaDePeriodo(Estado.grano, p).getUTCFullYear()) : '';
    }
  }

  function paso(ts) {
    if (!Estado.reproduciendo) return;
    if (ts - ultimoPaso >= MS_POR_PASO[Estado.grano]) {
      ultimoPaso = ts;
      if (Estado.periodo >= window.PERIODOS[Estado.grano].n - 1) { pausar(); return; }
      irAPeriodo(Estado.periodo + 1);
    }
    raf = requestAnimationFrame(paso);
  }

  function reproducir() {
    if (Estado.periodo >= window.PERIODOS[Estado.grano].n - 1) irAPeriodo(0);
    Estado.reproduciendo = true;
    botonPlay.classList.add('reproduciendo');
    botonPlay.setAttribute('aria-label', 'Pausar');
    ultimoPaso = performance.now();
    raf = requestAnimationFrame(paso);
  }

  function pausar() {
    Estado.reproduciendo = false;
    cancelAnimationFrame(raf);
    botonPlay.classList.remove('reproduciendo');
    botonPlay.setAttribute('aria-label', 'Reproducir el paso del tiempo');
  }

  // ---------- Selección de canción y audio ----------

  /** Cambia la canción seleccionada (la que muestra el panel, se pinta en el mapa y suena). */
  function seleccionar(idx, { origen = null, sonar = true } = {}) {
    Estado.origen = origen;
    if (idx !== Estado.cancion) {
      Estado.cancion = idx;
      Panel.cancionCambiada();
    }
    if (sonar) tocarConEspera(cancion(idx));
  }

  function tocarConEspera(c) {
    clearTimeout(timerAudio);
    timerAudio = setTimeout(() => Reproductor.tocar(c), ESPERA_AUDIO_MS);
  }

  function detenerAudio() {
    clearTimeout(timerAudio);
    Reproductor.detener();
    Panel.audio('pausa');
  }

  /** El #1 del país pasa a ser la canción seleccionada; el top 5 del panel pasa a ese país. */
  function elegirDesdePais(cc) {
    Estado.ambito = cc;
    const r = numero1(cc);
    if (!r) {
      Panel.aviso(`${nombrePais(cc)}: Spotify publica su chart desde el ${textoFecha(new Date(window.PAISES[cc].inicio + 'T00:00:00Z'))}.`);
      detenerAudio();
      return;
    }
    Panel.aviso(null);
    seleccionar(r.idx, { origen: cc });
  }

  function pasarPorPais(cc) {
    clearTimeout(timerSalida);
    Estado.paisActivo = cc;
    marcarRegion(null);
    Mapa.marcar(cc);
    elegirDesdePais(cc);
    Mapa.dibujar();
    Panel.tiempo();
  }

  const NOTAS_SIN_CHART = {
    RUS: 'Spotify operó en Rusia solo entre 2020 y 2022, y este dataset no incluye su chart.',
    CHN: 'Spotify no está disponible en China.',
  };

  /** País o territorio sin chart de Spotify: {iso3, nombre, nota?} (la nota viene de datos/mundo.js). */
  function pasarSinChart(territorio) {
    clearTimeout(timerSalida);
    Estado.paisActivo = null;
    Mapa.marcar(null);
    Mapa.dibujar();
    Panel.aviso(`${territorio.nombre}: ${territorio.nota ?? NOTAS_SIN_CHART[territorio.iso3] ??
      'Spotify no publica un chart de canciones para este país (en África, solo para Sudáfrica, Nigeria, Egipto y Marruecos).'}`);
    detenerAudio();
  }

  /** Al salir del mapa se detiene el audio; la canción seleccionada y el panel se mantienen. */
  function salir() {
    clearTimeout(timerSalida);
    timerSalida = setTimeout(() => {
      Estado.paisActivo = null;
      Mapa.marcar(null);
      Mapa.dibujar();
      Panel.aviso(null);
      detenerAudio();
    }, ESPERA_SALIDA_MS);
  }

  function elegirDelTop(idx) {
    seleccionar(idx, { origen: null });
    Mapa.dibujar();
    Panel.tiempo();
  }

  function marcarRegion(boton) {
    document.querySelectorAll('.acercar button').forEach(x => x.classList.toggle('activo', x === boton));
  }

  Reproductor.alCambiar((estado, c) => {
    if (c.idx === Estado.cancion) Panel.audio(estado);
  });

  function animarProgreso() {
    Panel.progreso(Reproductor.progreso());
    requestAnimationFrame(animarProgreso);
  }

  // ---------- Sonido ----------

  function actualizarBotonSonido() {
    const on = Reproductor.habilitado;
    $('sonido').setAttribute('aria-pressed', String(on));
    $('sonido').setAttribute('aria-label', on ? 'Silenciar' : 'Activar sonido');
    $('sonido').title = on ? 'Silenciar' : 'Activar sonido';
  }

  function cerrarActivacion(conSonido) {
    if (conSonido) Reproductor.habilitar();
    $('activar').hidden = true;
    actualizarBotonSonido();
  }

  // ---------- Inicio ----------

  $('boton-activar').addEventListener('click', () => cerrarActivacion(true));
  $('boton-silencio').addEventListener('click', () => cerrarActivacion(false));
  $('sonido').addEventListener('click', () => {
    if (Reproductor.habilitado) Reproductor.deshabilitar();
    else Reproductor.habilitar();
    actualizarBotonSonido();
  });

  botonPlay.addEventListener('click', () => (Estado.reproduciendo ? pausar() : reproducir()));
  slider.addEventListener('input', () => irAPeriodo(Number(slider.value)));
  $('anio-anterior').addEventListener('click', () => saltarAnio(-1));
  $('anio-siguiente').addEventListener('click', () => saltarAnio(1));
  document.querySelectorAll('.granos button').forEach(b => b.addEventListener('click', () => cambiarGrano(b.dataset.grano)));
  document.querySelectorAll('.acercar button').forEach(b => b.addEventListener('click', () => {
    marcarRegion(b);
    Estado.ambito = b.dataset.region === 'mundo' ? 'global' : b.dataset.region;   // el top 5 pasa a la región
    Mapa.enfocar(b.dataset.region);
    Panel.tiempo();
  }));

  document.addEventListener('keydown', e => {
    if (e.target.closest('input, button, select, textarea, [tabindex]')) return;
    const n = window.PERIODOS[Estado.grano].n;
    if (e.code === 'Space') { e.preventDefault(); Estado.reproduciendo ? pausar() : reproducir(); }
    if (e.code === 'ArrowLeft') irAPeriodo(Math.max(0, Estado.periodo - 1));
    if (e.code === 'ArrowRight') irAPeriodo(Math.min(n - 1, Estado.periodo + 1));
  });

  Mapa.on({ alPasar: pasarPorPais, alPasarSinChart: pasarSinChart, alSalir: salir });
  Panel.iniciar({ alElegirCancion: elegirDelTop });

  slider.max = window.PERIODOS[Estado.grano].n - 1;
  $('fecha-fin').textContent = textoPeriodoCorto('dia', window.PERIODOS.dia.n - 1);   // fin de los datos
  Estado.periodo = window.PERIODOS[Estado.grano].n - 1;                               // parte en el día más reciente
  seleccionar(numero1('global').idx, { sonar: false });                               // y con el #1 del mundo
  irAPeriodo(Estado.periodo);
  actualizarBotonSonido();
  Panel.audio(null);
  animarProgreso();
})();
