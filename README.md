# ¿Qué suena en el mundo?

Mapa mundial interactivo y sonoro con la canción más escuchada en Spotify en cada país, día a día desde 2017. Al pasar el cursor por un país se reproduce un fragmento de su canción #1 en ese momento y se muestra la portada. Proyecto del curso Visualización de la Información (IIC2026, PUC).

## Qué muestra

- **Mapa 2D** (proyección Natural Earth): se mueve arrastrando y se acerca con scroll. Los botones de región encuadran el continente completo (aunque se vean partes de otros). Gira en torno a la canción seleccionada:
  - en coral, los países donde esa canción es #1 en la fecha elegida;
  - en gris sólido, los países con datos cuyo #1 es otra canción;
  - vacíos, solo con contorno, los países y territorios sin chart de Spotify.
- **Pasar el cursor por un país** (o tocarlo, en pantallas táctiles): su #1 pasa a ser la canción seleccionada y suena el preview de 30 s de Deezer. Si el país siguiente tiene la misma canción, la música sigue sin cortarse. Si el país no tiene datos, el panel muestra solo un mensaje centrado.
- **Panel lateral** (alto completo, a la derecha, sin scroll: portada, estadísticas y top 5 caben en la misma pantalla), con la canción seleccionada:
  - portada de ancho completo (si falta alto, se achica cuadrada sobre la misma imagen desenfocada, sin recortarla ni deformarla), título, artistas y dónde está en el ranking (por ejemplo, "#1 en Chile · lleva 9 días seguidos");
  - estadísticas a la fecha: estreno, en cuántos países es #1 (los países en coral del mapa) y reproducciones acumuladas en los charts;
  - **gráfico de popularidad**: reproducciones semanales sumando los charts de los 70 países, desde que la canción entra a los charts hasta la fecha elegida. Al reproducir la línea de tiempo crece en tiempo real y muestra la tendencia;
  - **top 5** del mundo, de un continente o de un país, según lo que se haya seleccionado: el país bajo el cursor o el botón de región. Con un click en una canción del top se selecciona y suena.
- **Reproductor inferior** (formato tipo Spotify): play/pausa al centro, botones para saltar un año atrás o adelante y, debajo, la línea de tiempo; a la izquierda la granularidad y a la derecha el sonido. Se puede elegir cualquier día, semana, mes o año entre enero de 2017 y hoy.

Los navegadores exigen un click antes de reproducir audio, por eso al entrar aparece el botón "Activar sonido".

**Estilo**: fondo negro con grises neutros, coral `#e4564b` para la canción seleccionada y tipografía Figtree en pesos 600 a 900. El panel se arma de una vez con todos sus datos (si tardan, muestra una pantalla de carga) y sus bloques tienen alto fijo, así que no salta al cambiar de país.

## Ver la visualización

```bash
python3 scripts/servir.py     # y abrir http://localhost:8000
```

`servir.py` le pide al navegador no guardar archivos en caché. Con `python3 -m http.server`, en cambio, el navegador puede mezclar la página nueva con CSS o JS viejos después de un cambio.

Abrir `index.html` con doble click también funciona. En GitHub Pages se publica desde la rama `main`, carpeta raíz, sin paso de compilación.

**Al cambiar CSS, JS o datos**, sube el número de versión (`?v=…`) en las referencias de `index.html`. GitHub Pages guarda los archivos 10 minutos en caché, y así cada visitante descarga los archivos nuevos y no una mezcla con los antiguos.

## Regenerar los datos

Los datos crudos no van al repositorio (14 GB).

1. Descargar el dataset [Spotify Charts Daily Updated](https://www.kaggle.com/datasets/gonzalopezgil/spotify-charts-daily-updated) de Kaggle en la carpeta `Data/`. Se actualiza a diario, así que volver a descargarlo actualiza el mapa.
2. Correr el pipeline:

```bash
python3 -m venv ~/.venvs/infovis
~/.venvs/infovis/bin/pip install -r scripts/requirements.txt
cd scripts
~/.venvs/infovis/bin/python 01_csv_a_parquet.py     # CSV de 11 GB → Parquet (≈10 s)
~/.venvs/infovis/bin/python 02_construir_datos.py   # catálogo, #1, top 5 y popularidad → datos/ (≈20 s)
~/.venvs/infovis/bin/python 03_deezer.py            # ids de Deezer para los previews (usa caché)
~/.venvs/infovis/bin/python 04_mapa_mundial.py      # geometría del mapa desde Natural Earth → datos/mundo.js
```

La carpeta de datos crudos se puede cambiar con la variable `INFOVIS_RAW_DIR`.

### Definiciones

- **#1 del día**: puesto 1 del chart diario de Spotify en ese país.
- **#1 de la semana, el mes o el año**: la canción con más streams sumados en ese período.
- **Top 5 de un continente**: las canciones con más streams sumando los países de ese continente (los mismos grupos que los botones de región).
- **Popularidad**: reproducciones semanales sumando los charts (Top 200) de los 70 países. No incluye las reproducciones fuera de los charts.
- **Sin datos**: países sin Spotify (China o Rusia, por ejemplo) o cuyo chart todavía no existía en esa fecha (por ejemplo, Corea antes de 2021).
- **Territorios de ultramar**: Natural Earth incluye la Guayana Francesa, Guadalupe, Martinica, Reunión, Mayotte y el Caribe neerlandés dentro de Francia o Países Bajos. Aquí se separan y se muestran sin datos, porque Spotify no publica un chart propio para ellos.
- **Cobertura**:
  - 70 países más el chart global.
  - 20.930 canciones que alguna vez fueron #1 o estuvieron en algún top 5.
  - Portadas desde los datos de Spotify del dataset.
  - Previews de Deezer: los ids se buscan offline por "artista + título". Si no se encuentra el id, se busca en el navegador.

## Fuentes y licencias

- Charts: [gonzalopezgil/spotify-charts-daily-updated](https://www.kaggle.com/datasets/gonzalopezgil/spotify-charts-daily-updated), CC BY-SA 4.0.
- Mapa: [Natural Earth](https://www.naturalearthdata.com/) 1:50m, dominio público, desde su [repositorio oficial](https://github.com/nvkelso/natural-earth-vector).
- Nombres de países: [mledoze/countries](https://github.com/mledoze/countries), ODbL.
- Audio: [API de Deezer](https://developers.deezer.com/api), consultada en el navegador por JSONP. Portadas: Spotify.
- Visualización: [Plotly.js](https://plotly.com/javascript/), con proyección Natural Earth. Tipografía: [Figtree](https://fonts.google.com/specimen/Figtree) (Google Fonts, licencia OFL).
