/* Punto de entrada: conecta el mapa, la tarjeta del país, el reproductor y la línea de tiempo. */

(() => {
  const $ = id => document.getElementById(id);
  const slider = $('slider');
  const botonPlay = $('play');
  const tarjeta = $('tarjeta');
  const ESPERA_AUDIO_MS = 120;   // al barrer el mapa con el cursor no se piden previews de cada país que se cruza
  const ESPERA_SALIDA_MS = 350;
  let raf = null, ultimoPaso = 0;
  let timerAudio = null, timerSalida = null;
  let enTarjeta = null;          // idx de la canción que muestra la tarjeta

  // ---------- Tiempo ----------

  function irAPeriodo(p) {
    Estado.periodo = p;
    slider.value = p;
    $('fecha').textContent = textoPeriodo(Estado.grano, p);
    Mapa.dibujar();
    dibujarGlobal();
    if (Estado.paisActivo) mostrarPais(Estado.paisActivo);   // si cambió su #1, cambia la canción
  }

  function cambiarGrano(grano) {
    const fecha = fechaDePeriodo(Estado.grano, Estado.periodo);
    Estado.grano = grano;
    slider.max = window.PERIODOS[grano].n - 1;
    document.querySelectorAll('.granos button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.grano === grano)));
    irAPeriodo(periodoDeFecha(grano, fecha));
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
    botonPlay.textContent = '❚❚';
    botonPlay.setAttribute('aria-label', 'Pausar');
    ultimoPaso = performance.now();
    raf = requestAnimationFrame(paso);
  }

  function pausar() {
    Estado.reproduciendo = false;
    cancelAnimationFrame(raf);
    botonPlay.textContent = '▶';
    botonPlay.setAttribute('aria-label', 'Reproducir el paso del tiempo');
  }

  // ---------- #1 global (barra superior) ----------

  function dibujarGlobal() {
    const r = numero1('global');
    if (!r) { $('global').replaceChildren(); return; }
    const c = cancion(r.idx);
    const img = Object.assign(document.createElement('img'), { src: c.portada, alt: '' });
    const texto = document.createElement('div');
    const titulo = Object.assign(document.createElement('strong'), { textContent: c.titulo });
    texto.append('#1 global', titulo, c.artistas);
    $('global').replaceChildren(img, texto);
  }

  // ---------- Tarjeta y audio ----------

  function llenarTarjeta({ encabezado, c, racha }) {
    tarjeta.hidden = false;
    tarjeta.classList.toggle('sin-datos', !c);
    $('tarjeta-pais').textContent = encabezado;
    if (!c) return;
    if (enTarjeta !== c.idx) {
      $('tarjeta-portada').src = c.portada;
      $('tarjeta-portada').alt = `Portada de ${c.titulo}`;
      $('tarjeta-titulo').textContent = c.titulo;
      $('tarjeta-artistas').textContent = c.artistas;
      $('tarjeta-spotify').href = `https://open.spotify.com/track/${c.id}`;
      enTarjeta = c.idx;
    }
    $('tarjeta-racha').textContent = racha;
  }

  function tocarConEspera(c) {
    clearTimeout(timerAudio);
    timerAudio = setTimeout(() => Reproductor.tocar(c), ESPERA_AUDIO_MS);
  }

  function cuantosComparten(idx) {
    return paisesConDatos().filter(cc => numero1(cc).idx === idx).length;
  }

  function mostrarPais(cc, evento) {
    clearTimeout(timerSalida);
    Estado.paisActivo = cc;
    if (evento?.clientX !== undefined) {
      // La tarjeta va al lado contrario del cursor para no tapar el país.
      tarjeta.classList.toggle('izquierda', evento.clientX > window.innerWidth / 2);
    }
    const encabezado = `${nombrePais(cc)} · ${textoPeriodo(Estado.grano, Estado.periodo)}`;
    const r = numero1(cc);
    if (!r) {
      enTarjeta = null;
      llenarTarjeta({ encabezado });
      $('tarjeta-titulo').textContent = 'Sin datos';
      $('tarjeta-artistas').textContent = `Spotify publica el chart de ${nombrePais(cc)} desde el ${window.PAISES[cc].inicio}.`;
      $('tarjeta-racha').textContent = '';
      clearTimeout(timerAudio);
      Reproductor.detener();
      Mapa.resaltar(null);
      return;
    }
    const c = cancion(r.idx);
    const otros = cuantosComparten(r.idx) - 1;
    const compartida = otros > 0 ? ` También es #1 en ${otros} ${otros === 1 ? 'país' : 'países'} más.` : ' Solo es #1 aquí.';
    llenarTarjeta({ encabezado, c, racha: textoRacha(r) + '.' + compartida });
    Mapa.resaltar(r.idx);
    tocarConEspera(c);
  }

  const NOTAS_SIN_CHART = {
    RUS: 'Spotify operó en Rusia solo entre 2020 y 2022, y este dataset no incluye su chart.',
    CHN: 'Spotify no está disponible en China.',
  };

  function mostrarSinChart(iso3, evento) {
    clearTimeout(timerSalida);
    Estado.paisActivo = null;
    enTarjeta = null;
    if (evento?.clientX !== undefined) tarjeta.classList.toggle('izquierda', evento.clientX > window.innerWidth / 2);
    llenarTarjeta({ encabezado: window.SIN_CHART[iso3] });
    $('tarjeta-titulo').textContent = 'Sin datos';
    $('tarjeta-artistas').textContent = NOTAS_SIN_CHART[iso3] ??
      'Spotify no publica un chart de canciones para este país (en África, solo para Sudáfrica, Nigeria, Egipto y Marruecos).';
    $('tarjeta-racha').textContent = '';
    clearTimeout(timerAudio);
    Reproductor.detener();
    Mapa.resaltar(null);
  }

  function mostrarCancion(idx) {
    clearTimeout(timerSalida);
    Estado.paisActivo = null;
    tarjeta.classList.remove('izquierda');
    const c = cancion(idx);
    const n = cuantosComparten(idx);
    llenarTarjeta({ encabezado: textoPeriodo(Estado.grano, Estado.periodo), c, racha: `#1 en ${n} países.` });
    Mapa.resaltar(idx);
    tocarConEspera(c);
  }

  function salir() {
    clearTimeout(timerSalida);
    timerSalida = setTimeout(() => {
      Estado.paisActivo = null;
      enTarjeta = null;
      tarjeta.hidden = true;
      clearTimeout(timerAudio);
      Reproductor.detener();
      Mapa.resaltar(null);
    }, ESPERA_SALIDA_MS);
  }

  const TEXTO_AUDIO = {
    cargando: 'Cargando preview…',
    sonando: 'Sonando · preview de 30 s (Deezer)',
    'sin-preview': 'Sin preview disponible para esta canción',
    silencio: 'Activa el sonido 🔇 para escuchar',
  };
  Reproductor.alCambiar((estado, c) => {
    if (c.idx !== enTarjeta) return;
    $('estado-audio').classList.toggle('sonando', estado === 'sonando');
    $('estado-audio-texto').textContent = TEXTO_AUDIO[estado];
  });

  function animarProgreso() {
    $('progreso').style.width = `${Reproductor.progreso() * 100}%`;
    requestAnimationFrame(animarProgreso);
  }

  // ---------- Sonido ----------

  function actualizarBotonSonido() {
    const on = Reproductor.habilitado;
    $('sonido').textContent = on ? '🔊' : '🔇';
    $('sonido').setAttribute('aria-pressed', String(on));
    $('sonido').setAttribute('aria-label', on ? 'Silenciar' : 'Activar sonido');
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
  document.querySelectorAll('.granos button').forEach(b => b.addEventListener('click', () => cambiarGrano(b.dataset.grano)));

  document.addEventListener('keydown', e => {
    if (e.target.closest('input, button, select, textarea, [tabindex]')) return;
    const n = window.PERIODOS[Estado.grano].n;
    if (e.code === 'Space') { e.preventDefault(); Estado.reproduciendo ? pausar() : reproducir(); }
    if (e.code === 'ArrowLeft') irAPeriodo(Math.max(0, Estado.periodo - 1));
    if (e.code === 'ArrowRight') irAPeriodo(Math.min(n - 1, Estado.periodo + 1));
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => Mapa.dibujar());

  Mapa.on({ alPasar: mostrarPais, alPasarSinChart: mostrarSinChart, alSalir: salir, alPasarCancion: mostrarCancion });

  slider.max = window.PERIODOS[Estado.grano].n - 1;
  irAPeriodo(window.PERIODOS[Estado.grano].n - 1);   // parte en el día más reciente
  actualizarBotonSonido();
  animarProgreso();
})();
