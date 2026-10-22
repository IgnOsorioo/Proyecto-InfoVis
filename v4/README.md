# V4 — La versión final

> Registro de versión según la pauta E1 (sección 5). Responde a la [R3](../readmes/R3-equipo-docente.md) (equipo docente) y a la auditoría del grupo frente a la pauta. Ajusta la comunicación sin agregar datos ni funciones.

## Identificación

| Campo | Valor |
|---|---|
| Versión | V4 |
| Fecha | 22 de octubre de 2026 |
| Tag / commit | `v4` → [COMPLETAR al cerrar] |
| Ver en línea | https://ignosorioo.github.io/Proyecto-InfoVis/v4/ |

## Evidencia visual y sonora

Son los mismos estados que en la [V3](../v3/README.md), para compararlos lado a lado.

| | |
|---|---|
| ![Vista general](evidencia/01-vista-general.png) | ![Cursor sobre Chile](evidencia/02-hover-chile.png) |
| La fecha lleva su cifra («sept 2026 · 31 %»), con un punto sobre el área. El control para acercar va sobre el mapa. | Cursor sobre Chile: el recuadro con su top 3 y el panel con su #1. |
| ![País fijado](evidencia/03-pais-fijado.png) | ![Europa](evidencia/04-acercar-europa.png) |
| Click en Brasil: se fija el país. | «Europa» solo acerca el mapa: el panel sigue contando los 52 países. |
| ![Sin datos](evidencia/05-sin-datos-2015.png) | ![1366×768](evidencia/06-pantalla-1366.png) |
| Kenia en 2015: sin datos. | A 1366×768, el título va en una línea y los artistas se ven. |

**Video con audio: [COMPLETAR].** 30–60 s en https://ignosorioo.github.io/Proyecto-InfoVis/v4/:
1. dejar correr el tiempo con el sonido activado, para que se vea cambiar la cifra del eje y se oigan los aplausos;
2. arrastrar el eje hasta 2026;
3. hacer click en «Europa» y volver a «Mundo»;
4. pasar el cursor por Chile y por Kenia.

## Qué cambió respecto a V3 (máx. 8 líneas)

1. **Los botones de región solo acercan el mapa.** El panel, el eje y la diversidad cuentan siempre los 52 países. Van sobre el mapa, arriba a la derecha y con una lupa.
2. **La línea de tiempo dice qué muestra:** la cifra junto a la fecha («jun 2015 · 65 %»), un punto verde sobre el valor y un título con la muestra verde de la leyenda.
3. **Panel a 1366×768:** el título va en una línea y ya no tapa a los artistas.
4. **Textos coherentes con el sonido:** el recorrido decía «top 50» (los aplausos cuentan dónde es #1) y el botón decía «de 2013 en un minuto».

## Por qué cambió — el rationale (máx. 12 líneas)

- **R3, los continentes parecían filtros.** Revisándolo vimos que en parte sí filtraban: el panel pasaba a «N de 19 países de América» mientras el mapa y el eje seguían contando el mundo. Eran dos ámbitos a la vez.
  - Ahora solo acercan, que es su propósito: un atajo para no arrastrar ni hacer zoom a mano.
  - Van sobre el mapa por proximidad (un control de vista, junto a lo que mueve) y lejos de la leyenda que explica los datos.
  - La lupa es la convención del zoom.
- **R3 y dos personas externas, la línea de tiempo no se entendía.** No se sabía qué medía la altura.
  - Rotulado directo: la cifra en la fecha evita leer contra un eje sin marcas, y es el mismo % del titular del panel.
  - La muestra verde del título repite la de la leyenda del mapa (similitud): el área cuenta los países pintados de verde.
  - El punto sobre el valor además indica que el eje se puede arrastrar.
- **Auditoría, alineado y ordenado (§11).** Un panel que se tapa a sí mismo en una pantalla común rompe la jerarquía.
- **Coherencia del sonido.** Si la leyenda y el recorrido explican los aplausos de forma distinta, el sonido no se entiende (heurística de Zuk-Carpendale).

## Qué se descartó (máx. 5 líneas)

- **Convertir las regiones en un filtro real:** repetiría las barras por continente del panel y exigiría series por continente en el eje. El mensaje es mundial.
- **Reducir la portada:** escuchar la canción y ver el disco es parte de la identidad del concepto desde la V1. Se arregló el desborde sin cambiar su tamaño.
- **Quitar la media móvil del eje** (probado): con el valor exacto de cada mes el borde quedaba dentado, y la caída de 51 % a 12 % se leía peor.
- **Agregar más datos o funciones:** la versión final ajusta, no suma piezas.

## Balance del recorrido

**Qué mejoró desde la V1**
- **Mensaje.** La V1 mostraba dónde era #1 una canción. La V4 responde una pregunta con una cifra que se ve en el mapa (verde), se sigue en el eje (de 51 % a 12 %) y se oye.
- **Sonido.** La V1 solo tenía la canción (R1: «sonificación pobre»). Ahora la canción va intacta, encima van los aplausos que codifican el alcance, y la estática marca dónde no hay datos.
- **Interacción.** Antes un modal bloqueaba la entrada. Ahora hay vista general inmediata, hover con intención, click para fijar un país y un control para acercar que no se confunde con un filtro.
- **Datos.** De 70 países desde 2017 a una muestra fija de 52 desde 2015, comparable en todo el período.

**Qué decidimos no cambiar, y por qué**
- **La canción nunca se altera** (R1): es el dato. La codificación va en una capa aparte.
- **Mapa 2D:** el globo ocultaba medio mundo y rompía la vista general.
- **La muestra fija de 52 países**, aunque deja fuera a Rusia, India o China de la cifra: sin ella, la cifra mediría la llegada de Spotify y no el gusto.
- **La portada grande:** es la identidad del proyecto.
