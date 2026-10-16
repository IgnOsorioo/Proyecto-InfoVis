/* Punto de entrada de la V3: conecta el mapa, el panel, el audio y la línea de tiempo.

   Interacción (mantra de Shneiderman: primero el panorama, luego acercar y filtrar, y el detalle a pedido):
   - Al entrar, el mapa muestra qué países escuchan el #1 global y el panel, cuántos lo escuchan por continente.
     El sonido se activa con el primer click o tecla (lo exigen los navegadores), sin bloquear nada.
   - Pasar el cursor por un país muestra al tiro un recuadro con su top 3 y, si se detiene un instante, el
     panel pasa a ese país y suena su #1.
   - Click en un país lo fija: se queda escuchando ese país; al avanzar el tiempo, si cambia su #1, suena el
     nuevo. Se suelta con ✕, Esc o con otro click en el mismo país.
   - Lo que suena es siempre el #1 de lo que muestra el panel (país fijado, país bajo el cursor o el mundo). */

(() => {
  const $ = id => document.getElementById(id);
  const slider = $('slider');
  const botonPlay = $('play');
  const ESPERA_AUDIO_MS = 120;        // al barrer el mapa o al reproducir rápido no se piden previews de cada cambio
  const ESPERA_INTENCION_MS = 140;    // hay que detenerse sobre un país para elegirlo
  const ESPERA_SALIDA_MS = 350;
  const PULSO_ARMONIA_MS = 2500;
  let raf = null, ultimoPaso = 0;
  let timerAudio = null, timerSalida = null, timerIntencion = null;
  let sonidoDecidido = false;         // el usuario ya hizo un gesto (o usó el botón de sonido)
  let region = 'global';              // región elegida con los botones ('global' o un continente)
  let territorio = null;              // territorio sin chart bajo el cursor (el panel muestra un mensaje)
  let globo = null;                   // {cc | territorio, raton}: lo que muestra el recuadro junto al cursor
  let recorrido = null;

  // ---------- Tiempo ----------

  function irAPeriodo(p) {
    Estado.periodo = p;
    slider.value = p;
    Linea.mover(p);
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

  /** Vuelve a dibujar el panel, el mapa, el recuadro y lo que suena para la fecha actual. */
  function refrescar() {
    if (Estado.fijado) mostrarPais(Estado.fijado);
    else if (!territorio) {
      if (Estado.vistaPais) mostrarPais(Estado.vistaPais);
      else mostrarMundo();
    }
    actualizarFijado();
    if (globo?.cc) llenarGlobo(globo.cc);
    Mapa.dibujar();
    Diversidad.actualizar(region);
  }

  function cambiarGrano(grano) {
    const fecha = fechaDePeriodo(Estado.grano, Estado.periodo);
    Estado.grano = grano;
    slider.max = window.PERIODOS[grano].n - 1;
    Linea.dibujar();
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
    botonPlay.setAttribute('aria-label', 'Avanzar en el tiempo');
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

  /** "Desde 2019" si el chart del país empieza después de la fecha; si no, nada. */
  function desde(cc) {
    const inicio = window.PAISES[cc]?.inicio;
    return inicio && new Date(inicio + 'T00:00:00Z') > fechaDePeriodo(Estado.grano, Estado.periodo) ? `Datos desde ${inicio.slice(0, 4)}` : '';
  }

  /** El panel muestra lo que se escucha en el país en la fecha, y suena su #1. Sin datos: un mensaje. */
  function mostrarPais(cc) {
    const r = numero1(cc);
    if (!r) {
      Estado.mensaje = true;
      Panel.mensaje(nombrePais(cc), desde(cc) || 'Sin datos');
      detenerAudio();
      return;
    }
    Estado.mensaje = false;
    Estado.origen = cc;
    Estado.cancion = r.idx;
    tocarConEspera(r.idx);
    Panel.mostrar();
  }

  /** El mundo (o la región): suena el #1 global. */
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
    refrescar();
  }

  function soltar() {
    if (!Estado.fijado) return;
    Estado.fijado = null;
    Estado.vistaPais = null;
    refrescar();
  }

  function actualizarFijado() {
    $('fijado').hidden = !Estado.fijado;
    if (Estado.fijado) $('fijado-pais').textContent = nombrePais(Estado.fijado);
  }

  // ---------- Recuadro junto al cursor: país y top 3 ----------

  function llenarGlobo(cc) {
    const g = $('globo');
    const titulo = Object.assign(document.createElement('strong'), { textContent: nombrePais(cc) });
    const lista = top3(cc);
    if (lista === undefined) {                           // aún no se carga: se muestra el nombre y se completa al llegar
      g.replaceChildren(titulo);
      pedirTop3(cc).then(() => { if (globo?.cc === cc) llenarGlobo(cc); }).catch(() => {});
      return;
    }
    if (!lista) {
      g.replaceChildren(titulo, Object.assign(document.createElement('span'), { className: 'globo-vacio', textContent: desde(cc) || 'Sin datos' }));
      return;
    }
    const global = numero1('global')?.idx;
    const primeroEsGlobal = numero1(cc)?.idx === global;
    const ol = document.createElement('ol');
    lista.forEach(([t, a], i) => {
      const li = document.createElement('li');
      if (i === 0 && primeroEsGlobal) li.className = 'global';
      const texto = document.createElement('span');
      texto.append(Object.assign(document.createElement('b'), { textContent: t }), ` · ${a}`);
      li.append(texto);
      ol.append(li);
    });
    g.replaceChildren(titulo, ol);
  }

  function mostrarGlobo(cc, raton) {
    globo = { cc, raton };
    llenarGlobo(cc);
    $('globo').hidden = false;
    moverGlobo(raton);
  }

  function mostrarGloboTerritorio(nombre, raton) {
    globo = { territorio: nombre, raton };
    const g = $('globo');
    g.replaceChildren(Object.assign(document.createElement('strong'), { textContent: nombre }),
                      Object.assign(document.createElement('span'), { className: 'globo-vacio', textContent: 'Sin datos' }));
    g.hidden = false;
    moverGlobo(raton);
  }

  function moverGlobo(raton) {
    const g = $('globo');
    if (g.hidden || !raton) return;
    const caja = g.parentElement.getBoundingClientRect();
    const x = raton.clientX - caja.left, y = raton.clientY - caja.top;
    const izquierda = x + 16 + g.offsetWidth > caja.width;      // cerca del borde derecho, va a la izquierda del cursor
    const arriba = y + 16 + g.offsetHeight > caja.height;       // cerca del borde inferior, va arriba
    g.style.transform = `translate(${izquierda ? x - 16 - g.offsetWidth : x + 16}px, ${arriba ? y - 12 - g.offsetHeight : y + 16}px)`;
  }

  function ocultarGlobo() {
    globo = null;
    $('globo').hidden = true;
  }

  // ---------- Cursor sobre el mapa ----------

  function pasarPorPais(cc, raton) {
    clearTimeout(timerSalida);
    clearTimeout(timerIntencion);
    mostrarGlobo(cc, raton);
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

  /** País o territorio que ninguna fuente cubre: {iso3, nombre, nota?} (de datos/mundo.js). */
  function pasarSinChart(t, raton) {
    clearTimeout(timerSalida);
    clearTimeout(timerIntencion);
    mostrarGloboTerritorio(t.nombre, raton);
    timerIntencion = setTimeout(() => {
      Estado.paisActivo = null;
      Mapa.marcar(null);
      if (!Estado.fijado) {
        territorio = t;
        Panel.mensaje(t.nombre, 'Sin datos');
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

  // ---------- Región ----------

  function marcarRegion(boton) {
    document.querySelectorAll('.acercar button').forEach(x => x.classList.toggle('activo', x === boton));
  }

  Reproductor.alCambiar((estado, c) => {
    if (c.idx === Estado.cancion) Panel.audio(estado);
  });

  // ---------- Sonido ----------

  function actualizarBotonSonido() {
    const on = Reproductor.habilitado;
    $('sonido').setAttribute('aria-pressed', String(on));
    $('sonido').setAttribute('aria-label', on ? 'Silenciar' : 'Activar sonido');
    $('sonido').title = on ? 'Silenciar' : 'Activar sonido';
    $('sonido').classList.toggle('por-activar', !sonidoDecidido);
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
  // De octubre de 2013 a hoy, mes a mes, mientras suena el #1 global. Esc o "Saltar" lo terminan.

  const MS_POR_MES = 170;

  function relato(texto, paso, total) {
    $('relato-texto').textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
    $('relato-paso').textContent = `${paso} / ${total}`;
    $('relato').hidden = false;
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
      ocultarGlobo();
      marcarRegion(document.querySelector('.acercar button[data-region="mundo"]'));
      region = 'global';
      Mapa.enfocar('mundo');
      cambiarGrano('mes');
      irAPeriodo(0);
      const TOTAL = 3;
      const inicio = cuentaGlobal('global');
      relato(`${textoPeriodo('mes', 0)}: ${inicio.n} de ${inicio.total} países escuchan el #1 global, «${cancion(numero1('global').idx).titulo}».`, 1, TOTAL);
      await esperar(5000);

      relato('Mes a mes. Escucha el tono grave: juntos, el mundo escucha lo mismo; separados, cada uno lo suyo.', 2, TOTAL);
      Armonia.continuo(true);
      for (let p = 1; p < window.PERIODOS.mes.n; p++) {
        irAPeriodo(p);
        await esperar(MS_POR_MES);
      }
      Armonia.continuo(false);

      const hoy = cuentaGlobal('global');
      relato(`${textoPeriodo('mes', Estado.periodo)}: ${hoy.n} de ${hoy.total}.`, 3, TOTAL);
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
  document.querySelectorAll('.granos button').forEach(b => b.addEventListener('click', () => cambiarGrano(b.dataset.grano)));
  document.querySelectorAll('.acercar button').forEach(b => b.addEventListener('click', () => {
    marcarRegion(b);
    region = b.dataset.region === 'mundo' ? 'global' : b.dataset.region;
    Mapa.enfocar(b.dataset.region);
    if (!Estado.fijado) volverAlResumen();               // el panel pasa a la región
    else Estado.ambito = region;
    Diversidad.actualizar(region);
  }));
  $('fijado-cerrar').addEventListener('click', soltar);
  $('ver-recorrido').addEventListener('click', verRecorrido);
  $('relato-saltar').addEventListener('click', terminarRecorrido);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (recorrido) terminarRecorrido();
      else if (Estado.fijado) soltar();
      else if (Estado.vistaPais) volverAlResumen();
      return;
    }
    if (e.target.closest('button, select, textarea, [tabindex], input')) return;
    const n = window.PERIODOS[Estado.grano].n;
    if (e.code === 'Space') { e.preventDefault(); Estado.reproduciendo ? pausar() : reproducir(); }
    if (e.code === 'ArrowLeft') irAPeriodo(Math.max(0, Estado.periodo - 1));
    if (e.code === 'ArrowRight') irAPeriodo(Math.min(n - 1, Estado.periodo + 1));
  });

  Mapa.on({ alPasar: pasarPorPais, alPasarSinChart: pasarSinChart, alSalir: salir, alElegir: clickEnPais });
  $('mapa').addEventListener('mousemove', e => { if (globo) { globo.raton = e; moverGlobo(e); } });
  $('mapa').addEventListener('mouseleave', ocultarGlobo);
  Panel.iniciar({ alVolverAlResumen: () => (Estado.fijado ? soltar() : volverAlResumen()) });

  slider.max = window.PERIODOS[Estado.grano].n - 1;
  slider.title = `${textoPeriodoCorto('dia', 0)} – ${textoPeriodoCorto('dia', window.PERIODOS.dia.n - 1)}`;
  Linea.dibujar();
  irAPeriodo(window.PERIODOS[Estado.grano].n - 1);                                    // parte en el día más reciente
  Mapa.iniciar();
  actualizarBotonSonido();
  Panel.audio(null);
})();
