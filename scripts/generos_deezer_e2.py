"""E2 V4 — género de cada álbum según Deezer: la única fuente de género del pipeline (decisión del grupo, 21-nov-2026:
«todo según la clasificación de Deezer»).

Por qué Deezer: una sola fuente para todos los países y décadas, sin el límite de consultas de Wikipedia (808 álbumes
en 6 minutos). Deezer cataloga cada álbum con un género (genre_id).

Regla, para cada álbum (título y artista):
  1. El álbum en Deezer: el mismo artista (no uno que lo contenga: «Boston» ≠ «Boston George») y el mismo título
     (sin «remastered», «deluxe», subtítulos ni paréntesis); entre ediciones, la de título exacto y tipo «album».
     Nunca una versión en vivo, karaoke ni homenaje. Si Deezer escribe al artista en japonés (浜崎あゆみ = Ayumi
     Hamasaki), basta el título exacto en una búsqueda que incluya al artista.
  2. Si Deezer no tiene el álbum: el género más común entre los álbumes del artista en Deezer. Si el nombre es muy corto,
     calza solo en parte, está en japonés o tiene un homónimo con fans parecidos, únicamente si ese artista tiene alguno
     de los álbumes de la lista (hay dos «B'z» en Deezer y uno rapea).
  3. Si Deezer no tiene ni el álbum ni al artista (B'z, Garth Brooks), el álbum no se cuenta: sin género no hay disco,
     y como «otro» inflaría esa parte (16_albumes_e2 lo anota en «sin_genero» de cada década).
  Pop → pop · Rock, Metal, Alternative → rock · Rap/Hip Hop → hip hop · Dance, Electro → electrónica · el resto → otro.
  «Asian Music» → pop: Deezer no trae subgénero (ni J-pop ni J-rock en la ficha del álbum, revisado el 21-nov), y el
  pipeline ya cuenta el J-pop y el K-pop como pop; las bandas de J-rock (Glay) quedan en pop, como las cataloga Deezer.

Sesgos conocidos (21-nov), que son los de la clasificación de Deezer:
  - Comparado con Wikipedia en 277 álbumes, coinciden en el 69 %. Deezer cataloga como Pop mucho rock de radio
    (Born in the U.S.A., Bat Out of Hell, Jagged Little Pill, El amor después del amor): 38 casos, contra 7 al revés.
  - «Alternative» (→ rock) incluye pop alternativo: Folklore de Taylor Swift y Billie Eilish quedan en rock.
  - Algunos discos de country quedan en «Dance» (→ electrónica): Morgan Wallen.

Caché: ~/InfoVis-datos/deezer_generos_albumes.json   «álbum|artista» → {genero, via, …}, o {} si Deezer no lo tiene
Uso:   uv run --with lxml python scripts/generos_deezer_e2.py   # consulta todos los álbumes del pipeline y resume
"""
import importlib, json, pathlib, re, sys, time, unicodedata, urllib.parse, urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
M = importlib.import_module("16_albumes_e2")

CACHE = pathlib.Path.home() / "InfoVis-datos" / "deezer_generos_albumes.json"

# id de Deezer → (nombre en Deezer, género que entiende 16_albumes_e2.familia)
DZ = {132: ("Pop", "pop"), 152: ("Rock", "rock"), 464: ("Metal", "metal"), 85: ("Alternative", "alternative rock"),
      116: ("Rap/Hip Hop", "hip hop"), 113: ("Dance", "dance"), 106: ("Electro", "electronic"),
      165: ("R&B", "R&B"), 169: ("Soul & Funk", "soul"), 122: ("Reggaeton", "reggaeton"), 197: ("Latin Music", "latin"),
      71: ("Cumbia", "cumbia"), 75: ("Brazilian Music", "MPB"), 466: ("Folk", "folk"), 144: ("Reggae", "reggae"),
      129: ("Jazz", "jazz"), 98: ("Classical", "classical"), 173: ("Films/Games", "soundtrack"),
      2: ("African Music", "african"), 16: ("Asian Music", "J-pop"), 153: ("Blues", "blues"),
      81: ("Indian Music", "indian"), 95: ("Kids", "children's music"), 522: ("Singer & Songwriter", "folk"),
      73: ("Tango", "tango")}
ASIA = 16
KANJI = re.compile(r"[぀-ヿ一-鿿]")      # kana y kanji
COMPILADO =re.compile(r"various|varios|multi-interpr|v\.a\.|serie|series|soundtrack|original|\bcast\b|"
                       r"melodifestivalen|absolute|now that|bravo hits", re.I)


# ───────────────────────── nombres ─────────────────────────

def _sin_kanji(t):
    """«SOUTHERN ALL STARS (サザンオールスターズ)» → «SOUTHERN ALL STARS»; si todo es no latino, se deja."""
    s = re.sub(r"\s*[\(（][^)）]*[^\x00-ɏ\s][^)）]*[\)）]", "", t).strip()
    return s or t


def _tokens(s):
    s = unicodedata.normalize("NFKD", s.lower().replace("`", "'"))
    s = re.sub(r"^the\s+", "", "".join(c for c in s if not unicodedata.combining(c)))
    return [t for t in re.split(r"[^a-z0-9぀-鿿]+", s) if t]


def clave_artista(s):
    t = _tokens(_sin_kanji(s))
    return "".join(t), "".join(sorted(t))          # «Utada Hikaru» = «Hikaru Utada»


def _mismo_artista(a, b):
    """2 = mismo nombre (también con las palabras en otro orden); 1 = uno contiene al otro; 0 = distinto."""
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb: return 0
    ja, jb = "".join(ta), "".join(tb)
    if ja == jb or sorted(ta) == sorted(tb): return 2
    return 1 if min(len(ja), len(jb)) > 3 and (ja in jb or jb in ja) else 0


def _corto(t):
    t = re.sub(r"\s*[\(\[（【][^\)\]）】]*[\)\]）】]", "", t)
    return M._norm(re.split(r" [–—-] |: | ?[～〜~]", t)[0])


def _calce(t_dz, album):
    b1, b2, c1, c2 = M._base(t_dz), M._base(album), _corto(t_dz), _corto(album)
    if b1 and b1 == b2: return 2
    if c1 and c1 in (c2, b2) or c2 and c2 == b1: return 1
    return 1 if min(len(b1), len(b2)) > 5 and (b1 in b2 or b2 in b1) else 0


def _art_principal(artista):
    return re.split(r",| and | & | y | och | feat\.? | ft\.? | with ", artista)[0].strip()


# ───────────────────────── Deezer ─────────────────────────

def _dz(url):
    """GET a la API de Deezer. None si falla (no se guarda en caché: se reintenta en la próxima corrida)."""
    for i in range(8):
        try:
            time.sleep(0.12)
            d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=M.UA), timeout=20))
        except Exception:
            time.sleep(2 * (i + 1)); continue
        if isinstance(d, dict) and "error" in d:
            if d["error"].get("code") == 800: return {}           # no existe
            time.sleep(5); continue                               # cuota (50 consultas cada 5 s) u otro
        return d
    return None


def album_deezer(album, artista):
    """El álbum en Deezer → dict de la búsqueda, {} si no está, None si la API falló."""
    art = _art_principal(artista)
    compilado = bool(COMPILADO.search(artista) or COMPILADO.search(album))
    mejor = None
    for i, q in enumerate((f'artist:"{art}" album:"{album}"', f"{art} {album}", album)):
        d = _dz("https://api.deezer.com/search/album?limit=25&q=" + urllib.parse.quote(q))
        if d is None: return None
        for c in d.get("data", []):
            n = c["artist"]["name"]
            s = _calce(c["title"], album)
            # Deezer escribe algunos artistas japoneses en kanji o kana (浜崎あゆみ = Ayumi Hamasaki) y los nombres no se
            # pueden comparar: vale el título exacto, si la búsqueda incluía al artista (no la tercera, solo por título).
            otra_escritura = KANJI.search(n) and s == 2 and i < 2
            if not (max(_mismo_artista(art, n), _mismo_artista(artista, n)) == 2 or otra_escritura
                    or compilado and COMPILADO.search(n)):
                continue
            if not s or (M.NO_ORIGINAL.search(c["title"]) and not M.NO_ORIGINAL.search(album)): continue
            k = (s, c.get("record_type") == "album", (c.get("genre_id") or -1) > 0, c.get("nb_tracks", 0))
            if mejor is None or k > mejor[0]: mejor = (k, c)
        if mejor: break
    return mejor[1] if mejor else {}


def artista_deezer(artista, titulos=()):
    """Género más común entre los álbumes del artista en Deezer → {genero, via, artista_dz}, {} o None (error).
    Solo si ese artista de Deezer tiene alguno de los álbumes que la lista le atribuye (`titulos`): el nombre no basta,
    porque Deezer tiene homónimos con más fans que el artista buscado («ZARD», «Soledad» y uno de los dos «B'z» rapean).
    Acepta también artistas escritos en japonés (浜崎あゆみ), con la misma verificación."""
    if COMPILADO.search(artista): return {}
    art = _art_principal(artista)
    d = _dz("https://api.deezer.com/search/artist?limit=10&q=" + urllib.parse.quote(art))
    if d is None: return None
    cands = sorted((c for c in d.get("data", []) if _mismo_artista(art, c["name"]) or KANJI.search(c["name"])),
                   key=lambda c: (_mismo_artista(art, c["name"]), c.get("nb_fan", 0)), reverse=True)
    for c in cands[:4]:
        als = _dz(f"https://api.deezer.com/artist/{c['id']}/albums?limit=100")
        if als is None: return None
        als = als.get("data", [])
        if not any(_calce(a["title"], t) for a in als for t in titulos): continue
        n = Counter(a["genre_id"] for a in als if (a.get("genre_id") or -1) > 0)
        if n: return {"genero": n.most_common(1)[0][0], "via": "artista", "artista_dz": c["name"]}
    return {}


def genero_de(album, artista, titulos=()):
    c = album_deezer(album, artista)
    if c is None: return None
    if c:
        g = c.get("genre_id") or -1
        if g <= 0:
            d = _dz(f"https://api.deezer.com/album/{c['id']}")
            if d is None: return None
            g = d.get("genre_id") or next((x["id"] for x in d.get("genres", {}).get("data", [])), -1)
        if g > 0:
            return {"genero": g, "via": "album", "album_dz": c["id"], "titulo_dz": c["title"],
                    "artista_dz": c["artist"]["name"]}
    return artista_deezer(artista, titulos)


def consultar(pares, hilos=3):
    """pares {(álbum, artista)} → caché completa {«álbum|artista»: resultado}; consulta solo lo que falta."""
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    falta = sorted({f"{a}|{b}" for a, b in pares} - cache.keys())
    titulos = {}                                   # álbumes de cada artista (para descartar homónimos)
    for a, b in pares: titulos.setdefault(clave_artista(b)[1], set()).add(a)
    if falta: print(f"géneros en Deezer: {len(falta)} álbumes por consultar", flush=True)
    with ThreadPoolExecutor(hilos) as ex:
        futuros = {ex.submit(genero_de, *k.split("|", 1), titulos[clave_artista(k.split("|", 1)[1])[1]]): k
                   for k in falta}
        for n, fut in enumerate(as_completed(futuros), 1):
            r = fut.result()
            if r is not None: cache[futuros[fut]] = r
            if n % 100 == 0:
                CACHE.write_text(json.dumps(cache, ensure_ascii=False)); print(f"  {n}/{len(falta)}", flush=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False))
    return cache


# ───────────────────────── aplicar al pipeline ─────────────────────────

def aplicar(P):
    """22-nov (decisión del grupo): el género sale de los subgéneros de la ficha de Wikipedia del álbum
    (16_albumes_e2.familia_de, con la tabla de subgéneros); Deezer solo para los álbumes sin ficha o sin géneros en
    ella (los de BestSellingAlbums.org sin artículo, sobre todo). Anota de dónde salió (x['genero'],
    x['genero_deezer']). x['familia'] = None si no hay ninguno de los dos. → Counter de las vías."""
    nombres = lambda x: [(x["album"], x["artista"])] + x.get("alias", [])   # alias: el mismo álbum en otra fuente
    sin = [x for p in P.values() for x in p.values() if not x.get("familia")]
    D = consultar({n for x in sin for n in nombres(x)})
    vias = Counter()
    for p in P.values():
        for x in p.values():
            if x.get("familia"):
                x["genero"], x["genero_deezer"] = "Wikipedia (ficha del artista o del álbum)", None
                vias["Wikipedia"] += 1
                continue
            d = next((D[f"{a}|{b}"] for a, b in nombres(x) if (D.get(f"{a}|{b}") or {}).get("genero")), {})
            g = d.get("genero")
            if g:
                nombre, gen = DZ.get(g, (str(g), "otro"))
                x["familia"], x["genero"], x["genero_deezer"] = M.familia_de([gen]), f"Deezer ({d['via']})", nombre
            else:
                x["familia"], x["genero"], x["genero_deezer"] = None, None, None
            vias[x["genero"] or "sin género (no está en Deezer)"] += 1
    return vias


if __name__ == "__main__":
    import bsa_e2
    S = json.loads((M.BASE / "semanas.json").read_text())
    G = json.loads((M.BASE / "generos.json").read_text())
    A = json.loads((M.BASE / "articulos.json").read_text())
    P = M.albumes_por_pais(S, G, A, M.listas_mas_vendidos() + bsa_e2.filas())
    print("vías:", dict(aplicar(P).most_common()))
    print("familias:", dict(Counter(x["familia"] for p in P.values() for x in p.values())))
