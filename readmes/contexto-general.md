# Contexto general del proyecto

> Va una sola vez en el documento de entrega, después de la portada (pauta E1, sección 6). Corresponde a la versión final ([V4](../v4/README.md)).

## Mensaje principal (máx. 10 líneas)

**El mundo dejó de escuchar lo mismo.**
- En 2015, en la mitad de los países (51 %) la canción más escuchada era la misma que la del mundo.
- En 2026 eso pasa solo en 1 de cada 8 (12 %).
- El hit global sigue existiendo, pero cada país tiene cada vez más su propio #1.
- La visualización lo cuenta de tres formas:
  - **se ve:** en el mapa, los países que escuchan el #1 global se pintan de verde;
  - **se sigue en el tiempo:** el eje muestra cómo baja ese % desde 2015;
  - **se oye:** suena el #1 de lo que se mira, y aplaude una persona por cada país donde esa canción es #1.
- Donde no sabemos qué se escucha (por ejemplo, gran parte de África antes de que llegaran Spotify y YouTube Music), el mapa queda vacío y suena estática. Que no haya datos también se cuenta.

Cálculo: % de los 52 países de la muestra cuyo #1 es el #1 global, promedio de los días de cada año (2026 hasta el 27 de septiembre).

## Origen y procesamiento de los datos (máx. 8 líneas)

1. **Fuentes:**
   - charts de Spotify por país: diarios desde 2017 (Kaggle, *Spotify Charts Daily Updated*, CC BY-SA 4.0) y semanales de 2013 a 2023 (Kaggle, jfreyberg);
   - YouTube Music Charts;
   - el chart de QQ Music para China.
2. **#1 por período:** con DuckDB se calcula el #1 de cada país por día, semana, mes y año, y el top 3. Cada canción se reconoce por título y primer artista.
3. **Muestra fija:** los 52 países con #1 todos los días desde el 1 de mayo de 2015. Así la cifra no cambia por la llegada de países. Un país con un solo día de datos cuenta como sin datos.
4. **Ajustes para la interacción y el sonido:**
   - el #1 se guarda solo cuando cambia;
   - el alcance de cada canción (en cuántos de los 52 está en su top 50) se precalcula;
   - cada canción tiene su preview de 30 s de Deezer;
   - el mapa es Natural Earth 1:50m.
