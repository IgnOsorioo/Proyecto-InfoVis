/* Mapa mundial en 2D (proyección Natural Earth). Responde a una pregunta: ¿el país escucha lo mismo que el mundo?
   - verde: su #1 nacional es el #1 global en ese momento;
   - gris: su #1 es otra canción;
   - vacío (solo contorno): sin datos (ninguna fuente tiene su chart en esa fecha).
   Con el cursor sobre un país, se atenúan los que no comparten su #1 (dónde más suena esa canción).
   El país fijado lleva un contorno blanco permanente; el que está bajo el cursor, uno más fino.
   El mapa "se enciende": al avanzar el tiempo, el país que empieza a tener datos (llega Spotify, o su chart
   empieza a publicarse) destella un momento con un contorno que se apaga. Así la llegada se ve sin texto.
   Geometría: Natural Earth 1:50m (datos/mundo.js), con los territorios de ultramar separados de su país.
   Trazas: 0 sin datos · 1 países con datos · 2 contorno del país fijado y del país bajo el cursor ·
   3 destello de los recién llegados. */

const Mapa = (() => {
  const EL = 'mapa';
  const ISO3_A_CC = Object.fromEntries(
    Object.entries(window.PAISES).filter(([cc]) => cc !== 'global').map(([cc, p]) => [p.iso3, cc]));
  // Países y territorios del mapa sin chart de Spotify: iso3 → {nombre, nota?}
  const SIN_CHART = Object.fromEntries(window.MUNDO.features
    .filter(f => !ISO3_A_CC[f.properties.iso3])
    .map(f => [f.properties.iso3, f.properties]));
  // Recuadro (longitud, latitud) que debe verse completo con cada botón de región. El mapa se centra en el
  // recuadro y se acerca hasta que quepa entero; alrededor se siguen viendo los otros continentes (no se recorta
  // el mapa al recuadro, que dejaba bordes rectos cortando países).
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
  let marcado = null;                  // país bajo el cursor (contorno claro); el fijado está en Estado.fijado
  let eventos = { alPasar: () => {}, alPasarSinChart: () => {}, alSalir: () => {}, alElegir: () => {} };
  let eventosConectados = false;
  const DESTELLO_MS = 1600;
  const MAX_LLEGADAS = 8;              // si llegan más de una vez (un salto grande en el tiempo) no es una llegada
  let anterior = null;                 // {grano, periodo, conDatos: Set} de lo último dibujado
  const llegadas = new Map();          // país → instante (performance.now()) en que empezó a tener datos
  let timerDestello = null;

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

  /** z (0 = sigue al #1 global, 1 = otra canción; +2 atenuado) de cada país con datos y la lista de colores. */
  function relleno(conDatos) {
    const global = numero1('global')?.idx;
    // Con el cursor sobre un país (o con uno fijado), los que no comparten su #1 pasan a la versión atenuada de
    // su color. Plotly no permite una opacidad distinta por país en un mapa coroplético.
    const referencia = Estado.fijado ?? marcado;           // con un país fijado, el cursor no cambia el mapa
    const elegido = referencia ? numero1(referencia)?.idx : undefined;
    const z = conDatos.map(cc => {
      const r = numero1(cc);
      return (r.idx === global ? 0 : 1) + (elegido !== undefined && r.idx !== elegido ? 2 : 0);
    });
    const plenos = [token('global'), token('otra')];
    return { z, colores: [...plenos, ...plenos.map(c => atenuar(c, 0.35))] };
  }

  /** Registra los países que empiezan a tener datos al avanzar el tiempo (no al saltar ni al retroceder). */
  function registrarLlegadas(conDatos) {
    const ahora = performance.now();
    if (anterior && anterior.grano === Estado.grano && Estado.periodo > anterior.periodo) {
      const nuevos = conDatos.filter(cc => !anterior.conDatos.has(cc));
      if (nuevos.length <= MAX_LLEGADAS) nuevos.forEach(cc => llegadas.set(cc, ahora));
    }
    if (!anterior || anterior.grano !== Estado.grano || anterior.periodo !== Estado.periodo) {
      anterior = { grano: Estado.grano, periodo: Estado.periodo, conDatos: new Set(conDatos) };
    }
    for (const [cc, t] of llegadas) if (ahora - t > DESTELLO_MS) llegadas.delete(cc);
    // Mientras haya destellos, se redibuja para que el contorno se apague de a poco.
    if (llegadas.size && !timerDestello) timerDestello = setTimeout(() => { timerDestello = null; dibujar(); }, 80);
    return [...llegadas].map(([cc, t]) => [cc, 1 - (ahora - t) / DESTELLO_MS]);
  }

  function trazas() {
    const conDatos = paisesConDatos();
    const destellos = registrarLlegadas(conDatos);
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
    const contornos = [...new Set([Estado.fijado, marcado])].filter(cc => cc && window.PAISES[cc]);
    return [
      { ...base, locations: sinDatos, z: sinDatos.map(() => 0), colorscale: plano(token('vacio')),
        marker: { line: { color: token('contorno-vacio'), width: 0.6 } } },
      (() => {
        const { z, colores } = relleno(conDatos);
        return { ...base, locations: conDatos.map(iso3), z, zmin: 0, zmax: colores.length - 1,
          colorscale: escalaDiscreta(colores),
          marker: { line: { color: token('plano'), width: 0.6 } } };
      })(),
      { ...base, locations: contornos.map(iso3), z: contornos.map(() => 0), colorscale: plano('rgba(0,0,0,0)'),
        marker: { line: { color: token('resalte'), width: contornos.map(cc => (cc === Estado.fijado ? 2.6 : 1.4)) } },
        hoverinfo: 'skip' },
      { ...base, locations: destellos.map(([cc]) => iso3(cc)), z: destellos.map(() => 0), colorscale: plano('rgba(0,0,0,0)'),
        marker: { line: { color: token('global'), width: destellos.map(([, k]) => 0.5 + 3.5 * k) } },
        hoverinfo: 'skip' },
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
        lonaxis: { range: REGIONES.mundo.lon },
        // El mundo sin la Antártida. En una región, todas las latitudes: así el área del mapa ocupa todo el alto
        // disponible (con el rango del mundo quedaba una franja vacía arriba y abajo).
        lataxis: { range: region === 'mundo' ? REGIONES.mundo.lat : [-90, 90] },
        center: centro(region),
        showframe: false, showocean: false, showland: false, showcountries: false, showcoastlines: false, showlakes: false,
        bgcolor: 'rgba(0,0,0,0)',
      },
    };
  }

  // Un solo dibujo a la vez. Plotly.react es asíncrono: dos dibujos superpuestos (cursor, fecha y encuadre al
  // mismo tiempo) dejaban la proyección del dibujo distinta de la que usa el cursor, y el encuadre medía una
  // proyección vieja y achicaba la escala una y otra vez (el mapa quedaba diminuto y el cursor marcaba otro país).
  let cola = Promise.resolve();
  let enEspera = null;

  /** Redibuja (al cambiar de fecha, de canción seleccionada o de país bajo el cursor). Los pedidos que llegan
      mientras se dibuja se juntan en uno solo, que usa el estado más reciente. */
  function dibujar() {
    if (enEspera) return enEspera;
    enEspera = cola.then(() => {
      enEspera = null;
      const listo = Plotly.react(EL, trazas(), layout(), { ...CONFIG_PLOTLY, scrollZoom: true });
      if (!eventosConectados) conectarEventos();
      return listo;
    });
    cola = enEspera.catch(() => {});
    return enEspera;
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
    el.on('plotly_unhover', ev => eventos.alSalir(ev?.event));   // el evento del mouse (no hay si vino de un redibujo)
    el.on('plotly_click', ev => {          // click (o toque en pantallas táctiles): seguir la canción del país
      const { cc } = leer(ev);
      if (cc) eventos.alElegir(cc);
    });
  }

  /** Centro del recuadro de la región (el del mundo: el ecuador en el meridiano 0, desplazado al centro de las
      latitudes visibles). */
  function centro(nombre) {
    const { lon: [lon0, lon1], lat: [lat0, lat1] } = REGIONES[nombre];
    return { lon: (lon0 + lon1) / 2, lat: (lat0 + lat1) / 2 };
  }

  /** Acerca el mapa a una región ('mundo', 'america', 'europa', 'africa', 'asia', 'oceania'). */
  function enfocar(nueva) {
    region = nueva;
    escala = 1;
    enfoques++;
    dibujar().then(asegurarRegionCompleta);
  }

  /** Encuadre de la región: se mide dónde cae en pantalla el borde de su recuadro (en esta proyección los bordes
      son curvos) y se ajusta el zoom para que quepa completo y lo más grande posible. En el mundo solo se aleja
      (si el recuadro no cabe); en una región también se acerca. */
  function asegurarRegionCompleta() {
    const gd = document.getElementById(EL);
    const sub = gd._fullLayout?.geo?._subplot;
    if (typeof sub?.projection !== 'function') return;
    // Si lo dibujado no tiene la escala vigente, otro encuadre ya la cambió y medirá él: medir aquí la
    // multiplicaría dos veces.
    if (Math.abs(gd._fullLayout.geo.projection.scale - escala) > 1e-9) return;
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
    if (factor < 0.999 || (region !== 'mundo' && factor > 1.001)) {
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
