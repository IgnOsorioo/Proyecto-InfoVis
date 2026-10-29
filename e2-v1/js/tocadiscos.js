/* Tocadiscos (Entrega 2): el CD gira más rápido mientras en más países es #1 la canción que suena. Es el mismo dato
   que los aplausos (una persona por país), ahora también a la vista: un hit local apenas gira; el #1 de medio mundo
   gira rápido. Sin canción (país sin datos), el disco se detiene.

   - La página le manda al Arduino el alcance por Web Serial: "V:0.37\n" (países donde es #1 / 52, entre 0 y 1).
   - Lo repite cada segundo: si deja de llegar (se cerró la página o se desconectó), el Arduino detiene el disco.
   - El primer permiso exige un click (lo piden los navegadores); después, al recargar, se reconecta solo.
   - Web Serial solo existe en Chrome y Edge. Sin tocadiscos, la página funciona igual que la V4. */

const Tocadiscos = (() => {
  const BAUDIOS = 115200;
  const REPETIR_MS = 1000;
  const ARDUINO = [{ usbVendorId: 0x2341 }, { usbVendorId: 0x2a03 }];   // Arduino LLC y Arduino SRL

  const disponible = 'serial' in navigator;
  let puerto = null, escritor = null, lector = null, timer = null;
  let alcance = 0;
  let alCambiarEstado = () => {};
  const codificar = new TextEncoder();

  async function escribir(texto) {
    if (!escritor) return;
    try { await escritor.write(codificar.encode(texto + '\n')); }
    catch { cerrar(); }
  }

  const enviar = () => escribir(`V:${alcance.toFixed(3)}`);

  /** Lee lo que responde el Arduino ("OK …"; más adelante, las perillas). Hay que leerlo aunque no se use: si el
      búfer se llena, el Arduino se queda esperando. */
  async function leer() {
    const decodificar = new TextDecoder();
    while (puerto?.readable && lector) {
      try {
        const { value, done } = await lector.read();
        if (done) break;
        decodificar.decode(value, { stream: true });
      } catch { break; }
    }
  }

  async function abrir(p) {
    await p.open({ baudRate: BAUDIOS });
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
    // Al salir de la página, el disco se detiene de inmediato (sin esperar los 3 s del Arduino).
    addEventListener('pagehide', () => escribir('S'));
  }

  return {
    disponible,
    get conectado() { return !!puerto; },
    /** fn(conectado): para mostrar el estado en el botón. */
    alCambiar(fn) { alCambiarEstado = fn; },
    /** Dentro de un click: pide el puerto (o lo suelta si ya está conectado). */
    async alternar() {
      if (puerto) return cerrar();
      try { await abrir(await navigator.serial.requestPort({ filters: ARDUINO })); }
      catch (e) { if (e.name !== 'NotFoundError') console.warn('Tocadiscos:', e); }   // NotFoundError: canceló
    },
    /** Sin click: abre el puerto ya autorizado en una visita anterior, si está enchufado. */
    async reconectar() {
      if (!disponible || puerto) return;
      const [p] = await navigator.serial.getPorts();
      if (p) try { await abrir(p); } catch (e) { console.warn('Tocadiscos:', e); }
    },
    /** En cuántos de los `de` países de la muestra es #1 la canción que suena (0: sin canción). */
    actualizar(paises, de) {
      const nuevo = Math.min(1, paises / Math.max(1, de));
      if (nuevo === alcance) return;
      alcance = nuevo;
      enviar();
    },
  };
})();
