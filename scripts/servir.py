"""Sirve la visualización en http://localhost:8000 sin caché.

`python3 -m http.server` deja que el navegador reutilice CSS y JS viejos, y al cambiar el código
se mezcla la página nueva con archivos antiguos. Este servidor pide al navegador no guardar nada,
así que siempre se ve la última versión.

Uso: python3 scripts/servir.py   (Ctrl+C para detenerlo)
"""
import functools
import http.server
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PUERTO = 8000


class SinCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    servidor = http.server.ThreadingHTTPServer(("127.0.0.1", PUERTO), functools.partial(SinCache, directory=RAIZ))
    print(f"Sirviendo {RAIZ.name} en http://localhost:{PUERTO} (sin caché). Ctrl+C para detener.")
    servidor.serve_forever()
