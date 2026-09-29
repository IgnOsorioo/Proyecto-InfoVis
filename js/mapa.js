/* Mapa mundial: cada país pintado según su canción #1 en el período elegido.
   Países con datos van rellenos: las 3 canciones que son #1 en más países llevan color propio y el resto,
   gris sólido. Países sin datos quedan vacíos (solo contorno), para no confundirlos con "otra canción".
   Trazas: 0 sin datos · 1 países con datos (z = ranura de color) · 2 contorno de los países que comparten canción. */

const Mapa = (() => {
  const EL = 'mapa';
  const ISO3_A_CC = Object.fromEntries(
    Object.entries(window.PAISES).filter(([cc]) => cc !== 'global').map(([cc, p]) => [p.iso3, cc]));
  let ranuras = new Map();      // idx de canción → ranura de color 1..3 (estable mientras siga en el top)
  let top = [];                 // [{idx, n, ranura}]
  let resaltada = null;         // idx de la canción cuyos países se contornean
  let eventos = { alPasar: () => {}, alPasarSinChart: () => {}, alSalir: () => {}, alPasarCancion: () => {} };
  let eventosConectados = false;

  /** Top 3 de canciones por cantidad de países donde son #1, con colores que siguen a la canción. */
  function calcularTop() {
    const conteo = new Map();
    for (const cc of paisesConDatos()) {
      const idx = numero1(cc).idx;
      conteo.set(idx, (conteo.get(idx) || 0) + 1);
    }
    const orden = [...conteo]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1] || ranuras.has(b[0]) - ranuras.has(a[0]))
      .slice(0, 3);
    const nuevas = new Map(orden.filter(([idx]) => ranuras.has(idx)).map(([idx]) => [idx, ranuras.get(idx)]));
    const libres = [1, 2, 3].filter(r => ![...nuevas.values()].includes(r));
    for (const [idx] of orden) if (!nuevas.has(idx)) nuevas.set(idx, libres.shift());
    ranuras = nuevas;
    top = orden.map(([idx, n]) => ({ idx, n, ranura: ranuras.get(idx) }));
  }

  function escalaDiscreta() {
    const c = [token('otra'), token('c1'), token('c2'), token('c3')];
    return c.flatMap((color, i) => [[i / 4, color], [(i + 1) / 4, color]]);
  }

  function trazas() {
    const conDatos = paisesConDatos();
    const iso3 = cc => window.PAISES[cc].iso3;
    // Sin datos: países cuyo chart aún no empezaba en esta fecha + países sin chart de Spotify.
    const sinDatos = [
      ...Object.keys(window.PAISES).filter(cc => cc !== 'global' && !conDatos.includes(cc)).map(iso3),
      ...Object.keys(window.SIN_CHART),
    ];
    const comparten = resaltada === null ? [] : conDatos.filter(cc => numero1(cc).idx === resaltada);
    const base = { type: 'choropleth', locationmode: 'ISO-3', showscale: false, hoverinfo: 'none' };
    return [
      { ...base, locations: sinDatos, z: sinDatos.map(() => 0),
        colorscale: [[0, token('vacio')], [1, token('vacio')]],
        marker: { line: { color: token('contorno-vacio'), width: 0.6 } } },
      { ...base, locations: conDatos.map(iso3),
        z: conDatos.map(cc => ranuras.get(numero1(cc).idx) ?? 0), zmin: -0.5, zmax: 3.5,
        colorscale: escalaDiscreta(),
        marker: { line: { color: token('superficie'), width: 0.6 } } },
      { ...base, locations: comparten.map(iso3), z: comparten.map(() => 0),
        colorscale: [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']],
        marker: { line: { color: token('tinta'), width: 1.6 } }, hoverinfo: 'skip' },
    ];
  }

  function layout() {
    return {
      paper_bgcolor: 'rgba(0,0,0,0)',
      margin: { l: 0, r: 0, t: 0, b: 0 },
      dragmode: 'pan',
      uirevision: 'mapa',                       // conserva el zoom del usuario al cambiar de fecha
      showlegend: false,
      geo: {
        projection: { type: 'robinson' },
        lataxis: { range: [-57, 84] },
        showframe: false, showcoastlines: false, showocean: false, showlakes: false,
        showland: true, landcolor: token('vacio'),
        showcountries: true, countrycolor: token('contorno-vacio'), countrywidth: 0.6,
        bgcolor: 'rgba(0,0,0,0)',
      },
    };
  }

  function redibujar() {
    Plotly.react(EL, trazas(), layout(), { ...CONFIG_PLOTLY, scrollZoom: true });
    if (!eventosConectados) conectarEventos();
  }

  /** Recalcula el top y redibuja (al cambiar de fecha, de granularidad o de tema de color). */
  function dibujar() {
    calcularTop();
    redibujar();
    dibujarLeyenda();
  }

  /** Contornea todos los países cuya #1 es la canción idx (o ninguno con null). */
  function resaltar(idx) {
    if (idx === resaltada) return;
    resaltada = idx;
    redibujar();
  }

  // Plotly agrega .on() al div recién en el primer dibujo.
  function conectarEventos() {
    eventosConectados = true;
    const el = document.getElementById(EL);
    const pasar = ev => {
      const iso3 = ev.points[0]?.location;
      if (ISO3_A_CC[iso3]) eventos.alPasar(ISO3_A_CC[iso3], ev.event);
      else if (window.SIN_CHART[iso3]) eventos.alPasarSinChart(iso3, ev.event);
    };
    el.on('plotly_hover', pasar);
    el.on('plotly_unhover', () => eventos.alSalir());
    el.on('plotly_click', pasar);          // en pantallas táctiles no hay hover: un toque hace lo mismo
  }

  // ---------- Leyenda (HTML, con portadas) ----------

  function el(tag, props = {}, hijos = []) {
    const nodo = Object.assign(document.createElement(tag), props);
    nodo.append(...[].concat(hijos));
    return nodo;
  }

  function dibujarLeyenda() {
    const cont = document.getElementById('leyenda');
    const total = paisesConDatos().length;
    const items = top.map(({ idx, n, ranura }) => {
      const c = cancion(idx);
      const muestra = el('i', { className: 'muestra' });
      muestra.style.background = `var(--c${ranura})`;
      const li = el('li', { tabIndex: 0, title: `Escuchar ${c.titulo}` }, [
        muestra,
        el('img', { src: c.portada, alt: '', loading: 'lazy' }),
        el('span', {}, [
          el('span', { className: 'l-titulo', textContent: c.titulo }),
          el('span', { className: 'l-detalle', textContent: `#1 en ${n} de ${total} países · ${c.artistas}` }),
        ]),
      ]);
      li.addEventListener('mouseenter', () => eventos.alPasarCancion(idx));
      li.addEventListener('focus', () => eventos.alPasarCancion(idx));
      li.addEventListener('click', () => eventos.alPasarCancion(idx));
      li.addEventListener('mouseleave', () => eventos.alSalir());
      return li;
    });
    cont.replaceChildren(
      el('h3', { textContent: top.length ? 'Las más compartidas' : 'Cada país tiene su propio #1' }),
      el('ol', {}, items),
      el('div', { className: 'otras' }, [
        el('span', {}, [el('i', { className: 'muestra muestra-otra' }), 'Otra canción']),
        el('span', {}, [el('i', { className: 'muestra muestra-vacio' }), 'Sin datos (Spotify no publica chart)']),
      ]),
    );
  }

  return {
    dibujar, resaltar,
    on(nuevos) { eventos = { ...eventos, ...nuevos }; },
  };
})();
