"""Puesto semanal de cada canción del catálogo en cada país (para "seguir una canción" en el mapa).

Salida (en datos/):
  ranking/<nn>.js   window.cargarRanking(n, {idx: {cc: [semana_inicio, [puestos...]]}})
                    puesto = el mejor de la semana en el Top 200 diario de ese país; 0 = no estuvo esa semana.
                    Repartido en 64 archivos (idx % 64), igual que popularidad/, que se cargan al seguir una canción.

Usa el catálogo y sus índices desde datos/canciones.js, así que hay que correrlo después de 02_construir_datos.py.

Uso: python scripts/05_ranking_por_pais.py
"""
import json
import re
import shutil
import time

import duckdb

from config import SONGS_PARQUET, WEB_DATA_DIR

EXCLUIR = ("il", "by", "global")   # il y by solo tienen unas semanas de 2026; el global no es un país del mapa
FRAGMENTOS = 64
SEMANA_BASE = "2016-12-26"         # la misma base que popularidad/ y la granularidad "semana"

t0 = time.time()
texto = (WEB_DATA_DIR / "canciones.js").read_text(encoding="utf-8")
catalogo = json.loads(re.search(r"window\.CANCIONES = (.*);\n", texto).group(1))
indice = {c[0]: i for i, c in enumerate(catalogo)}

con = duckdb.connect()
con.execute("CREATE TABLE ids (track_id VARCHAR, idx INTEGER)")
con.executemany("INSERT INTO ids VALUES (?, ?)", list(indice.items()))
filas = con.execute(f"""
    SELECT ids.idx, c.country, datediff('week', DATE '{SEMANA_BASE}', date_trunc('week', c.date)) AS s, min(c.rank) AS r
    FROM '{SONGS_PARQUET}' c JOIN ids USING (track_id)
    WHERE c.country NOT IN {EXCLUIR}
    GROUP BY ALL ORDER BY 1, 2, 3
""").fetchall()

por_cancion = {}
for idx, cc, s, r in filas:
    por_cancion.setdefault(idx, {}).setdefault(cc, []).append((s, r))

fragmentos = [{} for _ in range(FRAGMENTOS)]
for idx, paises in por_cancion.items():
    datos = {}
    for cc, semanas in paises.items():
        inicio, fin = semanas[0][0], semanas[-1][0]
        puestos = [0] * (fin - inicio + 1)
        for s, r in semanas:
            puestos[s - inicio] = r
        datos[cc] = [inicio, puestos]
    fragmentos[idx % FRAGMENTOS][idx] = datos

dir_rank = WEB_DATA_DIR / "ranking"
shutil.rmtree(dir_rank, ignore_errors=True)
dir_rank.mkdir(parents=True)
for n, frag in enumerate(fragmentos):
    contenido = json.dumps(frag, separators=(",", ":"))
    (dir_rank / f"{n:02d}.js").write_text(f"window.cargarRanking({json.dumps(n)}, {contenido});\n", encoding="utf-8")

tam = sum(f.stat().st_size for f in dir_rank.iterdir()) / 1e6
print(f"{len(filas):,} filas canción-país-semana de {len(por_cancion):,} canciones → ranking/ ({tam:.1f} MB en {FRAGMENTOS} archivos)")
print(f"{time.time() - t0:.0f}s")
