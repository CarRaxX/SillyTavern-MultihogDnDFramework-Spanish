# Multihog D&D Framework (Español)

*Un motor de simulación y plataforma de juego de rol basado en D&D para SillyTavern.*

Este framework transforma fundamentalmente SillyTavern en un sistema similar a AI Dungeon, ¡pero con mecánicas reales y consecuencias genuinas! Comenzó como un modesto "Rastreador de Estado RPG", pero desde entonces se ha expandido como un ambicioso motor de juego, sistema de simulación y marco de trabajo RPG modular con el que puedes crear prácticamente tu propio juego. La integridad mecánica y la profundidad de simulación son la clave aquí. No es una filosofía basada únicamente en la narrativa; busca una simulación rigurosa y detallada. La columna vertebral del sistema es la simulación del tiempo.

Además de la fantasía clásica, el sistema funciona de manera excelente en escenarios de "slice of life", entornos modernos o cualquier otra temática imaginable, por lo que no estás limitado a magos y trasgos. Todo es TOTALMENTE personalizable y compatible con contenido personalizado ("homebrew"), e incluye asistentes de IA para que no se requieran conocimientos técnicos avanzados.

---

<p align="center">
  <img src="https://github.com/user-attachments/assets/878e437c-e7b4-4140-94b9-f9a14aab1002" width="60%" alt="Ficha de personaje básica" />
  <br>
  <em>Una ficha de personaje básica</em>
</p>

---

### Componentes Principales:

1. 🖥️ **Rastreador de Estado RPG** — Extrae y mantiene puntos de vida (HP), inventario, grupo, estados/beneficios, experiencia (XP), conjuros y más mediante un modelo de pase secundario dedicado. Inyecta una nota de estado continua (State Memo) en cada prompt para mantener a la IA (y a ti) orientados.
2. 🎲 **Sistema RNG Híbrido** — Un enfoque de motor dual para la física de juego de mesa:
   - Cola RNG: Dados deterministas pregenerados e inyectados en cada turno. Es más económico que usar llamadas a funciones (tool calls) y muy fluido en combate.
   - RNG por Llamadas a Funciones (Tool Calls): Activa una lógica de compromiso donde la IA debe declarar una Clase de Dificultad (CD) antes de ver el resultado, evitando completamente el sesgo de complacencia.
3. 🤖 **Agente de Lorebook** — Crea, activa/desactiva, actualiza y consolida automáticamente las entradas del Lorebook, garantizando la memoria a largo plazo a pesar del resumen de contexto.
4. 🌍 **Progresión del Mundo** — Un sistema que genera informes diarios (o con la frecuencia deseada) sobre asuntos de PNJs y del mundo utilizando las entradas de lore existentes y una estructura ("esqueleto") opcional del mundo creada previamente. El mundo evoluciona independientemente del jugador.

En conjunto, estos componentes resuelven los cuatro problemas clásicos de los juegos de rol con modelos de lenguaje: el olvido del inventario/conjuros por la IA, la pérdida de contexto a largo plazo, la victoria garantizada del jugador (el "blindaje de guión") y un mundo estático fuera de la burbuja inmediata del jugador.

---

## Características Principales

- **Más de 20 etiquetas de renderizado** con soporte integrado en línea y biblioteca de vista previa en tiempo real.
- **Configuración mediante IA** — genera campos personalizados y secciones del prompt del sistema a partir de descripciones en lenguaje natural.
- **Física de motor dual**: Cola determinista para combate rápido y llamadas a herramientas interactivas para pruebas de habilidad narrativas.
- **HUD Flotante y Arrastrable** con barras de HP, pips de conjuro, píldoras de estado coloreadas, insignias de alerta y monedas de economía.
- **Rastreo automático de casillas de conjuro** mediante pips 🔵 en la interfaz.
- **Decaimiento temporal de estados** a través de rastreo delta [TIME]; los estados expiran automáticamente con el paso del tiempo dentro del juego.
- **Sin escalado de enemigos** — la lógica de la realidad prevalece; las consecuencias se aplican de forma coherente según el entorno.
- **Conmutación automática de modelo** para utilizar un modelo ligero en la extracción de estado y un modelo narrativo para la historia.
- **Modo de auditoría de contexto completo** con fragmentación automática para historiales de chat extensos.
- **Campos personalizados, temas y secciones reordenables**; personaliza visualmente y añade los datos que desees.
- **Enlaces automáticos a hechizos de D&D Wikidot** para consultar detalles con un solo clic.
- **Soporte para dispositivos móviles** (accesible desde el menú de la varita).
- **Comunicación directa con el modelo rastreador (💬)** para editar o añadir datos fácilmente mediante conversación.
- **Sistema de incorporación (Onboarding)** — genera un personaje aleatorio o describe uno a la IA.
- **Guardado de perfiles** — cambia entre múltiples campañas sin perder el estado.
- **Adaptable a reglas caseras (Homebrew)** con asistentes de IA integrados.
- **Rastreo de contexto a largo plazo** mediante el Agente de Lorebook y el Motor del Mundo.
- **Generación de retratos por IA** integrada de forma gratuita a través de Pollinations.ai.
- **Renderizado automático de monedas en el inventario** (oro, plata, bronce, dólares).
- **Importación de fichas de personaje** — importa cualquier personaje existente en la historia como PNJ.
- **Asistente de Sistemas de Juego por IA** — describe cualquier mecánica en lenguaje natural y la IA creará la estructura del prompt y del módulo.
- **Sistema de relaciones, amistad y afecto** estilo simulación de vida / citas.
- **Exportación completa de tu configuración como un "Cartucho de Juego".**
- **Soporte para tiradas d100 (basadas en porcentajes).**
- **Modo de Visualización en Tiempo Real** — convierte el Agente de Lorebook en un visor visual que genera imágenes de la escena actual y retratos de entidades presentes.
- **Acción Instantánea** — comienza a jugar con un solo botón.
- **Acompañante de Aventura (Adventure Companion)** — aprende a usar el framework con el modo tutorial opcional, consulta sobre tu campaña o deja que realice tu siguiente turno.
- **Pensamiento del modelo por trabajo** — presupuesto o apagado del razonamiento oculto para cada trabajo de fondo, con la ruta efectiva a la vista.
- **Contrato bilingüe tolerante** — acepta en español o en inglés las claves, categorías y estados del contrato, sin tocar nunca nombres propios ni texto narrativo.

---

## Instalación

1. Ve al menú de extensiones de SillyTavern.
2. Haz clic en "Install extension" en la parte superior.
3. Introduce la URL de este repositorio: `https://github.com/CarRaxX/SillyTavern-MultihogDnDFramework-Spanish`.

## Guía de Uso

1. **Configuración Inicial:** Utiliza los botones de arquetipo en el rastreador para generar un nuevo personaje o pega una ficha existente en la "Vista Raw". Crea una ficha para tu narrador (por ejemplo, "Motor de Simulación" o "Director de Juego").
2. **Seguimiento Automático:** A medida que juegas, la extensión analiza inteligentemente las respuestas del asistente, detectando pérdidas de vida, nuevo botín o desencadenantes de combate.
3. **Inyección de Prompts y Ejecución:** La nota de estado (State Memo) y la cola RNG se inyectan en tu prompt saliente para actuar como la fuente de verdad.
4. **Progresión del Mundo:** Opcionalmente, configura el componente de Progresión del Mundo para recibir informes periódicos sobre sucesos en el universo de juego.

---

## Pensamiento del modelo por trabajo

El razonamiento oculto del modelo local se goberna trabajo a trabajo en **Ajustes → Conexiones y Modelos → ⚙️ Rendimiento (modelo local)**. Cada uno de los ocho trabajos de fondo tiene su propio selector:

| Modo | Qué envía | Para qué |
|------|-----------|----------|
| **Herdar** (defecto) | Nada: la petición sale exactamente igual que siempre | Mientras no se mida nada |
| **Presupuesto** | `reasoning_budget_tokens` y su alias `thinking_budget_tokens`, con el mismo valor | Recortar el borrador interno sin quitarlo |
| **Desactivar** | `reasoning_effort: "none"` y `chat_template_kwargs: { enable_thinking: false }` | Sólo la transcripción del memo del Rastreador y la compresión del historial de Evolución de Mapas |

Cuatro cosas que hay que saber antes de tocar nada:

- **Sólo manda en la ruta directa.** El ajuste fino se aplica a los cuerpos que arma la propia extensión, así que la conexión del trabajo debe estar en **OpenAI compatible**. Por **API Principal** o **Perfil** manda SillyTavern, que no reenvía campos que no conoce, y sigue aplicándose el `custom_include_body` global sobre todas las peticiones por igual. Cada fila del cajón muestra la **ruta efectiva** de su trabajo para que no se mida nada a ciegas.
- **Requisito de servidor:** llama.cpp **b9982** o más nuevo. En binarios anteriores el presupuesto es inocuo (se ignora sin error); `reasoning_budget_tokens` es el campo canónico y `thinking_budget_tokens` viaja como alias para versiones viejas. `enable_thinking` se manda como booleano: como cadena el servidor responde 400.
- **Los trabajos de juicio no se apagan.** El Agente de Lorebook, el Actualizador y la Evolución de Mapas, World Progression y la Revisión de Estado Completa y la auditoría del Rastreador sólo admiten **Herdar** o **Presupuesto**, tanto en la interfaz como al validar los ajustes: su salida es JSON o reconstrucción de secciones y sin pensamiento sube el fallo de contrato.
- **Coste real del ahorro.** Con el modelo local en un solo slot cada petición re-prefila la conversación: lo que se ahorra al quitar pensamiento se nota en varias pasadas, no en una.

Todo vive en una sola clave de ajustes (`localThinkingPolicy`). **Restaurar valores heredados**, borrar la clave o revertir la rama devuelve el comportamiento anterior sin migración inversa.

> **Experimento futuro (fuera de esta ola):** fijar la forma de la salida con una gramática **GBNF** en el propio servidor en vez de pedir el contrato por prompt. Es tocar el motor y necesita su propia especificación.

## Contrato bilingüe tolerante

El contrato de salida está escrito en español, pero el modelo contesta con las claves, categorías y estados en inglés o con acentos saltados a veces. La extensión pliega esos tokens de máquina contra una tabla conocida de alias (español ↔ inglés, sin mayúsculas ni diacríticos) antes de validar, tanto en las etiquetas del rastreador como en el JSON de mapas y en el del compresor de historial. El plegado **nunca** toca texto narrativo, títulos ni nombres propios, y una clave desconocida queda intacta: ningún token inglés deja de aceptarse por este cambio.

---

## Modelos Recomendados

| Rol | Sugerencia | Notas |
|------|------------|--------|
| Narrador / Director de Juego | MiMo 2.5 Pro o DeepSeek 4 Pro (vía OpenRouter) | Requiere **Tool Calling** si utilizas el modo RNG por llamadas a funciones. |
| Rastreador de Estado y Agente | Gemini 3.5 Flash-Lite (o Gemini 3 Flash) | Extremadamente económico y preciso para tareas de extracción y lore. |
| Narrador de Combate (Opcional) | Gemini 3.5 Flash con pensando en Medio | Activa el **Combat API Override** para cambiar automáticamente de modelo durante el combate. |

---

## ¿Preguntas o Sugerencias?
Puedes encontrar más información y debates en la comunidad de SillyTavern.
