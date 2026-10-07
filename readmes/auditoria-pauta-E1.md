# Auditoría del proyecto frente a la pauta de la E1

**Fecha de la auditoría:** 7 de octubre de 2026, actualizada con la V2 el mismo día. **Estado:** V1 cerrada (tag `v1`); V2 lista para la R2 (8 de octubre), pendiente de su tag. **Entrega:** jueves 22 de octubre, 23:59, un PDF por el formulario.

Leyenda: ✅ cumple · ⚠️ parcial o en riesgo · ❌ falta.

## Pauta de evaluación (nota grupal)

### Proceso iterativo documentado (25 %) — ⚠️

**Qué hay:**
- V1 completa y funcionando, publicada en `/v1/` y con el tag `v1`.
- 15 commits repartidos entre el 28 de septiembre y el 2 de octubre.

**Qué falta:**
- Video con audio de la V1.
- V2, V3 y V4, cada una con su tag, capturas y video propios, y repartidas en el tiempo.

### Rationale de la evolución (25 %) — ⚠️

**Qué hay:** borrador del registro de la V1 ([v1/README.md](../v1/README.md)), con decisiones, porqués y descartes reales del proceso.

**Qué falta:**
- Que el grupo lo revise y lo escriba con sus palabras.
- Que cada cambio de V2–V4 se ancle en un principio, una revisión, un usuario o un dato.

### Revisiones R1 · R2 · R3 (15 %) — ⚠️

**Qué hay:** plantillas en [R1](R1-equipo-docente.md), [R2](R2-revision-entre-pares.md) y [R3](R3-equipo-docente.md).

**Qué falta:**
- Registrar lo discutido en la R1 y mostrar su efecto en la V2.
- Llevar 2–3 preguntas a cada revisión (hay un borrador para la R2).

### Feedback al otro grupo (10 %) — ❌

**Qué hay:** guía rápida para dar feedback anclado en principios ([R2, parte B](R2-revision-entre-pares.md)).

**Qué falta:** darlo mañana y registrarlo (máx. 5 + 12 + 5 líneas).

### Implementación final (15 %) — ⚠️

**Qué hay:**
- Funciona en GitHub Pages: 70 países, 2017–2026, mapa, panel y reproductor.
- Validada con Playwright en 6 tamaños de pantalla y en móvil.

**En riesgo:**
- La sonificación (ver punto 2 abajo).
- El mensaje de la vista general (ver punto 1 abajo).

### Evaluación con usuarios (10 %) — ❌

**Qué hay:** plantilla de la hoja del observador ([evaluacion-usuarios.md](evaluacion-usuarios.md)).

**Qué falta:** al menos una ronda de *thinking aloud*, idealmente entre V2 y V3, con citas literales y preguntas sobre el sonido.

## Checklist de la pauta (sección 11)

| Ítem | Estado | Comentario |
|---|---|---|
| Ciclo de diseño visible en las versiones | ⚠️ | Hay iteraciones reales antes de la V1 (globo → 2D, 3 colores → coral único), pero las versiones formales recién parten. |
| Tipos de visualización revisados para la pregunta | ✅ | Mapa coroplético para "dónde" y línea de área para "cuándo". Se descartaron el gráfico de dispersión y el globo. |
| Sin errores comunes (ejes truncados, doble eje, 3D) | ✅ | El gráfico de popularidad parte en 0, tiene un solo eje y es 2D. |
| Principios de diseño (jerarquía, tipografía, menos es más) | ✅ | Un solo color de acento, jerarquía clara en el panel y tipografía consistente. |
| Coherencia entre mensaje y forma | ✅ | Desde la V2, la vista general muestra el mensaje: el #1 de cada país es mundial, compartido o propio, con su evolución desde 2017. |
| Interacción con Shneiderman y más allá de Plotly por defecto | ✅ | Overview (mapa), zoom & filter (regiones, tiempo, granularidad), details on demand (cursor → panel). Todo es interacción propia. |
| Sonificación con tono, ritmo o timbre (no solo volumen) | ✅ | Desde la V2, los aplausos codifican la popularidad con ritmo (densidad) y timbre (murmullo), y los silbidos, en cuántos países es #1. Falta validar con usuarios que se entiendan sin explicación. |
| No basada solo en barras | ✅ | Mapa, línea de área y lista. |
| Resultado alineado y ordenado | ✅ | Validado sin superposiciones ni scroll desde 1280×720 hasta 1920×1080. |
| Revisiones con material y preguntas | ⚠️ | R1 registrada (falta la fecha). Las preguntas para la R2 están en borrador. |
| Feedback al otro grupo registrado | ❌ | Mañana. |
| Cada versión con commit/tag y evidencia visual y sonora | ⚠️ | V1 tiene tag y capturas; falta su video con audio. |
| GitHub Pages con la versión final | ✅ | Funciona (la versión final será `/v4/`). |
| Historial que respalda las versiones | ✅ | Commits reales y repartidos. Hay que seguir subiendo avances durante todo el período, no al final. |

## Riesgos principales y acciones sugeridas

1. ✅ *Resuelto en la V2.* **La vista general no transmitía un mensaje por sí sola.** Hoy solo dice "dónde es #1 la canción seleccionada".
   - **Acción para la V2:** pintar cada país según si su #1 es el #1 mundial, un hit regional o un hit local, y dejar la canción seleccionada contorneada.
   - **Por qué:** los datos respaldan un mensaje claro (del 40 % al 12 % de países con el #1 mundial; ver [contexto-general.md](contexto-general.md)).
2. ✅ *Resuelto en la V2 con aplausos (lo observó también la R1).* **La sonificación podía leerse como decorativa.** La pauta pide parámetros efectivos y que "el tipo de sonido cambie con el dato". Que suene la canción real es un buen punto de partida.
   - **Acción para la V2/V3:** agregar una capa que codifique datos. Por ejemplo, al reproducir la línea de tiempo, que el tono suba y baje con la popularidad semanal de la canción seleccionada. O un timbre distinto según si el #1 del país es mundial, regional o local.
3. ✅ *Registrado en [R1](R1-equipo-docente.md) y [v2/README.md](../v2/README.md).* **La V2 tiene que mostrar el efecto de la R1.** Hay que registrar ya lo que dijo el equipo docente ([R1](R1-equipo-docente.md)) y justificar en la V2 qué se adoptó y qué no.
4. **Evidencia sonora.** Cada versión necesita un video con audio. Las capturas automáticas no graban sonido, así que hay que grabarlo con QuickTime u OBS al cerrar cada versión.
5. **Comprensión individual (modificador de la nota).** En la R1 y la R3 se le pregunta a cada integrante. Todos deben poder explicar:
   - el pipeline de datos;
   - por qué el coral y la proyección Natural Earth;
   - cómo funcionan el mapa (Plotly) y el audio (Deezer por JSONP).
6. **Formulario de la idea.** Confirmar que se envió el formulario inicial con el dataset y el mensaje. Si el mensaje cambia (punto 1), la pauta pide reenviarlo justificando el cambio.

## Calendario sugerido

| Fecha | Hito |
|---|---|
| 7 oct (hoy) | Registrar la R1 → construir la V2 en `v2/` → capturas y video → tag `v2`. |
| 8 oct | **R2** (pares): presentar la V2, dar feedback, registrar las partes A y B. |
| 9–12 oct | *Thinking aloud* (ronda 1) con 1–2 personas externas. |
| ~14 oct | V3 (tag `v3`), con lo que salga de la R2 y de los usuarios. |
| R3 (fecha por confirmar en clase) | Revisión docente de la V3. |
| ~20 oct | V4 final (tag `v4`) y, opcional, *thinking aloud* ronda 2. |
| 21 oct | Armar el PDF con la plantilla (sección 10). |
| 22 oct | Enviar el PDF por el formulario antes de las 23:59, con margen. |
