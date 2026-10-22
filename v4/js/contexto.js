/* Ficha «Cobertura y metodología» (PR #2, jtomaslarrain): contexto de solo lectura, a pedido, debajo de la vista.
   No escribe en Estado ni altera los cálculos o los controles existentes.
   Ajuste al integrarlo en la V4: tras la R3 los botones de región solo acercan el mapa, así que todas las cifras
   cuentan siempre los 52 países de la muestra. Ya no hay ámbitos distintos que avisar (ni «titular pendiente»,
   que durante la reproducción automática se encendía con cada carga del panel). */
const Contexto = (() => {
  const $ = id => document.getElementById(id);

  function actualizar() {
    if (!$('contexto-ficha') || $('contexto-ficha').hidden) return;   // solo se llena cuando está abierta
    const region = document.querySelector('.acercar button.activo')?.dataset.region ?? 'mundo';
    const total = muestraDe('global').length;
    $('contexto-mapa').textContent = region === 'mundo'
      ? 'Mapa: el mundo completo.'
      : `Mapa: acercado a ${nombreAmbito(region)}. Acercar solo cambia el encuadre, no lo que se cuenta.`;
    $('contexto-indicadores').textContent = `Titular, eje de tiempo y diversidad: muestra mundial de ${total} países. Las barras cuentan la submuestra de cada continente; los aplausos cuentan dónde la canción es #1 y suman el país observado si está fuera de la muestra.`;
    $('contexto-alcance').textContent = `Alcance top 50: los mismos ${total} países, semana a semana.`;
    const diversidad = Diversidad.calcular('global');
    $('contexto-diversidad').textContent = `Diversidad · ${textoPeriodo(Estado.grano, Estado.periodo)}: ${diversidad.distintas} canciones distintas son #1 en ${diversidad.paises} países. También disponible aquí cuando el panel la oculta por falta de altura.`;
    $('contexto-fin').textContent = textoFecha(new Date(window.FECHA_MAX + 'T00:00:00Z'));
    $('contexto-muestra').textContent = `${total} países: ${Object.entries(CONTINENTES).map(([k, n]) => `${n}: ${muestraDe(k).length}`).join('; ')}.`;
    $('contexto-concentracion').textContent = `${muestraDe('europa').length + muestraDe('america').length} de esos ${total} países están en Europa y América.`;
  }

  function abrir() {
    $('contexto-ficha').hidden = false;
    actualizar();
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

  return { actualizar };
})();
