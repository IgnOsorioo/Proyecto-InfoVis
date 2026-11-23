"""E2 V4 — ventas de álbumes en Canadá: certificaciones de Music Canada leídas del wikitexto de cada artículo.

Por qué Canadá (21-nov-2026): el grupo pidió seis países con registros completos y Argentina no los tiene (CAPIF
retiró su base de certificaciones en 2011: 2010–2019 queda con 12 álbumes y 2020–2029 con uno). Se contaron los
álbumes con certificación en cada década entre los 3050 artículos del pipeline, para varios candidatos:

                1970  1980  1990  2000  2010  2020
    Canadá       101   144   236   252   245    97   ← el único completo y parejo
    Australia     79   108   202   258   186    50
    Francia       57   103   143   147   133    91
    Brasil        10    39    93    90    90    43
    Argentina     17    24   105    99    13     1

Cómo: la API REST de Wikipedia (la que usa etapa_articulos) responde 429 si se piden miles de artículos, así que
aquí se pide el wikitexto con la API de acción, de a 50 artículos por consulta, y se leen las plantillas
{{Certification Table Entry|region=Canada|award=Platinum|number=6|relyear=1977|...}}.
Unidades: las mismas que calcula la plantilla (Template:Certification Table Entry/Sales):
  álbumes lanzados antes de mayo de 2008: Oro 50 000 · Platino 100 000 · Diamante 1 000 000;
  desde mayo de 2008:                      Oro 40 000 · Platino  80 000 · Diamante   800 000.
Si la entrada trae «salesamount» (cifra de ventas citada), se usa esa.

Caché: ~/InfoVis-datos/wikipedia_e2/certificaciones_wikitexto.json  (título → lista de entradas de la plantilla)
Uso: 16_albumes_e2 llama a ventas(A) y suma ventas["ca"] a cada artículo. Solo, baja lo que falte:
     python3 scripts/canada_e2.py
"""
import json, pathlib, re, time, urllib.parse, urllib.request

BASE = pathlib.Path.home() / "InfoVis-datos" / "wikipedia_e2"
CACHE = BASE / "certificaciones_wikitexto.json"
UA = {"User-Agent": "infovis-student-research/1.0 (university course project)"}
ENTRADA = re.compile(r"\{\{\s*[Cc]ertification[ _]Table[ _]Entry(.*?)(?=\{\{\s*[Cc]ertification[ _]Table|\Z)", re.S)


def _campos(s):
    s = re.sub(r"<ref[^>]*/>|<ref.*?</ref>", "", s, flags=re.S)       # las referencias traen sus propios «|»
    d = {}
    for m in re.finditer(r"\|\s*([a-z0-9_-]+)\s*=\s*([^|}]*)", s):
        d.setdefault(m.group(1), m.group(2).strip())
    return d


def descargar(titulos):
    """Wikitexto de los artículos que falten en la caché (50 por consulta) → entradas de certificación."""
    out = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    falta = [t for t in titulos if t not in out]
    for i in range(0, len(falta), 50):
        lote = falta[i:i + 50]
        q = urllib.parse.urlencode({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
                                    "titles": "|".join(lote), "redirects": 1, "format": "json", "formatversion": 2})
        for intento in range(6):
            try:
                d = json.loads(urllib.request.urlopen(urllib.request.Request(
                    "https://en.wikipedia.org/w/api.php?" + q, headers=UA), timeout=60).read())
                break
            except Exception as e:
                print("reintento", e, flush=True); time.sleep(30 * (intento + 1))
        else:
            raise SystemExit("Wikipedia no responde")
        pedido = {t: t for t in lote}                                  # título final → título pedido
        for r in d["query"].get("normalized", []): pedido[r["to"]] = r["from"]
        for r in d["query"].get("redirects", []): pedido[r["to"]] = pedido.get(r["from"], r["from"])
        for p in d["query"]["pages"]:
            t = pedido.get(p["title"], p["title"])
            txt = p["revisions"][0]["slots"]["main"]["content"] if "revisions" in p else ""
            out[t] = [_campos(m.group(1)) for m in ENTRADA.finditer(txt)]
        for t in lote: out.setdefault(t, [])
        CACHE.write_text(json.dumps(out, ensure_ascii=False))
        print(f"  wikitexto {i + len(lote)}/{len(falta)}", flush=True)
        time.sleep(3)
    return out


def _entero(s):
    m = re.search(r"\d{1,3}(?:[,.]\d{3})+|\d+", s or "")
    return int(re.sub(r"[,.]", "", m.group(0))) if m else 0


def unidades(e, anio=None):
    """Unidades de una entrada de Canadá (álbum), como las calcula la plantilla de Wikipedia."""
    if e.get("salesamount"): return _entero(e["salesamount"])
    y = _entero(e.get("relyear")) or anio
    if not y: return 0
    nuevo = y > 2008 or y == 2008 and _entero(e.get("relmonth")) >= 5
    oro, plat, diam = (40_000, 80_000, 800_000) if nuevo else (50_000, 100_000, 1_000_000)
    n = _entero(e.get("number")) or 1
    return {"Gold": n * oro, "Platinum": n * plat, "Diamond": n * diam,
            "Platinum+Gold": n * plat + oro, "Diamond+Platinum": n * diam + plat,
            "Diamond+Gold": n * diam + oro}.get(e.get("award", "").strip(), 0)


def ventas(A):
    """{título del artículo: unidades en Canadá} (la mayor entre sus entradas de álbum; videos y sencillos no)."""
    C = descargar(sorted(A))
    out = {}
    for t, es in C.items():
        anio = (A.get(t) or {}).get("anio")
        for e in es:
            if not e.get("region", "").startswith("Canada") or e.get("type", "album") not in ("album", ""): continue
            if e.get("streamsonly") or e.get("nocert") and not e.get("salesamount"): continue
            u = unidades(e, anio)
            if u: out[t] = max(out.get(t, 0), u)
    return out


if __name__ == "__main__":
    A = json.loads((BASE / "articulos.json").read_text())
    V = ventas(A)
    print(len(V), "álbumes con certificación en Canadá;", f"{sum(V.values()) / 1e6:.0f} M de unidades")
