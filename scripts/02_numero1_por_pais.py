"""Calcula la canción #1 de cada país por día, semana, mes y año, y exporta los datos del mapa.

Salidas (en datos/):
  paises.js     window.PAISES     nombre, ISO3 y primer día con chart de cada país
  canciones.js  window.CANCIONES  [track_id, título, artistas, portada] de cada canción que fue #1
  numero1.js    window.PERIODOS y window.NUMERO1: por granularidad y país, tramos [periodo_inicio, índice_canción]
                (el #1 se repite muchos días seguidos, así que se guarda solo cuando cambia)

#1 del día = puesto 1 del chart diario. #1 de semana/mes/año = la canción con más streams sumados en ese período.

Uso: python scripts/02_numero1_por_pais.py   (requiere haber corrido 01_csv_a_parquet.py)
"""
import json
import time
import urllib.request

import duckdb

from config import RAW_DIR, SONGS_PARQUET, WEB_DATA_DIR

EXCLUIR = ("il", "by")                 # solo tienen unas semanas de 2026
PREFIJO_PORTADA = "https://i.scdn.co/image/"
# granularidad → (unidad de DuckDB, fecha base del índice de período)
GRANOS = {
    "dia":    ("day",   "2017-01-01"),
    "semana": ("week",  "2016-12-26"),  # lunes de la semana que contiene el 1-ene-2017
    "mes":    ("month", "2017-01-01"),
    "anio":   ("year",  "2017-01-01"),
}


def js(nombre_global, obj):
    return f"window.{nombre_global} = {json.dumps(obj, ensure_ascii=False, separators=(',', ':'))};\n"


t0 = time.time()
con = duckdb.connect()
con.execute(f"CREATE TABLE c AS SELECT * FROM '{SONGS_PARQUET}' WHERE country NOT IN {EXCLUIR}")
fecha_max = con.execute("SELECT max(date) FROM c").fetchone()[0]

tramos = {}
for grano, (unidad, base) in GRANOS.items():
    if grano == "dia":
        top = "SELECT country, date AS periodo, track_id FROM c WHERE rank = 1"
    else:
        # Desempate determinista entre canciones con los mismos streams (vía hash del id).
        top = f"""
        SELECT country, periodo, arg_max(track_id, (st, -hash(track_id))) AS track_id FROM (
            SELECT country, date_trunc('{unidad}', date) AS periodo, track_id, sum(coalesce(streams, 0)) AS st
            FROM c GROUP BY ALL
        ) GROUP BY ALL"""
    filas = con.execute(f"""
        WITH t AS ({top}),
        idx AS (SELECT country, datediff('{unidad}', DATE '{base}', periodo) AS p, track_id FROM t),
        cambios AS (
            SELECT *, lag(track_id) OVER (PARTITION BY country ORDER BY p) AS anterior FROM idx
        )
        SELECT country, p, track_id FROM cambios
        WHERE anterior IS DISTINCT FROM track_id
        ORDER BY country, p
    """).fetchall()
    n_periodos = con.execute(
        f"SELECT datediff('{unidad}', DATE '{base}', date_trunc('{unidad}', DATE '{fecha_max}')) + 1").fetchone()[0]
    tramos[grano] = {"filas": filas, "base": base, "n": n_periodos}
    print(f"{grano:6s}: {n_periodos:5d} períodos, {len(filas):6d} cambios de #1")

# ---------- Canciones ----------
ids = sorted({f[2] for g in tramos.values() for f in g["filas"]})
con.execute("CREATE TABLE ids (track_id VARCHAR)")
con.executemany("INSERT INTO ids VALUES (?)", [(i,) for i in ids])
meta = con.execute(f"""
    WITH nombres AS (
        SELECT track_id, arg_max(track_name, date) AS track_name, arg_max(artist_names, date) AS artist_names
        FROM c WHERE track_name IS NOT NULL AND track_id IN (SELECT track_id FROM ids) GROUP BY 1
    ),
    s AS (SELECT replace(track_uri, 'spotify:track:', '') AS track_id, track_name, artist_names
          FROM read_csv('{RAW_DIR / "songs.csv"}', all_varchar = true)),
    a AS (SELECT replace(uri, 'spotify:track:', '') AS track_id, arg_max(image_url, last_seen_date) AS img
          FROM read_csv('{RAW_DIR / "artwork.csv"}', all_varchar = true) WHERE type = 'song' GROUP BY 1)
    SELECT ids.track_id,
           coalesce(s.track_name, n.track_name, '(sin título)'),
           coalesce(s.artist_names, n.artist_names, ''),
           a.img
    FROM ids
    LEFT JOIN s USING (track_id) LEFT JOIN nombres n USING (track_id) LEFT JOIN a USING (track_id)
""").fetchall()
por_id = {m[0]: m for m in meta}
indice = {tid: i for i, tid in enumerate(ids)}
canciones = []
for tid in ids:
    _, titulo, artistas, img = por_id[tid]
    portada = img.removeprefix(PREFIJO_PORTADA) if img else ""
    canciones.append([tid, titulo, artistas.replace("|", ", "), portada])

# ---------- Países ----------
archivo_paises = RAW_DIR / "countries_mledoze.json"
if not archivo_paises.exists():
    urllib.request.urlretrieve("https://raw.githubusercontent.com/mledoze/countries/master/countries.json", archivo_paises)
mledoze = {c["cca2"].lower(): c for c in json.load(open(archivo_paises))}
paises = {}
for cc, inicio in con.execute("SELECT country, min(date) FROM c GROUP BY 1 ORDER BY 1").fetchall():
    if cc == "global":
        paises[cc] = {"iso3": "", "nombre": "Global", "inicio": inicio.isoformat()}
        continue
    m = mledoze[cc]
    paises[cc] = {"iso3": m["cca3"], "nombre": m["translations"]["spa"]["common"], "inicio": inicio.isoformat()}

# ---------- Tramos por granularidad ----------
numero1, periodos = {}, {}
for grano, g in tramos.items():
    por_pais = {}
    for cc, p, tid in g["filas"]:
        por_pais.setdefault(cc, []).append([p, indice[tid]])
    numero1[grano] = por_pais
    periodos[grano] = {"base": g["base"], "n": g["n"]}

WEB_DATA_DIR.mkdir(exist_ok=True)
(WEB_DATA_DIR / "paises.js").write_text(js("PAISES", paises))
(WEB_DATA_DIR / "canciones.js").write_text(
    js("PREFIJO_PORTADA", PREFIJO_PORTADA) + js("CANCIONES", canciones))
(WEB_DATA_DIR / "numero1.js").write_text(
    js("FECHA_MAX", fecha_max.isoformat()) + js("PERIODOS", periodos) + js("NUMERO1", numero1))

sin_portada = sum(1 for c in canciones if not c[3])
print(f"{len(canciones)} canciones ({sin_portada} sin portada), {len(paises) - 1} países + global, datos hasta {fecha_max}")
for f in ("paises.js", "canciones.js", "numero1.js"):
    print(f"  {f}: {(WEB_DATA_DIR / f).stat().st_size / 1e3:.0f} KB")
print(f"{time.time() - t0:.0f}s")
