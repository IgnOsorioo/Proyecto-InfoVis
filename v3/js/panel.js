/* Panel lateral derecho (alto completo): siempre muestra lo que está sonando.
   - Mundo (al entrar o al soltar un país): el #1 global y, debajo, cuántos países lo escuchan, por continente.
   - País (bajo el cursor o fijado): su #1 y, debajo, estreno, reproducciones y popularidad semanal.
   - Mensaje: país sin datos.
   Arriba, en los dos casos: portada, "Escuchando en …" y título. Sin carteles de estado: el ecualizador dice si
   suena, y la insignia verde si es el mismo #1 del mundo.

   El panel se actualiza de una sola vez: primero se cargan la popularidad y la portada, y recién entonces se
   reemplaza todo. Si eso tarda, se muestra una pantalla de carga en vez de un panel a medio armar. */

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

  function modo(nombre) {
    panel.classList.remove('cargando', 'modo-mundo', 'modo-pais', 'modo-mensaje');
    panel.classList.add(`modo-${nombre}`);
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

  // ---------- País ----------

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
    modo('pais');
    dibujarCancion(c);
    $('p-contexto').textContent = `Escuchando en ${nombrePais(Estado.origen)}`;
    $('p-insignia').hidden = idx !== numero1('global')?.idx;
    dibujarEstadisticas(c, popularidad);
  }

  /** Estreno, reproducciones acumuladas hasta la fecha y gráfico de popularidad. Apple Music no tiene historia:
      el bloque no se muestra. Estreno: el más antiguo entre el lanzamiento y la primera semana en los charts. */
  function dibujarEstadisticas(c, popularidad) {
    const sinHistoria = c.fuente === 'Apple Music';
    panel.classList.toggle('sin-historia', sinHistoria);
    if (sinHistoria) return;
    const primeraSemana = popularidad ? fechaSemana(popularidad.inicio) : '';
    const estreno = [c.estreno, primeraSemana].filter(Boolean).sort()[0];
    $('p-estreno').textContent = estreno ? estreno.split('-').reverse().join('/') : '—';   // DD/MM/AAAA
    const hasta = semanaDe(finDelPeriodo());
    const valores = popularidad ? popularidad.valores.slice(0, Math.max(0, hasta - popularidad.inicio + 1)) : [];
    const total = valores.reduce((a, b) => a + b, 0) * 1000;
    const vistas = c.fuente === 'YouTube Music';
    $('p-reproducciones-titulo').textContent = vistas ? 'Vistas' : 'Reproducciones';
    $('p-reproducciones').textContent = total ? textoCantidad(total) : '—';
    $('p-popularidad-titulo').textContent = vistas ? 'Vistas por semana en YouTube' : 'Reproducciones por semana';
    dibujarGrafico(popularidad, valores, vistas ? 'vistas' : 'reproducciones');
  }

  function dibujarGrafico(popularidad, valores, unidad) {
    const nodo = $('p-grafico');
    const aviso = $('p-grafico-aviso');
    if (!valores.length) {
      aviso.textContent = popularidad ? 'Aún no entra a los charts' : 'Sin datos';
      aviso.hidden = false;
      Plotly.purge(nodo);
      return;
    }
    aviso.hidden = true;
    const x = valores.map((_, i) => fechaSemana(popularidad.inicio + i));
    const formatoEje = valores.length <= 20 ? '%d %b' : valores.length <= 110 ? '%b %Y' : '%Y';
    const y = valores.map(v => v * 1000);
    const verde = token('global');
    Plotly.react(nodo, [
      { type: 'scatter', mode: 'lines', x, y, line: { color: verde, width: 2, shape: 'spline', smoothing: 0.6 },
        fill: 'tozeroy', fillcolor: 'rgba(30, 215, 96, 0.16)',
        hovertemplate: `Semana del %{x|%d %b %Y}<br><b>%{y:.3s}</b> ${unidad}<extra></extra>` },
      { type: 'scatter', mode: 'markers', x: [x.at(-1)], y: [y.at(-1)], hoverinfo: 'skip',
        marker: { color: verde, size: 9, line: { color: token('panel'), width: 2 } } },
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

  // ---------- Mundo ----------

  /** El #1 global (lo que suena) y cuántos países del mundo (o de la región) lo escuchan, por continente. */
  async function resumen() {
    const mio = ++pedido;
    const ambito = Estado.ambito;
    const global = numero1('global');
    const c = global ? cancion(global.idx) : null;
    await conEspera(mio, precargarPortada(c?.portada));
    if (mio !== pedido) return;
    modo('mundo');
    panel.classList.remove('sin-historia');
    if (c) dibujarCancion(c);
    $('p-contexto').textContent = '#1 global';
    $('p-insignia').hidden = true;
    const { n, total } = cuentaGlobal(ambito);
    const donde = ambito === 'global' ? '' : ` de ${nombreAmbito(ambito)}`;
    $('r-titular').textContent = total ? `La escuchan ${n} de ${paises(total)}${donde}` : 'Sin datos';
    dibujarContinentes();
  }

  /** Una barra por continente: % de sus países (con datos) que escuchan el #1 global. Con menos de MIN_PAISES
      países el % salta entre 0 y 100 y no dice nada: la fila se atenúa (el mismo criterio del eje de tiempo). */
  function dibujarContinentes() {
    $('r-continentes').replaceChildren(...Object.entries(CONTINENTES).map(([k, nombre]) => {
      const { n, total } = cuentaGlobal(k);
      const pocos = total > 0 && total < MIN_PAISES;
      const fila = document.createElement('li');
      fila.className = [Estado.ambito === k ? 'actual' : '', pocos ? 'pocos' : ''].join(' ').trim();
      fila.title = total ? `${n} de ${paises(total)} con datos` : 'Sin datos';
      fila.innerHTML = '<span class="r-cont-nombre"></span><span class="r-cont-barra"><span></span></span><span class="r-cont-valor"></span>';
      fila.querySelector('.r-cont-nombre').textContent = nombre;
      fila.querySelector('.r-cont-barra span').style.width = total ? `${100 * n / total}%` : '0';
      fila.querySelector('.r-cont-valor').textContent = total ? `${n}/${total}` : '—';
      return fila;
    }));
  }

  // ---------- Mensaje (país sin datos) ----------

  function mensaje(titulo, texto) {
    pedido++;                                           // cancela una actualización pendiente
    modo('mensaje');
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
    mostrar, resumen, mensaje, audio,
  };
})();
