"""Base fija de la V3: inicio sin huecos y total real de países por continente.

1. Recorte del inicio. Entre el 23-mar y el 23-abr-2015 no hay chart global de Spotify (falta en el dataset
   semanal de jfreyberg), así que la línea de tiempo tenía un hueco. La V3 empieza después: el 1-may-2015
   (día y mes), la semana del 27-abr-2015 y el año 2015. Se recortan datos/v3/numero1.js y datos/v3/top3/:
   cada granularidad parte en su nueva base y los tramos se corren.
2. Total real de países por continente (datos/v3/continentes.js). Los conteos del panel ("15 de 41 países
   de América") usan siempre el mismo total: todos los países independientes (countries_mledoze.json) más
   los territorios que tienen chart propio (Hong Kong, Taiwán, Puerto Rico…). Antes el total eran los
   países con datos en esa fecha, y cambiaba con el tiempo (África llegó a contar 1 de 1).

Uso: python scripts/11_base_fija_v3.py   (después de 09_datos_v3.py y 10_top3_v3.py; no repetir sobre datos
ya recortados: el script lo detecta y no hace nada)
"""
import datetime as dt
import json
import os
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DATOS = RAIZ / "datos" / "v3"
MLEDOZE = Path(os.environ.get("INFOVIS_MLEDOZE", Path.home() / "InfoVis-datos" / "countries_mledoze.json"))
NUEVAS_BASES = {"dia": dt.date(2015, 5, 1), "semana": dt.date(2015, 4, 27), "mes": dt.date(2015, 5, 1), "anio": dt.date(2015, 1, 1)}


def leer(ruta, variable):
    return json.loads(re.search(rf"window\.{variable} = (.*?);\n", ruta.read_text(encoding="utf-8"), re.S).group(1))


def js(nombre, obj):
    return f"window.{nombre} = {json.dumps(obj, ensure_ascii=False, separators=(',', ':'))};\n"


def desplazamiento(grano, vieja, nueva):
    if grano == "dia":
        return (nueva - vieja).days
    if grano == "semana":
        return (nueva - vieja).days // 7
    if grano == "mes":
        return (nueva.year - vieja.year) * 12 + nueva.month - vieja.month
    return nueva.year - vieja.year


def recortar(tramos, d, sin_dato):
    """Corre los tramos d períodos: el vigente en d pasa a empezar en 0; los anteriores se descartan."""
    vigente = None
    salida = []
    for t in tramos:
        if t[0] <= d:
            vigente = t
        else:
            salida.append([t[0] - d, *t[1:]])
    if vigente is not None and not sin_dato(vigente):
        salida.insert(0, [0, *vigente[1:]])
    return salida


# ---------- 1. Recorte del inicio ----------
ruta_n1 = DATOS / "numero1.js"
fecha_max = leer(ruta_n1, "FECHA_MAX")
periodos = leer(ruta_n1, "PERIODOS")
numero1 = leer(ruta_n1, "NUMERO1")
if dt.date.fromisoformat(periodos["dia"]["base"]) >= NUEVAS_BASES["dia"]:
    print("numero1.js ya está recortado: no se toca")
else:
    corrimiento = {}
    for grano, info in periodos.items():
        d = desplazamiento(grano, dt.date.fromisoformat(info["base"]), NUEVAS_BASES[grano])
        corrimiento[grano] = d
        periodos[grano] = {"base": NUEVAS_BASES[grano].isoformat(), "n": info["n"] - d}
        numero1[grano] = {cc: r for cc, tramos in numero1[grano].items()
                          if (r := recortar(tramos, d, lambda t: t[1] is None))}
    ruta_n1.write_text(js("FECHA_MAX", fecha_max) + js("PERIODOS", periodos) + js("NUMERO1", numero1), encoding="utf-8")
    for ruta in sorted((DATOS / "top3").glob("*.js")):
        texto = ruta.read_text(encoding="utf-8")
        cc, cuerpo = re.match(r'window\.cargarTop3\("(\w+)", (.*)\);\n', texto, re.S).groups()
        datos = json.loads(cuerpo)
        for grano, d in corrimiento.items():
            datos[grano] = recortar(datos[grano], d, lambda t: len(t) == 1)
        ruta.write_text(f"window.cargarTop3({json.dumps(cc)}, {json.dumps(datos, ensure_ascii=False, separators=(',', ':'))});\n",
                        encoding="utf-8")
    print(f"recortado desde {NUEVAS_BASES['dia']} · períodos {periodos}")

# ---------- 2. Total real de países por continente ----------
mledoze = {c["cca2"].lower(): c for c in json.load(open(MLEDOZE, encoding="utf-8"))}
paises = leer(DATOS / "paises.js", "PAISES")


def continente(cc):
    """La misma regla de 09_datos_v3.py (Medio Oriente va con África)."""
    m = mledoze[cc]
    if m["region"] == "Antarctic":
        return None
    if m["region"] == "Americas":
        return "america"
    if m["region"] == "Europe":
        return "europa"
    if m["region"] == "Oceania":
        return "oceania"
    if m["region"] == "Africa" or m.get("subregion") == "Western Asia":
        return "africa"
    return "asia"


independientes = {cc for cc, m in mledoze.items() if m.get("independent")}
con_chart = {cc for cc in paises if cc != "global"}
por_continente = {}
for cc in sorted(independientes | con_chart):
    k = paises.get(cc, {}).get("continente") or continente(cc)
    if k:
        por_continente.setdefault(k, []).append(cc)
(DATOS / "continentes.js").write_text(js("PAISES_POR_CONTINENTE", por_continente), encoding="utf-8")
print("países por continente:", {k: len(v) for k, v in por_continente.items()}, "· total", sum(map(len, por_continente.values())))
