"""Top 3 de cada país en cada período de la V3 (para el recuadro que aparece al pasar el cursor), en datos/v3/top3/.

Sale de la misma fuente que dio el #1 del mapa en ese período (datos/v3/numero1.js), así el #1 del recuadro es
siempre el del mapa:
  s  Spotify diario 2017–2026: el top 5 de la V2 (datos/top5/<país>.js)
  s  Spotify semanal 2013–2023 (Kaggle jfreyberg): antes de 2017 y en los países que el diario no cubre
  y  YouTube Music, semanal desde 2018 (descarga de 07_descargar_charts.py)
  q  QQ Music (China), semanal desde 2018 y diario desde 2022 (descarga de 12_descargar_qq.py)
  a  Apple Music: la foto del día
Como en el #1: día y semana = puestos del chart que cubre ese día; mes y año = lo más escuchado sumando el período.

Salida: datos/v3/top3/<país>.js
  window.cargarTop3("cl", {"c": [[título, artistas], …],
                           "dia": [[periodo_inicio, i1, i2, i3], …], "semana": …, "mes": …, "anio": …})
  (índices en "c"; cada tramo vale hasta que empieza el siguiente; [p] solo = sin datos desde p)

Uso: uv run --with duckdb python scripts/10_top3_v3.py   (después de 09_datos_v3.py)
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
SALIDA = DATOS / "v3" / "top3"
EXTRA_DIR = Path(os.environ.get("INFOVIS_EXTRA_DIR", Path.home() / "InfoVis-datos"))
JFREYBERG = Path(os.environ.get("INFOVIS_JFREYBERG", EXTRA_DIR / "kaggle" / "jfreyberg.parquet"))
BASE_EXTRA, BASE_V3 = 1_000_000, 2_000_000


def leer_js(ruta, variable):
    return json.loads(re.search(rf"window\.{variable} = (.*?);\n", ruta.read_text(encoding="utf-8"), re.S).group(1))


periodos = leer_js(DATOS / "v3" / "numero1.js", "PERIODOS")
numero1 = leer_js(DATOS / "v3" / "numero1.js", "NUMERO1")
fecha_max = dt.date.fromisoformat(leer_js(DATOS / "v3" / "numero1.js", "FECHA_MAX"))
viejos = leer_js(DATOS / "numero1.js", "PERIODOS")
base = leer_js(DATOS / "canciones.js", "CANCIONES")
extra = json.loads(re.search(r"window\.EXTRA = (.*);\n", (DATOS / "extra.js").read_text(encoding="utf-8"), re.S).group(1))
v3 = json.loads(re.search(r"window\.V3 = (.*);\n", (DATOS / "v3" / "canciones.js").read_text(encoding="utf-8"), re.S).group(1))
BASES = {g: dt.date.fromisoformat(info["base"]) for g, info in periodos.items()}


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


def fin_periodo(grano, p):
    return fecha_periodo(grano, p + 1) - dt.timedelta(days=1)


def nombre(idx):
    """(título, artistas) de una canción del catálogo de la V3."""
    if idx >= BASE_V3:
        c = v3["canciones"][str(idx)]
        return c[1], c[2]
    if idx >= BASE_EXTRA:
        c = extra["canciones"][idx - BASE_EXTRA]
        return c[0], c[1]
    return base[idx][1], base[idx][2]


def numero1_por_periodo(tramos, n):
    """Tramos [p, idx, fuente] → lista por período de (idx, fuente) o None."""
    salida = [None] * n
    for i, (p, idx, fuente) in enumerate(tramos):
        fin = tramos[i + 1][0] if i + 1 < len(tramos) else n
        for q in range(p, fin):
            salida[q] = (idx, fuente) if idx is not None else None
    return salida


# ---------- Spotify diario (top 5 de la V2, base 2017) ----------
def top5_v2(cc):
    ruta = DATOS / "top5" / f"{cc}.js"
    if not ruta.exists():
        return None
    texto = ruta.read_text(encoding="utf-8")
    datos = json.loads(texto[texto.index(",") + 1:].rstrip().removesuffix(");"))
    desplazamiento = {g: periodo_de(g, dt.date.fromisoformat(viejos[g]["base"])) for g in periodos}
    return {g: {p + desplazamiento[g]: [nombre(i) for i in lista[:3]] for p, lista in enumerate(datos[g]) if lista}
            for g in periodos}


# ---------- Spotify semanal 2013–2023 (jfreyberg) ----------
con = duckdb.connect()
con.execute(f"""CREATE TABLE j AS SELECT DISTINCT d, country, position, streams, track_id, name,
                  replace(replace(replace(artists, '[', ''), ']', ''), '''', '') AS artistas
                FROM '{JFREYBERG}' WHERE d >= DATE '2013-09-24'""")
semanal = {}                                     # cc → {fecha del chart: [(título, artistas)] × 3}
for d, cc, nm, ar in con.execute("SELECT d, country, name, artistas FROM j WHERE position <= 3 ORDER BY d, position, track_id").fetchall():
    semanal.setdefault(cc, {}).setdefault(d, []).append((nm, ar))
semanal_agregado = {"mes": {}, "anio": {}}       # cc → {periodo: top 3 por streams sumados}
for grano, unidad in (("mes", "month"), ("anio", "year")):
    for cc, ini, nm, ar in con.execute(f"""
        SELECT country, ini, nm, ar FROM (
            SELECT country, date_trunc('{unidad}', d) AS ini, any_value(name) AS nm, any_value(artistas) AS ar,
                   row_number() OVER (PARTITION BY country, date_trunc('{unidad}', d) ORDER BY sum(streams) DESC, track_id) AS r
            FROM j GROUP BY country, date_trunc('{unidad}', d), track_id)
        WHERE r <= 3 ORDER BY country, ini, r""").fetchall():
        semanal_agregado[grano].setdefault(cc, {}).setdefault(periodo_de(grano, ini), []).append((nm, ar))


def top_semanal(cc, grano, p):
    if grano in ("mes", "anio"):
        return semanal_agregado[grano].get(cc, {}).get(p)
    ini = fecha_periodo(grano, p)
    ref = ini + dt.timedelta(days=3) if grano == "semana" else ini     # el chart cubre los 7 días que terminan en su fecha
    for f in range(7):
        top = semanal.get(cc, {}).get(ref + dt.timedelta(days=f))
        if top:
            return top
    return None


# ---------- YouTube Music (semanas de viernes a jueves) ----------
youtube = {}                                     # cc → {jueves de cierre: [(título, artistas, vistas)]}
for archivo in sorted((EXTRA_DIR / "charts_extra" / "youtube").glob("*.jsonl")):
    for linea in archivo.open(encoding="utf-8"):
        d = json.loads(linea)
        filas = [(t, a, v) for _, _, t, a, v in sorted(d["filas"]) if t]
        if filas:
            youtube.setdefault(archivo.stem, {})[dt.date.fromisoformat(d["semana"])] = filas


def top_youtube(cc, grano, p):
    semanas = youtube.get(cc, {})
    ini = fecha_periodo(grano, p)
    if grano in ("dia", "semana"):
        f = ini + dt.timedelta(days=3) if grano == "semana" else ini
        filas = semanas.get(f + dt.timedelta(days=(3 - f.weekday()) % 7))
        return [(t, a) for t, a, _ in filas[:3]] if filas else None
    fin, total = fin_periodo(grano, p), {}
    for f, filas in semanas.items():
        if ini <= f <= fin:
            for t, a, v in filas:
                total[(t, a)] = total.get((t, a), 0) + v
    return sorted(total, key=total.get, reverse=True)[:3] or None


# ---------- Apple Music: foto del día ----------
archivos_apple = sorted((EXTRA_DIR / "charts_extra" / "apple").glob("*.json"))
apple = json.load(open(archivos_apple[-1], encoding="utf-8")) if archivos_apple else {}


# ---------- QQ Music (China): como en 08_fuentes_extra.py, cada día su chart diario o el semanal que lo cubre ----------
qq = {}                                          # fecha → [(título, artistas)] en orden de puesto
for nombre_qq in ("semanal", "diario"):
    ruta = EXTRA_DIR / "charts_extra" / "qq" / f"{nombre_qq}.jsonl"
    if not ruta.exists():
        continue
    for linea in ruta.open(encoding="utf-8"):
        d = json.loads(linea)
        if not d["periodo"] or not d["filas"]:
            continue
        filas = [(t, a) for _, t, a, _ in sorted(d["filas"]) if t]
        if "_" in d["periodo"]:
            anio, semana = map(int, d["periodo"].split("_"))
            lunes = dt.date.fromisocalendar(anio, semana, 1)
            for i in range(7):
                qq.setdefault(lunes + dt.timedelta(days=i), filas)
        else:
            qq[dt.date.fromisoformat(d["periodo"])] = filas


# Como en 08: un hueco de hasta 3 días en el chart diario toma el del día anterior.
for f in sorted(qq):
    for i in range(1, 4):
        siguiente = f + dt.timedelta(days=i)
        if siguiente in qq:
            break
        if any(f + dt.timedelta(days=j) in qq for j in range(i + 1, 5)):
            qq[siguiente] = qq[f]


def top_qq(grano, p):
    ini = fecha_periodo(grano, p)
    if grano in ("dia", "semana"):
        filas = qq.get(ini + dt.timedelta(days=3) if grano == "semana" else ini)
        return filas[:3] if filas else None
    puntos = {}                                  # mes y año: puntos por puesto (QQ no publica reproducciones)
    for i in range((fin_periodo(grano, p) - ini).days + 1):
        for puesto, x in enumerate(qq.get(ini + dt.timedelta(days=i), []), start=1):
            puntos[x] = puntos.get(x, 0) + 11 - puesto
    return sorted(puntos, key=lambda x: (-puntos[x], x))[:3] or None


# ---------- Unir: el top 3 de la fuente que dio el #1 ----------
def clave(t):
    return re.sub(r"\W+", "", (t or "").lower())


shutil.rmtree(SALIDA, ignore_errors=True)
SALIDA.mkdir(parents=True)
total_kb, coinciden, revisados = 0, 0, 0
por_fuente = {}
for cc in sorted(numero1["dia"]):
    if cc == "global":
        continue
    diario = top5_v2(cc)
    tabla, indices = [], {}
    salida = {"c": tabla}
    for grano, info in periodos.items():
        n = info["n"]
        n1 = numero1_por_periodo(numero1[grano].get(cc, []), n)
        tramos, previo = [], None
        for p in range(n):
            top = None
            if n1[p]:
                idx, fuente = n1[p]
                if fuente == "s":
                    top = (diario or {}).get(grano, {}).get(p) or top_semanal(cc, grano, p)
                elif fuente == "y":
                    top = top_youtube(cc, grano, p)
                elif fuente == "q":
                    top = top_qq(grano, p)
                elif fuente == "a" and cc in apple:
                    top = [(t, a) for _, t, a, _ in apple[cc][:3]]
                # El #1 es el del mapa; el 2.º y el 3.º, los siguientes de esa fuente.
                primero = nombre(idx)
                resto = [x for x in (top or []) if x[0] and clave(x[0]) != clave(primero[0])]
                revisados += 1
                igual = bool(top) and clave(top[0][0]) == clave(primero[0])
                coinciden += igual
                por_fuente.setdefault(fuente, [0, 0])[0] += igual
                por_fuente[fuente][1] += 1
                top = [primero, *resto][:3]
            fila = tuple(indices.setdefault((t, a), len(indices)) for t, a in top) if top else None
            if fila != previo:
                tramos.append([p, *fila] if fila else [p])
                previo = fila
        salida[grano] = tramos
    tabla.extend([t, a] for t, a in indices)
    ruta = SALIDA / f"{cc}.js"
    ruta.write_text(f"window.cargarTop3({json.dumps(cc)}, {json.dumps(salida, ensure_ascii=False, separators=(',', ':'))});\n",
                    encoding="utf-8")
    total_kb += ruta.stat().st_size / 1e3

print(f"{len(list(SALIDA.glob('*.js')))} países · {total_kb:,.0f} KB · el #1 de la fuente coincide con el del mapa "
      f"en {100 * coinciden / max(1, revisados):.1f} % de los períodos")
print("  por fuente:", {f: f"{100 * a / b:.1f} % de {b}" for f, (a, b) in sorted(por_fuente.items())})
