// TODO lo de este fichero es SINTÉTICO: ninguna entrada, nombre ni frase pertenece al canon
// (spec Oleada 7, D-24/D-30). Todos los textos, teclas y titulares están inventados.
//
// Arnés por extracción (D-29): se lee router.js, se extrae la FUNCIÓN REAL
// `scanAssistantOutputForKeywords` con el mismo patrón de functionSource que
// tests/router-history-footprint.test.js y se ejecuta en node:vm inyectando las
// 14 dependencias que usa la función. No se copia ni se reimplementa el matcher:
// si el router cambia de forma observable, este test lo nota.
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
function functionSource(name) {
    const start = source.search(new RegExp(`(?:export )?(?:async )?function ${name}\\(`));
    if (start < 0) throw new Error(`Missing ${name}`);
    return source.slice(start, source.indexOf('\n}', start) + 2).replace(/^export /, '');
}

const LIBRO = 'Prueba_Secretos';

// Cada escenario ejecuta el código real de router.js sobre un libro sintético.
// Se devuelven settings mutables y la función de escaneo para poder observar
// newlyTriggered Y activeRouterKeys/keywordActivatedKeys tras cada pasada.
function escenario(entradas, chatMensajes = []) {
    const settings = {
        activeRouterKeys: [], keywordActivatedKeys: [], pinnedRouterKeys: [],
        routerLog: [], routerMaxActivations: 0, routerMaxKeywordOverflow: 0, debugMode: false,
    };
    const chat = chatMensajes.map(mes => ({ mes, is_system: false }));
    const libros = { [LIBRO]: { name: LIBRO, scan_depth: null, entries: entradas } };
    const contexto = createContext({
        // Las 14 dependencias de D-29, con los guardarraíles mínimos:
        getSettings: () => settings,
        getActiveChatId: () => 'chat-prueba',
        createChatCommitGuard: () => 'guard',
        chatCommitResult: (_owns, valor) => valor, // afiliación de paso siempre concedida
        isLorebookAgentRuntimeActive: () => true,
        getLivePrefix: () => 'Prueba',
        getWorldInfoNamesSafe: () => Promise.resolve(Object.keys(libros)),
        resolveBooksToScan: (_known, registro, prefijo) => registro.filter(n => n.startsWith(`${prefijo}_`)),
        isSkeletonBookName: nombre => nombre.endsWith('_Skeleton'),
        isSkeletonEntryId: () => false,
        getDungeonMapAttachment: () => null,
        saveSettings: () => {},
        console: { log() {}, warn() {}, error() {}, info() {} },
        SillyTavern: {
            getContext: () => ({
                chat,
                loadWorldInfo: nombre => Promise.resolve(libros[nombre] || null),
            }),
        },
    });
    runInContext(`
        ${functionSource('scanAssistantOutputForKeywords')}
        globalThis.escanear = async (texto, opts) => await scanAssistantOutputForKeywords(texto, opts || {});
    `, contexto);
    return { escanear: contexto.escanear, settings };
}

const id = uid => `${LIBRO}::${uid}`;
const secreta = (key, keysecondary, extra = {}) => ({
    comment: 'entrada sintética', content: 'contenido sintético', key, keysecondary,
    selective: true, selectiveLogic: 3, depth: 3, ...extra,
});

describe('Compuerta AND ALL del escáner propio (Oleada 7 · D-25/D-26/D-27)', () => {
    it('and-all incompleto', async () => {
        // AC-1: dos de tres teclas + el titular en el mensaje NO abren el secreto.
        const e = escenario({ e1: secreta(['llave primera', 'llave segunda', 'llave tercera'], ['firma del gremio']) });
        const newly = await e.escanear('Hallamos la llave primera y la llave segunda junto a la firma del gremio.');
        expect(newly).toEqual([]);
        expect(e.settings.activeRouterKeys).toEqual([]);
        expect(e.settings.keywordActivatedKeys).toEqual([]);
    });

    it('and-all completo directo', async () => {
        // AC-2: las tres teclas y el titular en el MISMO texto activan, y solo una vez.
        const e = escenario({ e2: secreta(['llave primera', 'llave segunda', 'llave tercera'], ['firma del gremio']) });
        const texto = 'Giran la llave primera, la llave segunda y la llave tercera; queda la firma del gremio.';
        const newly = await e.escanear(texto);
        expect(newly).toEqual([id('e2')]);
        expect(e.settings.activeRouterKeys).toContain(id('e2'));
        // Segunda pasada con caducidad apagada (D-28 es otro barrido): ya activa → nada nuevo.
        const segunda = await e.escanear(texto, { sweepEnabled: false });
        expect(segunda).toEqual([]);
        expect(e.settings.activeRouterKeys).toEqual([id('e2')]);
    });

    it('and-all ventana histórica', async () => {
        // AC-3 fase NO: teclas repartidas FUERA de la ventana (depth 3 de 6 mensajes) no activan.
        const fuera = escenario({ e3: secreta(['insignia óxido', 'cartucho gris', 'cuervo pálido'], ['sello roto']) },
            ['insignia óxido brilló ayer', 'un cartucho gris cayó', 'nada relevante aquí', 'un cuervo pálido con sello roto cercano']);
        const nada = await fuera.escanear('El grupo avanza sin descanso.');
        expect(nada).toEqual([]);
        expect(fuera.settings.activeRouterKeys).toEqual([]);
        // AC-3 fase SÍ: todas las teclas repartidas DENTRO de la ventana concatenada activan.
        const dentro = escenario({ e3: secreta(['insignia óxido', 'cartucho gris', 'cuervo pálido'], ['sello roto']) },
            ['un cartucho gris apareció', 'la insignia óxido pesaba', 'un cuervo pálido con su sello roto']);
        const sí = await dentro.escanear('El grupo acampa junto al muro.');
        expect(sí).toEqual([id('e3')]);
        expect(dentro.settings.activeRouterKeys).toContain(id('e3'));
    });

    it('and-all sin secundaria', async () => {
        // AC-4: logic 3 sin keysecondary (vacío o ausente) no exige ninguna secundaria.
        const e = escenario({
            e4a: secreta(['faro gris', 'mozo pardo'], []),
            e4b: secreta(['rueda dentada', 'sal sin yodo'], undefined, { keysecondary: undefined }),
        });
        const newly = await e.escanear('El faro gris alumbra al mozo pardo junto a la rueda dentada y su sal sin yodo.');
        expect(newly.sort()).toEqual([id('e4a'), id('e4b')].sort());
    });

    it('and-any sin regresión', async () => {
        // AC-5: logic 0, logic ausente y selective:false (aunque logic sea 3) siguen con OR puro.
        const e = escenario({
            a: secreta(['brasa azul', 'torre sin puerta'], ['nunca citada en ningún sitio'], { selectiveLogic: 0 }),
            b: { comment: 'sintética', key: ['pozo ciego'], selective: true }, // selectiveLogic ausente
            c: { comment: 'sintética', key: ['manto escama'], selective: false, selectiveLogic: 3 },
        });
        expect(await e.escanear('La brasa azul parpadea débil.')).toEqual([id('a')]);
        expect(await e.escanear('El pozo ciego se seca.', { sweepEnabled: false })).toEqual([id('b')]);
        expect(await e.escanear('Un manto escama cuelga del perchero.', { sweepEnabled: false })).toEqual([id('c')]);
        expect(e.settings.activeRouterKeys.sort()).toEqual([id('a'), id('b'), id('c')].sort());
    });

    it('partido entre mensaje y ventana', async () => {
        // D-26: dos teclas en el texto directo y la tercera solo en la ventana NO activan;
        // la conjunción se evalúa POR UNIDAD y las unidades no se mezclan.
        const e = escenario({ e6: secreta(['ancla negra', 'reloj mudo', 'fósforo apagado'], ['cuño de plomo']) },
            ['un fósforo apagado y el cuño de plomo sobre la mesa']);
        const newly = await e.escanear('El ancla negra chirría mientras el reloj mudo marca la hora.');
        expect(newly).toEqual([]);
        expect(e.settings.activeRouterKeys).toEqual([]);
    });
});
