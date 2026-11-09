# Guía de parametrización local (Oleada 6a)

Ajustes para jugar con modelos locales (VRAM finita) sin que la Progresión del
Mundo se trague el contexto. Todo se configura desde el cajón de World
Progression → sub-cajón «Rotación de Ubicaciones»; nada requiere tocar código.

## 1. `ctxWorldInfo`: mantenlo OFF

El mando `ctxWorldInfo` (llavero de World Info en la pasada del motor autónomo,
`memo-processor.js`) sigue con default `false`. Con la campaña de Aetheria
supone unos 55.000 tokens añadidos por pasada: no lo actives con modelos
locales. El narrador principal sigue viendo sus lorebooks por la inyección
nativa de SillyTavern al pulsar las teclas de cada entrada; esa ruta no cambia.

## 2. Techos del expediente y del contexto global (nuevos)

Dos campos numéricos, hidratados y persistidos como los de la Oleada 4:

- **Caracteres máximos por expediente** (`worldProgressionDossierMaxChars`,
  default `20000`): acota cada expediente de ubicación. Se descartan registros
  COMPLETOS de «PERTINENT CONTEXT» desde el final hasta caber; el bloque
  «LOCATION LORE» del lugar nunca se recorta. Si cae algo, el expediente cierra
  con la línea `(N registros de contexto omitidos por techo)`.
- **Caracteres máximos de contexto global** (`worldProgressionGlobalMaxChars`,
  default `12000`): mismo descarte entero sobre el contexto global (regiones y
  facciones); la línea de omitidos cuenta dentro del techo.

**Recomendación con modelos locales (256K o menos):** `10000 / 8000`. Con la
campaña de Aetheria el mayor expediente ronda los 19.500 caracteres, así que
estos techos solo recortan contexto periférico y acotan la peor pasada del motor
a 3×10.000 + 8.000 caracteres (≈9.500 tokens). Con los defaults `20000 / 12000`
el techo casi no muerde hoy.

**`0` significa sin límite** en ambos campos (y los valores negativos o vacíos
se guardan como `0`). Si un expediente te queda huérfano de contexto útil,
súbelos o pon `0` sin esperar parche.

## 3. `rpgGmOnly`: el canon del GM queda fuera por código

Las siete entradas `ARCO: …`, las seis `SECRETO: …` del libro de secretos y la
facción `Hoguera de los Ajenos` llevan
`"extensions": {"rpgGmOnly": true}`. Con esa bandera, la Progresión del Mundo
omite el registro de expedientes y de `globalContext` por código, sin depender
del prompt. La inyección nativa por teclas, los snapshots del Lorebook Agent y
los hilos `MYSTERY:`/`SAGA:` no se resienten: el narrador humano sigue viendo
los arcos.

⚠️ **El blindaje exige regenerar y reimportar.** Ejecuta
`tools/build_aetheria_lorebooks.py` y **reimporta** los libros en SillyTavern:
el libro en uso conserva las entradas viejas sin bandera hasta que lo hagas, y
sin bandera el filtro no surte efecto. Tras reimportar, comprueba que
`extensions.rpgGmOnly` ha sobrevivido al reimportado (abre la entrada en el
editor de lorebooks o busca `"rpgGmOnly": true` en el JSON importado): si tu
versión de ST o el Lorebook Agent reescribieran las extensiones y perdieran la
bandera, el canon del GM volvería a filtrarse al motor autónomo.

## 4. Segunda capa: el cortafuegos informacional (oleada 6b)

El cerrotejo determinista es la primera capa; la segunda es el módulo
`sys_info_firewall` del cartucho (reglas de testigo, canon sin descubrir y
bloques `[SECRETO]`), que gobierna al narrador por prompt. Ambas capas van
juntas: la de código para el motor autónomo, la del cortafuegos para la voz
del narrador.
