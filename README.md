# ¿Qué suena en el mundo?

Mapa mundial interactivo y sonoro con la canción más escuchada en Spotify en cada país, día a día desde 2017. Al pasar el cursor por un país se reproduce un fragmento de su canción #1 en ese momento y se muestra la portada. Proyecto del curso Visualización de la Información (IIC2026, PUC).

## Qué muestra

- **Mapa 2D** (proyección Natural Earth): se mueve arrastrando y se acerca con scroll o con los botones por región. Cada país está pintado según su canción #1.
  - Las 3 canciones que son #1 en más países tienen un color propio; el resto va en gris sólido.
  - Los países y territorios sin chart de Spotify quedan vacíos, solo con su contorno.
  - Una canción conserva su color mientras siga entre esas 3.
- **Pasar el cursor por un país** (o tocarlo, en pantallas táctiles):
  - Suena el preview de 30 s de su #1, desde Deezer.
  - Aparece una tarjeta con la portada, cuánto tiempo lleva como #1 y en cuántos países más es #1.
  - Los países que comparten esa canción quedan contorneados.
  - Si el país siguiente tiene la misma canción, la música sigue sin cortarse.
- **Línea de tiempo**: se puede elegir cualquier día, semana, mes o año entre enero de 2017 y hoy, y animar el paso del tiempo con el botón de reproducir.
- **#1 global**: la canción número uno del chart global de ese momento, arriba a la derecha.

Los navegadores exigen un click antes de reproducir audio, por eso al entrar aparece el botón "Activar sonido".

**Paleta "Vinilo nocturno"**: fondo ciruela oscuro, con coral `#e4564b`, turquesa `#09a295` y lavanda `#9677ee` para las tres canciones más compartidas. Esos tres colores están validados para daltonismo (diferencia ΔE ≥ 11,5 entre todos los pares) y tienen contraste ≥ 3:1 con el fondo.

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
~/.venvs/infovis/bin/python 02_numero1_por_pais.py  # #1 por país y período → datos/*.js (≈5 s)
~/.venvs/infovis/bin/python 03_deezer.py            # ids de Deezer para los previews (usa caché)
~/.venvs/infovis/bin/python 04_mapa_mundial.py      # geometría del mapa desde Natural Earth → datos/mundo.js
```

La carpeta de datos crudos se puede cambiar con la variable `INFOVIS_RAW_DIR`.

### Definiciones

- **#1 del día**: puesto 1 del chart diario de Spotify en ese país.
- **#1 de la semana, el mes o el año**: la canción con más streams sumados en ese período.
- **Sin datos**: países sin Spotify (China o Rusia, por ejemplo) o cuyo chart todavía no existía en esa fecha (por ejemplo, Corea antes de 2021).
- **Territorios de ultramar**: Natural Earth incluye la Guayana Francesa, Guadalupe, Martinica, Reunión, Mayotte y el Caribe neerlandés dentro de Francia o Países Bajos. Aquí se separan y se muestran sin datos, porque Spotify no publica un chart propio para ellos.
- **Cobertura**:
  - 70 países más el chart global.
  - 7.313 canciones que alguna vez fueron #1.
  - Portadas desde los datos de Spotify del dataset.
  - Previews de Deezer: los ids se buscan offline por "artista + título". Si no se encuentra el id, se busca en el navegador.

## Fuentes y licencias

- Charts: [gonzalopezgil/spotify-charts-daily-updated](https://www.kaggle.com/datasets/gonzalopezgil/spotify-charts-daily-updated), CC BY-SA 4.0.
- Mapa: [Natural Earth](https://www.naturalearthdata.com/) 1:50m, dominio público, desde su [repositorio oficial](https://github.com/nvkelso/natural-earth-vector).
- Nombres de países: [mledoze/countries](https://github.com/mledoze/countries), ODbL.
- Audio: [API de Deezer](https://developers.deezer.com/api), consultada en el navegador por JSONP. Portadas: Spotify.
- Visualización: [Plotly.js](https://plotly.com/javascript/), con proyección Natural Earth. Tipografías: [DM Sans](https://fonts.google.com/specimen/DM+Sans) y [Syne](https://fonts.google.com/specimen/Syne) (Google Fonts, licencia OFL).
