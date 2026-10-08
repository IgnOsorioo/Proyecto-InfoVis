/* Buscador de canciones: título o artista, entre las 250.790 que alguna vez entraron al Top 200 de un país
   (2017–2026). Elegir una la sigue: el mapa pasa a mostrar su éxito en el mundo.
   El índice (~4,7 MB comprimido) se descarga recién al usar el buscador. Sin acentos ni mayúsculas; con
   empate, primero las más escuchadas. */

const Buscador = (() => {
  const input = document.getElementById('buscar');
  const lista = document.getElementById('buscar-resultados');
  const MAX = 7;
  let indice = null;           // [{titulo, texto}] normalizados, en el orden del catálogo
  let exito = null;
  let resultados = [];
  let activo = -1;
  let alElegir = () => {};
  let preparando = null;

  const normalizar = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function preparar() {
    preparando ??= pedirBuscador().then(({ t, a, e }) => {
      indice = t.map((titulo, i) => ({ titulo: normalizar(titulo), texto: normalizar(`${titulo} ${a[i]}`) }));
      exito = e;
    });
    return preparando;
  }

  function buscar(q) {
    q = normalizar(q.trim());
    if (q.length < 2 || !indice) return [];
    const palabras = q.split(/\s+/);
    const res = [];
    for (let idx = 0; idx < indice.length; idx++) {
      const c = indice[idx];
      if (!palabras.every(p => c.texto.includes(p))) continue;
      const puntaje = c.titulo.startsWith(q) ? 3 : c.titulo.includes(q) ? 2 : 1;
      res.push([puntaje, exito[idx], idx]);
    }
    res.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    // Una misma canción puede tener varias versiones (remasterizaciones, reediciones) con distinto id:
    // se muestra solo la más escuchada.
    const vistas = new Set(), unicas = [];
    for (const [, , idx] of res) {
      if (vistas.has(indice[idx].texto)) continue;
      vistas.add(indice[idx].texto);
      unicas.push(idx);
      if (unicas.length === MAX) break;
    }
    return unicas;
  }

  function item(texto, clase) {
    return Object.assign(document.createElement('li'), { className: clase, textContent: texto });
  }

  async function mostrar() {
    const q = input.value.trim();
    if (q.length < 2) { cerrar(); return; }
    abrir();
    if (!indice) {
      lista.replaceChildren(item('Cargando 250 mil canciones…', 'sin-resultados'));
      await preparar();
      if (input.value.trim() !== q) return;            // ya se escribió otra cosa
    }
    resultados = buscar(q);
    activo = resultados.length ? 0 : -1;
    if (!resultados.length) {
      lista.replaceChildren(item('No está en el catálogo: solo hay canciones que entraron al Top 200 de algún país desde 2017.', 'sin-resultados'));
      return;
    }
    lista.replaceChildren(...resultados.map((idx, i) => {
      const li = document.createElement('li');
      li.id = `buscar-${i}`;
      li.setAttribute('role', 'option');
      const img = Object.assign(document.createElement('img'), { alt: '', loading: 'lazy' });
      const texto = document.createElement('span');
      const c = cancion(idx);
      texto.append(Object.assign(document.createElement('strong'), { textContent: c.titulo }),
                   Object.assign(document.createElement('span'), { textContent: c.artistas }));
      li.append(img, texto);
      // La portada de las canciones fuera del catálogo base llega con sus datos (un archivo por cada 256).
      asegurarCancion(idx).then(() => { img.src = cancion(idx).portada; }).catch(() => {});
      li.addEventListener('mousedown', e => e.preventDefault());   // que el input no pierda el foco antes del click
      li.addEventListener('click', () => elegir(i));
      return li;
    }));
    marcar();
  }

  function abrir() {
    lista.hidden = false;
    input.setAttribute('aria-expanded', 'true');
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

  input.addEventListener('focus', () => { preparar(); if (input.value.trim().length >= 2) mostrar(); });
  input.addEventListener('input', mostrar);
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
