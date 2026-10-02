"""Busca cada canción #1 en Deezer y guarda su id para reproducir el preview de 30 s en el mapa.

Salida: datos/deezer.js  (window.DEEZER = [deezer_id o 0, …], alineado con window.CANCIONES)
La búsqueda avanzada artist:"..." de Deezer devuelve 0 resultados, así que se usa búsqueda libre
"artista título" y se valida que el artista coincida. Los resultados se guardan en caché, así que
volver a correr el script solo consulta canciones nuevas.

Uso: python scripts/03_deezer.py   (después de 02_construir_datos.py)
"""
import json
import re
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor

import requests

from config import RAW_DIR, WEB_DATA_DIR

CACHE = RAW_DIR / "deezer_cache.json"
HILOS = 6                 # cada consulta tarda ~1 s: en paralelo va mucho más rápido
INTERVALO = 0.125         # Deezer permite 50 consultas cada 5 s; como máximo ~8 por segundo en total
_candado = threading.Lock()
_ultima = [0.0]


def esperar_turno():
    """Limitador compartido entre hilos para no pasar el máximo de consultas por segundo."""
    with _candado:
        espera = _ultima[0] + INTERVALO - time.monotonic()
        if espera > 0:
            time.sleep(espera)
        _ultima[0] = time.monotonic()


def normalizar(texto):
    texto = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]", "", texto).strip()


def titulo_base(titulo):
    """'Despacito - Remix' -> 'Despacito'; 'Tusa (feat. Nicki Minaj)' -> 'Tusa'."""
    return re.sub(r"\s*[\(\[].*?[\)\]]", "", titulo).split(" - ")[0].strip()


def buscar(titulo, artista):
    base = titulo_base(titulo) or titulo
    esperar_turno()
    r = requests.get("https://api.deezer.com/search", params={"q": f"{artista} {base}", "limit": 10}, timeout=15)
    r.raise_for_status()
    candidatos = r.json().get("data", [])
    artista_n, base_n = normalizar(artista), normalizar(base)
    for x in candidatos:
        if normalizar(x["artist"]["name"]) == artista_n and normalizar(x["title"]).startswith(base_n):
            return x["id"]
    for x in candidatos:   # respaldo: coincide el artista aunque el título varíe (acentos, versiones)
        nombre = normalizar(x["artist"]["name"])
        if nombre and (artista_n in nombre or nombre in artista_n):
            return x["id"]
    return None


def leer_global(archivo, nombre):
    """Los .js de datos tienen una línea por variable: 'window.NOMBRE = <json>;'."""
    linea = next(l for l in archivo.read_text().splitlines() if l.startswith(f"window.{nombre} ="))
    return json.loads(linea.split("=", 1)[1].strip().rstrip(";"))


canciones = leer_global(WEB_DATA_DIR / "canciones.js", "CANCIONES")
cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
pendientes = [c for c in canciones if c[0] not in cache]
print(f"{len(canciones)} canciones, {len(pendientes)} por buscar en Deezer", flush=True)


def procesar(c):
    track_id, titulo, artistas = c[0], c[1], c[2]
    try:
        return track_id, buscar(titulo, artistas.split(", ")[0])
    except requests.RequestException as e:
        print(f"  error con {titulo}: {e}", flush=True)
        return track_id, "error"


with ThreadPoolExecutor(HILOS) as pool:
    for i, (track_id, deezer_id) in enumerate(pool.map(procesar, pendientes), 1):
        if deezer_id != "error":          # los errores se reintentan en la próxima corrida
            cache[track_id] = deezer_id
        if i % 500 == 0:
            CACHE.write_text(json.dumps(cache))
            print(f"  {i}/{len(pendientes)}", flush=True)
CACHE.write_text(json.dumps(cache))

deezer = [cache.get(c[0]) or 0 for c in canciones]
(WEB_DATA_DIR / "deezer.js").write_text(f"window.DEEZER = {json.dumps(deezer, separators=(',', ':'))};\n")
encontradas = sum(1 for d in deezer if d)
print(f"Encontradas {encontradas}/{len(canciones)} ({encontradas / len(canciones):.0%}).")
