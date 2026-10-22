# R2 — Revisión entre pares (entre V2 y V3)

> En la R2 cada grupo presenta su V2, **recibe** feedback de otro grupo y **da** el suyo. El feedback que *damos* también se evalúa (10 % de la nota): tiene que ser específico, anclado en los principios del curso y constructivo. Llevar la [V2](../v2/README.md) funcionando y 2–3 preguntas concretas.

## Preguntas que llevamos

[COMPLETAR: las preguntas que llevamos el 8 de octubre sobre la V2. Ojo: las del commit `23df7bb` (15-oct) hablan de funciones de la V3, como el tono por continente y el país fijado]

---

## Parte A — Feedback que recibimos sobre nuestra V2

| Campo | Valor |
|---|---|
| Fecha | 8 de octubre de 2026 |
| Versión revisada | [V2](../v2/README.md) · tag `v2` → `a4ad3d9` |
| Grupo que nos evaluó | [COMPLETAR] |
| Ayudante supervisor | [COMPLETAR] |

### Síntesis de lo discutido (breve)

- **La sonificación funcionaba.** Sugirieron usar los aplausos para el **alcance** de la canción, es decir, cuán popular es en el mundo.
- **El play y la barra de tiempo confundían:** se leían como la reproducción de la canción, no como el avance de las fechas.
- **Colores corporativos de Spotify**, ya que los datos vienen de ahí.
- **Mantener los países sin datos.** Que no haya datos también es un dato: Rusia, gran parte de África.
- [CONFIRMAR] El gráfico de continentes del panel no se entendía. Pidieron un recuadro con el top 3 del país al pasar el cursor.

### Decisiones (máx. 10 líneas)

| Feedback recibido | Decisión | Por qué | Dónde se ve |
|---|---|---|---|
| Aplausos para el alcance | Ajustada | En la V2, los aplausos seguían las reproducciones semanales. Ahora aplaude **una persona por cada país donde la canción es #1** (densidad = ritmo) y sobre la mitad se suma el murmullo de un estadio (timbre). La canción sigue sin alterarse (decisión tras la R1). | V3: sonido |
| El play se leía como la canción | Adoptada | La barra fina tenía la forma de la barra de progreso de un reproductor. Ahora es un eje con datos (área: % de países que escucha el #1 global) y el botón dice «Avanzar en el tiempo». | V3: eje de tiempo |
| Colores de Spotify | Ajustada | Solo el verde, y solo para «#1 global». Un único acento sobre grises se destaca de forma preatentiva. Copiar toda la marca no aporta al dato. | V3: mapa y panel |
| Mantener los países sin datos | Adoptada | El vacío pasa a ser parte del relato: contorno sin relleno, estática de radio al pasar el cursor y marcas de cuándo llega Spotify a cada región. | V3: mapa, eje y sonido |
| Gráfico de continentes / top 3 [CONFIRMAR] | Adoptada | Se quitó el gráfico de continentes (menos es más) y el top 3 aparece a pedido junto al cursor (*details on demand*). | V3: panel y recuadro |

---

## Parte B — El feedback que dimos al otro grupo (sección propia en el documento)

### El proyecto evaluado (máx. 5 líneas)

Grupo [COMPLETAR]. Su visualización mostraba el azúcar y otra información nutricional de las bebidas de café de Starbucks. Estaba funcionando:
- la vista principal era un **scatter plot**;
- la sonificación era el sonido del azúcar al caer en un vaso.

### El feedback que dimos (máx. 12 líneas)

1. **Color.** La paleta no evocaba una cafetería ni a Starbucks. Si el tema es Starbucks, los colores propios (verde, crema) refuerzan el contexto sin texto (congruencia semántica del color).
2. **Forma.** El scatter plot costaba leerlo al principio. Propusimos vasos que se llenan según el azúcar: el mapeo es más directo y la vista general se entiende por sí sola.
3. **Menos es más.** Sugerimos quitar las grasas, separadas en saturadas e insaturadas. Agregaban categorías que no servían al mensaje del azúcar (heurística de saturación).
4. **Métrica.** Usar la **concentración** de azúcar (g / ml del formato) y no los gramos totales. Un vaso más grande siempre tiene más azúcar, así que los gramos sin normalizar engañan al comparar.
5. **Sonido.** [CONFIRMAR: qué les dijimos del sonido del azúcar cayendo]

### Lo que nos llevamos para nuestro proyecto (máx. 5 líneas)

- **La normalización confirmó una decisión propia.** Igual que el azúcar por ml, contamos **% de una muestra fija de 52 países** y no países a secas, para que la cifra no cambie solo porque se suman países (V3).
- **El color con identidad.** Sugerimos lo mismo que nos sugirieron a nosotros, los colores de Spotify, y lo aplicamos con un solo acento verde.

---

### Guía rápida para dar buen feedback (para la sesión)

La pauta lo dice así: "se ve raro" no es feedback; "el eje truncado exagera la diferencia entre categorías" sí lo es. Revisar en el proyecto del otro grupo:

- **Mensaje:** ¿la vista general transmite algo por sí sola, sin que nadie la explique?
- **Forma:** ¿el tipo de gráfico es adecuado para la pregunta? (Cleveland y McGill: posición > largo > ángulo > área > color.)
- **Errores comunes:** ejes truncados, doble eje, 3D innecesario, área escalada por radio.
- **Color:** ¿tiene un propósito (categórico, secuencial o divergente)? ¿Se distingue con daltonismo? ¿Hay demasiadas categorías?
- **Jerarquía y orden:** ¿lo importante resalta (atributos preatentivos)? ¿Está alineado? ¿Tiene la tinta justa (*data-ink ratio*)?
- **Interacción:** ¿sigue el mantra de Shneiderman? ¿Es descubrible sin instrucciones? ¿Va más allá de lo que Plotly trae por defecto?
- **Sonido:** ¿qué dato codifica? ¿Usa tono, ritmo o timbre, o solo volumen? ¿Se entiende sin explicación?
- **Heurísticas de Zuk-Carpendale** que fallen: importancia del dato poco clara, distancias que engañan, falta contexto, saturación, el color confunde, interacción no descubrible, sonido incomprensible.
