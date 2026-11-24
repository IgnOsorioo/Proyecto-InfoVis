/* El tocadiscos del mundo, V4: los discos más vendidos por década.

   Perilla 1: país (6). Perilla 2: década (1970–2020). El disco puesto (su color) es el género. El plato gira según
   qué parte de los álbumes vendidos en ese país y esa década fue de ese género; si no hay ventas conocidas para esa
   década, el disco se detiene y suena estática, como una radio sin señal.

   R3 (profesor): quitar información y llevar todo a lo físico; sin gráficos. En pantalla quedan los mismos diales de
   la V3 (con la aguja que sigue cada perilla), el carrusel de portadas (la década anterior y la siguiente a los
   lados), el porcentaje de las ventas que fue del género (22-nov: el dato que mueve el plato, ahora también escrito)
   y el top 5 de álbumes más vendidos del género.
   Thinking aloud (R3): suenan por turnos los cinco álbumes del top, unos segundos cada uno; un clic en uno lo elige.

   Entradas equivalentes: perillas, botón y sensor de color del Arduino (Web Serial) y, sin hardware, los diales
   (clic en una casilla), los discos en pantalla y el teclado
   (← → década · ↑ ↓ país · 1–4 disco · 0 sin disco · Espacio pausa). */

(() => {
  const $ = id => document.getElementById(id);
  const ROTAR_MS = 8000;              // cuánto suena cada álbum del top 5 antes de pasar al siguiente
  const ESPERA_AUDIO_MS = 350;        // al girar la perilla rápido no se encadena un preview por posición
  const SIN_LECTOR_MS = 8000;
  const MARGEN = 0.35;                // histéresis (R2): fracción de la zona que hay que pasar para soltarla
  // Parte útil del giro del potenciómetro (0–1): los extremos quedan para la primera y la última marca. Ajustar
  // cuando se grabe el dial: con ~300° de giro y 240° grabados, las marcas van de 0,1 a 0,9.
  const RANGO = [0.1, 0.9];

  const estado = { pais: 0, decada: Datos.decadas.length - 1, familia: null, pausa: false, turno: 0 };
  const perilla = { pais: null, decada: null };   // zonas que siguen las perillas físicas (histéresis)
  const crudo = { pais: null, decada: null };     // última lectura de cada perilla (0–1): ahí apunta la aguja
  let timerRotar = null, timerAudio = null, timerLector = null, paisSonando = null;

  /** Lectura de la perilla (0–1) llevada al tramo grabado del dial. */
  const enDial = v => Math.min(1, Math.max(0, (v - RANGO[0]) / (RANGO[1] - RANGO[0])));

  /** Zona en que cae `v` (0–1) entre n iguales, manteniendo `actual` mientras no salga de su zona ampliada. */
  function zona(v, n, actual) {
    const cruda = Math.min(n - 1, Math.floor(v * n));
    if (actual === null) return cruda;
    const desde = (actual - MARGEN) / n, hasta = (actual + 1 + MARGEN) / n;
    return v >= desde && v < hasta ? actual : cruda;
  }

  // ---------- Controles en pantalla ----------
  const discosUI = $('discos');
  for (const d of DISCOS) {
    const b = document.createElement('button');
    b.className = 'disco';
    b.style.setProperty('--color', d.acento || d.muestra);
    b.style.setProperty('--relleno', d.muestra);
    b.dataset.familia = d.familia;
    b.title = `${Datos.nombreGenero(d.familia)} (disco ${d.nombre.toLowerCase()})`;
    b.innerHTML = `<i></i><span>${Datos.nombreGenero(d.familia)}</span>`;
    b.addEventListener('click', () => elegirFamilia(estado.familia === d.familia ? null : d.familia));
    discosUI.appendChild(b);
  }

  // Dos diales iguales, uno por perilla: los países y las décadas. Un clic en una casilla la elige.
  const dial = $('dial'), dialDecada = $('dial-decada');
  function armarDial(contenedor, etiquetas, alElegir) {
    etiquetas.forEach((texto, i) => {
      const s = document.createElement('span');
      s.textContent = texto;
      s.addEventListener('click', () => { alElegir(i); crudo.pais = crudo.decada = null; cambiar(); });
      contenedor.appendChild(s);
    });
  }
  armarDial(dial, Datos.paises.map(p => p.nombre), i => { estado.pais = i; });
  armarDial(dialDecada, Datos.decadas.map(d => d.nombre), i => { estado.decada = i; });
  $('pausa').addEventListener('click', () => ponerPausa(!estado.pausa));

  document.addEventListener('keydown', e => {
    if (e.key.startsWith('Arrow')) crudo.pais = crudo.decada = null;   // el teclado manda: la aguja va a la casilla
    if (e.key === 'ArrowRight') estado.decada = Math.min(Datos.decadas.length - 1, estado.decada + 1);
    else if (e.key === 'ArrowLeft') estado.decada = Math.max(0, estado.decada - 1);
    else if (e.key === 'ArrowDown') estado.pais = Math.min(Datos.paises.length - 1, estado.pais + 1);
    else if (e.key === 'ArrowUp') estado.pais = Math.max(0, estado.pais - 1);
    else if (e.key === ' ') { e.preventDefault(); ponerPausa(!estado.pausa); return; }
    else if (e.key >= '1' && e.key <= String(DISCOS.length)) { elegirFamilia(DISCOS[+e.key - 1].familia); return; }
    else if (e.key === '0') { elegirFamilia(null); return; }
    else return;
    e.preventDefault();
    cambiar();
  });

  function elegirFamilia(f) { estado.familia = f; cambiar(); }

  function ponerPausa(si) {
    estado.pausa = si;
    $('pausa').textContent = si ? 'Reanudar' : 'Pausa';
    $('pausa').setAttribute('aria-pressed', si);
    document.body.classList.toggle('en-pausa', si);
    cambiar(false);
  }

  function sincronizar() {
    for (const b of discosUI.children) b.setAttribute('aria-pressed', b.dataset.familia === estado.familia);
    dial.querySelectorAll('span').forEach((s, i) => s.classList.toggle('activo', i === estado.pais));
    dialDecada.querySelectorAll('span').forEach((s, i) => s.classList.toggle('activo', i === estado.decada));
    ubicarAgujas();
  }

  /** Cada aguja apunta a la lectura cruda de su perilla (se ve hacia dónde va antes de que cambie la casilla);
      sin perilla, al centro de la casilla elegida. */
  function ubicarAgujas() {
    const p = crudo.pais ?? (estado.pais + 0.5) / Datos.paises.length;
    const d = crudo.decada ?? (estado.decada + 0.5) / Datos.decadas.length;
    $('aguja').style.left = `${(p * 100).toFixed(2)}%`;
    $('aguja-decada').style.left = `${(d * 100).toFixed(2)}%`;
  }

  // ---------- Tocadiscos: perillas, botón y sensor ----------
  Tocadiscos.alCambiar(con => {
    $('tocadiscos').hidden = con || !Tocadiscos.disponible;
    if (!con) { perilla.pais = perilla.decada = null; crudo.pais = crudo.decada = null; ubicarAgujas(); }
  });
  Tocadiscos.alMoverPerillas((p, t) => {
    crudo.pais = enDial(p); crudo.decada = enDial(t);
    const np = zona(crudo.pais, Datos.paises.length, perilla.pais);
    const nd = zona(crudo.decada, Datos.decadas.length, perilla.decada);
    ubicarAgujas();
    if (np === perilla.pais && nd === perilla.decada) return;
    perilla.pais = np; perilla.decada = nd;
    estado.pais = np; estado.decada = nd;
    cambiar();
  });
  Tocadiscos.alApretarBoton(() => ponerPausa(!estado.pausa));   // la pausa la lleva solo la página
  // El disco que ve el sensor manda siempre, gire o no el plato (22-nov: antes solo en pausa, y como el botón fallaba
  // el cambio de disco parecía no detectarse). Los colores dudosos (poniendo o sacando el disco) ya los descarta el
  // Arduino, que además pide 3 lecturas iguales para un color y ~1 s para «sin disco».
  Tocadiscos.alVerColor(color => {
    $('lector').hidden = false;
    clearTimeout(timerLector);
    timerLector = setTimeout(() => { $('lector').hidden = true; }, SIN_LECTOR_MS);
    if (color && !discoPorId(color)) return;
    const familia = color ? discoPorId(color).familia : null;
    if (familia !== estado.familia) elegirFamilia(familia);
  });
  if (Tocadiscos.disponible) {
    $('tocadiscos').hidden = false;
    $('tocadiscos').addEventListener('click', () => { if (!Tocadiscos.conectado) Tocadiscos.alternar(); });
    Tocadiscos.reconectar();
  }

  // ---------- Audio ----------
  let audioLibre = !!navigator.userActivation?.hasBeenActive;
  Reproductor.habilitar(); Ovacion.iniciar(); Estatica.iniciar();
  function liberarAudio() {
    if (audioLibre) return;
    audioLibre = true;
    Reproductor.habilitar(); Ovacion.iniciar(); Estatica.iniciar();
    Reproductor.detener();
    cambiar(false);
  }
  addEventListener('pointerdown', liberarAudio, { capture: true });
  addEventListener('keydown', liberarAudio, { capture: true });
  const avisoAudio = () => { $('estado-audio').textContent = audioLibre ? '' : 'Haz clic en la pantalla para activar el sonido'; };
  avisoAudio();
  Reproductor.alCambiar(est => {
    if (!audioLibre) return avisoAudio();
    $('estado-audio').textContent = { cargando: 'Cargando…', 'sin-preview': 'Sin muestra de audio' }[est] ?? '';
  });

  // ---------- Dibujo ----------
  let lect = null;

  /** Recalcula la lectura; con `reiniciar` vuelve al primer álbum del top (cambió país, década o disco). */
  function cambiar(reiniciar = true) {
    sincronizar();
    const pais = Datos.paises[estado.pais];
    lect = Datos.lectura(pais.cc, estado.decada, estado.familia);
    if (reiniciar) estado.turno = 0;
    const fam = estado.familia;
    document.body.classList.toggle('sin-disco', !fam);
    document.body.classList.toggle('sin-datos', !!fam && lect.sinDatos);
    document.body.style.setProperty('--color-disco', (discoPorFamilia(fam)?.acento || discoPorFamilia(fam)?.muestra) || '#8a8a8a');

    Tocadiscos.ponerDisco(!!fam);
    Tocadiscos.fijarVelocidad(estado.pausa || !fam ? 0 : lect.cuota);
    sonificar();
    mostrarCuota();
    mostrarTurno(true);
  }

  /** El porcentaje de las ventas del país y la década que fue del género: el mismo dato que mueve el plato y la
      ovación. La cifra corre desde la anterior hasta la nueva para que se note el cambio. */
  let cuotaVista = 0, animCuota = 0;
  const formatoCuota = v => `${v.toLocaleString('es-CL', { maximumFractionDigits: v > 0 && v < 10 ? 1 : 0 })} %`;
  function mostrarCuota() {
    const fam = estado.familia, pais = Datos.paises[estado.pais], dec = Datos.decadas[estado.decada];
    $('cuota-marco').classList.toggle('oculto', !fam);   // 24-nov: conserva su lugar
    if (!fam) return;
    const cifra = $('cuota-cifra');
    cancelAnimationFrame(animCuota);
    if (lect.sinDatos) {
      cifra.textContent = '–';
      $('cuota-texto').textContent = `Sin registro de ventas en ${pais.nombre} en los ${dec.corto}`;
      cuotaVista = 0;
      return;
    }
    const meta = Math.round(lect.cuota * 1000) / 10, desde = cuotaVista, t0 = performance.now();
    const paso = ahora => {
      const k = Math.min(1, Math.max(0, (ahora - t0) / 700));
      const v = desde + (meta - desde) * (1 - Math.pow(1 - k, 3));
      cifra.textContent = formatoCuota(k < 1 ? Math.round(v * 10) / 10 : meta);
      if (k < 1) animCuota = requestAnimationFrame(paso);
    };
    animCuota = requestAnimationFrame(paso);
    cuotaVista = meta;
    $('cuota-texto').textContent = `de las copias de álbumes vendidas en ${pais.nombre} en los ${dec.corto} `
      + `fueron de ${Datos.nombreGenero(fam).toLowerCase()}`;
  }

  function sonificar() {
    const fam = estado.familia;
    if (paisSonando !== null && paisSonando !== estado.pais && !estado.pausa) Estatica.sintonizar();
    paisSonando = estado.pais;
    const gira = !!fam && !lect.sinDatos && !estado.pausa && lect.cuota > 0;
    // Una ovación breve al llegar a otro país, década o disco (ovacion.js), no un público constante.
    Ovacion.actualizar(gira ? lect.cuota : null, `${estado.pais}|${estado.decada}|${fam}`);
    Estatica.sonar(!!fam && lect.sinDatos && !estado.pausa);
  }

  /** Dibuja el álbum del turno actual (carrusel, leyenda y top 5) y programa el siguiente. Con `crescendo` (cambió
      país, década o disco, o se reanudó) la canción entra baja y sube de a poco (reproductor.js), y ese primer álbum
      se queda lo que dura el crescendo más su turno normal. */
  function mostrarTurno(crescendo = false) {
    clearTimeout(timerRotar);
    const fam = estado.familia, pais = Datos.paises[estado.pais], dec = Datos.decadas[estado.decada];
    const top = fam && !lect.sinDatos ? lect.top : [];
    const a = top.length ? top[estado.turno % top.length] : null;

    $('album-titulo').textContent = a?.album || '';
    $('album-artista').textContent = a?.artista || '';
    $('album-nota').textContent = a ? `${Datos.copiasTexto(a.unidades)} en ${pais.nombre}${a.anio ? ` · ${a.anio}` : ''}` : '';
    $('album-cancion-nombre').textContent = a?.cancion || '';
    $('album-cancion').classList.toggle('oculto', !a?.cancion);

    // 22-nov: «Rock · Alemania · años 2010» no decía qué era la lista; ahora la frase completa.
    $('top-titulo').textContent = `Top 5 álbumes${fam ? ` de ${Datos.nombreGenero(fam).toLowerCase()}` : ''} más vendidos`
      + ` en ${pais.nombre} (década de ${dec.d})`;
    dibujarTop(top, a);
    // De dónde sale el top: de todos los álbumes con ventas registradas en el país y la década (22-nov: «entre los más
    // vendidos» se leía como si hubiera una lista previa de éxitos). Se explica cuando el género tiene menos de 5.
    const genero = fam ? Datos.nombreGenero(fam).toLowerCase() : '';
    const de = `de los ${lect.albumes} álbumes con ventas registradas en ${pais.nombre} en los ${dec.corto}`;
    $('top-vacio').hidden = top.length >= 5;
    $('top-vacio').textContent = !fam ? 'Pon un disco en el plato para ver los cinco álbumes más vendidos del género.'
      : lect.sinDatos ? `Sin registro de ventas en ${pais.nombre} en los ${dec.corto}.`
      : top.length === 0 ? `Ninguno ${de} es de ${genero}.`
      : `Solo ${top.length === 1 ? 'uno' : top.length} ${de} ${top.length === 1 ? 'es' : 'son'} de ${genero}.`;

    dibujarCarrusel(a);

    clearTimeout(timerAudio);
    if (!a || estado.pausa) Reproductor.detener();
    else timerAudio = setTimeout(() => Reproductor.tocar(a, { crescendo }), ESPERA_AUDIO_MS);
    const espera = ROTAR_MS + (crescendo ? Reproductor.CRESCENDO_MS : 0);
    if (top.length > 1 && !estado.pausa) timerRotar = setTimeout(() => { estado.turno++; mostrarTurno(); }, espera);
  }

  function dibujarTop(top, elegido) {
    const ol = $('top');
    ol.innerHTML = '';
    top.forEach((a, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<img alt="" loading="lazy"><b></b><span class="titulo"></span><span class="artista"></span>`;
      li.querySelector('img').src = a.portada || '';
      li.querySelector('img').hidden = !a.portada;            // sin portada conocida no se muestra el ícono roto
      li.querySelector('b').textContent = i + 1;
      li.querySelector('.titulo').textContent = a.album;
      li.querySelector('.artista').textContent = `${a.artista} · ${Datos.copias(a.unidades)}`;
      li.classList.toggle('elegida', a === elegido);
      li.addEventListener('click', () => { estado.turno = i; mostrarTurno(); });
      ol.appendChild(li);
    });
  }

  /** Carrusel (V3): al centro la portada del álbum que suena; a los lados, el álbum más vendido del género en la
      década anterior y en la siguiente. Las figuras se reutilizan por década para que el corrimiento sea continuo. */
  const carrusel = $('carrusel');
  let decadaCarrusel = null, paisCarrusel = null;
  function albumDeLaDecada(i, elegido) {
    if (i < 0 || i >= Datos.decadas.length) return undefined;    // fuera del dial: sin figura
    if (i === estado.decada) return elegido;
    if (!estado.familia) return null;
    return Datos.lectura(Datos.paises[estado.pais].cc, i, estado.familia).top[0] || null;
  }
  function dibujarCarrusel(elegido) {
    const i0 = estado.decada;
    const roles = [[i0 - 1, 'previa', 'entra-izq'], [i0, 'actual', null], [i0 + 1, 'siguiente', 'entra-der']];
    const vivas = new Set();
    const mismoPais = paisCarrusel === estado.pais;
    const haciaAdelante = decadaCarrusel === null ? null : i0 > decadaCarrusel;
    for (const [i, rol, entrada] of roles) {
      const a = albumDeLaDecada(i, elegido);
      if (a === undefined) continue;
      const clave = `${estado.pais}-${i}`;
      let fig = carrusel.querySelector(`[data-clave="${clave}"]`);
      if (!fig) {
        fig = document.createElement('figure');
        fig.dataset.clave = clave;
        fig.innerHTML = '<img alt=""><div class="vacio"></div><span class="anio"></span>';
        // Entra desde el lado por el que avanza el dial (o desde el centro si cambió el país).
        fig.className = entrada && haciaAdelante !== null && mismoPais ? entrada : '';
        fig.addEventListener('click', () => {
          if (fig.classList.contains('actual')) return;
          estado.decada = i; crudo.decada = null; cambiar();
        });
        carrusel.appendChild(fig);
        void fig.offsetWidth;                                         // fija la posición inicial antes de animar
      }
      const img = fig.querySelector('img');
      if (img.getAttribute('src') !== (a?.portada || '')) img.src = a?.portada || '';
      img.hidden = !a?.portada;
      fig.querySelector('.vacio').hidden = !!a?.portada;
      fig.querySelector('.vacio').textContent = !estado.familia ? 'Pon un disco en el plato'
        : a ? `${a.album}\n${a.artista}` : Datos.lectura(Datos.paises[estado.pais].cc, i, estado.familia).sinDatos
          ? `Sin registro de ventas\nen los ${Datos.decadas[i].corto}` : 'Ningún álbum del género';
      fig.querySelector('.anio').textContent = Datos.decadas[i].nombre;
      fig.className = rol;
      vivas.add(fig);
    }
    for (const fig of [...carrusel.children]) {
      if (vivas.has(fig)) continue;
      fig.className = fig.classList.contains('previa') || (haciaAdelante && !fig.classList.contains('siguiente')) ? 'entra-izq' : 'entra-der';
      setTimeout(() => fig.remove(), 500);
    }
    decadaCarrusel = i0; paisCarrusel = estado.pais;
  }

  cambiar();
})();
