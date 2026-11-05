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

// T7 (spec 2026-11-05, D-2/P4): mundo→trabajo en router.js (runWorldProgressionPass).
// Tabla de cuatro casos lookback×techo y, después, el techo de tokens del bloque
// de mundo sobre las líneas `### …` del historial. El `dossierDump` y el
// esqueleto quedan fuera (Non-Goals §2). Cero VRAM, cero red.

const source = readFileSync(new URL('../router.js', import.meta.url), 'utf8');

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
    if (!encontrado) throw new Error(`Falta "${nombre}" en router.js`);
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

function enVm(nombre) {
    const contexto = createContext({
        PROMPT_CEILING_SETTINGS_KEYS, clampPromptCeiling, applyUnitCeiling, announceCeilingCut,
    });
    runInContext(extraer(nombre), contexto);
    return contexto[nombre];
}

const RESPLADO = 'No prior World Progression reports.';

describe('Tabla lookback×techo (P4): los cuatro casos', () => {
    const limite = enVm('resolveWorldHistoryLimit');

    it('(techo 0, lookback 0) → todos (0 = sin límite)', () => {
        expect(limite({ [PROMPT_CEILING_SETTINGS_KEYS.worldHistory]: 0, worldProgressionHistoryLookback: 0 })).toBe(0);
    });

    it('(techo 0, lookback N>0) → N: el lookback existente se respeta', () => {
        expect(limite({ [PROMPT_CEILING_SETTINGS_KEYS.worldHistory]: 0, worldProgressionHistoryLookback: 7 })).toBe(7);
    });

    it('(techo T, lookback 0) → T: con los valores de fábrica el default 5 TOPA el historial (D-5, consta en CHANGELOG)', () => {
        expect(limite({ [PROMPT_CEILING_SETTINGS_KEYS.worldHistory]: 8, worldProgressionHistoryLookback: 0 })).toBe(8);
        expect(limite({})).toBe(5);
    });

    it('(techo T, lookback N) → mín(N, T)', () => {
        expect(limite({ [PROMPT_CEILING_SETTINGS_KEYS.worldHistory]: 8, worldProgressionHistoryLookback: 3 })).toBe(3);
        expect(limite({ [PROMPT_CEILING_SETTINGS_KEYS.worldHistory]: 4, worldProgressionHistoryLookback: 9 })).toBe(4);
    });

    it('campo basura → default de fábrica (clamp P1), nunca 0 ni NaN', () => {
        expect(limite({ [PROMPT_CEILING_SETTINGS_KEYS.worldHistory]: 'sin techo' })).toBe(5);
        expect(limite({ [PROMPT_CEILING_SETTINGS_KEYS.worldHistory]: -2 })).toBe(5);
        expect(limite({ [PROMPT_CEILING_SETTINGS_KEYS.worldHistory]: '' })).toBe(5);
    });
});

describe('Vuelco del historial bajo el techo (zona mundo_trabajo)', () => {
    const vuelco = enVm('buildWorldJobHistoryDump');
    const linea = (n, relleno = 300) => `### Informe ${n}\n${'x'.repeat(relleno)}`;

    it('AC1: 3 reportes de uso medio, sin filtrado previo → bytes idénticos a main, cero eventos', () => {
        const lineas = [linea(1), linea(2), linea(3)];
        const main = lineas.join('\n\n');
        expect(vuelco(lineas, 0, {})).toBe(main);
        expect(eventos.length).toBe(0);
    });

    it('historial vacío → línea de respaldo de main', () => {
        expect(vuelco([], 0, {})).toBe(RESPLADO);
        expect(eventos.length).toBe(0);
    });

    it('desborda el techo de tokens: caen las líneas MÁS VIEJAS primero y el evento suma tabla+recorte', () => {
        // 4 líneas de 2914 chars ≈ 729 tok c/u; join ≈ 11662 chars = 2916 tok.
        // Techo del bloque: 2048 tok (borde mínimo de la cota) → caen las 2 viejas.
        const lineas = [linea(1, 2900), linea(2, 2900), linea(3, 2900), linea(4, 2900)];
        const salida = vuelco(lineas, 1, { [PROMPT_CEILING_SETTINGS_KEYS.worldBlock]: 2048 });
        expect(salida).not.toContain('### Informe 1');
        expect(salida).not.toContain('### Informe 2');
        expect(salida).toContain('### Informe 3');
        expect(salida.indexOf('### Informe 3')).toBeLessThan(salida.indexOf('### Informe 4'));
        // El separador de join('\n\n') se conserva exacto entre las supervivientes.
        expect(salida).toBe(['### Informe 3\n' + 'x'.repeat(2900), '### Informe 4\n' + 'x'.repeat(2900)].join('\n\n'));
        expect(eventos.length).toBe(1);
        expect(eventos[0].detail).toMatchObject({ zona: 'mundo_trabajo', unidades: 3, tokens: expect.any(Number) }); // 2 recortadas + 1 filtrada por tabla
    });

    it('techo 0 en el bloque: ningún recorte de tokens, pero la tabla sigue contando y anunciando', () => {
        const lineas = [linea(1, 20000)];
        const salida = vuelco(lineas, 2, { [PROMPT_CEILING_SETTINGS_KEYS.worldBlock]: 0 });
        expect(salida).toBe(lineas.join('\n\n'));
        expect(eventos.length).toBe(1);
        expect(eventos[0].detail).toMatchObject({ zona: 'mundo_trabajo', unidades: 2 });
    });

    it('si todo cae, queda el respaldo «No prior…» intacto (preamble intocable)', () => {
        const lineas = [linea(1, 9000), linea(2, 9000)]; // cada una ya rebasa 2048 tok
        expect(vuelco(lineas, 0, { [PROMPT_CEILING_SETTINGS_KEYS.worldBlock]: 2048 })).toBe(RESPLADO);
        expect(eventos.length).toBe(1);
    });
});

describe('Non-Goals respetados en la zona (D-2, §2)', () => {
    it('dossierDump y el esqueleto no pasan por ningún techo', () => {
        expect(source).toContain('const dossierDump = selectedDossiers.length');
        const tramo = source.slice(source.indexOf('const dossierDump ='), source.indexOf('const dossierDump =') + 320);
        expect(tramo).not.toContain('Ceiling');
        expect(tramo).not.toContain('applyUnitCeiling');
    });

    it('la llamada real del pase usa la tabla y el vuelco con techo', () => {
        expect(source).toContain('const worldHistoryLimit = resolveWorldHistoryLimit(settings);');
        expect(source).toContain('const historicalDump = buildWorldJobHistoryDump(historicalReportLines, worldHistoryEntradasFiltradas, settings);');
    });
});
