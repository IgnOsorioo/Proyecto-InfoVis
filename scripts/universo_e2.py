"""E2 V4 — universo de álbumes: TODOS los álbumes con ventas certificadas en cada uno de los seis países.

Por qué (22-nov-2026, pedido del grupo): «quiero saber de todos los discos: suma las ventas de todos, después filtra
por género y hazme el top 5». Antes el universo eran los álbumes que llegaron al n.º 1 en algún país más las listas
de más vendidos, y quedaban fuera discos como «2001» de Dr. Dre (6 millones en EE. UU., n.º 2) o «The Chronic».

De dónde: la plantilla {{Certification Table Entry}} de Wikipedia pone cada artículo que la usa en una categoría por
país («Category:Certification Table Entry usages for United States»: 19 109 artículos; R. Unido 16 400, Canadá 9482,
Alemania 4719, Japón 2930, Suecia 2847; nov-2026). De esos artículos quedan los de álbumes (con {{Infobox album}});
las canciones se descartan.

Cómo, en pocas consultas (la API REST respondía 429 al pedir miles de artículos):
  1. categorías + qué artículos usan {{Infobox album}}: 500 artículos por consulta (generator=categorymembers);
  2. wikitexto de los álbumes, 50 por consulta: nombre, artista, tipo (studio, live, compilation…), año, géneros
     de la ficha y las entradas de certificación de los seis países;
  3. unidades: Wikipedia expande las entradas (action=expandtemplates, 200 por consulta) con sus propios umbrales
     por país y época (oro, platino…). «†» = solo streaming: no cuenta. Se queda la mayor cifra por país.

Cachés (fuera del repo, ~/InfoVis-datos/wikipedia_e2/): universo_titulos.json, universo_albumes.json,
universo_unidades.json.
Uso: 16_albumes_e2 llama a articulos(); solo, baja lo que falte y muestra la cobertura:
     uv run --with pandas --with lxml python scripts/universo_e2.py
"""
import hashlib, importlib, json, pathlib, re, sys, time, urllib.error, urllib.parse, urllib.request
from collections import Counter

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
M = importlib.import_module("16_albumes_e2")

BASE = M.BASE
UA = {"User-Agent": "infovis-student-research/1.0 (university course project)"}
REGIONES = {"us": "United States", "gb": "United Kingdom", "ca": "Canada", "de": "Germany", "jp": "Japan",
            "se": "Sweden"}
API = "https://en.wikipedia.org/w/api.php"
ENTRADA = re.compile(r"\{\{\s*[Cc]ertification[ _]Table[ _]Entry\b", re.S)


# Límite de Wikimedia (2026) para clientes sin contacto en el User-Agent: 10 consultas por minuto por IP.
PAUSA = 6.5
_ultima = [0.0]


def _api(params, post=False):
    datos = urllib.parse.urlencode({**params, "format": "json", "formatversion": 2})
    for i in range(10):
        time.sleep(max(0, _ultima[0] + PAUSA - time.time()))
        _ultima[0] = time.time()
        try:
            req = urllib.request.Request(API, data=datos.encode(), headers=UA) if post else \
                urllib.request.Request(API + "?" + datos, headers=UA)
            return json.loads(urllib.request.urlopen(req, timeout=120).read())
        except urllib.error.HTTPError as e:
            espera = int(e.headers.get("Retry-After") or 0) or 15 * (i + 1)
            print(f"  {e.code}: espero {espera} s", flush=True)
            time.sleep(espera)
        except Exception as e:
            print("  reintento", type(e).__name__, flush=True); time.sleep(15 * (i + 1))
    raise SystemExit("Wikipedia no responde")


def titulos():
    """{título: [países]} de los artículos de álbumes con certificación en alguno de los seis países."""
    f = BASE / "universo_titulos.json"
    if f.exists(): return json.loads(f.read_text())
    out = {}
    for cc, region in REGIONES.items():
        p = {"action": "query", "generator": "categorymembers", "gcmnamespace": 0, "gcmlimit": 500,
             "gcmtitle": f"Category:Certification Table Entry usages for {region}",
             "prop": "templates", "tltemplates": "Template:Infobox album", "tllimit": 500}
        n = 0
        while True:
            r = _api(p)
            for pg in r.get("query", {}).get("pages", []):
                if pg.get("templates"): out.setdefault(pg["title"], []).append(cc); n += 1
            if "continue" not in r: break
            p = {**p, **r["continue"]}
        print(f"  {cc}: {n} álbumes", flush=True)
    out = {t: sorted(set(v)) for t, v in out.items()}
    f.write_text(json.dumps(out, ensure_ascii=False))
    return out


def _campo(caja, nombre):
    m = re.search(r"\n\s*\|\s*" + nombre + r"\s*=([^\n]*)", caja, re.I)
    if not m: return ""
    v = re.sub(r"<!--.*?-->|<ref[^>]*/>|<ref.*?(</ref>|$)", "", m.group(1))
    v = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", v)                   # [[a|b]] → b
    v = re.sub(r"\{\{\s*(?:nowrap|lang\|\w+|nihongo\|)\|?([^{}|]*)[^{}]*\}\}", r"\1", v, flags=re.I)
    v = re.sub(r"\{\{[^{}]*\}\}|'''?|<[^>]+>", "", v)
    return re.sub(r"\s+", " ", v).strip(" ,")


def _crudo(caja, nombre):
    """Valor del campo sin limpiar (el año va dentro de {{Start date|1999|11|16}})."""
    m = re.search(r"\n\s*\|\s*" + nombre + r"\s*=([^\n]*)", caja, re.I)
    return re.sub(r"<ref.*?(</ref>|/>|$)", "", m.group(1)) if m else ""


def _plantillas(txt, inicio):
    """Textos completos de las plantillas que empiezan en las posiciones de `inicio` (respeta {{ }} anidados)."""
    out = []
    for m in inicio:
        i, prof = m.start(), 0
        for j in range(i, len(txt) - 1):
            if txt[j:j + 2] == "{{": prof += 1
            elif txt[j:j + 2] == "}}":
                prof -= 1
                if prof == 0: out.append(txt[i:j + 2]); break
    return out


def leer_album(titulo, txt):
    caja = (_plantillas(txt, re.finditer(r"\{\{\s*[Ii]nfobox album", txt)) or [""])[0]
    if not caja: return None
    entradas = []
    for e in _plantillas(txt, ENTRADA.finditer(txt)):
        reg = re.search(r"\|\s*region\s*=\s*([^|}\n]*)", e)
        tipo = re.search(r"\|\s*type\s*=\s*([^|}\n]*)", e)
        if not reg: continue
        cc = next((c for c, r in REGIONES.items() if reg.group(1).strip().startswith(r)), None)
        if cc and (not tipo or tipo.group(1).strip().lower() in ("album", "")):
            entradas.append([cc, e])
    return {"album": _campo(caja, "name") or re.sub(r"\s*\(.*?\)$", "", titulo),
            "artista": _campo(caja, "artist"), "tipo": (_campo(caja, "type") + " album").lower(),
            "anio": M._anio(_crudo(caja, "released")), "generos": M.generos_infobox(caja), "entradas": entradas}


def albumes(ts):
    f = BASE / "universo_albumes.json"
    out = json.loads(f.read_text()) if f.exists() else {}
    falta = [t for t in ts if t not in out]
    print(f"wikitexto: {len(ts)} álbumes, faltan {len(falta)}", flush=True)
    for i in range(0, len(falta), 50):
        lote = falta[i:i + 50]
        r = _api({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
                  "titles": "|".join(lote)}, post=True)
        for pg in r["query"]["pages"]:
            txt = pg["revisions"][0]["slots"]["main"]["content"] if "revisions" in pg else ""
            out[pg["title"]] = leer_album(pg["title"], txt) if txt else None
        for t in lote: out.setdefault(t, None)
        if (i // 50) % 10 == 0:
            f.write_text(json.dumps(out, ensure_ascii=False)); print(f"  {i + len(lote)}/{len(falta)}", flush=True)
    f.write_text(json.dumps(out, ensure_ascii=False))
    return out


def _clave(e): return hashlib.sha1(e.encode()).hexdigest()[:16]


def unidades(A):
    """{clave de la entrada: unidades (0 si es solo streaming o no se pudo calcular)}."""
    f = BASE / "universo_unidades.json"
    out = json.loads(f.read_text()) if f.exists() else {}
    todas = {_clave(e): e for x in A.values() if x for _, e in x["entradas"]}
    falta = [k for k in todas if k not in out]
    print(f"unidades: {len(todas)} certificaciones, faltan {len(falta)}", flush=True)
    for i in range(0, len(falta), 200):
        lote = falta[i:i + 200]
        txt = "\n".join(f"<<{k}>>{re.sub(r'<ref[^>]*/>|<ref.*?</ref>', '', todas[k], flags=re.S)}" for k in lote)
        r = _api({"action": "expandtemplates", "text": txt, "prop": "wikitext", "title": "Rumours"}, post=True)
        exp = r.get("expandtemplates", {}).get("wikitext", "")
        for k, bloque in re.findall(r"<<(\w{16})>>(.*?)(?=<<\w{16}>>|\Z)", exp, re.S):
            celdas = [c.strip() for c in re.findall(r"\n\|([^\n]*)", bloque)]
            u = 0
            if len(celdas) >= 2 and "†" not in celdas[1]:
                m = re.search(r"\d{1,3}(?:,\d{3})+|\d{4,}", re.sub(r"<[^>]*>|\[\[[^\]]*\]\]", "", celdas[1]))
                u = int(m.group(0).replace(",", "")) if m else 0
            out[k] = u
        for k in lote: out.setdefault(k, 0)
        if (i // 200) % 5 == 0:
            f.write_text(json.dumps(out)); print(f"  {i + len(lote)}/{len(falta)}", flush=True)
    f.write_text(json.dumps(out))
    return out


def articulos():
    """→ (A, nombres): A con el mismo formato que articulos.json ({título: {anio, generos, ventas, tipo}}) y
    nombres = {título: (álbum, artista, None)} para albumes_por_pais."""
    T = titulos()
    X = albumes(sorted(T))
    U = unidades(X)
    A, N = {}, {}
    for t, x in X.items():
        if not x: continue
        ventas = {}
        for cc, e in x["entradas"]:
            u = U.get(_clave(e), 0)
            if u: ventas[cc] = max(ventas.get(cc, 0), u)
        if not ventas: continue
        A[t] = {"anio": x["anio"], "generos": x["generos"], "ventas": ventas, "tipo": x["tipo"]}
        N[t] = (x["album"], x["artista"], None)
    return A, N


if __name__ == "__main__":
    A, N = articulos()
    c = Counter((cc, x["anio"] // 10 * 10) for x in A.values() if x["anio"] for cc in x["ventas"])
    print(f"{len(A)} álbumes con ventas\n{'':4}" + "".join(f"{d:>7}" for d in M.DECADAS))
    for cc in M.PAISES:
        print(f"{cc:4}" + "".join(f"{c[(cc, d)]:>7}" for d in M.DECADAS))
