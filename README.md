# ¿Qué escucha el mundo?

Mapa interactivo y sonoro del #1 musical de cada país, de mayo de 2015 a septiembre de 2026. Muestra la canción más escuchada del mundo y la de cada país, y cuántos países coinciden con el mundo: en el mapa, verde si el país escucha el #1 global, gris si escucha otra canción y vacío si no hay datos. Suena el #1 de lo que se mira y aplaude una persona por cada país donde esa canción es #1. Al explorar aparece la tendencia: cada vez menos países coinciden con el #1 global (51 % en 2015 → 12 % en 2026).

Grupo 31 · Entrega 1 de IIC2026 Visualización de Información (PUC) · Felipe Ignacio Cortés Cortés, José Tomás Larraín Vial e Ignacio Andrés Osorio Orellana.

**Versión final:** https://ignosorioo.github.io/Proyecto-InfoVis/v4/ · **Todas las versiones:** https://ignosorioo.github.io/Proyecto-InfoVis/

## Las cuatro versiones

La Entrega 1 se evalúa por proceso: cada versión queda navegable, con su tag, su registro y su video.

| Versión | Fecha | Tag → commit | En línea | Video | Registro |
|---|---|---|---|---|---|
| V1 — la idea completa | 2-oct-2026 | `v1` → `ead22c5` | [/v1/](https://ignosorioo.github.io/Proyecto-InfoVis/v1/) | [YouTube](https://www.youtube.com/watch?v=byQVqgL1buQ) | [v1/README.md](v1/README.md) |
| V2 — primera iteración de diseño | 8-oct-2026 | `v2` → `a4ad3d9` | [/v2/](https://ignosorioo.github.io/Proyecto-InfoVis/v2/) | [YouTube](https://www.youtube.com/watch?v=bmM4CkWyvt8) | [v2/README.md](v2/README.md) |
| V3 — segunda iteración de diseño | 16-oct-2026 | `v3` → `2b2223b` | [/v3/](https://ignosorioo.github.io/Proyecto-InfoVis/v3/) | [YouTube](https://youtu.be/ykCwCJUP4nQ) | [v3/README.md](v3/README.md) |
| V4 — la versión final | 22-oct-2026 | `v4` → `24633c5` | [/v4/](https://ignosorioo.github.io/Proyecto-InfoVis/v4/) | [YouTube](https://www.youtube.com/watch?v=bth3r3BUxuk) | [v4/README.md](v4/README.md) |

Entre versiones están las revisiones: R1 con el equipo docente (2-oct), R2 entre pares con el Grupo 15 (8-oct) y R3 con el equipo docente (16-oct). La evaluación con usuarios (*thinking aloud*) se hizo sobre la V4 preliminar el 21-oct. Todo está registrado en [readmes/](readmes/README.md).

## Estructura del repositorio

| Carpeta | Contenido |
|---|---|
| `index.html` | Página de inicio con las cuatro versiones y su estado. |
| [`v1/`](v1/) … [`v4/`](v4/) | Una carpeta por versión: su app (`index.html`, `css/`, `js/`), su `README.md` (identificación, evidencia, qué cambió, por qué y qué se descartó) y sus capturas en `evidencia/`. La V4 incluye además `pruebas/validar-layout.cjs`. Las versiones cerradas no se vuelven a tocar. |
| [`readmes/`](readmes/) | Revisiones R1, R2 y R3, el feedback que dimos al otro grupo, la evaluación con usuarios y el contexto general. |
| `datos/` | Datos generados por el pipeline, compartidos por todas las versiones (cada app los carga desde `../datos/`; la V3 y la V4 usan `datos/v3/`). |
| `scripts/` | Pipeline de datos en Python (01 → 13) y servidor local. |

## Datos

Medido sobre los días-país con #1 de la versión final:

- **Spotify (92 %)**: charts diarios por país 2017–2026 ([Kaggle, *Spotify Charts Daily Updated*](https://www.kaggle.com/datasets/gonzalopezgil/spotify-charts-daily-updated), CC BY-SA 4.0) y charts semanales 2013–2023 (Kaggle, jfreyberg, recopilados de kworb), estos últimos para 2015–2016 y los países sin chart diario. Los **52 países de la muestra fija** son todos de Spotify: la cifra del eje y los aplausos se cuentan solo sobre ellos.
- **[YouTube Music Charts](https://charts.youtube.com/) (6 %)**: top 100 semanal desde 2018, solo donde no hay Spotify: Kenia, Serbia, Tanzania, Uganda y Zimbabue; Rusia desde que Spotify se fue en 2022 e Israel en parte.
- **QQ Music (1 %)**: el chart 热歌榜, solo para China, semanal desde 2018 y diario desde julio de 2022.
- **Descartado:** la foto de un solo día de Apple Music, iTunes y Deezer (sin historia).
- **Además:** previews de 30 s de la [API de Deezer](https://developers.deezer.com/api), portadas de Spotify, mapa de [Natural Earth](https://www.naturalearthdata.com/) 1:50m y nombres de países de [mledoze/countries](https://github.com/mledoze/countries).

## Ver la visualización en local

```bash
python3 scripts/servir.py     # y abrir http://localhost:8000 (inicio) o http://localhost:8000/v4/
```

`servir.py` le pide al navegador no guardar archivos en caché. En GitHub Pages se publica desde la rama `main`, carpeta raíz, sin paso de compilación. Al cambiar CSS, JS o datos de una versión, hay que subir el número `?v=…` de sus referencias en su `index.html`.

## Regenerar los datos

Los datos crudos no van al repositorio (14 GB). La carpeta de los crudos de Spotify se elige con `INFOVIS_RAW_DIR` (por defecto `Data/`) y las demás descargas van a `~/InfoVis-datos/` (`INFOVIS_EXTRA_DIR`).

```bash
python3 -m venv ~/.venvs/infovis && ~/.venvs/infovis/bin/pip install -r scripts/requirements.txt
cd scripts
# V1 y V2: Spotify diario
~/.venvs/infovis/bin/python 01_csv_a_parquet.py      # CSV de Kaggle → Parquet
~/.venvs/infovis/bin/python 02_construir_datos.py    # catálogo, #1, top 5 y popularidad → datos/
~/.venvs/infovis/bin/python 03_deezer.py             # ids de Deezer para los previews
~/.venvs/infovis/bin/python 04_mapa_mundial.py       # mapa de Natural Earth → datos/mundo.js
~/.venvs/infovis/bin/python 06_catalogo_completo.py  # V2: catálogo completo y puesto semanal por país
# V3 y V4: más fuentes, muestra fija y alcance
~/.venvs/infovis/bin/python 07_descargar_charts.py youtube   # YouTube Music Charts
~/.venvs/infovis/bin/python 12_descargar_qq.py               # QQ Music (China)
~/.venvs/infovis/bin/python 08_fuentes_extra.py              # integra YouTube Music y QQ Music → datos/extra.js
uv run --with duckdb python 09_datos_v3.py                   # #1 desde 2013 uniendo fuentes → datos/v3/
uv run --with duckdb python 10_top3_v3.py                    # top 3 de cada país (recuadro del cursor)
~/.venvs/infovis/bin/python 11_base_fija_v3.py               # inicio en mayo de 2015 y muestra fija de 52 países
uv run --with duckdb python 13_alcance_v3.py                 # alcance top 50 de cada canción
```

Dos corridas seguidas dan los mismos archivos.

### Definiciones (versión final)

- **#1 de un país**: puesto 1 del chart del día; en semana, mes y año, la canción más escuchada sumando el período.
- **Muestra fija**: los 52 países con #1 de Spotify todos los días desde el 1-may-2015. Así la cifra no cambia porque se sumen países con el tiempo.
- **Eje de tiempo**: % de los 52 países cuyo #1 es el #1 global; en cada período, el promedio de sus días.
- **Aplausos**: una persona por cada país de la muestra donde la canción que suena es #1 (más el país que se mira, si está fuera de la muestra).
- **Alcance top 50**: en cuántos de los 52 países está la canción en su top 50 esa semana. Una canción sin datos de Spotify (por ejemplo, de QQ Music) marca «—».
- **Sin datos**: países sin chart en esa fecha. Al pasar el cursor suena estática de radio, y las marcas del eje cuentan cuándo llegó o se fue Spotify.

## Licencias y herramientas

Charts de Spotify vía Kaggle (CC BY-SA 4.0) · Natural Earth (dominio público) · mledoze/countries (ODbL) · audio de Deezer por JSONP · [Plotly.js](https://plotly.com/javascript/) · tipografía [Figtree](https://fonts.google.com/specimen/Figtree) (OFL).
