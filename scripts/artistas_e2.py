"""E2 V4 — género por ARTISTA: cada álbum toma los géneros de la ficha de Wikipedia de su intérprete.

Por qué (22-nov-2026, reclamo del grupo: «es estúpido que Rauw Alejandro figure en electrónica; ¿dónde está la
verdadera electrónica?»). Con los géneros de la ficha del ÁLBUM, el disco cae donde cae su sonido de ese año:
«Saturno» de Rauw Alejandro empieza por «Miami bass» → electrónica; «Pure Heroine» (Lorde), «Ghost Stories»
(Coldplay), «Kid A» (Radiohead) y «Ray of Light» (Madonna) también, y al revés «Random Access Memories» de Daft
Punk empieza por «Disco» → pop. La ficha del ARTISTA describe quién es: Madonna = pop, Coldplay = rock,
Rauw Alejandro = reguetón (otro), Daft Punk = French house (electrónica), Skrillex = EDM.

Cómo:
  1. quién canta cada álbum: Wikidata (intérprete, P175) → artículo del artista en Wikipedia en inglés.
     Consulta SPARQL, 300 álbumes por consulta. Si hay varios intérpretes, el que aparece primero en el campo
     «artist» de la ficha del álbum. «Various Artists» y elencos no cuentan (el álbum usa sus propios géneros).
  2. géneros del artista: campo «genre» de su ficha (sección 0 del wikitexto, 50 artistas por consulta).

Cachés (~/InfoVis-datos/wikipedia_e2/): artistas_de_album.json, artistas_generos.json.
Uso: 16_albumes_e2 llama a por_album(titulos, nombres). Solo:  python3 scripts/artistas_e2.py
"""
import importlib, json, pathlib, re, sys, unicodedata, urllib.parse, urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
M = importlib.import_module("16_albumes_e2")
U = importlib.import_module("universo_e2")

BASE = M.BASE
UA = {"User-Agent": "infovis-student-research/1.0 (university course project)",
      "Accept": "application/sparql-results+json"}
NO_ARTISTA = re.compile(r"various artists|^cast\b|original (broadway |london )?cast|soundtrack", re.I)


def interpretes(titulos):
    """{título del álbum: [artículos de sus intérpretes]}."""
    f = BASE / "artistas_de_album.json"
    out = json.loads(f.read_text()) if f.exists() else {}
    falta = [t for t in titulos if t not in out]
    print(f"intérpretes: {len(titulos)} álbumes, faltan {len(falta)}", flush=True)
    for i in range(0, len(falta), 300):
        lote = falta[i:i + 300]
        vals = " ".join(json.dumps(t, ensure_ascii=False) + "@en" for t in lote)
        q = f"""SELECT ?t ?ap WHERE {{ VALUES ?t {{ {vals} }}
          ?a schema:name ?t; schema:isPartOf <https://en.wikipedia.org/>; schema:about ?alb.
          ?alb wdt:P175 ?per. ?ap schema:about ?per; schema:isPartOf <https://en.wikipedia.org/>. }}"""
        for intento in range(5):
            try:
                r = json.load(urllib.request.urlopen(urllib.request.Request(
                    "https://query.wikidata.org/sparql", data=urllib.parse.urlencode({"query": q}).encode(),
                    headers=UA), timeout=120))
                break
            except Exception as e:
                print("  reintento", type(e).__name__, flush=True); __import__("time").sleep(20 * (intento + 1))
        else:
            raise SystemExit("Wikidata no responde")
        for t in lote: out.setdefault(t, [])
        for b in r["results"]["bindings"]:
            a = urllib.parse.unquote(b["ap"]["value"].split("/wiki/", 1)[1]).replace("_", " ")
            if a not in out[b["t"]["value"]]: out[b["t"]["value"]].append(a)
        f.write_text(json.dumps(out, ensure_ascii=False))
        print(f"  {i + len(lote)}/{len(falta)}", flush=True)
    return out


def generos(artistas):
    """{artículo del artista: géneros de su ficha, en orden}."""
    f = BASE / "artistas_generos.json"
    out = json.loads(f.read_text()) if f.exists() else {}
    falta = sorted(a for a in artistas if a not in out)
    print(f"géneros de artistas: {len(artistas)}, faltan {len(falta)}", flush=True)
    for i in range(0, len(falta), 50):
        lote = falta[i:i + 50]
        r = U._api({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
                    "rvsection": 0, "redirects": 1, "titles": "|".join(lote)}, post=True)["query"]
        pedido = {t: t for t in lote}                                  # título final → título pedido
        for x in r.get("normalized", []): pedido[x["to"]] = x["from"]
        for x in r.get("redirects", []): pedido[x["to"]] = pedido.get(x["from"], x["from"])
        for pg in r["pages"]:
            txt = pg["revisions"][0]["slots"]["main"]["content"] if "revisions" in pg else ""
            out[pedido.get(pg["title"], pg["title"])] = M.generos_infobox(txt) if txt else []
        for t in lote: out.setdefault(t, [])
        if (i // 50) % 10 == 0:
            f.write_text(json.dumps(out, ensure_ascii=False)); print(f"  {i + len(lote)}/{len(falta)}", flush=True)
    f.write_text(json.dumps(out, ensure_ascii=False))
    return out


def _n(s):
    s = unicodedata.normalize("NFKD", s.lower())
    return re.sub(r"[^\w]+", " ", "".join(c for c in s if not unicodedata.combining(c))).strip()


def por_album(titulos, nombres=None):
    """{título del álbum: géneros de su artista} (solo los que tienen artista con géneros)."""
    nombres = nombres or {}
    I = interpretes(sorted(titulos))
    G = generos({a for v in I.values() for a in v if not NO_ARTISTA.search(a)}
                | {n[1] for t, n in nombres.items() if not I.get(t) and n[1] and not NO_ARTISTA.search(n[1])})
    out = {}
    for t, arts in I.items():
        arts = [a for a in arts if G.get(a) and not NO_ARTISTA.search(a)]
        if not arts and nombres.get(t, ("", ""))[1] in G:    # Wikidata sin intérprete: el artista por su nombre
            arts = [nombres[t][1]] if G[nombres[t][1]] else []
        if not arts: continue
        campo = _n(nombres.get(t, ("", ""))[1] or "")
        arts.sort(key=lambda a: (campo.find(_n(re.sub(r"\s*\(.*\)$", "", a))) % 10_000, a))  # −1 → al final
        out[t] = [g for g in G[arts[0]] if not M.es_relleno(g)]
    return out


if __name__ == "__main__":
    A2, N2 = U.articulos()
    A = json.loads((BASE / "articulos.json").read_text())
    R = por_album(set(A2) | {t for t, x in A.items() if x}, N2)
    print(len(R), "álbumes con géneros de artista")
