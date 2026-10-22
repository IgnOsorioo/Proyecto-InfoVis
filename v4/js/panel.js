/* Panel lateral derecho (alto completo): una sola vista, para la canción que está sonando.
   - Sin cursor sobre el mapa: el #1 global, contado en el ámbito de la pestaña elegida (el mundo o un continente).
   - Con el cursor sobre un país (o con un país fijado): el #1 de ese país, con los mismos datos.
   - Mensaje: país sin datos.
   Siempre lo mismo, para cualquier canción: portada, dónde suena, título; en cuántos países de la muestra es #1
   (y por continente); en cuántos está en su top 50 (anillo); y sus reproducciones semanales hasta hoy, con lo
   posterior a la fecha en gris. Así comparar el #1 global con el de un país es comparar dos vistas iguales.

   El panel se actualiza de una sola vez: primero se cargan los datos y la portada, y recién entonces se reemplaza
   todo. Si eso tarda, se muestra una pantalla de carga en vez de un panel a medio armar. */

const Panel = (() => {
  const $ = id => document.getElementById(id);
  const panel = $('panel');
  const ESPERA_CARGA_MS = 150;                          // si los datos tardan más, aparece la pantalla de carga
  let alVolver = () => {};
  let pedido = 0;
  const portadasListas = new Set();

  const fechaSemana = s => fechaDeSemana(s).toISOString().slice(0, 10);
  const paises = n => (n === 1 ? '1 país' : `${n} países`);

  /** Descarga la portada antes de mostrarla (máx. 1,5 s), para no ver un cuadro vacío al cambiar. */
  function precargarPortada(url) {
    if (!url || portadasListas.has(url)) return Promise.resolve();
    return new Promise(resolve => {
      const img = new Image();
      const listo = () => { portadasListas.add(url); resolve(); };
      img.onload = listo;
      img.onerror = resolve;
      img.src = url;
      setTimeout(resolve, 1500);
    });
  }

  /** Muestra la pantalla de carga si la espera se alarga. */
  async function conEspera(mio, promesa) {
    const espera = setTimeout(() => { if (mio === pedido) panel.classList.add('cargando'); }, ESPERA_CARGA_MS);
    try {
      return await promesa;
    } finally {
      clearTimeout(espera);
    }
  }

  function dibujarCancion(c) {
    if ($('p-portada').dataset.idx === String(c.idx)) return;
    $('p-portada').dataset.idx = c.idx;
    $('p-portada').src = c.portada;
    $('p-portada').closest('.p-hero').classList.toggle('sin-portada', !c.portada);   // sin portada: fondo neutro, no un ícono roto
    $('p-portada').alt = `Portada de ${c.titulo}`;
    $('p-titulo').textContent = c.titulo;
    $('p-titulo').title = c.titulo;
    $('p-artistas').textContent = c.artistas;
    $('p-artistas').title = c.artistas;
    $('p-spotify').hidden = !c.id;                       // las canciones de YouTube o QQ Music no tienen id de Spotify
    $('p-spotify').href = c.id ? `https://open.spotify.com/track/${c.id}` : '#';
  }

  /** Muestra la canción que suena (Estado.cancion), #1 de Estado.origen ('global' o un país), en Estado.ambito. */
  async function mostrar() {
    if (Estado.cancion === null) return;
    const mio = ++pedido;
    const idx = Estado.cancion;
    const c = cancion(idx);
    const [popularidad, alcance] = await conEspera(mio, Promise.all([
      pedirPopularidad(idx).catch(() => null),
      pedirAlcance(idx).catch(() => null),
      precargarPortada(c.portada),
    ]));
    if (mio !== pedido) return;                         // ya se pidió otra cosa: se descarta
    panel.classList.remove('cargando', 'modo-mensaje');
    panel.classList.toggle('modo-fijado', !!Estado.fijado);
    dibujarCancion(c);
    const origen = Estado.origen;
    $('p-contexto').textContent = origen === 'global' ? '#1 global' : `Escuchando en ${nombrePais(origen)}`;
    $('p-insignia').hidden = origen === 'global' || idx !== numero1('global')?.idx;
    dibujarTitular(idx, origen, ambitoMedible(Estado.ambito));
    dibujarContinentes(idx);
    const semana = semanaDe(finDelPeriodo());
    dibujarAnillo(alcanceEn(alcance, semana), muestraDe('global').length);
    dibujarPopularidad(popularidad, semana);
  }

  /** "Es #1 en 16 de 52 países" (o "… de 19 países de América"): países de la muestra del ámbito donde la canción
      es #1. Si el país que se mira no está en la muestra (Rusia, China…), se nombra aparte. */
  function dibujarTitular(idx, origen, ambito) {
    const muestra = muestraDe(ambito);
    const n = muestra.filter(cc => numero1(cc)?.idx === idx).length;
    const donde = ambito === 'global' ? '' : ` de ${nombreAmbito(ambito)}`;
    const fuera = origen !== 'global' && !muestra.includes(origen) ? nombrePais(origen) : null;
    $('r-titular').textContent = fuera
      ? (n ? `Es #1 en ${fuera} y en ${n} de ${paises(muestra.length)}${donde}` : `Es #1 en ${fuera}`)
      : `Es #1 en ${n} de ${paises(muestra.length)}${donde}`;
  }

  /** Una barra por continente con al menos MIN_MUESTRA países en la muestra: en cuántos es #1 la canción. */
  function dibujarContinentes(idx) {
    $('r-continentes').replaceChildren(...Object.entries(CONTINENTES)
      .filter(([k]) => muestraDe(k).length >= MIN_MUESTRA)
      .map(([k, nombre]) => {
        const muestra = muestraDe(k);
        const n = muestra.filter(cc => numero1(cc)?.idx === idx).length;
        const fila = document.createElement('li');
        fila.innerHTML = '<span class="r-cont-nombre"></span><span class="r-cont-barra"><span></span></span><span class="r-cont-valor"></span>';
        fila.querySelector('.r-cont-nombre').textContent = nombre;
        fila.querySelector('.r-cont-barra span').style.width = `${100 * n / muestra.length}%`;
        fila.querySelector('.r-cont-valor').textContent = `${n}/${muestra.length}`;
        return fila;
      }));
  }

  /** Anillo de cobertura: en cuántos países de la muestra está la canción en su top 50 esta semana. */
  function dibujarAnillo(paisesTop, total) {
    const fraccion = total ? paisesTop / total : 0;
    $('r-anillo-valor').style.strokeDasharray = `${(fraccion * 100).toFixed(1)} 100`;
    $('r-anillo-pct').textContent = `${Math.round(fraccion * 100)} %`;
    $('r-anillo-texto').textContent = `En el top 50 de ${paisesTop} de los ${total} países`;
  }

  /** Marcas del eje vertical sin el 0 (en la esquina se leía como "año 0"): el paso redondo más cercano a un
      tercio del máximo (1, 2, 2,5 o 5 por potencia de 10) y sus múltiplos hasta el máximo. */
  function marcasVerticales(maximo) {
    if (!(maximo > 0)) return [];
    const bruto = maximo / 3, potencia = 10 ** Math.floor(Math.log10(bruto));
    const paso = [1, 2, 2.5, 5, 10].map(k => k * potencia).find(v => v >= bruto);
    return Array.from({ length: Math.floor(maximo / paso) }, (_, i) => (i + 1) * paso);
  }

  /** Reproducciones semanales de la canción, en el mismo eje que la línea de tiempo (mayo de 2015 → hoy) para toda
      canción: los mismos años, y la franja de la fecha alineada con el cursor del eje de abajo. Fuera de su paso
      por los charts la curva está en 0 (es la suma de sus reproducciones en los charts): sube y baja sin cortarse.
      Lo anterior a la fecha en verde y lo posterior en gris; al reproducir el tiempo, la franja avanza y el verde
      cubre la curva. El título dice cuántas lleva hasta la fecha (también las anteriores a mayo de 2015). Las
      vistas de YouTube Music también cuentan como reproducciones. */
  let ultimoGrafico = null;                             // para volver a dibujarlo al cambiar el tamaño de la ventana
  let timerTamano = null;
  window.addEventListener('resize', () => {
    clearTimeout(timerTamano);
    timerTamano = setTimeout(() => { if (ultimoGrafico) dibujarPopularidad(...ultimoGrafico); }, 150);
  });

  function dibujarPopularidad(popularidad, semanaActual) {
    ultimoGrafico = [popularidad, semanaActual];
    const nodo = $('p-grafico');
    const aviso = $('p-grafico-aviso');
    if (!popularidad?.valores.length) {
      $('p-popularidad-titulo').textContent = 'Reproducciones por semana';
      aviso.textContent = 'Sin datos de reproducciones';
      aviso.hidden = false;
      Plotly.purge(nodo);
      return;
    }
    aviso.hidden = true;
    const { inicio, valores } = popularidad;
    const acumuladas = valores.slice(0, Math.max(0, semanaActual - inicio + 1)).reduce((a, b) => a + b, 0) * 1000;
    $('p-popularidad-titulo').textContent = acumuladas
      ? `Reproducciones por semana · ${textoCantidad(acumuladas)} hasta la fecha`
      : 'Reproducciones por semana';
    const desde = fechaDePeriodo('dia', 0), hoy = new Date(window.FECHA_MAX + 'T00:00:00Z');
    const s0 = semanaDe(desde), s1 = semanaDe(hoy);
    const semanas = Array.from({ length: s1 - s0 + 1 }, (_, i) => s0 + i);
    const x = semanas.map(fechaSemana);
    const y = semanas.map(s => (valores[s - inicio] ?? 0) * 1000);
    const k = Math.min(Math.max(semanaActual - s0, 0), semanas.length - 1);   // la semana de la fecha: borde de las dos partes
    const verde = token('global'), gris = token('tinta-3');
    const parte = (ini, fin, color, relleno) => ({
      type: 'scatter', mode: 'lines', x: x.slice(ini, fin), y: y.slice(ini, fin),
      line: { color, width: 1.5 }, fill: 'tozeroy', fillcolor: relleno,
      hovertemplate: 'Semana del %{x|%d %b %Y}<br><b>%{y:.3s}</b> reproducciones<extra></extra>',
    });
    const maximo = Math.max(...y);
    Plotly.react(nodo, [
      parte(k, x.length, gris, 'rgba(138, 138, 138, 0.18)'),
      parte(0, k + 1, verde, 'rgba(30, 215, 96, 0.3)'),   // el mismo verde que el área del eje de tiempo
    ], {
      height: Math.max(80, nodo.parentElement.clientHeight),
      margin: { l: 34, r: 8, t: 4, b: 20 },
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      showlegend: false,
      font: { family: token('fuente'), size: 10, color: token('tinta-3') },
      hoverlabel: { bgcolor: token('superficie'), bordercolor: token('eje'), font: { family: token('fuente'), size: 12, color: token('tinta') } },
      // Los mismos años que la línea de tiempo: una marca cada enero.
      xaxis: { showgrid: false, zeroline: false, linecolor: token('eje'), fixedrange: true,
               tick0: '2016-01-01', dtick: 'M24', tickformat: '%Y', range: [x[0], x.at(-1)] },
      yaxis: { gridcolor: token('grilla'), zeroline: false, fixedrange: true, range: [0, maximo * 1.08],
               tickvals: marcasVerticales(maximo), tickformat: '~s' },
      shapes: [{ type: 'line', xref: 'x', yref: 'paper', x0: x[k], x1: x[k], y0: 0, y1: 1, line: { color: token('tinta'), width: 2 } }],
    }, CONFIG_PLOTLY);
  }

  // ---------- Mensaje (país sin datos) ----------

  function mensaje(titulo, texto) {
    pedido++;                                           // cancela una actualización pendiente
    panel.classList.remove('cargando');
    panel.classList.add('modo-mensaje');
    panel.scrollTop = 0;
    $('p-mensaje-titulo').textContent = titulo;
    $('p-mensaje-texto').textContent = texto;
  }

  /** El ecualizador se mueve solo mientras suena la preview. */
  function audio(estado) {
    $('p-audio').classList.toggle('sonando', estado === 'sonando');
  }

  return {
    iniciar({ alVolverAlResumen }) {
      alVolver = alVolverAlResumen;
      $('p-volver').addEventListener('click', () => alVolver());
    },
    mostrar, mensaje, audio,
    resumen: mostrar,                                    // el mundo o la región: la misma vista, con el #1 global
  };
})();
