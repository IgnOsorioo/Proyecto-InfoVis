"""Exporta la tabla álbum–país de la E2 (V4) a datos/e2/albumes_e2.csv (24-nov).

Es la misma tabla con que 16_albumes_e2.py calcula decadas.js (cuota de cada género y top 5), pero completa: una
fila por álbum y país donde está certificado. Lee todo de los cachés de ~/InfoVis-datos/wikipedia_e2 (no consulta
la red ni reescribe decadas.js). Solo entran las filas que cuentan en la visualización: con año entre 1970 y 2029 y
con género (los álbumes sin género no cuentan, ver generos_deezer_e2.py).

Uso: uv run --with lxml python scripts/exportar_albumes_e2.py
"""
import csv, importlib.util, json, pathlib, sys

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
spec = importlib.util.spec_from_file_location("albumes_e2", AQUI / "16_albumes_e2.py")
M = importlib.util.module_from_spec(spec); spec.loader.exec_module(M)
import artistas_e2, bsa_e2, canada_e2, generos_deezer_e2, universo_e2

S = json.loads((M.BASE / "semanas.json").read_text())
G = json.loads((M.BASE / "generos.json").read_text())
A = json.loads((M.BASE / "articulos.json").read_text())
L = M.listas_mas_vendidos() + bsa_e2.filas()
for t, u in canada_e2.ventas(A).items():
    if A.get(t): A[t]["ventas"]["ca"] = u
A2, N2 = universo_e2.articulos()
for t, x in A2.items():
    if A.get(t):
        for cc, u in x["ventas"].items(): A[t]["ventas"][cc] = max(A[t]["ventas"].get(cc, 0), u)
        A[t]["generos"] = A[t].get("generos") or x["generos"]
        A[t]["anio"] = A[t].get("anio") or x["anio"]
        A[t]["tipo"] = A[t].get("tipo") or x["tipo"]
    else:
        A[t] = x
GA = artistas_e2.por_album([t for t, x in A.items() if x], N2)
P = M.albumes_por_pais(S, G, A, L, N2, GA)
generos_deezer_e2.aplicar(P)

NOMBRE = {"us": "Estados Unidos", "gb": "Reino Unido", "ca": "Canadá", "jp": "Japón", "de": "Alemania", "se": "Suecia"}
filas = []
for cc in M.PAISES:
    for x in P[cc].values():
        if not x["anio"] or not x["familia"] or not (M.DECADAS[0] <= x["anio"] < M.DECADAS[-1] + 10): continue
        filas.append({"pais": NOMBRE[cc], "codigo_pais": cc, "decada": x["anio"] // 10 * 10, "anio": x["anio"],
                      "album": x["album"], "artista": x["artista"], "genero": x["familia"],
                      "unidades_certificadas": round(x["unidades"]), "fuente": x.get("fuente", "")})
filas.sort(key=lambda f: (M.PAISES.index(f["codigo_pais"]), f["decada"], -f["unidades_certificadas"]))
out = M.REPO / "datos" / "e2" / "albumes_e2.csv"
with out.open("w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(filas[0])); w.writeheader(); w.writerows(filas)
print("→", out.relative_to(M.REPO), len(filas), "filas")
