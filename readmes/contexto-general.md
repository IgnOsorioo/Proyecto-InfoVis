# Contexto general del proyecto

> Va una sola vez en el documento de entrega, después de la portada (pauta E1, sección 6). Son borradores: el grupo tiene que revisarlos y escribirlos con sus palabras.

## Mensaje principal (máx. 10 líneas) — **[BORRADOR: decidir en la V2]**

**El #1 de cada país se volvió más local.**
- En 2017, 4 de cada 10 países tenían como #1 en Spotify el mismo hit que el mundo; en 2026, solo 1 de cada 10.
- El #1 que no es #1 en ningún otro país pasó de 16 % a 56 % de los países.
- Los datos son de 55 países con chart desde 2017. Con los 70 países la tendencia es la misma.
- La visualización permite escuchar esa diferencia: al recorrer el mapa, los hits compartidos suenan igual en bloques de países, y los locales cambian de país a país.

Este mensaje no se ve todavía en la V1: hoy el mapa solo marca dónde la canción seleccionada es #1. Para que la vista general lo transmita sola, ver la [auditoría](auditoria-pauta-E1.md).

Cálculo: % de países por año cuyo #1 diario es igual al #1 global (*mundial*), es compartido por otro país o más (*regional*) o es solo suyo (*local*).

| Año | #1 mundial | Regional | Local |
|---|---:|---:|---:|
| 2017 | 40 % | 44 % | 16 % |
| 2020 | 18 % | 49 % | 32 % |
| 2023 | 14 % | 43 % | 43 % |
| 2026 | 12 % | 33 % | 56 % |

## Origen y procesamiento de los datos (máx. 8 líneas) — **[BORRADOR]**

1. **Datos:** charts diarios de Spotify (Top 200 por país) del dataset de Kaggle *Spotify Charts Daily Updated* (gonzalopezgil, CC BY-SA 4.0): 70 países más el global, de enero de 2017 a septiembre de 2026, 44,6 millones de filas.
2. **Procesamiento:** con DuckDB se calcula el #1 de cada país por día, semana, mes y año (puesto 1, o más streams sumados en el período), el top 5 por país, continente y mundo, y las reproducciones semanales de cada canción sumando los 70 charts.
3. **Ajustes para la interacción:**
   - el #1 se guarda solo cuando cambia (31 mil cambios en vez de 236 mil días-país);
   - los archivos se cargan por partes;
   - los países cuyo chart aún no existía en una fecha cuentan como "sin datos".
4. **Mapa y sonido:** el mapa es Natural Earth 1:50m, con los territorios de ultramar separados de Francia y Países Bajos. Para el sonido, cada canción se buscó en Deezer (93 % encontradas) para reproducir su preview de 30 s.
