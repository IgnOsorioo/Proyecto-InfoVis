# V4 — La versión final

> **Estado: en desarrollo.** Base creada desde la V3 actual el 21 de octubre de 2026. El cierre, tras la R3 (última revisión con el equipo docente), y las decisiones grupales siguen pendientes.

Para empezar esta versión, copiar la anterior (`cp -R v3/index.html v3/css v3/js v4/`) y actualizar `index.html` de la raíz. Al cerrarla: completar este registro, crear el tag `v4` y marcarla como cerrada en la página de inicio.

## Identificación

| Campo | Valor |
|---|---|
| Versión | V4 |
| Fecha | [COMPLETAR] |
| Tag / commit | `v4` → [COMPLETAR] |
| Ver en línea | https://ignosorioo.github.io/Proyecto-InfoVis/v4/ |

## Evidencia visual y sonora

[COMPLETAR] Capturas en `v4/evidencia/` y video corto con audio de esta versión.

## Qué cambió respecto a V3 (máx. 8 líneas)

[COMPLETAR]

## Por qué cambió — el rationale (máx. 12 líneas)

[COMPLETAR] Anclado en principios del curso, lo discutido en las revisiones, feedback de usuarios o evidencia de los datos.

## Qué se descartó (máx. 5 líneas)

[COMPLETAR]

## Balance del recorrido

[COMPLETAR] Qué mejoró desde V1 y qué decidieron no cambiar, y por qué. Al cerrar la V4, la raíz del sitio debería llevar directo a esta versión, que es el enlace de "versión final" para la entrega.

## Aporte individual: contexto y cobertura de los indicadores

- **Problema:** según la observación de R3 comunicada por el integrante, no era suficientemente claro qué países y fuentes usan los indicadores ni cuándo difieren de la región enfocada. No se atribuye una cita literal ni una prueba con usuarios.
- **Decisión:** el control «ⓘ Cobertura y metodología» comparte la fila de créditos sin añadir altura a la visualización. Abre una sección debajo de la vista principal, sin modal ni superposición, y permite volver con botón o Escape. Los ámbitos detallados del mapa, titular, diversidad y alcance se muestran a pedido; solo queda un aviso breve cuando hay sustitución regional o un titular pendiente. Se explican la muestra fija y las diferencias de fuentes e identidad de canción.
- **Fundamento:** integridad de datos, contexto y consistencia entre etiquetas y cifras; explicación a pedido para reducir la carga cognitiva.
- **Base:** copia de `v3/index.html`, `v3/css/` y `v3/js/`, conservando las rutas a datos compartidos. No se modifica V3 ni se cambian los cálculos, el estado global, el mapa o el audio.
- **Archivos del aporte:** nuevos `js/contexto.js` y `css/contexto.css`; integración en `index.html`, `js/main.js` y una notificación al finalizar el dibujo en `js/panel.js`. Este README conserva los campos grupales pendientes.
- **Limitaciones:** el panel puede conservar un titular anterior mientras se actualiza; se informa ese estado sin cambiar su comportamiento. La muestra no es representativa del planeta; identidad y resolución de las métricas difieren. No se corrigen otros problemas heredados de V3.
- **Validación:** copia inicial de los 12 archivos verificada byte por byte contra V3; sintaxis y rutas locales correctas. En la primera integración pasaron 24 combinaciones de granularidad/región con DOM simulado. Tras el ajuste de diseño, Edge headless compara V3/V4 en 1920×1080, 1366×768 y 1280×720: estado inicial, África y ficha abierta; comprueba que no cambien posición y tamaño de mapa, eje, regiones y panel, y prueba Enter, Escape y retorno de foco. Script sin dependencias: `node v4/pruebas/validar-layout.cjs`, desde la raíz; capturas en `v4/evidencia/contexto-layout/`. Se usa movimiento reducido para comparar estados estables. No se valida aquí la calidad sonora, el recorrido completo ni el diseño móvil. No hay resultados de usuarios atribuidos a esta versión.
