"""E2 V4 — segunda fuente de ventas: listas por país de BestSellingAlbums.org (BSA).

Por qué: las listas de Wikipedia y las certificaciones de los artículos dejan celdas flacas (Suecia entera,
Argentina 1970–1990, Japón 1970–1980). BSA publica, por país, los álbumes más vendidos con su certificación,
ventas y año de lanzamiento, citando a la cámara de cada país (RIAA, BPI, BVMI, CAPIF, RIAJ/Oricon, IFPI Sverige).

Cobertura real de las listas (contada al bajarlas, 21-nov-2026; filas con año ≥ 1970):
  us 1970–2020 · gb 1970–2010 · de 1970–2010 · ar 1970–2000 (CAPIF retiró su base en 2011) ·
  jp 1970–2010 (casi todo 1989–2005) · se 1970–2010 (casi todo 1990–2009)
No llenan Argentina 2010–2020 ni las décadas de 2020.
Canadá (21-nov, reemplaza a Argentina): 14 · 32 · 61 · 9 · 5 · 0 álbumes por década (1970–2020); el grueso de
Canadá sale de las certificaciones (canada_e2.py). La caché de Argentina (ar.html) se conserva.

BSA no trae el género: lo pone generos_deezer_e2, igual que a todos los álbumes del pipeline.

Caché (fuera del repo): ~/InfoVis-datos/bestsellingalbums/<cc>.html  (robots.txt pide 10 s entre consultas)
Uso: 16_albumes_e2 suma bsa_e2.filas() a las listas de más vendidos. Solo, baja lo que falte y muestra la cobertura:
     uv run --with lxml python scripts/bsa_e2.py
"""
import importlib, pathlib, re, sys, time, urllib.request
from collections import Counter

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
M = importlib.import_module("16_albumes_e2")
from generos_deezer_e2 import _sin_kanji, _tokens, clave_artista
from lxml import html as LH

DIR = pathlib.Path.home() / "InfoVis-datos" / "bestsellingalbums"
URL = "https://bestsellingalbums.org/list-of-best-selling-albums-in-"
PAGINAS = {"us": "united-states-of-america", "gb": "the-united-kingdom", "de": "germany", "ca": "canada",
           "jp": "japan", "se": "sweden"}
UA_WEB = {"User-Agent": "Mozilla/5.0 (infovis-student-research; university course project)"}


def descargar():
    DIR.mkdir(parents=True, exist_ok=True)
    for cc, slug in PAGINAS.items():
        f = DIR / f"{cc}.html"
        if f.exists(): continue
        time.sleep(10)                                            # Crawl-delay: 10
        f.write_text(urllib.request.urlopen(urllib.request.Request(URL + slug + "/", headers=UA_WEB), timeout=60)
                     .read().decode())
        print("ok", cc, flush=True)


def _bonito(t):
    """BSA escribe Argentina, Japón y Suecia en mayúsculas: «LOS FABULOSOS CADILLACS» → «Los Fabulosos Cadillacs»."""
    t = t.replace("`", "'")
    if t != t.upper(): return t
    out = " ".join(w if re.fullmatch(r"[IVX]+|[A-Z]\.?([A-Z]\.)+|U2|ABBA|AC/DC|R\.E\.M\.|UB40|TLC|NSYNC", w)
                   else w.capitalize() for w in t.split(" "))
    return re.sub(r"(?<=[\s(])(De|Del|La|Las|Los|El|En|Y|Of|The|And|A|Un)(?=\s)",
                  lambda m: m.group(1).lower(), out)


def filas():
    """→ [{pais, album, artista, anio, unidades, certificacion, fuente, link}] con la mayor cifra de cada álbum por
    país (las listas repiten un álbum en la tabla de certificaciones por fecha). Mismo formato que
    16_albumes_e2.listas_mas_vendidos(); link = None (no hay artículo: el género lo pone Deezer)."""
    descargar()
    out = {}
    for cc in PAGINAS:
        doc = LH.fromstring((DIR / f"{cc}.html").read_text())
        for t in doc.xpath("//table"):
            g = M.grilla(t, "bsa")
            if not g: continue
            cab = [c[0].lower() for c in g[0]]
            col = {k: next((i for i, c in enumerate(cab) if re.search(p, c)), None) for k, p in
                   {"artista": r"^artist", "album": r"^album", "ventas": r"^sales", "anio": r"year|release",
                    "cert": r"^certification(?! date)"}.items()}
            if None in (col["artista"], col["album"], col["ventas"], col["anio"]): continue
            for f in g[1:]:
                if len(f) <= max(v for v in col.values() if v is not None): continue
                u, y = M._unidades(f[col["ventas"]][0]), M._anio(f[col["anio"]][0])
                if not u or not y or y < 1970: continue
                al, ar = _sin_kanji(f[col["album"]][0]), _sin_kanji(f[col["artista"]][0])
                k = (cc, "".join(_tokens(al)), clave_artista(ar)[1])
                if k in out and out[k]["unidades"] >= u: continue
                out[k] = {"pais": cc, "album": _bonito(al), "artista": _bonito(ar), "anio": y, "unidades": u,
                          "certificacion": f[col["cert"]][0] if col["cert"] is not None else "",
                          "fuente": "bestsellingalbums.org", "link": None}
    return list(out.values())


if __name__ == "__main__":
    F = filas()
    c = Counter((x["pais"], x["anio"] // 10 * 10) for x in F)
    print(f"{len(F)} álbumes\n{'':4}" + "".join(f"{d:>6}" for d in M.DECADAS))
    for cc in M.PAISES:
        print(f"{cc:4}" + "".join(f"{c[(cc, d)]:>6}" for d in M.DECADAS))
