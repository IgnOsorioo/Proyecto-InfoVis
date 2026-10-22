# Contexto general del proyecto

> Va una sola vez en el documento de entrega, después de la portada (pauta E1, sección 6). Corresponde a la versión final ([V4](../v4/README.md)).

## Mensaje principal (máx. 10 líneas)

**¿Qué escucha el mundo?**
- La visualización muestra, día a día desde 2015, la canción más escuchada del mundo y la de cada país, y cuántos países coinciden con el mundo.
- **Se ve:** en el mapa, verde si el país escucha el #1 global, gris si escucha otra canción, vacío si no hay datos.
- **Se oye:**
  - suena el #1 de lo que se mira;
  - aplaude una persona por cada país donde esa canción es #1;
  - donde no hay datos, suena estática de radio.
- **Lo que aparece al explorar:**
  - cada vez menos países coinciden con el #1 global (51 % en 2015 → 12 % en 2026);
  - los hits se agrupan por regiones: un #1 global puede tener su núcleo en Latinoamérica, y los éxitos europeos se contagian a los vecinos.
- El vacío también se cuenta: dónde no sabemos qué se escucha, y por qué.

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
