# R3 — Revisión con el equipo docente (entre V3 y V4)

> Se revisa cómo evolucionó el proyecto y se afinan las últimas decisiones antes de la [V4](../v4/README.md). Igual que en la R1, el diálogo es con cada integrante (modificador individual de la nota): hay que poder explicar las decisiones de diseño, la teoría que las sustenta y la implementación.

| Campo | Valor |
|---|---|
| Fecha | Viernes 16 de octubre de 2026 |
| Quiénes revisaron | El ayudante Tomás Romero con otros dos ayudantes, y el profesor presente |
| Versión revisada | [V3](../v3/README.md) · tag `v3` → `2b2223b` |

## Preguntas que llevamos

No llevamos preguntas preparadas: fuimos con la versión más avanzada a validar las soluciones y recibir feedback.

## Síntesis de lo discutido (breve)

- **La línea de tiempo.** No se entendía a qué aludía el porcentaje del gráfico, y **tuvimos que explicarlo**.
- **Los botones de los continentes.** Preguntaron si eran filtros: el usuario suele leer así ese tipo de controles. Sugirieron eliminarlos o cambiar su diseño, y dejar el zoom solo a la navegación con el trackpad.

## Decisiones (máx. 10 líneas)

| Observación | Decisión | Por qué | Dónde se ve |
|---|---|---|---|
| La línea de tiempo no se entiende | Adoptada | La misma tarde, una persona externa (validación informal) también tuvo problemas con ella. Rotulado directo: la cifra junto a la fecha evita leer contra un eje sin marcas. Un punto marca el valor. El título usa la muestra verde de la leyenda del mapa (similitud). | V4: eje de tiempo |
| Los continentes parecen filtros: eliminarlos o rediseñarlos | Ajustada | **No los eliminamos:** acercarse a un continente con el trackpad es incómodo, un zoom muy alejado pierde el contenido y uno muy profundo pierde el panorama. Un botón lleva al encuadre justo con un click. Sí se rediseñaron: solo acercan (en parte filtraban el panel), van sobre el mapa con una lupa, separados de la leyenda, y el zoom manual no se aleja más allá del mundo. | V4: control «acercar» y límite de zoom |
