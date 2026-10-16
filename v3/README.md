# V3 — Segunda iteración de diseño

> **Estado: pendiente.** El diseño se afina (jerarquías, percepción, detalles de la interacción, rol exacto del sonido), a partir de la R2 (revisión entre pares) y/o la evaluación con usuarios.

Para empezar esta versión, copiar la anterior (`cp -R v2/index.html v2/css v2/js v3/`) y actualizar `index.html` de la raíz. Al cerrarla: completar este registro, crear el tag `v3` y marcarla como cerrada en la página de inicio.

## Identificación

| Campo | Valor |
|---|---|
| Versión | V3 |
| Fecha | [COMPLETAR] |
| Tag / commit | `v3` → [COMPLETAR] |
| Ver en línea | https://ignosorioo.github.io/Proyecto-InfoVis/v3/ |

## Evidencia visual y sonora

[COMPLETAR] Capturas en `v3/evidencia/` y video corto con audio de esta versión.

## Qué cambió respecto a V2 (máx. 8 líneas)

[COMPLETAR]

## Por qué cambió — el rationale (máx. 12 líneas)

[COMPLETAR] Anclado en principios del curso, lo discutido en las revisiones, feedback de usuarios o evidencia de los datos.

## Qué se descartó (máx. 5 líneas)

[COMPLETAR]

## Notas de método

- **Muestra fija de 52 países:** toda la tendencia (titular, barras, eje de tiempo, diversidad y aplausos) se cuenta sobre los mismos 52 países: los que tienen #1 en todos los días entre el 1 de mayo de 2015 y el 27 de septiembre de 2026 (`datos/v3/muestra.js`, de `scripts/11_base_fija_v3.py`). Así una cifra no cambia porque se sumen países con el tiempo, y no se cuenta como «no escucha» a un país del que no hay datos. Son 19 de América, 25 de Europa, 5 de Asia, 2 de Oceanía y Turquía. Las barras muestran solo los continentes con al menos 3 países en la muestra. Los países con datos que empiezan después (Rusia, China, Kenia, India, Japón…) se pintan en el mapa, pero no entran en la cuenta. Con la muestra, el % del eje es el mismo del titular: 2015, 51 % → 2026, 13 % (promedios anuales).
- **Alcance mundial de una canción:** en cuántos de los 52 países está en su top 50, semana a semana (`scripts/13_alcance_v3.py`). Usa los charts diarios de Spotify desde 2017 (mejor puesto de la semana) y los semanales de 2015–2016. Una canción se reconoce por título y primer artista, porque un mismo hit tiene varios IDs. No depende del tamaño del mercado y tiene la misma escala (0 a 52) para toda canción y fecha. Se ve en el anillo de cobertura del panel, bajo las barras por continente.
- **Popularidad de cada canción:** el gráfico del panel muestra sus reproducciones por semana desde que entra a los charts hasta el último día de los datos (el mismo final para toda canción). Lo anterior a la fecha de la visualización va en verde y lo posterior en gris, con una franja en la fecha.
- **Sonido:** encima de la canción, que nunca se altera, aplauden tantas personas como países donde esa canción es #1 en la fecha (de 0 a 52; el país que se mira cuenta aunque no esté en la muestra). Sobre la mitad se suma el murmullo de un estadio. Reemplaza al tono por continente. En los países sin datos suena estática de radio («sin señal») mientras el cursor esté encima.
- **Panel único:** la misma vista para cualquier canción (el #1 global o el de un país): dónde es #1 (titular y barras por continente), en cuántos países está en el top 50 (anillo) y sus reproducciones hasta hoy. Sin cursor sobre el mapa muestra el #1 global contado en la pestaña elegida (el mundo o un continente). Con el cursor sobre un país muestra el #1 de ese país, y al sacarlo vuelve solo. Un click fija el país hasta soltarlo.
- **El vacío como parte del relato:** las marcas del eje y las paradas del recorrido explican por qué hay países sin datos: cuándo llega Spotify (Sudáfrica, marzo de 2018; Medio Oriente y el norte de África, noviembre de 2018; India, febrero de 2019; Rusia, julio de 2020; 85 países más, gran parte de África, febrero de 2021) y cuándo se va (Rusia, 11 de abril de 2022). Además, el mapa destella cuando un país empieza a tener datos.
- **China (QQ Music):** su chart de canciones más escuchadas (热歌榜), semanal de 2018 a junio de 2022 y diario desde el 13 de julio de 2022 (`scripts/12_descargar_qq.py`, endpoint web sin cuenta). Entre ambos hay un hueco de 16 días. QQ no publica reproducciones, así que en mes y año gana la canción con más puntos por puesto. China no entra en la muestra, porque sus datos empiezan en 2018.
- **Diversidad de líderes** (PR #1, jtomaslarrain): «N canciones distintas son #1 en estos 52 países», sobre la muestra fija. Las canciones se comparan por su índice en el catálogo, como hace el mapa con el #1 global.
- **Un solo día de datos = sin datos:** la foto de Apple Music (el chart del 14 de octubre de 2026, sin historia) era la única fuente de 92 países. Se quitó, y esos países aparecen sin datos.
- **Una sola métrica de reproducciones:** las vistas de YouTube Music también se llaman reproducciones.
- **Reproducción automática:** al abrir la página, la historia corre sola por meses, de mayo de 2015 a hoy (unos 4 minutos y medio). Cada mes dura 1 segundo y, cuando cambia la canción que suena, ese mes dura al menos 2,6 segundos para alcanzar a escucharla (en meses, el #1 global cambia 78 veces en 137 meses). El sonido empieza con el primer click o tecla, porque los navegadores no dejan sonar nada antes. Con «reducir movimiento» activado en el sistema no arranca sola.
- **Inicio:** entre el 23 de marzo y el 23 de abril de 2015 falta el chart global de Spotify. Por eso la V3 parte el 1 de mayo de 2015 y no hay ningún instante sin datos.
- **Orden de los scripts de datos:** `08` → `09` → `10` → `11` → `13`, con `uv run --with duckdb` y la descarga de QQ Music hecha antes (`12`). Dos corridas seguidas dan los mismos archivos.
