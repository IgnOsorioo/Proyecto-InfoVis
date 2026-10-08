/* Estado compartido y consultas sobre los datos. */

/* Dos modos:
   - explorar (al entrar): el mapa pinta el #1 de cada país como mundial, compartido o propio, y el panel
     resume el mundo. Pasar el cursor por un país muestra su #1 en el panel y lo hace sonar.
   - seguir: se fijó una canción (click en un país, en el top 5 o en el buscador). El mapa pinta su puesto en
     cada país y los aplausos siguen su popularidad en el tiempo. Pasar el cursor ya no cambia la canción. */
const Estado = {
  modo: 'explorar',     // explorar | seguir
  grano: 'dia',         // dia | semana | mes | anio
  periodo: 0,           // índice del período dentro de la granularidad
  paisActivo: null,     // país bajo el cursor (código ISO2)
  vistaPais: null,      // explorar: país que muestra el panel (null = resumen del mundo o de la región)
  cancion: null,        // índice de la canción que muestra el panel (y que suena)
  origen: null,         // país desde el que se eligió la canción (su #1), o null
  ambito: 'global',     // top 5 y resumen del panel: 'global', un continente o un país
  mensaje: false,       // el cursor está sobre un país sin datos: el panel muestra solo un mensaje
  puestos: null,        // seguir: mejor puesto de la canción en cada país en el período (0 = fuera del chart)
  reproduciendo: false, // animación del tiempo
};

// Milisegundos por paso al animar el tiempo, según la granularidad.
const MS_POR_PASO = { dia: 90, semana: 350, mes: 700, anio: 1800 };

const CONTINENTES = {
  america: 'América', europa: 'Europa', africa: 'África y Medio Oriente', asia: 'Asia', oceania: 'Oceanía',
};

/** Lee un token de color de css/estilo.css. */
function token(nombre) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${nombre}`).trim();
}

// ---------- Canciones ----------

function urlPortada(portada) {
  if (!portada) return '';
  return portada.startsWith('~') ? window.BASE_PORTADA + portada.slice(1)
                                 : window.BASE_PORTADA + window.PREFIJO_PORTADA + portada;
}

/** Datos de una canción. Las del catálogo base (#1 o top 5) están siempre cargadas; las demás (buscador)
    necesitan antes `asegurarCancion(idx)`. */
function cancion(idx) {
  if (idx < window.CANCIONES.length) {
    const [id, titulo, artistas, portada, estreno] = window.CANCIONES[idx];
    return { idx, id, titulo, artistas, estreno, portada: urlPortada(portada), deezer: window.DEEZER[idx] || 0 };
  }
  const [id, portada, estreno] = _metaExtra.get(idx) ?? ['', '', ''];
  return { idx, id, titulo: _buscar?.t[idx] ?? '', artistas: _buscar?.a[idx] ?? '', estreno, portada: urlPortada(portada), deezer: 0 };
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

/** Devuelve {idx, ini, fin} del tramo en que la canción idx fue #1, o null si el país no tenía chart. */
function numero1(cc, grano = Estado.grano, p = Estado.periodo) {
  const tramos = window.NUMERO1[grano][cc];
  if (!tramos || p < tramos[0][0]) return null;
  let lo = 0, hi = tramos.length - 1;
  while (lo < hi) {                       // búsqueda binaria del último tramo que empieza en o antes de p
    const mid = (lo + hi + 1) >> 1;
    if (tramos[mid][0] <= p) lo = mid; else hi = mid - 1;
  }
  const fin = lo + 1 < tramos.length ? tramos[lo + 1][0] - 1 : window.PERIODOS[grano].n - 1;
  return { idx: tramos[lo][1], ini: tramos[lo][0], fin };
}

const RACHA = {
  dia:    { primero: 'llegó al #1 este día',            varios: 'días seguidos' },
  semana: { primero: 'la más escuchada de esta semana', varios: 'semanas seguidas' },
  mes:    { primero: 'la más escuchada de este mes',    varios: 'meses seguidos' },
  anio:   { primero: 'la más escuchada de este año',    varios: 'años seguidos' },
};

/** "lleva 12 días seguidos" (cuenta hasta el período actual). */
function textoRacha(r, grano = Estado.grano, p = Estado.periodo) {
  const n = p - r.ini + 1;
  if (n === 1) return RACHA[grano].primero;
  const desdeInicio = r.ini === 0 ? 'al menos ' : '';   // el dataset empieza en 2017: la racha pudo empezar antes
  return `lleva ${desdeInicio}${n} ${RACHA[grano].varios}`;
}

function nombrePais(cc) {
  return window.PAISES[cc]?.nombre ?? cc.toUpperCase();
}

function nombreAmbito(ambito) {
  if (ambito === 'global') return 'el mundo';
  return CONTINENTES[ambito] ?? nombrePais(ambito);
}

const PAISES_MAPA = Object.keys(window.PAISES).filter(cc => cc !== 'global');

/** Países (sin 'global') con datos en el período actual. */
function paisesConDatos(grano = Estado.grano, p = Estado.periodo) {
  return PAISES_MAPA.filter(cc => numero1(cc, grano, p));
}

/** Países de un ámbito ('global' = todos, o un continente). */
function paisesDelAmbito(ambito) {
  return ambito === 'global' ? PAISES_MAPA : PAISES_MAPA.filter(cc => window.PAISES[cc].continente === ambito);
}

// ---------- ¿Qué tan local es el #1 de cada país? ----------

const CATEGORIAS = ['mundial', 'compartido', 'propio'];

/** #1 de cada país con datos y su categoría:
    'mundial' = es el mismo #1 del chart global; 'compartido' = también es #1 en otro país; 'propio' = solo ahí. */
function categorias(grano = Estado.grano, p = Estado.periodo) {
  const global = numero1('global', grano, p)?.idx;
  const n1 = {}, veces = new Map(), cat = {};
  for (const cc of PAISES_MAPA) {
    const r = numero1(cc, grano, p);
    if (!r) continue;
    n1[cc] = r.idx;
    veces.set(r.idx, (veces.get(r.idx) ?? 0) + 1);
  }
  for (const [cc, idx] of Object.entries(n1)) cat[cc] = idx === global ? 'mundial' : veces.get(idx) > 1 ? 'compartido' : 'propio';
  return { n1, cat };
}

const _series = new Map();
/** Evolución mensual desde 2017: % de países del ámbito cuyo #1 diario es mundial, compartido o propio
    (promedio de los días del mes). Se calcula una vez por ámbito. */
function serieCategorias(ambito) {
  if (_series.has(ambito)) return _series.get(ambito);
  const paises = new Set(paisesDelAmbito(ambito));
  const meses = new Map();                              // 'AAAA-MM-01' → {dias, mundial, compartido, propio}
  for (let d = 0; d < window.PERIODOS.dia.n; d++) {
    const { cat } = categorias('dia', d);
    let total = 0;
    const n = { mundial: 0, compartido: 0, propio: 0 };
    for (const [cc, k] of Object.entries(cat)) if (paises.has(cc)) { n[k]++; total++; }
    if (!total) continue;
    const mes = fechaDePeriodo('dia', d).toISOString().slice(0, 8) + '01';
    const m = meses.get(mes) ?? { dias: 0, mundial: 0, compartido: 0, propio: 0 };
    m.dias++;
    for (const k of CATEGORIAS) m[k] += 100 * n[k] / total;
    meses.set(mes, m);
  }
  const serie = { x: [...meses.keys()] };
  for (const k of CATEGORIAS) serie[k] = [...meses.values()].map(m => m[k] / m.dias);
  _series.set(ambito, serie);
  return serie;
}

// ---------- Seguir una canción: su puesto en cada país ----------

const SEMANA_BASE_MS = Date.UTC(2016, 11, 26);          // lunes de la semana 0 (igual que el pipeline)
const semanaDe = fecha => Math.floor((fecha - SEMANA_BASE_MS) / (7 * DIA_MS));
const fechaDeSemana = s => new Date(SEMANA_BASE_MS + s * 7 * DIA_MS);

/** Mejor puesto de la canción en el país durante el período (con datos semanales), o 0 si no estuvo en el Top 200. */
function puestoEnPeriodo(ranking, cc, grano = Estado.grano, p = Estado.periodo) {
  const d = ranking?.[cc];
  if (!d) return 0;
  const [inicio, puestos] = d;
  const s0 = Math.max(semanaDe(fechaDePeriodo(grano, p)), inicio);
  const s1 = Math.min(semanaDe(finDelPeriodo(grano, p)), inicio + puestos.length - 1);
  let mejor = 0;
  for (let s = s0; s <= s1; s++) {
    const r = puestos[s - inicio];
    if (r && (!mejor || r < mejor)) mejor = r;
  }
  return mejor;
}

/** Nivel de color en el mapa al seguir una canción: 4 = #1 · 3 = top 10 · 2 = top 50 · 1 = top 200 · 0 = fuera.
    El #1 sale del mismo dato que "Es #1 en" (el #1 del período); el resto, del mejor puesto semanal. */
function nivelPuesto(cc) {
  if (numero1(cc)?.idx === Estado.cancion) return 4;
  const r = Estado.puestos?.[cc] ?? 0;
  if (!r) return 0;
  return r <= 10 ? 3 : r <= 50 ? 2 : 1;
}

/** Reproducciones semanales de la canción en el período (promedio de sus semanas), en streams. */
function streamsEnPeriodo(popularidad, grano = Estado.grano, p = Estado.periodo) {
  if (!popularidad) return 0;
  const s0 = semanaDe(fechaDePeriodo(grano, p)), s1 = semanaDe(finDelPeriodo(grano, p));
  let suma = 0;
  for (let s = s0; s <= s1; s++) suma += popularidad.valores[s - popularidad.inicio] ?? 0;
  return 1000 * suma / (s1 - s0 + 1);
}

/** Países donde la canción idx es #1 en el período actual. */
function paisesDondeEsNumero1(idx) {
  return paisesConDatos().filter(cc => numero1(cc).idx === idx);
}

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
const pedirTop5 = cargadorScript('cargarTop5', clave => `${BASE_DATOS}top5/${clave}.js?v=${VERSION_DATOS}`);
// Catálogo completo (V2): las 250.790 canciones que alguna vez entraron al Top 200 de un país, repartidas en
// 256 archivos por índice (scripts/06_catalogo_completo.py). Los índices del catálogo base no cambian.
const FRAGMENTOS = 256;
const _fragmento = (carpeta, n) => `${BASE_DATOS}${carpeta}/${n.padStart(3, '0')}.js?v=${VERSION_DATOS}`;
const _pedirPopularidad = cargadorScript('cargarPopularidadTodas', n => _fragmento('popularidad_todas', n));
const _pedirRanking = cargadorScript('cargarRanking', n => _fragmento('ranking', n));
const _pedirMeta = cargadorScript('cargarMeta', n => _fragmento('catalogo/meta', n));
const _pedirBuscar = cargadorScript('cargarBuscar', () => `${BASE_DATOS}catalogo/buscar.js?v=${VERSION_DATOS}`);
const _metaExtra = new Map();
let _buscar = null;

/** Reproducciones semanales (en miles) de la canción: {inicio: índice de semana, valores: [...]}, o null. */
async function pedirPopularidad(idx) {
  const d = (await _pedirPopularidad(String(idx % FRAGMENTOS)))[idx];
  return d ? { inicio: d[0], valores: d[1] } : null;
}

/** Puestos semanales de la canción por país: {cc: [semana_inicio, [puestos...]]} (0 = fuera del Top 200). */
async function pedirRanking(idx) {
  return (await _pedirRanking(String(idx % FRAGMENTOS)))[idx] ?? {};
}

/** Índice del buscador: {t: títulos, a: artistas, e: éxito 0–99}, en el orden del catálogo (~4,7 MB comprimido). */
async function pedirBuscador() {
  _buscar ??= await _pedirBuscar('todo');
  return _buscar;
}

/** Carga los datos de una canción fuera del catálogo base (título y artistas del buscador; portada y estreno). */
async function asegurarCancion(idx) {
  if (idx < window.CANCIONES.length || _metaExtra.has(idx)) return;
  const [frag] = await Promise.all([_pedirMeta(String(idx % FRAGMENTOS)), pedirBuscador()]);
  _metaExtra.set(idx, frag[idx] ?? ['', '', '']);
}

const CONFIG_PLOTLY = { displayModeBar: false, responsive: true, locale: 'es' };
