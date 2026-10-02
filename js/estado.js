/* Estado compartido y consultas sobre los datos. */

const Estado = {
  grano: 'dia',         // dia | semana | mes | anio
  periodo: 0,           // índice del período dentro de la granularidad
  paisActivo: null,     // país bajo el cursor (código ISO2)
  cancion: null,        // índice de la canción seleccionada (la que suena y muestra el panel)
  origen: null,         // país desde el que se eligió la canción (su #1), o null si vino del top 5
  ambito: 'global',     // top 5 del panel: 'global', un continente o un país
  mensaje: false,       // el cursor está sobre un país sin datos: el panel muestra solo un mensaje
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

function cancion(idx) {
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
function textoCantidad(n) {
  return _fmtCompacto.format(n);
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

/** Países (sin 'global') con datos en el período actual. */
function paisesConDatos() {
  return Object.keys(window.PAISES).filter(cc => cc !== 'global' && numero1(cc));
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

const VERSION_DATOS = document.querySelector('script[src*="datos/canciones.js"]')?.src.split('?v=')[1] ?? '';
const pedirTop5 = cargadorScript('cargarTop5', clave => `datos/top5/${clave}.js?v=${VERSION_DATOS}`);
const _pedirFragmento = cargadorScript('cargarPopularidad', n => `datos/popularidad/${n.padStart(2, '0')}.js?v=${VERSION_DATOS}`);

/** Reproducciones semanales (en miles) de la canción: {inicio: índice de semana, valores: [...]}, o null. */
async function pedirPopularidad(idx) {
  const frag = await _pedirFragmento(String(idx % 64));
  const d = frag[idx];
  return d ? { inicio: d[0], valores: d[1] } : null;
}

const CONFIG_PLOTLY = { displayModeBar: false, responsive: true, locale: 'es' };
