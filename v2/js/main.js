/* Punto de entrada: conecta el mapa, el panel, el audio (canción y aplausos), el buscador y la línea de tiempo.

   Interacción (mantra de Shneiderman: primero el panorama, luego acercar y filtrar, y el detalle a pedido):
   - Al entrar no hay nada que cerrar: el mapa ya muestra qué tan local es el #1 de cada país y el panel resume
     el mundo. El sonido se activa con el primer click o tecla (lo exigen los navegadores), sin bloquear nada.
   - Pasar el cursor por un país y detenerse un instante muestra su #1 y lo hace sonar. Cruzar países de camino
     al panel no cambia nada, y al salir del mapa el panel se queda con el último país.
   - Click en un país, en el top 5 o en el buscador: se sigue esa canción (✕ o Esc para volver). */

(() => {
  const $ = id => document.getElementById(id);
  const slider = $('slider');
  const botonPlay = $('play');
  const ESPERA_AUDIO_MS = 120;        // al barrer el mapa con el cursor no se piden previews de cada país que se cruza
  const ESPERA_INTENCION_MS = 140;    // hay que detenerse sobre un país para elegirlo
  const ESPERA_SALIDA_MS = 350;
  const PULSO_APLAUSOS_MS = 3500;     // en pausa, los aplausos suenan unos segundos tras cada cambio
  let raf = null, ultimoPaso = 0;
  let timerAudio = null, timerSalida = null, timerIntencion = null;
  let sonidoDecidido = false;         // el usuario ya hizo un gesto (o usó el botón de sonido)
  let region = 'global';              // región elegida con los botones ('global' o un continente)
  let seguida = null;                 // { idx, ranking, popularidad } de la canción seguida
  let pedidoSeguir = 0;
  let territorio = null;              // territorio sin chart bajo el cursor (explorar: el panel muestra un mensaje)

  // ---------- Tiempo ----------

  function irAPeriodo(p) {
    Estado.periodo = p;
    slider.value = p;
    const n = window.PERIODOS[Estado.grano].n;
    slider.style.setProperty('--avance', `${(n > 1 ? p / (n - 1) : 1) * 100}%`);   // relleno de la línea
    $('fecha').textContent = textoPeriodoCorto(Estado.grano, p);
    actualizarSaltos();
    refrescar();
  }

  /** Vuelve a dibujar el panel, el mapa y el sonido para la fecha actual, según el modo. */
  function refrescar() {
    if (Estado.modo === 'seguir') {
      Estado.puestos = Object.fromEntries(PAISES_MAPA.map(cc => [cc, puestoEnPeriodo(seguida?.ranking, cc)]));
      Panel.mostrar();
      actualizarAplausos();
    } else if (!territorio) {
      if (Estado.vistaPais) elegirDesdePais(Estado.vistaPais);
      else Panel.resumen();
    }
    Mapa.dibujar();
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
    if (Estado.modo === 'seguir') Aplausos.continuo(true);
    ultimoPaso = performance.now();
    raf = requestAnimationFrame(paso);
  }

  function pausar() {
    Estado.reproduciendo = false;
    cancelAnimationFrame(raf);
    botonPlay.classList.remove('reproduciendo');
    botonPlay.setAttribute('aria-label', 'Reproducir el paso del tiempo');
    Aplausos.continuo(false);
  }

  // ---------- Canción que suena ----------

  function tocarConEspera(c) {
    clearTimeout(timerAudio);
    timerAudio = setTimeout(() => Reproductor.tocar(c), ESPERA_AUDIO_MS);
  }

  function detenerAudio() {
    clearTimeout(timerAudio);
    Reproductor.detener();
    Panel.audio('pausa');
  }

  // ---------- Explorar: el #1 de cada país ----------

  /** El panel pasa a mostrar el país: su #1 (que suena si el cursor está encima) y su top 5.
      Si el país todavía no tenía chart en esta fecha, el panel muestra solo un mensaje. */
  function elegirDesdePais(cc) {
    Estado.vistaPais = cc;
    Estado.ambito = cc;
    const r = numero1(cc);
    if (!r) {
      Estado.mensaje = true;
      Panel.mensaje(nombrePais(cc), `Sin datos en esta fecha: Spotify publica el chart de este país desde el ${textoFecha(new Date(window.PAISES[cc].inicio + 'T00:00:00Z'))}.`);
      detenerAudio();
      return;
    }
    Estado.mensaje = false;
    Estado.origen = cc;
    Estado.cancion = r.idx;
    if (Estado.paisActivo === cc) tocarConEspera(cancion(r.idx));
    Panel.mostrar();
  }

  /** Vuelve al panorama: resumen del mundo (o de la región elegida) y su top 5. */
  function volverAlResumen() {
    Estado.vistaPais = null;
    Estado.mensaje = false;
    Estado.ambito = region;
    detenerAudio();
    Panel.resumen();
  }

  // ---------- Cursor sobre el mapa ----------

  function pasarPorPais(cc, raton) {
    clearTimeout(timerSalida);
    clearTimeout(timerIntencion);
    if (Estado.modo === 'seguir') mostrarGlobo(nombrePais(cc), textoPuesto(cc), raton);
    timerIntencion = setTimeout(() => {
      Estado.paisActivo = cc;
      territorio = null;
      Mapa.marcar(cc);
      if (Estado.modo === 'explorar') elegirDesdePais(cc);
      Mapa.dibujar();
    }, ESPERA_INTENCION_MS);
  }

  const NOTAS_SIN_CHART = {
    RUS: 'Spotify operó en Rusia solo entre 2020 y 2022, y este dataset no incluye su chart.',
    CHN: 'Spotify no está disponible en China.',
  };

  /** País o territorio sin chart de Spotify: {iso3, nombre, nota?} (la nota viene de datos/mundo.js). */
  function pasarSinChart(t, raton) {
    clearTimeout(timerSalida);
    clearTimeout(timerIntencion);
    if (Estado.modo === 'seguir') mostrarGlobo(t.nombre, 'sin datos de Spotify', raton);
    timerIntencion = setTimeout(() => {
      Estado.paisActivo = null;
      Mapa.marcar(null);
      if (Estado.modo === 'explorar') {
        territorio = t;
        Panel.mensaje(t.nombre, t.nota ?? NOTAS_SIN_CHART[t.iso3] ??
          'Sin datos: Spotify no publica un chart de canciones para este país (en África, solo para Sudáfrica, Nigeria, Egipto y Marruecos).');
        detenerAudio();
      }
      Mapa.dibujar();
    }, ESPERA_INTENCION_MS);
  }

  /** Al salir del mapa: se quita el contorno y se detiene el preview; el panel se queda con el último país. */
  function salir() {
    clearTimeout(timerIntencion);
    ocultarGlobo();
    clearTimeout(timerSalida);
    timerSalida = setTimeout(() => {
      Estado.paisActivo = null;
      Mapa.marcar(null);
      if (Estado.modo === 'explorar') {
        if (territorio) {                                // vuelve a lo que mostraba antes del territorio sin datos
          territorio = null;
          refrescar();
        }
        detenerAudio();
      }
      Mapa.dibujar();
    }, ESPERA_SALIDA_MS);
  }

  // ---------- Seguir una canción ----------

  /** Fija la canción: el mapa muestra su puesto en cada país y los aplausos siguen su popularidad.
      Con `saltar`, si la canción no está en ningún chart en la fecha actual, se va a su semana de mayor popularidad. */
  async function seguir(idx, { origen = null, saltar = false } = {}) {
    const mio = ++pedidoSeguir;
    clearTimeout(timerIntencion);
    const [ranking, popularidad] = await Promise.all([
      pedirRanking(idx).catch(() => ({})),
      pedirPopularidad(idx).catch(() => null),
    ]);
    if (mio !== pedidoSeguir) return;
    seguida = { idx, ranking, popularidad };
    Estado.modo = 'seguir';
    Estado.cancion = idx;
    Estado.origen = origen;
    Estado.mensaje = false;
    Estado.vistaPais = null;
    Estado.ambito = origen ?? region;
    territorio = null;
    document.body.classList.add('modo-seguir');
    const c = cancion(idx);
    $('seguir-portada').src = c.portada;
    $('seguir-titulo').textContent = c.titulo;
    $('seguir-artistas').textContent = c.artistas;
    $('seguir').hidden = false;

    let p = Estado.periodo;
    if (saltar && popularidad && !PAISES_MAPA.some(cc => puestoEnPeriodo(ranking, cc) > 0)) {
      const max = popularidad.valores.indexOf(Math.max(...popularidad.valores));
      const fecha = fechaDeSemana(popularidad.inicio + max);
      fecha.setUTCDate(fecha.getUTCDate() + 3);          // mitad de la semana
      p = periodoDeFecha(Estado.grano, fecha);
    }
    Reproductor.tocar(c);
    if (Estado.reproduciendo) Aplausos.continuo(true);
    irAPeriodo(p);
  }

  function dejarDeSeguir() {
    if (Estado.modo !== 'seguir') return;
    pedidoSeguir++;
    seguida = null;
    Estado.modo = 'explorar';
    Estado.puestos = null;
    Estado.origen = null;
    document.body.classList.remove('modo-seguir');
    $('seguir').hidden = true;
    ocultarGlobo();
    Aplausos.detener();
    volverAlResumen();
    Mapa.dibujar();
  }

  /** Datos del sonido en el período: reproducciones semanales (aplausos) y en cuántos países es #1 (silbidos). */
  function actualizarAplausos() {
    const streams = streamsEnPeriodo(seguida?.popularidad);
    const n1 = paisesDondeEsNumero1(Estado.cancion).length;
    Aplausos.actualizar({ streams, numero1: n1 });
    if (!Estado.reproduciendo) Aplausos.pulso(PULSO_APLAUSOS_MS);
    $('seguir-dato').textContent = streams
      ? `${textoCantidad(streams)} reproducciones por semana${n1 ? ` · #1 en ${n1 === 1 ? '1 país' : `${n1} países`}` : ''}`
      : 'Fuera de los charts en esta fecha: no hay aplausos';
  }

  /** Puesto de la canción seguida en el país, para el globo: "#1 este día", "#4 · mejor puesto de la semana"… */
  function textoPuesto(cc) {
    const r1 = numero1(cc);
    if (!r1) return 'sin datos en esta fecha';
    const cuando = { dia: 'este día', semana: 'esta semana', mes: 'este mes', anio: 'este año' }[Estado.grano];
    if (r1.idx === Estado.cancion) return `#1 ${cuando}`;
    const r = puestoEnPeriodo(seguida?.ranking, cc);
    const mejor = { dia: 'de la semana', semana: 'de la semana', mes: 'del mes', anio: 'del año' }[Estado.grano];
    return r ? `#${r} · mejor puesto ${mejor}` : 'fuera del top 200';
  }

  function mostrarGlobo(titulo, texto, raton) {
    const g = $('globo');
    g.replaceChildren(Object.assign(document.createElement('strong'), { textContent: titulo }),
                      Object.assign(document.createElement('span'), { textContent: texto }));
    g.hidden = false;
    moverGlobo(raton);
  }

  function moverGlobo(raton) {
    const g = $('globo');
    if (g.hidden || !raton) return;
    const caja = g.parentElement.getBoundingClientRect();
    const x = raton.clientX - caja.left, y = raton.clientY - caja.top;
    const izquierda = x + 14 + g.offsetWidth > caja.width;      // cerca del borde derecho, va a la izquierda del cursor
    g.style.transform = `translate(${izquierda ? x - 14 - g.offsetWidth : x + 14}px, ${Math.max(0, y - g.offsetHeight - 10)}px)`;
  }

  function ocultarGlobo() {
    $('globo').hidden = true;
  }

  // ---------- Panel, top 5 y región ----------

  function marcarRegion(boton) {
    document.querySelectorAll('.acercar button').forEach(x => x.classList.toggle('activo', x === boton));
  }

  Reproductor.alCambiar((estado, c) => {
    if (c.idx !== Estado.cancion) return;
    Panel.audio(estado === 'silencio' && sonidoDecidido ? 'silenciado' : estado);
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
    $('aviso-sonido').hidden = sonidoDecidido;
  }

  function encenderSonido() {
    Reproductor.habilitar();
    Aplausos.iniciar();
    if (Estado.modo === 'seguir') {
      Reproductor.tocar(cancion(Estado.cancion));
      if (Estado.reproduciendo) Aplausos.continuo(true);
      else Aplausos.pulso(PULSO_APLAUSOS_MS);
    }
  }

  /** El primer click o tecla en cualquier parte activa el sonido (los navegadores no permiten audio antes). */
  function primerGesto(e) {
    if (sonidoDecidido || e.key === 'Escape' || e.target.closest?.('#sonido')) return;
    sonidoDecidido = true;
    encenderSonido();
    actualizarBotonSonido();
  }

  // ---------- Inicio ----------

  document.addEventListener('pointerdown', primerGesto, true);
  document.addEventListener('keydown', primerGesto, true);
  $('sonido').addEventListener('click', () => {
    sonidoDecidido = true;
    if (Reproductor.habilitado) {
      Reproductor.deshabilitar();
      Aplausos.silenciar();
      Panel.audio('silenciado');
    } else {
      encenderSonido();
    }
    actualizarBotonSonido();
  });

  botonPlay.addEventListener('click', () => (Estado.reproduciendo ? pausar() : reproducir()));
  slider.addEventListener('input', () => irAPeriodo(Number(slider.value)));
  $('anio-anterior').addEventListener('click', () => saltarAnio(-1));
  $('anio-siguiente').addEventListener('click', () => saltarAnio(1));
  document.querySelectorAll('.granos button').forEach(b => b.addEventListener('click', () => cambiarGrano(b.dataset.grano)));
  document.querySelectorAll('.acercar button').forEach(b => b.addEventListener('click', () => {
    marcarRegion(b);
    region = b.dataset.region === 'mundo' ? 'global' : b.dataset.region;
    Mapa.enfocar(b.dataset.region);
    if (Estado.modo === 'seguir') {
      Estado.ambito = region;                            // el top 5 pasa a la región
      Panel.mostrar();
    } else {
      territorio = null;
      volverAlResumen();
    }
  }));
  $('seguir-cerrar').addEventListener('click', dejarDeSeguir);

  document.addEventListener('keydown', e => {
    if (e.target.closest('input')) return;
    if (e.key === 'Escape') {
      if (Estado.modo === 'seguir') dejarDeSeguir();
      else if (Estado.vistaPais) volverAlResumen();
      return;
    }
    if (e.target.closest('button, select, textarea, [tabindex]')) return;
    const n = window.PERIODOS[Estado.grano].n;
    if (e.code === 'Space') { e.preventDefault(); Estado.reproduciendo ? pausar() : reproducir(); }
    if (e.code === 'ArrowLeft') irAPeriodo(Math.max(0, Estado.periodo - 1));
    if (e.code === 'ArrowRight') irAPeriodo(Math.min(n - 1, Estado.periodo + 1));
  });

  Mapa.on({ alPasar: pasarPorPais, alPasarSinChart: pasarSinChart, alSalir: salir,
            alElegir: cc => { const r = numero1(cc); if (r) seguir(r.idx, { origen: cc }); } });
  $('mapa').addEventListener('mousemove', moverGlobo);
  Panel.iniciar({
    alElegirCancion: idx => seguir(idx, { origen: null }),
    alVolverAlResumen: () => (Estado.modo === 'seguir' ? dejarDeSeguir() : volverAlResumen()),
  });
  Buscador.iniciar({ alElegirCancion: idx => seguir(idx, { saltar: true }) });

  slider.max = window.PERIODOS[Estado.grano].n - 1;
  $('fecha-fin').textContent = textoPeriodoCorto('dia', window.PERIODOS.dia.n - 1);   // fin de los datos
  irAPeriodo(window.PERIODOS[Estado.grano].n - 1);                                    // parte en el día más reciente
  Mapa.iniciar();
  actualizarBotonSonido();
  Panel.audio(null);
  animarProgreso();
})();
