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
  grano: 'dia',         // dia | semana | mes | anio
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

// Milisegundos por paso al animar el tiempo, según la granularidad.
const MS_POR_PASO = { dia: 90, semana: 300, mes: 650, anio: 1800 };

const CONTINENTES = {
  america: 'América', europa: 'Europa', africa: 'África y Medio Oriente', asia: 'Asia', oceania: 'Oceanía',
};

/** Apple Music no tiene historia: su foto del día se muestra, pero no entra en los conteos ni en la evolución
    (sumarla inflaría la última fecha de 77 a 172 países y sesgaría la comparación entre continentes). */
const esFoto = r => r?.fuente === 'a';

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

/** Países de un ámbito ('global' = todos, o un continente). */
function paisesDelAmbito(ambito) {
  return ambito === 'global' ? PAISES_MAPA : PAISES_MAPA.filter(cc => window.PAISES[cc].continente === ambito);
}

/** Países donde la canción idx es #1 en el período (sin las fotos de Apple Music, que no tienen historia). */
function paisesDondeEsNumero1(idx, grano = Estado.grano, p = Estado.periodo) {
  return paisesConDatos(grano, p).filter(cc => { const r = numero1(cc, grano, p); return r.idx === idx && !esFoto(r); });
}

// ---------- ¿El país escucha lo mismo que el mundo? ----------

/** El país tiene como #1 el mismo #1 del chart global (null si no hay dato). */
function sigueAlGlobal(cc, grano = Estado.grano, p = Estado.periodo) {
  const r = numero1(cc, grano, p);
  if (!r) return null;
  return r.idx === numero1('global', grano, p)?.idx;
}

/** En el ámbito: {n: países que siguen al #1 global, total: países con datos}. */
function cuentaGlobal(ambito, grano = Estado.grano, p = Estado.periodo) {
  let n = 0, total = 0;
  for (const cc of paisesDelAmbito(ambito)) {
    if (esFoto(numero1(cc, grano, p))) continue;        // Apple: sin historia, fuera del conteo
    const s = sigueAlGlobal(cc, grano, p);
    if (s === null) continue;
    total++;
    if (s) n++;
  }
  return { n, total };
}

let _serieContinentes = null;
const MIN_PAISES = 3;          // con menos países el % salta entre 0 y 100 y no dice nada
const VENTANA_SEMANAS = 26;    // promedio móvil centrado de 6 meses: la tendencia, no el ruido de cada semana
/** Evolución del % de países de cada continente (y del mundo) cuyo #1 semanal es el #1 global. */
function serieContinentes() {
  if (_serieContinentes) return _serieContinentes;
  const n = window.PERIODOS.semana.n;
  const ambitos = ['global', ...Object.keys(CONTINENTES)];
  const crudo = Object.fromEntries(ambitos.map(k => [k, []]));
  for (let p = 0; p < n; p++) {
    for (const k of ambitos) {
      const { n: si, total } = cuentaGlobal(k, 'semana', p);
      crudo[k].push(total >= MIN_PAISES ? 100 * si / total : null);
    }
  }
  const serie = { x: Array.from({ length: n }, (_, p) => fechaDePeriodo('semana', p).toISOString().slice(0, 10)) };
  const medio = VENTANA_SEMANAS >> 1;
  for (const k of ambitos) {
    serie[k] = crudo[k].map((v, i) => {
      if (v === null) return null;
      const ventana = crudo[k].slice(Math.max(0, i - medio), i + medio + 1).filter(x => x !== null);
      return ventana.reduce((a, b) => a + b, 0) / ventana.length;
    });
  }
  _serieContinentes = serie;
  return serie;
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
