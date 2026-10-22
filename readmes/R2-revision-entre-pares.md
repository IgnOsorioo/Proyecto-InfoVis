# R2 — Revisión entre pares (entre V2 y V3)

> En la R2 cada grupo presenta su V2, **recibe** feedback de otro grupo y **da** el suyo. El feedback que *damos* también se evalúa (10 % de la nota): tiene que ser específico, anclado en los principios del curso y constructivo. Llevar la [V2](../v2/README.md) funcionando y 2–3 preguntas concretas.

## Preguntas que llevamos

Las mismas dudas de fondo que en la R1, ahora planteadas al otro grupo:
1. **¿Qué hacemos con los países y continentes sin datos?**
2. **¿Cómo sonificamos datos?** En la R1 el profesor había dicho que la canción es el dato, no una sonificación.

---

## Parte A — Feedback que recibimos sobre nuestra V2

| Campo | Valor |
|---|---|
| Fecha | 8 de octubre de 2026 |
| Versión revisada | [V2](../v2/README.md) · tag `v2` → `a4ad3d9` |
| Grupo que nos evaluó | [COMPLETAR: nombre o número; es el mismo grupo cuyo proyecto evaluamos, el de Starbucks] |
| Ayudante | El ayudante estaba en la sala con todo el curso, sin supervisar de cerca nuestra mesa; no registramos su nombre. |

### Síntesis de lo discutido (breve)

- **El play confundía.** Como la interfaz se parece a la de Spotify (a propósito), el play y su barra se leían como la reproducción de la canción: le daban play al tiempo esperando que cambiara la canción, y al revés.
- **La ausencia de datos también es un dato.** Sugirieron mantener los países y continentes sin datos: que falten cuenta algo, por ejemplo limitaciones de acceso o de mercado.
- **Detalle al pasar el cursor.** En su scatter plot, al acercarse a un punto se veía el detalle de cada bebida. Sugirieron hacer lo mismo en nuestro mapa.
- **Aplausos para el alcance:** usar los aplausos para la popularidad de la canción en el mundo.
- **Colores corporativos de Spotify**, ya que los datos vienen de ahí.
- La sonificación les pareció bien encaminada.

### Decisiones (máx. 10 líneas)

| Feedback recibido | Decisión | Por qué | Dónde se ve |
|---|---|---|---|
| El play se leía como la canción | Adoptada | La barra fina tenía la forma de la barra de progreso de un reproductor. Ahora es un eje con datos (el área: % de países que escucha el #1 global) y el botón dice «Avanzar en el tiempo». | V3: eje de tiempo |
| La ausencia de datos es un dato | Adoptada | El vacío pasa a ser parte del relato: contorno sin relleno, **estática de radio** al pasar el cursor (como una radio que no sintoniza) y marcas de cuándo llega Spotify. | V3: mapa, eje y sonido |
| Detalle al pasar el cursor | Ajustada | En vez del detalle de la canción, que ya está en el panel, un recuadro con el **top 3 del país** junto al cursor (*details on demand*). | V3: recuadro |
| Aplausos para el alcance | Ajustada | En la V2 seguían las reproducciones semanales. Ahora aplaude una persona por cada país donde la canción es #1, con el murmullo de un estadio sobre la mitad (timbre). La canción no se altera (R1). | V3: sonido |
| Colores de Spotify | Ajustada | Solo el verde, y solo para «#1 global»: un único acento sobre grises se destaca de forma preatentiva. | V3: mapa y panel |

---

## Parte B — El feedback que dimos al otro grupo (sección propia en el documento)

### El proyecto evaluado (máx. 5 líneas)

Grupo [COMPLETAR]. Su visualización mostraba el azúcar y otra información nutricional de las bebidas de Starbucks. Estaba funcionando:
- la vista principal era un **scatter plot**, que al acercarse a un punto mostraba el detalle de cada bebida;
- ya sonificaba el azúcar como el sonido de echarla en un vaso.

### El feedback que dimos (máx. 12 líneas)

1. **Forma.** Un scatter plot como vista principal exige capacidad de análisis para sacar conclusiones. Para un tema de café, propusimos una forma más directa, cercana a una infografía:
   - el tamaño del vaso es el formato de la bebida (ml);
   - el vaso se llena según el azúcar.

   Respondieron que ya lo habían pensado y lo estaban implementando.
2. **Métrica.** Usar la **concentración** de azúcar (g por ml del formato) y no los gramos totales. Un vaso más grande siempre tiene más azúcar, así que sin normalizar la comparación engaña.
3. **Menos es más.** Quitar la separación entre grasas saturadas e insaturadas: agregaba categorías que no servían al mensaje del azúcar (saturación).
4. **Color.** La paleta no evocaba una cafetería. Los colores propios de la marca (verde, crema) refuerzan el contexto sin texto (congruencia semántica).
5. **Sonido.** El sonido del azúcar cayendo nos pareció adecuado: una metáfora directa del dato.

### Lo que nos llevamos para nuestro proyecto (máx. 5 líneas)

- **El detalle al pasar el cursor de su scatter** (idea del grupo [COMPLETAR]) lo adaptamos como el recuadro con el top 3 de cada país (V3).
- **Normalizar antes de comparar**, como el azúcar por ml, confirmó contar el **% de una muestra fija de 52 países** y no países a secas (V3).
- **El color con identidad:** sugerimos lo mismo que nos sugirieron a nosotros, y lo aplicamos con un solo acento verde.

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
