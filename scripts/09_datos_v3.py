"""Datos de la V3: el #1 de cada país desde octubre de 2013, uniendo fuentes, en datos/v3/.

Fuentes por orden de prioridad (para cada país y período manda la primera que tenga dato):
  s  Spotify diario 2017–2026 (Kaggle gonzalopezgil; ya procesado en datos/numero1.js)
  s  Spotify semanal 2013–2023 (Kaggle jfreyberg, tomado de kworb): antes de 2017 y en países que el diario
     no incluye (Rusia 2020–2022, Bielorrusia, Israel, Malta, Andorra…)
  y  YouTube Music Charts, semanal desde 2018 (datos/extra.js, de 08_fuentes_extra.py)
  a  Apple Music: solo el chart descargado del día (datos/extra.js)
El #1 global (chart "global" de Spotify) existe desde el 29-sep-2013: por eso la V3 empieza en octubre de 2013.

No modifica datos/ (lo usan la V1 y la V2). Salidas:
  datos/v3/paises.js     window.PAISES   (como datos/paises.js, más los países de las otras fuentes)
  datos/v3/numero1.js    window.FECHA_MAX, window.PERIODOS, window.NUMERO1 con tramos [periodo, idx, fuente]
  datos/v3/canciones.js  window.V3 = {canciones: {idx: [track_id, título, artistas, portada, estreno]},
                                      popularidad: {idx: [semana_inicio, [miles]]}, previa: {idx: [...]}}
     Índices: < 20.930 catálogo base (datos/canciones.js) · ≥ 1.000.000 extra.js · ≥ 2.000.000 canciones de la V3.

Uso: python scripts/09_datos_v3.py   (después de 06 y 08)
"""
import datetime as dt
import json
import os
import re
import urllib.request
from pathlib import Path

import duckdb

RAIZ = Path(__file__).resolve().parent.parent
DATOS = RAIZ / "datos"
SALIDA = DATOS / "v3"
EXTRA_DIR = Path(os.environ.get("INFOVIS_EXTRA_DIR", Path.home() / "InfoVis-datos"))
JFREYBERG = Path(os.environ.get("INFOVIS_JFREYBERG", EXTRA_DIR / "kaggle" / "jfreyberg.parquet"))
MLEDOZE = EXTRA_DIR / "countries_mledoze.json"
BASE_V3 = 2_000_000
PREFIJO_PORTADA = "ab67616d00001e02"
SEMANA_POP = dt.date(2016, 12, 26)          # semana 0 de popularidad_todas/ (no cambia)

BASES = {"dia": dt.date(2013, 10, 1), "semana": dt.date(2013, 9, 30), "mes": dt.date(2013, 10, 1), "anio": dt.date(2013, 1, 1)}


def leer_js(ruta, variable):
    texto = ruta.read_text(encoding="utf-8")
    return json.loads(re.search(rf"window\.{variable} = (.*?);\n", texto, re.S).group(1))


def fecha_periodo(grano, p):
    b = BASES[grano]
    if grano == "dia":
        return b + dt.timedelta(days=p)
    if grano == "semana":
        return b + dt.timedelta(weeks=p)
    if grano == "mes":
        return dt.date(b.year + (b.month - 1 + p) // 12, (b.month - 1 + p) % 12 + 1, 1)
    return dt.date(b.year + p, 1, 1)


def periodo_de(grano, f):
    b = BASES[grano]
    if grano == "dia":
        return (f - b).days
    if grano == "semana":
        return (f - b).days // 7
    if grano == "mes":
        return (f.year - b.year) * 12 + f.month - b.month
    return f.year - b.year


# ---------- Datos existentes (base 2017) ----------
viejo_periodos = leer_js(DATOS / "numero1.js", "PERIODOS")
fecha_max = dt.date.fromisoformat(leer_js(DATOS / "numero1.js", "FECHA_MAX"))
viejo_n1 = leer_js(DATOS / "numero1.js", "NUMERO1")
paises = leer_js(DATOS / "paises.js", "PAISES")
base = leer_js(DATOS / "canciones.js", "CANCIONES")
extra = json.loads(re.search(r"window\.EXTRA = (.*);\n", (DATOS / "extra.js").read_text(encoding="utf-8"), re.S).group(1))
mledoze = {c["cca2"].lower(): c for c in json.load(open(MLEDOZE))}
periodos = {g: {"base": BASES[g].isoformat(), "n": periodo_de(g, fecha_max) + 1} for g in BASES}
desplazamiento = {g: periodo_de(g, dt.date.fromisoformat(viejo_periodos[g]["base"])) for g in BASES}

id_a_idx = {c[0]: i for i, c in enumerate(base)}
canciones_v3, por_id_v3 = {}, {}


def continente(cc):
    m = mledoze[cc]
    if m["region"] == "Americas":
        return "america"
    if m["region"] == "Europe":
        return "europa"
    if m["region"] == "Oceania":
        return "oceania"
    if m["region"] == "Africa" or m.get("subregion") == "Western Asia":
        return "africa"
    return "asia"


def expandir(tramos, n, desde=0):
    """Tramos [[p, idx], …] (base 2017) → lista por período (base 2013) con None donde no hay dato."""
    salida = [None] * n
    for i, (p, idx, *_) in enumerate(tramos):
        fin = tramos[i + 1][0] if i + 1 < len(tramos) else n - desde
        for q in range(p + desde, min(fin + desde, n)):
            salida[q] = idx
    return salida


# Catálogo completo: track_id → índice (para las canciones del catálogo extendido, que pasan a la V3)
meta_extra = {}
for f in sorted((DATOS / "catalogo" / "meta").glob("*.js")):
    for idx, (tid, portada, estreno) in json.loads(re.search(r"\(\d+, (.*)\);\n", f.read_text(encoding="utf-8"), re.S).group(1)).items():
        meta_extra[tid] = (int(idx), portada, estreno)
buscar = json.loads(re.search(r"window\.cargarBuscar\(\"todo\", (.*)\);\n", (DATOS / "catalogo/buscar.js").read_text(encoding="utf-8"), re.S).group(1))


def indice_spotify(tid, titulo, artistas):
    """Índice de una canción de Spotify: el del catálogo base, o uno nuevo de la V3 (con sus datos)."""
    if tid in id_a_idx:
        return id_a_idx[tid]
    if tid not in por_id_v3:
        idx = BASE_V3 + len(por_id_v3)
        por_id_v3[tid] = idx
        if tid in meta_extra:
            viejo, portada, estreno = meta_extra[tid]
            canciones_v3[idx] = [tid, buscar["t"][viejo], buscar["a"][viejo], portada, estreno]
        else:
            canciones_v3[idx] = [tid, titulo, artistas, "", ""]
    return por_id_v3[tid]


# ---------- Spotify semanal 2013–2023 (jfreyberg) ----------
con = duckdb.connect()
con.execute(f"""CREATE TABLE j AS SELECT DISTINCT d, country, position, streams, track_id, name,
                  replace(replace(replace(artists, '[', ''), ']', ''), '''', '') AS artistas
                FROM '{JFREYBERG}' WHERE d >= DATE '2013-09-24'""")
semanal = {}                                   # cc → {fecha_chart: idx del #1}
# El dataset trae a veces la misma canción con dos IDs como #1 de la misma semana (544 semanas-país, p. ej.
# "Take Me To Church"): se elige siempre el ID menor, en el global y en cada país, para que el resultado no
# dependa del orden de las filas y un mismo hit calce con el #1 global.
for d, cc, tid, name, arts in con.execute("""
        SELECT d, country, min(track_id), arg_min(name, track_id), arg_min(artistas, track_id)
        FROM j WHERE position = 1 GROUP BY 1, 2 ORDER BY 1, 2""").fetchall():
    semanal.setdefault(cc, {})[d] = indice_spotify(tid, name, arts)
# mes y año: la canción con más streams sumados en el período (empates: el ID menor)
agregado = {"mes": {}, "anio": {}}
for grano, unidad in (("mes", "month"), ("anio", "year")):
    for cc, inicio, tid, name, arts in con.execute(f"""
        SELECT country, ini, track_id, nm, ar FROM (
            SELECT country, date_trunc('{unidad}', d) AS ini, track_id, min(name) AS nm, min(artistas) AS ar,
                   row_number() OVER (PARTITION BY country, date_trunc('{unidad}', d)
                                      ORDER BY sum(streams) DESC, track_id) AS r
            FROM j GROUP BY country, date_trunc('{unidad}', d), track_id)
        WHERE r = 1 ORDER BY country, ini""").fetchall():
        agregado[grano].setdefault(cc, {})[periodo_de(grano, inicio)] = indice_spotify(tid, name, arts)


def semanal_por_periodo(cc, grano, n):
    fechas = sorted(semanal.get(cc, {}))
    salida = [None] * n
    if grano in ("mes", "anio"):
        for p, idx in agregado[grano].get(cc, {}).items():
            if 0 <= p < n:
                salida[p] = idx
        return salida
    j = 0
    for p in range(n):
        ini = fecha_periodo(grano, p)
        ref = ini + dt.timedelta(days=3) if grano == "semana" else ini   # mitad de la semana
        while j < len(fechas) and fechas[j] < ref:
            j += 1
        if j < len(fechas) and fechas[j] - dt.timedelta(days=6) <= ref:  # el chart cubre los 7 días que terminan en su fecha
            salida[p] = semanal[cc][fechas[j]]
    return salida


# Canciones de extra.js enlazadas al catálogo extendido (índices 20.930–999.999): pasan a la V3 con sus datos,
# para no tener que cargar el índice del buscador en la app.
idx_a_tid = {v[0]: tid for tid, v in meta_extra.items()}


def a_v3(idx):
    if idx is None or idx < len(base) or idx >= 1_000_000:
        return idx
    tid = idx_a_tid.get(idx)
    return indice_spotify(tid, buscar["t"][idx], buscar["a"][idx]) if tid else idx


# ---------- Unir fuentes ----------
todos = sorted(set(paises) | set(semanal) | set(extra["paises"]))
numero1 = {g: {} for g in BASES}
paises_v3 = {}
for cc in todos:
    if cc != "global" and (cc not in mledoze or cc in ("aq",)):
        continue
    primera = None
    for grano, info in periodos.items():
        n = info["n"]
        capas = [
            ("s", expandir(viejo_n1[grano].get(cc, []), n, desplazamiento[grano])),
            ("s", semanal_por_periodo(cc, grano, n)),
            ("y" if extra["fuentes"].get(cc, "").startswith("YouTube") else "a",
             [a_v3(i) for i in expandir(extra["numero1"][grano].get(cc, []), n, desplazamiento[grano])]),
        ]
        tramos, previo = [], None
        for p in range(n):
            elegido = next(((f, v[p]) for f, v in capas if v[p] is not None), None)
            if elegido and elegido != previo:
                tramos.append([p, elegido[1], elegido[0]])
            elif not elegido and previo:
                tramos.append([p, None, None])                 # se corta (p. ej., Spotify sale de Rusia)
            previo = elegido
        if tramos:
            numero1[grano][cc] = tramos
            if grano == "dia":
                primera = fecha_periodo("dia", next(t[0] for t in tramos if t[1] is not None))
    if primera is None:
        continue
    if cc == "global":
        paises_v3[cc] = {**paises.get("global", {}), "inicio": primera.isoformat()}
    else:
        m = mledoze[cc]
        previo = paises.get(cc) or extra["paises"].get(cc) or {}
        paises_v3[cc] = {"iso3": m["cca3"], "nombre": previo.get("nombre") or m["translations"]["spa"]["common"],
                         "continente": previo.get("continente") or continente(cc), "inicio": primera.isoformat()}

# ---------- Portadas que faltan (oEmbed público de Spotify) y popularidad semanal ----------
for idx, c in canciones_v3.items():
    if c[3]:
        continue
    try:
        with urllib.request.urlopen(f"https://open.spotify.com/oembed?url=spotify:track:{c[0]}", timeout=20) as r:
            url = json.load(r).get("thumbnail_url", "")
        hash_img = url.rsplit("/", 1)[-1]
        c[3] = hash_img.removeprefix(PREFIJO_PORTADA) if hash_img.startswith(PREFIJO_PORTADA) else (f"~{hash_img}" if hash_img else "")
    except Exception:
        pass

semanas_pop = {}
filas = con.execute("SELECT track_id, d, sum(streams) FROM j WHERE country <> 'global' GROUP BY 1, 2").fetchall()
ids_interes = {c[0]: idx for idx, c in canciones_v3.items()} | {base[i][0]: i for i in set(id_a_idx.values())}
for tid, d, st in filas:
    idx = ids_interes.get(tid)
    if idx is None:
        continue
    s = (d - SEMANA_POP).days // 7
    semanas_pop.setdefault(idx, {})[s] = semanas_pop.setdefault(idx, {}).get(s, 0) + (st or 0)


def serie(por_semana, hasta=None):
    sem = [s for s in por_semana if hasta is None or s < hasta]
    if not sem:
        return None
    ini, fin = min(sem), max(sem)
    return [ini, [max(1, round(por_semana.get(s, 0) / 1000)) if por_semana.get(s) else 0 for s in range(ini, fin + 1)]]


_fragmentos_pop = {}


def popularidad_catalogo(idx_catalogo):
    """Serie 2017–2026 de una canción del catálogo completo (datos/popularidad_todas, de 06_catalogo_completo.py)."""
    n = idx_catalogo % 256
    if n not in _fragmentos_pop:
        texto = (DATOS / "popularidad_todas" / f"{n:03d}.js").read_text(encoding="utf-8")
        _fragmentos_pop[n] = json.loads(texto[texto.index(",") + 1:].rstrip().removesuffix(");"))
    return _fragmentos_pop[n].get(str(idx_catalogo))


def unir(antes, despues):
    """Lo anterior a 2017 (jfreyberg) seguido de la serie desde 2017, con ceros en el hueco (como pedirPopularidad)."""
    if not antes or not despues:
        return antes or despues
    hueco = [0] * max(0, despues[0] - (antes[0] + len(antes[1])))
    return [antes[0], antes[1] + hueco + despues[1]]


# Canciones de la V3: antes de 2017 vienen de jfreyberg; desde 2017, de la serie completa del catálogo cuando la
# canción está en él (jfreyberg termina en abril de 2023: usarlo solo cortaba la curva ahí, aunque la canción
# siguiera sonando, y dejaba sin popularidad a las que llegan desde YouTube Music).
popularidad, previa = {}, {}
for idx, c in canciones_v3.items():
    por_semana = semanas_pop.get(idx)
    if c[0] in meta_extra:
        s = unir(serie(por_semana, hasta=0) if por_semana else None, popularidad_catalogo(meta_extra[c[0]][0]))
    else:
        s = serie(por_semana) if por_semana else None
    if s:
        popularidad[idx] = s
for idx, por_semana in sorted(semanas_pop.items()):     # catálogo base: solo lo anterior a 2017 (lo demás ya está)
    if idx < BASE_V3 and (s := serie(por_semana, hasta=0)):
        previa[idx] = s

SALIDA.mkdir(exist_ok=True)
js = lambda nombre, obj: f"window.{nombre} = {json.dumps(obj, ensure_ascii=False, separators=(',', ':'))};\n"
(SALIDA / "paises.js").write_text(js("PAISES", paises_v3), encoding="utf-8")
(SALIDA / "numero1.js").write_text(js("FECHA_MAX", fecha_max.isoformat()) + js("PERIODOS", periodos) + js("NUMERO1", numero1), encoding="utf-8")
(SALIDA / "canciones.js").write_text(js("V3", {"canciones": canciones_v3, "popularidad": popularidad, "previa": previa}), encoding="utf-8")

fuentes = {}
for tramos in numero1["dia"].values():
    for _, idx, f in tramos:
        if f:
            fuentes[f] = fuentes.get(f, 0) + 1
print(f"{len(paises_v3) - 1} países + global · períodos {periodos}")
print(f"canciones nuevas de la V3: {len(canciones_v3)} (sin portada: {sum(1 for c in canciones_v3.values() if not c[3])})")
for a in range(2013, 2027):
    print(a, sum(1 for cc, p in paises_v3.items() if cc != "global" and p["inicio"][:4] <= str(a)), "países")
for nombre in ("paises.js", "numero1.js", "canciones.js"):
    print(f"  datos/v3/{nombre}: {(SALIDA / nombre).stat().st_size / 1e6:.1f} MB")
