/* Estado compartido y consultas sobre los datos. */

const Estado = {
  grano: 'dia',         // dia | semana | mes | anio
  periodo: 0,           // índice del período dentro de la granularidad
  paisActivo: null,     // país bajo el cursor (código ISO2)
  reproduciendo: false, // animación del tiempo
};

// Milisegundos por paso al animar el tiempo, según la granularidad.
const MS_POR_PASO = { dia: 90, semana: 350, mes: 700, anio: 1800 };

/** Lee un token de color de css/estilo.css (cambia con el modo claro/oscuro). */
function token(nombre) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${nombre}`).trim();
}

// ---------- Canciones ----------

function cancion(idx) {
  const [id, titulo, artistas, portada] = window.CANCIONES[idx];
  return {
    idx, id, titulo, artistas,
    portada: portada ? window.PREFIJO_PORTADA + portada : '',
    deezer: window.DEEZER[idx] || 0,
  };
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

const _fmt = opciones => new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', ...opciones });
const _fmtDia = _fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const _fmtMes = _fmt({ month: 'long', year: 'numeric' });

function textoPeriodo(grano, p) {
  const f = fechaDePeriodo(grano, p);
  if (grano === 'dia') return _fmtDia.format(f);
  if (grano === 'semana') return `Semana del ${_fmtDia.format(f)}`;
  if (grano === 'mes') return _fmtMes.format(f);
  const anio = f.getUTCFullYear();
  return anio === Number(window.FECHA_MAX.slice(0, 4)) ? `${anio} (hasta ${_fmtDia.format(new Date(window.FECHA_MAX + 'T00:00:00Z'))})` : String(anio);
}

const _fmtMesCorto = _fmt({ month: 'short', year: 'numeric' });

/** Versión compacta para la línea de tiempo del reproductor: "27 sept 2026", "sem. 21 sept 2026", "sept 2026", "2026". */
function textoPeriodoCorto(grano, p) {
  const f = fechaDePeriodo(grano, p);
  if (grano === 'dia') return _fmtDia.format(f);
  if (grano === 'semana') return `sem. ${_fmtDia.format(f)}`;
  if (grano === 'mes') return _fmtMesCorto.format(f);
  return String(f.getUTCFullYear());
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
  dia:    { primero: 'Llegó al #1 este día',            varios: 'días seguidos' },
  semana: { primero: 'La más escuchada de esta semana', varios: 'semanas seguidas' },
  mes:    { primero: 'La más escuchada de este mes',    varios: 'meses seguidos' },
  anio:   { primero: 'La más escuchada de este año',    varios: 'años seguidos' },
};

/** "Lleva 12 días seguidos como #1" (cuenta hasta el período actual). */
function textoRacha(r, grano = Estado.grano, p = Estado.periodo) {
  const n = p - r.ini + 1;
  if (n === 1) return RACHA[grano].primero;
  const desdeInicio = r.ini === 0 ? 'al menos ' : '';   // el dataset empieza en 2017: la racha pudo empezar antes
  return `Lleva ${desdeInicio}${n} ${RACHA[grano].varios} como #1`;
}

function nombrePais(cc) {
  return window.PAISES[cc]?.nombre ?? cc.toUpperCase();
}

/** Países (sin 'global') con datos en el período actual. */
function paisesConDatos() {
  return Object.keys(window.PAISES).filter(cc => cc !== 'global' && numero1(cc));
}

const CONFIG_PLOTLY = { displayModeBar: false, responsive: true };
