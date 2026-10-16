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

- **Diversidad de líderes** (PR #1, jtomaslarrain): «N canciones distintas son #1 en estos M países», bajo las barras por continente. Cuenta los países del ámbito que tienen #1 en la fecha. Del resto no se sabe cuál es su #1, por eso la frase dice «con datos». Las canciones se comparan por su índice en el catálogo, como hace el mapa con el #1 global. Las de YouTube Music se cruzan con Spotify por título y artista, y sus vistas se cuentan como reproducciones, y dos ediciones con distinto ID de Spotify cuentan como canciones distintas. Mide cuántas canciones lideran, no la diversidad total de lo que se escucha.
- **Un solo día de datos = sin datos:** la foto de Apple Music (el chart del 14 de octubre de 2026, sin historia) era la única fuente de 92 países. Se quitó, y esos países aparecen sin datos (`scripts/11_base_fija_v3.py`). La visualización usa solo Spotify y YouTube Music.
- **Total fijo de países:** los conteos del panel («La escuchan 16 de 196 países», «15/35» en América) usan siempre el total real de países de cada continente: los independientes más los territorios con chart propio (`scripts/11_base_fija_v3.py`). Los países sin datos en una fecha cuentan como que no escuchan el #1 global. El eje de tiempo y el sonido comparan fechas con cobertura distinta, por eso usan el % de los **países con datos**, y su rótulo lo dice.
- **Inicio:** entre el 23 de marzo y el 23 de abril de 2015 falta el chart global de Spotify en los datos. Por eso la V3 parte el 1 de mayo de 2015 y no hay ningún instante sin datos.
