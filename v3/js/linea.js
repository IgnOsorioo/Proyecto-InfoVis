/* Línea de tiempo: un eje con datos, no una barra de reproducción (R2: la barra fina con play se leía como el
   avance de la canción). El fondo es el % de países que escuchan el #1 global semana a semana (promedio de 6
   meses), así el eje muestra de un vistazo cuándo el mundo escuchó lo mismo; la fecha va sobre el cursor y los
   años debajo. El control real es un <input type="range"> invisible encima (teclado y lectores de pantalla). */

const Linea = (() => {
  const $ = id => document.getElementById(id);
  const ANCHO = 1000;                   // viewBox del SVG (se estira al ancho real)

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

  /** Área y borde: una figura por tramo con datos (los huecos quedan vacíos). La escala parte en 0 y llega al
      máximo más un margen, redondeado a la decena (no a 100 %: el máximo ronda el 55 % y el área quedaba aplastada); la línea
      punteada marca el 50 % para leer el nivel. */
  function dibujarArea() {
    const serie = serieContinentes();
    const techo = Math.min(100, Math.ceil((Math.max(...serie.global.filter(v => v !== null)) + 12) / 10) * 10);   // aire para la etiqueta
    const y = v => 100 - (100 * v) / techo;
    $('linea-medio').setAttribute('y1', y(50));
    $('linea-medio').setAttribute('y2', y(50));
    $('linea').style.setProperty('--medio', `${y(50)}%`);
    let area = '', borde = '', tramo = [];
    const cerrar = () => {
      if (tramo.length > 1) {
        const [x0] = tramo[0], [x1] = tramo.at(-1);
        const puntos = tramo.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L');
        area += `M${x0.toFixed(1)},100 L${puntos} L${x1.toFixed(1)},100 Z`;
        borde += `M${puntos}`;
      }
      tramo = [];
    };
    serie.x.forEach((x, i) => {
      const v = serie.global[i];
      if (v === null) { cerrar(); return; }
      tramo.push([fraccion(new Date(x + 'T00:00:00Z')) * ANCHO, y(v)]);
    });
    cerrar();
    $('linea-area').setAttribute('d', area);
    $('linea-borde').setAttribute('d', borde);
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

  window.addEventListener('resize', dibujarAnios);

  return {
    /** Al empezar y al cambiar de granularidad (cambia la escala del eje). */
    dibujar() {
      dibujarArea();
      dibujarAnios();
    },
    /** Lleva el cursor y la fecha al período p. */
    mover(p) {
      const n = window.PERIODOS[Estado.grano].n;
      const f = n > 1 ? p / (n - 1) : 1;
      const linea = $('linea');
      linea.style.setProperty('--pos', `${f * 100}%`);
      // Cerca de los bordes la fecha se corre hacia adentro para no salirse del eje.
      linea.style.setProperty('--ajuste', f < 0.06 ? '0%' : f > 0.94 ? '-100%' : '-50%');
      $('fecha').textContent = textoPeriodoCorto(Estado.grano, p);
    },
  };
})();
