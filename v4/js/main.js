/* Punto de entrada de la V4: conecta el mapa, el panel, el audio y la línea de tiempo.

   Interacción (mantra de Shneiderman: primero el panorama, luego acercar y filtrar, y el detalle a pedido):
   - Al entrar, el mapa muestra qué países escuchan el #1 global y el panel, cuántos lo escuchan por continente.
     El sonido se activa con el primer click o tecla (lo exigen los navegadores), sin bloquear nada.
   - Pasar el cursor por un país muestra al tiro un recuadro con su top 3 y, si se detiene un instante, el
     panel pasa a ese país y suena su #1. Al sacar el cursor, el panel vuelve al mundo (o a la pestaña elegida).
   - Click en un país lo fija: se queda escuchando ese país; al avanzar el tiempo, si cambia su #1, suena el
     nuevo. Se suelta con ✕, Esc o con otro click en el mismo país.
   - Lo que suena es siempre el #1 de lo que muestra el panel (país fijado, país bajo el cursor o el mundo).
   - Encima, los aplausos: en cuántos países de la muestra es #1 esa canción.
   - Donde no sabemos qué se escucha, estática de radio; las marcas del eje y el recorrido cuentan por qué. */

(() => {
  const $ = id => document.getElementById(id);
  const slider = $('slider');
  const botonPlay = $('play');
  const ESPERA_AUDIO_MS = 120;        // al barrer el mapa o al reproducir rápido no se piden previews de cada cambio
  const ESPERA_INTENCION_MS = 140;    // hay que detenerse sobre un país para elegirlo
  const ESPERA_SALIDA_MS = 350;
  const PULSO_APLAUSOS_MS = 2500;
  let raf = null, ultimoPaso = 0;
  let timerAudio = null, timerSalida = null, timerIntencion = null;
  let sonidoDecidido = false;         // el usuario ya hizo un gesto (o usó el botón de sonido)
  let territorio = null;              // territorio sin chart bajo el cursor (el panel muestra un mensaje)
  let globo = null;                   // {cc | territorio, raton}: lo que muestra el recuadro junto al cursor
  let entrada = null;                 // dónde estaba el cursor al entrar al país (para reconocer salidas falsas)
  let recorrido = null;

  // ---------- Tiempo ----------

  // Fecha elegida, independiente de la escala: al pasar de Mes a Año y volver, se vuelve al mismo mes (el período
  // "2015" empieza en enero, pero la fecha elegida sigue siendo septiembre).
  let fechaElegida = null;

  function irAPeriodo(p, { conservarFecha = false } = {}) {
    Estado.periodo = p;
    if (!conservarFecha) fechaElegida = fechaDePeriodo(Estado.grano, p);
    slider.value = p;
    Linea.mover(p);
    refrescar();
  }

  /** Aplausos: en cuántos países de la muestra es #1 la canción que suena, en la fecha (una persona por país; si
      el país que se mira no está en la muestra, también cuenta). Sin canción (país sin datos), silencio. */
  function actualizarAplausos() {
    const muestra = muestraDe('global');
    const idx = Estado.mensaje ? null : Estado.cancion;
    if (idx === null) { Aplausos.actualizar(0, muestra.length); return; }
    const origen = Estado.origen;
    const fuera = origen && origen !== 'global' && !muestra.includes(origen) ? 1 : 0;
    Aplausos.actualizar(muestra.filter(cc => numero1(cc)?.idx === idx).length + fuera, muestra.length);
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
    Diversidad.actualizar('global');
    Contexto.actualizar();
  }

  function cambiarGrano(grano) {
    // La fecha elegida, si cae dentro del período actual; si no (se movió el tiempo), el inicio del período.
    const inicio = fechaDePeriodo(Estado.grano, Estado.periodo);
    const dentro = fechaElegida && fechaElegida >= inicio && fechaElegida <= finDelPeriodo();
    const fecha = dentro ? fechaElegida : inicio;
    Estado.grano = grano;
    slider.max = window.PERIODOS[grano].n - 1;
    Linea.dibujar();
    document.querySelectorAll('.granos button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.grano === grano)));
    irAPeriodo(periodoDeFecha(grano, fecha), { conservarFecha: true });
    if (!dentro) fechaElegida = fecha;
  }

  /** Avanza un período cada MS_POR_PASO; si con el paso cambió la canción que suena, ese paso dura al menos
      MS_MINIMO_CANCION, para alcanzar a escucharla. */
  let esperaPaso = 0;
  function paso(ts) {
    if (!Estado.reproduciendo) return;
    if (ts - ultimoPaso >= esperaPaso) {
      ultimoPaso = ts;
      if (Estado.periodo >= window.PERIODOS[Estado.grano].n - 1) { pausar(); return; }
      const antes = Estado.cancion;
      irAPeriodo(Estado.periodo + 1);
      esperaPaso = Estado.cancion !== antes
        ? Math.max(MS_POR_PASO[Estado.grano], MS_MINIMO_CANCION[Estado.grano])
        : MS_POR_PASO[Estado.grano];
    }
    raf = requestAnimationFrame(paso);
  }

  function reproducir() {
    if (Estado.periodo >= window.PERIODOS[Estado.grano].n - 1) irAPeriodo(0);
    Estado.reproduciendo = true;
    botonPlay.classList.add('reproduciendo');
    botonPlay.setAttribute('aria-label', 'Pausar');
    Aplausos.continuo(true);
    ultimoPaso = performance.now();
    esperaPaso = MS_MINIMO_CANCION[Estado.grano] || MS_POR_PASO[Estado.grano];   // la primera canción también se escucha
    raf = requestAnimationFrame(paso);
  }

  function pausar() {
    Estado.reproduciendo = false;
    cancelAnimationFrame(raf);
    botonPlay.classList.remove('reproduciendo');
    botonPlay.setAttribute('aria-label', 'Avanzar en el tiempo');
    Aplausos.continuo(false);
  }

  // ---------- Lo que muestra el panel (y suena) ----------

  /** Suena la canción idx y, encima, su alcance en aplausos (unos segundos si el tiempo no corre). */
  function tocarConEspera(idx) {
    clearTimeout(timerAudio);
    timerAudio = setTimeout(() => Reproductor.tocar(cancion(idx)), ESPERA_AUDIO_MS);
    actualizarAplausos();
    if (!Estado.reproduciendo && !recorrido) Aplausos.pulso(PULSO_APLAUSOS_MS);
  }

  function detenerAudio() {
    clearTimeout(timerAudio);
    Reproductor.detener();
    Panel.audio('pausa');
    actualizarAplausos();
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
    Estado.ambito = 'global';            // R3: los botones de región solo acercan; el panel cuenta siempre el mundo
    const g = numero1('global');
    Estado.cancion = g?.idx ?? null;
    if (g) tocarConEspera(g.idx);
    Panel.mostrar();
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
    Estado.vistaPais = Estado.paisActivo;               // si el cursor está sobre un país, el panel pasa a ese país
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
    if (recorrido) return;                               // el recorrido no se altera (ni con eventos atrasados del mapa)
    entrada = raton && { x: raton.clientX, y: raton.clientY };
    clearTimeout(timerSalida);
    clearTimeout(timerIntencion);
    mostrarGlobo(cc, raton);
    Estatica.sonar(!numero1(cc));                        // sin datos en esta fecha: no hay señal (siempre)
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
    if (recorrido) return;
    entrada = raton && { x: raton.clientX, y: raton.clientY };
    clearTimeout(timerSalida);
    clearTimeout(timerIntencion);
    mostrarGloboTerritorio(t.nombre, raton);
    Estatica.sonar(true);
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

  /** Al salir de un país (al mar o fuera del mapa): un instante después (por si entra a otro país) se quita el
      contorno, se apaga la estática y el panel vuelve al mundo o a la pestaña elegida (si no hay un país fijado). */
  function salir(ev) {
    // Al redibujar el mapa (por ejemplo, para marcar el contorno), Plotly puede avisar que el cursor salió aunque no
    // se haya movido: esa salida no cuenta (si contara, la estática se cortaría con el cursor quieto sobre el país).
    // Una salida real trae el movimiento del mouse que la causó, o es el cursor dejando el mapa.
    if (ev !== 'fuera') {
      if (ev?.clientX === undefined) return;
      if (entrada && Math.hypot(ev.clientX - entrada.x, ev.clientY - entrada.y) < 2) return;
    }
    clearTimeout(timerIntencion);
    ocultarGlobo();
    clearTimeout(timerSalida);
    timerSalida = setTimeout(() => {
      Estatica.sonar(false);
      Estado.paisActivo = null;
      Mapa.marcar(null);
      territorio = null;
      if (!Estado.fijado) Estado.vistaPais = null;
      refrescar();
    }, ESPERA_SALIDA_MS);
  }

  /** Click en un país: lo fija (o lo suelta si ya estaba fijado). */
  function clickEnPais(cc) {
    if (recorrido) return;
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
    Aplausos.iniciar();
    Estatica.iniciar();
    actualizarAplausos();
    if (Estado.cancion !== null && !Estado.mensaje) Reproductor.tocar(cancion(Estado.cancion));
  }

  /** El primer click o tecla en cualquier parte activa el sonido (los navegadores no permiten audio antes). */
  function primerGesto(e) {
    if (sonidoDecidido || e.key === 'Escape' || e.target.closest?.('#sonido')) return;
    sonidoDecidido = true;
    encenderSonido();
    actualizarBotonSonido();
  }

  // ---------- Recorrido guiado (~1 min) ----------
  // De mayo de 2015 a hoy, mes a mes, mientras suena el #1 global y aplaude su alcance. Se detiene en cada hito
  // (cuándo llega o se va Spotify) y acerca el mapa a esa región: así se ve por qué hay vacíos. Esc o "Saltar"
  // lo terminan.

  const MS_POR_MES = 170;
  const MS_POR_HITO = 3800;

  function relato(texto, paso, total) {
    $('relato-texto').textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
    $('relato-paso').textContent = `${paso} / ${total}`;
    $('relato').hidden = false;
  }

  function irARegion(nombre) {
    marcarRegion(document.querySelector(`.acercar button[data-region="${nombre}"]`));
    Mapa.enfocar(nombre);
    Contexto.actualizar();
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
      clearTimeout(timerIntencion);                     // un cursor que venía del mapa no cambia el panel después
      Mapa.marcar(null);
      Estado.fijado = null;
      Estado.vistaPais = null;
      territorio = null;
      ocultarGlobo();
      irARegion('mundo');
      cambiarGrano('mes');
      irAPeriodo(0);
      const TOTAL = HITOS.length + 3;
      const inicio = cuentaGlobal('global');
      relato(`${textoPeriodo('mes', 0)}: ${inicio.n} de ${inicio.total} países escuchan el #1 global, «${cancion(numero1('global').idx).titulo}».`, 1, TOTAL);
      await esperar(5000);

      relato('Mes a mes. Los aplausos: en cuántos países es #1 esa canción.', 2, TOTAL);
      Aplausos.continuo(true);
      const porMes = new Map(HITOS.map(h => [periodoDeFecha('mes', new Date(h.fecha + 'T00:00:00Z')), h]));
      let paso = 2;
      for (let p = 1; p < window.PERIODOS.mes.n; p++) {
        irAPeriodo(p);
        const hito = porMes.get(p);
        if (hito) {
          irARegion(hito.region);
          relato(hito.largo, ++paso, TOTAL);
          await esperar(MS_POR_HITO);
          irARegion('mundo');
        }
        await esperar(MS_POR_MES);
      }
      Aplausos.continuo(false);

      const hoy = cuentaGlobal('global');
      const china = numero1('cn');                      // fuera de la muestra (QQ Music, sin Spotify): se nombra al final
      const deChina = china && !sigueAlGlobal('cn') ? ` En China, sin Spotify, el #1 es otro: «${cancion(china.idx).titulo}».` : '';
      if (china) irARegion('asia');
      relato(`${textoPeriodo('mes', Estado.periodo)}: ${hoy.n} de ${hoy.total} países escuchan el #1 global.${deChina}`, TOTAL, TOTAL);
      await esperar(5000);
    } catch (e) {
      // Terminado con Esc o "Saltar": se vuelve al estado de inicio igual que al final.
    } finally {
      r.activo = false;
      recorrido = null;
      $('relato').hidden = true;
      document.body.classList.remove('en-recorrido');
      Aplausos.continuo(false);
      irARegion('mundo');
      cambiarGrano('mes');
      irAPeriodo(window.PERIODOS.mes.n - 1);
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
      Aplausos.silenciar();
      Estatica.silenciar();
      Panel.audio('silenciado');
    } else {
      encenderSonido();
    }
    actualizarBotonSonido();
  });

  botonPlay.addEventListener('click', () => (Estado.reproduciendo ? pausar() : reproducir()));
  slider.addEventListener('input', () => irAPeriodo(Number(slider.value)));
  document.querySelectorAll('.granos button').forEach(b => b.addEventListener('click', () => cambiarGrano(b.dataset.grano)));
  // R3: los botones de región se leían como filtros. Solo acercan el mapa (un atajo para no arrastrar ni hacer
  // zoom a mano): el panel, el eje y la diversidad siguen contando los 52 países del mundo.
  document.querySelectorAll('.acercar button').forEach(b => b.addEventListener('click', () => {
    marcarRegion(b);
    Mapa.enfocar(b.dataset.region);
    Contexto.actualizar();
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
    if (e.target.closest('button, select, textarea, [tabindex], input, #contexto, #contexto-ficha')) return;
    const n = window.PERIODOS[Estado.grano].n;
    if (e.code === 'Space') { e.preventDefault(); Estado.reproduciendo ? pausar() : reproducir(); }
    if (e.code === 'ArrowLeft') irAPeriodo(Math.max(0, Estado.periodo - 1));
    if (e.code === 'ArrowRight') irAPeriodo(Math.min(n - 1, Estado.periodo + 1));
  });

  Mapa.on({ alPasar: pasarPorPais, alPasarSinChart: pasarSinChart, alSalir: salir, alElegir: clickEnPais });
  $('mapa').addEventListener('mousemove', e => { if (globo) { globo.raton = e; moverGlobo(e); } });
  $('mapa').addEventListener('mouseleave', () => { entrada = null; salir('fuera'); });
  Panel.iniciar({ alVolverAlResumen: () => (Estado.fijado ? soltar() : volverAlResumen()) });
  Linea.alElegirHito(h => {
    irARegion(h.region);
    if (!Estado.fijado) { Estado.vistaPais = null; territorio = null; }
    irAPeriodo(periodoDeFecha(Estado.grano, new Date(h.fecha + 'T00:00:00Z')));
  });

  slider.max = window.PERIODOS[Estado.grano].n - 1;
  slider.title = `${textoPeriodoCorto('dia', 0)} – ${textoPeriodoCorto('dia', window.PERIODOS.dia.n - 1)}`;
  Linea.dibujar();
  Mapa.iniciar();
  actualizarBotonSonido();
  Panel.audio(null);
  // Al abrir la página la historia corre sola, mes a mes desde mayo de 2015 hasta hoy (el sonido se suma con el
  // primer click o tecla: los navegadores no dejan sonar nada antes). Con "reducir movimiento" no arranca sola:
  // queda en el mes más reciente.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) irAPeriodo(window.PERIODOS[Estado.grano].n - 1);
  else { irAPeriodo(0); reproducir(); }
})();
