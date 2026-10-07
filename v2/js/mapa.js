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
  // Recuadro (longitud, latitud) que debe verse completo con cada botón de región. Plotly ajusta el mapa
  // para que el recuadro entero quepa, aunque eso muestre también partes de otros continentes.
  const REGIONES = {
    mundo:   { lon: [-180, 180], lat: [-57, 84] },
    america: { lon: [-170, -30], lat: [-57, 84] },   // de Alaska y el Ártico canadiense a Tierra del Fuego
    europa:  { lon: [-32, 45],   lat: [27, 81] },    // incluye Canarias, Azores, Islandia y Svalbard
    africa:  { lon: [-20, 62],   lat: [-36, 43] },   // África, Turquía y la península arábiga
    asia:    { lon: [44, 150],   lat: [-12, 56] },   // de Kazajistán y Pakistán a Japón e Indonesia
    oceania: { lon: [110, 180],  lat: [-48, -9] },
  };
  const MARGEN_PX = 8;
  let region = 'mundo';
  let escala = 1;                      // zoom que asegura que el recuadro de la región quepa entero
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
        // Sobre un país sin datos el panel no muestra canción, así que tampoco se pinta coral.
        z: conDatos.map(cc => (!Estado.mensaje && numero1(cc).idx === Estado.cancion ? 1 : 0)),
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
      uirevision: `mapa-${enfoques}`,     // conserva el arrastre y el zoom del usuario al cambiar de fecha
      showlegend: false,
      geo: {
        projection: { type: 'natural earth', scale: escala },
        lonaxis: { range: REGIONES[region].lon },
        lataxis: { range: REGIONES[region].lat },  // el mundo, sin la Antártida
        showframe: false, showocean: false, showland: false, showcountries: false, showcoastlines: false, showlakes: false,
        bgcolor: 'rgba(0,0,0,0)',
      },
    };
  }

  /** Redibuja (al cambiar de fecha, de canción seleccionada o de país bajo el cursor). */
  function dibujar() {
    const listo = Plotly.react(EL, trazas(), layout(), { ...CONFIG_PLOTLY, scrollZoom: true });
    if (!eventosConectados) conectarEventos();
    return listo;                      // Plotly.react es asíncrono: la promesa se cumple al terminar de dibujar
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
  }

  /** Acerca el mapa a una región ('mundo', 'america', 'europa', 'africa', 'asia', 'oceania'). */
  function enfocar(nueva) {
    region = nueva;
    escala = 1;
    enfoques++;
    dibujar().then(asegurarRegionCompleta);
  }

  /** Plotly encuadra el recuadro de la región solo de forma aproximada (en esta proyección los bordes son
      curvos), así que algunas esquinas pueden quedar fuera. Se mide dónde cae el borde del recuadro en
      pantalla y, si se sale, se reduce el zoom lo justo para que quepa completo. */
  function asegurarRegionCompleta() {
    const gd = document.getElementById(EL);
    const sub = gd._fullLayout?.geo?._subplot;
    if (typeof sub?.projection !== 'function') return;
    const { lon: [lon0, lon1], lat: [lat0, lat1] } = REGIONES[region];
    const { w, h } = gd._fullLayout._size;
    const cx = w / 2, cy = h / 2;
    let dx = 0, dy = 0;
    for (let i = 0; i <= 40; i++) {
      const lon = lon0 + (lon1 - lon0) * i / 40, lat = lat0 + (lat1 - lat0) * i / 40;
      for (const [x, y] of [[lon, lat0], [lon, lat1], [lon0, lat], [lon1, lat]].map(pt => sub.projection(pt))) {
        dx = Math.max(dx, Math.abs(x - cx));
        dy = Math.max(dy, Math.abs(y - cy));
      }
    }
    const factor = Math.min((cx - MARGEN_PX) / dx, (cy - MARGEN_PX) / dy);
    if (factor < 0.999) {
      escala *= factor;
      dibujar();
    }
  }

  // Al cambiar el tamaño de la ventana, se vuelve a encuadrar la región elegida.
  let timerResize = null;
  window.addEventListener('resize', () => {
    clearTimeout(timerResize);
    timerResize = setTimeout(() => { if (region !== 'mundo' || escala !== 1) enfocar(region); }, 200);
  });

  return {
    dibujar, marcar, enfocar,
    iniciar() { dibujar().then(asegurarRegionCompleta); },
    on(nuevos) { eventos = { ...eventos, ...nuevos }; },
  };
})();
