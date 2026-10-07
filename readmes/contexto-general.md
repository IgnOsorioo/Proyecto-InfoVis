# Contexto general del proyecto

> Va una sola vez en el documento de entrega, después de la portada (pauta E1, sección 6). Son borradores: el grupo tiene que revisarlos y escribirlos con sus palabras.

## Mensaje principal (máx. 10 líneas) — **[BORRADOR: revisar con el grupo]**

**El #1 de cada país se volvió más local.**
- En 2017, 4 de cada 10 países tenían como #1 en Spotify el mismo hit que el mundo; en 2026, solo 1 de cada 10.
- El #1 propio (no es #1 en ningún otro país) pasó del 16 % al 59 % de los países.
- Con solo los 55 países que tienen chart desde 2017, la tendencia es la misma (40 → 12 % y 16 → 56 %).
- La visualización permite verlo y escucharlo:
  - el mapa de entrada pinta cada país según su #1;
  - al recorrer el mapa, los hits compartidos suenan igual en bloques de países, y los propios cambian de país a país;
  - al seguir una canción, los aplausos siguen su popularidad en el tiempo.

Este mensaje se ve desde la [V2](../v2/README.md). En la V1, el mapa solo marcaba dónde era #1 la canción seleccionada.

Cálculo: % de países con chart en cada fecha cuyo #1 diario es igual al #1 global (*mundial*), también es #1 en otro país (*compartido*) o es solo suyo (*propio*). Es el promedio de cada año y el mismo que muestra el panel de la V2.

| Año | #1 mundial | Compartido | Propio |
|---|---:|---:|---:|
| 2017 | 40 % | 44 % | 16 % |
| 2020 | 17 % | 47 % | 35 % |
| 2023 | 13 % | 40 % | 47 % |
| 2026 | 11 % | 31 % | 59 % |

## Origen y procesamiento de los datos (máx. 8 líneas) — **[BORRADOR]**

1. **Datos:** charts diarios de Spotify (Top 200 por país) del dataset de Kaggle *Spotify Charts Daily Updated* (gonzalopezgil, CC BY-SA 4.0): 70 países más el global, de enero de 2017 a septiembre de 2026, 44,6 millones de filas.
2. **Procesamiento:** con DuckDB se calcula el #1 de cada país por día, semana, mes y año (puesto 1, o más streams sumados en el período), el top 5 por país, continente y mundo, y las reproducciones semanales de cada canción sumando los 70 charts.
3. **Ajustes para la interacción:**
   - el #1 se guarda solo cuando cambia (31 mil cambios en vez de 236 mil días-país);
   - los archivos se cargan por partes;
   - los países cuyo chart aún no existía en una fecha cuentan como "sin datos".
4. **Seguir una canción (V2):** el puesto semanal de cada una de las 20.930 canciones del catálogo en cada país (3,6 M registros), cargado por partes.
5. **Mapa y sonido:** el mapa es Natural Earth 1:50m, con los territorios de ultramar separados de Francia y Países Bajos. Para el sonido, cada canción se buscó en Deezer (93 % encontradas) para reproducir su preview de 30 s. Los aplausos se sintetizan en el navegador.
