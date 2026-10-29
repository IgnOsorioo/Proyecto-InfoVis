/* Línea de tiempo: un eje con datos, no una barra de reproducción (R2: la barra fina con play se leía como el
   avance de la canción). El fondo es el % de los países de la muestra fija que escucha el #1 global en cada
   período, sin promedios: el valor bajo el cursor es el del titular del panel. La fecha va sobre el cursor, los
   años debajo y, sobre los años, las marcas de los hitos (cuándo llega o se va Spotify), que explican los
   vacíos del mapa. El control real es un <input type="range"> invisible encima (teclado y lectores de pantalla).
   V4 (R3: «el gráfico de la línea de tiempo no se entiende»): un punto verde sobre el valor de la fecha, la cifra
   junto a la fecha («jun 2015 · 45 %») y el título con la muestra verde de la leyenda, que conecta el área con los
   países verdes del mapa. Tras el thinking aloud, el eje mide lo mismo en todas las granularidades (ver serieEje). */

const Linea = (() => {
  const $ = id => document.getElementById(id);
  const ANCHO = 1000;                   // viewBox del SVG (se estira al ancho real)
  let alElegirHito = () => {};
  let techo = 100;                      // máximo del eje vertical (se fija al dibujar el área)

  /** Posición continua de una fecha en la granularidad (para ubicar cualquier fecha entre dos períodos). */
  function periodoContinuo(grano, fecha) {
    const b = fechaDePeriodo(grano, 0);
    if (grano === 'dia') return (fecha - b) / DIA_MS;
    if (grano === 'semana') return (fecha - b) / (7 * DIA_MS);
    const dias = (a, m) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
    const a = fecha.getUTCFullYear(), m = fecha.getUTCMonth();
    if (grano === 'mes') return (a - b.getUTCFullYear()) * 12 + m - b.getUTCMonth() + (fecha.getUTCDate() - 1) / dias(a, m);
    const inicioAnio = Date.UTC(a, 0, 1);
    return a - b.getUTCFullYear() + (fecha - inicioAnio) / (Date.UTC(a + 1, 0, 1) - inicioAnio);
  }

  /** Fracción (0–1) del eje en que cae la fecha, con la granularidad actual. */
  function fraccion(fecha) {
    const n = window.PERIODOS[Estado.grano].n;
    return Math.min(1, Math.max(0, periodoContinuo(Estado.grano, fecha) / Math.max(1, n - 1)));
  }

  /** La serie del eje en la granularidad: el promedio, en cada período, del % diario de la muestra que escucha el
      #1 global. Thinking aloud (V4 preliminar): con «Año» el eje comparaba el #1 *del año* de cada país con el #1
      global del año, otra medida (2025: 0 %, aunque diciembre de 2025 marcaba 25 %), y la curva cambiaba de forma
      con cada granularidad. Ahora todas promedian los mismos días: «Año» es la versión suavizada de «Día», y sus
      valores son los del título (51 % en 2015 → 12 % en 2026). */
  const _ejes = {};
  function serieEje(grano = Estado.grano) {
    if (_ejes[grano]) return _ejes[grano];
    const dia = serieMuestra('dia');
    if (grano === 'dia') return (_ejes.dia = dia);
    const n = window.PERIODOS[grano].n, suma = new Array(n).fill(0), cuenta = new Array(n).fill(0);
    dia.forEach((v, i) => {
      const p = periodoDeFecha(grano, fechaDePeriodo('dia', i));
      if (p >= 0 && p < n) { suma[p] += v; cuenta[p]++; }
    });
    return (_ejes[grano] = suma.map((s, p) => (cuenta[p] ? s / cuenta[p] : 0)));
  }

  /** Área y borde: la misma serie (el punto del cursor cae siempre sobre la línea que se ve; antes la línea era un
      promedio móvil y el punto, el valor exacto, y se separaban). La escala parte en 0 y llega al máximo más un
      margen, redondeado a la decena; la punteada marca el 50 %. */
  function dibujarArea() {
    const serie = serieEje();
    const n = serie.length;
    techo = Math.min(100, Math.ceil((Math.max(...serie) + 12) / 10) * 10);
    const y = v => 100 - (100 * v) / techo;
    $('linea-medio').setAttribute('y1', y(50));
    $('linea-medio').setAttribute('y2', y(50));
    $('linea').style.setProperty('--medio', `${y(50)}%`);
    const puntos = valores => valores.map((v, p) => `${((n > 1 ? p / (n - 1) : 0) * ANCHO).toFixed(1)},${y(v).toFixed(1)}`).join(' L');
    $('linea-area').setAttribute('d', `M0,100 L${puntos(serie)} L${ANCHO},100 Z`);
    $('linea-borde').setAttribute('d', `M${puntos(serie)}`);
  }

  /** El mensaje en una línea, en el título del eje: el promedio de los días del primer y del último año
      («51 % en 2015 → 12 % en 2026»). Auditoría (vista general): el título pregunta y la vista no afirmaba la
      respuesta hasta ver correr 11 años. Va en el título y no sobre el área para no chocar con el cursor, que al
      entrar está en el primer mes; son promedios anuales, no el valor de un mes como el del cursor. */
  let _resumen = null;
  function resumen() {
    if (_resumen) return _resumen;
    const dia = serieMuestra('dia');
    const promedio = anio => {
      const xs = dia.filter((_, i) => fechaDePeriodo('dia', i).getUTCFullYear() === anio);
      return Math.round(xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length));
    };
    const a0 = fechaDePeriodo('dia', 0).getUTCFullYear(), a1 = fechaDePeriodo('dia', dia.length - 1).getUTCFullYear();
    return (_resumen = { a0, p0: promedio(a0), a1, p1: promedio(a1) });
  }

  function dibujarResumen() {
    const { a0, p0, a1, p1 } = resumen();
    $('linea-resumen').replaceChildren(': ', Object.assign(document.createElement('b'), { textContent: `${p0} %` }),
      ` en ${a0} → `, Object.assign(document.createElement('b'), { textContent: `${p1} %` }), ` en ${a1}`);
    $('linea-titulo').title = `En cada período, el promedio de sus días (${a1}: hasta el ${textoFecha(new Date(window.FECHA_MAX + 'T00:00:00Z'))})`;
  }

  /** Una marca por año (si no caben todos, se rotulan los pares). */
  function dibujarAnios() {
    const n = window.PERIODOS[Estado.grano].n;
    const desde = fechaDePeriodo(Estado.grano, 0), hasta = fechaDePeriodo(Estado.grano, n - 1);
    const anios = [];
    for (let a = desde.getUTCFullYear(); a <= hasta.getUTCFullYear(); a++) {
      const enero = new Date(Date.UTC(a, 0, 1));
      if (enero >= desde && enero <= hasta) anios.push([a, fraccion(enero)]);
    }
    const caben = $('linea-anios').clientWidth / Math.max(1, anios.length) >= 34;
    $('linea-anios').replaceChildren(...anios.map(([a, f]) => {
      const m = document.createElement('span');
      m.style.left = `${f * 100}%`;
      if (caben || a % 2 === 0) m.textContent = a;
      else m.className = 'sin-texto';
      return m;
    }));
  }

  /** Un punto por hito sobre el borde inferior del eje; al pasar el cursor, su frase corta; con click, la fecha. */
  function dibujarHitos() {
    $('linea-hitos').replaceChildren(...HITOS.map(h => {
      const fecha = new Date(h.fecha + 'T00:00:00Z');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'linea-hito';
      b.style.left = `${fraccion(fecha) * 100}%`;
      b.setAttribute('aria-label', `${h.corto} (${textoFecha(fecha)})`);
      b.dataset.texto = h.corto;
      b.addEventListener('click', () => alElegirHito(h));
      return b;
    }));
  }

  window.addEventListener('resize', dibujarAnios);

  return {
    /** Al empezar y al cambiar de granularidad (cambia la escala del eje). */
    dibujar() {
      dibujarArea();
      dibujarAnios();
      dibujarHitos();
      if (!$('linea-resumen').childNodes.length) dibujarResumen();   // no depende de la granularidad
    },
    /** Lleva el cursor y la fecha al período p. */
    mover(p) {
      const n = window.PERIODOS[Estado.grano].n;
      const f = n > 1 ? p / (n - 1) : 1;
      const linea = $('linea');
      linea.style.setProperty('--pos', `${f * 100}%`);
      // Cerca de los bordes la fecha se corre hacia adentro para no salirse del eje.
      linea.style.setProperty('--ajuste', f < 0.06 ? '0%' : f > 0.94 ? '-100%' : '-50%');
      const valor = serieEje()[p] ?? 0;
      linea.style.setProperty('--valor', `${100 - (100 * valor) / techo}%`);
      $('fecha-texto').textContent = textoPeriodoCorto(Estado.grano, p);
      $('fecha-valor').textContent = `${Math.round(valor)} %`;
    },
    alElegirHito(fn) { alElegirHito = fn; },
    /** Promedio anual del primer y del último año (el mensaje): { a0, p0, a1, p1 }. */
    resumen,
  };
})();
