"""Descarga charts de YouTube Music, Apple Music, iTunes y Deezer para completar el mapa (además de Spotify).

Fuentes (todas públicas, sin cuenta):
  youtube  YouTube Music Charts: top 100 semanal por país con vistas, desde mayo de 2018 (61 países).
           Historia completa: una consulta por país y semana, con pausas para no saturar el servicio.
  apple    Apple Music "most played": top 100 de hoy por tienda (~130 países). Solo el presente.
  itunes   iTunes Store "top songs" (ventas de descarga): top 100 de hoy por tienda. Solo el presente.
  deezer   Playlists "Top <País>" de la cuenta Deezer Charts (~80 países). Solo el presente.

Las fuentes sin historia se guardan como una "foto" con la fecha del día, así que corriendo el script cada día
el archivo va acumulando historia.

Salidas en Data/charts_extra/ (fuera del repo; otra carpeta con la variable INFOVIS_EXTRA_DIR):
  youtube/<cc>.jsonl          una línea por semana: {"semana", "filas": [[puesto, id, título, artistas, vistas], ...]}
  <fuente>/<AAAA-MM-DD>.json  {cc: [[puesto, título, artistas, id], ...]}

Uso: python scripts/07_descargar_charts.py youtube|apple|itunes|deezer|todo
"""
import concurrent.futures as cf
import datetime as dt
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

# No usa config.py: así corre aunque el resto del proyecto no esté descargado (OneDrive).
RAW_DIR = Path(os.environ.get("INFOVIS_RAW_DIR", Path(__file__).resolve().parent.parent / "Data"))
SALIDA = Path(os.environ.get("INFOVIS_EXTRA_DIR", RAW_DIR / "charts_extra"))
HOY = dt.date.today().isoformat()
UA = {"User-Agent": "Mozilla/5.0 (proyecto academico IIC2026 PUC; visualizacion de charts)"}

# Primero los países sin chart de Spotify (son los que completan el mapa), después el resto.
YOUTUBE_PRIMERO = ["ru", "rs", "ke", "tz", "ug", "zw", "global"]
YOUTUBE_PAISES = ["ae", "ar", "at", "au", "be", "bo", "br", "ca", "ch", "cl", "co", "cr", "cz", "de", "dk", "do", "ec",
                  "ee", "eg", "es", "fi", "fr", "gb", "gt", "hn", "hu", "id", "ie", "il", "in", "is", "it", "jp", "ke",
                  "kr", "lu", "mx", "ng", "ni", "nl", "no", "nz", "pa", "pe", "pl", "pt", "py", "ro", "rs", "ru", "sa",
                  "se", "sv", "tr", "tz", "ua", "ug", "us", "uy", "za", "zw", "global"]
YOUTUBE_DESDE = dt.date(2018, 5, 3)     # primera semana disponible (los charts cierran los jueves)


def pedir(url, datos=None, intentos=4):
    for i in range(intentos):
        try:
            req = urllib.request.Request(url, data=datos, headers={**UA, "Content-Type": "application/json",
                                                                   "Referer": "https://charts.youtube.com/"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except Exception:
            if i == intentos - 1:
                return None
            time.sleep(2 * (i + 1))


def paises_mledoze():
    return sorted(c["cca2"].lower() for c in json.load(open(RAW_DIR / "countries_mledoze.json")))


# ---------- YouTube Music: historia semanal ----------

def youtube_semana(cc, fin):
    consulta = (f"perspective=CHART_DETAILS&chart_params_country_code={cc}&chart_params_chart_type=TRACKS"
                f"&chart_params_period_type=WEEKLY&chart_params_end_date={fin:%Y%m%d}")
    cuerpo = json.dumps({"context": {"client": {"clientName": "WEB_MUSIC_ANALYTICS", "clientVersion": "2.0", "hl": "en", "gl": "US"}},
                         "browseId": "FEmusic_analytics_charts_home", "query": consulta}).encode()
    d = pedir("https://charts.youtube.com/youtubei/v1/browse?alt=json", cuerpo)
    try:
        sec = d["contents"]["sectionListRenderer"]["contents"][0]["musicAnalyticsSectionRenderer"]["content"]
        vistas = sec["trackTypes"][0]["trackViews"]
    except (TypeError, KeyError, IndexError):
        return None
    # Algunas filas vienen incompletas (sin título o sin puesto): se guardan con lo que traen.
    return [[t.get("chartEntryMetadata", {}).get("currentPosition", i + 1), t.get("encryptedVideoId", ""), t.get("name", ""),
             ", ".join(a.get("name", "") for a in t.get("artists", [])), int(t.get("viewCount", 0) or 0)]
            for i, t in enumerate(vistas)]


def youtube():
    carpeta = SALIDA / "youtube"
    carpeta.mkdir(parents=True, exist_ok=True)
    ultima = dt.date.today() - dt.timedelta(days=(dt.date.today().weekday() - 3) % 7 + 7)   # último jueves cerrado
    semanas = [YOUTUBE_DESDE + dt.timedelta(weeks=i) for i in range((ultima - YOUTUBE_DESDE).days // 7 + 1)]
    for cc in YOUTUBE_PRIMERO + [c for c in YOUTUBE_PAISES if c not in YOUTUBE_PRIMERO]:
        archivo = carpeta / f"{cc}.jsonl"
        hechas = {json.loads(l)["semana"] for l in archivo.open()} if archivo.exists() else set()
        faltan = [s for s in semanas if s.isoformat() not in hechas]
        if not faltan:
            continue
        t0 = time.time()
        with cf.ThreadPoolExecutor(6) as ex, archivo.open("a") as f:
            for s, filas in zip(faltan, ex.map(lambda s: youtube_semana(cc, s), faltan)):
                if filas:
                    f.write(json.dumps({"semana": s.isoformat(), "filas": filas}, ensure_ascii=False) + "\n")
        print(f"youtube {cc}: {len(faltan)} semanas en {time.time() - t0:.0f}s", flush=True)


# ---------- Fotos del día: Apple Music, iTunes, Deezer ----------

def apple_pais(cc):
    d = pedir(f"https://rss.marketingtools.apple.com/api/v2/{cc}/music/most-played/100/songs.json")
    filas = (d or {}).get("feed", {}).get("results", [])
    return [[i + 1, r["name"], r["artistName"], r["id"]] for i, r in enumerate(filas)]


def itunes_pais(cc):
    d = pedir(f"https://itunes.apple.com/{cc}/rss/topsongs/limit=100/json")
    filas = (d or {}).get("feed", {}).get("entry", [])
    if isinstance(filas, dict):
        filas = [filas]
    return [[i + 1, e["im:name"]["label"], e["im:artist"]["label"], e["id"]["attributes"]["im:id"]] for i, e in enumerate(filas)]


def deezer_listas():
    d = pedir("https://api.deezer.com/user/637006841/playlists?limit=300")
    listas = {}
    for p in (d or {}).get("data", []):
        t = p["title"]
        if t.startswith("Top ") and not any(x in t for x in ("20", "Women", "Mujeres", "Mulheres", "Femmes", "SongCatcher", "Songcatcher")):
            listas[t[4:]] = p["id"]
    return listas


def deezer():
    nombres = {c["name"]["common"]: c["cca2"].lower() for c in json.load(open(RAW_DIR / "countries_mledoze.json"))}
    nombres.update({"USA": "us", "UK": "gb", "Ivory Coast": "ci", "Czech Republic": "cz", "Worldwide": "global",
                    "South Korea": "kr", "Russia": "ru", "Brazil": "br"})
    foto = {}
    for nombre, pid in deezer_listas().items():
        cc = nombres.get(nombre)
        d = pedir(f"https://api.deezer.com/playlist/{pid}/tracks?limit=100")
        if cc and d:
            foto[cc] = [[i + 1, t["title"], t["artist"]["name"], t["id"]] for i, t in enumerate(d.get("data", []))]
        time.sleep(0.15)
    guardar("deezer", foto)


def foto_del_dia(nombre, funcion):
    with cf.ThreadPoolExecutor(3) as ex:
        res = dict(zip(paises_mledoze(), ex.map(funcion, paises_mledoze())))
    # Las tiendas pequeñas sin chart propio a veces devuelven la lista de otra: se guardan igual y se filtran después.
    guardar(nombre, {cc: filas for cc, filas in res.items() if filas})


def guardar(fuente, foto):
    carpeta = SALIDA / fuente
    carpeta.mkdir(parents=True, exist_ok=True)
    (carpeta / f"{HOY}.json").write_text(json.dumps(foto, ensure_ascii=False), encoding="utf-8")
    print(f"{fuente}: {len(foto)} países con chart hoy ({HOY})", flush=True)


if __name__ == "__main__":
    que = sys.argv[1] if len(sys.argv) > 1 else "todo"
    if que in ("apple", "todo"):
        foto_del_dia("apple", apple_pais)
    if que in ("itunes", "todo"):
        foto_del_dia("itunes", itunes_pais)
    if que in ("deezer", "todo"):
        deezer()
    if que in ("youtube", "todo"):
        youtube()
