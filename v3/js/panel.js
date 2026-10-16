/* Panel lateral derecho (alto completo). Tiene tres vistas:
   - Resumen (al entrar o al soltar un país): ¿cuánto del mundo escucha lo mismo? Cuántos países tienen como #1
     el #1 global, por continente; su evolución desde 2013; y el #1 global, que es lo que suena.
   - País: lo que se escucha en el país bajo el cursor o en el país fijado.
   - Mensaje: país sin datos.

   Vista de país:
   - Cabecera: portada, título, artistas, de qué fuente sale el #1 y si coincide con el #1 global, y audio.
   - Estadísticas a la fecha: estreno, en cuántos países es #1 y reproducciones acumuladas en los charts.
   - Gráfico de popularidad (ocupa el resto del alto), hasta la fecha elegida.

   El panel se actualiza de una sola vez: primero se cargan la popularidad y la portada, y recién entonces se
   reemplaza todo. Si eso tarda, se muestra una pantalla de carga en vez de un panel a medio armar. */

const Panel = (() => {
  const $ = id => document.getElementById(id);
  const panel = $('panel');
  const ESPERA_CARGA_MS = 150;                          // si los datos tardan más, aparece la pantalla de carga
  let alVolver = () => {};
  let claveEvolucion = '';
  let pedido = 0;
  const portadasListas = new Set();

  const fechaSemana = s => fechaDeSemana(s).toISOString().slice(0, 10);
  const pct = (n, total) => `${Math.round(100 * n / total)} %`;
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

  /** Muestra la pantalla de carga si la espera se alarga, y la quita al terminar. */
  async function conEspera(mio, promesa) {
    const espera = setTimeout(() => { if (mio === pedido) panel.classList.add('cargando'); }, ESPERA_CARGA_MS);
    try {
      return await promesa;
    } finally {
      clearTimeout(espera);
    }
  }

  // ---------- Vista de país ----------

  /** Muestra lo que se escucha en Estado.origen (su #1 = Estado.cancion) a la fecha actual. */
  async function mostrar() {
    if (Estado.cancion === null) return;
    const mio = ++pedido;
    const idx = Estado.cancion;
    const c = cancion(idx);
    const [popularidad] = await conEspera(mio, Promise.all([
      pedirPopularidad(idx).catch(() => null),
      precargarPortada(c.portada),
    ]));
    if (mio !== pedido) return;                         // ya se pidió otra cosa: se descarta
    panel.classList.remove('cargando', 'modo-mensaje', 'modo-resumen');
    panel.classList.toggle('modo-fijado', !!Estado.fijado);
    dibujarCancion(c);
    $('p-contexto').textContent = contexto(idx);
    $('p-global').textContent = textoGlobal(idx);
    $('p-global').classList.toggle('sigue', idx === numero1('global')?.idx);
    dibujarEstadisticas(c, popularidad);
  }

  function dibujarCancion(c) {
    if ($('p-portada').dataset.idx === String(c.idx)) return;
    $('p-portada').dataset.idx = c.idx;
    $('p-portada').src = c.portada;
    $('p-fondo').src = c.portada;                       // misma portada, desenfocada, llena los lados si falta alto
    $('p-portada').alt = `Portada de ${c.titulo}`;
    $('p-titulo').textContent = c.titulo;
    $('p-titulo').title = c.titulo;
    $('p-artistas').textContent = c.artistas;
    $('p-artistas').title = c.artistas;
    $('p-spotify').hidden = !c.id;                       // las canciones de YouTube o Apple no tienen id de Spotify
    $('p-spotify').href = c.id ? `https://open.spotify.com/track/${c.id}` : '#';
  }

  /** "Escuchando en Chile · #1 en Spotify · lleva 9 días seguidos". */
  function contexto(idx) {
    const cc = Estado.origen;
    const r = cc ? numero1(cc) : null;
    if (!r || r.idx !== idx) return textoPeriodo(Estado.grano, Estado.periodo);
    const donde = cc === 'global' ? '#1 global en Spotify' : `${Estado.fijado === cc ? 'Escuchando en' : '#1 en'} ${nombrePais(cc)} · ${FUENTES[r.fuente] ?? 'Spotify'}`;
    return `${donde} · ${textoRacha(r)}`;
  }

  /** ¿Es la misma canción que escucha el mundo? */
  function textoGlobal(idx) {
    if (Estado.origen === 'global') return 'Es lo que más se escucha en el mundo';
    const g = numero1('global');
    if (!g) return '';
    if (g.idx === idx) return 'Igual que el #1 global';
    return `El #1 global es otra: «${cancion(g.idx).titulo}»`;
  }

  /** Estreno, en cuántos países es #1 y reproducciones acumuladas; y el gráfico de popularidad.
      Estreno: el más antiguo entre la fecha de lanzamiento y la primera semana en los charts. */
  function dibujarEstadisticas(c, popularidad) {
    const primeraSemana = popularidad ? fechaSemana(popularidad.inicio) : '';
    const estreno = [c.estreno, primeraSemana].filter(Boolean).sort()[0];
    $('p-estreno').textContent = estreno ? estreno.split('-').reverse().join('/') : '—';   // DD/MM/AAAA
    $('p-numero1').textContent = paises(paisesDondeEsNumero1(c.idx).length);
    const hasta = semanaDe(finDelPeriodo());
    const valores = popularidad ? popularidad.valores.slice(0, Math.max(0, hasta - popularidad.inicio + 1)) : [];
    const total = valores.reduce((a, b) => a + b, 0) * 1000;
    const vistas = c.idx >= BASE_EXTRA && c.idx < BASE_V3;
    $('p-reproducciones-titulo').textContent = vistas ? 'Vistas' : 'Reproducciones';
    $('p-reproducciones').textContent = total ? textoCantidad(total) : '—';
    $('p-popularidad-titulo').textContent = vistas
      ? 'Popularidad · vistas semanales en YouTube Music'
      : 'Popularidad · reproducciones semanales en los charts de Spotify';
    dibujarGrafico(popularidad, valores, vistas ? 'vistas' : 'reproducciones');
  }

  function dibujarGrafico(popularidad, valores, unidad) {
    const nodo = $('p-grafico');
    const aviso = $('p-grafico-aviso');
    if (!valores.length) {
      aviso.textContent = popularidad ? 'Todavía no entra a los charts en esta fecha.' : 'Sin datos de popularidad.';
      aviso.hidden = false;
      Plotly.purge(nodo);
      return;
    }
    aviso.hidden = true;
    const x = valores.map((_, i) => fechaSemana(popularidad.inicio + i));
    const formatoEje = valores.length <= 20 ? '%d %b' : valores.length <= 110 ? '%b %Y' : '%Y';
    const y = valores.map(v => v * 1000);
    const coral = token('c1');
    Plotly.react(nodo, [
      { type: 'scatter', mode: 'lines', x, y, line: { color: coral, width: 2, shape: 'spline', smoothing: 0.6 },
        fill: 'tozeroy', fillcolor: 'rgba(228, 86, 75, 0.16)',
        hovertemplate: `Semana del %{x|%d %b %Y}<br><b>%{y:.3s}</b> ${unidad}<extra></extra>` },
      { type: 'scatter', mode: 'markers', x: [x.at(-1)], y: [y.at(-1)], hoverinfo: 'skip',
        marker: { color: coral, size: 9, line: { color: token('panel'), width: 2 } } },
    ], {
      height: Math.max(96, nodo.parentElement.clientHeight),
      margin: { l: 34, r: 8, t: 4, b: 20 },
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      showlegend: false,
      font: { family: token('fuente'), size: 10, color: token('tinta-3') },
      hoverlabel: { bgcolor: token('superficie'), bordercolor: token('eje'), font: { family: token('fuente'), size: 12, color: token('tinta') } },
      xaxis: { showgrid: false, zeroline: false, linecolor: token('eje'), fixedrange: true, nticks: 4, tickformat: formatoEje },
      yaxis: { gridcolor: token('grilla'), zeroline: false, tickformat: '~s', fixedrange: true, nticks: 4, rangemode: 'tozero' },
    }, CONFIG_PLOTLY);
  }

  // ---------- Resumen ----------

  const COLOR_CONTINENTE = { america: 'cont-america', europa: 'cont-europa', africa: 'cont-africa', asia: 'cont-asia', oceania: 'cont-oceania' };

  /** ¿Cuánto del mundo (o de la región) escucha lo mismo que el mundo? Hoy, por continente y desde 2013. */
  async function resumen() {
    const mio = ++pedido;
    const ambito = Estado.ambito;
    const global = numero1('global');
    const c = global ? cancion(global.idx) : null;
    await conEspera(mio, precargarPortada(c?.portada));
    if (mio !== pedido) return;
    panel.classList.remove('cargando', 'modo-mensaje', 'modo-fijado');
    panel.classList.add('modo-resumen');

    const { n, total } = cuentaGlobal(ambito);
    const lugar = ambito === 'global' ? 'El mundo' : nombreAmbito(ambito);
    $('r-contexto').textContent = `${lugar} · ${textoPeriodo(Estado.grano, Estado.periodo)}`;
    $('r-titular').textContent = total
      ? `${n} de ${paises(total)} ${n === 1 ? 'escucha' : 'escuchan'} el #1 global`
      : 'Sin datos en esta fecha';
    $('r-bajada').textContent = 'En coral, los países cuyo #1 nacional es el mismo #1 del chart global. '
      + 'Si las tendencias fueran mundiales, todos los continentes se verían igual.';
    dibujarContinentes();
    dibujarEvolucion(ambito);
    dibujarGlobal(c);
  }

  /** Una barra por continente: % de sus países (con datos) que siguen al #1 global en la fecha. */
  function dibujarContinentes() {
    $('r-continentes').replaceChildren(...Object.entries(CONTINENTES).map(([k, nombre]) => {
      const { n, total } = cuentaGlobal(k);
      const fila = document.createElement('li');
      fila.className = Estado.ambito === k ? 'actual' : '';
      fila.innerHTML = `<span class="r-cont-nombre"><i class="muestra ${COLOR_CONTINENTE[k]}"></i></span>
        <span class="r-cont-barra"><span></span></span><span class="r-cont-valor"></span>`;
      fila.querySelector('.r-cont-nombre').append(nombre);
      fila.querySelector('.r-cont-barra span').style.width = total ? `${100 * n / total}%` : '0';
      fila.querySelector('.r-cont-valor').textContent = total ? `${pct(n, total)} · ${n}/${total}` : 'sin datos';
      return fila;
    }));
  }

  /** Líneas por continente (% de países que siguen al #1 global, mes a mes) y una línea en la fecha elegida. */
  function dibujarEvolucion(ambito) {
    const nodo = $('r-grafico');
    const fecha = fechaDePeriodo(Estado.grano, Estado.periodo).toISOString().slice(0, 10);
    const marca = { type: 'line', xref: 'x', yref: 'paper', x0: fecha, x1: fecha, y0: 0, y1: 1, line: { color: token('tinta'), width: 1.5 } };
    const clave = `${ambito}|${nodo.clientHeight}`;
    if (clave === claveEvolucion && nodo.data) {         // mismos datos: solo se mueve la línea de la fecha
      Plotly.relayout(nodo, { shapes: [marca] });
      return;
    }
    claveEvolucion = clave;
    const serie = serieContinentes();
    const trazas = [
      ...Object.entries(CONTINENTES).map(([k, nombre]) => ({
        type: 'scatter', mode: 'lines', x: serie.x, y: serie[k], name: nombre, connectgaps: false,
        line: { color: token(COLOR_CONTINENTE[k]), width: ambito === k ? 3 : 1.8 },
        opacity: ambito === 'global' || ambito === k ? 1 : 0.3,
        hovertemplate: `%{x|%b %Y} · ${nombre}: <b>%{y:.0f} %</b><extra></extra>`,
      })),
      { type: 'scatter', mode: 'lines', x: serie.x, y: serie.global, name: 'Mundo',   // referencia
        line: { color: token('tinta'), width: 2.4, dash: 'dot' },
        hovertemplate: '%{x|%b %Y} · Mundo: <b>%{y:.0f} %</b><extra></extra>' },
    ];
    Plotly.react(nodo, trazas, {
      height: Math.max(90, nodo.clientHeight),
      margin: { l: 40, r: 8, t: 8, b: 20 },
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      showlegend: false,
      font: { family: token('fuente'), size: 10, color: token('tinta-3') },
      hoverlabel: { bgcolor: token('superficie'), bordercolor: token('eje'), font: { family: token('fuente'), size: 12, color: token('tinta') } },
      xaxis: { showgrid: false, zeroline: false, linecolor: token('eje'), fixedrange: true, nticks: 7, tickformat: '%Y' },
      yaxis: { gridcolor: token('grilla'), zeroline: false, fixedrange: true, range: [0, 100], tickvals: [0, 50, 100], ticktext: ['0', '50 %', '100 %'] },
      shapes: [marca],
    }, CONFIG_PLOTLY);
  }

  /** El #1 global en la fecha: es lo que suena mientras no hay un país en el panel. */
  function dibujarGlobal(c) {
    $('r-global').hidden = !c;
    if (!c) return;
    $('r-global-portada').src = c.portada;
    $('r-global-titulo').textContent = c.titulo;
    $('r-global-artistas').textContent = c.artistas;
    $('r-global-n').textContent = `#1 en ${paises(paisesDondeEsNumero1(c.idx).length)}`;
  }

  // ---------- Mensaje (país sin datos) ----------

  function mensaje(titulo, texto) {
    pedido++;                                           // cancela una actualización pendiente
    panel.classList.remove('cargando', 'modo-resumen');
    panel.classList.add('modo-mensaje');
    panel.scrollTop = 0;
    $('p-mensaje-titulo').textContent = titulo;
    $('p-mensaje-texto').textContent = texto;
  }

  // ---------- Audio ----------

  const TEXTO_AUDIO = {
    cargando: 'Cargando preview…',
    sonando: 'Sonando · preview de 30 s (Deezer)',
    'sin-preview': 'Sin preview disponible para esta canción',
    silencio: 'Haz click para activar el sonido',
    pausa: 'En pausa',
    silenciado: 'Sonido apagado (abajo a la derecha)',
  };
  function audio(estado) {
    $('p-audio').classList.toggle('sonando', estado === 'sonando');
    $('r-global-audio').classList.toggle('sonando', estado === 'sonando');
    $('p-audio-texto').textContent = TEXTO_AUDIO[estado] ?? 'Pasa el cursor por un país para escucharla';
  }

  function progreso(fraccion) {
    $('p-progreso').style.width = `${fraccion * 100}%`;
  }

  return {
    iniciar({ alVolverAlResumen }) {
      alVolver = alVolverAlResumen;
      $('p-volver').addEventListener('click', () => alVolver());
    },
    mostrar, resumen, mensaje, audio, progreso,
  };
})();
