# R3 — Revisión con el equipo docente (entre V3 y V4)

> Se revisa cómo evolucionó el proyecto y se afinan las últimas decisiones antes de la [V4](../v4/README.md). Igual que en la R1, el diálogo es con cada integrante (modificador individual de la nota): hay que poder explicar las decisiones de diseño, la teoría que las sustenta y la implementación.

| Campo | Valor |
|---|---|
| Fecha | [COMPLETAR] |
| Quiénes revisaron | [COMPLETAR: profesor y/o ayudante] |
| Versión revisada | [V3](../v3/README.md) · tag `v3` → `2b2223b` |

## Preguntas que llevamos

[COMPLETAR: las 2–3 preguntas de diseño que llevó el grupo; si no se llevaron, decirlo]

## Síntesis de lo discutido (breve)

El profesor ya conocía el proyecto, así que hubo pocas observaciones nuevas:

- **La línea de tiempo.** El gráfico principal del eje cuesta entenderlo: no queda claro qué está mostrando.
- **Los botones de los continentes.** Se leyeron como filtros, y el profesor preguntó si lo eran. Para el grupo eran un atajo para acercar el mapa a un continente sin arrastrar ni hacer zoom a mano.

## Decisiones (máx. 10 líneas)

| Observación | Decisión | Por qué | Dónde se ve |
|---|---|---|---|
| La línea de tiempo no se entiende | Adoptada | Además lo confirmaron dos personas externas al curso, a quienes les costaba usarla. Rotulado directo: la cifra junto a la fecha («jun 2015 · 65 %») evita leer contra un eje sin marcas. Un punto marca el valor y deja ver que el eje se arrastra. El título usa la muestra verde de la leyenda del mapa (similitud): el área cuenta los países pintados de verde. | V4: eje de tiempo |
| Los continentes parecen filtros | Ajustada | Al revisarlo vimos que **en parte sí filtraban**: cambiaban el titular del panel («N de 19 países de América») y la diversidad, mientras el mapa y el eje seguían contando el mundo. No los convertimos en filtro, porque el desglose por continente ya está en las barras del panel y el mensaje es mundial. Ahora solo acercan y van sobre el mapa con una lupa, como el zoom de un mapa web, separados de la leyenda de los datos. | V4: control «acercar» |
