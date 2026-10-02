/* Panel lateral derecho (alto completo): la canción seleccionada y el top 5 del ámbito elegido.
   - Cabecera: portada, título, artistas, dónde está en el ranking y estado del audio.
   - Estadísticas a la fecha de la línea de tiempo: estreno, en cuántos países es #1 (= coral en el mapa)
     y reproducciones acumuladas en los charts.
   - Gráfico de popularidad: reproducciones semanales sumando los charts de los 70 países, desde que la
     canción entra a los charts hasta la fecha actual; crece en tiempo real al reproducir la línea de tiempo.
   - Top 5 del mundo, de un continente o de un país, según lo que se haya seleccionado.

   El panel se actualiza de una sola vez: primero se cargan la popularidad, el top 5 y la portada, y recién
   entonces se reemplaza todo. Si eso tarda, se muestra una pantalla de carga en vez de un panel a medio armar.
   Para un país sin datos, el panel muestra solo un mensaje centrado. */

const Panel = (() => {
  const $ = id => document.getElementById(id);
  const panel = $('panel');
  const SEMANA_BASE = Date.UTC(2016, 11, 26);           // lunes de la semana 0 (igual que el pipeline)
  const ESPERA_CARGA_MS = 150;                          // si los datos tardan más, aparece la pantalla de carga
  let alElegir = () => {};
  let pedido = 0;
  let claveTop = '';
  const portadasListas = new Set();

  const semanaDe = fecha => Math.floor((fecha - SEMANA_BASE) / (7 * DIA_MS));
  const fechaSemana = s => new Date(SEMANA_BASE + s * 7 * DIA_MS).toISOString().slice(0, 10);

  function el(tag, props = {}, hijos = []) {
    const nodo = Object.assign(document.createElement(tag), props);
    nodo.append(...[].concat(hijos));
    return nodo;
  }

  /** Descarga la portada antes de mostrarla (máx. 1,5 s), para no ver un cuadro vacío al cambiar. */
  function precargarPortada(url) {
    if (!url || portadasListas.has(url)) return Promise.resolve();
    return new Promise(resolve => {
      const img = new Image();
      const listo = () => { portadasListas.add(url); resolve(); };
      img.onload = listo;
      img.onerror = resolve;
      img.src = url;
      setTimeout(resolve, 1500);
    });
  }

  // ---------- Actualización completa ----------

  /** Muestra la canción seleccionada y el top 5 del ámbito a la fecha actual (todo junto, ya cargado). */
  async function mostrar() {
    if (Estado.cancion === null) return;
    const mio = ++pedido;
    const idx = Estado.cancion;
    const ambito = Estado.ambito;
    const c = cancion(idx);
    const espera = setTimeout(() => { if (mio === pedido) panel.classList.add('cargando'); }, ESPERA_CARGA_MS);
    let popularidad = null, top = null;
    try {
      [popularidad, top] = await Promise.all([
        pedirPopularidad(idx).catch(() => null),
        pedirTop5(ambito).catch(() => null),
        precargarPortada(c.portada),
      ]);
    } finally {
      clearTimeout(espera);
    }
    if (mio !== pedido) return;                         // ya se pidió otra cosa: se descarta
    panel.classList.remove('cargando', 'modo-mensaje');
    dibujarCancion(c);
    const lista = top?.[Estado.grano]?.[Estado.periodo] ?? [];
    $('p-contexto').textContent = contexto(idx, lista, ambito);
    dibujarEstadisticas(idx, popularidad);
    dibujarTop(lista, ambito);
  }

  /** País sin datos: solo un mensaje centrado (sin la canción anterior). */
  function mensaje(titulo, texto) {
    pedido++;                                           // cancela una actualización pendiente
    panel.classList.remove('cargando');
    panel.classList.add('modo-mensaje');
    $('p-mensaje-titulo').textContent = titulo;
    $('p-mensaje-texto').textContent = texto;
  }

  // ---------- Partes del panel ----------

  function dibujarCancion(c) {
    if ($('p-portada').dataset.idx === String(c.idx)) return;
    $('p-portada').dataset.idx = c.idx;
    $('p-portada').src = c.portada;
    $('p-portada').alt = `Portada de ${c.titulo}`;
    $('p-titulo').textContent = c.titulo;
    $('p-titulo').title = c.titulo;
    $('p-artistas').textContent = c.artistas;
    $('p-artistas').title = c.artistas;
    $('p-spotify').href = `https://open.spotify.com/track/${c.id}`;
    $('p-estreno').textContent = c.estreno ? textoFecha(new Date(c.estreno + 'T00:00:00Z')) : '—';
  }

  /** Dónde está la canción hoy: "#1 en Chile · lleva 9 días seguidos" o su puesto en el top 5 mostrado. */
  function contexto(idx, lista, ambito) {
    const origen = Estado.origen;
    const r = origen ? numero1(origen) : null;
    if (r && r.idx === idx) return `#1 en ${nombrePais(origen)} · ${textoRacha(r)}`;
    const pos = lista.indexOf(idx);
    if (pos >= 0) return `#${pos + 1} en ${nombreAmbito(ambito)}`;
    return textoPeriodo(Estado.grano, Estado.periodo);
  }

  function dibujarEstadisticas(idx, popularidad) {
    const n = paisesDondeEsNumero1(idx).length;
    $('p-numero1').textContent = n === 1 ? '1 país' : `${n} países`;
    const hasta = semanaDe(finDelPeriodo());
    const valores = popularidad ? popularidad.valores.slice(0, Math.max(0, hasta - popularidad.inicio + 1)) : [];
    const total = valores.reduce((a, b) => a + b, 0) * 1000;
    $('p-reproducciones').textContent = total ? textoCantidad(total) : '—';
    dibujarGrafico(popularidad, valores);
  }

  function dibujarGrafico(popularidad, valores) {
    const nodo = $('p-grafico');
    const aviso = $('p-grafico-aviso');
    if (!valores.length) {
      aviso.textContent = popularidad ? 'Todavía no entra a los charts en esta fecha.' : 'Sin datos de popularidad.';
      aviso.hidden = false;
      Plotly.purge(nodo);
      return;
    }
    aviso.hidden = true;
    const x = valores.map((_, i) => fechaSemana(popularidad.inicio + i));
    // Formato de fechas del eje según el tramo que se muestra: días y mes, mes y año, o solo años.
    const formatoEje = valores.length <= 20 ? '%d %b' : valores.length <= 110 ? '%b %Y' : '%Y';
    const y = valores.map(v => v * 1000);
    const coral = token('c1');
    Plotly.react(nodo, [
      { type: 'scatter', mode: 'lines', x, y, line: { color: coral, width: 2, shape: 'spline', smoothing: 0.6 },
        fill: 'tozeroy', fillcolor: 'rgba(228, 86, 75, 0.16)',
        hovertemplate: 'Semana del %{x|%d %b %Y}<br><b>%{y:.3s}</b> reproducciones<extra></extra>' },
      { type: 'scatter', mode: 'markers', x: [x.at(-1)], y: [y.at(-1)], hoverinfo: 'skip',
        marker: { color: coral, size: 9, line: { color: token('panel'), width: 2 } } },
    ], {
      height: 130,
      margin: { l: 36, r: 10, t: 6, b: 22 },
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      showlegend: false,
      font: { family: token('fuente'), size: 10, color: token('tinta-3') },
      hoverlabel: { bgcolor: token('superficie'), bordercolor: token('eje'), font: { family: token('fuente'), size: 12, color: token('tinta') } },
      xaxis: { showgrid: false, zeroline: false, linecolor: token('eje'), fixedrange: true, nticks: 4, tickformat: formatoEje },
      yaxis: { gridcolor: token('grilla'), zeroline: false, tickformat: '~s', fixedrange: true, nticks: 4, rangemode: 'tozero' },
    }, CONFIG_PLOTLY);
  }

  function dibujarTop(lista, ambito) {
    $('p-top-titulo').textContent = `Top 5 en ${nombreAmbito(ambito)}`;
    $('p-top-periodo').textContent = textoPeriodo(Estado.grano, Estado.periodo);
    const clave = `${ambito}|${lista.join(',')}|${Estado.cancion}`;
    if (clave === claveTop) return;                     // sin cambios: no se rehace la lista
    claveTop = clave;
    if (!lista.length) {
      $('p-top').replaceChildren(el('li', { className: 'p-top-vacio', textContent: 'Sin datos para este período.' }));
      return;
    }
    $('p-top').replaceChildren(...lista.map((idx, i) => {
      const c = cancion(idx);
      const li = el('li', { tabIndex: 0, title: `Escuchar ${c.titulo}` }, [
        el('span', { className: 'p-pos', textContent: i + 1 }),
        el('img', { src: c.portada, alt: '' }),
        el('span', { className: 'p-top-texto' }, [
          el('strong', { textContent: c.titulo }),
          el('span', { textContent: c.artistas }),
        ]),
      ]);
      li.classList.toggle('actual', idx === Estado.cancion);
      li.addEventListener('click', () => alElegir(idx));
      li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alElegir(idx); } });
      return li;
    }));
  }

  // ---------- Audio ----------

  const TEXTO_AUDIO = {
    cargando: 'Cargando preview…',
    sonando: 'Sonando · preview de 30 s (Deezer)',
    'sin-preview': 'Sin preview disponible para esta canción',
    silencio: 'Activa el sonido (abajo a la derecha) para escuchar',
    pausa: 'En pausa · pasa el cursor por un país',
  };
  function audio(estado) {
    $('p-audio').classList.toggle('sonando', estado === 'sonando');
    $('p-audio-texto').textContent = TEXTO_AUDIO[estado] ?? 'Pasa el cursor por un país para escucharla';
  }

  function progreso(fraccion) {
    $('p-progreso').style.width = `${fraccion * 100}%`;
  }

  return {
    iniciar({ alElegirCancion }) { alElegir = alElegirCancion; },
    mostrar, mensaje, audio, progreso,
  };
})();
