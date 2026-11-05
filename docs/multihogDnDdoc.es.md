# Multihog D&D Framework (Documentación Técnica)

Bienvenido a Multihog D&D Framework, una plataforma de rol con IA orientada a la simulación, altamente modular y personalizable. Tu imaginación es el único límite.

Este documento está redactado para que el Acompañante de Aventura (o un nuevo jugador) pueda entender **qué es el sistema**, **cómo funciona exactamente un turno** y **cómo utilizar cada función principal** sin inventar comportamientos.

## NOTA PARA EL ACOMPAÑANTE DE AVENTURA

Cuando el **Modo Tutorial** está activado, este documento se inyecta en cada solicitud del Acompañante de Aventura como su fuente de verdad para explicar el framework. El Modo Tutorial no crea un bot separado ni elimina las demás capacidades del Acompañante.

La vista CHAT del Acompañante de Aventura se puede desacoplar en un panel flotante arrastrable y redimensionable mediante el control **⧉** en escritorio. En dispositivos móviles, siempre utiliza la presentación flotante a pantalla completa. Al volver a acoplarlo, la conversación activa se traslada de nuevo al panel del Rastreador de Estado, y al cerrar el CHAT se vuelve a acoplar automáticamente.

El **Acompañante de Aventura solo puede realizar exactamente tres acciones** cuando el lenguaje conversacional demuestra una intención clara:

1. Enviar un comando directo al **Rastreador de Estado** para corregir o actualizar el estado mecánico de la campaña.
2. Enviar un comando directo al **Agente de Lorebook** para crear o actualizar entradas de lore.
3. **Actuar por el jugador** enviando su siguiente turno. Cuando el modo CYOA está activo, puede seleccionar uno de los botones CYOA actuales o escribir a través de la entrada de chat normal de SillyTavern. Cuando el modo CYOA está inactivo, envía la acción a través del chat normal.

Estas tres acciones constituyen el límite estricto. El Acompañante no puede operar controles de interfaz de usuario de Multihog (drawers de ajustes, editores de relaciones, paneles de fichas PNJ, UIs de inventario, selectores de módulos, ni rutas de menú inventadas). Los cambios de campaña o lore deben canalizarse a través de comandos al Rastreador de Estado / Agente de Lorebook.

---

## Nota del Diseñador (Multihog)

Este sistema no es una versión 1:1 ni de D&D 5e ni de 3.5e. Es un sistema híbrido optimizado. Por ejemplo, los ataques por asalto se reducen para disminuir la carga cognitiva del modelo, asegurando una alta fiabilidad. Esta filosofía de "recortar donde tenga sentido" se aplica en todo el sistema. Por ejemplo, el combate utiliza BAB (Ataque Base) basado en 3.5e/Pathfinder, pero el LLM puede utilizar conjuros de 5e.

### Lo que ES este sistema
Multihog D&D Framework es una plataforma centrada en la simulación rigurosa. Busca ofrecer una experiencia donde las decisiones importan, las consecuencias son reales y el fallo es completamente posible.

### Lo que NO ES este sistema
No es un motor de tablero virtual fiel 1:1 a D&D. D&D es solo un medio para un fin, un conjunto conveniente de restricciones porque está arraigado en casi todos los LLM de manera extrema. Es más similar a los juegos del motor Infinity Engine (como Icewind Dale o Baldur's Gate 1 y 2), donde se tomaron libertades para adaptar las reglas a un motor en tiempo real con pausa.

---

## Componentes Principales

1. **El Prompt del Sistema** — El cerebro del Director de Juego (GM) / Narrador; la lógica de juego reside aquí.
2. **El Rastreador de Estado (State Tracker)** — El "contable" mecánico; mantiene los HP, inventario, tiempo, combate y más alineados con la historia.
3. **RNG Híbrido** — Colas de dados deterministas y/o dados por llamadas a funciones (tool calls) para que el mundo tenga física real sin blindaje de guión.
4. **El Agente de Lorebook** — El bibliotecario; registra PNJs, ubicaciones, facciones, eventos y relaciones para la memoria a largo plazo.
5. **Progresión del Mundo** — Simulación macroscópica del mundo fuera de pantalla según el tiempo transcurrido en el juego.

Juntos abordan las cuatro fallas clásicas del rol con LLM: inventario/conjuros olvidados, pérdida de contexto a largo plazo, victoria inevitable del jugador y un mundo estático.

 Extensión recomendada: **[Summaryception](https://github.com/Lodactio/Extension-Summaryception)** — compresión de contexto que combina perfectamente con el Agente de Lorebook.

---

## Modelos Recomendados

| Rol | Sugerencia | Notas |
|------|------------|--------|
| Narrador / Director de Juego | MiMo 2.5 Pro o DeepSeek 4 Pro (vía OpenRouter) | Requiere **Tool Calling** si usas RNG Híbrido (modo llamadas a herramientas). |
| Rastreador de Estado y Agente | Gemini 3.5 Flash-Lite (o 3.6 Flash) | Económico y preciso para pases de extracción de estado y lore. |
| Narrador de Combate (opcional) | Gemini 3.6 Flash con pensamiento Medio | Usa **Combat API Override** para cambiar a un modelo más rápido en `[COMBAT]`. |

---

## Configuración Inicial

### Personaje Narrador
Crea (o carga) una ficha de personaje en SillyTavern que actúe como narrador (ej. "Motor de Simulación" o "Director de Juego"). El framework inyecta la verdad mecánica en los prompts; la ficha aporta el tono y encuadre narrativo.

### Activar el Framework
Activa la extensión en los ajustes. Con el **Modo de Prompt Personalizado** desactivado, el framework escribe su prompt ensamblado de GM en el **Quick Prompt → Main** de SillyTavern.

### Acción Instantánea (Instant Action)
En un rastreador vacío, usa Acción Instantánea / Inicio Rápido por género (**Fantasía**, **Moderno**, **Ciencia Ficción**, **Terror**). Elige un género, genera un nombre y selecciona **Comenzar Acción Instantánea**. El pipeline:
1. Aplica la configuración actual del Narrador.
2. Genera una ficha de personaje en el Rastreador de Estado.
3. Crea una ficha de personaje para el Agente de Lorebook y selecciona una persona en ST con el mismo nombre.
4. Envía el mensaje de chat `Begin the adventure`.

---

## Cómo Funciona un Turno

### Antes de que el Narrador responda (interceptor)
Al enviar un mensaje, el framework localiza el último mensaje del usuario y puede anteponer:
- `[PLAYER_CHARACTER]` (si está vinculado)
- `[NPC_RELATIONS]`
- Un bloque de **Cola RNG** (cuando aplica RNG determinista)
- `### STATE MEMO (DO NOT REPEAT)` — el estado rastreado del turno anterior
- Contexto de misiones / plazos límite
- Inyecciones de lore activo / Informe del Mundo

### Después de que el Narrador responde
Al finalizar la generación, el Rastreador de Estado (State Tracker) analiza la narrativa y actualiza la nota de estado (State Memo) para el siguiente turno.

---

## El Rastreador de Estado (State Tracker)

El Rastreador de Estado es el contable del sistema. Mantiene la coherencia mecánica de la historia a través de módulos:

### Módulos Estándar

#### `[CHARACTER]`
Ficha principal del jugador: HP, línea de combate (BAB, totales de ataque), CA base/total, equipamiento, competencias, atributos, salvaciones, habilidades y estado.

#### `[PARTY]`
Compañeros activos en el grupo (máximo 5 + `{{user}}`).

#### `[BENCHED PARTY]`
Miembros del grupo separados temporalmente en la reserva.

#### `[COMBAT]`
Enemigos activos, contador de asaltos, HP por combatiente, ataques, defensas, salvaciones y conjuros. Finaliza el combate con:
```
[COMBAT]END_COMBAT[/COMBAT]
```

#### `[INVENTORY]`
Dividido en **Gear:** (Equipamiento) y **Other Items:** (Otros Objetos).

#### `[ABILITIES]` / `[SPELLS]`
Habilidades de clase y casillas de conjuros por nivel.

#### `[TIME]`
Reloj del mundo y registro del último descanso largo.

#### `[QUESTS]`
Misiones aceptadas, objetivos y coeficientes de frustración de PNJs.

---

## Agente de Lorebook (Lorebook Agent)

El Agente de Lorebook actúa como el bibliotecario del mundo. Examina la narrativa reciente a intervalos regulares (cada N turnos) para crear, actualizar o archivar entradas de personajes, lugares, facciones y eventos en los libros de lore de la campaña.

### Ritmo del agente de lore

Un solo dial, en el cajón «Rendimiento (modelo local)» de Conexiones y Modelos, gobierna a la vez la **frecuencia** (cada cuántos mensajes corre el agente) y las **vueltas** de su bucle texto-acción: forman un par coherente `vueltas = frecuencia + 2` (un commit por pasada, un turno investigado por mensaje acumulado y un margen) y NO son mandos independientes. Las posiciones de la tabla son (1, 3), (2, 4) y (3, 5) —esta última es la de fábrica—, con ~30, ~15 y ~9 llamadas típicas por 10 turnos respectivamente (el tooltip de cada una cita su coste real). Un ritmo más lento retrasa el lore en contexto a cambio de menos llamadas; el backlog completo solo se procesa en el modo «Desde la última ejecución» (con «Número de turnos fijo» no hay acumulado y el dial solo cambia la frecuencia).

Si los valores guardados no coinciden EXACTAMENTE con una fila —por ejemplo las antiguas «cada turno con 5 vueltas» (1, 5)—, el dial muestra **«Personalizado (avanzado)»** y revela los dos campos sueltos con sus valores intactos: abrir los ajustes no reescribe nada y elegir «Personalizado» tampoco escribe; los sueltos solo persisten enteros dentro de sus cotas (1-6 y 2-8) y el recorte se aplica al salir del campo, avisando. «Restaurar valores de fábrica» devuelve (3, 5). El ritmo nuevo surte efecto en la siguiente generación; «Ejecutar ahora» y los ticks de mapa y mundo no se ven afectados.

Aviso honesto (conocido y aceptado, no corregido en esta ola): si las vueltas se agotan sin que el agente llegue a consolidar, la pasada termina sin aviso y la marca de agua avanza — el trozo de narrativa no registrado se pierde. La regla del par lo mitiga, no lo elimina.

---

## Progresión del Mundo (World Progression)

Cada X horas dentro del juego (por defecto 24h), el componente de Progresión del Mundo genera e inyecta un Informe del Mundo sobre acontecimientos macroscópicos que ocurren fuera de la vista del jugador.

---

## Comandos de Barra (Slash Commands)

| Comando | Propósito |
|---------|-----------|
| `/statetracker` (`/st`) | Actualización manual del Rastreador de Estado / auditoría completa |
| `/lorebookagent` (`/lbagent`, `/la`, `/router`) | Pase manual del Agente de Lorebook / guardar / comando directo |
| `/roll` (`/r`) | Tirada de dados manual |

---

## Comunidad y Discord
Si tienes preguntas sobre el framework, puedes consultar en el foro de extensiones del Discord oficial de SillyTavern: https://discord.gg/sillytavern
