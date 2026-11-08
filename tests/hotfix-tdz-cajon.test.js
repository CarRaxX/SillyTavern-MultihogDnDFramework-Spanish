import { createContext, runInContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAst } from 'rollup/parseAst';

// HOTFIX TDZ del cajón «Rendimiento (modelo local)» (rama feature/hotfix-tdz-cajon-rendimiento).
// En producción, los cuatro binds de la región de construcción de ajustes
// (bindThinkingPolicyControls/bindLoreRhythmControls/bindPromptCeilingControls/
// bindAgentPerfControls) leían `settings` ANTES de su `const settings = getSettings()`,
// y el navegador reventaba con «can't access lexical declaration 'settings' before
// initialization» matando toda la UI de ajustes (el catch de init lo tragaba).
// Ningún test previo ejecutaba esta ruta real de init; aquí se cierra el agujero:
//   1. Guarda de posición determinista (regla general, no lista cerrada): NINGUNA
//      llamada X(settings) de la región puede aparecer antes de la declaración.
//   2. Ejecución real de la región en vm: los binds deben recibir LA MISMA
//      instancia que devuelve getSettings(), sin ReferenceError ni undefined.
const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const MARCADOR_REGION = 'Inject settings into the overlay';
const CAJONES_CONOCIDOS = [
    'bindThinkingPolicyControls',
    'bindLoreRhythmControls',
    'bindPromptCeilingControls',
    'bindAgentPerfControls',
];

function buscarFnInit(ast) {
    let encontrado = null;
    const visitar = nodo => {
        if (!nodo || typeof nodo !== 'object' || encontrado) return;
        if ((nodo.type === 'FunctionDeclaration' || nodo.type === 'FunctionExpression') && nodo.id?.name === 'init') {
            encontrado = nodo;
            return;
        }
        for (const valor of Object.values(nodo)) {
            if (Array.isArray(valor)) valor.forEach(visitar);
            else if (valor && typeof valor === 'object') visitar(valor);
        }
    };
    visitar(ast);
    if (!encontrado) throw new Error('Falta la función init() en index.js');
    return encontrado;
}

// Recolecta, SOLO en el ámbito directo de init() (sin entrar en funciones anidadas,
// cuyo `settings` propio sería un ámbito distinto y legal):
//  - decls: «const settings = getSettings()»
//  - usos:  cualquier llamada X(settings) posterior al marcador de la región
//           (regla general por nombre de argumento, no por lista de cajones).
function recolectarRegion(init) {
    const ancla = indexSource.indexOf(MARCADOR_REGION);
    if (ancla < 0) throw new Error(`Falta el marcador «${MARCADOR_REGION}» en index.js`);
    const decls = [];
    const usos = [];
    const visitar = (nodo, ambitoInit) => {
        if (!nodo || typeof nodo !== 'object') return;
        if (Array.isArray(nodo)) {
            nodo.forEach(hijo => visitar(hijo, ambitoInit));
            return;
        }
        if (ambitoInit) {
            if (
                nodo.type === 'VariableDeclarator'
                && nodo.id?.name === 'settings'
                && nodo.init?.type === 'CallExpression'
                && nodo.init.callee?.name === 'getSettings'
            ) {
                decls.push(nodo);
            }
            if (
                nodo.type === 'CallExpression'
                && nodo.start >= ancla
                && nodo.callee?.type === 'Identifier'
                && nodo.arguments.some(arg => arg.type === 'Identifier' && arg.name === 'settings')
            ) {
                usos.push(nodo);
            }
        }
        if (nodo.type === 'FunctionDeclaration' || nodo.type === 'FunctionExpression' || nodo.type === 'ArrowFunctionExpression') {
            // Ámbito distinto: no se desciende (una lectura diferida dentro de un
            // callback no es TDZ y su `settings` propio sería sombreado legal).
            return;
        }
        for (const [clave, valor] of Object.entries(nodo)) {
            if (clave === 'start' || clave === 'end' || clave === 'type' || clave === 'loc') continue;
            visitar(valor, ambitoInit);
        }
    };
    visitar(init.body, true);
    return { ancla, decls, usos };
}

const AST = parseAst(indexSource);
const INIT = buscarFnInit(AST);
const { ancla, decls, usos } = recolectarRegion(INIT);

describe('HOTFIX TDZ: `const settings = getSettings()` antes de los binds del cajón', () => {
    it('existe exactamente una declaración de settings en el ámbito de init()', () => {
        expect(decls).toHaveLength(1);
    });

    it('la declaración vive en la región de construcción, tras el marcador de inyección', () => {
        expect(decls[0].start).toBeGreaterThan(ancla);
    });

    it('NINGÚN bind X(settings) de la región se ejecuta antes de la declaración (regla general)', () => {
        // Regla abierta: sirve igual para los cuatro cajones actuales y para los
        // binds de cajones futuros que alguien inserte en esta región.
        const adelantados = usos.filter(uso => uso.start < decls[0].start);
        expect(adelantados.map(u => indexSource.slice(u.start, u.end).slice(0, 60))).toEqual([]);
    });

    it('los cuatro cajones de rendimiento siguen presentes y declarados tras la declaración', () => {
        const nombres = usos.map(uso => uso.callee.name);
        for (const cajon of CAJONES_CONOCIDOS) expect(nombres).toContain(cajon);
        for (const uso of usos) {
            if (CAJONES_CONOCIDOS.includes(uso.callee.name)) expect(uso.start).toBeGreaterThan(decls[0].start);
        }
    });
});

describe('HOTFIX TDZ: humo vm de la región de binds con stubs mínimos', () => {
    // Ejecuta de verdad el trozo real de index.js que va del marcador de inyección
    // hasta la última línea de bind X(settings), con stubs. Sin el fix los binds
    // reciben undefined (la declaración queda fuera del trozo) o ReferenceError por
    // TDZ (si un futuro bind se colocara antes de la declaración).
    // Regla abierta por prefijo «bind» (no lista cerrada); excluye consumos de otra
    // índole (p. ej. hydrateGlobalHistories(settings)) para no arrastrar awaits.
    const binds = usos.filter(uso => /^bind[A-Za-z0-9_$]*$/.test(uso.callee.name));
    const ordenados = [...binds].sort((a, b) => a.start - b.start);
    const inicio = indexSource.lastIndexOf('\n', ancla) + 1;
    const ultimo = ordenados[ordenados.length - 1];
    const finLinea = indexSource.indexOf('\n', ultimo.end);
    const trozo = indexSource.slice(inicio, finLinea < 0 ? indexSource.length : finLinea);
    const centinela = { esElSettingsReal: true };
    const llamadas = [];
    const diana = {
        settingsHtml: '<div id="rt-settings-overlay"></div>',
        FOLDER_NAME: 'SillyTavern-MultihogDnDFramework-Spanish',
        getSettings: () => centinela,
    };
    const sandbox = new Proxy(diana, {
        has: () => true,
        get: (objeto, clave) => {
            if (typeof clave === 'symbol') return undefined;
            if (clave in objeto) return objeto[clave];
            const espia = (...args) => { llamadas.push({ nombre: clave, args }); };
            objeto[clave] = espia;
            return espia;
        },
    });

    it('la región se ejecuta sin ReferenceError y los binds consumen la instancia real de settings', () => {
        expect(() => runInContext(trozo, createContext(sandbox))).not.toThrow();
        for (const uso of ordenados) {
            const registrada = llamadas.find(l => l.nombre === uso.callee.name);
            expect(registrada, `el bind ${uso.callee.name}() no se ejecutó`).toBeDefined();
            // Identidad estricta: sin el fix esto es undefined (o el TDZ lanza arriba).
            expect(registrada.args[0]).toBe(centinela);
        }
    });
});
