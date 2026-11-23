/* Tocadiscos (E2, V3): la página habla con el Arduino por Web Serial.

   Hacia el Arduino:  "V:0.64\n"  velocidad entre 0 y 1 (la cuota del género en el top 5); se repite cada segundo
                      y si deja de llegar, el Arduino detiene el disco solo. Sin disco puesto, manda 0.
   Desde el Arduino:  "P:512,T:300"  perillas de país y tiempo (0–1023), solo cuando cambian.
                      "BOTON"  se apretó el botón: la página alterna la pausa y manda V:0 (22-nov: antes
                      "PAUSA:1/0", con una pausa propia del Arduino que se desincronizaba con la de la pantalla).
                      "C:rojo" / "C:-"  color que ve el sensor RGB (o nada delante); se repite cada 2 s.
   - El primer permiso exige un click (lo piden los navegadores); después, al recargar, se reconecta solo.
   - Web Serial solo existe en Chrome y Edge. Sin Arduino, la página funciona con los controles en pantalla. */

const Tocadiscos = (() => {
  const BAUDIOS = 115200;
  const REPETIR_MS = 1000;
  const ARDUINO = [{ usbVendorId: 0x2341 }, { usbVendorId: 0x2a03 }];   // Arduino LLC y Arduino SRL

  const disponible = 'serial' in navigator;
  let puerto = null, escritor = null, lector = null, timer = null;
  let velocidad = 0;
  let hayDisco = true;                // sin lector de discos se supone que hay disco
  let alCambiarEstado = () => {};
  let alPerillas = () => {};
  let alPausa = () => {};
  let alColorVisto = () => {};
  let alLinea = () => {};             // diagnóstico: cada línea que llega y cada error
  const codificar = new TextEncoder();

  async function escribir(texto) {
    if (!escritor) return;
    try { await escritor.write(codificar.encode(texto + '\n')); }
    catch { cerrar(); }
  }

  const enviar = () => escribir(`V:${(hayDisco ? velocidad : 0).toFixed(3)}`);

  function procesar(linea) {
    linea = linea.trim();
    if (linea) alLinea(linea);
    let m;
    if ((m = /^P:(\d+),T:(\d+)$/.exec(linea))) alPerillas(+m[1] / 1023, +m[2] / 1023);
    else if (linea === 'BOTON' || /^PAUSA:[01]$/.test(linea)) alPausa();
    else if ((m = /^C:([a-z]+|-)$/.exec(linea))) alColorVisto(m[1] === '-' ? null : m[1]);
  }

  /** Lee las líneas del Arduino. Hay que leerlas siempre: si el búfer se llena, el Arduino se queda esperando. */
  async function leer() {
    const decodificar = new TextDecoder();
    let resto = '';
    while (puerto?.readable && lector) {
      try {
        const { value, done } = await lector.read();
        if (done) break;
        resto += decodificar.decode(value, { stream: true });
        const lineas = resto.split('\n');
        resto = lineas.pop();
        lineas.forEach(procesar);
      } catch { break; }
    }
  }

  async function abrir(p) {
    try { await p.open({ baudRate: BAUDIOS }); }
    catch (e) {
      // Ocupado por otra pestaña o programa (el monitor serie del IDE, por ejemplo): se avisa en pantalla.
      alLinea(`No se pudo abrir el puerto: ${e.message}`, true);
      throw e;
    }
    // El Leonardo solo envía datos si el computador marca el puerto como abierto (señal DTR).
    try { await p.setSignals({ dataTerminalReady: true, requestToSend: true }); } catch { /* sin señales */ }
    puerto = p;
    escritor = p.writable.getWriter();
    lector = p.readable.getReader();
    leer();
    timer = setInterval(enviar, REPETIR_MS);
    enviar();
    alCambiarEstado(true);
  }

  async function cerrar() {
    clearInterval(timer);
    timer = null;
    const p = puerto;
    puerto = null;
    try { await lector?.cancel(); } catch { /* ya cerrado */ }
    try { lector?.releaseLock(); } catch { /* ya liberado */ }
    try { escritor?.releaseLock(); } catch { /* ya liberado */ }
    lector = escritor = null;
    try { await p?.close(); } catch { /* desconectado */ }
    alCambiarEstado(false);
  }

  if (disponible) {
    navigator.serial.addEventListener('disconnect', e => { if (e.target === puerto) cerrar(); });
    // Al volver a enchufar un Arduino ya autorizado, se reconecta solo (sin volver a preguntar).
    navigator.serial.addEventListener('connect', e => { if (!puerto) abrir(e.target).catch(() => {}); });
    addEventListener('pagehide', () => escribir('S'));   // al salir, el disco se detiene de inmediato
  }

  return {
    disponible,
    get conectado() { return !!puerto; },
    /** fn(conectado): para mostrar el estado en el botón. */
    alCambiar(fn) { alCambiarEstado = fn; },
    /** fn(pais, tiempo) con ambos entre 0 y 1, cada vez que se mueve una perilla. */
    alMoverPerillas(fn) { alPerillas = fn; },
    /** fn(enPausa) cuando se aprieta el botón del tocadiscos. */
    alApretarBoton(fn) { alPausa = fn; },
    /** fn(color) con el nombre del color que ve el sensor RGB, o null si no hay nada delante. */
    alVerColor(fn) { alColorVisto = fn; },
    /** fn(linea, esError): diagnóstico de lo que llega por el cable. */
    alRecibir(fn) { alLinea = fn; },
    /** Dentro de un click: pide el puerto (o lo suelta si ya está conectado). */
    async alternar() {
      if (puerto) return cerrar();
      try { await abrir(await navigator.serial.requestPort({ filters: ARDUINO })); }
      catch (e) {
        if (e.name !== 'NotFoundError') console.warn('Tocadiscos:', e);              // NotFoundError: canceló
        alLinea(e.name === 'NotFoundError' ? 'No se eligió ningún Arduino.' : `Error: ${e.message}`, true);
      }
    },
    /** Sin click: abre el puerto ya autorizado en una visita anterior, si está enchufado. */
    async reconectar() {
      if (!disponible || puerto) return;
      const [p] = await navigator.serial.getPorts();
      if (p) try { await abrir(p); } catch (e) { console.warn('Tocadiscos:', e); }
    },
    /** Velocidad del disco entre 0 (detenido) y 1. */
    fijarVelocidad(v) {
      const nueva = Math.min(1, Math.max(0, v || 0));
      if (nueva === velocidad) return;
      velocidad = nueva;
      enviar();
    },
    /** Si hay un disco puesto sobre el plato. Sin disco, el servo se detiene. */
    ponerDisco(si) {
      if (si === hayDisco) return;
      hayDisco = si;
      enviar();
    },
  };
})();
