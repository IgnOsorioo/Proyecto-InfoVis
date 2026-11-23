"""Entrega 2, V3: cuota de cada familia de géneros en el top 200 semanal de Spotify y el top 5 de cada familia.

R2 (10-nov-2026): con los datos de la E1 (solo canciones que llegaron al top 5 general) el pop "desaparecía" de Chile
en 2020 aunque sonara. Aquí se usa el top 200 semanal 2013–2023 (Kaggle jfreyberg, ya fuente de la E1), que además
trae los géneros de Spotify de cada artista. Así el top 5 del género existe aunque ninguna canción del género haya
entrado al top 5 general.

Familias (una por disco físico): pop · hiphop · latino · rock · electro · local.
- Los cinco géneros son globales y excluyentes: cada etiqueta de Spotify se asigna a un género por palabras clave
  (ETIQUETAS; EXACTAS corrige los casos que las claves rompen); si un artista tiene etiquetas de varios géneros gana la
  primera en PRIORIDAD, salvo las etiquetas DOMINANTES, que mandan siempre (R3: "urbano espanol" era latino por contener
  "urbano", y C. Tangana, Quevedo o Rels B quedaban enterrados bajo Bad Bunny; ahora son hip hop). Las escenas regionales
  cuentan en su género (k-pop → pop, corridos y sertanejo → latino, j-rock → rock).
- "local" se calcula por país y es una capa aparte (una canción puede ser hip hop *y* local): es local en el país X si
  alguno de sus artistas lleva una etiqueta con el gentilicio o una escena propia de X (LOCAL). R3: antes "local" era una
  bolsa global de escenas regionales y en Chile el disco verde mostraba a Peso Pluma. Spotify no etiqueta nacionalidad en
  el pop estadounidense (Taylor Swift solo tiene "pop"), así que EE. UU. queda subestimado.

Cuota = porcentaje de las reproducciones del top 200 del país que son de la familia (por año y por mes).
Top 5 = canciones de la familia con más reproducciones en el año (una vez cada una aunque tenga varios ids).

Salidas (en datos/e2/):
  top200/<cc>.js     window.cargarTop200(cc, {anio_base, anios: [[cuotas×6, tops×6] | null], mes_base, meses: [cuotas | null]})
  canciones200.js    window.CANCIONES200 = {track_id: [título, artistas, portada, deezer_id]} de las canciones de los tops;
                     portada y deezer_id salen de buscar en Deezer (caché en ~/InfoVis-datos/deezer_top200_cache.json)

Uso: uv run --with duckdb python scripts/15_top200_e2.py [--sin-red]
"""
import ast
import datetime as dt
import json
import os
import re
import sys
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import duckdb

from config import WEB_DATA_DIR

EXTRA_DIR = Path(os.environ.get("INFOVIS_EXTRA_DIR", Path.home() / "InfoVis-datos"))
PARQUET = Path(os.environ.get("INFOVIS_JFREYBERG", EXTRA_DIR / "kaggle" / "jfreyberg.parquet"))
# R3 (11-nov): el top 200 DIARIO 2023-04-07 → hoy (Kaggle gonzalopezgil, la fuente de la E1), filtrado a los 16 países por
# scripts/01 (columnas d, country, position, track_id, name, artists "A|B", streams). No trae géneros: se toman de la
# tabla de artistas 2013–2023 (TABLA_ARTISTAS, sacada del parquet semanal) y, para artistas nuevos, de ARTISTAS_NUEVOS.
DIARIO = EXTRA_DIR / "kaggle" / "diario16_2023_2026.parquet"
TABLA_ARTISTAS = EXTRA_DIR / "artistas_generos_2013_2023.json"
ARTISTAS_NUEVOS = EXTRA_DIR / "artistas_nuevos.json"
ARTWORK = EXTRA_DIR / "kaggle" / "gonzalopezgil" / "artwork.csv"
CACHE = EXTRA_DIR / "deezer_top200_cache.json"
SALIDA = WEB_DATA_DIR / "e2"
PAISES = ["us", "mx", "cl", "ar", "br", "gb", "es", "fr", "de", "tr", "in", "id", "ph", "jp", "kr", "au"]
TOP_N = 5
HILOS = 6
INTERVALO = 0.13           # Deezer: 50 consultas cada 5 s

FAMILIAS = ["pop", "hiphop", "latino", "rock", "electro", "local"]   # orden de las cuotas y los tops en la salida
GENEROS = FAMILIAS[:-1]
NOMBRES = {"pop": "Pop", "hiphop": "Hip hop", "latino": "Latino", "rock": "Rock", "electro": "Electrónica", "local": "Local"}
PRIORIDAD = ["latino", "rock", "hiphop", "electro", "pop"]
# Etiquetas que deciden el género por sí solas, por encima de PRIORIDAD (la escena urbana española es hip hop, no latino).
DOMINANTES = {e: "hiphop" for e in ["urbano espanol", "rap espanol", "drill espanol", "trap espanol", "spanish hip hop",
                                    "rap canario", "emo trap en espanol", "boom bap espanol", "flamenco urbano"]}
# Etiquetas que las palabras clave clasificarían mal (se evalúan primero, por igualdad).
EXACTAS = {
    "tropical house": "electro", "pop dance": "electro", "pop edm": "electro", "slap house": "electro", "electro": "electro",
    "uk dance": "electro", "german dance": "electro", "australian dance": "electro", "aussietronica": "electro",
    "indietronica": "electro", "dance pop": "pop", "electropop": "pop", "dancehall": "pop", "urban contemporary": "pop",
    "indie poptimism": "pop", "indie pop": "pop", "alt z": "pop", "pop rock": "pop", "lounge": "pop", "bedroom pop": "pop",
    "emo rap": "hiphop", "escape room": "hiphop", "plugg": "hiphop", "pluggnb": "hiphop",
    "batidao romantico": "latino", "latin alternative": "rock", "country rock": "pop", "modern country rock": "pop",
    "electronica": "electro", "folk-pop": "pop", "dance-pop": "pop", "synth-pop": "pop", "synthpop": "pop",
    "electro-pop": "pop", "indie-pop": "pop", "k-pop": "pop", "j-pop": "pop",
}
# Palabras clave por género, evaluadas en este orden sobre cada etiqueta de Spotify.
ETIQUETAS = [
    ("latino",  ["reggaeton", "latin", "latino", "urbano", "cumbia", "bachata", "salsa", "tropical", "mambo",
                 "dembow", "perreo", "champeta", "vallenato", "merengue", "boricua", "trap argentino", "trap chileno",
                 "rkt",
                 # escenas regionales de Latinoamérica
                 "sertanejo", "arrocha", "forro", "funk carioca", "funk ostentacao", "funk mtg", "funk paulista",
                 "funk pop", "funk bh", "funk rj", "funk consciente", "funk melody", "pagode", "axe", "mpb",
                 "brazilian", "brasil", "piseiro", "musica mexicana", "corrido", "sierreno", "banda", "norteno",
                 "mariachi", "grupera", "regional mexican", "ranchera", "cumbia sonidera"]),
    ("hiphop",  ["hip hop", "hip-hop", "rap", "trap", "drill", "grime", "boom bap", "crunk", "hyphy"]),
    ("rock",    ["rock", "metal", "punk", "grunge", "emo", "permanent wave", "alternative rock", "alternative metal",
                 "alt-rock", "indie rock", "indie folk", "shoegaze", "post-hardcore", "britpop", "new wave"]),
    ("electro", ["edm", "electro house", "big room", "progressive house", "deep house", "house", "dance",
                 "techno", "trance", "dubstep", "brostep", "electronic", "complextro", "moombahton",
                 "future bass", "drum and bass", "hardstyle", "bass", "amapiano"]),
    ("pop",     ["pop", "r&b", "soul", "funk", "singer-songwriter", "adult standards", "disco", "boy band",
                 "girl group", "reggae", "dancehall", "jazz", "blues", "folk", "christmas", "soundtrack",
                 "show tunes", "hollywood", "acoustic", "neo mellow", "mellow gold", "talent show", "viral",
                 # escenas regionales de Asia, Europa y África que no son hip hop, rock ni electrónica
                 "korean", "trot", "japanese", "anime", "vocaloid", "mandopop", "cantopop", "c-pop", "taiwan",
                 "v-pop", "vietnamese", "thai", "malaysian", "indonesian", "dangdut", "opm", "pinoy", "filmi",
                 "bollywood", "desi", "punjabi", "sufi", "hindi", "tamil", "telugu", "indian", "hare krishna",
                 "country", "bluegrass", "turkish", "arabesk", "afrobeats", "afropop", "afroswing", "nigerian",
                 "ghanaian", "south african", "arab", "khaleeji", "egyptian", "shaabi", "schlager", "volksmusik",
                 "chanson", "fado", "rebetiko", "laiko", "flamenco", "rumba", "copla", "cantautor"]),
]
# Gentilicios y escenas propias de cada país del dial. "x*" = prefijo ("chile*" cubre chilean, chileno, chilena);
# lo demás, palabra completa ("uk" no cubre "ukulele"). Una canción es local si alguno de sus artistas lo es.
LOCAL = {
    "us": ["american", "usa", "texas", "chicago", "atlanta", "nyc", "detroit", "memphis", "florida", "cali",
           "west coast", "east coast", "southern hip hop", "nashville", "philly", "houston", "baton rouge",
           "north carolina", "new jersey", "bay area", "dfw", "pittsburgh", "st louis", "ohio", "minnesota",
           "brooklyn", "queens", "kentucky", "virginia", "oklahoma", "new orleans", "alabama", "louisiana",
           "georgia", "boston", "seattle", "portland", "la indie", "la pop", "dmv", "miami", "sacramento",
           "milwaukee", "indiana", "denver", "arizona", "utah", "hawaiian", "country", "bluegrass"],
    "mx": ["mexic*", "sierreno", "corrido*", "banda", "norteno", "grupera", "mariachi", "ranchera", "sonidera",
           "monterrey", "tijuana", "chihuahua", "jalisco", "sinaloa"],
    "cl": ["chile*"],
    "ar": ["argentin*", "rkt", "cuarteto", "cumbia villera", "rosario", "cordoba"],
    "br": ["brazil*", "brasil*", "sertanejo", "arrocha", "forro", "funk carioca", "funk ostenta*", "funk mtg",
           "funk paulista", "funk bh", "funk rj", "funk consciente", "funk melody", "funk 150", "funk pop", "pagode",
           "axe", "mpb", "piseiro", "pisadinha", "bossa nova", "samba", "bahia", "paulista", "carioca", "mineiro",
           "gaucho", "nordeste", "baiano", "pernambuco", "mangue", "tecnobrega", "brega"],
    "gb": ["uk", "british", "scottish", "welsh", "irish", "london", "manchester", "birmingham", "liverpool", "grime",
           "northern irish", "glasgow", "bristol", "leeds", "sheffield", "britpop"],
    "es": ["spanish", "espanol", "espana", "flamenco", "rumba", "copla", "cantautor", "catalan", "madrid", "barcelona",
           "canario", "andaluz", "galician", "basque", "valencian", "sevilla", "mallorca", "asturian", "murcia", "bilbao"],
    "fr": ["french", "francais*", "france", "chanson", "paris", "marseille", "lyon", "variete", "zouk", "breton",
           "corsican"],
    "de": ["german", "deutsch*", "schlager", "volksmusik", "berlin", "hamburg", "frankfurt", "munich", "bavarian"],
    "tr": ["turk*", "arabesk", "anatolian", "istanbul", "izmir", "ankara"],
    "in": ["indian", "india", "filmi", "bollywood", "desi", "punjabi", "hindi", "tamil", "telugu", "sufi", "bhangra",
           "kannada", "malayalam", "marathi", "bengali", "gujarati", "haryanvi", "bhojpuri", "ghazal", "carnatic",
           "hindustani", "kollywood", "tollywood", "mumbai", "delhi", "chennai", "kolkata", "pakistan*"],
    "id": ["indonesia*", "dangdut", "jakarta", "javanese", "sundanese", "batak", "minang", "bali", "melayu"],
    "ph": ["filipin*", "pinoy", "opm", "manila", "tagalog", "bisaya", "cebuano", "ilocano", "kundiman"],
    "jp": ["japan*", "j-*", "anime", "vocaloid", "tokyo", "osaka", "shibuya", "kayokyoku", "enka", "visual kei",
           "okinawa", "seiyu"],
    "kr": ["korea*", "k-*", "trot", "seoul", "busan"],
    "au": ["australia*", "aussie*", "sydney", "melbourne", "brisbane", "perth", "adelaide", "nz", "new zealand", "kiwi",
           "aboriginal", "queensland", "tasmania"],
}

_candado = threading.Lock()
_ultima = [0.0]
_cache_familias = {}
_cache_local = {}


def _patron(claves):
    partes = [rf"(?<![a-z]){re.escape(c[:-1])}" if c.endswith("*") else rf"(?<![a-z]){re.escape(c)}(?![a-z])" for c in claves]
    return re.compile("|".join(partes))


_patrones = [(fam, _patron(claves)) for fam, claves in ETIQUETAS]
_locales = {cc: _patron(claves) for cc, claves in LOCAL.items()}


def familia_de_etiqueta(etiqueta):
    """Las claves se buscan como palabras completas: "folk-pop" no contiene "k-pop" ni "bubblegrunge" contiene "grunge"."""
    if etiqueta in EXACTAS:
        return EXACTAS[etiqueta]
    for fam, patron in _patrones:
        if patron.search(etiqueta):
            return fam
    return None


def etiquetas_de(texto):
    """texto = "['trap latino', 'reggaeton']" tal como viene en el parquet."""
    try:
        return [e.lower() for e in ast.literal_eval(texto)] if texto else []
    except (ValueError, SyntaxError):
        return []


def familia_de_artista(texto):
    """Género (sin "local") de la canción según las etiquetas de todos sus artistas."""
    if texto in _cache_familias:
        return _cache_familias[texto]
    etiquetas = etiquetas_de(texto)
    fam = next((DOMINANTES[e] for e in etiquetas if e in DOMINANTES), None)
    if fam is None:
        encontradas = {familia_de_etiqueta(e) for e in etiquetas} - {None}
        fam = next((f for f in PRIORIDAD if f in encontradas), None)
    _cache_familias[texto] = fam
    return fam


_etiquetas_por_artista = None


def etiquetas_por_artista():
    """nombre normalizado → etiquetas de Spotify del artista (tabla 2013–2023 + artistas nuevos resueltos)."""
    global _etiquetas_por_artista
    if _etiquetas_por_artista is None:
        t = json.loads(TABLA_ARTISTAS.read_text()) if TABLA_ARTISTAS.exists() else {}
        n = json.loads(ARTISTAS_NUEVOS.read_text()) if ARTISTAS_NUEVOS.exists() else {}
        _etiquetas_por_artista = {normalizar(k): v for k, v in t.items()}
        _etiquetas_por_artista.update({normalizar(k): v["tags"] for k, v in n.items() if v.get("tags")})
    return _etiquetas_por_artista


def familia_de_cancion(artistas_texto, generos_texto):
    """Género de la canción: decide el artista principal (el primero del crédito con etiquetas conocidas); si ninguno
    tiene, la unión de etiquetas de todos. R3: con la unión, "Happier" (Marshmello & Bastille) era rock por el
    "modern rock" de Bastille y "ME!" (Taylor Swift ft. Brendon Urie) también; las colaboraciones heredaban el género
    del invitado por la prioridad latino > rock > hip hop."""
    try:
        artistas = ast.literal_eval(artistas_texto) if artistas_texto else []
    except (ValueError, SyntaxError):
        artistas = []
    por_artista = etiquetas_por_artista()
    for a in artistas:
        etiquetas = por_artista.get(normalizar(a))
        if etiquetas:
            fam = familia_de_artista(repr(sorted(etiquetas)))
            if fam:
                return fam
    return familia_de_artista(generos_texto)


def es_local(texto, cc):
    """¿Alguno de los artistas (texto = etiquetas de todos) es del país cc?"""
    clave = (texto, cc)
    if clave not in _cache_local:
        patron = _locales.get(cc)
        _cache_local[clave] = bool(patron) and any(patron.search(e) for e in etiquetas_de(texto))
    return _cache_local[clave]


def normalizar(texto):
    texto = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]", "", texto).strip()


def titulo_base(titulo):
    return re.sub(r"\s*[\(\[].*?[\)\]]", "", titulo).split(" - ")[0].strip()


def esperar_turno():
    with _candado:
        espera = _ultima[0] + INTERVALO - time.monotonic()
        if espera > 0:
            time.sleep(espera)
        _ultima[0] = time.monotonic()


def buscar_deezer(par):
    """→ (track_id, {deezer, portada}) o (track_id, None). Busca "artista título" y valida el artista."""
    tid, titulo, artistas = par
    primer_artista = artistas.split(", ")[0]
    base = titulo_base(titulo) or titulo
    q = urllib.parse.quote(f"{primer_artista} {base}")
    for _ in range(3):
        try:
            esperar_turno()
            with urllib.request.urlopen(f"https://api.deezer.com/search?q={q}&limit=10", timeout=20) as r:
                candidatos = json.load(r).get("data", [])
            a_n, b_n = normalizar(primer_artista), normalizar(base)
            elegido = next((x for x in candidatos if normalizar(x["artist"]["name"]) == a_n
                            and normalizar(x["title"]).startswith(b_n)), None)
            if not elegido:
                elegido = next((x for x in candidatos
                                if a_n and (a_n in normalizar(x["artist"]["name"]) or normalizar(x["artist"]["name"]) in a_n)), None)
            if not elegido:
                return tid, {}
            return tid, {"deezer": elegido["id"], "portada": elegido["album"].get("cover_medium", "")}
        except Exception:
            time.sleep(2)
    return tid, None


# Deezer no tiene etiquetas por artista: se toma el género de sus álbumes y se traduce a una etiqueta de Spotify
# equivalente. MusicBrainz da el país del artista (→ gentilicio para LOCAL) y a veces etiquetas de género.
DEEZER_A_ETIQUETA = {132: "pop", 116: "rap", 122: "reggaeton", 152: "rock", 113: "dance", 165: "r&b", 85: "pop",
                     106: "electronic", 466: "folk", 144: "reggae", 129: "jazz", 464: "metal", 173: "soundtrack",
                     169: "soul", 153: "blues", 71: "cumbia", 197: "latin", 2: "afrobeats", 16: "pop", 75: "brazilian",
                     81: "filmi"}
GENTILICIO = {"CL": "chileno", "MX": "mexicano", "AR": "argentino", "BR": "brazilian", "GB": "uk", "ES": "spanish",
              "FR": "french", "DE": "german", "TR": "turkish", "IN": "indian", "ID": "indonesian", "PH": "filipino",
              "JP": "japanese", "KR": "korean", "AU": "australian", "US": "american"}
PAIS_POR_AREA = {"Chile": "CL", "Mexico": "MX", "Argentina": "AR", "Brazil": "BR", "United Kingdom": "GB", "England": "GB",
                 "Scotland": "GB", "Wales": "GB", "Spain": "ES", "France": "FR", "Germany": "DE", "Turkey": "TR",
                 "Türkiye": "TR", "India": "IN", "Indonesia": "ID", "Philippines": "PH", "Japan": "JP",
                 "South Korea": "KR", "Australia": "AU", "United States": "US"}
_mb_candado = threading.Lock()
_mb_ultima = [0.0]


def _get_json(url, agente="Mozilla/5.0"):
    req = urllib.request.Request(url, headers={"User-Agent": agente})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def deezer_artista(nombre):
    """→ lista de etiquetas según los géneros de los álbumes del artista en Deezer (solo si el nombre coincide)."""
    q = urllib.parse.quote(nombre)
    for _ in range(3):
        try:
            esperar_turno()
            cands = _get_json(f"https://api.deezer.com/search/artist?q={q}&limit=3").get("data", [])
            art = next((c for c in cands if normalizar(c["name"]) == normalizar(nombre)), None)
            if not art:
                return []
            esperar_turno()
            albums = _get_json(f"https://api.deezer.com/artist/{art['id']}/albums?limit=8").get("data", [])
            generos = Counter(g for g in (DEEZER_A_ETIQUETA.get(a.get("genre_id")) for a in albums) if g)
            return [g for g, _ in generos.most_common(1)]
        except Exception:
            time.sleep(2)
    return []


def musicbrainz_artista(nombre):
    """→ (país ISO o None, etiquetas) del artista con ese nombre exacto en MusicBrainz (1 consulta por segundo)."""
    q = urllib.parse.quote(f'artist:"{nombre}"')
    for _ in range(3):
        try:
            with _mb_candado:
                espera = _mb_ultima[0] + 1.05 - time.monotonic()
                if espera > 0:
                    time.sleep(espera)
                _mb_ultima[0] = time.monotonic()
            cands = _get_json(f"https://musicbrainz.org/ws/2/artist/?query={q}&fmt=json&limit=3",
                              "InfoVisE2/0.1 (proyecto estudiantil IIC2026 PUC)").get("artists", [])
            art = next((c for c in cands if c.get("score", 0) >= 90 and normalizar(c["name"]) == normalizar(nombre)), None)
            if not art:
                return None, []
            pais = art.get("country") or PAIS_POR_AREA.get((art.get("area") or {}).get("name", "")) \
                or PAIS_POR_AREA.get((art.get("begin-area") or {}).get("name", ""))
            tags = [t["name"].lower() for t in sorted(art.get("tags", []), key=lambda t: -t.get("count", 0))[:4]]
            return pais, tags
        except Exception:
            time.sleep(3)
    return None, []


def resolver_artistas_nuevos(nombres, nuevos):
    """Completa ARTISTAS_NUEVOS para los nombres dados: {nombre: {"pais", "tags_mb", "tags_dz", "tags"}}.
    Retomable: cada fuente se guarda apenas llega (MusicBrainz es el cuello de botella, 1 consulta/s)."""
    faltan_mb = [n for n in nombres if "pais" not in nuevos.get(n, {})]
    faltan_dz = [n for n in nombres if "tags_dz" not in nuevos.get(n, {})]
    if not faltan_mb and not faltan_dz:
        return
    t0 = time.time()
    guardar = lambda: ARTISTAS_NUEVOS.write_text(json.dumps(nuevos, ensure_ascii=False))

    def deezer_todos():
        with ThreadPoolExecutor(4) as ex:
            for i, (n, tags) in enumerate(zip(faltan_dz, ex.map(deezer_artista, faltan_dz)), 1):
                nuevos.setdefault(n, {})["tags_dz"] = tags
                if i % 100 == 0:
                    print(f"  … Deezer {i}/{len(faltan_dz)} ({time.time() - t0:.0f} s)", flush=True)

    with ThreadPoolExecutor(1) as ex:
        tarea_dz = ex.submit(deezer_todos)
        for i, n in enumerate(faltan_mb, 1):
            pais, tags_mb = musicbrainz_artista(n)
            nuevos.setdefault(n, {}).update({"pais": pais, "tags_mb": tags_mb})
            if i % 50 == 0:
                print(f"  … MusicBrainz {i}/{len(faltan_mb)} ({time.time() - t0:.0f} s)", flush=True)
                guardar()
        tarea_dz.result()
    for n in nombres:
        e = nuevos[n]
        tags = set(e.get("tags_dz", [])) | set(e.get("tags_mb", []))
        if e.get("pais") in GENTILICIO:
            tags.add(GENTILICIO[e["pais"]])
        e["tags"] = sorted(t for t in tags if t)
    guardar()
    print(f"{len(nombres)} artistas nuevos resueltos ({len(faltan_mb)} MusicBrainz, {len(faltan_dz)} Deezer) en {time.time() - t0:.0f} s")


def filas_diarias(con, lista, sin_red, cobertura=0.95):
    """Top 200 diario desde 2023-04-07 con las etiquetas de Spotify reconstruidas por artista (mismo formato que el
    parquet semanal: artists y artist_genres como texto de lista de Python). Los artistas que no aparecen en
    2013–2023 se resuelven con Deezer + MusicBrainz hasta cubrir `cobertura` de sus reproducciones."""
    if not DIARIO.exists():
        print("sin top 200 diario (DIARIO): la serie termina en 2023-04")
        return []
    tabla = {normalizar(k): v for k, v in json.loads(TABLA_ARTISTAS.read_text()).items()} if TABLA_ARTISTAS.exists() else {}
    nuevos = json.loads(ARTISTAS_NUEVOS.read_text()) if ARTISTAS_NUEVOS.exists() else {}
    # Desde agosto de 2026 el chart de India trae los 200 puestos pero no las reproducciones. Se estiman por puesto con
    # la curva de India de los 60 días anteriores al hueco (reproducciones promedio de cada puesto): la cuota sigue
    # ponderada por reproducciones y el hueco no deja meses vacíos.
    crudas = con.sql(f"""
        with base as (select country, d, position, streams, track_id, name, artists
                      from '{DIARIO}' where country in ({lista}) and artists is not null),
             hueco as (select country, min(d) d0 from base where streams is null group by 1),
             curva as (select b.country, b.position, avg(b.streams) st from base b join hueco h using (country)
                       where b.streams is not null and b.d >= h.d0 - interval 60 day and b.d < h.d0 group by 1, 2)
        select b.country, b.d, coalesce(b.streams, round(c.st)::bigint) as streams, b.track_id, b.name, b.artists
        from base b left join curva c on c.country = b.country and c.position = b.position
        where coalesce(b.streams, c.st) is not null""").fetchall()
    estimadas = con.sql(f"""select country, count(*), min(d), max(d) from '{DIARIO}'
                            where country in ({lista}) and streams is null group by 1""").fetchall()
    for cc, n, d0, d1 in estimadas:
        print(f"{cc}: {n} filas sin reproducciones ({d0} a {d1}); se estiman por puesto")
    desconocidos = Counter()
    for _, _, streams, _, _, artistas in crudas:
        for a in artistas.split("|"):
            if normalizar(a) not in tabla and "tags" not in nuevos.get(a, {}):
                desconocidos[a] += streams
    if desconocidos and not sin_red:
        acum, objetivo, elegidos = 0, cobertura * sum(desconocidos.values()), []
        for a, st in desconocidos.most_common():
            elegidos.append(a)
            acum += st
            if acum >= objetivo:
                break
        print(f"{len(desconocidos)} artistas sin etiquetas; se resuelven {len(elegidos)} ({cobertura:.0%} de sus reproducciones)")
        resolver_artistas_nuevos(elegidos, nuevos)
    total, faltan, sin_etiquetas = 0, 0, Counter()
    filas = []
    for cc, d, streams, tid, nombre, artistas in crudas:
        lista_art = artistas.split("|")
        etiquetas = set()
        for a in lista_art:
            e = tabla.get(normalizar(a)) or nuevos.get(a, {}).get("tags")
            if e:
                etiquetas.update(e)
            else:
                sin_etiquetas[a] += streams
        total += streams
        if not etiquetas:
            faltan += streams
        filas.append((cc, d, streams, tid, nombre, repr(lista_art), repr(sorted(etiquetas))))
    print(f"{len(filas)} filas del top 200 diario desde {min(f[1] for f in filas)} hasta {max(f[1] for f in filas)}; "
          f"{len(sin_etiquetas)} artistas sin etiquetas; canciones sin ninguna etiqueta: {100 * faltan / total:.1f} % de las reproducciones")
    return filas


def main():
    sin_red = "--sin-red" in sys.argv
    con = duckdb.connect()
    lista = ",".join(f"'{c}'" for c in PAISES)
    filas = con.sql(f"""select country, d, streams, track_id, name, artists, artist_genres
                        from '{PARQUET}' where country in ({lista}) and streams is not null""").fetchall()
    print(f"{len(filas)} filas del top 200 semanal para {len(PAISES)} países")
    filas += filas_diarias(con, lista, sin_red)
    global _etiquetas_por_artista
    _etiquetas_por_artista = None          # releer la tabla con los artistas nuevos ya resueltos

    anio_base = min(f[1] for f in filas).year
    anio_max = max(f[1] for f in filas).year
    n_anios = anio_max - anio_base + 1
    mes_base = (anio_base, 1)
    n_meses = n_anios * 12
    idx_mes = lambda d: (d.year - mes_base[0]) * 12 + d.month - 1

    def artistas_legibles(texto):
        try:
            return ", ".join(ast.literal_eval(texto))
        except (ValueError, SyntaxError):
            return texto.strip("[]'")

    por_pais = defaultdict(list)
    for f in filas:
        por_pais[f[0]].append(f)

    canciones = {}            # track_id → [título, artistas]
    conteo_familias = Counter()
    conteo_local = Counter()
    total_pais = Counter()
    SALIDA.mkdir(exist_ok=True)
    (SALIDA / "top200").mkdir(exist_ok=True)
    for cc in PAISES:
        total_pais[cc] = sum(f[2] for f in por_pais[cc])
        total_a, total_m = Counter(), Counter()
        fam_a, fam_m = defaultdict(Counter), defaultdict(Counter)
        streams_cancion = defaultdict(Counter)        # (año, familia) → track_id → streams
        for _, d, streams, tid, nombre, artistas, generos in por_pais[cc]:
            a, m = d.year - anio_base, idx_mes(d)
            total_a[a] += streams
            total_m[m] += streams
            fam = familia_de_cancion(artistas, generos)
            conteo_familias[fam or "(sin género)"] += streams
            familias = [f for f in (fam, "local" if es_local(generos, cc) else None) if f]
            if "local" in familias:
                conteo_local[cc] += streams
            for f in familias:
                fam_a[a][f] += streams
                fam_m[m][f] += streams
                streams_cancion[(a, f)][tid] += streams
            if familias and tid not in canciones:
                canciones[tid] = [nombre, artistas_legibles(artistas)]
        anios = [None] * n_anios
        for a in total_a:
            cuotas = [round(100 * fam_a[a][f] / total_a[a]) for f in FAMILIAS]
            tops = []
            for f in FAMILIAS:
                vistos, lista_top = set(), []
                for tid, _ in streams_cancion[(a, f)].most_common():
                    clave = (normalizar(titulo_base(canciones[tid][0])), normalizar(canciones[tid][1].split(", ")[0]))
                    if clave in vistos:
                        continue
                    vistos.add(clave)
                    lista_top.append(tid)
                    if len(lista_top) == TOP_N:
                        break
                tops.append(lista_top)
            anios[a] = [cuotas, tops]
        meses = [None] * n_meses
        for m in total_m:
            meses[m] = [round(100 * fam_m[m][f] / total_m[m]) for f in FAMILIAS]
        (SALIDA / "top200" / f"{cc}.js").write_text(
            f'window.cargarTop200("{cc}", ' + json.dumps({"anio_base": anio_base, "anios": anios,
                                                          "mes_base": f"{mes_base[0]}-{mes_base[1]:02d}", "meses": meses},
                                                         separators=(",", ":")) + ");\n")
    total = sum(conteo_familias.values())
    print("reproducciones por género:", {k: f"{100 * v / total:.1f}%" for k, v in conteo_familias.most_common()})
    print("de artistas del país:", {cc: f"{100 * conteo_local[cc] / total_pais[cc]:.0f}%" for cc in PAISES})

    # Solo las canciones que aparecen en algún top: portada e id de Deezer.
    usadas = set()
    for cc in PAISES:
        datos = json.loads((SALIDA / "top200" / f"{cc}.js").read_text().split(", ", 1)[1].rstrip(");\n"))
        for anio in datos["anios"]:
            if anio:
                for lista_top in anio[1]:
                    usadas.update(lista_top)
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    pendientes = [(tid, *canciones[tid]) for tid in sorted(usadas) if tid not in cache]
    print(f"{len(usadas)} canciones en los tops · en caché {len(usadas) - len(pendientes)} · por buscar {len(pendientes)}")
    if pendientes and not sin_red:
        t0 = time.time()
        EXTRA_DIR.mkdir(parents=True, exist_ok=True)
        with ThreadPoolExecutor(HILOS) as ex:
            for n, (tid, r) in enumerate(ex.map(buscar_deezer, pendientes), 1):
                if r is not None:
                    cache[tid] = r
                if n % 500 == 0:
                    CACHE.write_text(json.dumps(cache))
                    print(f"  … {n}/{len(pendientes)} ({time.time() - t0:.0f} s)", flush=True)
        CACHE.write_text(json.dumps(cache))
        print(f"búsquedas listas en {time.time() - t0:.0f} s")
    portadas_spotify = {}
    if ARTWORK.exists():
        for uri, tipo, url, _ in con.sql(f"select * from read_csv('{ARTWORK}', header=true, all_varchar=true) where type='song'").fetchall():
            portadas_spotify[uri.replace("spotify:track:", "")] = url
    salida = {tid: [canciones[tid][0], canciones[tid][1],
                    cache.get(tid, {}).get("portada", "") or portadas_spotify.get(tid, ""), cache.get(tid, {}).get("deezer", 0)]
              for tid in sorted(usadas)}
    con_portada = sum(1 for v in salida.values() if v[2])
    (SALIDA / "canciones200.js").write_text(
        "window.CANCIONES200 = " + json.dumps(salida, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"listo: datos/e2/canciones200.js ({len(salida)} canciones, {con_portada} con portada) y {len(PAISES)} archivos en datos/e2/top200/ "
          f"({anio_base}–{anio_max})")


if __name__ == "__main__":
    main()
