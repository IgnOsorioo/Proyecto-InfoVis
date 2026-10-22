/* Línea de tiempo: un eje con datos, no una barra de reproducción (R2: la barra fina con play se leía como el
   avance de la canción). El fondo es el % de los países de la muestra fija que escucha el #1 global en cada
   período, sin promedios: el valor bajo el cursor es el del titular del panel. La fecha va sobre el cursor, los
   años debajo y, sobre los años, las marcas de los hitos (cuándo llega o se va Spotify), que explican los
   vacíos del mapa. El control real es un <input type="range"> invisible encima (teclado y lectores de pantalla).
   V4 (R3: «el gráfico de la línea de tiempo no se entiende»): un punto verde sobre el valor de la fecha, la cifra
   junto a la fecha («jun 2015 · 65 %») y el título con la muestra verde de la leyenda. Es el mismo % que el titular
   del panel y el mismo verde que los países del mapa: el área cuenta los países pintados de verde. */

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

  // Ventana de la línea de tendencia (centrada), en períodos: unas 8 semanas en cada granularidad.
  const VENTANA_TENDENCIA = { dia: 56, semana: 8, mes: 2, anio: 1 };

  /** Área: el % exacto de la muestra con el #1 global en cada período (el mismo del titular y del punto). Línea: su
      tendencia (promedio móvil centrado), para leer la evolución sin el ruido de cada período. La escala parte en 0
      y llega al máximo más un margen, redondeado a la decena; la punteada marca el 50 %. */
  function dibujarArea() {
    const serie = serieMuestra();
    const n = serie.length;
    const medio = VENTANA_TENDENCIA[Estado.grano] >> 1;
    const tendencia = serie.map((_, p) => {
      const tramo = serie.slice(Math.max(0, p - medio), p + medio + 1);
      return tramo.reduce((a, b) => a + b, 0) / tramo.length;
    });
    techo = Math.min(100, Math.ceil((Math.max(...serie) + 12) / 10) * 10);
    const y = v => 100 - (100 * v) / techo;
    $('linea-medio').setAttribute('y1', y(50));
    $('linea-medio').setAttribute('y2', y(50));
    $('linea').style.setProperty('--medio', `${y(50)}%`);
    const puntos = valores => valores.map((v, p) => `${((n > 1 ? p / (n - 1) : 0) * ANCHO).toFixed(1)},${y(v).toFixed(1)}`).join(' L');
    $('linea-area').setAttribute('d', `M0,100 L${puntos(serie)} L${ANCHO},100 Z`);
    $('linea-borde').setAttribute('d', `M${puntos(tendencia)}`);
  }

  /** El mensaje en una línea, en el título del eje: el promedio de los días del primer y del último año
      («51 % en 2015 → 12 % en 2026»). Auditoría (vista general): el título pregunta y la vista no afirmaba la
      respuesta hasta ver correr 11 años. Va en el título y no sobre el área para no chocar con el cursor, que al
      entrar está en el primer mes; son promedios anuales, no el valor de un mes como el del cursor. */
  function dibujarResumen() {
    const dia = serieMuestra('dia');
    const promedio = anio => {
      const xs = dia.filter((_, i) => fechaDePeriodo('dia', i).getUTCFullYear() === anio);
      return Math.round(xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length));
    };
    const a0 = fechaDePeriodo('dia', 0).getUTCFullYear(), a1 = fechaDePeriodo('dia', dia.length - 1).getUTCFullYear();
    $('linea-resumen').replaceChildren(': ', Object.assign(document.createElement('b'), { textContent: `${promedio(a0)} %` }),
      ` en ${a0} → `, Object.assign(document.createElement('b'), { textContent: `${promedio(a1)} %` }), ` en ${a1}`);
    $('linea-titulo').title = `Promedio de los días de cada año (${a1}: hasta el ${textoFecha(new Date(window.FECHA_MAX + 'T00:00:00Z'))})`;
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
      const valor = serieMuestra()[p] ?? 0;
      linea.style.setProperty('--valor', `${100 - (100 * valor) / techo}%`);
      $('fecha-texto').textContent = textoPeriodoCorto(Estado.grano, p);
      $('fecha-valor').textContent = `${Math.round(valor)} %`;
    },
    alElegirHito(fn) { alElegirHito = fn; },
  };
})();
