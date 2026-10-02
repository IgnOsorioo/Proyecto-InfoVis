/* Panel lateral derecho (alto completo): la canción seleccionada y el top 5 del ámbito elegido.
   - Cabecera: portada, título, artistas, dónde está en el ranking y estado del audio.
   - Estadísticas a la fecha de la línea de tiempo: estreno, en cuántos países es #1 (= coral en el mapa)
     y reproducciones acumuladas en los charts.
   - Gráfico de popularidad: reproducciones semanales sumando los charts de los 70 países, desde que la
     canción entra a los charts hasta la fecha actual; crece en tiempo real al reproducir la línea de tiempo.
   - Top 5 del mundo, de un continente o de un país, según lo que se haya seleccionado. */

const Panel = (() => {
  const $ = id => document.getElementById(id);
  const SEMANA_BASE = Date.UTC(2016, 11, 26);           // lunes de la semana 0 (igual que el pipeline)
  let alElegir = () => {};
  let popularidad = null;                               // {idx, inicio, valores} de la canción seleccionada
  let topActual = [];                                   // índices del top 5 que se muestra
  let pedidoPop = 0, pedidoTop = 0, claveTop = '';

  const semanaDe = fecha => Math.floor((fecha - SEMANA_BASE) / (7 * DIA_MS));
  const fechaSemana = s => new Date(SEMANA_BASE + s * 7 * DIA_MS).toISOString().slice(0, 10);

  function el(tag, props = {}, hijos = []) {
    const nodo = Object.assign(document.createElement(tag), props);
    nodo.append(...[].concat(hijos));
    return nodo;
  }

  // ---------- Canción seleccionada ----------

  /** Al cambiar de canción: cabecera fija + carga de su popularidad. */
  async function cancionCambiada() {
    const idx = Estado.cancion;
    if (idx === null) return;
    const c = cancion(idx);
    $('p-portada').src = c.portada;
    $('p-portada').alt = `Portada de ${c.titulo}`;
    $('p-titulo').textContent = c.titulo;
    $('p-artistas').textContent = c.artistas;
    $('p-spotify').href = `https://open.spotify.com/track/${c.id}`;
    $('p-estreno').textContent = c.estreno ? textoFecha(new Date(c.estreno + 'T00:00:00Z')) : '—';
    audio(null);
    popularidad = null;
    tiempo();
    const mio = ++pedidoPop;
    let d = null;
    try { d = await pedirPopularidad(idx); } catch (e) { console.error(e); }
    if (mio !== pedidoPop) return;                      // ya se eligió otra canción
    popularidad = { idx, ...(d ?? { inicio: 0, valores: [] }) };
    tiempo();
  }

  /** Dónde está la canción hoy: "#1 en Chile · lleva 9 días seguidos" o su puesto en el top 5 mostrado. */
  function contexto() {
    const idx = Estado.cancion;
    const origen = Estado.origen;
    const r = origen ? numero1(origen) : null;
    if (r && r.idx === idx) return `#1 en ${nombrePais(origen)} · ${textoRacha(r)}`;
    const pos = topActual.indexOf(idx);
    if (pos >= 0) return `#${pos + 1} en ${nombreAmbito(Estado.ambito)}`;
    return textoPeriodo(Estado.grano, Estado.periodo);
  }

  /** Todo lo que depende de la fecha: contexto, estadísticas, gráfico y top 5. */
  function tiempo() {
    if (Estado.cancion === null) return;
    const n = paisesDondeEsNumero1(Estado.cancion).length;
    $('p-numero1').textContent = n === 1 ? '1 país' : `${n} países`;
    const hasta = semanaDe(finDelPeriodo());
    if (popularidad && popularidad.idx === Estado.cancion) {
      const visibles = popularidad.valores.slice(0, Math.max(0, hasta - popularidad.inicio + 1));
      const total = visibles.reduce((a, b) => a + b, 0) * 1000;
      $('p-reproducciones').textContent = total ? textoCantidad(total) : '—';
      dibujarGrafico(visibles);
    } else {
      $('p-reproducciones').textContent = '…';
      dibujarGrafico(null);
    }
    dibujarTop();
  }

  function dibujarGrafico(valores) {
    const nodo = $('p-grafico');
    const aviso = $('p-grafico-aviso');
    if (!valores || !valores.length) {
      aviso.textContent = valores ? 'Todavía no entra a los charts en esta fecha.' : 'Cargando…';
      aviso.hidden = false;
      Plotly.purge(nodo);
      return;
    }
    aviso.hidden = true;
    const x = valores.map((_, i) => fechaSemana(popularidad.inicio + i));
    // Formato de fechas del eje según el tramo que se muestra: días y mes, mes y año, o solo años.
    const semanas = valores.length;
    const formatoEje = semanas <= 20 ? '%d %b' : semanas <= 110 ? '%b %Y' : '%Y';
    const y = valores.map(v => v * 1000);
    const coral = token('c1');
    Plotly.react(nodo, [
      { type: 'scatter', mode: 'lines', x, y, line: { color: coral, width: 2, shape: 'spline', smoothing: 0.6 },
        fill: 'tozeroy', fillcolor: 'rgba(228, 86, 75, 0.16)',
        hovertemplate: 'Semana del %{x|%d %b %Y}<br><b>%{y:.3s}</b> reproducciones<extra></extra>' },
      { type: 'scatter', mode: 'markers', x: [x.at(-1)], y: [y.at(-1)], hoverinfo: 'skip',
        marker: { color: coral, size: 9, line: { color: token('superficie'), width: 2 } } },
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

  // ---------- Top 5 ----------

  async function dibujarTop() {
    const ambito = Estado.ambito;
    $('p-top-titulo').textContent = `Top 5 en ${nombreAmbito(ambito)}`;
    $('p-top-periodo').textContent = textoPeriodo(Estado.grano, Estado.periodo);
    const mio = ++pedidoTop;
    let datos;
    try { datos = await pedirTop5(ambito); } catch (e) { console.error(e); return; }
    if (mio !== pedidoTop) return;
    const lista = datos[Estado.grano][Estado.periodo] ?? [];
    const clave = `${ambito}|${lista.join(',')}|${Estado.cancion}`;
    topActual = lista;
    $('p-contexto').textContent = contexto();
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
        el('img', { src: c.portada, alt: '', loading: 'lazy' }),
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

  // ---------- Avisos y audio ----------

  /** Mensaje sobre el país bajo el cursor cuando no tiene datos (o null para ocultarlo). */
  function aviso(texto) {
    $('p-aviso').hidden = !texto;
    $('p-aviso').textContent = texto ?? '';
  }

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
    cancionCambiada, tiempo, aviso, audio, progreso,
  };
})();
