"""Entrega 2: género de cada canción (vía Deezer) y cuota mensual de cada familia de géneros por país.

Para cada canción del catálogo (datos/canciones.js) con id de Deezer (datos/deezer.js) consulta
track → album y toma los géneros del álbum. Las 24 categorías de Deezer se agrupan en 6 familias,
una por disco físico:
  pop · hiphop · latino · rock · electro · local
"local" reúne la música regional (asiática, brasileña, africana, india, country, regional mexicano):
el disco gira cuando un país escucha lo suyo en vez de lo global.
Deezer no tiene country ni regional mexicano, así que esos artistas se asignan a mano (ARTISTAS_A_MANO).

Salidas (en datos/e2/):
  generos.js        window.E2_GENEROS = {familias, nombres, canciones: {idx: [familia_idx | -1, álbum]}}
                    solo las canciones que aparecen en algún top 5 de los países generados
  cuotas/<cc>.js    window.cargarCuotas(cc, {base: "2017-01", n, meses: [mes | null], anio_base: 2017, anios: [...]})
                    mes (y anio) = [[cuota por familia 0–100], [top 10 idx por familia]]
                    cuota = % de los puestos del top 5 diario del período ocupados por la familia
                    top = canciones de la familia ordenadas por puntaje (5 − puesto, sumado en el período)
                    La perilla física elige el año (R2: los meses eran 9 pasos del potenciómetro y temblaban);
                    la curva en pantalla usa los meses.

La caché de Deezer queda en ~/InfoVis-datos/deezer_generos_cache.json (INFOVIS_EXTRA_DIR).
Uso: python scripts/14_generos_e2.py [--sin-red]   (--sin-red: solo recalcula con la caché)
Límite de Deezer: 50 consultas cada 5 s; con 6 hilos tarda ~70 min para todo el catálogo.
"""
import datetime as dt
import json
import os
import re
import sys
import threading
import time
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from config import ROOT, WEB_DATA_DIR

EXTRA_DIR = Path(os.environ.get("INFOVIS_EXTRA_DIR", Path.home() / "InfoVis-datos"))
CACHE = EXTRA_DIR / "deezer_generos_cache.json"
SALIDA = WEB_DATA_DIR / "e2"
HILOS = 6
INTERVALO = 0.13
BASE_DIA = dt.date(2017, 1, 1)      # día 0 de datos/top5/<cc>.js ("dia")
PRIMER_MES = (2017, 1)

FAMILIAS = ["pop", "hiphop", "latino", "rock", "electro", "local"]
NOMBRES = {"pop": "Pop", "hiphop": "Hip hop", "latino": "Latino", "rock": "Rock",
           "electro": "Electrónica", "local": "Local"}
# Orden de prioridad cuando un álbum tiene varios géneros: gana el primero de esta lista que calce.
REGLAS = [
    ("local",   ("asi", "brasil", "brazil", "africa", "india", "árabe", "arab", "k-pop", "j-pop",
                 "country", "regional", "turc", "turk", "german", "deutsch", "french", "franc")),
    ("latino",  ("reggaet", "latin", "cumbia", "salsa", "bachata", "tropical")),
    ("hiphop",  ("rap", "hip hop", "hip-hop", "trap", "grime")),
    ("rock",    ("rock", "alternativ", "metal", "indie", "punk", "grunge", "hardcore")),
    ("electro", ("dance", "electro", "techno", "house", "trance", "dubstep", "drum", "edm")),
    ("pop",     ("pop", "singer", "r&b", "soul", "funk", "reggae", "folk", "jazz", "blues", "pelícu",
                 "film", "score", "infantil", "kids", "clásic", "classic", "navid", "christmas",
                 "disco", "chanson", "schlager")),
]
# Deezer no tiene country ni regional mexicano. Villancicos antiguos sin género → pop.
ARTISTAS_A_MANO = {
    "local": ["Morgan Wallen", "Zach Bryan", "Luke Combs", "Shaboozey", "Chris Stapleton", "Kacey Musgraves",
              "Jelly Roll", "Bailey Zimmerman", "Kane Brown", "Dan + Shay", "Lainey Wilson", "Beyoncé: cowboy",
              "Fuerza Regida", "Peso Pluma", "Natanael Cano", "Junior H", "Eslabon Armado", "Gabito Ballesteros",
              "Xavi", "Grupo Frontera", "Carin Leon", "Carín León", "Calle 24", "Chino Pacas", "Tito Double P",
              "Oscar Maydon", "Luis R Conriquez", "Neton Vega", "Ivan Cornejo", "Grupo Firme", "Christian Nodal",
              "Banda MS", "Los Dos Carnales", "Edén Muñoz", "Gerardo Ortiz", "Yahritza y Su Esencia"],
    "pop":   ["Brenda Lee", "Bobby Helms", "Andy Williams", "Burl Ives", "Dean Martin", "Wham!", "Mariah Carey",
              "Michael Bublé", "Bing Crosby", "Nat King Cole", "José Feliciano"],
}

_candado = threading.Lock()
_ultima = [0.0]


def esperar_turno():
    with _candado:
        espera = _ultima[0] + INTERVALO - time.monotonic()
        if espera > 0:
            time.sleep(espera)
        _ultima[0] = time.monotonic()


def get(url):
    esperar_turno()
    with urllib.request.urlopen(url, timeout=20) as r:
        return json.load(r)


def leer_js(ruta, variable):
    txt = ruta.read_text()
    m = re.search(r"window\." + variable + r"\s*=\s*", txt)
    return json.loads(txt[m.end():].split("\nwindow.")[0].strip().rstrip(";"))


def leer_llamada(ruta):
    txt = ruta.read_text()
    return json.loads(txt[txt.index("{"):txt.rindex("}") + 1])


def consultar(par):
    idx, deezer_id = par
    for _ in range(3):
        try:
            pista = get(f"https://api.deezer.com/track/{deezer_id}")
            if "error" in pista:
                return idx, None
            album = get(f"https://api.deezer.com/album/{pista['album']['id']}")
            if "error" in album:
                return idx, None
            return idx, {"g": [g["name"] for g in album.get("genres", {}).get("data", [])],
                         "album": album.get("title"), "album_id": album.get("id"),
                         "fecha": album.get("release_date")}
        except Exception:
            time.sleep(2)
    return idx, None


def familia_de(generos, artistas):
    artistas_n = artistas.lower()
    for fam, nombres in ARTISTAS_A_MANO.items():
        if any(a.lower() in artistas_n for a in nombres):
            return fam
    nombres = [g.lower() for g in generos or []]
    for fam, claves in REGLAS:
        if any(c in g for g in nombres for c in claves):
            return fam
    return None


def main():
    sin_red = "--sin-red" in sys.argv
    canciones = leer_js(WEB_DATA_DIR / "canciones.js", "CANCIONES")
    deezer = leer_js(WEB_DATA_DIR / "deezer.js", "DEEZER")
    paises = leer_js(WEB_DATA_DIR / "paises.js", "PAISES")
    codigos = sorted(cc for cc in paises if (WEB_DATA_DIR / "top5" / f"{cc}.js").exists())
    top5 = {cc: leer_llamada(WEB_DATA_DIR / "top5" / f"{cc}.js")["dia"] for cc in codigos}

    usadas = set()
    for dias in top5.values():
        for dia in dias:
            usadas.update(i for i in dia if i is not None)
    print(f"{len(codigos)} países, {len(usadas)} canciones distintas en sus top 5")

    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    pendientes = [(i, deezer[i]) for i in sorted(usadas) if deezer[i] and str(i) not in cache]
    sin_id = sum(1 for i in usadas if not deezer[i])
    print(f"sin id de Deezer: {sin_id} · en caché: {len(usadas) - sin_id - len(pendientes)} · por consultar: {len(pendientes)}")
    if pendientes and not sin_red:
        t0 = time.time()
        EXTRA_DIR.mkdir(parents=True, exist_ok=True)
        with ThreadPoolExecutor(HILOS) as ex:
            for n, (i, g) in enumerate(ex.map(consultar, pendientes), 1):
                cache[str(i)] = g
                if n % 500 == 0:
                    CACHE.write_text(json.dumps(cache))
                    print(f"  … {n}/{len(pendientes)} ({time.time() - t0:.0f} s)", flush=True)
        CACHE.write_text(json.dumps(cache))
        print(f"consultas listas en {time.time() - t0:.0f} s")

    familia = {}
    conteo = Counter()
    for i in usadas:
        info = cache.get(str(i))
        fam = familia_de(info["g"] if info else [], canciones[i][2])
        familia[i] = fam
        conteo[fam or "(sin familia)"] += 1
    print("canciones por familia:", dict(conteo.most_common()))

    SALIDA.mkdir(exist_ok=True)
    (SALIDA / "cuotas").mkdir(exist_ok=True)
    generos = {str(i): [FAMILIAS.index(familia[i]) if familia[i] else -1,
                        (cache.get(str(i)) or {}).get("album") or ""] for i in sorted(usadas)}
    (SALIDA / "generos.js").write_text(
        "window.E2_GENEROS = " + json.dumps({"familias": FAMILIAS, "nombres": NOMBRES, "canciones": generos},
                                            ensure_ascii=False, separators=(",", ":")) + ";\n")

    def indice_mes(d):
        return (d.year - PRIMER_MES[0]) * 12 + d.month - PRIMER_MES[1]

    ultimo_dia = BASE_DIA + dt.timedelta(days=max(len(d) for d in top5.values()) - 1)
    n_meses = indice_mes(ultimo_dia) + 1
    for cc in codigos:
        meses = [None] * n_meses
        puestos = defaultdict(Counter)       # mes → familia → puestos
        puntaje = defaultdict(Counter)       # mes → (familia, idx) → puntaje
        total = Counter()
        for k, dia in enumerate(top5[cc]):
            m = indice_mes(BASE_DIA + dt.timedelta(days=k))
            for puesto, i in enumerate(dia):
                if i is None:
                    continue
                total[m] += 1
                fam = familia.get(i)
                if fam is None:
                    continue
                puestos[m][fam] += 1
                puntaje[m][(fam, i)] += 5 - puesto
        def resumen(puestos_p, puntaje_p, total_p):
            cuotas = [round(100 * puestos_p[f] / total_p) for f in FAMILIAS]
            tops = []
            for f in FAMILIAS:
                mejores = sorted(((p, i) for (fam, i), p in puntaje_p.items() if fam == f), reverse=True)
                vistos, lista = set(), []           # la misma canción con dos ids (single y álbum) cuenta una vez
                for _, i in mejores:
                    clave = (canciones[i][1].lower(), canciones[i][2].lower())
                    if clave in vistos:
                        continue
                    vistos.add(clave)
                    lista.append(i)
                    if len(lista) == 10:
                        break
                tops.append(lista)
            return [cuotas, tops]

        for m in total:
            meses[m] = resumen(puestos[m], puntaje[m], total[m])
        # Por año: suma de los meses del año (la perilla física elige el año).
        n_anios = (n_meses + PRIMER_MES[1] - 2) // 12 + 1
        anios = [None] * n_anios
        for a in range(n_anios):
            del_anio = [m for m in total if (m + PRIMER_MES[1] - 1) // 12 == a]
            if not del_anio:
                continue
            pu, pt, to = Counter(), Counter(), 0
            for m in del_anio:
                pu.update(puestos[m]); pt.update(puntaje[m]); to += total[m]
            anios[a] = resumen(pu, pt, to)
        (SALIDA / "cuotas" / f"{cc}.js").write_text(
            f'window.cargarCuotas("{cc}", ' + json.dumps({"base": f"{PRIMER_MES[0]}-{PRIMER_MES[1]:02d}", "n": n_meses,
                                                          "meses": meses, "anio_base": PRIMER_MES[0], "anios": anios},
                                                         separators=(",", ":")) + ");\n")
    print(f"listo: datos/e2/generos.js y {len(codigos)} archivos en datos/e2/cuotas/ ({n_meses} meses)")


if __name__ == "__main__":
    main()
