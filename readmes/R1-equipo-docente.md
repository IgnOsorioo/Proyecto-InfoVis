# R1 — Revisión con el equipo docente (entre V1 y V2)

> Campos de revisión según la pauta E1 (sección 3). Máximo 10 líneas en "decisiones". Lo que se anota aquí tiene que verse en la [V2](../v2/README.md): cada sugerencia se adopta **o se descarta con argumentos**.

| Campo | Valor |
|---|---|
| Fecha | [COMPLETAR] |
| Quiénes revisaron | El profesor del curso |
| Versión revisada | [V1](../v1/README.md) · tag `v1` |

## Preguntas que llevamos

[COMPLETAR: las preguntas de diseño que llevó el grupo, si las hubo]

## Síntesis de lo discutido (breve)

- **Sonificación pobre.** En la V1, el sonido era el dato mismo: la canción #1 del país. No había parámetros sonoros (intensidad, volumen, frecuencia) que codificaran datos. Faltaba implementar mejor la sonificación.
- **Más datos.** Se puede trabajar con más datos, incluso de otros datasets, años o formatos. Por ejemplo, lo más escuchado desde los 80, con charts de radio.
- **Interacción.**
  - La visualización no era interactiva hasta hacer click: una ventana de "Activar sonido" tapaba el mapa al entrar. Eso viola el principio de presentar primero lo general y profundizar con la interacción (el mantra de Shneiderman: *overview first, zoom and filter, then details on demand*).
  - Detectó un error de diseño: al elegir una canción en América y llevar el cursor hacia el panel lateral, el panel cambiaba. El cursor cruzaba otros países en el camino y cada uno reemplazaba la selección.

## Decisiones (máx. 10 líneas)

| Sugerencia / observación | Decisión | Por qué | Dónde se ve |
|---|---|---|---|
| El sonido era el dato (la canción) | Ajustada | Alterar el tono o el timbre de la canción deformaría el dato. Se mantiene sin cambios y se suma una capa de datos: aplausos (densidad = reproducciones semanales; murmullo en los niveles altos) y silbidos (en cuántos países es #1). | V2: modo "seguir una canción" |
| La interacción no empezaba hasta un click | Adoptada | Se eliminó la ventana inicial: el mapa se explora al entrar. El sonido se activa con el primer click o tecla, que es lo que exige el navegador, sin bloquear nada. | V2: carga inicial |
| Primero lo general (Shneiderman) | Adoptada | La vista general ya transmite un mensaje: cada país se pinta según si su #1 es mundial, compartido o propio. El panel resume el mundo y muestra la evolución desde 2017. | V2: mapa y panel al entrar |
| El panel cambiaba al ir hacia él | Adoptada | Para elegir un país hay que detener el cursor sobre él (140 ms). Al salir del mapa, el panel se queda con el último país. Pasar el cursor muestra; hacer click fija la canción. | V2: hover y click |
| Trabajar con más datos y datasets | Ajustada | En la V2 se suma un dato nuevo del mismo dataset: el puesto semanal de cada canción en cada país (3,6 M registros), más un buscador. Los datasets históricos (radio desde los 80) quedan para la V3 por tiempo. | V2: modo "seguir"; V3: datasets históricos |

## Notas individuales (opcional, para preparar el diálogo de la R3)

[Preguntas que hizo el profesor a cada integrante sobre decisiones de diseño, teoría o implementación, y qué conviene repasar]
