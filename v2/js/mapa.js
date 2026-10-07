/* Mapa mundial en 2D (proyección Natural Earth). Pinta distinto según el modo:
   - explorar: el #1 de cada país es el #1 mundial (azul), uno compartido con otros países (gris cálido) o uno
     propio (coral). Con el cursor sobre un país, se atenúan los que no comparten su #1.
   - seguir: el puesto de la canción seguida en cada país (#1 · top 10 · top 50 · top 200 · fuera del chart).
   Vacíos, solo con contorno: países sin datos de Spotify.
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
  let eventos = { alPasar: () => {}, alPasarSinChart: () => {}, alSalir: () => {}, alElegir: () => {} };
  let eventosConectados = false;

  /** Escala de colores discreta: el valor i (0..k-1) toma exactamente el color i. */
  function escalaDiscreta(colores) {
    const k = colores.length;
    return colores.flatMap((c, i) => [[i / k, c], [(i + 1) / k, c]]);
  }

  /** Mezcla un color #rrggbb con el fondo negro (k = cuánto del color queda). */
  function atenuar(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const canal = d => Math.round(((n >> d) & 255) * k).toString(16).padStart(2, '0');
    return `#${canal(16)}${canal(8)}${canal(0)}`;
  }

  /** z (nivel de color) de cada país con datos y la lista de colores, según el modo. */
  function relleno(conDatos) {
    if (Estado.modo === 'seguir') {
      return { z: conDatos.map(nivelPuesto), colores: ['fuera', 'top200', 'top50', 'top10', 'c1'].map(token) };
    }
    const { n1, cat } = categorias();
    // Con el cursor sobre un país, los que no comparten su #1 pasan a la versión atenuada de su color
    // (z + 3). Plotly no permite una opacidad distinta por país en un mapa coroplético.
    const elegido = marcado ? n1[marcado] : undefined;
    const z = conDatos.map(cc => CATEGORIAS.indexOf(cat[cc]) + (elegido !== undefined && n1[cc] !== elegido ? 3 : 0));
    const plenos = CATEGORIAS.map(token);
    return { z, colores: [...plenos, ...plenos.map(c => atenuar(c, 0.3))] };
  }

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
      (() => {
        const { z, colores } = relleno(conDatos);
        return { ...base, locations: conDatos.map(iso3), z, zmin: 0, zmax: colores.length - 1,
          colorscale: escalaDiscreta(colores),
          marker: { line: { color: token('plano'), width: 0.6 } } };
      })(),
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
    // Cada evento entrega el país (ISO2, o el territorio sin chart) y el evento del mouse (para ubicar el globo).
    const leer = ev => {
      const iso3 = ev.points[0]?.location;
      return { cc: ISO3_A_CC[iso3] ?? null, territorio: ISO3_A_CC[iso3] ? null : SIN_CHART[iso3] ?? null, raton: ev.event };
    };
    el.on('plotly_hover', ev => {
      const { cc, territorio, raton } = leer(ev);
      if (cc) eventos.alPasar(cc, raton);
      else if (territorio) eventos.alPasarSinChart(territorio, raton);
    });
    el.on('plotly_unhover', () => eventos.alSalir());
    el.on('plotly_click', ev => {          // click (o toque en pantallas táctiles): seguir la canción del país
      const { cc } = leer(ev);
      if (cc) eventos.alElegir(cc);
    });
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
