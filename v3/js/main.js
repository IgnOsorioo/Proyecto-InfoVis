/* Punto de entrada de la V3: conecta el mapa, el panel, el audio y la línea de tiempo.

   Interacción (mantra de Shneiderman: primero el panorama, luego acercar y filtrar, y el detalle a pedido):
   - Al entrar, el mapa muestra qué países escuchan el #1 global y el panel resume el mundo por continente.
     El sonido se activa con el primer click o tecla (lo exigen los navegadores), sin bloquear nada.
   - Pasar el cursor por un país (y detenerse un instante) muestra su #1 y lo hace sonar.
   - Click en un país lo fija: se queda escuchando ese país; al avanzar el tiempo, si cambia su #1, suena el
     nuevo. Se suelta con ✕, Esc o con otro click en el mismo país.
   - No se fija una canción: lo que suena es siempre el #1 de lo que muestra el panel (país fijado, país bajo
     el cursor o, en el resumen, el #1 global). */

(() => {
  const $ = id => document.getElementById(id);
  const slider = $('slider');
  const botonPlay = $('play');
  const ESPERA_AUDIO_MS = 120;        // al barrer el mapa o al reproducir rápido no se piden previews de cada cambio
  const ESPERA_INTENCION_MS = 140;    // hay que detenerse sobre un país para elegirlo
  const ESPERA_SALIDA_MS = 350;
  let raf = null, ultimoPaso = 0;
  let timerAudio = null, timerSalida = null, timerIntencion = null;
  let sonidoDecidido = false;         // el usuario ya hizo un gesto (o usó el botón de sonido)
  let region = 'global';              // región elegida con los botones ('global' o un continente)
  let territorio = null;              // territorio sin chart bajo el cursor (el panel muestra un mensaje)
  const PULSO_ARMONIA_MS = 2500;

  // ---------- Tiempo ----------

  function irAPeriodo(p) {
    Estado.periodo = p;
    slider.value = p;
    const n = window.PERIODOS[Estado.grano].n;
    slider.style.setProperty('--avance', `${(n > 1 ? p / (n - 1) : 1) * 100}%`);   // relleno de la línea
    $('fecha').textContent = textoPeriodoCorto(Estado.grano, p);
    actualizarSaltos();
    refrescar();
    actualizarArmonia();
    if (!Estado.reproduciendo && !recorrido) Armonia.pulso(PULSO_ARMONIA_MS);   // mover la fecha a mano: se escucha un momento
  }

  /** Voces de la armonía: qué fracción de cada continente escucha el #1 global en la fecha. */
  function actualizarArmonia() {
    Armonia.actualizar(Object.fromEntries(Object.keys(CONTINENTES).map(k => {
      const { n, total } = cuentaGlobal(k);
      return [k, total >= 2 ? n / total : null];
    })));
  }

  /** Vuelve a dibujar el panel, el mapa y lo que suena para la fecha actual. */
  function refrescar() {
    if (Estado.fijado) mostrarPais(Estado.fijado);
    else if (!territorio) {
      if (Estado.vistaPais) mostrarPais(Estado.vistaPais);
      else mostrarMundo();
    }
    actualizarFijado();
    Mapa.dibujar();
    Diversidad.actualizar(region);
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
    Armonia.continuo(true);
    ultimoPaso = performance.now();
    raf = requestAnimationFrame(paso);
  }

  function pausar() {
    Estado.reproduciendo = false;
    cancelAnimationFrame(raf);
    botonPlay.classList.remove('reproduciendo');
    botonPlay.setAttribute('aria-label', 'Reproducir el paso del tiempo');
    Armonia.continuo(false);
  }

  // ---------- Lo que muestra el panel (y suena) ----------

  function tocarConEspera(idx) {
    clearTimeout(timerAudio);
    timerAudio = setTimeout(() => Reproductor.tocar(cancion(idx)), ESPERA_AUDIO_MS);
  }

  function detenerAudio() {
    clearTimeout(timerAudio);
    Reproductor.detener();
    Panel.audio('pausa');
  }

  /** El panel muestra lo que se escucha en el país en la fecha, y suena su #1. Sin datos: un mensaje. */
  function mostrarPais(cc) {
    const r = numero1(cc);
    if (!r) {
      Estado.mensaje = true;
      const inicio = window.PAISES[cc]?.inicio;
      Panel.mensaje(nombrePais(cc), inicio && new Date(inicio + 'T00:00:00Z') > fechaDePeriodo(Estado.grano, Estado.periodo)
        ? `Sin datos en esta fecha: el primer chart disponible de este país es del ${textoFecha(new Date(inicio + 'T00:00:00Z'))}.`
        : 'Sin datos en esta fecha: ninguna de las fuentes tiene el chart de este país (por ejemplo, Spotify dejó Rusia en abril de 2022).');
      detenerAudio();
      return;
    }
    Estado.mensaje = false;
    Estado.origen = cc;
    Estado.cancion = r.idx;
    tocarConEspera(r.idx);
    Panel.mostrar();
  }

  /** Resumen del mundo (o de la región): suena el #1 global. */
  function mostrarMundo() {
    Estado.vistaPais = null;
    Estado.mensaje = false;
    Estado.origen = 'global';
    Estado.ambito = region;
    const g = numero1('global');
    Estado.cancion = g?.idx ?? null;
    if (g) tocarConEspera(g.idx);
    Panel.resumen();
  }

  function volverAlResumen() {
    Estado.vistaPais = null;
    territorio = null;
    refrescar();
  }

  // ---------- País fijado ----------

  function fijar(cc) {
    Estado.fijado = cc;
    Estado.vistaPais = cc;
    territorio = null;
    ocultarGlobo();
    refrescar();
  }

  function soltar() {
    if (!Estado.fijado) return;
    Estado.fijado = null;
    Estado.vistaPais = null;
    refrescar();
  }

  /** Indicador sobre el mapa: qué país está fijado y qué está sonando ahí. */
  function actualizarFijado() {
    const cc = Estado.fijado;
    $('fijado').hidden = !cc;
    if (!cc) return;
    const r = numero1(cc);
    const c = r ? cancion(r.idx) : null;
    $('fijado-pais').textContent = nombrePais(cc);
    $('fijado-cancion').textContent = c ? `${c.titulo} — ${c.artistas}` : 'Sin datos en esta fecha';
    $('fijado-fuente').textContent = r ? `#1 según ${FUENTES[r.fuente]}${sigueAlGlobal(cc) ? ' · igual que el #1 global' : ''}` : '';
    $('fijado-portada').src = c?.portada ?? '';
    $('fijado-portada').hidden = !c;
  }

  // ---------- Cursor sobre el mapa ----------

  function pasarPorPais(cc, raton) {
    clearTimeout(timerSalida);
    clearTimeout(timerIntencion);
    if (Estado.fijado && cc !== Estado.fijado) mostrarGlobo(cc, raton);
    timerIntencion = setTimeout(() => {
      Estado.paisActivo = cc;
      territorio = null;
      Mapa.marcar(cc);
      if (!Estado.fijado) {
        Estado.vistaPais = cc;
        mostrarPais(cc);
      }
      Mapa.dibujar();
    }, ESPERA_INTENCION_MS);
  }

  const NOTAS_SIN_CHART = {
    CHN: 'Spotify, YouTube y Deezer no están disponibles en China; Apple Music no publica su chart.',
  };

  /** País o territorio que ninguna fuente cubre: {iso3, nombre, nota?} (la nota viene de datos/mundo.js). */
  function pasarSinChart(t, raton) {
    clearTimeout(timerSalida);
    clearTimeout(timerIntencion);
    if (Estado.fijado) mostrarGloboTexto(t.nombre, 'sin datos', raton);
    timerIntencion = setTimeout(() => {
      Estado.paisActivo = null;
      Mapa.marcar(null);
      if (!Estado.fijado) {
        territorio = t;
        Panel.mensaje(t.nombre, t.nota ?? NOTAS_SIN_CHART[t.iso3] ?? 'Sin datos: ninguna de las fuentes (Spotify, YouTube Music, Apple Music) publica un chart de este país.');
        detenerAudio();
      }
      Mapa.dibujar();
    }, ESPERA_INTENCION_MS);
  }

  /** Al salir del mapa: se quita el contorno; el panel se queda con lo último que mostraba. */
  function salir() {
    clearTimeout(timerIntencion);
    ocultarGlobo();
    clearTimeout(timerSalida);
    timerSalida = setTimeout(() => {
      Estado.paisActivo = null;
      Mapa.marcar(null);
      if (territorio) {                                  // vuelve a lo que mostraba antes del territorio sin datos
        territorio = null;
        refrescar();
      }
      Mapa.dibujar();
    }, ESPERA_SALIDA_MS);
  }

  /** Click en un país: lo fija (o lo suelta si ya estaba fijado). */
  function clickEnPais(cc) {
    clearTimeout(timerIntencion);
    if (Estado.fijado === cc) soltar();
    else fijar(cc);
  }

  // ---------- Globo (con un país fijado, el cursor sobre otros países solo informa) ----------

  function mostrarGlobo(cc, raton) {
    const r = numero1(cc);
    mostrarGloboTexto(nombrePais(cc), r ? `#1: ${cancion(r.idx).titulo}${sigueAlGlobal(cc) ? ' · el #1 global' : ''}` : 'sin datos en esta fecha', raton);
  }

  function mostrarGloboTexto(titulo, texto, raton) {
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

  // ---------- Región ----------

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
    Armonia.iniciar();
    actualizarArmonia();
    if (Estado.cancion !== null && !Estado.mensaje) Reproductor.tocar(cancion(Estado.cancion));
  }

  /** El primer click o tecla en cualquier parte activa el sonido (los navegadores no permiten audio antes). */
  function primerGesto(e) {
    if (sonidoDecidido || e.key === 'Escape' || e.target.closest?.('#sonido')) return;
    sonidoDecidido = true;
    encenderSonido();
    actualizarBotonSonido();
  }

  // ---------- Recorrido guiado (1 min) ----------
  // De octubre de 2013 a hoy, mes a mes, mientras suena el #1 global: ¿siguen todos los continentes la misma
  // tendencia? Esc o "Saltar" lo terminan.

  let recorrido = null;
  const MS_POR_MES = 170;

  function relato(texto, paso, total) {
    $('relato-texto').textContent = texto;
    $('relato-paso').textContent = `${paso} / ${total}`;
    $('relato').hidden = false;
  }

  function porContinente() {
    return Object.entries(CONTINENTES).map(([k, nombre]) => {
      const { n, total } = cuentaGlobal(k);
      return total ? `${nombre.split(' ')[0]} ${Math.round(100 * n / total)} %` : null;
    }).filter(Boolean).join(' · ');
  }

  async function verRecorrido() {
    if (recorrido) return;
    const r = recorrido = { activo: true, cortar: null };
    const esperar = ms => new Promise((ok, no) => {
      const t = setTimeout(ok, ms);
      r.cortar = () => { clearTimeout(t); no(new Error('recorrido terminado')); };
    });
    document.body.classList.add('en-recorrido');
    try {
      if (Estado.reproduciendo) pausar();
      Estado.fijado = null;
      Estado.vistaPais = null;
      territorio = null;
      marcarRegion(document.querySelector('.acercar button[data-region="mundo"]'));
      region = 'global';
      Mapa.enfocar('mundo');
      cambiarGrano('mes');
      irAPeriodo(0);
      const TOTAL = 4;
      const { n, total } = cuentaGlobal('global');
      relato(`En ${textoPeriodo('mes', 0)}, ${n} de ${total} países tenían como #1 el mismo #1 global (coral): «${cancion(numero1('global').idx).titulo}». Escucha: suena el #1 global de cada mes.`, 1, TOTAL);
      await esperar(6500);

      relato('Mes a mes: ¿se mantiene el coral en todos los continentes? Escucha el tono grave: cada continente es una voz. Si suenan juntas, todos escuchan lo mismo; si se separan y raspan, cada uno escucha otra cosa.', 2, TOTAL);
      Armonia.continuo(true);
      for (let p = 1; p < window.PERIODOS.mes.n; p++) {
        irAPeriodo(p);
        await esperar(MS_POR_MES);
      }
      Armonia.continuo(false);

      const hoy = cuentaGlobal('global');
      relato(`En ${textoPeriodo('mes', Estado.periodo)}, ${hoy.n} de ${hoy.total} países escuchan el #1 global. Por continente: ${porContinente()}.`, 3, TOTAL);
      await esperar(7000);

      relato('Ahora tú: haz click en un país para quedarte escuchando lo que suena ahí mientras avanza el tiempo.', 4, TOTAL);
      await esperar(5000);
    } catch (e) {
      // Terminado con Esc o "Saltar": se vuelve al estado de inicio igual que al final.
    } finally {
      r.activo = false;
      recorrido = null;
      $('relato').hidden = true;
      document.body.classList.remove('en-recorrido');
      Armonia.continuo(false);
      cambiarGrano('dia');
      irAPeriodo(window.PERIODOS.dia.n - 1);
    }
  }

  function terminarRecorrido() {
    if (!recorrido) return;
    recorrido.activo = false;
    recorrido.cortar?.();
  }

  // ---------- Inicio ----------

  document.addEventListener('pointerdown', primerGesto, true);
  document.addEventListener('keydown', primerGesto, true);
  $('sonido').addEventListener('click', () => {
    sonidoDecidido = true;
    if (Reproductor.habilitado) {
      Reproductor.deshabilitar();
      Armonia.silenciar();
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
    if (!Estado.fijado) volverAlResumen();               // el resumen pasa a la región
    else Estado.ambito = region;
    Diversidad.actualizar(region);
  }));
  $('fijado-cerrar').addEventListener('click', soltar);
  $('ver-recorrido').addEventListener('click', verRecorrido);
  $('relato-saltar').addEventListener('click', terminarRecorrido);

  document.addEventListener('keydown', e => {
    if (e.target.closest('input')) return;
    if (e.key === 'Escape') {
      if (recorrido) terminarRecorrido();
      else if (Estado.fijado) soltar();
      else if (Estado.vistaPais) volverAlResumen();
      return;
    }
    if (e.target.closest('button, select, textarea, [tabindex]')) return;
    const n = window.PERIODOS[Estado.grano].n;
    if (e.code === 'Space') { e.preventDefault(); Estado.reproduciendo ? pausar() : reproducir(); }
    if (e.code === 'ArrowLeft') irAPeriodo(Math.max(0, Estado.periodo - 1));
    if (e.code === 'ArrowRight') irAPeriodo(Math.min(n - 1, Estado.periodo + 1));
  });

  Mapa.on({ alPasar: pasarPorPais, alPasarSinChart: pasarSinChart, alSalir: salir, alElegir: clickEnPais });
  $('mapa').addEventListener('mousemove', moverGlobo);
  Panel.iniciar({ alVolverAlResumen: () => (Estado.fijado ? soltar() : volverAlResumen()) });

  slider.max = window.PERIODOS[Estado.grano].n - 1;
  $('fecha-fin').textContent = textoPeriodoCorto('dia', window.PERIODOS.dia.n - 1);   // fin de los datos
  irAPeriodo(window.PERIODOS[Estado.grano].n - 1);                                    // parte en el día más reciente
  Mapa.iniciar();
  actualizarBotonSonido();
  Panel.audio(null);
  animarProgreso();
})();
