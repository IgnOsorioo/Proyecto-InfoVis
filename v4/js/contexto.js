/* Contexto de solo lectura. La región se toma del control existente; el ámbito
   del titular, del último dibujo completado por Panel (puede estar esperando).
   No escribe en Estado ni altera los cálculos o los controles existentes. */
const Contexto = (() => {
  const $ = id => document.getElementById(id);
  const nombre = ambito => ambito === 'global' ? 'muestra mundial' : nombreAmbito(ambito);
  const etiqueta = ambito => `${nombre(ambito)} (${muestraDe(ambito).length} países)`;

  function actualizar() {
    if (!$('contexto')) return;
    const regionBoton = document.querySelector('.acercar button.activo')?.dataset.region ?? 'mundo';
    const region = regionBoton === 'mundo' ? 'global' : regionBoton;
    const efectivo = ambitoMedible(region);
    const total = muestraDe('global').length;
    $('contexto-mapa').textContent = `Mapa: ${region === 'global' ? 'Mundo' : nombreAmbito(region)}`;
    const titular = $('r-titular').dataset;
    const sinDatos = Estado.mensaje || $('panel').classList.contains('modo-mensaje');
    const pendiente = !sinDatos && (titular.contextoAmbito !== efectivo
      || titular.contextoGrano !== Estado.grano || titular.contextoPeriodo !== String(Estado.periodo)
      || titular.contextoCancion !== String(Estado.cancion));
    $('contexto-indicadores').textContent = sinDatos
      ? 'Titular y diversidad: no visibles en el panel sin datos.'
      : titular.contextoAmbito === efectivo
        ? `Titular y diversidad: ${etiqueta(efectivo)}`
        : `Titular: ${titular.contextoAmbito ? etiqueta(titular.contextoAmbito) : 'cargando'} · Diversidad: ${etiqueta(efectivo)}`;
    $('contexto-alcance').textContent = sinDatos
      ? `Alcance top 50: no visible; su base es la muestra mundial (${total} países).`
      : `Alcance top 50: ${efectivo === 'global' ? 'misma muestra mundial' : `muestra mundial (${total} países)`}, siempre semanal.`;
    const notas = [];
    if (region !== efectivo) {
      const n = muestraDe(region).length;
      notas.push(`${nombreAmbito(region)} tiene ${n} ${n === 1 ? 'país' : 'países'} en la muestra; el mínimo regional es ${MIN_MUESTRA}. Titular y diversidad usan la muestra mundial cuando se actualizan.`);
    }
    if (pendiente) notas.push('El titular visible está pendiente de actualizar a la selección actual.');
    $('contexto-nota').textContent = notas.join(' ');
    $('contexto-nota').hidden = !notas.length;
    const aviso = $('contexto-aviso');
    aviso.textContent = region !== efectivo ? '· ámbito mundial' : pendiente ? '· titular pendiente' : '';
    aviso.title = notas.join(' ');
    aviso.hidden = !aviso.textContent;
    $('contexto-fin').textContent = textoFecha(new Date(window.FECHA_MAX + 'T00:00:00Z'));
    $('contexto-muestra').textContent = `${total} países: ${Object.entries(CONTINENTES).map(([k, n]) => `${n}: ${muestraDe(k).length}`).join('; ')}.`;
    $('contexto-concentracion').textContent = `${muestraDe('europa').length + muestraDe('america').length} de esos ${total} países están en Europa y América.`;
  }

  function abrir() {
    actualizar();
    $('contexto-ficha').hidden = false;
    $('contexto-abrir').setAttribute('aria-expanded', 'true');
    $('contexto-titulo').focus({ preventScroll: true });
    $('contexto-ficha').scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  function cerrar() {
    // Primero se vuelve al control mientras el documento aún tiene scroll.
    $('contexto-abrir').focus();
    $('contexto-ficha').hidden = true;
    $('contexto-abrir').setAttribute('aria-expanded', 'false');
  }

  $('contexto-abrir').addEventListener('click', () => $('contexto-ficha').hidden ? abrir() : cerrar());
  $('contexto-cerrar').addEventListener('click', cerrar);
  $('contexto-ficha').addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); }
  });

  /** Metadatos de la vista ya dibujada; no son un segundo estado de selección. */
  function titularDibujado(ambito) {
    Object.assign($('r-titular').dataset, {
      contextoAmbito: ambito, contextoGrano: Estado.grano,
      contextoPeriodo: String(Estado.periodo), contextoCancion: String(Estado.cancion),
    });
    actualizar();
  }

  return { actualizar, titularDibujado };
})();
