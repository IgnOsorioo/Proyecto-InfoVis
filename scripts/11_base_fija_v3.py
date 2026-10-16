"""Base fija de la V3: sin datos de un solo día, inicio sin huecos y total real de países por continente.

0. Un solo día de datos = sin datos. La foto de Apple Music (el chart del 14-oct-2026, sin historia) era la
   única fuente de 92 países: se quita, y esos países pasan a "sin datos" (fuera de datos/v3/paises.js, de
   numero1.js y de top3/). Lo mismo con cualquier país que tenga un solo día con datos.

1. Recorte del inicio. Entre el 23-mar y el 23-abr-2015 no hay chart global de Spotify (falta en el dataset
   semanal de jfreyberg), así que la línea de tiempo tenía un hueco. La V3 empieza después: el 1-may-2015
   (día y mes), la semana del 27-abr-2015 y el año 2015. Se recortan datos/v3/numero1.js y datos/v3/top3/:
   cada granularidad parte en su nueva base y los tramos se corren.
2. Total real de países por continente (datos/v3/continentes.js). Los conteos del panel ("15 de 41 países
   de América") usan siempre el mismo total: todos los países independientes (countries_mledoze.json) más
   los territorios que tienen chart propio (Hong Kong, Taiwán, Puerto Rico…). Antes el total eran los
   países con datos en esa fecha, y cambiaba con el tiempo (África llegó a contar 1 de 1).

Uso: python scripts/11_base_fija_v3.py   (después de 09_datos_v3.py y 10_top3_v3.py; se puede repetir: lo que
ya está aplicado no cambia)
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


def leer_top3(ruta):
    cc, cuerpo = re.match(r'window\.cargarTop3\("(\w+)", (.*)\);\n', ruta.read_text(encoding="utf-8"), re.S).groups()
    return cc, json.loads(cuerpo)


def escribir_top3(ruta, cc, datos):
    ruta.write_text(f"window.cargarTop3({json.dumps(cc)}, {json.dumps(datos, ensure_ascii=False, separators=(',', ':'))});\n",
                    encoding="utf-8")


def por_periodo(tramos, n, hay_dato):
    """Tramos → lista por período: True donde el tramo vigente tiene dato."""
    salida = [False] * n
    for i, t in enumerate(tramos):
        fin = tramos[i + 1][0] if i + 1 < len(tramos) else n
        for q in range(t[0], min(fin, n)):
            salida[q] = hay_dato(t)
    return salida


ruta_n1 = DATOS / "numero1.js"
fecha_max = leer(ruta_n1, "FECHA_MAX")
periodos = leer(ruta_n1, "PERIODOS")
numero1 = leer(ruta_n1, "NUMERO1")

# ---------- 0. Un solo día de datos = sin datos ----------
ruta_paises = DATOS / "paises.js"
paises = leer(ruta_paises, "PAISES")
quitados = []
for grano in periodos:
    for cc, tramos in numero1[grano].items():           # la foto de Apple pasa a "sin dato"
        limpio = []
        for t in tramos:
            t = [t[0], None, None] if t[2] == "a" else t
            if limpio and limpio[-1][1:] == t[1:]:
                continue
            if not limpio and t[1] is None:
                continue
            limpio.append(t)
        numero1[grano][cc] = limpio
for cc in list(numero1["dia"]):
    if cc != "global" and sum(por_periodo(numero1["dia"][cc], periodos["dia"]["n"], lambda t: t[1] is not None)) <= 1:
        quitados.append(cc)
for cc in quitados:
    for grano in periodos:
        numero1[grano].pop(cc, None)
    paises.pop(cc, None)
    (DATOS / "top3" / f"{cc}.js").unlink(missing_ok=True)
for ruta in sorted((DATOS / "top3").glob("*.js")):     # el top 3 solo donde el mapa tiene #1
    cc, datos = leer_top3(ruta)
    for grano, info in periodos.items():
        con_n1 = por_periodo(numero1[grano].get(cc, []), info["n"], lambda t: t[1] is not None)
        con_top = por_periodo(datos[grano], info["n"], lambda t: len(t) > 1)
        if con_top == [a and b for a, b in zip(con_top, con_n1)]:
            continue
        vigente = {t[0]: t for t in datos[grano]}
        nuevos, actual, previo = [], None, None
        for q in range(info["n"]):
            actual = vigente.get(q, actual)
            fila = tuple(actual[1:]) if actual and len(actual) > 1 and con_n1[q] else None
            if fila != previo:
                nuevos.append([q, *fila] if fila else [q])
                previo = fila
        datos[grano] = nuevos
    escribir_top3(ruta, cc, datos)
ruta_paises.write_text(js("PAISES", paises), encoding="utf-8")
print(f"sin datos por tener un solo día: {len(quitados)} países")

# ---------- 1. Recorte del inicio ----------
if dt.date.fromisoformat(periodos["dia"]["base"]) >= NUEVAS_BASES["dia"]:
    print("numero1.js ya está recortado")
else:
    corrimiento = {}
    for grano, info in periodos.items():
        d = desplazamiento(grano, dt.date.fromisoformat(info["base"]), NUEVAS_BASES[grano])
        corrimiento[grano] = d
        periodos[grano] = {"base": NUEVAS_BASES[grano].isoformat(), "n": info["n"] - d}
        numero1[grano] = {cc: r for cc, tramos in numero1[grano].items()
                          if (r := recortar(tramos, d, lambda t: t[1] is None))}
    for ruta in sorted((DATOS / "top3").glob("*.js")):
        cc, datos = leer_top3(ruta)
        for grano, d in corrimiento.items():
            datos[grano] = recortar(datos[grano], d, lambda t: len(t) == 1)
        escribir_top3(ruta, cc, datos)
    print(f"recortado desde {NUEVAS_BASES['dia']} · períodos {periodos}")
ruta_n1.write_text(js("FECHA_MAX", fecha_max) + js("PERIODOS", periodos) + js("NUMERO1", numero1), encoding="utf-8")

# ---------- 2. Total real de países por continente ----------
mledoze = {c["cca2"].lower(): c for c in json.load(open(MLEDOZE, encoding="utf-8"))}


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
