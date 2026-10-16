/* Diversidad de líderes: solo rankings Spotify, agrupados por track ID exacto.
   No infiere equivalencias entre ediciones ni entre plataformas. Lee el estado;
   no altera selección, audio, mapa ni datos. El ámbito es la región elegida,
   incluso cuando se está escuchando un país fijado. */
const Diversidad = (() => {
  function calcular(ambito = Estado.ambito, grano = Estado.grano, periodo = Estado.periodo) {
    const grupos = new Map();
    let considerados = 0, otrasFuentes = 0, sinDatos = 0, sinIdentificador = 0;
    for (const cc of new Set(paisesDelAmbito(ambito))) {
      if (cc === 'global') continue;
      const r = numero1(cc, grano, periodo);
      if (!r) { sinDatos++; continue; }
      if (esFoto(r) || r.fuente !== 's') { otrasFuentes++; continue; }
      const c = cancion(r.idx);
      if (!c.id) { sinIdentificador++; continue; }
      considerados++;
      const grupo = grupos.get(c.id);
      if (grupo) grupo.paises++;
      else grupos.set(c.id, { id: c.id, titulo: c.titulo, artistas: c.artistas, paises: 1 });
    }
    // Desempate estable por ID: no atribuye una diferencia de alcance a los empates.
    const lideres = [...grupos.values()].sort((a, b) =>
      b.paises - a.paises || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { distintas: grupos.size, considerados, otrasFuentes, sinDatos,
      sinIdentificador, top: lideres.slice(0, 3),
      empateEnCorte: lideres.length > 3 && lideres[2].paises === lideres[3].paises };
  }

  function actualizar(ambito = Estado.ambito) {
    const nodo = document.getElementById('diversidad');
    if (!nodo) return;
    const d = calcular(ambito);
    const $ = id => document.getElementById(id);
    $('diversidad-contexto').textContent = `${nombreAmbito(ambito)} · ${textoPeriodo(Estado.grano, Estado.periodo)}`;
    $('diversidad-total').textContent = `${d.distintas} ${d.distintas === 1 ? 'pista distinta' : 'pistas distintas'} · ${d.considerados} ${d.considerados === 1 ? 'país considerado' : 'países considerados'}`;
    $('diversidad-cobertura').textContent = `Solo rankings Spotify, por ID de pista. Fuera del cálculo: ${d.otrasFuentes} países de otras fuentes, ${d.sinDatos} sin datos y ${d.sinIdentificador} sin ID. Ediciones con IDs diferentes cuentan por separado.`;
    const lista = $('diversidad-top');
    lista.replaceChildren(...d.top.map(c => {
      const fila = document.createElement('li');
      const texto = document.createElement('span');
      texto.className = 'diversidad-cancion';
      texto.textContent = `${c.titulo} — ${c.artistas}`;
      const cantidad = document.createElement('span');
      cantidad.className = 'diversidad-cantidad';
      cantidad.textContent = `${c.paises} ${c.paises === 1 ? 'país' : 'países'}`;
      const barra = document.createElement('span');
      barra.className = 'diversidad-barra';
      barra.setAttribute('aria-hidden', 'true');
      const relleno = document.createElement('span');
      // Base común: todos los países considerados, no solo el máximo del top 3.
      relleno.style.width = `${100 * c.paises / d.considerados}%`;
      barra.append(relleno);
      fila.append(texto, cantidad, barra);
      return fila;
    }));
    $('diversidad-nota').textContent = !d.considerados
      ? 'Sin rankings Spotify disponibles para esta región y período.'
      : `Barras: proporción de países considerados. Hasta tres líderes; empates ordenados por ID.${d.empateEnCorte ? ' Hay más pistas empatadas con la tercera.' : ''}`;
  }

  return { calcular, actualizar };
})();
