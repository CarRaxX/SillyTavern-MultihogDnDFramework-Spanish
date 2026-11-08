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

## Techos de prompts

Sin caché de prefijo, cada token se paga en cada re-prefill. Los «Techos de prompts» (cajón **⚙️ Rendimiento (modelo local)** → bloque **🧱 Techos de Prompts**) ponen topes en tokens estimados (4 caracteres ≈ 1 token) a los tres bloques largos que viajan a los modelos, para que una cola de partida no infle cada petición. Los valores de fábrica (1600 / 4096 / 5) no recortan nada en el uso medio medido (memo ≈358 tok, informes de mundo de 300-400 tok).

| Campo (clave) | Fábrica | Qué topa | Reglas |
|---|---|---|---|
| Memo de Estado (`rpg_ceiling_tracker_memo`) | 1600 (800-4000) | El memo de estado que ven el Rastreador y el Narrador | En el **rastreador** solo caen estados históricos `TRACKER STATE -N` enteros del más viejo al más nuevo; el `TRACKER STATE 0` **nunca se corta** (el modelo lo reemite en las revisiones y una sección perdida sería irreversible). En el **narrador** sí caen bloques `[TAG]…[/TAG]` completos del último al primero, con preámbulo y cabecera intactos. |
| Bloque de Mundo (`rpg_ceiling_world_block`) | 4096 (2048-8192) | El bloque «World Progression Reports» del narrador y el historial del trabajo de Mundo | Caen informes `### […]` ENTEROS, el más viejo primero; cabeceras, preámbulos y dossiers de ubicación no se tocan. 0 = sin techo. |
| Reportes Históricos (`rpg_ceiling_world_history`) | 5 (3-10) | Nº de reportes históricos del mundo que lee el trabajo de World Progression | Sustituye al «0 = incluir todos» del Retroceso Histórico: con retroceso activo se usa el **mínimo** de los dos (retroceso antiguo respetado). 0 = sin techo (todos). Con >5 reportes guardados este tope SÍ cambia el trabajo: es su objetivo. |

Honestidades debidas: `chars/4` **subestima el español y el JSON un ~15-30 %**, así que el techo real es mayor que el nominal (R3). Ningún recorte es silencioso: cada recorte emite un aviso en la consola (`[Multihog][Techos]`) y un evento que suma en el pie del panel del Agente («✂️ Recortes de techo (sesión): ficha N · mundo M»); los contadores duran solo la sesión y no se guardan en ningún sitio. El campo vacío o sin número vuelve al valor de fábrica, nunca se interpreta como «sin techo». Nada de esto toca el prompt del Narrador (sysprompt / Control Room), los sufijos de Revisión Completa ni escribe el `settings.json` de SillyTavern.

Nota fuera de esta extensión: el ritmo de resumen 3→5 que se comenta por ahí es **`sc_turns_per_summary` de la extensión Summaryception**, ajena a este framework; se cambia desde el panel de Extensiones de SillyTavern, no desde aquí.

---

## Mandos y perfiles de rendimiento

Dentro del cajón **⚙️ Rendimiento (modelo local)** hay un bloque nuevo, **🎛️ Mandos y perfiles de rendimiento** (especificación única en `src/state/agent-controls.js` y `src/state/performance-profiles.js`; la interfaz no escribe ninguna cota a mano).

**Tres mandos de bucle y chunk** (clamp único, `0` es un valor legítimo donde procede):

| Mando (clave) | Fábrica | Cota | Qué manda de verdad |
|---|---|---|---|
| Reintentos extra del Agente (`agenteRetriesExtra`) | 2 | 0-4 | Los DOS bucles del Agente a la vez (normal y de limpieza). No gastan vueltas: solo añaden llamadas. |
| Correcciones de JSON (`jsonCorrectionRetriesExtra`) | 2 | 0-4 | Las correcciones de JSON mal formado; ésas sí consumen vuelta del presupuesto. |
| Margen de la auditoría (`rpgAuditChunkBuffer`) | 3000 | 500-8000, paso 500 | El MARGEN que se resta al contexto al partir la auditoría, en sus dos sitios (contexto completo del Rastreador y «Full Audit» del Agente). Bajarlo hace trozos más grandes y puede dar HTTP 400. |

Al escribir se aplica el validador cruzado **vueltas + reintentos + correcciones ≤ 12** (las vueltas del dial de ritmo nunca se tocan: se bajan primero las correcciones y luego los reintentos, con aviso). Un valor sin número avisa y no se guarda; los límites de una pasada se leen una sola vez al empezarla, así que mover un mando con el Agente trabajando no cambia esa pasada.

**Tres topes de salida** (`rpgOutputCapStateTracker` / `rpgOutputCapWorldProgression` / `rpgOutputCapMapEvolutionCompress`, 256-8000): **`0` = auto** y entonces rige la cascada de siempre (8192); con valor, el tope clampeado manda sobre esa cascada solo en su trabajo. Los cuatro trabajos que ya tenían su campo de salida no se duplican aquí. El del compresor de Evolución de Mapas nunca sube el tope interno de 8000 de su propio trabajo.

**Revisión de Estado Completa editable**: dos overrides (`fullReviewSystemPromptOverride`, `fullReviewUserPromptSuffixOverride`) en el cajón, **vacío = el prompt de fábrica byte a byte**. El system exige `{{modulesText}}`, `[TAG]`/`[/TAG]` y `REMOVED` (sin ellos el memo no se puede fusionar) con techo de 8192 tokens; el sufijo solo admite `{{char}}`/`{{user}}` y tope 20.000 caracteres. El prompt se resuelve UNA vez por pasada: un override inválido no reenvía nada — se envía la fábrica y solo avisa en español — y los cuatro cuadros de solo lectura muestran lo que de verdad se envía. «Restaurar fábrica» deja los campos vacíos (nunca pega la fábrica dentro).

**Perfiles con nombre (Rápido · Equilibrado · Máxima calidad)**: el selector vive en la clave `rpgPerfProfile` (defecto `Equilibrado`). Son DATOS que aplican los mismos aplicadores de las olas 2-4 (ritmo, techos, pensamiento, mandos y salidas); `Equilibrado` ES la fábrica clave por clave. «Aplicar perfil» es acción explícita: un `Popup` lista `actual → nuevo` solo en lo que cambia, y al confirmar se guarda UNA sola vez. Con el Agente o el Rastreador trabajando se rechaza con aviso (los límites de esa pasada ya están leídos). «Personalizado» se deriva de los ajustes, nunca se guarda; puedes guardar hasta 50 perfiles propios. Los perfiles fijan el pensamiento en `Rápido` y `Máxima calidad`, así que el dial de pensamiento queda marcado como heredado y revive si tocas un modo a mano o aplicas `Equilibrado`. El pensamiento de Revisión Completa y tus prompts propios no viajan en perfiles. Las claves nuevas son globales: no viajan por el estado de cada chat.

Honestidades debidas: `≈` llamadas por 10 turnos usa la misma fórmula que los tooltips del dial de ritmo (típicas = pasadas × 3; peor = pasadas × (vueltas + 2)); los reintentos extra añaden llamadas, **nunca vueltas**. Con todo por defecto (`Equilibrado`) la salida de red es byte a byte la de siempre, sellada con SHA-256 en la suite.

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
