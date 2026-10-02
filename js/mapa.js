/* Mapa mundial en 2D (proyección Natural Earth). Gira en torno a la canción seleccionada:
   - coral: países donde esa canción es #1 en el período elegido;
   - gris sólido: países con datos cuyo #1 es otra canción;
   - vacío (solo contorno): países sin datos de Spotify.
   Geometría: Natural Earth 1:50m (datos/mundo.js), con los territorios de ultramar separados de su país.
   Trazas: 0 sin datos · 1 países con datos · 2 contorno del país bajo el cursor. */

const Mapa = (() => {
  const EL = 'mapa';
  const ISO3_A_CC = Object.fromEntries(
    Object.entries(window.PAISES).filter(([cc]) => cc !== 'global').map(([cc, p]) => [p.iso3, cc]));
  // Países y territorios del mapa sin chart de Spotify: iso3 → {nombre, nota?}
  const SIN_CHART = Object.fromEntries(window.MUNDO.features
    .filter(f => !ISO3_A_CC[f.properties.iso3])
    .map(f => [f.properties.iso3, f.properties]));
  // Vistas de los botones de región: centro del mapa y zoom.
  const REGIONES = {
    mundo:   { lon: 10,  lat: 12,  escala: 1 },
    america: { lon: -78, lat: 8,   escala: 2.1 },
    europa:  { lon: 14,  lat: 51,  escala: 4.4 },
    africa:  { lon: 28,  lat: 10,  escala: 2.3 },
    asia:    { lon: 102, lat: 24,  escala: 2.3 },
    oceania: { lon: 150, lat: -28, escala: 3.6 },
  };
  let vista = { ...REGIONES.mundo };   // centro y zoom actuales (se actualizan al arrastrar o hacer scroll)
  let enfoques = 0;                    // cambia uirevision para que un botón de región se imponga al zoom manual
  let marcado = null;                  // país bajo el cursor (contorno claro)
  let eventos = { alPasar: () => {}, alPasarSinChart: () => {}, alSalir: () => {} };
  let eventosConectados = false;

  function trazas() {
    const conDatos = paisesConDatos();
    const iso3 = cc => window.PAISES[cc].iso3;
    // Sin datos: países cuyo chart aún no empezaba en esta fecha + países sin chart de Spotify.
    const sinDatos = [
      ...Object.keys(window.PAISES).filter(cc => cc !== 'global' && !conDatos.includes(cc)).map(iso3),
      ...Object.keys(SIN_CHART),
    ];
    const base = {
      type: 'choropleth', geojson: window.MUNDO, featureidkey: 'properties.iso3', locationmode: 'geojson-id',
      showscale: false, hoverinfo: 'none',
    };
    const plano = color => [[0, color], [1, color]];
    const marcados = marcado && window.PAISES[marcado] ? [iso3(marcado)] : [];
    return [
      { ...base, locations: sinDatos, z: sinDatos.map(() => 0), colorscale: plano(token('vacio')),
        marker: { line: { color: token('contorno-vacio'), width: 0.6 } } },
      { ...base, locations: conDatos.map(iso3), zmin: 0, zmax: 1,
        z: conDatos.map(cc => (numero1(cc).idx === Estado.cancion ? 1 : 0)),
        colorscale: [[0, token('otra')], [0.5, token('otra')], [0.5, token('c1')], [1, token('c1')]],
        marker: { line: { color: token('plano'), width: 0.6 } } },
      { ...base, locations: marcados, z: marcados.map(() => 0), colorscale: plano('rgba(0,0,0,0)'),
        marker: { line: { color: token('resalte'), width: 1.6 } }, hoverinfo: 'skip' },
    ];
  }

  function layout() {
    return {
      paper_bgcolor: 'rgba(0,0,0,0)',
      margin: { l: 0, r: 0, t: 0, b: 0 },
      dragmode: 'pan',
      uirevision: `mapa-${enfoques}`,
      showlegend: false,
      geo: {
        projection: { type: 'natural earth', scale: vista.escala },
        center: { lon: vista.lon, lat: vista.lat },
        lataxis: { range: [-57, 84] },            // sin la Antártida
        showframe: false, showocean: false, showland: false, showcountries: false, showcoastlines: false, showlakes: false,
        bgcolor: 'rgba(0,0,0,0)',
      },
    };
  }

  /** Redibuja (al cambiar de fecha, de canción seleccionada o de país bajo el cursor). */
  function dibujar() {
    Plotly.react(EL, trazas(), layout(), { ...CONFIG_PLOTLY, scrollZoom: true });
    if (!eventosConectados) conectarEventos();
  }

  /** País bajo el cursor (contorno claro); se ve en el próximo dibujar(). */
  function marcar(cc) {
    marcado = cc;
  }

  // Plotly agrega .on() al div recién en el primer dibujo.
  function conectarEventos() {
    eventosConectados = true;
    const el = document.getElementById(EL);
    const pasar = ev => {
      const iso3 = ev.points[0]?.location;
      if (ISO3_A_CC[iso3]) eventos.alPasar(ISO3_A_CC[iso3]);
      else if (SIN_CHART[iso3]) eventos.alPasarSinChart(SIN_CHART[iso3]);
    };
    el.on('plotly_hover', pasar);
    el.on('plotly_unhover', () => eventos.alSalir());
    el.on('plotly_click', pasar);          // en pantallas táctiles no hay hover: un toque hace lo mismo
    // Guarda el centro y el zoom que deja el usuario al arrastrar o hacer scroll.
    el.on('plotly_relayout', () => {
      const geo = el._fullLayout.geo;
      vista = { lon: geo.center.lon, lat: geo.center.lat, escala: geo.projection.scale };
    });
  }

  /** Acerca el mapa a una región ('mundo', 'america', 'europa', 'africa', 'asia', 'oceania'). */
  function enfocar(region) {
    vista = { ...REGIONES[region] };
    enfoques++;
    dibujar();
  }

  return {
    dibujar, marcar, enfocar,
    on(nuevos) { eventos = { ...eventos, ...nuevos }; },
  };
})();
