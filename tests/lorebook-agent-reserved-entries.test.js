// TODO lo de este fichero es SINTÉTICO: ninguna entrada, nombre ni frase pertenece al canon
// (spec Oleada 7b, D-24/D-36). Libros, titulares, teclas y frases están inventados; los
// secretos reales no se nombran aquí ni en comentarios.
//
// Arnés D-36: dos mecanismos, ninguno reimplementa la lógica certificada.
//   · Módulo puro (`lorebook-keyring.js`) importado directo: D-31 y D-32/grep.
//   · Extracción por marcadores + `node:vm` sobre las regiones REALES de `router.js`
//     (patrón de tests/router-keyword-scan-and-all.test.js): bucle de activación,
//     ramas `read_entry`/`inspect_book` (sus DOS copias, asertadas) y `updateActiveEntries`.
// Cada contexto `vm` inyecta el helper REAL de D-31, así que si el router deja de
// aplicarlo el arnés se pone rojo; si el router renombra una dependencia, el `vm`
// revienta por ReferenceError y eso es la alarma del arnés (R3), no un defecto.
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildKeyringText, grepLoreInBooks, isAgentReservedEntry } from '../src/state/lorebook-keyring.js';

const source = readFileSync(new URL('../router.js', import.meta.url), 'utf8');

// ── Material sintético ───────────────────────────────────────────────────────────
// «Prueba_Secretos» es el libro mixto (una reservada + vecinas legítimas); el
// «…SoloReservas» emula un libro enteramente reservado. «Prueba_Arcos»/«Prueba_NPCs»
// son las hermanas de guion (selective:true, selectiveLogic:0) que DEBEN seguir viéndose.
const SECRETOS = 'Prueba_Secretos';
const SOLO_RESERVAS = 'Prueba_SoloReservas';
const ARCOS = 'Prueba_Arcos';
const NPCS = 'Prueba_NPCS';

const CUERPO_RESERVADO = 'barniz de residuo sintético que nadie debe leer';
const ETIQUETA_RESERVADA = 'etiqueta reservada sintética';
const TECLA_RESERVADA = 'llave reservada sintética';
const CUERPO_VECINA = 'crónica vecina legible del mismo libro';
const CUERPO_ARCO = 'guion vecino de arcos, siempre visible';

const reservada = (extra = {}) => ({
    comment: ETIQUETA_RESERVADA, content: CUERPO_RESERVADO, key: [TECLA_RESERVADA],
    keysecondary: ['secundaria reservada sintética'], selective: true, selectiveLogic: 3, depth: 3, ...extra,
});
const normal = (comment, content, extra = {}) => ({
    comment, content, key: [`${comment} llave`], keysecondary: [],
    selective: true, selectiveLogic: 0, depth: 4, ...extra,
});

const catalogos = () => ({
    [SECRETOS]: {
        name: SECRETOS, scan_depth: null,
        entries: {
            7: reservada(),
            8: normal('vecina legible', CUERPO_VECINA),
        },
    },
    [SOLO_RESERVAS]: { name: SOLO_RESERVAS, entries: { 1: reservada(), 2: reservada() } },
    [ARCOS]: { name: ARCOS, entries: { 2: normal('arco de la noria', CUERPO_ARCO) } },
    [NPCS]: { name: NPCS, entries: { 4: normal('npc del telar', 'guion del telar') } },
});

const idDe = (libro, uid) => `${libro}::${uid}`;

// ── Extracción de las DOS ramas duplicadas del despacho de herramientas (§B) ─────
function ramasDuplicadas(marcador) {
    const posiciones = [];
    for (let i = source.indexOf(marcador); i >= 0; i = source.indexOf(marcador, i + marcador.length)) {
        posiciones.push(i);
    }
    // R3: siguen habiendo dos copias vivas y el test lo aserta para que no nazca una tercera sin candado.
    expect(posiciones.length, `Marcador «${marcador}»: se esperaban exactamente 2 copias`).toBe(2);
    return posiciones.map(ramaHacia);
}

function ramaHacia(pos) {
    const inicio = source.lastIndexOf('\n', pos) + 1;               // línea «} else if (toolName === …) {»
    const resto = source.slice(inicio);
    const fin = resto.search(/\n {16}\}/);                          // siguiente «} else» de la misma indentación
    if (fin < 0) throw new Error(`Rama sin cierre: ${marcador}`);
    const cuerpo = resto.slice(0, fin).replace(/^\s*\}\s*else if \(/, 'if (');
    return `async function rama(args) {\n let observation = '';\n ${cuerpo}\n }\n return observation;\n}`;
}

// Ejecuta una rama extraída con sus dependencias reales (catálogo en memoria + carga
// de disco) y devuelve el `observation` que vería el agente.
async function ejecutarRama(codigoRama, toolName, args, libros = {}) {
    const ctx = createContext({
        toolName,
        ctx: {
            loadWorldInfo: async nombre => (libros[nombre] ? JSON.parse(JSON.stringify(libros[nombre])) : null),
        },
        archiveBooks: libros,
        isSkeletonEntryId: entrada => String(entrada || '').split('::')[0].endsWith('_Skeleton'),
        isSkeletonBookName: nombre => String(nombre || '').endsWith('_Skeleton'),
        isAgentReservedEntry,                                        // helper REAL de D-31
        assertOwnsChat: () => {},
        console: { log() {}, warn() {}, error() {}, info() {} },
    });
    runInContext(`${codigoRama}\nglobalThis.llamar = async (a) => await rama(a);`, ctx);
    return await ctx.llamar(args);
}

// ── Extracción del bucle de activación (D-34) ────────────────────────────────────
const CABECERA_BUCLE = '// 1. Activate/Deactivate';
const COLA_BUCLE = 'if (deactivate.length > 0) changed = true;';

function codigoBucleActivacion() {
    const ini = source.indexOf(CABECERA_BUCLE);
    const fin = source.indexOf(COLA_BUCLE, ini);
    if (ini < 0 || fin < 0) throw new Error('No se encuentra el bucle de activación de commitOwnedAction');
    const codigo = source.slice(ini, fin + COLA_BUCLE.length);
    expect(codigo).toContain('for (const k of activate)');           // el único consumidor de action.activate
    return codigo;
}

// Ejecuta el bucle real y devuelve el estado que produce el commit.
function ejecutarActivacion({ action, libros, pool = {}, avisos = [] }) {
    const settings = {
        activeRouterKeys: [...(pool.activeRouterKeys || [])],
        activeWorldKeys: [...(pool.activeWorldKeys || [])],
        pinnedRouterKeys: [...(pool.pinnedRouterKeys || [])],
    };
    const original = { ...settings };
    const ctx = createContext({
        action,
        allBooks: libros,
        settings,
        errors: [],
        changed: false,
        isSkeletonEntryId: entrada => String(entrada || '').split('::')[0].endsWith('_Skeleton'),
        isAgentReservedEntry,                                        // helper REAL de D-31
        console: { log() {}, warn: (...a) => avisos.push(a.join(' ')), error() {}, info() {} },
    });
    runInContext(`${codigoBucleActivacion()}
        globalThis.__resultado = { newActive, newWorldActive, errors, changed };`, ctx);
    return { ...ctx.__resultado, settings, original, avisos };
}

// ── Extracción de `updateActiveEntries` (D-35) ──────────────────────────────────
function codigoRender() {
    const ini = source.indexOf('function updateActiveEntries()');
    const cierre = '\n        }\n        updateActiveEntries();';
    const fin = source.indexOf(cierre, ini);
    if (ini < 0 || fin < 0) throw new Error('No se encuentra updateActiveEntries');
    return source.slice(ini, fin + '\n        }'.length);
}

function ejecutarRender({ libros, pool, recienDisparadas = [] }) {
    const settings = { activeRouterKeys: [...pool], npcRelationshipValues: {} };
    const ctx = createContext({
        archiveBooks: libros,
        settings,
        triggeredSet: new Set(recienDisparadas),
        isSkeletonBookName: nombre => String(nombre || '').endsWith('_Skeleton'),
        getDungeonMapAttachment: () => null,
        stripDungeonMapSection: texto => texto,
        getNpcRelationshipMax: () => 100,
        isAgentReservedEntry,                                        // helper REAL de D-31
        console: { log() {}, warn() {}, error() {}, info() {} },
    });
    runInContext(`let activeEntriesFull = [], newlyTriggeredFull = [];
        ${codigoRender()}
        updateActiveEntries();
        globalThis.__render = { activeEntriesFull, newlyTriggeredFull };`, ctx);
    return { ...ctx.__render, settings };
}

const textoRender = r => `${r.activeEntriesFull.join('\n')}\n${r.newlyTriggeredFull.join('\n')}`;

describe('Candado del Lorebook Agent ante entradas reservadas (Oleada 7b · D-31…D-36)', () => {
    // AC-1 · D-32 — módulo puro
    it('AC-1 indice a ciegas: la reservada no se nombra y sus hermanas conservan su linea', () => {
        const indice = buildKeyringText(catalogos(), []);
        // Ni UID, ni etiqueta, ni teclas de la reservada.
        expect(indice).not.toContain(idDe(SECRETOS, '7'));
        expect(indice).not.toContain(ETIQUETA_RESERVADA);
        expect(indice).not.toContain(TECLA_RESERVADA);
        // D-32: prohibido anunciar que existen entradas ocultas.
        expect(indice).not.toMatch(/hidden|ocult|reserved|reservad/i);
        // Las hermanas del MISMO libro y de los libros de guion, intactas.
        expect(indice).toContain(`[ARCHIVE] ${idDe(SECRETOS, '8')}`);
        expect(indice).toContain(`[ARCHIVE] ${idDe(ARCOS, '2')}`);
        expect(indice).toContain(`[ARCHIVE] ${idDe(NPCS, '4')}`);
        // Una reservada activa tampoco se cuela por la puerta de activeKeys.
        const conPool = buildKeyringText(catalogos(), [idDe(SECRETOS, '7')]);
        expect(conPool).not.toContain(idDe(SECRETOS, '7'));
    });

    // AC-2 · D-33 — módulo puro
    it('AC-2 grep: cuerpo etiqueta y teclas reservadas dan cero hits y el hint sigue intacto', () => {
        const libros = catalogos();
        expect(grepLoreInBooks(libros, CUERPO_RESERVADO)).toEqual([]);          // cuerpo exclusivo
        expect(grepLoreInBooks(libros, ETIQUETA_RESERVADA)).toEqual([]);        // etiqueta
        expect(grepLoreInBooks(libros, TECLA_RESERVADA)).toEqual([]);           // teclas
        expect(grepLoreInBooks(libros, 'secundaria reservada sintetica')).toEqual([]);
        // La misma técnica sobre una logic:0 sigue dando hit con su prefijo de siempre.
        const hits = grepLoreInBooks(libros, CUERPO_VECINA);
        expect(hits).toHaveLength(1);
        expect(hits[0]).toContain(idDe(SECRETOS, '8'));
        // EXISTENCE_GREP_HINT intacto (D-32 no lo toca): volcado de nombres -> aviso.
        const aviso = grepLoreInBooks(libros, 'noria, telar, faro');
        expect(aviso).toHaveLength(1);
        expect(aviso[0]).toContain('Do not grep to check whether entries exist');
    });

    // AC-3 · D-33 — `read_entry` en AMBAS copias
    it('AC-3 read_entry rechaza la reservada en las dos copias y deja leer a la vecina', async () => {
        const ramas = ramasDuplicadas("toolName === 'read_entry'");
        for (const [n, rama] of ramas.entries()) {
            const libros = catalogos();
            const reservadaLeida = await ejecutarRama(rama, 'read_entry', { uid: idDe(SECRETOS, '7') }, libros);
            expect(reservadaLeida, `copia ${n} de read_entry`).toBe('Entry is reserved and unavailable');
            // Sin título, sin contenido, sin prefijo y sin nombrar el criterio (D-33).
            expect(reservadaLeida).not.toContain(CUERPO_RESERVADO.slice(0, 12));
            expect(reservadaLeida).not.toContain(ETIQUETA_RESERVADA);
            expect(reservadaLeida.toLowerCase()).not.toMatch(/selective|gm|reserved because|reservada/);

            // Libro MIXTO: la vecina del mismo libro se lee íntegra (el libro no está filtrado).
            const vecina = await ejecutarRama(rama, 'read_entry', { uid: idDe(SECRETOS, '8') }, libros);
            expect(vecina).toBe(CUERPO_VECINA);
            // Ausente y Skeleton: contratos previos sin tocar.
            expect(await ejecutarRama(rama, 'read_entry', { uid: idDe(SECRETOS, '99') }, libros))
                .toBe(`Entry "${idDe(SECRETOS, '99')}" not found.`);
            expect(await ejecutarRama(rama, 'read_entry', { uid: 'Prueba_Skeleton::1' }, libros))
                .toContain('not accessible');
            // Guardas incluso cuando solo el catálogo en memoria la marca reservada.
            const soloEnCatalogo = { [SECRETOS]: { entries: { 7: reservada() } } };
            expect(await ejecutarRama(rama, 'read_entry', { uid: idDe(SECRETOS, '7') }, soloEnCatalogo))
                .toBe('Entry is reserved and unavailable');
        }
    });

    // AC-3 · D-33 — `inspect_book` en AMBAS copias
    it('AC-3 inspect_book oculta reservadas en las dos copias y avisa neutro si el libro esta lleno', async () => {
        const ramas = ramasDuplicadas("toolName === 'inspect_book'");
        for (const [n, rama] of ramas.entries()) {
            const libros = catalogos();
            const mixto = await ejecutarRama(rama, 'inspect_book', { book_name: SECRETOS }, libros);
            expect(mixto, `copia ${n} de inspect_book`).not.toContain(idDe(SECRETOS, '7'));
            expect(mixto).not.toContain(ETIQUETA_RESERVADA);
            expect(mixto).toContain(`${idDe(SECRETOS, '8')} -- vecina legible`);   // el vecindario, sí
            // Libro enteramente reservado: lista neutra, sin delatar el criterio.
            const lleno = await ejecutarRama(rama, 'inspect_book', { book_name: SOLO_RESERVAS }, libros);
            expect(lleno).toBe('No entries available in this book.');
            expect(lleno.toLowerCase()).not.toMatch(/selective|gm|reserved|reservad/);
            // Hermanas de guion y Skeleton: sin cambios.
            expect(await ejecutarRama(rama, 'inspect_book', { book_name: ARCOS }, libros))
                .toContain(`${idDe(ARCOS, '2')} -- arco de la noria`);
            expect(await ejecutarRama(rama, 'inspect_book', { book_name: 'Prueba_Skeleton' }, libros))
                .toContain('not accessible');
        }
    });

    // AC-4 · D-34 — único choke point: descarte silencioso que no aborta el commit
    it('AC-4 activate descarta la reservada sin abortar el commit ni dejar rastro para el agente', () => {
        const libros = catalogos();
        // Commit mixto: [reservada, NPC válida] ⇒ la NPC SÍ se activa, la reservada no.
        const mixto = ejecutarActivacion({
            action: { activate: [idDe(SECRETOS, '7'), idDe(NPCS, '4')] },
            libros,
        });
        expect(mixto.newActive).toEqual([idDe(NPCS, '4')]);
        expect(mixto.newActive).not.toContain(idDe(SECRETOS, '7'));
        expect(mixto.changed).toBe(true);                       // el resto del commit no se interrumpe
        expect(mixto.errors).toEqual([]);                       // cero errors.push sobre la reservada
        // Ni el estado ni los avisos que vuelven al agente mencionan el ID descartado.
        expect(JSON.stringify({ newActive: mixto.newActive, newWorldActive: mixto.newWorldActive, errors: mixto.errors }))
            .not.toContain(idDe(SECRETOS, '7'));
        // El aviso es SOLO del host (console.warn): no viaja en errors ni en newActive.
        expect(mixto.avisos.join('\n')).toContain(idDe(SECRETOS, '7'));

        // ID reservado solo (es lo que produciría [[ACTIVATE: etiqueta]] tras resolver a Book::UID, :4158):
        // commit intacto, pool igual, changed sigue false y cero errores.
        const pool = { activeRouterKeys: [idDe(ARCOS, '2')] };
        const solo = ejecutarActivacion({ action: { activate: [idDe(SECRETOS, '7')] }, libros, pool });
        expect(solo.newActive).toEqual([idDe(ARCOS, '2')]);
        expect(solo.changed).toBe(false);
        expect(solo.errors).toEqual([]);
        expect(solo.settings.activeRouterKeys).toEqual(pool.activeRouterKeys);   // pool del narrador, inmutable

        // Reservada en libro World: tampoco entra por la rama de newWorldActive.
        const librosMundo = { Prueba_World: { entries: { 3: reservada() } } };
        const mundo = ejecutarActivacion({ action: { activate: [idDe('Prueba_World', '3')] }, libros: librosMundo });
        expect(mundo.newWorldActive).toEqual([]);
        expect(mundo.newActive).toEqual([]);
        expect(mundo.errors).toEqual([]);

        // Sin regresión en las guardas hermanas del bucle: formato inválido y Skeleton siguen errorando.
        const raros = ejecutarActivacion({ action: { activate: ['sin-separador', 'Prueba_Skeleton::1'] }, libros });
        expect(raros.errors).toHaveLength(2);
        expect(raros.newActive).toEqual([]);
    });

    // AC-5 · anti-regresión transversal
    it('AC-5 anti-regresion: logic 0, selective false y la logica 3 en texto se ven leen y activan igual', async () => {
        // D-31 numérico estricto: nada de esto es reservado.
        expect(isAgentReservedEntry({ selective: true, selectiveLogic: 0 })).toBe(false);
        expect(isAgentReservedEntry({ selective: false, selectiveLogic: 3 })).toBe(false);
        expect(isAgentReservedEntry({ selective: true, selectiveLogic: '3' })).toBe(false);
        expect(isAgentReservedEntry({ selective: true })).toBe(false);
        expect(isAgentReservedEntry(undefined)).toBe(false);

        const raros = {
            a: normal('string logic tres', 'el faro de cuerda', { selectiveLogic: '3' }),
            b: normal('selective falso', 'el faro de cuerda', { selective: false, selectiveLogic: 3 }),
            c: normal('logic cero', 'el faro de cuerda', { selective: true, selectiveLogic: 0 }),
        };
        const libros = { Prueba_Hermanos: { name: 'Prueba_Hermanos', entries: raros } };
        // Índice, grep y lectura: exactamente como hoy.
        const indice = buildKeyringText(libros, []);
        expect(indice).toContain(idDe('Prueba_Hermanos', 'a'));
        expect(indice).toContain(idDe('Prueba_Hermanos', 'b'));
        expect(indice).toContain(idDe('Prueba_Hermanos', 'c'));
        expect(grepLoreInBooks(libros, 'el faro de cuerda')).toHaveLength(3);
        for (const rama of ramasDuplicadas("toolName === 'read_entry'")) {
            expect(await ejecutarRama(rama, 'read_entry', { uid: idDe('Prueba_Hermanos', 'a') }, libros))
                .toBe('el faro de cuerda');
            expect(await ejecutarRama(rama, 'read_entry', { uid: idDe('Prueba_Hermanos', 'b') }, libros))
                .toBe('el faro de cuerda');
        }
        // Activación: las tres entran en el pool (una de ellas, con ARCO, es guion visible).
        const act = ejecutarActivacion({
            action: { activate: [idDe('Prueba_Hermanos', 'a'), idDe('Prueba_Hermanos', 'b'), idDe('Prueba_Hermanos', 'c')] },
            libros,
        });
        expect(act.newActive.sort()).toEqual([idDe('Prueba_Hermanos', 'a'), idDe('Prueba_Hermanos', 'b'), idDe('Prueba_Hermanos', 'c')].sort());
        expect(act.changed).toBe(true);
        expect(act.errors).toEqual([]);
        // Y el render del agente las muestra (solo se ocultan las reservadas de verdad).
        const render = ejecutarRender({
            libros,
            pool: [idDe('Prueba_Hermanos', 'a'), idDe('Prueba_Hermanos', 'b'), idDe('Prueba_Hermanos', 'c')],
        });
        expect(textoRender(render)).toContain('logic cero');
        expect(render.activeEntriesFull).toHaveLength(3);
    });

    // AC-6 · D-35 — quinta superficie: la vista del prompt, sin mutar el pool
    it('AC-6 vista del agente: un UID reservado sembrado en el pool no se renderiza y el pool queda igual', () => {
        const libros = catalogos();
        const pool = [idDe(SECRETOS, '7'), idDe(ARCOS, '2')];
        const render = ejecutarRender({
            libros,
            pool,
            recienDisparadas: [idDe(SECRETOS, '7'), idDe(ARCOS, '2')],   // ambas como recién activadas
        });
        const texto = textoRender(render);
        expect(texto).not.toContain(idDe(SECRETOS, '7'));
        expect(texto).not.toContain(CUERPO_RESERVADO.slice(0, 12));
        expect(texto).not.toContain(ETIQUETA_RESERVADA);
        // La vecina logic:0 del pool, presente — y en el cajón que le toca.
        expect(texto).toContain(idDe(ARCOS, '2'));
        expect(render.newlyTriggeredFull).toHaveLength(1);
        expect(render.newlyTriggeredFull[0]).toContain(idDe(ARCOS, '2'));
        // El pool compartido NO se muta (el narrador recibe lo de siempre).
        expect(render.settings.activeRouterKeys).toEqual([idDe(SECRETOS, '7'), idDe(ARCOS, '2')]);
        // Caso reservada en ACTIVE MEMORY (no recién disparada): tampoco bloque.
        const estable = ejecutarRender({ libros, pool: [idDe(SECRETOS, '7')] });
        expect(estable.activeEntriesFull).toEqual([]);
        expect(estable.newlyTriggeredFull).toEqual([]);
        expect(estable.settings.activeRouterKeys).toEqual([idDe(SECRETOS, '7')]);
    });

    // Estructura y criterio único: dos copias vivas de cada rama y helper estricto
    it('D-31 y R3: el criterio es numerico estricto y cada rama del despacho tiene dos copias', () => {
        // Criterio único, numérico estricto, sin enums ni listas de libros.
        expect(isAgentReservedEntry({ selective: true, selectiveLogic: 3 })).toBe(true);
        expect(isAgentReservedEntry({ selective: true, selectiveLogic: 3.0 })).toBe(true);
        expect(isAgentReservedEntry({ selective: 'true', selectiveLogic: 3 })).toBe(false);
        expect(isAgentReservedEntry({ selective: 1, selectiveLogic: 3 })).toBe(false);
        expect(isAgentReservedEntry({ selective: true, selectiveLogic: 2 })).toBe(false);
        expect(isAgentReservedEntry(null)).toBe(false);
        // Dos copias vivas de cada superficie de lectura (§A · R3).
        expect(source.split("toolName === 'read_entry'").length - 1).toBe(2);
        expect(source.split("toolName === 'inspect_book'").length - 1).toBe(2);
        // El candado vive en un único criterio: el router lo importa, no lo reinventa.
        const importKeyring = source.match(/import \{[^}]*\} from '\.\/src\/state\/lorebook-keyring\.js'/);
        expect(importKeyring, 'el router debe importar el helper de lorebook-keyring').toBeTruthy();
        expect(importKeyring[0]).toContain('isAgentReservedEntry');
        expect(source).not.toMatch(/selectiveLogic\s*===\s*3\s*&&/);          // cero gate alternante
        expect(source.match(/entry\?\.selective === true/g) || []).toHaveLength(0);
    });
});
