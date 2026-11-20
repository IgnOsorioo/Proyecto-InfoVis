/* Acceso a los datos de la V3 de la E2.

   - Países: los 16 del dial de la perilla, de oeste a este, elegidos por contraste entre sus historias (R2: con los
     52 de la muestra cada país ocupaba 20 pasos del potenciómetro y la perilla saltaba entre vecinos). Los nombres
     vienen de datos/paises.js; NOMBRES_CORTOS acorta los que no caben en el dial grabado.
   - Canciones: datos/e2/canciones200.js (título, artistas, portada e id de Deezer de las canciones de los tops),
     de scripts/15_top200_e2.py.
   - Cuotas: por país, la cuota de cada familia en las reproducciones del top 200 semanal, por año (con el top 5 de
     la familia) y por mes (datos/e2/top200/<cc>.js); se carga al elegir el país. R2: antes se usaba solo el top 5
     general de la E1 y el pop "desaparecía" de Chile en 2020 aunque sonara.
   - "local" no es un género: es la cuota de artistas del propio país (capa aparte; una canción puede ser hip hop y
     local). R3: antes era una bolsa global de escenas regionales y en Chile el disco verde mostraba a Peso Pluma. */

const Datos = (() => {
  const BASE = '../datos/';
  const VERSION = '2026-11-18a';
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre',
                 'noviembre', 'diciembre'];
  const DIAL = ['us', 'mx', 'cl', 'ar', 'br', 'gb', 'es', 'fr', 'de', 'tr', 'in', 'id', 'ph', 'jp', 'kr', 'au'];
  const NOMBRES_CORTOS = { us: 'EE. UU.', gb: 'Reino Unido', kr: 'Corea del Sur' };

  const FAMILIAS = ['pop', 'hiphop', 'latino', 'rock', 'electro', 'local'];
  const NOMBRES = { pop: 'Pop', hiphop: 'Hip hop', latino: 'Latino', rock: 'Rock', electro: 'Electrónica', local: 'Local' };
  const paises = DIAL.filter(cc => window.PAISES[cc]).map(cc => ({
    cc,
    nombre: NOMBRES_CORTOS[cc] || window.PAISES[cc].nombre,
    inicio: window.PAISES[cc].inicio,
  }));

  function cancion(id) {
    const c = window.CANCIONES200[id];
    if (!c) return null;
    const [titulo, artistas, portada, deezer] = c;
    return { idx: id, id, titulo, artistas, portada: portada || '', deezer: deezer || 0, album: '' };
  }

  // Carga perezosa de datos/e2/top200/<cc>.js, que llama a window.cargarTop200(cc, datos).
  const cache = new Map();
  const pendientes = new Map();
  window.cargarTop200 = (cc, datos) => {
    cache.set(cc, datos);
    pendientes.get(cc)?.forEach(r => r(datos));
    pendientes.delete(cc);
  };
  function cuotas(cc) {
    if (cache.has(cc)) return Promise.resolve(cache.get(cc));
    return new Promise((resolve, reject) => {
      if (pendientes.has(cc)) { pendientes.get(cc).push(resolve); return; }
      pendientes.set(cc, [resolve]);
      const s = document.createElement('script');
      s.src = `${BASE}e2/top200/${cc}.js?v=${VERSION}`;
      s.onerror = () => { pendientes.delete(cc); reject(new Error(`Sin cuotas para ${cc}`)); };
      document.head.appendChild(s);
    });
  }

  // Años y meses: los define el primer archivo cargado (todos comparten base: 2013–2023, meses desde 2013-01).
  const mesBase = 1;
  let nMeses = 132, nAnios = 11, anioBase = 2013;
  const listo = cuotas(paises[0]?.cc || 'us').then(d => {
    nMeses = d.meses.length;
    nAnios = d.anios.length;
    anioBase = d.anio_base;
  }).catch(() => {});

  function fechaDeMes(m) {
    const total = (anioBase * 12 + mesBase - 1) + m;
    return { anio: Math.floor(total / 12), mes: (total % 12) + 1, nombreMes: MESES[total % 12] };
  }
  const nombreMes = m => { const f = fechaDeMes(m); return `${f.nombreMes} de ${f.anio}`; };
  /** Índices del primer y último mes (con datos posibles) del año i. */
  function mesesDelAnio(i) {
    const primero = Math.max(0, (anioBase + i) * 12 - (anioBase * 12 + mesBase - 1));
    return [primero, Math.min(nMeses - 1, primero + 11)];
  }

  return {
    paises, cancion, cuotas, nombreMes, fechaDeMes, mesesDelAnio,
    familias: FAMILIAS, listo,
    nombreFamilia: f => NOMBRES[f] || f,
    get nMeses() { return nMeses; },
    get nAnios() { return nAnios; },
    anioDe: i => anioBase + i,
  };
})();
