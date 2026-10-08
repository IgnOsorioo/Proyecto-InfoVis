"""Catálogo completo para el buscador de la V2: todas las canciones que alguna vez entraron al Top 200 de un país.

El catálogo base (datos/canciones.js, 20.930 canciones que fueron #1 o top 5) no cambia, porque lo usa la V1.
Las demás canciones se agregan a continuación (índices desde 20.930, ordenadas por reproducciones), así que
todos los índices existentes siguen valiendo.

Salidas (en datos/):
  catalogo/buscar.js         window.cargarBuscar('todo', {t: [títulos], a: [artistas], e: [éxito 0-99]})
                             para todo el catálogo (posición = índice); se carga al usar el buscador
  catalogo/meta/<nnn>.js     window.cargarMeta(n, {idx: [track_id, portada, estreno]}) de las canciones nuevas
  popularidad_todas/<nnn>.js reproducciones semanales (miles) de todas las canciones (formato de popularidad/)
  ranking/<nnn>.js           mejor puesto semanal por país de todas las canciones (formato de 05_ranking_por_pais.py)
Todo repartido en 256 archivos por índice (idx % 256).

Uso: python scripts/06_catalogo_completo.py   (después de 02_construir_datos.py)
"""
import json
import math
import re
import shutil
import time

import duckdb

from config import RAW_DIR, SONGS_PARQUET, WEB_DATA_DIR

EXCLUIR = ("il", "by", "global")   # il y by solo tienen unas semanas de 2026; el global no es un país del mapa
FRAGMENTOS = 256
SEMANA_BASE = "2016-12-26"
BASE_PORTADA = "https://i.scdn.co/image/"
PREFIJO_PORTADA = "ab67616d00001e02"


def escribir(carpeta, funcion, fragmentos):
    shutil.rmtree(carpeta, ignore_errors=True)
    carpeta.mkdir(parents=True)
    for n, frag in enumerate(fragmentos):
        contenido = json.dumps(frag, ensure_ascii=False, separators=(",", ":"))
        (carpeta / f"{n:03d}.js").write_text(f"window.{funcion}({json.dumps(n)}, {contenido});\n", encoding="utf-8")
    return sum(f.stat().st_size for f in carpeta.iterdir()) / 1e6


t0 = time.time()
texto = (WEB_DATA_DIR / "canciones.js").read_text(encoding="utf-8")
base = json.loads(re.search(r"window\.CANCIONES = (.*);\n", texto).group(1))
indice = {c[0]: i for i, c in enumerate(base)}

con = duckdb.connect()
con.execute(f"CREATE TABLE c AS SELECT * FROM '{SONGS_PARQUET}' WHERE country NOT IN {EXCLUIR}")

# ---------- Canciones nuevas, ordenadas por reproducciones (las más escuchadas primero) ----------
totales = con.execute("SELECT track_id, sum(coalesce(streams, 0)) AS st FROM c GROUP BY 1 ORDER BY st DESC, track_id").fetchall()
total_de = dict(totales)
nuevas = [tid for tid, _ in totales if tid not in indice]
for tid in nuevas:
    indice[tid] = len(indice)
n_total = len(indice)
con.execute("CREATE TABLE ids (track_id VARCHAR, idx INTEGER)")
con.executemany("INSERT INTO ids VALUES (?, ?)", list(indice.items()))

# Metadatos de las nuevas (misma lógica que 02_construir_datos.py). Estreno: el más antiguo entre la fecha
# de lanzamiento y la primera aparición en los charts (algunas versiones traen una fecha de reedición).
meta = con.execute(f"""
    WITH nombres AS (
        SELECT track_id, arg_max(track_name, date) AS track_name, arg_max(artist_names, date) AS artist_names,
               min(release_date) AS estreno, min(date) AS primer_chart
        FROM c WHERE track_id IN (SELECT track_id FROM ids WHERE idx >= {len(base)}) GROUP BY 1
    ),
    s AS (SELECT replace(track_uri, 'spotify:track:', '') AS track_id, track_name, artist_names, release_date
          FROM read_csv('{RAW_DIR / "songs.csv"}', all_varchar = true)),
    a AS (SELECT replace(uri, 'spotify:track:', '') AS track_id, arg_max(image_url, last_seen_date) AS img
          FROM read_csv('{RAW_DIR / "artwork.csv"}', all_varchar = true) WHERE type = 'song' GROUP BY 1)
    SELECT n.track_id, coalesce(s.track_name, n.track_name, '(sin título)'), coalesce(s.artist_names, n.artist_names, ''),
           a.img, least(coalesce(TRY_CAST(s.release_date AS DATE), n.estreno), n.primer_chart)
    FROM nombres n LEFT JOIN s USING (track_id) LEFT JOIN a USING (track_id)
""").fetchall()
por_id = {m[0]: m for m in meta}

# ---------- Índice del buscador (todo el catálogo) ----------
titulos, artistas, exito = [""] * n_total, [""] * n_total, [0] * n_total
for i, (tid, titulo, arts, *_rest) in enumerate(base):
    titulos[i], artistas[i] = titulo, arts
maximo = math.log10(max(total_de.values()) + 1)
for tid, idx in indice.items():
    exito[idx] = round(99 * math.log10(total_de.get(tid, 0) + 1) / maximo)
frag_meta = [{} for _ in range(FRAGMENTOS)]
for tid in nuevas:
    idx = indice[tid]
    _, titulo, arts, img, estreno = por_id.get(tid, (tid, "(sin título)", "", None, None))
    titulos[idx], artistas[idx] = titulo, arts.replace("|", ", ")
    hash_img = img.removeprefix(BASE_PORTADA) if img else ""
    portada = hash_img.removeprefix(PREFIJO_PORTADA) if hash_img.startswith(PREFIJO_PORTADA) else (f"~{hash_img}" if hash_img else "")
    frag_meta[idx % FRAGMENTOS][idx] = [tid, portada, estreno.isoformat() if estreno else ""]

dir_cat = WEB_DATA_DIR / "catalogo"
dir_cat.mkdir(parents=True, exist_ok=True)
buscar = {"t": titulos, "a": artistas, "e": exito}
(dir_cat / "buscar.js").write_text(
    f"window.cargarBuscar(\"todo\", {json.dumps(buscar, ensure_ascii=False, separators=(',', ':'))});\n", encoding="utf-8")
mb_meta = escribir(dir_cat / "meta", "cargarMeta", frag_meta)

# ---------- Popularidad semanal de todas las canciones ----------
frag_pop = [{} for _ in range(FRAGMENTOS)]
filas = con.execute(f"""
    SELECT ids.idx, datediff('week', DATE '{SEMANA_BASE}', date_trunc('week', c.date)) AS s, sum(coalesce(c.streams, 0)) AS st
    FROM c JOIN ids USING (track_id) GROUP BY ALL ORDER BY 1, 2
""").fetchall()
actual, semanas = None, []
def cerrar(idx, semanas):
    inicio, fin = semanas[0][0], semanas[-1][0]
    valores = [0] * (fin - inicio + 1)
    for s, st in semanas:
        valores[s - inicio] = max(1, round(st / 1000)) if st else 0
    frag_pop[idx % FRAGMENTOS][idx] = [inicio, valores]
for idx, s, st in filas:
    if idx != actual and semanas:
        cerrar(actual, semanas)
        semanas = []
    actual = idx
    semanas.append((s, st))
if semanas:
    cerrar(actual, semanas)
mb_pop = escribir(WEB_DATA_DIR / "popularidad_todas", "cargarPopularidadTodas", frag_pop)

# ---------- Puesto semanal por país de todas las canciones ----------
frag_rank = [{} for _ in range(FRAGMENTOS)]
filas = con.execute(f"""
    SELECT ids.idx, c.country, datediff('week', DATE '{SEMANA_BASE}', date_trunc('week', c.date)) AS s, min(c.rank) AS r
    FROM c JOIN ids USING (track_id) GROUP BY ALL ORDER BY 1, 2, 3
""").fetchall()
por_cancion = {}
for idx, cc, s, r in filas:
    por_cancion.setdefault(idx, {}).setdefault(cc, []).append((s, r))
for idx, paises in por_cancion.items():
    datos = {}
    for cc, sem in paises.items():
        inicio, fin = sem[0][0], sem[-1][0]
        puestos = [0] * (fin - inicio + 1)
        for s, r in sem:
            puestos[s - inicio] = r
        datos[cc] = [inicio, puestos]
    frag_rank[idx % FRAGMENTOS][idx] = datos
mb_rank = escribir(WEB_DATA_DIR / "ranking", "cargarRanking", frag_rank)

mb_buscar = (dir_cat / "buscar.js").stat().st_size / 1e6
print(f"{n_total:,} canciones ({len(base):,} base + {len(nuevas):,} nuevas)")
print(f"  catalogo/buscar.js: {mb_buscar:.1f} MB · catalogo/meta: {mb_meta:.1f} MB · popularidad_todas: {mb_pop:.1f} MB · ranking: {mb_rank:.1f} MB")
print(f"{time.time() - t0:.0f}s")
