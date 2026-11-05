import { createContext, runInContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseAst } from 'rollup/parseAst';
import {
    PROMPT_CEILING_SETTINGS_KEYS,
    announceCeilingCut,
    applyTextCeiling,
    clampPromptCeiling,
    estimatePromptTokens,
} from '../src/state/prompt-ceilings.js';

// T5 (spec 2026-11-05): ficha→narrador. El memo se inyecta en el user message
// cada turno (narrative-hooks.js:1474 en main): es SOLO lectura, así que aquí sí
// caen [TAG] completos con orden fijo del último al primero (R4). Preámbulo y
// cabecera viajan siempre intactos.

const source = readFileSync(new URL('../narrative-hooks.js', import.meta.url), 'utf8');

function extraer(nombre) {
    let encontrado = null;
    const visitar = nodo => {
        if (!nodo || typeof nodo !== 'object' || encontrado) return;
        if (nodo.type === 'FunctionDeclaration' && nodo.id?.name === nombre) {
            encontrado = source.slice(nodo.start, nodo.end);
            return;
        }
        for (const valor of Object.values(nodo)) {
            if (Array.isArray(valor)) valor.forEach(visitar);
            else if (valor && typeof valor === 'object') visitar(valor);
        }
    };
    visitar(parseAst(source));
    if (!encontrado) throw new Error(`Falta "${nombre}" en narrative-hooks.js`);
    return encontrado;
}

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

function aplicar(memoText, settings) {
    const contexto = createContext({
        PROMPT_CEILING_SETTINGS_KEYS, clampPromptCeiling, applyTextCeiling, announceCeilingCut,
    });
    runInContext(extraer('applyNarratorMemoCeiling'), contexto);
    return contexto.applyNarratorMemoCeiling(memoText, settings);
}

const bloque = (n, relleno) => `[${n}]\n${relleno}\n[/${n}]\n`;

describe('AC1: memo de uso medio idéntico a main y sin anuncios', () => {
    it('memo ≈358 tok con techos de fábrica → mismo bytes, cero eventos', () => {
        const memo = `${bloque('TIME', 'Día 3, 14:00')}\n${bloque('PARTY', 'Odran, Holdyn')}\n${bloque('CHAR', 'x'.repeat(200))}\n${bloque('INV', 'y'.repeat(200))}\n${bloque('LOCATION', 'El osario')}`;
        expect(estimatePromptTokens(memo)).toBeLessThan(400);
        expect(aplicar(memo, {})).toBe(memo);
        expect(eventos.length).toBe(0);
    });
});

describe('Corte fijo del último [TAG] al primero (orden de R4)', () => {
    it('memo de 3 bloques ≈1250 tok c/u con techo 1600: cae el último primero y el primero sobrevive', () => {
        const memo = `${bloque('A', 'x'.repeat(5000))}\n${bloque('B', 'y'.repeat(5000))}\n${bloque('C', 'z'.repeat(5000))}`;
        const salida = aplicar(memo, { [PROMPT_CEILING_SETTINGS_KEYS.trackerMemo]: 1600 });
        expect(salida).toContain('[A]');
        expect(salida).not.toContain('[C]');
        expect(salida).not.toContain('[B]');
        // Ningún [TAG] partido: cada bloque vivo abre y cierra.
        expect(salida.match(/\[A\]/g).length).toBe(1);
        expect(salida.match(/\[\/A\]/g).length).toBe(1);
        expect(eventos.length).toBe(1);
        expect(eventos[0].detail).toMatchObject({ zona: 'ficha_narrador', unidades: 2 });
    });

    it('techo 0 = sin techo: memo enorme intacto y cero anuncios', () => {
        const memo = bloque('A', 'x'.repeat(20000));
        expect(aplicar(memo, { [PROMPT_CEILING_SETTINGS_KEYS.trackerMemo]: 0 })).toBe(memo);
        expect(eventos.length).toBe(0);
    });

    it('prosa sin [TAG] por encima del techo: no se corta nada y avisa sin_unidad', () => {
        const prosa = 'cosas del narrador sin bloques. '.repeat(300);
        expect(estimatePromptTokens(prosa)).toBeGreaterThan(1600);
        expect(aplicar(prosa, {})).toBe(prosa);
        expect(eventos.length).toBe(1);
        expect(eventos[0].detail).toMatchObject({ zona: 'ficha_narrador', motivo: 'sin_unidad' });
    });
});

describe('Preámbulo y cabecera intocables (T5)', () => {
    it('la inyección real sigue envolviendo STATE_MEMO_INJECT_PREAMBLE + cabecera alrededor del texto con techo', () => {
        const i = source.indexOf('const memoText = applyNarratorMemoCeiling(');
        expect(i).toBeGreaterThan(-1);
        const tramo = source.slice(i, i + 400);
        expect(tramo).toContain('injections += `${STATE_MEMO_INJECT_PREAMBLE}\\n\\n## TRACKER STATE 0 (Current)\\n${memoText}\\n\\n`;');
    });
});
