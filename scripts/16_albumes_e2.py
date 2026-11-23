"""E2 V4 — ventas de álbumes por país y década, por género (salida: datos/e2/decadas.js).

Pregunta: de las unidades vendidas en un país por los álbumes lanzados en una década, ¿qué parte fue de cada
género (rock, pop, hip hop, electrónica)? ¿Cuáles fueron los 5 álbumes más vendidos de cada género?

Ventas de cada álbum en cada país (la mayor cifra entre las fuentes; etapa_salida_ventas):
  - certificaciones de la tabla «Certifications» de su artículo en Wikipedia en inglés;
  - listas «List of best-selling albums in <país>» de Wikipedia (EE. UU., R. Unido, Alemania, Japón, Canadá);
  - listas por país de BestSellingAlbums.org (bsa_e2.py; los seis países, cámaras de cada país);
  - Canadá: certificaciones de Music Canada leídas del wikitexto de los mismos artículos (canada_e2.py).
  Argentina salió el 21-nov-2026 (pedido del grupo: seis países con registros completos; CAPIF no publica
  certificaciones desde 2011). La reemplaza Canadá, el único candidato con certificaciones en las seis décadas.
  Los artículos consultados son los de los álbumes n.º 1 de cada país (HTML de Wikipedia cacheado en
  ~/InfoVis-datos/wikipedia_e2/html por descargar.py) y los de las listas de más vendidos:
    EE. UU.   en: List of Billboard 200 number-one albums of <año>        1970–2026
    R. Unido  en: List of UK Albums Chart number ones of the <década>s    1970–2026
    Alemania  en: List of number-one hits of <año> (Germany)              1970–2026 (tabla de álbumes)
    Suecia    sv: Lista över albumettor på Sverigetopplistan  + en: List of number-one singles and albums in Sweden
    Japón     en: List of Oricon number-one albums (de <año>)              1987–2026
    Argentina en: List of number-one albums in Argentina + es: Anexo:Álbumes número uno de Argentina de <año>  2011–2026

Género (21-nov-2026, decisión del grupo): solo la clasificación de Deezer (generos_deezer_e2.py), sin Wikipedia.
Familias: rock, pop, hiphop, electronica; el resto, «otro». Los álbumes que Deezer no tiene no cuentan.
(albumes_por_pais todavía calcula el género del infobox, pero generos_deezer_e2.aplicar lo reemplaza.)

Etapas (cada una cachea su resultado en ~/InfoVis-datos/wikipedia_e2/):
  semanas.json   una fila por semana en el n.º 1: país, año, álbum, artista, enlaces
  generos.json   género del infobox de cada artículo (álbum o artista) y su título en inglés
  articulos.json año, géneros y certificaciones de cada artículo en inglés
  deezer.json    portada y canción más popular de los álbumes de los top 5 (para la pantalla)
Salida: datos/e2/decadas.js

Uso:  uv run --with pandas --with lxml python scripts/16_albumes_e2.py [--etapa semanas|generos|articulos|deezer|salida]
"""
import json, re, sys, time, pathlib, unicodedata, urllib.error, urllib.parse, urllib.request
from collections import Counter, defaultdict
from lxml import html as LH

BASE = pathlib.Path.home() / "InfoVis-datos" / "wikipedia_e2"
HTML = BASE / "html"
REPO = pathlib.Path(__file__).resolve().parent.parent
UA = {"User-Agent": "infovis-student-research/1.0 (university course project)"}
PAISES = ["us", "gb", "ca", "jp", "de", "se"]
DECADAS = [1970, 1980, 1990, 2000, 2010, 2020]
FAMILIAS = ["rock", "pop", "hiphop", "electronica"]


# ───────────────────────── tablas ─────────────────────────

def _texto(td):
    for s in td.xpath(".//sup|.//style|.//span[contains(@class,'sortkey')]|.//span[@style='display:none']"):
        s.drop_tree()
    return re.sub(r"\s+", " ", td.text_content()).strip().strip('"“”«»').strip()


def _enlace(td, host):
    """Primer enlace a un artículo dentro de la celda → (host, título) o None (enlaces rojos no cuentan)."""
    for a in td.xpath(".//a[@href]"):
        h, clase = a.get("href"), a.get("class") or ""
        if "new" in clase.split() or "redlink" in h: continue  # artículo que no existe
        for pref in ("/wiki/", "./"):
            if h.startswith(pref):
                t = urllib.parse.unquote(h[len(pref):].split("#")[0].split("?")[0]).replace("_", " ")
                if ":" not in t.split(" (")[0]: return [host, t]
    return None


def grilla(tabla, host):
    """Tabla HTML → lista de filas; cada celda = (texto, enlace). Expande rowspan y colspan."""
    filas, pendientes = [], {}
    for tr in tabla.xpath("./tr|./thead/tr|./tbody/tr"):
        fila, col = [], 0
        celdas = list(tr.xpath("./td|./th"))
        while celdas or col in pendientes:
            if col in pendientes:
                cel, resto = pendientes[col]
                fila.append(cel)
                if resto > 1: pendientes[col] = (cel, resto - 1)
                else: del pendientes[col]
                col += 1
                continue
            td = celdas.pop(0)
            cel = (_texto(td), _enlace(td, host), td.tag)
            rs, cs = (int((re.findall(r"\d+", td.get(a) or "1") or ["1"])[0]) for a in ("rowspan", "colspan"))
            for _ in range(cs):
                fila.append(cel)
                if rs > 1: pendientes[col] = (cel, rs - 1)
                col += 1
        filas.append(fila)
    return filas


def tablas(clave):
    f = HTML / f"{clave}.json"
    if not f.exists(): return None, []
    d = json.loads(f.read_text())
    if not d: return None, []
    doc = LH.fromstring(d["html"])
    return d["host"], doc.xpath("//table[contains(@class,'wikitable')]")


def columnas(cab, patrones):
    """Índice de la primera columna cuyo encabezado calza con cada patrón."""
    out = {}
    for k, pat in patrones.items():
        for i, (t, _, _) in enumerate(cab):
            if re.search(pat, t, re.I) and i not in out.values():
                out[k] = i
                break
    return out


# ───────────────────────── géneros ─────────────────────────
# Cada género del infobox se clasifica por su núcleo: «pop rock» es rock, «dance-pop» es pop,
# «rap rock» es rock, «electropop» es pop. Primero las excepciones, después el núcleo.

EXCEPCIONES = {
    "britpop": "rock", "brit pop": "rock", "new wave": "rock", "post-punk": "rock", "grunge": "rock",
    "punk": "rock", "emo": "rock", "shoegaze": "rock", "krautrock": "rock", "visual kei": "rock",
    "disco": "pop", "post-disco": "pop", "eurodance": "electronica", "italo disco": "electronica",
    "hi-nrg": "electronica", "edm": "electronica", "dubstep": "electronica", "drum and bass": "electronica",
    "trap": "hiphop", "drill": "hiphop", "grime": "hiphop", "gangsta rap": "hiphop", "boom bap": "hiphop",
    "pop rap": "hiphop", "k-pop": "pop", "j-pop": "pop", "city pop": "pop", "kayōkyoku": "pop", "kayokyoku": "pop",
    "teen pop": "pop", "europop": "pop", "schlager": "otro", "dansband": "otro", "dansbandsmusik": "otro",
    "reggaeton": "otro", "reguetón": "otro", "dancehall": "otro", "film score": "otro", "show tune": "otro", "latin pop": "pop", "pop latino": "pop",
    "soft rock": "pop", "pop rock": "pop",  # thinking aloud (R3): «esto no es rock» ante canciones pop
    "rock en español": "rock", "rock nacional": "rock", "rock argentino": "rock",
    # 22-nov (decisión del grupo): R&B y soul cuentan como pop (TLC, Mariah Carey, Usher, Beyoncé); el dance-pop, el
    # electropop y el synth-pop también son pop (ya por el núcleo «pop»). Electrónica = música hecha para la pista o
    # el estudio: EDM, house, techno, trance, dubstep, drum and bass, trip hop, big beat, downtempo, ambient.
    "r&b": "pop", "contemporary r&b": "pop", "rhythm and blues": "pop", "alternative r&b": "pop", "pop r&b": "pop",
    "soul": "pop", "neo soul": "pop", "hip hop soul": "pop", "hip-hop soul": "pop", "pop soul": "pop",
    "blue-eyed soul": "pop", "new jack swing": "pop", "quiet storm": "pop", "dance": "pop",
    "trip hop": "electronica", "trip-hop": "electronica", "big beat": "electronica", "downtempo": "electronica",
    "chillout": "electronica", "electronica": "electronica", "future bass": "electronica", "moombahton": "electronica",
}
NUCLEO = [  # (patrón sobre la última palabra o el género completo, familia), en orden
    (r"(hip[ -]?hop|rap|trap)$", "hiphop"),
    (r"(rock|metal|punk|(?<!s)core|grunge|wave)$", "rock"),            # «film score» no es «-core»
    (r"pop$", "pop"),
    (r"(electronic|electronica|electrónica|elektronisk|house|techno|trance|dance|disco|electro|edm|"
     r"breakbeat|ambient|idm|garage|jungle|step|bass)$", "electronica"),
]


def familia(genero):
    g = re.sub(r"\s+(music|musik|musica|música)$", "", genero.lower().strip())
    g = re.sub(r"^(música|musica)\s+", "", g).strip(" .")
    if g in EXCEPCIONES: return EXCEPCIONES[g]
    for pat, fam in NUCLEO:
        if re.search(pat, g): return fam
    return "otro"


OTRO = re.compile(r"country|folk|jazz|blues|reggae|latin|schlager|classical|soundtrack|"
                  r"gospel|swing|funk|ranchera|tango|cumbia|enka|bossa|salsa|bolero|opera|christmas|children|"
                  r"easy listening|vocal|cabaret|chanson|flamenco|bachata|mariachi|cuarteto|folklore|"
                  r"regional mexican|sierreño|corrido|norteño|banda|urbano|dembow|dancehall|score|show tune|musical theat", re.I)


def familia_de(generos):
    """Lista ordenada de géneros → familia: el primero (de los tres primeros) que calce con una de las cuatro o que
    sea claramente de otra (R&B, soul, country…: «otro»). Así «R&B, new jack swing» no termina en electrónica."""
    for g in generos[:3]:
        f = familia(g)
        if f != "otro": return f
        if OTRO.search(g): return "otro"
    return "otro" if generos else None


RELLENO = {"hlist", "flatlist", "flat list", "ubl", "plainlist", "unbulleted list", "and", "y", "och", "class",
           "nowrap", "small", "br", "ref name", "nobold", "sfn", "efn"}


def es_relleno(t):
    """Restos de plantillas y referencias que no son géneros («nowrap» terminaba en «rap» → hip hop)."""
    t = t.lower().strip()
    return t in RELLENO or t.startswith(("cite", "ref ", "free"))


def generos_infobox(wikitext):
    """Géneros del infobox (álbum o artista), en orden. Acepta genre/género/genre i sv."""
    m = re.search(r"\n\s*\|\s*(genre|género|genero|genrer)\s*=(.*?)(?=\n\s*\|\s*[\w ]+\s*=|\n\}\})", wikitext, re.S | re.I)
    if not m:   # ficha incrustada en una línea: «…|genre={{hlist|[[J-pop]]|…}}|years_active=…» (Ayumi Hamasaki)
        m = re.search(r"\|\s*(genre|género|genero|genrer)\s*=(.*?)(?=\|\s*\w+\s*=|\n\}\})", wikitext, re.S | re.I)
    if not m: return []
    campo = re.sub(r"<!--.*?-->|<ref[^>]*/>|<ref.*?</ref>|\{\{\s*(nowrap|small)\s*\|", "", m.group(2), flags=re.S)
    out = []
    for enl, plano in re.findall(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]|([A-Za-zÀ-ÿ][\w \-&'éóíáú]+)", campo):
        t = (enl or plano).strip()
        if not t or es_relleno(t): continue
        if t not in out: out.append(t)
    return out


def api(host, params):
    q = urllib.parse.urlencode({**params, "format": "json", "formatversion": 2})
    for i in range(6):
        try:
            time.sleep(1.5)
            return json.load(urllib.request.urlopen(urllib.request.Request(
                f"https://{host}.wikipedia.org/w/api.php?" + q, headers=UA), timeout=60))
        except Exception as e:
            print("  reintento", host, e, flush=True); time.sleep(20 * (i + 1))
    raise RuntimeError("API de Wikipedia no responde")


def etapa_generos(semanas):
    """Para cada enlace (álbum y artista): géneros del infobox, en inglés si existe el artículo en inglés."""
    f = BASE / "generos.json"
    cache = json.loads(f.read_text()) if f.exists() else {}
    enlaces = {tuple(e) for s in semanas for e in (s["album_link"], s["artista_link"]) if e}
    falta = sorted(e for e in enlaces if "|".join(e) not in cache)
    print(f"géneros: {len(enlaces)} artículos, faltan {len(falta)}")
    por_host = defaultdict(list)
    for h, t in falta: por_host[h].append(t)
    for host, titulos in por_host.items():
        for i in range(0, len(titulos), 50):
            lote = titulos[i:i + 50]
            d = api(host, {"action": "query", "titles": "|".join(lote), "redirects": 1, "prop": "revisions|langlinks",
                           "rvprop": "content", "rvslots": "main", "lllang": "en", "lllimit": 500})
            q = d["query"]
            alias = {}
            for n in q.get("normalized", []) + q.get("redirects", []): alias[n["from"]] = n["to"]
            paginas = {p["title"]: p for p in q.get("pages", [])}
            ingles = {}
            for t in lote:
                destino = alias.get(alias.get(t, t), alias.get(t, t))
                p = paginas.get(destino, {})
                wt = (p.get("revisions") or [{}])[0].get("slots", {}).get("main", {}).get("content", "")
                gen = generos_infobox(wt)
                ll = [l["title"] for l in p.get("langlinks", [])] if host != "en" else []
                cache[f"{host}|{t}"] = {"generos": gen, "en": ll[0] if ll else None}
                if host != "en" and ll: ingles[t] = ll[0]
            if ingles:  # preferir el infobox en inglés (géneros más consistentes entre países)
                d2 = api("en", {"action": "query", "titles": "|".join(ingles.values()), "redirects": 1,
                                "prop": "revisions", "rvprop": "content", "rvslots": "main"})
                q2 = d2["query"]; al2 = {n["from"]: n["to"] for n in q2.get("normalized", []) + q2.get("redirects", [])}
                pg2 = {p["title"]: p for p in q2.get("pages", [])}
                for t, en in ingles.items():
                    p = pg2.get(al2.get(al2.get(en, en), al2.get(en, en)), {})
                    wt = (p.get("revisions") or [{}])[0].get("slots", {}).get("main", {}).get("content", "")
                    g = generos_infobox(wt)
                    if g: cache[f"{host}|{t}"]["generos"] = g
            print(f"  {host} {i + len(lote)}/{len(titulos)}", flush=True)
            f.write_text(json.dumps(cache, ensure_ascii=False))
    return cache


# ───────────────────────── Deezer (portada y canción) ─────────────────────────

def _norm(s):
    import unicodedata
    s = unicodedata.normalize("NFKD", s.lower())
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in s if not unicodedata.combining(c)))


def _json(url):
    for i in range(4):
        try:
            time.sleep(0.15)
            d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20))
            if "error" in d and d["error"].get("code") == 4: time.sleep(5); continue  # cuota de Deezer
            return d
        except Exception:
            time.sleep(3 * (i + 1))
    return {}


# Ediciones que no son el álbum original: en vivo, musicales, karaoke, homenajes… (salvo que el título las nombre).
NO_ORIGINAL = re.compile(r"\blive\b|en vivo|ao vivo|in concert|unplugged|broadway|cast recording|\bcast\b|karaoke|"
                         r"tribute|homenaje|instrumental|cover|lullaby|piano|orchestra|symphon|acoustic|demos?\b|"
                         r"rehearsal|commentary|interview|8-bit|reimagined|remixes|remixed|tour\b|through the never|カラオケ|オルゴール|"
                         r"\bdanish\b|\bgerman\b|\bfrench\b|\bitalian\b|\bdutch\b|\bswedish\b|\bspanish\b|"
                         r" - single$| - ep$|\bmusic box\b|\blullabies\b", re.I)
# Pistas que no son la versión conocida de la canción.
PISTA_RARA = re.compile(r"remix|demo\b|edit\)|devonshire|rough|outtake|alternate|\btake\b|instrumental|karaoke|"
                        r"commentary|rehearsal|\bbbc\b|session|acoustic|a cappella|stem|backing track|interlude|\bintro\b|"
                        r"\boutro\b|\bskit\b|alternative|\bver\.", re.I)
# Agregados al título que sí son el álbum: remasterizado, edición de lujo, aniversario…
SUFIJO = re.compile(r"\s*[\(\[][^\)\]]*(remaster|deluxe|edition|edición|anniversary|expanded|version|bonus|"
                    r"special|super|collector|legacy|mono|stereo|reissue|remasterizad)[^\)\]]*[\)\]]|\s+-\s+.*(remaster|deluxe|edition).*$|"
                    r"\s+(remastered|remasterizado|remaster)\b.*$|\s+(expanded|deluxe|special|anniversary)\s+edition\b.*$", re.I)
BANDA_SONORA = re.compile(r"soundtrack|o\.?s\.?t|original|various|varios|cast", re.I)


def _base(t, artista=""):
    """Título comparable: sin «remastered», «deluxe»…; «Vol.» = «Volumen»; «Number 1's» = «#1's»; sin el nombre del
    artista adelante («The Beatles 1962 – 1966»)."""
    t = SUFIJO.sub("", t)
    t = re.sub(r"\bvol(ume|umen)?\b\.?", "vol", t, flags=re.I)
    t = re.sub(r"\bnumber\s+(?=\d)|#", "", t, flags=re.I)
    n, a = _norm(t), _norm(artista)
    return n[len(a):] if a and n.startswith(a) and len(n) > len(a) else n


HOMENAJE = re.compile(r"tribute|mania\b|revival|karaoke|cover|band\b|orchestra|ensemble|players|singers|hits of|"
                      r"backing|piano|lullaby|kids|the dancing queens", re.I)
OTRA_ESCRITURA = re.compile(r"[\u0400-\u04FF\uAC00-\uD7AF]")   # cirílico, hangul


def _mismo_artista(c_nombre, a_art, artista):
    """El mismo artista: nombre igual o que lo contiene (no un homenaje: «ABBA Revival», «Abba Mania»)."""
    c_art = _norm(c_nombre)
    if c_art == a_art: return True
    if HOMENAJE.search(c_nombre) and not HOMENAJE.search(artista): return False
    return len(a_art) > 3 and (a_art in c_art or c_art in a_art)


def _otra_escritura(cancion, album, artista):
    """Canción en cirílico o hangul de un álbum de nombre latino: es otro artista con el mismo nombre."""
    return bool(OTRA_ESCRITURA.search(cancion)) and not OTRA_ESCRITURA.search(album + artista)


def _calza(t, artista, titulos):
    """¿El título del catálogo es el mismo álbum? Con o sin el artista adelante; sin su subtítulo solo si este es de
    recopilación o banda sonora («ABBA Gold: The Greatest Hits»), no otro disco («High School Musical 2: Non-Stop
    Dance Party»)."""
    opciones = {_base(t), _base(t, artista), SUFIJO.sub("", t).strip().lower()}   # «+», «?»: solo signos
    partes = re.split(r" [–—-] |: ", t, maxsplit=1)
    if len(partes) == 2 and re.match(r"(the\s+)?(greatest hits|(very )?best\b|hits\b|original\b[^:]*soundtrack|"
                                     r"[^:]*motion picture soundtrack|soundtrack)", partes[1], re.I):
        opciones.add(_norm(partes[0]))
    return bool(opciones & titulos)


def _base_pista(t):
    """Título de canción comparable entre ediciones: sin «(2012 Remaster)», «(2018 Mix)», «- Single Version»…"""
    t = re.sub(r"\s*[\(\[][^\)\]]*(remaster|mix|version|edit|mono|stereo|from)[^\)\]]*[\)\]]|\s+-\s+.*$", "", t, flags=re.I)
    return _norm(t)


def buscar_album(album, artista):
    """→ {portada, deezer (id de la canción más popular del álbum), album_dz, cancion} o {}.
    Solo acepta el mismo álbum (título igual salvo «remastered», «deluxe»…) del mismo artista, y nunca una edición en
    vivo, de un musical o un homenaje. Entre las ediciones válidas, la que tiene la canción más escuchada.
    La canción es la más popular del álbum que no sea en vivo, demo ni remix."""
    art = re.split(r",| and | & | y | och | feat| with ", artista)[0].strip()
    a_art = _norm(art)
    titulos = {_base(album), _norm(re.split(r" [–—-] |: ", album)[0])}     # con y sin subtítulo
    titulos |= {_norm(x) for x in re.findall(r'\(["“]([^"”]+)["”]\)', album)}   # Untitled ("Led Zeppelin IV")
    titulos.discard("")
    if not titulos: titulos = {album.strip().lower()}                          # «+», «?»
    banda_sonora = bool(BANDA_SONORA.search(artista))
    propio = NO_ORIGINAL.search(album)
    vistos, buenos = set(), []
    variantes = [album] + [x.strip() for x in re.findall(r'\(["“]([^"”]+)["”]\)', album)] + [re.split(r" [–—-] |: |, ", album)[0]]
    consultas = [q for v in dict.fromkeys(variantes) for q in (f'artist:"{art}" album:"{v}"', f"{art} {v}")] + [album]
    for q in consultas:
        for c in _json("https://api.deezer.com/search/album?limit=25&q=" + urllib.parse.quote(q)).get("data", []):
            if c["id"] in vistos: continue
            vistos.add(c["id"])
            c_art = _norm(c["artist"]["name"])
            if banda_sonora:
                if not (BANDA_SONORA.search(c["artist"]["name"]) or re.search(r"soundtrack|motion picture", c["title"], re.I)
                        or c_art in ("variousartists", "artistesdivers", "verschiedeneinterpreten", "variosartistas")): continue
            elif not _mismo_artista(c["artist"]["name"], a_art, artista): continue
            if not _calza(c["title"], c["artist"]["name"], titulos): continue
            if re.search(r"\bsingle\b", c["title"], re.I) or c.get("record_type") == "single": continue
            if NO_ORIGINAL.search(c["title"]) and not propio: continue
            exacto = _norm(c["title"]) == _norm(album)
            simple = not re.search(r"deluxe|edition|editon|expanded|anniversary|legacy|super|collector|bonus|version|"
                                   r"remaster|\d{4}", c["title"], re.I)
            nueva = bool(re.search(r"taylor.s version|re-?recorded", c["title"], re.I))
            buenos.append((not nueva, exacto, simple, c.get("record_type") == "album", c))
        if buenos: break
    # Edición: la original (título igual, sin «deluxe» ni «remaster») si tiene muestras; si no, la siguiente.
    for *_, c in sorted(buenos, key=lambda x: x[:4], reverse=True)[:6]:
        pistas = _json(f"https://api.deezer.com/album/{c['id']}/tracks?limit=100").get("data", [])
        pistas = [p for p in pistas if p.get("readable", True) and p.get("preview") and not PISTA_RARA.search(p["title"])]
        # Canciones de estudio; si todas son en vivo, el álbum es en vivo (Arena, de Duran Duran) y valen.
        pistas = [p for p in pistas if propio or not NO_ORIGINAL.search(p["title"])] or pistas
        if not pistas: continue
        # Canción: la primera del top del artista en Deezer (sus canciones más escuchadas) que esté en el álbum. El
        # «rank» de cada pista no sirve: Thriller daba «Human Nature» en vez de «Billie Jean». Suena desde la edición
        # elegida. Las bandas sonoras (varios artistas) no tienen top: ahí queda el «rank».
        por_titulo = {}
        for p in pistas: por_titulo.setdefault(_base_pista(p["title"]), p)
        top = por_titulo.get(_base(album)) if banda_sonora else None   # banda sonora: la canción que le da nombre
        if not banda_sonora:
            for r in _json(f"https://api.deezer.com/artist/{c['artist']['id']}/top?limit=100").get("data", []):
                top = por_titulo.get(_base_pista(r["title"]))
                if top: break
        top = top or max(pistas, key=lambda p: p.get("rank", 0))
        if _otra_escritura(top["title"], album, artista): continue
        return {"portada": c.get("cover_medium", ""), "album_dz": c["id"], "album_titulo": c["title"],
                "deezer": top["id"], "cancion": top["title"]}
    return {}


import threading
_ITUNES = threading.Lock()   # iTunes limita a ~20 consultas por minuto: una a la vez


def _itunes(params):
    with _ITUNES:
        time.sleep(3.5)
        return _json("https://itunes.apple.com/search?" + urllib.parse.urlencode(params))


def buscar_itunes(album, artista):
    """Respaldo: el mismo álbum en la tienda de iTunes (EE. UU. y Japón) → portada y una muestra de 30 s de su
    canción más buscada. Mismas reglas que buscar_album."""
    art = re.split(r",| and | & | y | och | feat| with ", artista)[0].strip()
    a_art = _norm(art)
    titulos = {_base(album), _norm(re.split(r" [–—-] |: ", album)[0])} | {_norm(x) for x in re.findall(r'\(["“]([^"”]+)["”]\)', album)}
    titulos.discard("")
    banda_sonora, propio = bool(BANDA_SONORA.search(artista)), NO_ORIGINAL.search(album)
    for pais in ("US", "JP"):
        for c in _itunes({"term": f"{'' if banda_sonora else art} {album}".strip(), "entity": "album",
                          "limit": 25, "country": pais}).get("results", []):
            if banda_sonora:
                if not (BANDA_SONORA.search(c.get("artistName", "")) or re.search(r"soundtrack|motion picture", c.get("collectionName", ""), re.I)
                        or _norm(c.get("artistName", "")) == "variousartists"): continue
            elif _norm(c.get("artistName", "")) != a_art: continue   # respaldo: artista idéntico
            t = c.get("collectionName", "")
            if re.search(r"\bsingle\b", t, re.I): continue
            if not _calza(t, c.get("artistName", ""), titulos): continue
            if NO_ORIGINAL.search(t) and not propio: continue
            pistas = [p for p in _itunes({"term": f"{c.get('artistName', '')} {t}", "entity": "song", "limit": 50,
                                          "country": pais}).get("results", [])
                      if p.get("collectionId") == c["collectionId"] and p.get("previewUrl")]
            pistas = [p for p in pistas if not PISTA_RARA.search(p["trackName"])]
            pistas = [p for p in pistas if propio or not NO_ORIGINAL.search(p["trackName"])] or pistas
            top = pistas[0] if pistas else None                  # la búsqueda viene ordenada por popularidad
            if top and _otra_escritura(top["trackName"], album, artista): continue
            return {"portada": c.get("artworkUrl100", "").replace("100x100bb", "600x600bb"), "album_itunes": c["collectionId"],
                    "album_titulo": t, "deezer": 0, "preview": top["previewUrl"] if top else "",
                    "cancion": top["trackName"] if top else ""}
    return {}


# Álbumes que Deezer titula distinto que Wikipedia o BSA
TITULO_EN_DEEZER = {"Divide — Ed Sheeran": "÷", "Fck Love — The Kid Laroi": "F*ck Love",
                    "Voulez-vouz — ABBA": "Voulez-Vous", "Unplugged — Eric Clapton": "Unplugged (Deluxe Edition)"}


def etapa_deezer(claves):
    f = BASE / "deezer.json"
    cache = json.loads(f.read_text()) if f.exists() else {}
    falta = [k for k in claves if k not in cache or not cache[k] and k in TITULO_EN_DEEZER]
    print(f"deezer: {len(claves)} álbumes, faltan {len(falta)}")
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(4) as ex:
        for n, (k, r) in enumerate(zip(falta, ex.map(lambda k: buscar_album(TITULO_EN_DEEZER.get(k, k.split(" — ", 1)[0]), k.split(" — ", 1)[1])
                                                      or buscar_itunes(*k.split(" — ", 1)), falta)), 1):
            cache[k] = r
            if n % 50 == 0:
                print(f"  {n}/{len(falta)}", flush=True); f.write_text(json.dumps(cache, ensure_ascii=False))
    f.write_text(json.dumps(cache, ensure_ascii=False))
    return cache


# ───────────────────────── salida ─────────────────────────

def semanas_en_decada(pais, d):
    fin = min(d + 10, 2026 + 313 / 365)  # 2020–2026: hasta la descarga (nov-2026)
    return round((fin - d) * 52.18)


def etapa_salida(semanas, generos, deezer):
    def fam(s):
        for e in (s["album_link"], s["artista_link"]):
            if e:
                g = generos.get("|".join(e), {}).get("generos", [])
                f = familia_de(g)
                if f: return f
        return "otro"
    datos, sin_genero = {}, Counter()
    for p in PAISES:
        datos[p] = {}
        for d in DECADAS:
            ss = [s for s in semanas if s["pais"] == p and d <= s["anio"] < d + 10]
            cuenta, por_album = Counter(), defaultdict(Counter)
            for s in ss:
                f = fam(s)
                cuenta[f] += s["semanas"]
                por_album[f][(s["album"], s["artista"])] += s["semanas"]
                if f == "otro": sin_genero[(s["album"], s["artista"])] += s["semanas"]
            total = sum(cuenta.values())
            anios = sorted({s["anio"] for s in ss})
            top = {}
            for f in FAMILIAS:
                top[f] = []
                for (al, ar), n in por_album[f].most_common(5):
                    dz = deezer.get(f"{al} — {ar}", {})
                    top[f].append([al, ar, n, dz.get("portada", ""), dz.get("deezer", 0), dz.get("cancion", "")])
            datos[p][str(d)] = {
                "semanas": total, "esperadas": semanas_en_decada(p, d),
                "desde": anios[0] if anios else None, "hasta": anios[-1] if anios else None,
                "cuota": {f: round(100 * cuenta[f] / total, 1) if total else None for f in FAMILIAS + ["otro"]},
                "top": top,
            }
    out = REPO / "datos" / "e2" / "decadas.js"
    out.write_text("window.DECADAS = " + json.dumps(
        {"paises": PAISES, "decadas": DECADAS, "familias": FAMILIAS, "datos": datos}, ensure_ascii=False) + ";\n")
    print("→", out.relative_to(REPO), f"{out.stat().st_size // 1024} KB")
    return datos, sin_genero


# ───────────────────────── ventas (certificaciones) ─────────────────────────
# Para cada álbum: año de lanzamiento, géneros del infobox y unidades certificadas en cada uno de los seis países,
# leídas de la tabla «Certifications» de su artículo en inglés (la plantilla ya calcula las unidades de cada nivel
# según el país y la época). Se suman a las listas «List of best-selling albums in <país>».

REGION = {"us": r"United States", "gb": r"United Kingdom", "de": r"Germany", "se": r"Sweden", "jp": r"Japan",
          "ar": r"Argentina"}


def _unidades(t):
    t = t.replace(" ", " ")
    m = re.search(r"([\d.,]+)\s*(million|millones)", t, re.I)
    if m: return float(m.group(1).replace(",", ".")) * 1e6
    m = re.search(r"\d{1,3}(?:[,.]\d{3})+|\d{4,}", t)
    return float(re.sub(r"[,.]", "", m.group(0))) if m else 0.0


def extraer_articulo(html):
    doc = LH.fromstring(html)
    info = {"anio": None, "generos": [], "ventas": {}, "tipo": ""}
    cab = doc.xpath("(//table[contains(@class,'infobox')]//*[contains(@class,'infobox-header')])[1]")
    arriba = doc.xpath("(//table[contains(@class,'infobox')]//*[contains(@class,'infobox-above')])[1]/@class")
    info["tipo"] = " ".join([cab[0].text_content().strip() if cab else "", *arriba]).lower()
    for tr in doc.xpath("//table[contains(@class,'infobox')]//tr"):
        th = tr.xpath("./th"); td = tr.xpath("./td")
        if not th or not td: continue
        k = th[0].text_content().strip().lower()
        if k.startswith("released") and info["anio"] is None:
            info["anio"] = _anio(td[0].text_content())
        elif k.startswith("genre") and not info["generos"]:
            info["generos"] = [a.text_content().strip() for a in td[0].xpath(".//a") if a.text_content().strip()
                               and not a.text_content().strip().startswith("[")] or \
                              [x.strip() for x in re.split(r"[,\n·]", td[0].text_content()) if x.strip()]
    for t in doc.xpath("//table[contains(@class,'wikitable')]"):
        g = grilla(t, "en")
        if not g: continue
        cab = " ".join(c[0].lower() for c in g[0])
        if "certification" not in cab or "region" not in cab: continue
        iu = next((i for i, c in enumerate(g[0]) if re.search(r"units|sales", c[0], re.I)), None)
        if iu is None: continue
        for f in g[1:]:
            if len(f) <= iu: continue
            reg = f[0][0]
            for cc, pat in REGION.items():
                if re.match(pat, reg):
                    if "†" in f[iu][0]: continue                  # solo streaming: no son copias
                    u = _unidades(f[iu][0])
                    info["ventas"][cc] = max(info["ventas"].get(cc, 0), u)  # varias filas (ediciones): la mayor
    return info


def etapa_articulos(titulos, hilos=2):
    """Descarga (API REST, pocas a la vez) y extrae cada artículo en inglés de la lista; caché en articulos.json."""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    f = BASE / "articulos.json"
    cache = json.loads(f.read_text()) if f.exists() else {}
    falta = [t for t in titulos if t not in cache]
    print(f"artículos: {len(titulos)}, faltan {len(falta)}", flush=True)

    def bajar(t):
        url = "https://en.wikipedia.org/api/rest_v1/page/html/" + urllib.parse.quote(t.replace(" ", "_"), safe="")
        for i in range(6):
            try:
                time.sleep(1)                                    # respetar el límite de Wikimedia
                html = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read().decode()
                return t, extraer_articulo(html)
            except urllib.error.HTTPError as e:
                if e.code == 404: return t, None
                time.sleep(int(e.headers.get("Retry-After") or 0) or 30 * (i + 1))
            except Exception:
                time.sleep(10 * (i + 1))
        return t, "error"

    with ThreadPoolExecutor(hilos) as ex:
        for n, fut in enumerate(as_completed([ex.submit(bajar, t) for t in falta]), 1):
            t, r = fut.result()
            if r != "error": cache[t] = r
            if n % 50 == 0:
                print(f"  {n}/{len(falta)}", flush=True); f.write_text(json.dumps(cache, ensure_ascii=False))
    f.write_text(json.dumps(cache, ensure_ascii=False))
    return cache


def listas_mas_vendidos():
    """Filas de las listas de álbumes más vendidos: (país, álbum, artista, enlace, año, unidades)."""
    out = []
    for cc in ("us", "gb", "de", "jp", "ca"):
        host, ts = tablas(f"bs_{cc}")
        for t in ts:
            g = grilla(t, host)
            if not g: continue
            cols = columnas(g[0], {"album": r"^(album|title)", "artista": r"^artist",
                                   "anio": r"^(year|released)", "ventas": r"^(unit )?(sales|shipments)"})
            if not {"album", "artista", "ventas"} <= cols.keys(): continue
            for f in g[1:]:
                if len(f) <= max(cols.values()): continue
                u = _unidades(f[cols["ventas"]][0])
                if not u: continue
                al = f[cols["album"]]
                out.append({"pais": cc, "album": _limpio(al[0]), "artista": _limpio(f[cols["artista"]][0]),
                            "link": al[1][1] if al[1] and al[1][0] == "en" else None,
                            "anio": _anio(f[cols["anio"]][0]) if "anio" in cols else None, "unidades": u})
    return out



def _n(s):
    """Sin tildes, mayúsculas, «The» inicial ni signos: «The Dark Side of the Moon» = «Dark Side of the Moon»."""
    s = unicodedata.normalize("NFKD", s.lower().replace("`", "'"))
    s = re.sub(r"^the\s+", "", "".join(c for c in s if not unicodedata.combining(c)))
    return re.sub(r"[^\w]+", "", s)


BANDA_SONORA_ARTISTA = re.compile(r"soundtrack|various artists|original (cast|soundtrack)|^cast\b", re.I)
SIMBOLO = {"÷": "divide", "×": "multiply", "+": "plus", "=": "equals", "-": "subtract", "x": "multiply"}
SECUELA = re.compile(r"\b(2|3|ii|iii|two|part|pt|vol|volume|del|of 2|acoustic|remix)\b", re.I)


def artista_base(artista):
    """Artista comparable entre fuentes: «&» = «and», sin «/ Soundtrack» agregado, y las palabras en orden
    alfabético («Hikaru Utada» = «Utada Hikaru»). Solo bandas sonoras de varios artistas → «~bandasonora»."""
    a = re.sub(r"\s*/\s*(original )?soundtrack.*$", "", artista, flags=re.I).strip()
    if not a or BANDA_SONORA_ARTISTA.search(a): return "~bandasonora"
    a = re.sub(r"\s*&\s*|\s+\+\s+", " and ", a.lower())
    return " ".join(sorted({_n(w) for w in a.split() if _n(w)}))


def una_letra(a, b):
    """Títulos de 6 o más letras que difieren en una sola letra (erratas: «Carolux Rex» / «Carolus Rex»)."""
    a, b = _n(a), _n(b)
    if a == b or min(len(a), len(b)) < 6 or abs(len(a) - len(b)) > 1: return False
    if len(a) == len(b): return sum(c != d for c, d in zip(a, b)) == 1
    if len(a) > len(b): a, b = b, a
    return any(b[:i] + b[i + 1:] == a for i in range(len(b)))


def mismo_artista(a, b):
    """a, b de artista_base: iguales, o las palabras de uno están todas en el otro («Prince» y «Prince and the
    Revolution»; «Soledad» y «Soledad Pastorutti»), si el más corto no es una sola palabra muy corta."""
    if a == b: return True
    sa, sb = set(a.split()), set(b.split())
    corto = min((sa, sb), key=len)
    return (sa <= sb or sb <= sa) and len("".join(corto)) >= 4 and "~bandasonora" not in sa | sb


def variantes_titulo(album, artista):
    """Títulos con que se reconoce un álbum: el completo, sin paréntesis ni subtítulo («1984 (MCMLXXXIV)» → «1984»,
    «Back to Black – The Deluxe Edition» → «Back to Black», «Octave～オクターヴ～» → «Octave»), el que va entre comillas
    («Untitled ("Led Zeppelin IV")» → «Led Zeppelin IV») y sin «<artista>'s Musical Version of». Lo que se quita
    no puede ser una secuela o parte («The 20/20 Experience – 2 of 2», «En gång i tiden (del 2)»)."""
    out = {_n(album), SIMBOLO.get(album.strip(), "")}             # «÷» = «Divide» (Ed Sheeran)
    out |= {_n(q) for q in re.findall(r'\(["“]([^"”]+)["”]\)', album)}
    t = re.sub(r"^.*'s (musical )?version of ", "", album, flags=re.I)
    quitado = " ".join(a or b for a, b in re.findall(r"\(([^)]*)\)|\[([^\]]*)\]", t))
    base = re.sub(r"\s*[(\[].*?[)\]]", "", t)
    partes = re.split(r" [–—-] |: |～", base, maxsplit=1)
    if len(partes) > 1: quitado += " " + partes[1]
    if not SECUELA.search(quitado): out.add(_n(partes[0]))
    out.discard("")
    return out


def albumes_por_pais(S, G, A, L, nombres_extra=None, artista_generos=None):
    """→ {país: {clave: {album, artista, anio, familia, unidades, fuente}}}: ventas de cada álbum en cada país.
    Unidades = la mayor entre la certificación del artículo y la cifra de la lista de más vendidos del país."""
    nombre = {}   # título del artículo en inglés → (álbum, artista, enlace del artista)
    for x in S:
        l = x["album_link"]
        if not l: continue
        en = l[1] if l[0] == "en" else G.get("|".join(l), {}).get("en")
        if en and en not in nombre: nombre[en] = (x["album"], x["artista"], x["artista_link"])
    for r in L:
        if r["link"] and r["link"] not in nombre: nombre[r["link"]] = (r["album"], r["artista"], None)
    for en, n in (nombres_extra or {}).items():                  # universo_e2: todos los álbumes certificados
        if en not in nombre and n[0] and n[1]: nombre[en] = n

    def fam_de(en, art_link):
        """Familia según los subgéneros de la ficha del ARTISTA (22-nov, tarde: Madonna es pop aunque «Ray of
        Light» sea electrónico; Rauw Alejandro es reguetón aunque «Saturno» empiece por «Miami bass»; ver
        artistas_e2). Sin artista (bandas sonoras, varios artistas): la ficha del álbum. Deezer de respaldo.
        None si no hay ninguna (para no confundir «sin dato» con «otro»)."""
        info = A.get(en) or {}
        for gens in ((artista_generos or {}).get(en), info.get("generos"), G.get(f"en|{en}", {}).get("generos"),
                     G.get("|".join(art_link), {}).get("generos") if art_link else None):
            if gens: return familia_de(gens)
        return None

    def es_album(en, info):
        t = info.get("tipo")
        if t: return not re.search(r"\b(single|song)\b", t) or "album" in t
        return not re.search(r"\((.+ )?(song|single)\)$", en, re.I)

    # Un mismo álbum puede venir con dos títulos (redirecciones: «Bad (album)» y «Bad (Michael Jackson album)»):
    # se agrupa por álbum y artista normalizados, para no sumarlo dos veces.
    def norm(a, b):   # sin tildes ni «The» inicial: «The Dark Side of the Moon» = «Dark Side of the Moon»
        def n(s):
            s = unicodedata.normalize("NFKD", s.lower().replace("`", "'"))
            s = re.sub(r"^the\s+", "", "".join(c for c in s if not unicodedata.combining(c)))
            return re.sub(r"[^\w]+", "", s)
        return f"{n(a)}|{n(b)}"

    P = {cc: {} for cc in PAISES}
    for en, info in A.items():
        if not info or en not in nombre or not es_album(en, info): continue
        album, artista, art_link = nombre[en]
        for cc, u in info["ventas"].items():
            if cc not in P or not 0 < u <= 60e6: continue   # «ar» queda en la caché vieja                     # más que Thriller en EE. UU. (34 M): streams
            clave = norm(album, artista)
            x = P[cc].get(clave)
            if x and x["unidades"] >= u: continue
            P[cc][clave] = {"album": album, "artista": artista, "anio": info["anio"] or (x or {}).get("anio"),
                            "unidades": u, "familia": fam_de(en, art_link), "fuente": "certificación",
                            "tipo": info.get("tipo", "")}
    for r in L:
        clave = norm(r["album"], r["artista"])
        x = P[r["pais"]].get(clave)
        if x:
            if r["unidades"] > x["unidades"]: x.update(unidades=r["unidades"], fuente=r.get("fuente", "lista"))
            x["anio"] = x["anio"] or r["anio"]
        else:
            info = A.get(r["link"]) or {}
            P[r["pais"]][clave] = {"album": r["album"], "artista": r["artista"], "anio": info.get("anio") or r["anio"],
                                   "unidades": r["unidades"], "familia": fam_de(r["link"], None) if r["link"] else None,
                                   "tipo": info.get("tipo", ""),
                                   "fuente": r.get("fuente", "lista")}
    # El mismo álbum escrito de dos formas según la fuente → se fusionan y queda la mayor cifra (alias: los otros
    # nombres, para buscarlo en Deezer). Mismo artista (o uno empieza con el otro: «Soledad» y «Soledad Pastorutti»;
    # las bandas sonoras cuentan como un mismo artista), mismo año (±1) y el mismo título base (mismo_album).
    for albumes in P.values():
        ks = sorted(albumes, key=lambda k: -albumes[k]["unidades"])
        var = {k: variantes_titulo(albumes[k]["album"], albumes[k]["artista"]) for k in ks}
        art = {k: artista_base(albumes[k]["artista"]) for k in ks}
        for i, k in enumerate(ks):
            if k not in albumes: continue
            x = albumes[k]
            for k2 in ks[i + 1:]:
                if k2 not in albumes: continue
                y, a, b = albumes[k2], art[k], art[k2]
                if not mismo_artista(a, b): continue
                if x["anio"] and y["anio"] and abs(x["anio"] - y["anio"]) > 1: continue
                if not (var[k] & var[k2] or una_letra(x["album"], y["album"]) and x["anio"] == y["anio"]): continue
                albumes.pop(k2)
                x["anio"], x["familia"] = x["anio"] or y["anio"], x["familia"] or y["familia"]
                x.setdefault("alias", []).extend([(y["album"], y["artista"])] + y.get("alias", []))
                x["tipo"] = x.get("tipo") or y.get("tipo", "")
    # Solo álbumes y EP: sin sencillos ni recopilaciones de grandes éxitos (pedido del grupo, 21-nov). Los EP
    # entran desde el 22-nov: son material original, y en electrónica son el formato principal (Skrillex:
    # «Bangarang» y «Scary Monsters…», 1 M cada uno en EE. UU.; The Chainsmokers: «Collage», 3 M).
    # Si la ficha de Wikipedia dice que es recopilación, también sale cuando llega por otra fuente con otro título
    # («50 Years – Don't Stop» de BestSellingAlbums = el artículo «50 Years – Don't Stop (album)»).
    recop = set()
    for en, info in A.items():
        if info and en in nombre and TIPO_NO_ALBUM.search(info.get("tipo") or ""):
            al, ar, _ = nombre[en]
            recop |= {(v, artista_base(ar)) for v in variantes_titulo(al, ar)}
    for albumes in P.values():
        for k in [k for k, x in albumes.items()
                  if any((v, artista_base(x["artista"])) in recop for v in variantes_titulo(x["album"], x["artista"]))]:
            del albumes[k]
    for albumes in P.values():
        for k in [k for k, x in albumes.items() if es_recopilacion(x["album"], x.get("tipo", ""), x["artista"])]:
            del albumes[k]
    return P


# Tipo del infobox de Wikipedia («greatest hits album», «compilation album», «single»; los EP sí cuentan) o, si el álbum no tiene
# artículo (listas de BestSellingAlbums.org), el título.
TIPO_NO_ALBUM = re.compile(r"greatest|compilation|\bsingle\b|\bsong\b|remix|\bbox\b|\bvideo\b", re.I)
TITULO_RECOPILACION = re.compile(
    r"greatest|grandes [eé]xitos|\bremix(es)?\b|you can dance|\b[eé]xitos\b|best of|\bthe best\b(?! (damn|that))|^best\b|\bbest$|"
    r"complete best|super best|lo mejor|\bmejores\b|\bhits\b|antholog|antolog[ií]a|\bcollection\b|"
    r"colecci[oó]n|\bessential|esencial|very best|\bdefinitive\b|\bsingles\b|number ones|^1$|samlingsalb|golden prize", re.I)
RANGO_ANIOS = re.compile(r"\b((19|20)\d\d|\d\d) ?[-–] ?(19|20)\d\d\b|\b(19|20)\d\d ?[-–] ?\d\d\b")   # «1962–1966», «72-2001»
ARTISTA_RECOPILACION = re.compile(r"various artists|varios artistas|blandade artister|\bseries$", re.I)   # «Ljuva Series»
BANDA_SONORA_TITULO = re.compile(r"soundtrack|motion picture|original cast", re.I)   # varios artistas, pero no es recopilación


def es_recopilacion(titulo, tipo="", artista=""):
    """«Gold» no basta (Love over Gold es de estudio) y un rango de años en un disco en vivo tampoco (Live/1975–85)."""
    return bool(TIPO_NO_ALBUM.search(tipo or "") or TITULO_RECOPILACION.search(titulo)
                or ARTISTA_RECOPILACION.search(artista) and not BANDA_SONORA_TITULO.search(titulo)
                or RANGO_ANIOS.search(titulo) and not re.match(r"live\b", titulo, re.I))


MIN_ALBUMES = 3   # con menos álbumes con ventas conocidas en una década, se considera sin datos


def etapa_salida_ventas(P, deezer):
    datos = {}
    for cc in PAISES:
        datos[cc] = {}
        for d in DECADAS:
            todos = [x for x in P[cc].values() if x["anio"] and d <= x["anio"] < d + 10]
            xs = [x for x in todos if x["familia"]]                 # sin género no cuenta (ver generos_deezer_e2)
            total = sum(x["unidades"] for x in xs)
            por_f = defaultdict(list)
            for x in xs: por_f[x["familia"]].append(x)
            sin = len(xs) < MIN_ALBUMES
            top = {}
            for f in FAMILIAS:
                top[f] = []
                for x in sorted(por_f[f], key=lambda x: -x["unidades"])[:5]:
                    dz = deezer.get(f"{x['album']} — {x['artista']}", {})
                    titulo = x["album"] + ('"' if x["album"].count('"') % 2 else "")   # B'z The Best "Pleasure"
                    top[f].append([titulo, x["artista"], round(x["unidades"]), x["anio"], dz.get("portada", ""),
                                   dz.get("deezer", 0), dz.get("cancion", ""), dz.get("preview", "")])
            datos[cc][str(d)] = {
                "albumes": len(xs), "sin_genero": len(todos) - len(xs), "total": round(total), "sin_datos": sin,
                "ventas": {f: round(sum(x["unidades"] for x in por_f[f])) for f in FAMILIAS + ["otro"]},
                "cuota": {f: (round(100 * sum(x["unidades"] for x in por_f[f]) / total, 1) if total and not sin else None)
                          for f in FAMILIAS + ["otro"]},
                "top": top,
            }
    out = REPO / "datos" / "e2" / "decadas.js"
    out.write_text("window.DECADAS = " + json.dumps(
        {"medida": "unidades certificadas o vendidas", "genero": "ficha del artista en Wikipedia (Deezer si no hay)", "paises": PAISES, "decadas": DECADAS, "familias": FAMILIAS,
         "datos": datos}, ensure_ascii=False) + ";\n")
    print("→", out.relative_to(REPO), f"{out.stat().st_size // 1024} KB")
    return datos


# ───────────────────────── semanas en el n.º 1 ─────────────────────────
SEM_MES = 52.18 / 12
VACIO = re.compile(r"^(|—|–|-|gráfico (sin registro|no emitido)|no (chart|release).*|n/a)\.?$", re.I)


def _limpio(t):
    t = re.sub(r"\[\w{2}\]|[†‡§*¤♦]|\(\d+w\)", "", t)
    return re.sub(r"\s+", " ", t).strip(' "“”')


def _anio(t, defecto=None):
    m = re.findall(r"(19[5-9]\d|20[0-2]\d)", t)
    return int(m[0]) if m else defecto


def _filas(clave, patrones, minimo=("album", "artista")):
    """Recorre las tablas de una página; entrega (dict de columnas, fila) para cada fila de datos."""
    host, ts = tablas(clave)
    for t in ts:
        g = grilla(t, host)
        for i, fila in enumerate(g):
            cols = columnas(fila, patrones)
            if all(k in cols for k in minimo) and all(c[2] == "th" or not c[1] for c in fila[:3]):
                for f in g[i + 1:]:
                    if len(f) <= max(cols.values()) or len({c[0] for c in f}) == 1: continue
                    yield cols, f
                return  # solo la primera tabla que calza: las siguientes son resúmenes


def _semana(pais, anio, f, cols, semanas=1.0):
    al, ar = f[cols["album"]], f[cols["artista"]]
    album, artista = _limpio(al[0]), _limpio(ar[0])
    if VACIO.match(album) or VACIO.match(artista) or album.lower().startswith(("issue", "fecha")): return None
    if len(album) > 120 or semanas > 60: return None  # filas de notas que ocupan todo el ancho
    return {"pais": pais, "anio": anio, "album": album, "artista": artista, "semanas": semanas,
            "album_link": al[1], "artista_link": ar[1]}


def etapa_semanas():
    S = []
    add = lambda s: s and S.append(s)
    # EE. UU. y Japón: una fila por semana, una página por año
    for pais, pref, anios in (("us", "us", range(1970, 2027)), ("jp", "jp", range(1991, 2027))):
        for y in anios:
            for cols, f in _filas(f"{pref}_{y}", {"album": r"^album", "artista": r"^artist"}):
                add(_semana(pais, y, f, cols))
    # Reino Unido: una fila por racha, con «Weeks at number one»; una página por década
    for d in DECADAS:
        for cols, f in _filas(f"gb_{d}", {"album": r"^album", "artista": r"^artist", "fecha": r"reached|date",
                                          "sem": r"weeks"}, ("album", "artista", "sem")):
            n = re.findall(r"\d+", f[cols["sem"]][0])
            y = max(_anio(f[cols["fecha"]][0], d), d) if "fecha" in cols else d
            if n: add(_semana("gb", y, f, cols, float(n[0])))
    # Alemania 1970–1979: de.wikipedia, ranking mensual de álbumes (Mt.ges. = meses en el n.º 1)
    for y in range(1970, 1980):
        for cols, f in _filas(f"dede_{y}", {"meses": r"^mt", "artista": r"^interpret", "album": r"^titel",
                                            "fecha": r"^zeitraum"}, ("meses", "album", "artista")):
            if _anio(f[cols["fecha"]][0], y) != y: continue  # la racha se cuenta en el año en que empieza
            n = re.findall(r"\d+", f[cols["meses"]][0])
            if n: add(_semana("de", y, f, cols, float(n[0]) * SEM_MES))
    # Alemania 1980–2026: en.wikipedia, columnas Album + Artist (la segunda «Artist» de la tabla)
    for y in range(1980, 2027):
        host, ts = tablas(f"de_{y}")
        for t in ts:
            g = grilla(t, host)
            cab = [c[0] for c in g[0]] if g else []
            if "Album" not in cab: continue
            ia = cab.index("Album"); ir = next((i for i in range(ia + 1, len(cab)) if cab[i].startswith("Artist")), None)
            for f in g[1:]:
                if ir is not None and len(f) > ir and len({c[0] for c in f}) > 1:
                    add(_semana("de", y, f, {"album": ia, "artista": ir}))
    # Suecia 1975–2006: sv.wikipedia, una fila por racha con «Veckor»
    for cols, f in _filas("se_sv", {"fecha": r"^datum", "sem": r"^veckor", "album": r"^albumtitel",
                                    "artista": r"^artist"}, ("album", "artista", "sem")):
        y = _anio(f[cols["fecha"]][0])
        n = re.findall(r"\d+", f[cols["sem"]][0])
        if y and y < 2007 and n: add(_semana("se", y, f, cols, float(n[0])))
    # Suecia 2007–2026: en.wikipedia, una fila por semana (columnas Album title + Performer)
    host, ts = tablas("se_en")
    for t in ts:
        g = grilla(t, host)
        cab = [c[0] for c in g[0]] if g else []
        if "Album title" not in cab or "Date" not in cab: continue
        ia, iff = cab.index("Album title"), cab.index("Date")
        ir = next((i for i in range(ia + 1, len(cab)) if cab[i].startswith("Performer")), None)
        for f in g[1:]:
            y = _anio(f[iff][0]) if len(f) > iff else None
            if ir is not None and y and y >= 2007 and len(f) > ir:
                add(_semana("se", y, f, {"album": ia, "artista": ir}))
    # Argentina 2011–2017: en.wikipedia, ranking mensual (una fila por mes)
    for cols, f in _filas("ar_en", {"anio": r"^year", "album": r"^album", "artista": r"^artist"}):
        y = _anio(f[cols["anio"]][0])
        if y: add(_semana("ar", y, f, cols, SEM_MES))
    # Argentina 2018–2026: es.wikipedia, una fila por semana
    for y in range(2018, 2027):
        for cols, f in _filas(f"ar_{y}", {"album": r"^álbum", "artista": r"^artista"}):
            add(_semana("ar", y, f, cols))
    # Wikipedia enlaza un álbum o artista solo la primera vez que aparece: el enlace se copia a las demás filas
    # del mismo país (mismo álbum y artista; mismo artista).
    al, ar = {}, {}
    for s in S:
        if s["album_link"]: al.setdefault((s["pais"], s["album"].lower(), s["artista"].lower()), s["album_link"])
        if s["artista_link"]: ar.setdefault((s["pais"], s["artista"].lower()), s["artista_link"])
    for s in S:
        s["album_link"] = s["album_link"] or al.get((s["pais"], s["album"].lower(), s["artista"].lower()))
        s["artista_link"] = s["artista_link"] or ar.get((s["pais"], s["artista"].lower()))
    (BASE / "semanas.json").write_text(json.dumps(S, ensure_ascii=False))
    return S


def resumen_cobertura(S):
    print(f"{'':4}" + "".join(f"{d:>9}" for d in DECADAS))
    for p in PAISES:
        fila = ""
        for d in DECADAS:
            n = sum(s["semanas"] for s in S if s["pais"] == p and d <= s["anio"] < d + 10)
            fila += f"{round(100 * n / semanas_en_decada(p, d)):>8}%"
        print(f"{p:4}{fila}")


if __name__ == "__main__":
    etapa = sys.argv[sys.argv.index("--etapa") + 1] if "--etapa" in sys.argv else "todo"
    f = BASE / "semanas.json"
    S = etapa_semanas() if etapa in ("semanas", "todo") or not f.exists() else json.loads(f.read_text())
    if etapa == "semanas": resumen_cobertura(S); sys.exit()
    G = etapa_generos(S) if etapa in ("generos", "todo") else json.loads((BASE / "generos.json").read_text())
    import artistas_e2, bsa_e2, canada_e2, generos_deezer_e2, universo_e2
    L = listas_mas_vendidos() + bsa_e2.filas()
    pool = {x["album_link"][1] if x["album_link"][0] == "en" else G.get("|".join(x["album_link"]), {}).get("en")
            for x in S if x["album_link"]} | {r["link"] for r in L if r["link"]}
    A = etapa_articulos(sorted(t for t in pool if t)) if etapa in ("articulos", "todo") \
        else json.loads((BASE / "articulos.json").read_text())
    for t, u in canada_e2.ventas(A).items():
        if A.get(t): A[t]["ventas"]["ca"] = u
    # 22-nov: universo = todos los álbumes con certificación en los seis países (universo_e2), no solo los n.º 1.
    A2, N2 = universo_e2.articulos()
    previos = {t for t, x in A.items() if x}
    for t, x in A2.items():
        if A.get(t):
            for cc, u in x["ventas"].items(): A[t]["ventas"][cc] = max(A[t]["ventas"].get(cc, 0), u)
            A[t]["generos"] = A[t].get("generos") or x["generos"]
            A[t]["anio"] = A[t].get("anio") or x["anio"]
            A[t]["tipo"] = A[t].get("tipo") or x["tipo"]
        else:
            A[t] = x
    print(f"universo: {len(A2)} álbumes certificados (+{len(set(A2) - previos)} que no estaban)")
    GA = artistas_e2.por_album([t for t, x in A.items() if x], N2)
    print(f"género por artista: {len(GA)} de {sum(1 for x in A.values() if x)} álbumes")
    P = albumes_por_pais(S, G, A, L, N2, GA)
    print("género:", dict(generos_deezer_e2.aplicar(P).most_common()))
    datos = etapa_salida_ventas(P, {})        # sin portadas, para saber qué álbumes entran a algún top 5
    claves = sorted({f"{a[0]} — {a[1]}" for p in datos.values() for x in p.values() for t in x["top"].values() for a in t})
    D = etapa_deezer(claves) if etapa in ("deezer", "todo", "salida") else json.loads((BASE / "deezer.json").read_text())
    datos = etapa_salida_ventas(P, D)
    for cc in PAISES:
        print(cc, " | ".join(f"{d}: " + ("sin datos" if datos[cc][str(d)]["sin_datos"] else
              f"{datos[cc][str(d)]['total'] / 1e6:.0f} M · " + " ".join(f"{f[:2]}{datos[cc][str(d)]['cuota'][f]:.0f}"
              for f in FAMILIAS + ["otro"])) for d in DECADAS))
