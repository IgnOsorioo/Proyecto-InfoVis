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
    const corte = popularidad ? hasta - popularidad.inicio : 0;     // índice de la semana de la fecha en la serie
    const total = popularidad ? popularidad.valores.slice(0, Math.max(0, corte + 1)).reduce((a, b) => a + b, 0) * 1000 : 0;
    const vistas = c.fuente === 'YouTube Music';
    $('p-reproducciones-titulo').textContent = vistas ? 'Vistas' : 'Reproducciones';
    $('p-reproducciones').textContent = total ? textoCantidad(total) : '—';
    $('p-popularidad-titulo').textContent = vistas ? 'Vistas por semana en YouTube' : 'Reproducciones por semana';
    dibujarGrafico(popularidad, hasta, vistas ? 'vistas' : 'reproducciones');
  }

  /** Popularidad de toda la vida de la canción (hasta hoy), partida en la fecha de la visualización: lo anterior
      en verde y lo posterior (su futuro respecto de esa fecha) en gris, con una franja en la fecha. Al reproducir
      el tiempo, la franja avanza y el verde va cubriendo el gráfico. Las dos partes son líneas rectas entre
      semanas: con curvas suavizadas no calzarían en la franja. */
  function dibujarGrafico(popularidad, semanaActual, unidad) {
    const nodo = $('p-grafico');
    const aviso = $('p-grafico-aviso');
    if (!popularidad?.valores.length) {
      aviso.textContent = 'Sin datos';
      aviso.hidden = false;
      Plotly.purge(nodo);
      return;
    }
    aviso.hidden = true;
    const { inicio, valores } = popularidad;
    const x = valores.map((_, i) => fechaSemana(inicio + i));
    const y = valores.map(v => v * 1000);
    const k = semanaActual - inicio;                     // < 0: aún no entra a los charts; ≥ largo: ya salió
    const pasado = k < 0 ? 0 : Math.min(k + 1, x.length);
    const futuro = Math.max(0, Math.min(k, x.length));   // la semana de la fecha es el borde de las dos partes
    const actual = fechaSemana(semanaActual);
    const desde = actual < x[0] ? actual : x[0], hasta = actual > x.at(-1) ? actual : x.at(-1);
    const semanas = (new Date(hasta) - new Date(desde)) / (7 * DIA_MS);
    const formatoEje = semanas <= 20 ? '%d %b' : semanas <= 110 ? '%b %Y' : '%Y';
    const margen = (fecha, signo) => new Date(new Date(fecha).getTime() + signo * 3.5 * DIA_MS).toISOString().slice(0, 10);   // media semana: los puntos de los bordes no quedan cortados
    const verde = token('global'), gris = token('otra');
    const corta = x.length <= 3;                         // con 1–3 semanas la línea casi no se ve: se marcan los puntos
    const parte = (ini, fin, color, relleno) => ({
      type: 'scatter', mode: corta ? 'lines+markers' : 'lines', x: x.slice(ini, fin), y: y.slice(ini, fin),
      line: { color, width: 2 }, marker: { color, size: 7 }, fill: 'tozeroy', fillcolor: relleno,
      hovertemplate: `Semana del %{x|%d %b %Y}<br><b>%{y:.3s}</b> ${unidad}<extra></extra>`,
    });
    Plotly.react(nodo, [
      parte(futuro, x.length, gris, 'rgba(89, 89, 89, 0.22)'),
      parte(0, pasado, verde, 'rgba(30, 215, 96, 0.18)'),
    ], {
      height: Math.max(96, nodo.parentElement.clientHeight),
      margin: { l: 34, r: 8, t: 4, b: 20 },
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      showlegend: false,
      font: { family: token('fuente'), size: 10, color: token('tinta-3') },
      hoverlabel: { bgcolor: token('superficie'), bordercolor: token('eje'), font: { family: token('fuente'), size: 12, color: token('tinta') } },
      xaxis: { showgrid: false, zeroline: false, linecolor: token('eje'), fixedrange: true, nticks: 4, tickformat: formatoEje, range: [margen(desde, -1), margen(hasta, 1)] },
      yaxis: { gridcolor: token('grilla'), zeroline: false, tickformat: '~s', fixedrange: true, nticks: 4, range: [0, Math.max(...y) * 1.08] },
      shapes: [{ type: 'line', xref: 'x', yref: 'paper', x0: actual, x1: actual, y0: 0, y1: 1, line: { color: token('tinta'), width: 2 } }],
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
    const { n } = cuentaGlobal(ambito);
    const donde = ambito === 'global' ? '' : ` de ${nombreAmbito(ambito)}`;
    $('r-titular').textContent = `La escuchan ${n} de ${paises(totalPaises(ambito))}${donde}`;
    dibujarContinentes();
  }

  /** Una barra por continente: cuántos de sus países escuchan el #1 global, sobre el total real de países del
      continente (fijo en el tiempo). El título dice cuántos tienen datos en la fecha. */
  function dibujarContinentes() {
    $('r-continentes').replaceChildren(...Object.entries(CONTINENTES).map(([k, nombre]) => {
      const { n, total: conDatos } = cuentaGlobal(k);
      const total = totalPaises(k);
      const fila = document.createElement('li');
      fila.className = Estado.ambito === k ? 'actual' : '';
      fila.title = `${conDatos} de ${paises(total)} con datos en esta fecha`;
      fila.innerHTML = '<span class="r-cont-nombre"></span><span class="r-cont-barra"><span></span></span><span class="r-cont-valor"></span>';
      fila.querySelector('.r-cont-nombre').textContent = nombre;
      fila.querySelector('.r-cont-barra span').style.width = `${100 * n / total}%`;
      fila.querySelector('.r-cont-valor').textContent = `${n}/${total}`;
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
