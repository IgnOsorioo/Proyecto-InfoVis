"""Prepara el mapa base desde Natural Earth 1:50m (dominio público, repositorio oficial).

- Separa los territorios de ultramar de Francia y Países Bajos: Natural Earth los incluye en el
  polígono del país, y pintarlos con el chart de Francia (p. ej. la Guayana Francesa en Sudamérica)
  confunde. Spotify no publica un chart propio para ellos.
- Simplifica las formas (Ramer-Douglas-Peucker) y redondea coordenadas para que el archivo sea liviano.

Salida: datos/mundo.js  (window.MUNDO = FeatureCollection con properties {iso3, nombre, nota?})
Uso: python scripts/04_mapa_mundial.py
"""
import json
import math
import urllib.request

from config import RAW_DIR, WEB_DATA_DIR

URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson"
ARCHIVO = RAW_DIR / "ne_50m_admin_0_countries.geojson"
TOLERANCIA = 0.025      # grados (~2,5 km): imperceptible en el globo completo
DECIMALES = 3

# Parte metropolitana (lon_min, lon_max, lat_min, lat_max) y territorios de ultramar (código, nombre, lon, lat).
METROPOLI = {"FRA": (-6, 10, 41, 52), "NLD": (3, 8, 50, 54)}
ULTRAMAR = {
    "FRA": [("GUF", "Guayana Francesa", -53.3, 3.5), ("GLP", "Guadalupe", -61.5, 16.2),
            ("MTQ", "Martinica", -61.0, 14.6), ("REU", "Reunión", 55.6, -21.1), ("MYT", "Mayotte", 45.1, -12.8)],
    "NLD": [("BES", "Caribe Neerlandés", -66.0, 13.0)],
}
SOBERANO = {"FRA": "Francia", "NLD": "Países Bajos"}


def rdp(puntos, tol):
    """Simplificación de Ramer-Douglas-Peucker (iterativa) de un anillo o línea."""
    if len(puntos) < 5:
        return puntos
    conservar = [False] * len(puntos)
    conservar[0] = conservar[-1] = True
    pila = [(0, len(puntos) - 1)]
    while pila:
        a, b = pila.pop()
        (x1, y1), (x2, y2) = puntos[a], puntos[b]
        dx, dy = x2 - x1, y2 - y1
        largo = math.hypot(dx, dy) or 1e-12
        peor, idx = 0.0, None
        for i in range(a + 1, b):
            x, y = puntos[i]
            d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / largo
            if d > peor:
                peor, idx = d, i
        if idx is not None and peor > tol:
            conservar[idx] = True
            pila += [(a, idx), (idx, b)]
    return [p for p, k in zip(puntos, conservar) if k]


def simplificar_anillo(anillo):
    """El anillo es cerrado (primer punto = último): se parte en el punto más lejano al inicio
    y se simplifica cada mitad; si no, RDP ve una línea de largo cero y lo colapsa."""
    x0, y0 = anillo[0]
    k = max(range(len(anillo)), key=lambda i: (anillo[i][0] - x0) ** 2 + (anillo[i][1] - y0) ** 2)
    nuevo = rdp(anillo[:k + 1], TOLERANCIA)[:-1] + rdp(anillo[k:], TOLERANCIA) if k > 0 else anillo
    if len(nuevo) < 4:                    # islas pequeñas: se conserva la forma original
        nuevo = anillo
    return [[round(x, DECIMALES), round(y, DECIMALES)] for x, y in nuevo]


def poligonos(geom):
    return geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]


def centro(poligono):
    anillo = poligono[0]
    return sum(p[0] for p in anillo) / len(anillo), sum(p[1] for p in anillo) / len(anillo)


def feature(iso3, nombre, polys, nota=None):
    props = {"iso3": iso3, "nombre": nombre}
    if nota:
        props["nota"] = nota
    polys = [[simplificar_anillo(anillo) for anillo in p] for p in polys]
    geom = {"type": "MultiPolygon", "coordinates": polys} if len(polys) > 1 else {"type": "Polygon", "coordinates": polys[0]}
    return {"type": "Feature", "properties": props, "geometry": geom}


if not ARCHIVO.exists():
    urllib.request.urlretrieve(URL, ARCHIVO)
ne = json.load(open(ARCHIVO, encoding="utf-8"))

salida = []
for f in ne["features"]:
    p = f["properties"]
    iso3 = p["ADM0_A3"]   # único por entidad (ISO_A3_EH repite AUS en dependencias australianas)
    nombre = p.get("NAME_ES") or p["ADMIN"]
    polys = poligonos(f["geometry"])
    if p["ADM0_A3"] not in METROPOLI:
        salida.append(feature(iso3, nombre, polys))
        continue
    # Separar metrópoli y ultramar según dónde cae cada polígono.
    lon0, lon1, lat0, lat1 = METROPOLI[p["ADM0_A3"]]
    metro, territorios = [], {}
    for poly in polys:
        x, y = centro(poly)
        if lon0 <= x <= lon1 and lat0 <= y <= lat1:
            metro.append(poly)
        else:
            cod = min(ULTRAMAR[p["ADM0_A3"]], key=lambda t: math.hypot(t[2] - x, t[3] - y))
            territorios.setdefault(cod, []).append(poly)
    salida.append(feature(iso3, nombre, metro))
    for (cod, nom, _, _), ps in territorios.items():
        nota = f"Territorio de ultramar de {SOBERANO[p['ADM0_A3']]}. Spotify no publica un chart propio para este territorio."
        salida.append(feature(cod, nom, ps, nota))

mundo = {"type": "FeatureCollection", "features": salida}
texto = json.dumps(mundo, ensure_ascii=False, separators=(",", ":"))
(WEB_DATA_DIR / "mundo.js").write_text(f"window.MUNDO = {texto};\n", encoding="utf-8")
puntos = texto.count("],[") + len(salida)
print(f"{len(salida)} países y territorios, ≈{puntos:,} puntos, {len(texto) / 1e3:.0f} KB → datos/mundo.js")
