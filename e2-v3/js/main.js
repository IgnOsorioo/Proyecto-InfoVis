/* El tocadiscos del mundo, V3: un disco por género. Se elige un país (perilla 1) y un mes (perilla 2); el disco
   puesto (su color) dice el género. El plato gira según la cuota del género en el top 5 de ese país ese mes: si el
   género no suena en ese país, el disco se detiene. En pantalla: la cuota, su curva 2017–2026, la canción más
   escuchada del género (suena su preview, con su portada en grande: el disco que gira es el físico) y el top 5.

   Entradas equivalentes: perillas, botón y sensor de color del Arduino (Web Serial), el lector del celular (V2) y,
   sin hardware, el dial (clic en un país), el control del año, los discos en pantalla y el teclado
   (← → año · ↑ ↓ país · 1–5 disco · 0 sin disco · Espacio pausa). El país no tiene otro selector: es el dial.

   Perillas (R2): el país cambia solo cuando la perilla sale de su zona con margen (histéresis), para que el ruido del
   potenciómetro no haga saltar entre vecinos; el dial en pantalla muestra la aguja y los países vecinos. */

(() => {
  const $ = id => document.getElementById(id);
  const TOP_N = 5;                      // canciones del género que se listan
  const ESPERA_AUDIO_MS = 350;          // al girar la perilla rápido no se encadena un preview por mes
  const SIN_LECTOR_MS = 8000;           // si el celular deja de avisar, se vuelve a los discos en pantalla
  const MARGEN_PAIS = 0.35;             // histéresis: fracción de la zona de un país que hay que pasar para soltarlo
  const MARGEN_ANIO = 0.35;

  const estado = {
    pais: Datos.paises[0].cc,
    anio: Datos.nAnios - 1,             // índice del año (0 = 2017); la curva muestra los meses
    familia: null,                      // familia del disco puesto; null = sin disco
    pausa: false,
    cancion: null,                      // idx de la canción elegida en el top (null: la primera)
  };
  const perilla = { pais: null, anio: null };   // índices que siguen las perillas físicas (histéresis)
  const crudo = { pais: null, anio: null };     // última lectura de cada perilla (0–1): ahí apunta la aguja
  let timerLector = null, timerAudio = null;
  let paisSonando = null;                // para el golpe de estática al cambiar de país
  const PERSONAS_MAX = 50;              // aplausos: 1 persona por cada 2 % de cuota
  let cuotaVisible = null;              // { cc, meses } del país mostrado

  /** Índice de la zona en que cae `valor` (0–1) entre n zonas iguales, pero manteniendo `actual` mientras el valor
      no salga de su zona ampliada en `margen` zonas por cada lado. */
  function zonaConHisteresis(valor, n, actual, margen) {
    const paso = 1 / n;
    const cruda = Math.min(n - 1, Math.floor(valor * n));
    if (actual === null || actual === undefined) return cruda;
    const desde = (actual - margen) * paso, hasta = (actual + 1 + margen) * paso;
    return valor >= desde && valor < hasta ? actual : cruda;
  }

  // ---------- Controles en pantalla ----------
  const discosUI = $('discos');
  for (const d of DISCOS) {
    const b = document.createElement('button');
    b.className = 'disco';
    b.style.setProperty('--color', d.muestra);
    b.dataset.familia = d.familia;
    b.title = `${Datos.nombreFamilia(d.familia)} (disco ${d.nombre.toLowerCase()})`;
    b.innerHTML = `<i></i><span>${Datos.nombreFamilia(d.familia)}</span>`;
    b.addEventListener('click', () => elegirFamilia(estado.familia === d.familia ? null : d.familia));
    discosUI.appendChild(b);
  }
  // Dos diales iguales, uno por perilla: los países y los años. Un clic en una casilla la elige.
  const dial = $('dial'), dialAnio = $('dial-anio');
  function armarDial(contenedor, etiquetas, alElegir) {
    for (const s of [...contenedor.querySelectorAll('span')]) s.remove();
    etiquetas.forEach((texto, i) => {
      const s = document.createElement('span');
      s.textContent = texto;
      s.addEventListener('click', () => { alElegir(i); crudo.pais = crudo.anio = null; cambiar(); });
      contenedor.appendChild(s);
    });
  }
  armarDial(dial, Datos.paises.map(p => p.nombre), i => { estado.pais = Datos.paises[i].cc; });
  const armarDialAnio = () => armarDial(dialAnio, Array.from({ length: Datos.nAnios }, (_, i) => String(Datos.anioDe(i))), i => {
    estado.anio = i; estado.cancion = null;
  });
  armarDialAnio();
  $('pausa').addEventListener('click', () => ponerPausa(!estado.pausa));

  document.addEventListener('keydown', e => {
    if (e.target.matches('select, input')) e.target.blur();
    if (e.key.startsWith('Arrow')) crudo.pais = crudo.anio = null;   // el teclado manda: la aguja va a la casilla
    const iPais = Datos.paises.findIndex(p => p.cc === estado.pais);
    if (e.key === 'ArrowRight') { estado.anio = Math.min(Datos.nAnios - 1, estado.anio + 1); cambiar(); }
    else if (e.key === 'ArrowLeft') { estado.anio = Math.max(0, estado.anio - 1); cambiar(); }
    else if (e.key === 'ArrowDown') { estado.pais = Datos.paises[Math.min(Datos.paises.length - 1, iPais + 1)].cc; cambiar(); }
    else if (e.key === 'ArrowUp') { estado.pais = Datos.paises[Math.max(0, iPais - 1)].cc; cambiar(); }
    else if (e.key === ' ') { e.preventDefault(); ponerPausa(!estado.pausa); }
    else if (e.key >= '1' && e.key <= String(DISCOS.length)) elegirFamilia(DISCOS[+e.key - 1].familia);
    else if (e.key === '0') elegirFamilia(null);
    else return;
    e.preventDefault();
  });

  function elegirFamilia(f) {
    estado.familia = f;
    estado.cancion = null;
    cambiar();
  }

  function ponerPausa(si) {
    estado.pausa = si;
    $('pausa').textContent = si ? 'Reanudar' : 'Pausa';
    $('pausa').setAttribute('aria-pressed', si);
    document.body.classList.toggle('en-pausa', si);
    cambiar();
  }

  function sincronizarControles() {
    for (const b of discosUI.children) b.setAttribute('aria-pressed', b.dataset.familia === estado.familia);
    const iPais = Datos.paises.findIndex(p => p.cc === estado.pais);
    dial.querySelectorAll('span').forEach((s, i) => s.classList.toggle('activo', i === iPais));
    dialAnio.querySelectorAll('span').forEach((s, i) => s.classList.toggle('activo', i === estado.anio));
    ubicarAgujas();
  }

  /** Cada aguja apunta a la lectura cruda de su perilla (se ve hacia dónde va antes de que cambie la casilla);
      sin perilla, al centro de la casilla elegida. */
  function ubicarAgujas() {
    const iPais = Datos.paises.findIndex(p => p.cc === estado.pais);
    const pais = crudo.pais ?? (iPais + 0.5) / Datos.paises.length;
    const anio = crudo.anio ?? (estado.anio + 0.5) / Datos.nAnios;
    $('aguja').style.left = `${(pais * 100).toFixed(2)}%`;
    $('aguja-anio').style.left = `${(anio * 100).toFixed(2)}%`;
  }

  // ---------- Perillas, botón y lector ----------
  // En el encabezado manda la pausa: «Conectar tocadiscos» solo aparece mientras no hay uno conectado (la primera
  // vez el navegador exige un clic para dar permiso; después se reconecta solo).
  Tocadiscos.alCambiar(con => {
    $('tocadiscos').hidden = con || !Tocadiscos.disponible;
    if (!con) { perilla.pais = perilla.anio = null; crudo.pais = crudo.anio = null; ubicarAgujas(); $('serie').hidden = true; }
  });
  Tocadiscos.alMoverPerillas((p, t) => {
    const nuevoPais = zonaConHisteresis(p, Datos.paises.length, perilla.pais, MARGEN_PAIS);
    const nuevoAnio = zonaConHisteresis(t, Datos.nAnios, perilla.anio, MARGEN_ANIO);
    crudo.pais = p; crudo.anio = t;
    ubicarAgujas();
    if (nuevoPais === perilla.pais && nuevoAnio === perilla.anio) return;
    perilla.pais = nuevoPais;
    perilla.anio = nuevoAnio;
    estado.pais = Datos.paises[nuevoPais].cc;
    estado.anio = nuevoAnio;
    cambiar();
  });
  Tocadiscos.alApretarBoton(ponerPausa);
  // Diagnóstico: el último mensaje del Arduino, para ver si llegan datos (se apaga si deja de llegar).
  let timerSerie = null;
  Tocadiscos.alRecibir((linea, esError) => {
    const el = $('serie');
    el.hidden = false;
    el.textContent = esError ? linea : `Arduino: ${linea}`;
    el.classList.toggle('error', !!esError);
    clearTimeout(timerSerie);
    if (!esError) timerSerie = setTimeout(() => { el.textContent = 'Arduino: sin mensajes'; el.classList.add('error'); }, 5000);
  });
  // Sensor RGB (V3): la cara del cubo que se le muestra elige el disco; sin nada delante, no hay disco.
  // Como en un tocadiscos, el disco se cambia con el plato detenido: mientras gira, el sensor no cambia nada
  // (aunque se mueva o se saque el cubo). Solo se acepta un color con el sistema en pausa o si aún no hay disco.
  Tocadiscos.alVerColor(color => {
    mostrarLector();
    if (color && !discoPorId(color)) return;          // un color que no es disco (el blanco del cubo)
    if (!estado.pausa && estado.familia) return;
    const familia = color ? discoPorId(color)?.familia ?? null : null;
    if (familia !== estado.familia) elegirFamilia(familia);
  });
  if (Tocadiscos.disponible) {
    $('tocadiscos').hidden = false;
    $('tocadiscos').addEventListener('click', () => { if (!Tocadiscos.conectado) Tocadiscos.alternar(); });
    Tocadiscos.reconectar();
  }

  if (typeof Protobject !== 'undefined') {
    Protobject.Core.onReceived(mensaje => {
      if (!mensaje || !('disco' in mensaje)) return;
      mostrarLector();
      const disco = discoPorId(mensaje.disco);
      const familia = disco?.familia ?? null;
      if (familia !== estado.familia) elegirFamilia(familia);
    });
  }

  /** «Lector de discos conectado» mientras el sensor (o el celular) siga avisando. */
  function mostrarLector() {
    $('lector').hidden = false;
    clearTimeout(timerLector);
    timerLector = setTimeout(() => { $('lector').hidden = true; }, SIN_LECTOR_MS);
  }

  // ---------- Audio ----------
  // El sonido está siempre activo. Los navegadores no dejan sonar una página hasta el primer gesto de la persona
  // (un clic o una tecla en cualquier parte): ese primer gesto desbloquea la canción, los aplausos y la estática.
  let audioLibre = !!navigator.userActivation?.hasBeenActive;
  Reproductor.habilitar(); Aplausos.iniciar(); Estatica.iniciar();
  function liberarAudio() {
    if (audioLibre) return;
    audioLibre = true;
    Reproductor.habilitar(); Aplausos.iniciar(); Estatica.iniciar();   // dentro del gesto
    Reproductor.detener();                                              // vuelve a pedir la canción actual
    $('estado-audio').textContent = '';
    cambiar();
  }
  addEventListener('pointerdown', liberarAudio, { capture: true });
  addEventListener('keydown', liberarAudio, { capture: true });
  if (!audioLibre) $('estado-audio').textContent = 'Haz clic en la pantalla para activar el sonido';
  Reproductor.alCambiar(est => {
    $('estado-audio').textContent = !audioLibre
      ? 'Haz clic en la pantalla para activar el sonido'
      : { cargando: 'Cargando…', 'sin-preview': 'Sin preview', silencio: '', sonando: '' }[est] ?? '';
  });

  // ---------- Dibujo ----------
  const colorDe = f => discoPorFamilia(f)?.muestra || '#8a8a8a';

  async function cambiar() {
    sincronizarControles();
    const cc = estado.pais;
    let datos;
    try { datos = await Datos.cuotas(cc); } catch { datos = null; }
    if (cc !== estado.pais) return;     // ya se eligió otro país
    cuotaVisible = datos ? { cc, meses: datos.meses, anios: datos.anios || [] } : null;
    estado.anio = Math.min(estado.anio, Datos.nAnios - 1);
    dibujar();
  }

  function dibujar() {
    const pais = Datos.paises.find(p => p.cc === estado.pais);
    const fam = estado.familia;
    const fi = fam ? Datos.familias.indexOf(fam) : -1;
    const anioDatos = cuotaVisible?.anios[estado.anio] || null;   // [cuotas×6, tops×6]
    const cuota = anioDatos && fi >= 0 ? anioDatos[0][fi] / 100 : 0;
    const top = anioDatos && fi >= 0 ? anioDatos[1][fi] : [];
    const sinDatos = !anioDatos;
    const cuando = String(Datos.anioDe(estado.anio));

    $('pais-nombre').textContent = pais.nombre;
    $('anio').textContent = cuando;
    document.body.classList.toggle('sin-disco', !fam);
    document.body.style.setProperty('--color-disco', colorDe(fam));

    $('cuota').classList.toggle('vacio', !fam || sinDatos);
    if (!fam) {
      $('cuota').textContent = 'Sin disco';
      $('frase').textContent = 'Muéstrale una cara del cubo al sensor para elegir un género.';
    } else if (sinDatos) {
      $('cuota').textContent = 'Sin datos';
      $('frase').textContent = `${pais.nombre} no tiene chart en ${cuando}.`;
    } else {
      // El disco verde no es un género: es la música de artistas del país que está en la perilla.
      const que = fam === 'local' ? `de artistas de ${pais.nombre}` : Datos.nombreFamilia(fam).toLowerCase();
      $('cuota').textContent = `${Math.round(cuota * 100)} %`;
      $('frase').textContent = (cuota > 0
        ? `de lo que se escuchó en ${pais.nombre} en ${cuando} fue ${que}.`
        : `En ${cuando}, casi nada de lo que se escuchó en ${pais.nombre} fue ${que}.`).replace(/\.\.$/, '.');   // «EE. UU.»
    }
    $('genero-nombre').textContent = !fam ? 'Sin disco' : fam === 'local' ? `Local · de ${pais.nombre}` : Datos.nombreFamilia(fam);
    if (estado.pausa) $('frase').textContent = fam
      ? 'En pausa: muéstrale otra cara del cubo al sensor para cambiar el disco y aprieta el botón para seguir.'
      : 'En pausa: muéstrale una cara del cubo al sensor y aprieta el botón para seguir.';
    $('top-titulo').textContent = fam === 'local' ? `Top 5 de artistas de ${pais.nombre} ese año` : 'Top 5 del género ese año';
    $('top-vacio').textContent = !fam ? 'Elige un género para ver sus cinco canciones más escuchadas.' : fam === 'local'
      ? `Ningún artista de ${pais.nombre} entró al top 200 ese año.`
      : 'Ninguna canción de este género entró al top 200 ese año.';

    // Velocidad del disco físico (en pantalla el disco no se dibuja: el disco real está sobre el plato).
    Tocadiscos.ponerDisco(!!fam);
    Tocadiscos.fijarVelocidad(estado.pausa ? 0 : cuota);
    sonificar(fam, cuota, sinDatos);

    dibujarCurva(fi, cuota, sinDatos);
    dibujarTop(top);
    const elegida = top.includes(estado.cancion) ? estado.cancion : (top[0] ?? null);
    dibujarCarrusel(fi, elegida);
    dibujarCancion(elegida);
    programarAudio(elegida);
  }

  /** El sonido sigue al disco: aplausos según la cuota mientras gira, estática si el país no tiene chart ese año y
      un golpe de estática al pasar de un país a otro, como al sintonizar una radio. La pausa calla todo. */
  function sonificar(fam, cuota, sinDatos) {
    if (paisSonando !== null && paisSonando !== estado.pais && !estado.pausa) Estatica.sintonizar();
    paisSonando = estado.pais;
    const gira = !!fam && !sinDatos && !estado.pausa && cuota > 0;
    Aplausos.actualizar(gira ? Math.max(1, Math.round(cuota * PERSONAS_MAX)) : 0, PERSONAS_MAX);
    Aplausos.continuo(gira);
    Estatica.sonar(sinDatos && !estado.pausa);
  }

  function dibujarCurva(fi, cuotaAnio, sinDatos) {
    const svg = $('curva');
    const meses = cuotaVisible?.meses || [];
    const n = Datos.nMeses;
    const W = 600, H = 120, pad = 2;
    const x = m => pad + (m / Math.max(1, n - 1)) * (W - 2 * pad);
    const y = v => H - pad - (v / 100) * (H - 2 * pad);
    let linea = '', area = '';
    if (fi >= 0) {
      const pts = [];
      for (let m = 0; m < n; m++) if (meses[m]) pts.push(`${x(m).toFixed(1)},${y(meses[m][fi]).toFixed(1)}`);
      if (pts.length) {
        linea = pts.join(' ');
        const primero = pts[0].split(',')[0], ultimo = pts[pts.length - 1].split(',')[0];
        area = `${primero},${H} ${linea} ${ultimo},${H}`;
      }
    }
    svg.querySelector('.area').setAttribute('points', area);
    svg.querySelector('.linea').setAttribute('points', linea);
    // Banda del año elegido y su cuota anual como nivel.
    const [m0, m1] = Datos.mesesDelAnio(estado.anio);   // la curva mensual va por meses; el año se marca con una banda
    const medioPaso = (W - 2 * pad) / Math.max(1, n - 1) / 2;
    const banda = svg.querySelector('.banda');
    banda.setAttribute('x', x(m0) - medioPaso);
    banda.setAttribute('width', x(m1) - x(m0) + 2 * medioPaso);
    const nivel = svg.querySelector('.nivel');
    const hayNivel = fi >= 0 && !sinDatos;
    nivel.setAttribute('x1', x(m0) - medioPaso); nivel.setAttribute('x2', x(m1) + medioPaso);
    nivel.setAttribute('y1', hayNivel ? y(cuotaAnio * 100) : -10); nivel.setAttribute('y2', hayNivel ? y(cuotaAnio * 100) : -10);
    $('curva-desde').textContent = Datos.fechaDeMes(0).anio;
    $('curva-hasta').textContent = Datos.fechaDeMes(n - 1).anio;
  }

  function dibujarTop(top) {
    const ol = $('top');
    ol.innerHTML = '';
    top.slice(0, TOP_N).forEach((idx, i) => {
      const c = Datos.cancion(idx);
      if (!c) return;
      const li = document.createElement('li');
      li.innerHTML = `<img alt="" loading="lazy"><b></b><span class="titulo"></span><span class="artista"></span>`;
      li.querySelector('img').src = c.portada;
      li.querySelector('img').hidden = !c.portada;             // sin portada conocida no se muestra el ícono roto
      li.querySelector('b').textContent = i + 1;
      li.querySelector('.titulo').textContent = c.titulo;
      li.querySelector('.artista').textContent = c.artistas;
      li.dataset.idx = idx;
      li.addEventListener('click', () => { estado.cancion = idx; dibujar(); });   // idx: id de Spotify
      ol.appendChild(li);
    });
    $('top-vacio').hidden = top.length > 0;
  }

  /** Carrusel: la portada del año elegido al centro; a los lados, la canción más escuchada del género el año anterior
      y el siguiente. Las figuras se reutilizan por año para que la transición de posición sea continua. */
  const carrusel = $('carrusel');
  let anioCarrusel = null;
  function portadaDelAnio(a, fi, elegida) {
    if (a < 0 || a >= Datos.nAnios) return undefined;               // fuera de la línea de tiempo: sin figura
    const datos = cuotaVisible?.anios[a];
    const idx = a === estado.anio ? elegida : (fi >= 0 && datos ? datos[1][fi][0] ?? null : null);
    return idx === null || idx === undefined ? null : Datos.cancion(idx);
  }
  function dibujarCarrusel(fi, elegida) {
    const roles = [[estado.anio - 1, 'previa', 'entra-izq'], [estado.anio, 'actual', null], [estado.anio + 1, 'siguiente', 'entra-der']];
    const vivas = new Set();
    const haciaAdelante = anioCarrusel === null ? null : estado.anio > anioCarrusel;
    for (const [a, rol, entrada] of roles) {
      const c = portadaDelAnio(a, fi, elegida);
      if (c === undefined) continue;
      const clave = `${estado.pais}-${a}`;
      let fig = carrusel.querySelector(`[data-clave="${clave}"]`);
      if (!fig) {
        fig = document.createElement('figure');
        fig.dataset.clave = clave;
        fig.innerHTML = '<img alt=""><div class="vacio"></div><span class="anio"></span>';
        // Entra desde el lado por el que avanza la línea de tiempo (o desde el centro si cambió el país).
        fig.className = entrada && haciaAdelante !== null && anioCarrusel !== null && cuotaVisible?.cc === estado.pais ? entrada : '';
        fig.addEventListener('click', () => { if (!fig.classList.contains('actual')) { estado.anio = a; estado.cancion = null; cambiar(); } });
        carrusel.appendChild(fig);
        void fig.offsetWidth;                                           // fija la posición inicial antes de animar
      }
      fig.querySelector('img').src = c?.portada || '';
      fig.querySelector('img').hidden = !c?.portada;
      fig.querySelector('.vacio').hidden = !!c?.portada;
      fig.querySelector('.vacio').textContent = !estado.familia ? 'Elige un color' : c ? `${c.titulo}\n${c.artistas}` : 'Sin canción';
      fig.querySelector('.anio').textContent = Datos.anioDe(a);
      fig.className = rol;
      vivas.add(fig);
    }
    for (const fig of [...carrusel.children]) {
      if (vivas.has(fig)) continue;
      fig.className = fig.classList.contains('previa') || (haciaAdelante && !fig.classList.contains('siguiente')) ? 'entra-izq' : 'entra-der';
      setTimeout(() => fig.remove(), 500);
    }
    anioCarrusel = estado.anio;
  }

  function dibujarCancion(idx) {
    const c = idx === null ? null : Datos.cancion(idx);
    $('cancion-titulo').textContent = c?.titulo || '';
    $('cancion-artista').textContent = c?.artistas || '';
    $('cancion-album').textContent = c?.album && c.album !== c.titulo ? `Álbum: ${c.album}` : '';
    for (const li of $('top').children) li.classList.toggle('elegida', li.dataset.idx === String(idx));
  }

  function programarAudio(idx) {
    clearTimeout(timerAudio);
    if (idx === null || estado.pausa) { Reproductor.detener(); return; }
    timerAudio = setTimeout(() => Reproductor.tocar(Datos.cancion(idx)), ESPERA_AUDIO_MS);
  }

  Datos.listo.then(() => {
    estado.anio = Datos.nAnios - 1;
    armarDialAnio();
    cambiar();
  });
})();
