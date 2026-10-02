"""Construye todos los datos de la web a partir de los charts diarios de Spotify.

Salidas (en datos/):
  paises.js             window.PAISES     nombre, ISO3, continente y primer día con chart de cada país
  canciones.js          window.CANCIONES  [track_id, título, artistas, portada, estreno] de cada canción
                                          que fue #1 o estuvo en algún top 5 (país, continente o mundo)
  numero1.js            window.PERIODOS y window.NUMERO1: por granularidad y país, tramos
                        [periodo_inicio, índice_canción] (solo se guarda cuando el #1 cambia)
  top5/<ámbito>.js      top 5 de cada período para un país, un continente o el mundo ("global");
                        se carga al elegir ese ámbito
  popularidad/<nn>.js   reproducciones semanales (miles) de cada canción sumando los charts de los
                        70 países; repartidas en 64 archivos que se cargan al seleccionar una canción

#1 / top 5 del día = puestos del chart diario (en un continente: más streams sumados ese día).
De semana, mes o año = las canciones con más streams sumados en ese período.

Uso: python scripts/02_construir_datos.py   (requiere haber corrido 01_csv_a_parquet.py)
"""
import json
import shutil
import time
import urllib.request

import duckdb

from config import RAW_DIR, SONGS_PARQUET, WEB_DATA_DIR

EXCLUIR = ("il", "by")                 # solo tienen unas semanas de 2026
BASE_PORTADA = "https://i.scdn.co/image/"
PREFIJO_PORTADA = "ab67616d00001e02"   # comparten casi todas las portadas de 300 px: se guarda solo el resto
FRAGMENTOS = 64                        # archivos de popularidad
# granularidad → (unidad de DuckDB, fecha base del índice de período)
GRANOS = {
    "dia":    ("day",   "2017-01-01"),
    "semana": ("week",  "2016-12-26"),  # lunes de la semana que contiene el 1-ene-2017
    "mes":    ("month", "2017-01-01"),
    "anio":   ("year",  "2017-01-01"),
}
# Continentes = los botones de región del mapa (Medio Oriente va con África; México con América).
CONTINENTES = {
    "america": ["ar", "bo", "br", "ca", "cl", "co", "cr", "do", "ec", "gt", "hn", "mx", "ni", "pa", "pe", "py", "sv", "us", "uy", "ve"],
    "europa":  ["at", "be", "bg", "ch", "cz", "de", "dk", "ee", "es", "fi", "fr", "gb", "gr", "hu", "ie", "is", "it", "lt",
                "lu", "lv", "nl", "no", "pl", "pt", "ro", "se", "sk", "ua"],
    "africa":  ["ae", "eg", "ma", "ng", "sa", "tr", "za"],
    "asia":    ["hk", "id", "in", "jp", "kr", "kz", "my", "ph", "pk", "sg", "th", "tw", "vn"],
    "oceania": ["au", "nz"],
}


def js(nombre_global, obj):
    return f"window.{nombre_global} = {json.dumps(obj, ensure_ascii=False, separators=(',', ':'))};\n"


def llamada(funcion, clave, obj):
    """Archivo que se carga con <script> bajo demanda (funciona también abriendo index.html sin servidor)."""
    return f"window.{funcion}({json.dumps(clave)}, {json.dumps(obj, ensure_ascii=False, separators=(',', ':'))});\n"


t0 = time.time()
con = duckdb.connect()
con.execute(f"CREATE TABLE c AS SELECT * FROM '{SONGS_PARQUET}' WHERE country NOT IN {EXCLUIR}")
con.execute("CREATE TABLE pc (continente VARCHAR, country VARCHAR)")
con.executemany("INSERT INTO pc VALUES (?, ?)", [(k, cc) for k, ps in CONTINENTES.items() for cc in ps])
sin_continente = con.execute("SELECT DISTINCT country FROM c ANTI JOIN pc USING (country) WHERE country <> 'global'").fetchall()
assert not sin_continente, f"países sin continente: {sin_continente}"
fecha_max = con.execute("SELECT max(date) FROM c").fetchone()[0]
n_periodos = {g: con.execute(f"SELECT datediff('{u}', DATE '{b}', date_trunc('{u}', DATE '{fecha_max}')) + 1").fetchone()[0]
              for g, (u, b) in GRANOS.items()}

# ---------- Ranking por ámbito (país, "global" o continente) y período ----------
# Desempate determinista entre canciones con los mismos streams (vía hash del id).
partes = []
for grano, (unidad, base) in GRANOS.items():
    p = f"datediff('{unidad}', DATE '{base}', date_trunc('{unidad}', date))"
    if grano == "dia":
        partes.append(f"SELECT '{grano}' AS grano, country AS ambito, {p} AS p, track_id, rank AS orden FROM c WHERE rank <= 5")
    else:
        partes.append(f"""SELECT '{grano}', ambito, p, track_id, row_number() OVER (PARTITION BY ambito, p ORDER BY st DESC, hash(track_id)) FROM (
                            SELECT country AS ambito, {p} AS p, track_id, sum(coalesce(streams, 0)) AS st FROM c GROUP BY ALL)
                          QUALIFY row_number() OVER (PARTITION BY ambito, p ORDER BY st DESC, hash(track_id)) <= 5""")
    partes.append(f"""SELECT '{grano}', ambito, p, track_id, row_number() OVER (PARTITION BY ambito, p ORDER BY st DESC, hash(track_id)) FROM (
                        SELECT continente AS ambito, {p} AS p, track_id, sum(coalesce(streams, 0)) AS st
                        FROM c JOIN pc USING (country) GROUP BY ALL)
                      QUALIFY row_number() OVER (PARTITION BY ambito, p ORDER BY st DESC, hash(track_id)) <= 5""")
con.execute("CREATE TABLE top AS " + " UNION ALL ".join(partes))
print(f"top 5: {con.execute('SELECT count(*) FROM top').fetchone()[0]:,} filas")

# El #1 de cada país (para el mapa) sale del mismo ranking: solo se guarda cuando cambia.
tramos = con.execute("""
    WITH uno AS (SELECT grano, ambito, p, track_id FROM top WHERE orden = 1 AND ambito NOT IN (SELECT continente FROM pc)),
    cambios AS (SELECT *, lag(track_id) OVER (PARTITION BY grano, ambito ORDER BY p) AS anterior FROM uno)
    SELECT grano, ambito, p, track_id FROM cambios WHERE anterior IS DISTINCT FROM track_id ORDER BY grano, ambito, p
""").fetchall()

# ---------- Catálogo de canciones ----------
con.execute("CREATE TABLE ids AS SELECT DISTINCT track_id FROM top ORDER BY track_id")
ids = [r[0] for r in con.execute("SELECT track_id FROM ids ORDER BY track_id").fetchall()]
indice = {tid: i for i, tid in enumerate(ids)}
meta = con.execute(f"""
    WITH nombres AS (
        SELECT track_id, arg_max(track_name, date) AS track_name, arg_max(artist_names, date) AS artist_names,
               min(release_date) AS estreno
        FROM c WHERE track_id IN (SELECT track_id FROM ids) GROUP BY 1
    ),
    s AS (SELECT replace(track_uri, 'spotify:track:', '') AS track_id, track_name, artist_names, release_date
          FROM read_csv('{RAW_DIR / "songs.csv"}', all_varchar = true)),
    a AS (SELECT replace(uri, 'spotify:track:', '') AS track_id, arg_max(image_url, last_seen_date) AS img
          FROM read_csv('{RAW_DIR / "artwork.csv"}', all_varchar = true) WHERE type = 'song' GROUP BY 1)
    SELECT ids.track_id,
           coalesce(s.track_name, n.track_name, '(sin título)'),
           coalesce(s.artist_names, n.artist_names, ''),
           a.img,
           coalesce(TRY_CAST(s.release_date AS DATE), n.estreno)
    FROM ids
    LEFT JOIN s USING (track_id) LEFT JOIN nombres n USING (track_id) LEFT JOIN a USING (track_id)
""").fetchall()
por_id = {m[0]: m for m in meta}
canciones = []
for tid in ids:
    _, titulo, artistas, img, estreno = por_id[tid]
    hash_img = img.removeprefix(BASE_PORTADA) if img else ""
    # Portada: solo lo que sigue al prefijo común; "~" marca las pocas que no lo comparten.
    portada = hash_img.removeprefix(PREFIJO_PORTADA) if hash_img.startswith(PREFIJO_PORTADA) else (f"~{hash_img}" if hash_img else "")
    canciones.append([tid, titulo, artistas.replace("|", ", "), portada, estreno.isoformat() if estreno else ""])

# ---------- Países ----------
archivo_paises = RAW_DIR / "countries_mledoze.json"
if not archivo_paises.exists():
    urllib.request.urlretrieve("https://raw.githubusercontent.com/mledoze/countries/master/countries.json", archivo_paises)
mledoze = {c["cca2"].lower(): c for c in json.load(open(archivo_paises))}
continente_de = {cc: k for k, ps in CONTINENTES.items() for cc in ps}
paises = {}
for cc, inicio in con.execute("SELECT country, min(date) FROM c GROUP BY 1 ORDER BY 1").fetchall():
    if cc == "global":
        paises[cc] = {"iso3": "", "nombre": "Global", "continente": None, "inicio": inicio.isoformat()}
        continue
    m = mledoze[cc]
    paises[cc] = {"iso3": m["cca3"], "nombre": m["translations"]["spa"]["common"],
                  "continente": continente_de[cc], "inicio": inicio.isoformat()}

# ---------- #1 por país (tramos) ----------
numero1 = {g: {} for g in GRANOS}
for grano, cc, p, tid in tramos:
    numero1[grano].setdefault(cc, []).append([p, indice[tid]])
periodos = {g: {"base": b, "n": n_periodos[g]} for g, (_, b) in GRANOS.items()}

# ---------- Top 5 por ámbito ----------
dir_top = WEB_DATA_DIR / "top5"
shutil.rmtree(dir_top, ignore_errors=True)
dir_top.mkdir(parents=True)
tops = {}
for grano, ambito, p, tid, orden in con.execute("SELECT * FROM top ORDER BY ambito, grano, p, orden").fetchall():
    if ambito not in tops:
        tops[ambito] = {g: [[] for _ in range(n_periodos[g])] for g in GRANOS}
    lista = tops[ambito][grano]
    if 0 <= p < len(lista):
        lista[p].append(indice[tid])
for ambito, datos in tops.items():
    (dir_top / f"{ambito}.js").write_text(llamada("cargarTop5", ambito, datos), encoding="utf-8")

# ---------- Popularidad semanal (suma de los charts de los 70 países, en miles de streams) ----------
dir_pop = WEB_DATA_DIR / "popularidad"
shutil.rmtree(dir_pop, ignore_errors=True)
dir_pop.mkdir(parents=True)
semanas = con.execute("""
    SELECT track_id, datediff('week', DATE '2016-12-26', date_trunc('week', date)) AS s, sum(coalesce(streams, 0)) AS st
    FROM c WHERE country <> 'global' AND track_id IN (SELECT track_id FROM ids)
    GROUP BY ALL ORDER BY track_id, s
""").fetchall()
por_cancion = {}
for tid, s, st in semanas:
    por_cancion.setdefault(indice[tid], []).append((s, st))
fragmentos = [{} for _ in range(FRAGMENTOS)]
for idx, filas in por_cancion.items():
    inicio, fin = filas[0][0], filas[-1][0]
    valores = [0] * (fin - inicio + 1)
    for s, st in filas:
        valores[s - inicio] = max(1, round(st / 1000)) if st else 0
    fragmentos[idx % FRAGMENTOS][idx] = [inicio, valores]
for n, frag in enumerate(fragmentos):
    (dir_pop / f"{n:02d}.js").write_text(llamada("cargarPopularidad", n, frag), encoding="utf-8")

# ---------- Archivos base ----------
WEB_DATA_DIR.mkdir(exist_ok=True)
(WEB_DATA_DIR / "paises.js").write_text(js("PAISES", paises), encoding="utf-8")
(WEB_DATA_DIR / "canciones.js").write_text(
    js("BASE_PORTADA", BASE_PORTADA) + js("PREFIJO_PORTADA", PREFIJO_PORTADA) + js("CANCIONES", canciones), encoding="utf-8")
(WEB_DATA_DIR / "numero1.js").write_text(
    js("FECHA_MAX", fecha_max.isoformat()) + js("PERIODOS", periodos) + js("NUMERO1", numero1), encoding="utf-8")

def kb(ruta):
    return sum(f.stat().st_size for f in ([ruta] if ruta.is_file() else ruta.iterdir())) / 1e3

print(f"{len(canciones):,} canciones, {len(paises) - 1} países + global, {len(tops)} ámbitos de top 5, datos hasta {fecha_max}")
for nombre in ("paises.js", "canciones.js", "numero1.js", "top5", "popularidad"):
    print(f"  {nombre}: {kb(WEB_DATA_DIR / nombre):,.0f} KB")
print(f"{time.time() - t0:.0f}s")
