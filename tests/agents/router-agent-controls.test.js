import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { parseAst } from 'rollup/parseAst';
import {
    AG_CONTROL_KEYS,
    clampAgControl,
    leerControlesEfectivos,
} from '../../src/state/agent-controls.js';

// T8 (spec 2026-11-08, ola 5): los tres literales de reintento del router salen
// de `settings.*` leídos UNA sola vez antes de los bucles, y el margen de la
// auditoría (3000 en DOS sitios de index.js) pasa por un único helper. Mover un
// mando a mitad de pasada no puede cambiar los límites de esa pasada.

const routerSource = readFileSync(new URL('../../router.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../../index.js', import.meta.url), 'utf8');

/** Recorrido genérico de AST: llama a `visitar` con cada nodo objeto. */
function caminar(nodo, fn) {
    if (!nodo || typeof nodo !== 'object') return;
    fn(nodo);
    for (const valor of Object.values(nodo)) {
        if (Array.isArray(valor)) valor.forEach(h => caminar(h, fn));
        else if (valor && typeof valor === 'object') caminar(valor, fn);
    }
}

/**
 * Declaraciones `const`/`let` de un nombre en una fuente: [{start,end,init,kind}].
 * @param {string} source
 * @param {string} nombre
 */
function declaraciones(source, nombre) {
    const ast = parseAst(source);
    const halladas = [];
    caminar(ast, nodo => {
        if (nodo.type !== 'VariableDeclaration') return;
        for (const d of nodo.declarations || []) {
            if (d.id?.type === 'Identifier' && d.id.name === nombre) {
                halladas.push({ start: nodo.start, end: nodo.end, kind: nodo.kind, init: d.init });
            }
        }
    });
    return halladas;
}

/** Propiedad leída de una expresión `objeto.propriedad`. */
function propiedadDe(expr) {
    if (!expr || expr.type !== 'MemberExpression' || expr.computed) return null;
    const obj = expr.object?.type === 'Identifier' ? expr.object.name : '';
    const prop = expr.property?.type === 'Identifier' ? expr.property.name : '';
    return { obj, prop };
}

/** Rango [start,end] de cada `while (...) { ... }` de una fuente. */
function rangosWhile(source) {
    const ast = parseAst(source);
    const rangos = [];
    caminar(ast, nodo => {
        if (nodo.type === 'WhileStatement') rangos.push([nodo.start, nodo.end]);
    });
    return rangos;
}

/** Extrae el texto de una declaración de función por nombre. */
function funcionDe(source, nombre) {
    const ast = parseAst(source);
    let texto = null;
    caminar(ast, nodo => {
        if (!texto && nodo.type === 'FunctionDeclaration' && nodo.id?.name === nombre) {
            texto = source.slice(nodo.start, nodo.end);
        }
    });
    return texto;
}

describe('router.js: límites de reintento leídos de los ajustes (T8)', () => {
    it('importa leerControlesEfectivos del módulo puro de mandos', () => {
        expect(routerSource).toMatch(/import\s*\{[^}]*\bleerControlesEfectivos\b[^}]*\}\s*from\s*'\.\/src\/state\/agent-controls\.js'/s);
    });

    it('los tres topes salen de una lectura única antes de los bucles', () => {
        const lectura = declaraciones(routerSource, 'controlesPasada');
        expect(lectura).toHaveLength(1);
        expect(lectura[0].kind).toBe('const');
        expect(lectura[0].init?.type).toBe('CallExpression');
        expect(lectura[0].init?.callee?.name).toBe('leerControlesEfectivos');

        const esperados = {
            MAX_AGENT_RETRIES: 'agenteRetriesExtra',
            MAX_JSON_CORRECTION_RETRIES: 'jsonCorrectionRetriesExtra',
            MAX_CLEANUP_RETRIES: 'agenteRetriesExtra',
        };
        for (const [nombre, propiedad] of Object.entries(esperados)) {
            const decls = declaraciones(routerSource, nombre);
            expect(decls, nombre).toHaveLength(1);
            expect(decls[0].kind, nombre).toBe('const');
            const leido = propiedadDe(decls[0].init);
            expect(leido, nombre).toEqual({ obj: 'controlesPasada', prop: propiedad });
            // La lectura única ocurre ANTES que el propio literal de la pasada.
            expect(lectura[0].start, nombre).toBeLessThan(decls[0].start);
        }
    });

    it('ningún tope se lee dentro del cuerpo del while (una pasada, un límite)', () => {
        const whiles = rangosWhile(routerSource);
        expect(whiles.length).toBeGreaterThan(0);
        for (const nombre of ['MAX_AGENT_RETRIES', 'MAX_JSON_CORRECTION_RETRIES', 'MAX_CLEANUP_RETRIES']) {
            for (const d of declaraciones(routerSource, nombre)) {
                for (const [inicio, fin] of whiles) {
                    expect(d.start >= inicio && d.start < fin, `${nombre} dentro de un while`)
                        .toBe(false);
                }
            }
        }
    });

    it('no queda ningún literal 2 en los tres topes ni reasignaciones', () => {
        for (const nombre of ['MAX_AGENT_RETRIES', 'MAX_JSON_CORRECTION_RETRIES', 'MAX_CLEANUP_RETRIES']) {
            expect(routerSource.includes(`const ${nombre} = 2;`), nombre).toBe(false);
            const apariciones = routerSource.match(new RegExp(`${nombre}\\s*=[^=]`, 'g')) || [];
            expect(apariciones, `${nombre} solo se declara una vez`).toHaveLength(1);
        }
    });

    it('los reintentos siguen devolviendo la vuelta gastada (turns--/cleanupTurns--)', () => {
        expect(routerSource).toMatch(/turns--/);
        expect(routerSource).toMatch(/cleanupTurns--/);
    });

    it('la foto de la pasada no cambia aunque el humano mueva el mando a mitad', () => {
        // Semántica que sostiene el patrón anterior: leerControlesEfectivos
        // devuelve una foto; mutar los ajustes después no reescribe la foto.
        const ajustes = { [AG_CONTROL_KEYS.agentRetries]: 2, [AG_CONTROL_KEYS.jsonCorrections]: 2 };
        const foto = leerControlesEfectivos(ajustes);
        ajustes[AG_CONTROL_KEYS.agentRetries] = 4;
        ajustes[AG_CONTROL_KEYS.jsonCorrections] = 0;
        expect(foto[AG_CONTROL_KEYS.agentRetries]).toBe(2);
        expect(foto[AG_CONTROL_KEYS.jsonCorrections]).toBe(2);
    });

    it('el tope compartido gobierna los dos bucles: misma fuente para ambos literales', () => {
        const normal = declaraciones(routerSource, 'MAX_AGENT_RETRIES')[0].init;
        const limpieza = declaraciones(routerSource, 'MAX_CLEANUP_RETRIES')[0].init;
        expect(propiedadDe(normal)).toEqual(propiedadDe(limpieza));
    });
});

describe('index.js: margen de la auditoría vía un único helper (T8, D-2)', () => {
    /** Ejecuta `margenAuditoriaEfectivo` de verdad con un getSettings simulado. */
    function margenConAjustes(ajustes) {
        const cuerpo = funcionDe(indexSource, 'margenAuditoriaEfectivo');
        expect(cuerpo, 'falta la función margenAuditoriaEfectivo en index.js').toBeTruthy();
        const contexto = createContext({ clampAgControl, AG_CONTROL_KEYS, getSettings: () => ajustes });
        runInContext(`${cuerpo}; globalThis.__r = margenAuditoriaEfectivo();`, contexto);
        return contexto.__r;
    }

    it('los dos sitios del chunk llaman al helper en lugar del literal 3000', () => {
        const decls = declaraciones(indexSource, 'tokenBuffer');
        expect(decls).toHaveLength(2);
        for (const d of decls) {
            expect(d.init?.type).toBe('CallExpression');
            expect(d.init?.callee?.name).toBe('margenAuditoriaEfectivo');
        }
        expect(indexSource).not.toMatch(/const tokenBuffer = 3000;/);
    });

    it('el helper está definido una sola vez y delega el clamp en el módulo puro', () => {
        const ocurrencias = indexSource.match(/function margenAuditoriaEfectivo\(/g) || [];
        expect(ocurrencias).toHaveLength(1);
        const cuerpo = funcionDe(indexSource, 'margenAuditoriaEfectivo');
        expect(cuerpo).toContain('clampAgControl');
        expect(cuerpo).toContain('AG_CONTROL_KEYS.auditChunkBuffer');
    });

    it('de fábrica da 3000 (AC0) y respeta el mando clampeado', () => {
        expect(margenConAjustes({})).toBe(3000);
        expect(margenConAjustes({ [AG_CONTROL_KEYS.auditChunkBuffer]: 3000 })).toBe(3000);
        expect(margenConAjustes({ [AG_CONTROL_KEYS.auditChunkBuffer]: 1000 })).toBe(1000);
        expect(margenConAjustes({ [AG_CONTROL_KEYS.auditChunkBuffer]: 50 })).toBe(500);
        expect(margenConAjustes({ [AG_CONTROL_KEYS.auditChunkBuffer]: 99999 })).toBe(8000);
        expect(margenConAjustes({ [AG_CONTROL_KEYS.auditChunkBuffer]: 'sin número' })).toBe(3000);
    });

    it('bajar el margen baja el chunk de los dos sitios (misma resta)', () => {
        // El chunk resulta de `Math.max(1000, maxContextLimit - tokenBuffer)` en
        // ambos sitios; el helper solo cambia tokenBuffer, nunca el Math.max.
        const sitios = indexSource.match(/const chunkTokenLimit = Math\.max\(1000, maxContextLimit - tokenBuffer\);/g) || [];
        expect(sitios).toHaveLength(2);
    });
});
