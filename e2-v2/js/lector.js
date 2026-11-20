/* Lector de discos (E2, V2): corre en un celular dentro de la caja del tocadiscos. La cámara mira, por una ventana en
   la base, el anillo de color pegado bajo el CD. Como el anillo es de un solo color, da lo mismo cómo se ponga el
   disco; y como solo importa el color promedio del centro de la imagen, tampoco importa que esté desenfocado.

   - Calibrar: con cada disco puesto (y una vez sin disco) se guarda el color que ve la cámara con la luz de la caja.
     Queda guardado en el celular para la próxima vez.
   - Reconocer: cada lectura se compara con los colores calibrados y gana el más cercano, si está lo bastante cerca.
     Un cambio cuenta cuando se repite ESTABLE lecturas seguidas (al cambiar el disco, la mano pasa por delante).
   - Avisar: le manda a la página del tocadiscos qué disco hay, por Protobject: { disco: 'rojo' } o { disco: null }.
     Lo repite cada REPETIR_MS, así la página sabe que el lector sigue ahí. */

(() => {
  const $ = id => document.getElementById(id);
  const MUESTRA_MS = 150;
  const ESTABLE = 4;                  // ~0,6 s con el mismo color para aceptar un cambio
  const DISTANCIA_MAX = 70;           // más lejos que esto de todo lo calibrado: no se reconoce (cuenta como sin disco)
  const REPETIR_MS = 2000;
  const LECTURAS_CALIBRAR = 10;       // ~1,5 s de lecturas promediadas por color
  const CLAVE = 'tocadiscos:calibracion';
  const SIN_DISCO = 'sin-disco';
  const PRINCIPAL = 'index.html';

  const video = $('video');
  const lienzo = document.createElement('canvas');
  lienzo.width = 40;
  lienzo.height = 30;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });

  let pista = null, linterna = false, bloqueo = null, conectado = false;
  let actual;                         // lo último avisado: id de un disco, SIN_DISCO o null (no reconocido)
  let candidato = null, repeticiones = 0;
  let calibrando = null;              // { id, lecturas: [] } mientras se calibra un color
  let referencias = cargar();

  function cargar() {
    try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch { return {}; }
  }
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(referencias)); } catch { /* sin almacenamiento: dura la sesión */ }
  }

  const rgb = c => `rgb(${c.join(',')})`;
  const distancia = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  /** Color promedio del centro de la imagen (la mitad del ancho y del alto), el cuadro que marca la mira. */
  function medir() {
    ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
    const { data } = ctx.getImageData(10, 7, 20, 16);
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
    const n = data.length / 4;
    return [r / n, g / n, b / n].map(Math.round);
  }

  /** El color calibrado más parecido (un disco o SIN_DISCO); null si nada se parece lo suficiente. */
  function reconocer(color) {
    let mejor = null, menor = Infinity;
    for (const [id, ref] of Object.entries(referencias)) {
      const d = distancia(color, ref);
      if (d < menor) { menor = d; mejor = id; }
    }
    return menor <= DISTANCIA_MAX ? mejor : null;
  }

  const discoAvisado = () => discoPorId(actual)?.id ?? null;

  function avisar() {
    if (conectado && actual !== undefined) Protobject.Core.send({ disco: discoAvisado() }).to(PRINCIPAL);
  }

  function leerCiclo() {
    if (video.readyState < 2) return;
    const color = medir();
    $('medida').textContent = `RGB ${color.join(' · ')}`;
    $('medida-muestra').style.background = rgb(color);

    if (calibrando) {
      calibrando.lecturas.push(color);
      if (calibrando.lecturas.length >= LECTURAS_CALIBRAR) terminarCalibracion();
      return;
    }
    if (!Object.keys(referencias).length) return;

    const visto = reconocer(color);
    if (visto === candidato) repeticiones++;
    else { candidato = visto; repeticiones = 1; }
    if (repeticiones >= ESTABLE && visto !== actual) {
      actual = visto;
      mostrarVisto();
      avisar();
    }
  }

  function mostrarVisto() {
    const disco = discoPorId(actual);
    $('visto-muestra').style.background = disco ? rgb(referencias[disco.id]) : 'transparent';
    $('visto-muestra').classList.toggle('vacia', !disco);
    $('visto-nombre').textContent = disco ? `Disco ${disco.nombre.toLowerCase()}`
      : actual === SIN_DISCO ? 'Sin disco' : 'No reconocido';
  }

  // ---------- Calibración ----------

  function calibrar(id) {
    if (!pista || calibrando) return;
    calibrando = { id, lecturas: [] };
    dibujarLista();
  }

  function terminarCalibracion() {
    const { id, lecturas } = calibrando;
    referencias[id] = [0, 1, 2].map(i => Math.round(lecturas.reduce((s, c) => s + c[i], 0) / lecturas.length));
    calibrando = null;
    candidato = null;
    actual = undefined;               // vuelve a avisar con la calibración nueva
    guardar();
    dibujarLista();
  }

  function dibujarLista() {
    const filas = [...DISCOS.map(d => ({ id: d.id, nombre: `Disco ${d.nombre.toLowerCase()}`, muestra: d.muestra })),
      { id: SIN_DISCO, nombre: 'Sin disco', muestra: null }];
    $('lista').replaceChildren(...filas.map(f => {
      const li = document.createElement('li');
      const ref = referencias[f.id];
      const midiendo = calibrando?.id === f.id;
      li.innerHTML = `<i class="muestra${f.muestra ? '' : ' vacia'}"></i><span class="nombre"></span>
        <i class="muestra medida${ref ? '' : ' vacia'}" title="Color calibrado"></i>
        <button type="button"></button>`;
      li.querySelector('.nombre').textContent = f.nombre;
      if (f.muestra) li.querySelector('.muestra').style.background = f.muestra;
      if (ref) li.querySelector('.medida').style.background = rgb(ref);
      const boton = li.querySelector('button');
      boton.textContent = midiendo ? 'Midiendo…' : ref ? 'Recalibrar' : 'Calibrar';
      boton.disabled = !pista || !!calibrando;
      boton.addEventListener('click', () => calibrar(f.id));
      return li;
    }));
  }

  $('borrar').addEventListener('click', () => {
    referencias = {};
    actual = undefined;
    candidato = null;
    guardar();
    dibujarLista();
    $('visto-nombre').textContent = 'Sin calibrar';
    $('visto-muestra').classList.add('vacia');
  });

  // ---------- Cámara, linterna y pantalla ----------

  async function encender() {
    $('encender').disabled = true;
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 } }, audio: false,
      });
      video.srcObject = flujo;
      await video.play();
      pista = flujo.getVideoTracks()[0];
      $('linterna').hidden = !pista.getCapabilities?.().torch;   // solo Chrome en Android
      $('encender').hidden = true;
      $('visto-nombre').textContent = Object.keys(referencias).length ? 'Leyendo…' : 'Sin calibrar';
      mantenerPantalla();
      setInterval(leerCiclo, MUESTRA_MS);
      dibujarLista();
    } catch (e) {
      $('encender').disabled = false;
      $('visto-nombre').textContent = 'No se pudo abrir la cámara';
      console.warn('Lector:', e);
    }
  }

  async function alternarLinterna() {
    linterna = !linterna;
    try { await pista.applyConstraints({ advanced: [{ torch: linterna }] }); }
    catch { linterna = false; }
    $('linterna').setAttribute('aria-pressed', String(linterna));
  }

  /** Sin esto el celular apaga la pantalla y la cámara se detiene. */
  async function mantenerPantalla() {
    try { bloqueo = await navigator.wakeLock?.request('screen'); } catch { /* sin Wake Lock: ajustar el celular */ }
  }
  document.addEventListener('visibilitychange', () => {
    // El navegador suelta el bloqueo al ocultar la página: al volver, se pide de nuevo.
    if (document.visibilityState === 'visible' && pista && (!bloqueo || bloqueo.released)) mantenerPantalla();
  });

  $('encender').addEventListener('click', encender);
  $('linterna').addEventListener('click', alternarLinterna);

  // ---------- Conexión con el tocadiscos ----------

  Protobject.Core.onConnected(pagina => {
    if (pagina !== PRINCIPAL) return;
    conectado = true;
    $('conexion').textContent = 'Conectado al tocadiscos';
    $('conexion').classList.add('ok');
    avisar();
  });
  setInterval(avisar, REPETIR_MS);

  dibujarLista();
})();
