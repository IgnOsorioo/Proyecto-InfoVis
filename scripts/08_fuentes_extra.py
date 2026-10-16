"""Integra YouTube Music, Apple Music, iTunes y Deezer al mapa, en los países que Spotify no cubre.

Regla (cuando varias fuentes tienen chart para un país, manda la primera):
  1. Spotify (datos ya construidos por 02_construir_datos.py): 70 países, 2017–2026.
  2. YouTube Music: top 100 semanal por vistas, desde mayo de 2018 (suma Rusia, Serbia, Kenia, Tanzania,
     Uganda y Zimbabue).
  3. QQ Music, para China: semanal desde 2018 y diario desde 2022 (descarga de 12_descargar_qq.py).
  4. Apple Music, luego iTunes, luego Deezer: solo la foto del día descargada (sin historia). Se descartan las
     tiendas cuya lista es idéntica a la de otra (tiendas pequeñas que muestran la lista de otro país).

Las canciones de otras fuentes se cruzan con el catálogo de Spotify por título y primer artista normalizados,
para que un mismo hit cuente igual en todos los países. Las que no están en el catálogo se agregan con
índices desde 1.000.000.

Entradas: datos/ (paises.js, numero1.js, canciones.js, catalogo/buscar.js) y la descarga de
07_descargar_charts.py (INFOVIS_EXTRA_DIR, por defecto ~/InfoVis-datos/charts_extra) más countries_mledoze.json.
Salidas:
  datos/extra.js          window.EXTRA = {paises, numero1, canciones, popularidad, fuentes}
  datos/extra_ranking.js  window.cargarRankingExtra('todo', {idx: {cc: [semana_inicio, [puestos]]}})

Uso: python scripts/08_fuentes_extra.py
"""
import datetime as dt
import json
import os
import re
import unicodedata
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DATOS = RAIZ / "datos"
EXTRA = Path(os.environ.get("INFOVIS_EXTRA_DIR", Path.home() / "InfoVis-datos" / "charts_extra"))
MLEDOZE = Path(os.environ.get("INFOVIS_MLEDOZE", EXTRA.parent / "countries_mledoze.json"))
BASE_EXTRA = 1_000_000
SEMANA_BASE = dt.date(2016, 12, 26)


def leer_js(nombre, variable):
    texto = (DATOS / nombre).read_text(encoding="utf-8")
    return json.loads(re.search(rf"window\.{variable} = (.*?);\n", texto, re.S).group(1))


def normalizar(titulo, artistas):
    def limpio(s):
        s = unicodedata.normalize("NFKD", s.lower())
        s = "".join(c for c in s if not unicodedata.combining(c))
        return re.sub(r"[^\w]+", " ", s, flags=re.UNICODE).strip()
    titulo = re.sub(r"\s*[\(\[].*?[\)\]]", "", titulo)          # (feat. …), [Remix], (Official Video)
    titulo = re.split(r"\s+-\s+", titulo)[0]
    artista = re.split(r",|&| x | feat\.? | ft\.? ", artistas.lower())[0]
    return f"{limpio(titulo)}|{limpio(artista)}"


def pedir(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30) as r:
            return json.load(r)
    except Exception:
        return None


# ---------- Datos existentes ----------
paises = leer_js("paises.js", "PAISES")
periodos = leer_js("numero1.js", "PERIODOS")
fecha_max = dt.date.fromisoformat(leer_js("numero1.js", "FECHA_MAX"))
base = leer_js("canciones.js", "CANCIONES")
buscar = json.loads(re.search(r"window\.cargarBuscar\(\"todo\", (.*)\);\n", (DATOS / "catalogo/buscar.js").read_text(encoding="utf-8"), re.S).group(1))
mledoze = {c["cca2"].lower(): c for c in json.load(open(MLEDOZE))}

catalogo = {}                                       # clave normalizada → índice (el más escuchado si se repite)
for idx, (t, a, e) in enumerate(zip(buscar["t"], buscar["a"], buscar["e"])):
    k = normalizar(t, a)
    if k not in catalogo or e > buscar["e"][catalogo[k]]:
        catalogo[k] = idx
canciones_extra, por_clave_extra = [], {}


def indice_de(titulo, artistas, portada, fuente):
    k = normalizar(titulo, artistas)
    if k in catalogo:
        return catalogo[k]
    if k not in por_clave_extra:
        por_clave_extra[k] = BASE_EXTRA + len(canciones_extra)
        canciones_extra.append([titulo, artistas, portada, fuente])
    elif portada and not canciones_extra[por_clave_extra[k] - BASE_EXTRA][2]:
        canciones_extra[por_clave_extra[k] - BASE_EXTRA][2] = portada    # la primera vez vino sin portada
    return por_clave_extra[k]


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
    return "asia" if m["region"] == "Asia" else None


def fecha_periodo(grano, p):
    b = dt.date.fromisoformat(periodos[grano]["base"])
    if grano == "dia":
        return b + dt.timedelta(days=p)
    if grano == "semana":
        return b + dt.timedelta(weeks=p)
    if grano == "mes":
        return dt.date(b.year + (b.month - 1 + p) // 12, (b.month - 1 + p) % 12 + 1, 1)
    return dt.date(b.year + p, 1, 1)


def fin_periodo(grano, p):
    if p >= periodos[grano]["n"] - 1:
        return fecha_max
    return fecha_periodo(grano, p + 1) - dt.timedelta(days=1)


def comprimir(lista):
    """[(p, idx)] → tramos [[p, idx]] solo cuando cambia."""
    tramos, previo = [], None
    for p, idx in lista:
        if idx != previo:
            tramos.append([p, idx])
            previo = idx
    return tramos


salida = {"paises": {}, "numero1": {g: {} for g in periodos}, "canciones": canciones_extra, "popularidad": {}, "fuentes": {}}
ranking = {}
vistas_semana = {}                                   # idx extra → {semana: vistas}

# ---------- YouTube Music: historia semanal ----------
for archivo in sorted((EXTRA / "youtube").glob("*.jsonl")):
    cc = archivo.stem
    if cc == "global" or cc in paises or cc not in mledoze:
        continue
    semanas = {}
    for linea in archivo.open(encoding="utf-8"):
        d = json.loads(linea)
        fin = dt.date.fromisoformat(d["semana"])
        filas = []
        for puesto, vid, titulo, artistas, vistas in d["filas"]:
            if not titulo:
                continue
            idx = indice_de(titulo, artistas, f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg" if vid else "", "YouTube Music")
            filas.append((puesto, idx, vistas))
            s = (fin - SEMANA_BASE).days // 7
            ranking.setdefault(idx, {}).setdefault(cc, {})[s] = puesto
            if idx >= BASE_EXTRA:
                vistas_semana.setdefault(idx, {})
                vistas_semana[idx][s] = vistas_semana[idx].get(s, 0) + vistas
        if filas:
            semanas[fin] = sorted(filas)
    if not semanas:
        continue
    fines = sorted(semanas)
    primera = fines[0] - dt.timedelta(days=6)

    def semana_de(fecha):
        """Semana de YouTube (vie–jue) que contiene la fecha."""
        fin = fecha + dt.timedelta(days=(3 - fecha.weekday()) % 7)
        return semanas.get(fin)

    for grano, info in periodos.items():
        lista = []
        for p in range(info["n"]):
            ini, fin = fecha_periodo(grano, p), fin_periodo(grano, p)
            if fin < primera:
                continue
            if grano in ("dia", "semana"):
                filas = semana_de(ini + dt.timedelta(days=3) if grano == "semana" else ini)
                if filas:
                    lista.append((p, filas[0][1]))
            else:                                     # mes y año: más vistas sumadas en el período
                total = {}
                for f in fines:
                    if ini <= f <= fin:
                        for _, idx, vistas in semanas[f]:
                            total[idx] = total.get(idx, 0) + vistas
                if total:
                    lista.append((p, max(total, key=total.get)))
        salida["numero1"][grano][cc] = comprimir(lista)
    m = mledoze[cc]
    salida["paises"][cc] = {"iso3": m["cca3"], "nombre": m["translations"]["spa"]["common"],
                            "continente": continente(cc), "inicio": primera.isoformat()}
    salida["fuentes"][cc] = "YouTube Music · vistas semanales"

# ---------- QQ Music: historia de China (descarga de 12_descargar_qq.py) ----------
# El 热歌榜 (canciones más escuchadas): semanal de 2018 a mediados de 2022 ("AAAA_S", semana ISO) y diario
# después. Cada día toma su chart diario o, si no hay, el semanal que lo cubre. QQ no publica reproducciones:
# en mes y año gana la canción con más puntos sumando los días del período (11 − puesto, en su top 10).
QQ = EXTRA / "qq"
por_dia_qq = {}                                      # fecha → [(puesto, idx)]
for nombre in ("semanal", "diario"):
    ruta = QQ / f"{nombre}.jsonl"
    if not ruta.exists():
        continue
    for linea in ruta.open(encoding="utf-8"):
        d = json.loads(linea)
        if not d["periodo"] or not d["filas"]:
            continue
        filas = [(puesto, indice_de(t, a, portada, "QQ Music")) for puesto, t, a, portada in d["filas"] if t]
        if "_" in d["periodo"]:                      # semanal: los 7 días de la semana ISO (el diario, si existe, manda)
            anio, semana = map(int, d["periodo"].split("_"))
            lunes = dt.date.fromisocalendar(anio, semana, 1)
            for i in range(7):
                por_dia_qq.setdefault(lunes + dt.timedelta(days=i), filas)
        else:
            por_dia_qq[dt.date.fromisoformat(d["periodo"])] = filas
por_dia_qq = {f: v for f, v in por_dia_qq.items() if f <= fecha_max}
# Al chart diario le faltan 17 días sueltos (huecos de 1 a 2 días): con un hueco de hasta 3 días vale el chart del
# día anterior, para que China no aparezca y desaparezca. Los huecos más largos quedan sin datos.
for f in sorted(por_dia_qq):
    for i in range(1, 4):
        siguiente = f + dt.timedelta(days=i)
        if siguiente in por_dia_qq:
            break
        if any(f + dt.timedelta(days=j) in por_dia_qq for j in range(i + 1, 5)):
            por_dia_qq[siguiente] = por_dia_qq[f]
if por_dia_qq:
    for grano, info in periodos.items():
        lista = []
        for p in range(info["n"]):
            ini, fin = fecha_periodo(grano, p), fin_periodo(grano, p)
            if fin < min(por_dia_qq):
                continue
            if grano in ("dia", "semana"):
                filas = por_dia_qq.get(ini + dt.timedelta(days=3) if grano == "semana" else ini)
                if filas:
                    lista.append((p, filas[0][1]))
            else:
                puntos = {}
                for i in range((fin - ini).days + 1):
                    for puesto, idx in por_dia_qq.get(ini + dt.timedelta(days=i), []):
                        puntos[idx] = puntos.get(idx, 0) + 11 - puesto
                if puntos:
                    lista.append((p, max(puntos, key=lambda k: (puntos[k], -k))))
        salida["numero1"][grano]["cn"] = comprimir(lista)
    m = mledoze["cn"]
    salida["paises"]["cn"] = {"iso3": m["cca3"], "nombre": m["translations"]["spa"]["common"],
                              "continente": continente("cn"), "inicio": min(por_dia_qq).isoformat()}
    salida["fuentes"]["cn"] = "QQ Music · chart semanal y diario"

# ---------- Foto del día: Apple Music, iTunes, Deezer ----------
def fotos(fuente):
    archivos = sorted((EXTRA / fuente).glob("*.json"))
    if not archivos:
        return {}, None
    foto = json.load(open(archivos[-1], encoding="utf-8"))
    # Solo las listas propias: si dos tiendas tienen exactamente el mismo top 10, ninguna cuenta.
    firmas = {}
    for cc, filas in foto.items():
        firmas.setdefault(tuple(f[1] for f in filas[:10]), []).append(cc)
    propias = {cc: filas for cc, filas in foto.items() if len(firmas[tuple(f[1] for f in filas[:10])]) == 1}
    return propias, archivos[-1].stem


def portada(fuente, ident):
    if fuente == "Deezer":
        d = pedir(f"https://api.deezer.com/track/{ident}")
        return (d or {}).get("album", {}).get("cover_xl", "")
    d = pedir(f"https://itunes.apple.com/lookup?id={ident}")
    url = ((d or {}).get("results") or [{}])[0].get("artworkUrl100", "")
    return url.replace("100x100bb", "600x600bb")


ultimos = {g: info["n"] - 1 for g, info in periodos.items()}
for fuente, nombre in (("apple", "Apple Music"), ("itunes", "iTunes"), ("deezer", "Deezer")):
    foto, dia = fotos(fuente)
    for cc, filas in sorted(foto.items()):
        if cc in paises or cc in salida["paises"] or cc not in mledoze or not continente(cc) or not filas:
            continue
        _, titulo, artistas, ident = filas[0]
        idx = indice_de(titulo, artistas, "", nombre)
        if idx >= BASE_EXTRA and not canciones_extra[idx - BASE_EXTRA][2]:
            canciones_extra[idx - BASE_EXTRA][2] = portada(nombre, ident)
        for grano, p in ultimos.items():
            salida["numero1"][grano][cc] = [[p, idx]]
        m = mledoze[cc]
        salida["paises"][cc] = {"iso3": m["cca3"], "nombre": m["translations"]["spa"]["common"],
                                "continente": continente(cc), "inicio": fecha_max.isoformat()}
        salida["fuentes"][cc] = f"{nombre} · solo el chart del {dt.date.fromisoformat(dia):%d/%m/%Y}"

# ---------- Popularidad (vistas semanales en YouTube) de las canciones nuevas ----------
for idx, por_semana in vistas_semana.items():
    ini, fin = min(por_semana), max(por_semana)
    salida["popularidad"][idx] = [ini, [max(1, round(por_semana.get(s, 0) / 1000)) if por_semana.get(s) else 0 for s in range(ini, fin + 1)]]

# Solo se guardan las canciones nuevas que llegan a #1 en algún país (las demás no se pueden mostrar ni seguir).
usadas = sorted({idx for g in salida["numero1"].values() for tramos in g.values() for _, idx in tramos if idx >= BASE_EXTRA})
nuevo = {viejo: BASE_EXTRA + i for i, viejo in enumerate(usadas)}
salida["canciones"] = [canciones_extra[v - BASE_EXTRA] for v in usadas]
for g in salida["numero1"].values():
    for tramos in g.values():
        for t in tramos:
            t[1] = nuevo.get(t[1], t[1])
salida["popularidad"] = {nuevo[i]: v for i, v in salida["popularidad"].items() if i in nuevo}
ranking = {nuevo.get(i, i): v for i, v in ranking.items() if i < BASE_EXTRA or i in nuevo}

rank_js = {}
for idx, por_pais in ranking.items():
    rank_js[idx] = {}
    for cc, por_semana in por_pais.items():
        ini, fin = min(por_semana), max(por_semana)
        rank_js[idx][cc] = [ini, [por_semana.get(s, 0) for s in range(ini, fin + 1)]]

(DATOS / "extra.js").write_text(f"window.EXTRA = {json.dumps(salida, ensure_ascii=False, separators=(',', ':'))};\n", encoding="utf-8")
(DATOS / "extra_ranking.js").write_text(
    f"window.cargarRankingExtra(\"todo\", {json.dumps(rank_js, ensure_ascii=False, separators=(',', ':'))});\n", encoding="utf-8")

por_fuente = {}
for f in salida["fuentes"].values():
    por_fuente[f.split(" · ")[0]] = por_fuente.get(f.split(" · ")[0], 0) + 1
encontradas = sum(1 for k in ranking if k < BASE_EXTRA)
print(f"países nuevos: {len(salida['paises'])} {por_fuente}")
print(f"canciones de otras fuentes: {encontradas} ya en el catálogo de Spotify; {len(salida['canciones'])} nuevas que son #1 en algún país")
for nombre in ("extra.js", "extra_ranking.js"):
    print(f"  datos/{nombre}: {(DATOS / nombre).stat().st_size / 1e6:.1f} MB")
