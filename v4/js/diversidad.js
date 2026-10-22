/* Diversidad de líderes (PR #1, jtomaslarrain): cuántas canciones distintas son #1 en los países del ámbito.
   Complementa el titular "Es #1 en N de M países": si el mundo escuchara lo mismo habría una sola.

   Misma base que el titular: los países de la muestra fija del ámbito (el mundo o la región elegida), siempre
   los mismos. Las canciones se comparan por índice del catálogo, como hace el mapa con el #1 global (las de
   YouTube Music se cruzan con Spotify por título y artista en scripts/08_fuentes_extra.py; las ediciones con
   otro ID de Spotify cuentan aparte). Solo lee el estado: no cambia la selección, el audio ni el mapa. */
const Diversidad = (() => {
  function calcular(ambito = Estado.ambito, grano = Estado.grano, periodo = Estado.periodo) {
    const paises = muestraDe(ambito);
    const canciones = new Set(paises.map(cc => numero1(cc, grano, periodo)?.idx));
    return { distintas: canciones.size, paises: paises.length };
  }

  function actualizar(ambito = Estado.ambito) {
    const nodo = document.getElementById('diversidad');
    if (!nodo) return;
    const { distintas, paises } = calcular(ambitoMedible(ambito));
    const cuantas = Object.assign(document.createElement('strong'), {
      textContent: distintas === 1 ? 'Una sola canción' : `${distintas} canciones distintas`,
    });
    nodo.replaceChildren(cuantas, ` ${distintas === 1 ? 'es' : 'son'} #1 en ${paises === 1 ? 'este país' : `estos ${paises} países`}`);
  }

  return { calcular, actualizar };
})();
