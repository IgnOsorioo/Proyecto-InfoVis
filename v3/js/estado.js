/* Estado compartido y consultas sobre los datos de la V3.

   Pregunta central: ¿el país escucha lo mismo que el mundo? El mapa pinta los países cuyo #1 nacional es el
   #1 global (chart global de Spotify) en ese momento, desde octubre de 2013.

   Interacción:
   - Sin país fijado: pasar el cursor por un país muestra su #1 y lo hace sonar. El panel resume el mundo
     (o la región elegida).
   - Click en un país lo fija: el panel muestra lo que se escucha ahí y, al avanzar el tiempo, suena el #1 que
     ocupe ese lugar en cada momento. Pasar el cursor por otros países solo muestra un globo, sin cambiar lo
     que suena. Se suelta con ✕, Esc o un nuevo click en el mismo país.
   Siempre suena el #1 de lo que muestra el panel: el país fijado, el país bajo el cursor o el mundo. */

const Estado = {
  grano: 'mes',         // dia | semana | mes | anio (por defecto, meses: el ritmo en que se entiende la historia)
  periodo: 0,           // índice del período dentro de la granularidad
  paisActivo: null,     // país bajo el cursor (código ISO2)
  fijado: null,         // país fijado con un click (código ISO2) o null
  vistaPais: null,      // país que muestra el panel (null = resumen del mundo o de la región)
  cancion: null,        // índice de la canción que muestra el panel (y que suena)
  origen: null,         // país cuyo #1 es la canción del panel ('global' = el mundo)
  ambito: 'global',     // resumen del panel: 'global' o un continente
  mensaje: false,       // el panel muestra un mensaje (país sin datos)
  reproduciendo: false, // animación del tiempo
};

// Milisegundos por paso al animar el tiempo, según la granularidad. Y, cuando cambia la canción que suena, cuánto
// dura como mínimo ese paso: para alcanzar a escuchar cada #1 nuevo (en meses, el #1 global cambia 78 veces en
// 137 meses; a 0,65 s por mes era un desfile de cortes). En días y semanas no se espera: ahí se ve el detalle.
const MS_POR_PASO = { dia: 90, semana: 400, mes: 1000, anio: 2500 };
const MS_MINIMO_CANCION = { dia: 0, semana: 0, mes: 2600, anio: 3500 };

const CONTINENTES = {
  america: 'América', europa: 'Europa', africa: 'África y Medio Oriente', asia: 'Asia', oceania: 'Oceanía',
};

/** Lee un token de color de css/estilo.css. */
function token(nombre) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${nombre}`).trim();
}

// ---------- Canciones ----------
// Índices: < 20.930 catálogo base (datos/canciones.js) · ≥ 1.000.000 YouTube y Apple (datos/extra.js)
// · ≥ 2.000.000 canciones que solo aparecen en la V3 (2013–2016 y catálogo extendido; datos/v3/canciones.js)
const BASE_EXTRA = 1000000;
const BASE_V3 = 2000000;

function urlPortada(portada) {
  if (!portada) return '';
  if (/^https?:/.test(portada)) return portada;
  return portada.startsWith('~') ? window.BASE_PORTADA + portada.slice(1)
                                 : window.BASE_PORTADA + window.PREFIJO_PORTADA + portada;
}

function cancion(idx) {
  if (idx >= BASE_V3) {
    const [id, titulo, artistas, portada, estreno] = window.V3.canciones[idx];
    return { idx, id, titulo, artistas, estreno, portada: urlPortada(portada), deezer: 0 };
  }
  if (idx >= BASE_EXTRA) {
    const [titulo, artistas, portada, fuente] = window.EXTRA.canciones[idx - BASE_EXTRA];   // fuente: 'YouTube Music' | 'Apple Music'
    return { idx, id: '', titulo, artistas, estreno: '', portada, deezer: 0, fuente };
  }
  const [id, titulo, artistas, portada, estreno] = window.CANCIONES[idx];
  return { idx, id, titulo, artistas, estreno, portada: urlPortada(portada), deezer: window.DEEZER[idx] || 0 };
}

// ---------- Períodos ↔ fechas ----------

const _base = grano => new Date(window.PERIODOS[grano].base + 'T00:00:00Z');
const DIA_MS = 86400000;

function fechaDePeriodo(grano, p) {
  const f = _base(grano);
  if (grano === 'dia') f.setUTCDate(f.getUTCDate() + p);
  else if (grano === 'semana') f.setUTCDate(f.getUTCDate() + 7 * p);
  else if (grano === 'mes') f.setUTCMonth(f.getUTCMonth() + p);
  else f.setUTCFullYear(f.getUTCFullYear() + p);
  return f;
}

function periodoDeFecha(grano, fecha) {
  const b = _base(grano);
  let p;
  if (grano === 'dia') p = Math.floor((fecha - b) / DIA_MS);
  else if (grano === 'semana') p = Math.floor((fecha - b) / (7 * DIA_MS));
  else if (grano === 'mes') p = (fecha.getUTCFullYear() - b.getUTCFullYear()) * 12 + fecha.getUTCMonth() - b.getUTCMonth();
  else p = fecha.getUTCFullYear() - b.getUTCFullYear();
  return Math.max(0, Math.min(p, window.PERIODOS[grano].n - 1));
}

/** Último día cubierto por el período actual (para acumular datos "hasta la fecha"). */
function finDelPeriodo(grano = Estado.grano, p = Estado.periodo) {
  if (p >= window.PERIODOS[grano].n - 1) return new Date(window.FECHA_MAX + 'T00:00:00Z');
  const f = fechaDePeriodo(grano, p + 1);
  f.setUTCDate(f.getUTCDate() - 1);
  return f;
}

const _fmt = opciones => new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', ...opciones });
const _fmtDia = _fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const _fmtMes = _fmt({ month: 'long', year: 'numeric' });
const _fmtMesCorto = _fmt({ month: 'short', year: 'numeric' });

function textoFecha(fecha) {
  return _fmtDia.format(fecha);
}

function textoPeriodo(grano, p) {
  const f = fechaDePeriodo(grano, p);
  if (grano === 'dia') return _fmtDia.format(f);
  if (grano === 'semana') return `Semana del ${_fmtDia.format(f)}`;
  if (grano === 'mes') return _fmtMes.format(f);
  const anio = f.getUTCFullYear();
  return anio === Number(window.FECHA_MAX.slice(0, 4)) ? `${anio} (hasta ${_fmtDia.format(new Date(window.FECHA_MAX + 'T00:00:00Z'))})` : String(anio);
}

/** Versión compacta para la línea de tiempo del reproductor: "27 sept 2026", "sem. 21 sept 2026", "sept 2026", "2026". */
function textoPeriodoCorto(grano, p) {
  const f = fechaDePeriodo(grano, p);
  if (grano === 'dia') return _fmtDia.format(f);
  if (grano === 'semana') return `sem. ${_fmtDia.format(f)}`;
  if (grano === 'mes') return _fmtMesCorto.format(f);
  return String(f.getUTCFullYear());
}

const _fmtCompacto = new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 });
const _fmtMillones = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
/** "202 M", "45,3 mil"; sobre mil millones en millones con separador de miles ("2.050 M"), no "2049,6 M". */
function textoCantidad(n) {
  return n >= 1e9 ? `${_fmtMillones.format(n / 1e6)} M` : _fmtCompacto.format(n);
}

// ---------- #1 de un país en un período ----------

/** {idx, ini, fin, fuente} del tramo vigente, o null si el país no tiene dato en ese período.
    Tramos: [periodo_inicio, idx, fuente]; idx null marca que el chart se cortó (p. ej., Spotify en Rusia). */
function numero1(cc, grano = Estado.grano, p = Estado.periodo) {
  const tramos = window.NUMERO1[grano][cc];
  if (!tramos || p < tramos[0][0]) return null;
  let lo = 0, hi = tramos.length - 1;
  while (lo < hi) {                       // búsqueda binaria del último tramo que empieza en o antes de p
    const mid = (lo + hi + 1) >> 1;
    if (tramos[mid][0] <= p) lo = mid; else hi = mid - 1;
  }
  const [ini, idx, fuente] = tramos[lo];
  if (idx === null) return null;
  const fin = lo + 1 < tramos.length ? tramos[lo + 1][0] - 1 : window.PERIODOS[grano].n - 1;
  return { idx, ini, fin, fuente };
}

function nombrePais(cc) {
  return cc === 'global' ? 'el mundo' : window.PAISES[cc]?.nombre ?? cc.toUpperCase();
}

function nombreAmbito(ambito) {
  return ambito === 'global' ? 'el mundo' : CONTINENTES[ambito] ?? nombrePais(ambito);
}

const PAISES_MAPA = Object.keys(window.PAISES).filter(cc => cc !== 'global');

/** Países (sin 'global') con datos en el período. */
function paisesConDatos(grano = Estado.grano, p = Estado.periodo) {
  return PAISES_MAPA.filter(cc => numero1(cc, grano, p));
}


// ---------- ¿El país escucha lo mismo que el mundo? ----------

/** El país tiene como #1 el mismo #1 del chart global (null si no hay dato). */
function sigueAlGlobal(cc, grano = Estado.grano, p = Estado.periodo) {
  const r = numero1(cc, grano, p);
  if (!r) return null;
  return r.idx === numero1('global', grano, p)?.idx;
}

// ---------- Muestra fija: la base de toda la tendencia ----------
// Los 52 países con #1 en todos los días, del 1-may-2015 al último (datos/v3/muestra.js, de
// scripts/11_base_fija_v3.py). Titular, barras, eje de tiempo, diversidad y aplausos cuentan siempre sobre
// ellos: así una cifra no cambia porque se sumen países con el tiempo. Los demás países se ven en el mapa desde
// que tienen datos, pero no entran en la cuenta.

/** Países de la muestra en el ámbito ('global' = toda la muestra, o un continente). */
function muestraDe(ambito) {
  return ambito === 'global' ? Object.values(window.MUESTRA).flat() : window.MUESTRA[ambito] ?? [];
}

const MIN_MUESTRA = 3;          // con menos países en la muestra (África tiene 1, Oceanía 2) un continente no se mide

/** El ámbito en que se cuenta: el continente elegido si tiene al menos MIN_MUESTRA países en la muestra; si no,
    el mundo (contar "0 de 1 país de África" no dice nada del continente). */
function ambitoMedible(ambito) {
  return ambito !== 'global' && muestraDe(ambito).length < MIN_MUESTRA ? 'global' : ambito;
}

/** En el ámbito: {n: países de la muestra que escuchan el #1 global, total: países de la muestra}. */
function cuentaGlobal(ambito, grano = Estado.grano, p = Estado.periodo) {
  const paises = muestraDe(ambito);
  return { n: paises.filter(cc => sigueAlGlobal(cc, grano, p)).length, total: paises.length };
}

const _series = {};
/** % de la muestra que escucha el #1 global en cada período de la granularidad (el eje de tiempo). Sin
    promedios: el valor bajo el cursor es el mismo del titular del panel. */
function serieMuestra(grano = Estado.grano) {
  if (!_series[grano]) {
    const n = window.PERIODOS[grano].n;
    _series[grano] = Array.from({ length: n }, (_, p) => {
      const { n: si, total } = cuentaGlobal('global', grano, p);
      return 100 * si / total;
    });
  }
  return _series[grano];
}

// ---------- Hitos: cuándo llega (o se va) Spotify ----------
// Explican los vacíos del mapa: dónde no sabemos qué se escucha y por qué. Marcas en el eje de tiempo y paradas
// del recorrido. corto: lo que se ve al pasar el cursor por la marca; largo: el texto del recorrido.
const HITOS = [
  { fecha: '2018-03-13', region: 'africa', corto: 'Spotify llega a Sudáfrica',
    largo: 'Marzo de 2018: Spotify llega a Sudáfrica, su primer país africano.' },
  { fecha: '2018-11-13', region: 'africa', corto: 'Llega a Medio Oriente',
    largo: 'Noviembre de 2018: llega a Medio Oriente y el norte de África.' },
  { fecha: '2019-02-26', region: 'asia', corto: 'Llega a India',
    largo: 'Febrero de 2019: llega a India.' },
  { fecha: '2020-07-15', region: 'europa', corto: 'Llega a Rusia',
    largo: 'Julio de 2020: llega a Rusia.' },
  { fecha: '2021-02-23', region: 'africa', corto: 'Llega a 85 países más',
    largo: 'Febrero de 2021: llega a 85 países más, casi la mitad en África. Pero ahí no publica sus charts.' },
  { fecha: '2022-04-11', region: 'europa', corto: 'Spotify deja Rusia',
    largo: 'Abril de 2022: Spotify deja Rusia tras la ley que censura la información sobre la guerra. Su música sigue en YouTube.' },
];

// ---------- Carga bajo demanda (con <script>, funciona también abriendo index.html sin servidor) ----------

function cargadorScript(nombreGlobal, ruta) {
  const cache = new Map();
  const pendientes = new Map();
  window[nombreGlobal] = (clave, datos) => {
    cache.set(String(clave), datos);
    pendientes.get(String(clave))?.forEach(r => r(datos));
    pendientes.delete(String(clave));
  };
  return clave => {
    clave = String(clave);
    if (cache.has(clave)) return Promise.resolve(cache.get(clave));
    return new Promise((resolve, reject) => {
      if (pendientes.has(clave)) { pendientes.get(clave).push(resolve); return; }
      pendientes.set(clave, [resolve]);
      const s = document.createElement('script');
      s.src = ruta(clave);
      s.onload = () => s.remove();
      s.onerror = () => { s.remove(); pendientes.delete(clave); reject(new Error(`No se pudo cargar ${s.src}`)); };
      document.head.appendChild(s);
    });
  };
}

// La carpeta de datos se deduce del <script> de canciones.js: la app funciona igual en /v1/, /v2/… o en la raíz.
const _SRC_CANCIONES = document.querySelector('script[src*="datos/canciones.js"]')?.src ?? 'datos/canciones.js';
const BASE_DATOS = _SRC_CANCIONES.replace(/canciones\.js.*$/, '');
const VERSION_DATOS = _SRC_CANCIONES.split('?v=')[1] ?? '';

// ---------- Popularidad semanal (para el gráfico del panel) ----------

const SEMANA_BASE_MS = Date.UTC(2016, 11, 26);          // lunes de la semana 0 de la popularidad (antes de 2017: negativa)
const semanaDe = fecha => Math.floor((fecha - SEMANA_BASE_MS) / (7 * DIA_MS));
const fechaDeSemana = s => new Date(SEMANA_BASE_MS + s * 7 * DIA_MS);
const FRAGMENTOS = 256;
const _pedirPopularidad = cargadorScript('cargarPopularidadTodas',
  n => `${BASE_DATOS}popularidad_todas/${n.padStart(3, '0')}.js?v=${VERSION_DATOS}`);

/** Reproducciones semanales (miles) de la canción: {inicio: índice de semana, valores: [...]}, o null.
    Spotify desde 2017 (popularidad_todas), antes de 2017 de los charts semanales (V3); YouTube: vistas. */
async function pedirPopularidad(idx) {
  const serie = d => (d ? { inicio: d[0], valores: d[1] } : null);
  if (idx >= BASE_V3) return serie(window.V3.popularidad[idx]);
  if (idx >= BASE_EXTRA) return serie(window.EXTRA.popularidad[idx]);
  const desde2017 = serie((await _pedirPopularidad(String(idx % FRAGMENTOS)))[idx]);
  const previa = serie(window.V3.previa[idx]);
  if (!previa) return desde2017;
  if (!desde2017) return previa;
  const hueco = Array(Math.max(0, desde2017.inicio - (previa.inicio + previa.valores.length))).fill(0);
  return { inicio: previa.inicio, valores: [...previa.valores, ...hueco, ...desde2017.valores] };
}

// ---------- Alcance mundial de cada canción (scripts/13_alcance_v3.py) ----------
// Semana a semana, en cuántos países de la muestra está en el top 50. Misma escala para toda canción y fecha.

const _pedirAlcance = cargadorScript('cargarAlcance', n => `${BASE_DATOS}v3/alcance/${n.padStart(2, '0')}.js?v=${VERSION_DATOS}`);

/** {inicio: semana (como semanaDe), valores: [países, …]}, o null si la canción no está en la muestra. */
async function pedirAlcance(idx) {
  const d = (await _pedirAlcance(String(idx % 32)))[idx];
  return d ? { inicio: d[0], valores: d[1] } : null;
}

/** Países de la muestra con la canción en su top 50 en la semana s (0 si no está). */
function alcanceEn(alcance, s) {
  if (!alcance) return 0;
  return alcance.valores[s - alcance.inicio] ?? 0;
}

// ---------- Top 3 de cada país (recuadro junto al cursor; scripts/10_top3_v3.py) ----------

const _top3 = new Map();
const _pedirTop3 = cargadorScript('cargarTop3', cc => `${BASE_DATOS}v3/top3/${cc}.js?v=${VERSION_DATOS}`);

/** Pide (una vez) el top 3 del país; la promesa se cumple cuando ya se puede leer con top3(). */
function pedirTop3(cc) {
  if (_top3.has(cc)) return Promise.resolve();
  return _pedirTop3(cc).then(d => { _top3.set(cc, d); });
}

/** [[título, artistas] × hasta 3] del país en el período; null sin datos; undefined si aún no se cargó. */
function top3(cc, grano = Estado.grano, p = Estado.periodo) {
  const d = _top3.get(cc);
  if (!d) return undefined;
  const tramos = d[grano];
  if (!tramos?.length || p < tramos[0][0]) return null;
  let lo = 0, hi = tramos.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tramos[mid][0] <= p) lo = mid; else hi = mid - 1;
  }
  const [, ...indices] = tramos[lo];
  return indices.length ? indices.map(i => d.c[i]) : null;
}

const CONFIG_PLOTLY = { displayModeBar: false, responsive: true, locale: 'es' };
