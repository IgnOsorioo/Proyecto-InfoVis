/* Panel lateral derecho (alto completo). Tiene tres vistas:
   - Resumen (overview, al entrar o al volver): qué tan local es el #1 en el mundo o en la región elegida,
     hoy (cuántos países tienen un #1 mundial, compartido o propio) y su evolución desde 2017.
   - Canción: la del país bajo el cursor (explorar) o la canción seguida.
   - Mensaje: país sin datos.
   Debajo de las tres, el top 5 del mundo, de un continente o de un país.

   Vista de canción:
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
  const ESPERA_CARGA_MS = 150;                          // si los datos tardan más, aparece la pantalla de carga
  let alElegir = () => {};
  let alVolver = () => {};
  let claveEvolucion = '';
  let pedido = 0;
  let claveTop = '';
  const portadasListas = new Set();

  const fechaSemana = s => fechaDeSemana(s).toISOString().slice(0, 10);

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
    panel.classList.remove('cargando', 'modo-mensaje', 'modo-resumen');
    panel.classList.toggle('modo-seguir', Estado.modo === 'seguir');
    dibujarCancion(c);
    const lista = top?.[Estado.grano]?.[Estado.periodo] ?? [];
    $('p-contexto').textContent = contexto(idx, lista, ambito);
    dibujarEstadisticas(idx, popularidad);
    dibujarTop(lista, ambito, idx);
  }

  // ---------- Resumen (overview) ----------

  const pct = (n, total) => `${Math.round(100 * n / total)} %`;
  const paises = n => (n === 1 ? '1 país' : `${n} países`);

  /** Qué tan local es el #1 en el ámbito (mundo o continente): hoy y desde 2017. */
  async function resumen() {
    const mio = ++pedido;
    const ambito = Estado.ambito;
    const espera = setTimeout(() => { if (mio === pedido) panel.classList.add('cargando'); }, ESPERA_CARGA_MS);
    let top = null;
    try {
      top = await pedirTop5(ambito).catch(() => null);
    } finally {
      clearTimeout(espera);
    }
    if (mio !== pedido) return;
    panel.classList.remove('cargando', 'modo-mensaje', 'modo-seguir');
    panel.classList.add('modo-resumen');

    const { cat } = categorias();
    const n = { mundial: 0, compartido: 0, propio: 0 };
    let total = 0;
    for (const cc of paisesDelAmbito(ambito)) if (cat[cc]) { n[cat[cc]]++; total++; }
    const lugar = ambito === 'global' ? 'El mundo' : nombreAmbito(ambito);
    $('r-contexto').textContent = `${lugar} · ${textoPeriodo(Estado.grano, Estado.periodo)}`;
    $('r-titular').textContent = total
      ? `${n.propio} de ${paises(total)} ${n.propio === 1 ? 'tiene' : 'tienen'} un #1 propio`
      : 'Sin datos en esta fecha';
    for (const k of CATEGORIAS) {
      $(`r-${k}`).textContent = total ? pct(n[k], total) : '—';
      $(`r-${k}-n`).textContent = total ? paises(n[k]) : '';
    }

    const serie = serieCategorias(ambito);
    const anual = (desde, hasta) => {
      const v = serie.propio.filter((_, i) => serie.x[i] >= desde && serie.x[i] < hasta);
      return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
    };
    const ultimo = Number(window.FECHA_MAX.slice(0, 4));
    const antes = anual('2017', '2018'), ahora = anual(String(ultimo), String(ultimo + 1));
    $('r-bajada').textContent = 'Cada país se pinta según su canción #1: la misma que el #1 mundial, una compartida con otros países o una que es #1 solo ahí.'
      + (antes !== null && ahora !== null ? ` Los #1 propios pasaron del ${antes} % de los países en 2017 al ${ahora} % en ${ultimo}.` : '');
    dibujarEvolucion(serie, ambito);
    dibujarTop(top?.[Estado.grano]?.[Estado.periodo] ?? [], ambito, null);
  }

  /** Áreas apiladas (propio abajo, compartido, mundial arriba) con una línea vertical en la fecha elegida. */
  function dibujarEvolucion(serie, ambito) {
    const nodo = $('r-grafico');
    const fecha = fechaDePeriodo(Estado.grano, Estado.periodo).toISOString().slice(0, 10);
    const marca = { type: 'line', xref: 'x', yref: 'paper', x0: fecha, x1: fecha, y0: 0, y1: 1, line: { color: token('tinta'), width: 1.5 } };
    const clave = `${ambito}|${nodo.clientHeight}`;
    if (clave === claveEvolucion && nodo.data) {         // mismos datos: solo se mueve la línea de la fecha
      Plotly.relayout(nodo, { shapes: [marca] });
      return;
    }
    claveEvolucion = clave;
    const nombres = { propio: 'propio', compartido: 'compartido', mundial: '#1 mundial' };
    Plotly.react(nodo, ['propio', 'compartido', 'mundial'].map(k => ({
      type: 'scatter', mode: 'lines', x: serie.x, y: serie[k], name: nombres[k], stackgroup: 'uno',
      line: { width: 0, shape: 'spline', smoothing: 0.5 }, fillcolor: token(k),
      hovertemplate: `%{x|%b %Y}: <b>%{y:.0f} %</b> ${nombres[k]}<extra></extra>`,
    })), {
      height: Math.max(90, nodo.clientHeight),
      margin: { l: 40, r: 8, t: 8, b: 20 },
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      showlegend: false,
      font: { family: token('fuente'), size: 10, color: token('tinta-3') },
      hoverlabel: { bgcolor: token('superficie'), bordercolor: token('eje'), font: { family: token('fuente'), size: 12, color: token('tinta') } },
      xaxis: { showgrid: false, zeroline: false, linecolor: token('eje'), fixedrange: true, nticks: 6, tickformat: '%Y' },
      yaxis: { gridcolor: token('grilla'), zeroline: false, fixedrange: true, range: [0, 100], tickvals: [0, 50, 100], ticktext: ['0', '50 %', '100 %'] },
      shapes: [marca],
    }, CONFIG_PLOTLY);
  }

  /** País sin datos: solo un mensaje centrado (sin la canción anterior). */
  function mensaje(titulo, texto) {
    pedido++;                                           // cancela una actualización pendiente
    panel.classList.remove('cargando', 'modo-resumen');
    panel.classList.add('modo-mensaje');
    panel.scrollTop = 0;
    $('p-mensaje-titulo').textContent = titulo;
    $('p-mensaje-texto').textContent = texto;
  }

  // ---------- Partes del panel ----------

  function dibujarCancion(c) {
    if ($('p-portada').dataset.idx === String(c.idx)) return;
    $('p-portada').dataset.idx = c.idx;
    $('p-portada').src = c.portada;
    $('p-fondo').src = c.portada;                       // misma portada, desenfocada, llena los lados si falta alto
    $('p-portada').alt = `Portada de ${c.titulo}`;
    $('p-titulo').textContent = c.titulo;
    $('p-titulo').title = c.titulo;
    $('p-artistas').textContent = c.artistas;
    $('p-artistas').title = c.artistas;
    $('p-spotify').href = `https://open.spotify.com/track/${c.id}`;
    $('p-estreno').textContent = c.estreno ? c.estreno.split('-').reverse().join('/') : '—';   // DD/MM/AAAA
  }

  /** Dónde está la canción hoy: "#1 en Chile · lleva 9 días seguidos" o su puesto en el top 5 mostrado.
      Al seguirla: en cuántos charts está en el período. */
  function contexto(idx, lista, ambito) {
    if (Estado.modo === 'seguir') {
      const n = Object.values(Estado.puestos ?? {}).filter(r => r > 0).length;
      return n ? `Siguiendo · en el top 200 de ${paises(n)}` : 'Siguiendo · fuera de los charts en esta fecha';
    }
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
      height: 96,
      margin: { l: 34, r: 8, t: 4, b: 20 },
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      showlegend: false,
      font: { family: token('fuente'), size: 10, color: token('tinta-3') },
      hoverlabel: { bgcolor: token('superficie'), bordercolor: token('eje'), font: { family: token('fuente'), size: 12, color: token('tinta') } },
      xaxis: { showgrid: false, zeroline: false, linecolor: token('eje'), fixedrange: true, nticks: 4, tickformat: formatoEje },
      yaxis: { gridcolor: token('grilla'), zeroline: false, tickformat: '~s', fixedrange: true, nticks: 4, rangemode: 'tozero' },
    }, CONFIG_PLOTLY);
  }

  /** Top 5 del ámbito; `actual` (o null) es la canción que se marca en la lista. Un click la sigue. */
  function dibujarTop(lista, ambito, actual) {
    $('p-top-titulo').textContent = `Top 5 en ${nombreAmbito(ambito)}`;
    $('p-top-periodo').textContent = textoPeriodo(Estado.grano, Estado.periodo);
    const clave = `${ambito}|${lista.join(',')}|${actual}`;
    if (clave === claveTop) return;                     // sin cambios: no se rehace la lista
    claveTop = clave;
    if (!lista.length) {
      $('p-top').replaceChildren(el('li', { className: 'p-top-vacio', textContent: 'Sin datos para este período.' }));
      return;
    }
    $('p-top').replaceChildren(...lista.map((idx, i) => {
      const c = cancion(idx);
      const li = el('li', { tabIndex: 0, title: `Seguir ${c.titulo} en el mapa` }, [
        el('span', { className: 'p-pos', textContent: i + 1 }),
        el('img', { src: c.portada, alt: '' }),
        el('span', { className: 'p-top-texto' }, [
          el('strong', { textContent: c.titulo }),
          el('span', { textContent: c.artistas }),
        ]),
      ]);
      li.classList.toggle('actual', idx === actual);
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
    silencio: 'Haz click para activar el sonido',
    pausa: 'En pausa · pasa el cursor por un país',
    silenciado: 'Sonido apagado (abajo a la derecha)',
  };
  function audio(estado) {
    $('p-audio').classList.toggle('sonando', estado === 'sonando');
    $('p-audio-texto').textContent = TEXTO_AUDIO[estado] ?? 'Pasa el cursor por un país para escucharla';
  }

  function progreso(fraccion) {
    $('p-progreso').style.width = `${fraccion * 100}%`;
  }

  return {
    iniciar({ alElegirCancion, alVolverAlResumen }) {
      alElegir = alElegirCancion;
      alVolver = alVolverAlResumen;
      $('p-volver').addEventListener('click', () => alVolver());
    },
    mostrar, resumen, mensaje, audio, progreso,
  };
})();
