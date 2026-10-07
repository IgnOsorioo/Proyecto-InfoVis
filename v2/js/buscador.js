/* Buscador de canciones: título o artista, entre las 20.930 del catálogo (todas las que alguna vez fueron #1
   o estuvieron en un top 5). Elegir una la fija: el mapa pasa a mostrar su éxito en el mundo.
   Sin acentos ni mayúsculas; con empate, primero las que fueron #1 en más países y semanas. */

const Buscador = (() => {
  const input = document.getElementById('buscar');
  const lista = document.getElementById('buscar-resultados');
  const MAX = 7;
  let indice = null;
  let resultados = [];
  let activo = -1;
  let alElegir = () => {};

  const normalizar = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function construir() {
    const exito = new Float64Array(window.CANCIONES.length);   // semanas-país como #1
    for (const [cc, tramos] of Object.entries(window.NUMERO1.semana)) {
      if (cc === 'global') continue;
      tramos.forEach(([ini, idx], i) => {
        const fin = i + 1 < tramos.length ? tramos[i + 1][0] : window.PERIODOS.semana.n;
        exito[idx] += fin - ini;
      });
    }
    indice = window.CANCIONES.map(([, titulo, artistas], idx) =>
      ({ idx, titulo: normalizar(titulo), texto: normalizar(`${titulo} ${artistas}`), exito: exito[idx] }));
  }

  function buscar(q) {
    q = normalizar(q.trim());
    if (q.length < 2) return [];
    if (!indice) construir();
    const palabras = q.split(/\s+/);
    const res = [];
    for (const c of indice) {
      if (!palabras.every(p => c.texto.includes(p))) continue;
      const puntaje = c.titulo.startsWith(q) ? 3 : c.titulo.includes(q) ? 2 : 1;
      res.push([puntaje, c.exito, c.idx]);
    }
    res.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    return res.slice(0, MAX).map(r => r[2]);
  }

  function mostrar() {
    resultados = buscar(input.value);
    activo = resultados.length ? 0 : -1;
    if (!input.value.trim() || input.value.trim().length < 2) { cerrar(); return; }
    lista.replaceChildren(...(resultados.length ? resultados.map((idx, i) => {
      const c = cancion(idx);
      const li = document.createElement('li');
      li.id = `buscar-${i}`;
      li.setAttribute('role', 'option');
      const img = Object.assign(document.createElement('img'), { src: c.portada, alt: '', loading: 'lazy' });
      const texto = document.createElement('span');
      texto.append(Object.assign(document.createElement('strong'), { textContent: c.titulo }),
                   Object.assign(document.createElement('span'), { textContent: c.artistas }));
      li.append(img, texto);
      li.addEventListener('mousedown', e => e.preventDefault());   // que el input no pierda el foco antes del click
      li.addEventListener('click', () => elegir(i));
      return li;
    }) : [Object.assign(document.createElement('li'), { className: 'sin-resultados', textContent: 'Ninguna canción del catálogo coincide.' })]));
    lista.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    marcar();
  }

  function marcar() {
    [...lista.children].forEach((li, i) => li.classList.toggle('activo', i === activo));
    input.setAttribute('aria-activedescendant', activo >= 0 ? `buscar-${activo}` : '');
  }

  function cerrar() {
    lista.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  }

  function elegir(i) {
    const idx = resultados[i];
    if (idx === undefined) return;
    input.value = '';
    cerrar();
    input.blur();
    alElegir(idx);
  }

  input.addEventListener('input', mostrar);
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) mostrar(); });
  input.addEventListener('blur', cerrar);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && resultados.length) { e.preventDefault(); activo = (activo + 1) % resultados.length; marcar(); }
    else if (e.key === 'ArrowUp' && resultados.length) { e.preventDefault(); activo = (activo - 1 + resultados.length) % resultados.length; marcar(); }
    else if (e.key === 'Enter') { e.preventDefault(); elegir(Math.max(0, activo)); }
    else if (e.key === 'Escape') { input.value = ''; cerrar(); input.blur(); }
  });

  return {
    iniciar({ alElegirCancion }) { alElegir = alElegirCancion; },
  };
})();
