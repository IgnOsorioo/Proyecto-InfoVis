/* Diversidad de líderes (PR #1, jtomaslarrain): cuántas canciones distintas son #1 en los países del ámbito.
   Complementa el titular "La escuchan N de M países": si el mundo escuchara lo mismo habría una sola.

   Mismo criterio que el mapa:
   - países: los del ámbito (el mundo o la región elegida) con #1 en la fecha, sin las fotos de Apple Music
     (sin historia). A diferencia del titular, la base no puede ser el total real de países (del resto no se
     sabe cuál es su #1): por eso la frase dice "con datos";
   - canciones: por índice del catálogo, el mismo con que el mapa decide si un #1 es el #1 global (las de
     YouTube Music se cruzan con el catálogo de Spotify por título y artista en scripts/08_fuentes_extra.py;
     las ediciones con otro ID de Spotify cuentan aparte).
   Solo lee el estado: no cambia la selección, el audio ni el mapa. */
const Diversidad = (() => {
  function calcular(ambito = Estado.ambito, grano = Estado.grano, periodo = Estado.periodo) {
    const canciones = new Set();
    let paises = 0;
    for (const cc of paisesDelAmbito(ambito)) {
      const r = numero1(cc, grano, periodo);
      if (!r || esFoto(r)) continue;
      paises++;
      canciones.add(r.idx);
    }
    return { distintas: canciones.size, paises };
  }

  function actualizar(ambito = Estado.ambito) {
    const nodo = document.getElementById('diversidad');
    if (!nodo) return;
    const { distintas, paises } = calcular(ambito);
    if (!paises) {
      nodo.replaceChildren();
      return;
    }
    const cuantas = Object.assign(document.createElement('strong'), {
      textContent: distintas === 1 ? 'Una sola canción' : `${distintas} canciones distintas`,
    });
    nodo.replaceChildren(cuantas, ` ${distintas === 1 ? 'es' : 'son'} #1 en ${paises === 1 ? 'el país' : `los ${paises} países`} con datos`);
  }

  return { calcular, actualizar };
})();
