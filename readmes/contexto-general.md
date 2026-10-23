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

- **Spotify** (92 % de los días-país): diario 2017–2026 (Kaggle, *Spotify Charts Daily Updated*, CC BY-SA 4.0) y semanal 2013–2023 (Kaggle, jfreyberg) para 2015–2016 y países sin diario.
- **YouTube Music** (top 100 semanal, desde 2018), solo sin Spotify: Kenia, Serbia, Tanzania, Uganda, Zimbabue, Rusia (desde 2022) e Israel (en parte). **QQ Music:** solo China, desde 2018.
- **Muestra fija:** 52 países con #1 de Spotify cada día desde el 1-may-2015; la cifra y los aplausos se cuentan sobre ellos. Sin Apple Music (un solo día).
- **Procesamiento** (DuckDB, scripts 08 → 13): #1, top 3 y reproducciones por período. Audio de Deezer, portadas de Spotify, mapa de Natural Earth.
