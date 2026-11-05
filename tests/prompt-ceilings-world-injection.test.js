import { createContext, runInContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseAst } from 'rollup/parseAst';
import {
    PROMPT_CEILING_SETTINGS_KEYS,
    announceCeilingCut,
    applyUnitCeiling,
    clampPromptCeiling,
} from '../src/state/prompt-ceilings.js';

// T6 (spec 2026-11-05): TEST PRIMERO. La auditoría decía que el bloque
// «## WORLD PROGRESSION REPORTS» llegaba al narrador por DOS concatenaciones
// (index.js:2821-2849 y narrative-hooks.js:1619-1643). Este fixture cuenta las
// apariciones en una petición real y el test comprueba EN VIVO, por AST, la
// resolución: la ruta de index.js está MUERTA (cero llamadas) → rutas excluyentes
// → un solo techo efectivo + paridad AST byte a byte, y NO se aplica la dieta (d)
// (no hay duplicado que deduplicar). Cero VRAM, cero red.

const fixture = JSON.parse(readFileSync(new URL('./fixtures/world-block-request-main.json', import.meta.url), 'utf8'));
const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const hooksSource = readFileSync(new URL('../narrative-hooks.js', import.meta.url), 'utf8');
const CABECERA = fixture.cabecera;

function extraerDe(fuente, nombre) {
    let encontrado = null;
    const visitar = nodo => {
        if (!nodo || typeof nodo !== 'object' || encontrado) return;
        if (nodo.type === 'FunctionDeclaration' && nodo.id?.name === nombre) {
            encontrado = fuente.slice(nodo.start, nodo.end);
            return;
        }
        for (const valor of Object.values(nodo)) {
            if (Array.isArray(valor)) valor.forEach(visitar);
            else if (valor && typeof valor === 'object') visitar(valor);
        }
    };
    visitar(parseAst(fuente));
    if (!encontrado) throw new Error(`Falta "${nombre}"`);
    return encontrado;
}

/** Llamadas (CallExpression) a una función por nombre en todo el AST. */
function llamadasDe(fuente, nombre) {
    let total = 0;
    const visitar = nodo => {
        if (!nodo || typeof nodo !== 'object') return;
        if (nodo.type === 'CallExpression' && nodo.callee?.name === nombre) total += 1;
        for (const valor of Object.values(nodo)) {
            if (Array.isArray(valor)) valor.forEach(visitar);
            else if (valor && typeof valor === 'object') visitar(valor);
        }
    };
    visitar(parseAst(fuente));
    return total;
}

const ocurrencias = (texto, aguja) => texto.split(aguja).length - 1;

const eventos = [];

beforeEach(() => {
    eventos.length = 0;
    globalThis.CustomEvent = class FakeCustomEvent {
        constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    };
    globalThis.document = { dispatchEvent: e => { eventos.push(e); return true; } };
});

afterEach(() => {
    delete globalThis.document;
    delete globalThis.CustomEvent;
});

describe('Resolución T6: el bloque de mundo NO se duplica en la misma petición', () => {
    it('refreshExtensionPrompt (ruta de index.js) tiene CERO llamadas: está muerta', () => {
        expect(ocurrencias(indexSource, 'function refreshExtensionPrompt')).toBe(1);
        expect(llamadasDe(indexSource, 'refreshExtensionPrompt')).toBe(0);
    });

    it('installRouterInterceptor declara la inyección exclusiva y limpia el prompt heredado', () => {
        const interceptor = extraerDe(indexSource, 'installRouterInterceptor');
        expect(interceptor).toContain(`setExtensionPrompt('rpg_tracker_lore', '', 0, 0)`);
        expect(interceptor).toContain('handled exclusively by rpgTrackerInterceptor');
    });

    it('fixture: una petición ensamblada por rutas vivas lleva la cabecera UNA vez', () => {
        expect(fixture.apariciones_en_peticion).toBe(1);
        // Se cuenta SOLO la construcción en código (plantilla `…\n${`), no las
        // menciones en comentarios: una por archivo. La de index.js vive dentro
        // de la ruta muerta; la única viva es la de narrative-hooks.js.
        const construccion = CABECERA + '\\n${';
        expect(ocurrencias(hooksSource, construccion)).toBe(1);
        expect(ocurrencias(indexSource, construccion)).toBe(1);
        const rutaMuerta = extraerDe(indexSource, 'refreshExtensionPrompt');
        expect(rutaMuerta).toContain(CABECERA);
        // Y la viva techa ANTES de montar la cabecera: worldBlock ya viene del techo.
        const tramoVivo = hooksSource.slice(hooksSource.indexOf('const worldUnits = [];'), hooksSource.indexOf(construccion));
        expect(tramoVivo).toContain('applyWorldInjectionCeiling(worldUnits, settings)');
    });
});

describe('Paridad AST byte a byte entre la ruta viva y la muerta', () => {
    it('applyWorldInjectionCeiling es idéntica en index.js y narrative-hooks.js', () => {
        const viva = extraerDe(hooksSource, 'applyWorldInjectionCeiling');
        const muerta = extraerDe(indexSource, 'applyWorldInjectionCeiling');
        expect(viva).toBe(muerta);
    });
});

describe('Semántica del techo de mundo→narrador (zona mundo_narrador)', () => {
    const unidad = (n, relleno = 5000) => `### [Informe ${n}]\n${'x'.repeat(relleno)}\n\n`;

    function aplicar(worldUnits, settings) {
        const contexto = createContext({
            PROMPT_CEILING_SETTINGS_KEYS, clampPromptCeiling, applyUnitCeiling, announceCeilingCut,
        });
        runInContext(extraerDe(hooksSource, 'applyWorldInjectionCeiling'), contexto);
        return contexto.applyWorldInjectionCeiling(worldUnits, settings);
    }

    it('AC1: 3 reportes de uso medio con techo de fábrica → bytes idénticos, cero eventos', () => {
        const unidades = [unidad(1, 400), unidad(2, 400), unidad(3, 400)];
        expect(aplicar(unidades, {})).toBe(unidades.join(''));
        expect(eventos.length).toBe(0);
    });

    it('desborda: cae el informe MÁS VIEJO primero (uid ascendente), orden conservado, UN evento', () => {
        // 4 informes de 3019 chars ≈ 755 tok c/u; techo 2048 tok (borde mínimo de la
        // cota worldBlock) = 8192 chars → solo caben los 2 más nuevos.
        const unidades = [unidad(1, 3000), unidad(2, 3000), unidad(3, 3000), unidad(4, 3000)];
        const salida = aplicar(unidades, { [PROMPT_CEILING_SETTINGS_KEYS.worldBlock]: 2048 });
        expect(salida).not.toContain('[Informe 1]');
        expect(salida).not.toContain('[Informe 2]');
        expect(salida).toContain('[Informe 3]');
        expect(salida).toContain('[Informe 4]');
        expect(salida.indexOf('[Informe 3]')).toBeLessThan(salida.indexOf('[Informe 4]'));
        expect(eventos.length).toBe(1);
        expect(eventos[0].detail).toMatchObject({ zona: 'mundo_narrador', unidades: 2 });
    });

    it('techo 0 = sin techo: no corta ni anuncia', () => {
        const unidades = [unidad(1, 20000), unidad(2, 20000)];
        expect(aplicar(unidades, { [PROMPT_CEILING_SETTINGS_KEYS.worldBlock]: 0 })).toBe(unidades.join(''));
        expect(eventos.length).toBe(0);
    });
});
