"""Descarga el chart de canciones de QQ Music (China) con su historia: el 热歌榜 (topId 26).

QQ Music no tiene API pública documentada; esto usa el endpoint web que alimenta su sitio (sin cuenta ni
credenciales). Guarda el top 10 de cada período:
  - semanal de la semana 1 de 2018 a la 25 de 2022 (período "AAAA_S"),
  - diario desde el 13-jul-2022 (primer día con chart diario) hasta FIN.
Si se pide un período que no existe, el sitio devuelve el chart de hoy: esos se descartan (se reconoce porque
el período devuelto no es el pedido).

Va despacio (pocas consultas a la vez, con pausa) y se puede cortar y retomar: lo ya descargado no se vuelve a pedir.

Salida: INFOVIS_EXTRA_DIR/charts_extra/qq/{semanal,diario}.jsonl (fuera del repo, como las otras descargas),
una línea por período: {"periodo": "2019_30" | "2023-03-10", "filas": [[puesto, título, artistas, portada], …]}

Uso: python scripts/12_descargar_qq.py
"""
import datetime as dt
import json
from concurrent.futures import ThreadPoolExecutor
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

SALIDA = Path(os.environ.get("INFOVIS_EXTRA_DIR", Path.home() / "InfoVis-datos")) / "charts_extra" / "qq"
URL = "https://u.y.qq.com/cgi-bin/musicu.fcg"
TOP_ID = 26                                  # 热歌榜 (canciones más escuchadas)
FIN = dt.date(2026, 9, 27)                   # el último día de los demás datos de la V3
PAUSA_S = 1.0
EN_PARALELO = 3
INICIO_DIARIO = dt.date(2022, 7, 13)


def pedir(periodo):
    datos = {"detail": {"module": "musicToplist.ToplistInfoServer", "method": "GetDetail",
                        "param": {"topId": TOP_ID, "offset": 0, "num": 10, "period": periodo}}}
    url = f"{URL}?{urllib.parse.urlencode({'data': json.dumps(datos, ensure_ascii=False)})}"
    for intento in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=20) as r:
                return json.load(r)["detail"]["data"].get("data", {})
        except Exception:
            time.sleep(5 * (intento + 1))
    return None


def portada(s):
    """La del chart; si no viene, la del álbum (la misma dirección que usa el sitio de QQ Music)."""
    if s.get("cover"):
        return s["cover"]
    return f"https://y.gtimg.cn/music/photo_new/T002R300x300M000{s['albumMid']}.jpg" if s.get("albumMid") else ""


def reparar_portadas(nombre):
    """Vuelve a pedir solo los períodos con alguna portada vacía en su top 3 (descargas anteriores no la guardaban)."""
    ruta = SALIDA / f"{nombre}.jsonl"
    if not ruta.exists():
        return
    lineas = [json.loads(l) for l in ruta.open(encoding="utf-8")]
    malas = [i for i, l in enumerate(lineas) if l["periodo"] and any(not f[3] for f in l["filas"][:3])]

    def uno(i):
        d = pedir(lineas[i]["pedido"])
        time.sleep(PAUSA_S)
        return i, d

    with ThreadPoolExecutor(EN_PARALELO) as grupo:
        for i, d in grupo.map(uno, malas):
            if d and mismo(lineas[i]["pedido"], d.get("period")):
                portadas = [portada(s) for s in d.get("song", [])]
                for fila, p in zip(lineas[i]["filas"], portadas):
                    fila[3] = fila[3] or p
    ruta.write_text("".join(json.dumps(l, ensure_ascii=False) + "\n" for l in lineas), encoding="utf-8")
    print(f"{nombre}: portadas reparadas en {len(malas)} períodos")


def mismo(pedido, devuelto):
    """El sitio escribe "2018_1" para "2018_01": se comparan sin ceros a la izquierda."""
    norm = lambda p: "_".join(str(int(x)) for x in p.split("_")) if "_" in p else p
    return devuelto is not None and norm(pedido) == norm(devuelto)


def descargar(nombre, periodos):
    ruta = SALIDA / f"{nombre}.jsonl"
    hechos = set()
    if ruta.exists():
        hechos = {json.loads(l)["pedido"] for l in ruta.open(encoding="utf-8")}
    pendientes = [p for p in periodos if p not in hechos]

    def uno(periodo):
        d = pedir(periodo)
        time.sleep(PAUSA_S)
        return periodo, d

    nuevos = 0
    with ruta.open("a", encoding="utf-8") as f, ThreadPoolExecutor(EN_PARALELO) as grupo:
        for periodo, d in grupo.map(uno, pendientes):
            if d is None:
                print("sin respuesta:", periodo)
                continue
            valido = mismo(periodo, d.get("period"))
            filas = [[s.get("rank", i + 1), s.get("title", ""), s.get("singerName", ""), portada(s)]
                     for i, s in enumerate(d.get("song", []))] if valido else []
            f.write(json.dumps({"pedido": periodo, "periodo": d.get("period") if valido else None, "filas": filas},
                               ensure_ascii=False) + "\n")
            f.flush()
            nuevos += 1
    print(f"{nombre}: {nuevos} pedidos nuevos")


SALIDA.mkdir(parents=True, exist_ok=True)
descargar("semanal", [f"{a}_{s:02d}" for a in range(2018, 2023) for s in range(1, 54)])
dias = (FIN - INICIO_DIARIO).days + 1
descargar("diario", [(INICIO_DIARIO + dt.timedelta(days=i)).isoformat() for i in range(dias)])
for nombre in ("semanal", "diario"):
    reparar_portadas(nombre)
for nombre in ("semanal", "diario"):
    lineas = [json.loads(l) for l in (SALIDA / f"{nombre}.jsonl").open(encoding="utf-8")]
    validos = sorted(l["periodo"] for l in lineas if l["periodo"])
    print(f"{nombre}: {len(validos)} períodos con chart propio, de {validos[0] if validos else '—'} a {validos[-1] if validos else '—'}")
