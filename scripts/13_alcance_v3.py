"""Alcance mundial de cada canción, semana a semana: en cuántos países de la muestra fija está en el top 50.

Es la popularidad estandarizada de la V3 (gráfico del panel y aplausos). A diferencia de las reproducciones,
no depende del tamaño del mercado (un país, un voto), tiene la misma escala para toda canción y fecha (0 a 52
países) y no mezcla fuentes: la muestra fija (datos/v3/muestra.js) son países con chart de Spotify.

- 2017–2026: charts diarios de Spotify (Kaggle gonzalopezgil): la canción está en el top 50 del país esa semana
  si su mejor puesto de la semana es 50 o mejor.
- 2015–2016: charts semanales (Kaggle jfreyberg): su puesto en el chart de esa semana.
Se calcula para las canciones que son #1 en algún país o en el mundo (las que pueden mostrarse en el panel),
reconocidas por título y primer artista (no por ID: un mismo hit tiene varios IDs de Spotify).
Las canciones que no están en Spotify (solo YouTube Music o QQ Music) no tienen alcance en la muestra.

Semanas: lunes a domingo, numeradas desde el 26-dic-2016 (como la popularidad de las versiones anteriores).
Salida: datos/v3/alcance/<nn>.js  window.cargarAlcance(nn, {idx: [semana_inicio, [países, …]]}), por idx % 32.

Uso: uv run --with duckdb python scripts/13_alcance_v3.py   (después de 11_base_fija_v3.py)
"""
import datetime as dt
import json
import os
import re
import shutil
from pathlib import Path

import duckdb

RAIZ = Path(__file__).resolve().parent.parent
DATOS = RAIZ / "datos"
SALIDA = DATOS / "v3" / "alcance"
DIARIO = Path(os.environ.get("INFOVIS_RAW_DIR", RAIZ / "Data")) / "charts_songs_daily.parquet"
JFREYBERG = Path(os.environ.get("INFOVIS_JFREYBERG", Path.home() / "InfoVis-datos" / "kaggle" / "jfreyberg.parquet"))
SEMANA_0 = dt.date(2016, 12, 26)
TOP = 50
FRAGMENTOS = 32
BASE_EXTRA, BASE_V3 = 1_000_000, 2_000_000


def leer(ruta, variable):
    return json.loads(re.search(rf"window\.{variable} = (.*?);\n", ruta.read_text(encoding="utf-8"), re.S).group(1))


numero1 = leer(DATOS / "v3" / "numero1.js", "NUMERO1")
periodos = leer(DATOS / "v3" / "numero1.js", "PERIODOS")
muestra = sorted(cc for lista in leer(DATOS / "v3" / "muestra.js", "MUESTRA").values() for cc in lista)
base = leer(DATOS / "canciones.js", "CANCIONES")
v3 = json.loads(re.search(r"window\.V3 = (.*);\n", (DATOS / "v3" / "canciones.js").read_text(encoding="utf-8"), re.S).group(1))

# Canciones que pueden mostrarse (son #1 en algún país o en el mundo): título y artistas.
canciones = {}
for grano in numero1.values():
    for tramos in grano.values():
        for _, idx, _ in tramos:
            if idx is None or idx in canciones:
                continue
            if idx < BASE_EXTRA:
                canciones[idx] = (base[idx][1], base[idx][2])
            elif idx >= BASE_V3:
                canciones[idx] = tuple(v3["canciones"][str(idx)][1:3])
desde = dt.date.fromisoformat(periodos["dia"]["base"])

con = duckdb.connect()
# Una canción se reconoce por título y primer artista, no por ID de Spotify: el mismo hit aparece con varios IDs
# (ediciones, sencillo y álbum; "Lean On" tiene tres en 2015) y cada país puede usar otro. El título se compara
# sin lo que va entre paréntesis o corchetes ni lo que sigue a " - " ("feat.", "Remix", "Remastered"); el
# artista, hasta la primera coma.
con.execute(r"""CREATE MACRO clave(titulo, artistas) AS
    trim(lower(regexp_replace(regexp_replace(titulo, '\s*[\(\[][^\)\]]*[\)\]]', '', 'g'), '\s+-\s+.*$', '')))
    || '|' || trim(lower(split_part(artistas, ',', 1)))""")
con.execute("CREATE TABLE canciones (idx BIGINT, titulo VARCHAR, artistas VARCHAR)")
con.executemany("INSERT INTO canciones VALUES (?, ?, ?)", [(i, t, a) for i, (t, a) in canciones.items()])
con.execute("CREATE TABLE claves AS SELECT idx, clave(titulo, artistas) AS k FROM canciones")
con.execute(f"CREATE TABLE muestra AS SELECT unnest({muestra}) AS country")
filas = con.execute(f"""
    WITH semanas AS (
        SELECT clave(track_name, replace(artist_names, '|', ',')) AS k, country,
               CAST(floor(datediff('day', DATE '{SEMANA_0}', date) / 7.0) AS INTEGER) AS s
        FROM '{DIARIO}' WHERE rank <= {TOP} AND country IN (SELECT country FROM muestra)
        UNION
        SELECT clave(name, replace(replace(replace(artists, '[', ''), ']', ''), '''', '')) AS k, country,
               CAST(floor((datediff('day', DATE '{SEMANA_0}', d) - 3) / 7.0) AS INTEGER) AS s   -- el chart cubre los 7 días que terminan en d
        FROM '{JFREYBERG}' WHERE position <= {TOP} AND d >= DATE '{desde}' AND d < DATE '2017-01-01'
          AND country IN (SELECT country FROM muestra)
    )
    SELECT claves.idx, s, count(DISTINCT country) FROM semanas JOIN claves USING (k) GROUP BY 1, 2 ORDER BY 1, 2
""").fetchall()

por_cancion = {}
for idx, s, n in filas:
    por_cancion.setdefault(idx, {})[int(s)] = n
fragmentos = [{} for _ in range(FRAGMENTOS)]
for idx, semanas in por_cancion.items():
    ini, fin = min(semanas), max(semanas)
    fragmentos[idx % FRAGMENTOS][idx] = [ini, [semanas.get(s, 0) for s in range(ini, fin + 1)]]

shutil.rmtree(SALIDA, ignore_errors=True)
SALIDA.mkdir(parents=True)
for n, frag in enumerate(fragmentos):
    (SALIDA / f"{n:02d}.js").write_text(
        f"window.cargarAlcance({n}, {json.dumps(frag, separators=(',', ':'))});\n", encoding="utf-8")
maximo = max((max(v) for v in (x[1] for f in fragmentos for x in f.values())), default=0)
print(f"{len(por_cancion)} de {len(canciones)} canciones con alcance · muestra de {len(muestra)} países · máximo {maximo} · "
      f"{sum(f.stat().st_size for f in SALIDA.iterdir()) / 1e6:.1f} MB")
