import { createContext, runInContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseAst } from 'rollup/parseAst';
import {
    PROMPT_CEILING_SETTINGS_KEYS,
    announceCeilingCut,
    applyUnitCeiling,
    clampPromptCeiling,
    estimatePromptTokens,
} from '../src/state/prompt-ceilings.js';

// T4 (spec 2026-11-05): ficha→rastreador. BLOCKER del oráculo (P2): «TRACKER
// STATE 0 nunca se corta en el rastreador». El patrón es el de ola 3: extraer la
// función REAL de index.js con parseAst y ejecutarla en vm con las dependencias
// inyectadas. Cero VRAM, cero red: cadenas en memoria.

const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

function extraer(nombre) {
    let encontrado = null;
    const visitar = nodo => {
        if (!nodo || typeof nodo !== 'object' || encontrado) return;
        if (nodo.type === 'FunctionDeclaration' && nodo.id?.name === nombre) {
            encontrado = indexSource.slice(nodo.start, nodo.end);
            return;
        }
        for (const valor of Object.values(nodo)) {
            if (Array.isArray(valor)) valor.forEach(visitar);
            else if (valor && typeof valor === 'object') visitar(valor);
        }
    };
    visitar(parseAst(indexSource));
    if (!encontrado) throw new Error(`Falta "${nombre}" en index.js`);
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

/** Ejecuta `buildTrackerPriorMemoText` real con helpers de presentación vaciados. */
function construir(settings) {
    const contexto = createContext({
        stripMemoHtml: texto => String(texto ?? ''),
        memoForTrackerContext: texto => String(texto ?? ''),
        PROMPT_CEILING_SETTINGS_KEYS,
        clampPromptCeiling,
        applyUnitCeiling,
        estimatePromptTokens,
        announceCeilingCut,
    });
    runInContext(extraer('buildTrackerPriorMemoText'), contexto);
    return contexto.buildTrackerPriorMemoText(settings);
}

/** Algoritmo exacto de main (df7b3cc) para cotejar byte a byte (AC1). */
function mainPriorMemoText(settings) {
    let priorMemoText = `## TRACKER STATE 0 (Current)\n${settings.currentMemo}\n\n`;
    const historyCount = (settings.trackerHistoryCount || 1) - 1;
    if (historyCount > 0 && settings.memoHistory && settings.memoHistory.length > 0) {
        const historyToInclude = settings.memoHistory.slice(0, historyCount).reverse();
        const historyString = historyToInclude.map((memo, i) => {
            const offset = -(historyToInclude.length - i);
            return `## TRACKER STATE ${offset}\n${memo}`;
        }).join('\n\n');
        priorMemoText = historyString + '\n\n' + priorMemoText;
    }
    return priorMemoText;
}

const bloque = (nombre, relleno) => `[${nombre}]\n${relleno}\n[/${nombre}]\n`;
const memoCon = (repetir = 40) => [
    bloque('TIME', 'Día 3, 14:00'),
    bloque('PARTY', 'Odran, Holdyn'),
    bloque('CHAR', 'x'.repeat(repetir * 100)),
    bloque('INV', 'y'.repeat(repetir * 100)),
    bloque('LOCATION', 'El osario'),
].join('\n');

describe('AC1: con techos de fábrica y uso medio, salida idéntica a main y contador 0', () => {
    it('memo ≈358 tok + 3 estados históricos → toStrictEqual main, cero eventos, cero logs', () => {
        const settings = {
            currentMemo: memoCon(2), // ≈358 tok reales
            memoHistory: [memoCon(2), memoCon(2), memoCon(2)],
            trackerHistoryCount: 4,
            fullReviewStateMode: false,
        };
        expect(estimatePromptTokens(settings.currentMemo)).toBeLessThan(400);
        const info = console.info;
        let logs = 0;
        console.info = () => { logs += 1; };
        const salida = construir(settings);
        console.info = info;
        expect(salida).toStrictEqual(mainPriorMemoText(settings));
        expect(eventos.length).toBe(0);
        expect(logs).toBe(0);
    });

    it('sin histórico (trackerHistoryCount=1) también es idéntico a main', () => {
        const settings = { currentMemo: memoCon(2), memoHistory: [memoCon(2)], trackerHistoryCount: 1 };
        expect(construir(settings)).toBe(mainPriorMemoText(settings));
        expect(eventos.length).toBe(0);
    });
});

describe('BLOCKER P2: TRACKER STATE 0 NUNCA se corta (aun con fullReviewStateMode)', () => {
    it('STATE 0 de ≈2200 tok y fullReviewStateMode: se conservan TODOS sus [TAG] y solo caen estados -N', () => {
        const estado0 = memoCon(45); // ≈2270 tok
        expect(estimatePromptTokens(estado0)).toBeGreaterThan(2200);
        const settings = {
            currentMemo: estado0,
            memoHistory: [bloque('CHAR', 'n'.repeat(2000)), bloque('CHAR', 'o'.repeat(2000)), bloque('CHAR', 'p'.repeat(2000))],
            trackerHistoryCount: 4,
            fullReviewStateMode: true,
            [PROMPT_CEILING_SETTINGS_KEYS.trackerMemo]: 1600,
        };
        const salida = construir(settings);
        // STATE 0 íntegro: cabecera y cada [TAG] con su pareja, sin partir.
        expect(salida).toContain(`## TRACKER STATE 0 (Current)\n${estado0}\n\n`);
        for (const tag of ['TIME', 'PARTY', 'CHAR', 'INV', 'LOCATION']) {
            expect((salida.match(new RegExp(`\\[${tag}\\]`, 'g')) || []).length)
                .toBe((estado0.match(new RegExp(`\\[${tag}\\]`, 'g')) || []).length);
            expect((salida.match(new RegExp(`\\[\\/${tag}\\]`, 'g')) || []).length)
                .toBe((estado0.match(new RegExp(`\\[\\/${tag}\\]`, 'g')) || []).length);
        }
        // Cayeron SOLO estados históricos, oldest-first: -3 es el primero en caer.
        expect(salida).not.toContain('## TRACKER STATE -3');
        expect(salida.indexOf('## TRACKER STATE 0 (Current)')).toBeGreaterThan(-1);
        // Evento único con motivo excede_state0 (STATE 0 solo ya pasa del techo).
        expect(eventos.length).toBe(1);
        expect(eventos[0].detail.motivo).toBe('excede_state0');
        expect(eventos[0].detail.zona).toBe('ficha_rastreador');
        expect(eventos[0].detail.unidades).toBeGreaterThanOrEqual(1);
    });

    it('STATE 0 enorme sin histórico: viaja íntegro, aviso excede_state0, unidades 0', () => {
        const estado0 = memoCon(45); // ≈2270 tok > 1600
        const settings = {
            currentMemo: estado0,
            memoHistory: [],
            trackerHistoryCount: 4,
            [PROMPT_CEILING_SETTINGS_KEYS.trackerMemo]: 1600,
        };
        const salida = construir(settings);
        expect(salida).toBe(`## TRACKER STATE 0 (Current)\n${estado0}\n\n`);
        expect(eventos.length).toBe(1);
        expect(eventos[0].detail).toMatchObject({ zona: 'ficha_rastreador', unidades: 0, motivo: 'excede_state0' });
    });
});

describe('Recorte del histórico (contador 1) y desactivación con 0', () => {
    it('histórico grande y STATE 0 medio: caen los -N oldest-first, UN evento con contador', () => {
        const settings = {
            currentMemo: memoCon(2), // ≈358 tok
            memoHistory: [
                bloque('CHAR', 'c'.repeat(5000)),  // memoHistory[0] = -1 (más nuevo)
                bloque('CHAR', 'b'.repeat(5000)),  // -2
                bloque('CHAR', 'a'.repeat(5000)),  // -3 (más viejo)
            ],
            trackerHistoryCount: 4,
            [PROMPT_CEILING_SETTINGS_KEYS.trackerMemo]: 1600,
        };
        const salida = construir(settings);
        expect(salida).toContain('## TRACKER STATE 0 (Current)');
        expect(salida).not.toContain('## TRACKER STATE -3'); // el más viejo cae primero
        expect(salida.indexOf('## TRACKER STATE -2')).toBeLessThan(salida.indexOf('## TRACKER STATE -1')); // orden conservado
        expect(salida).toContain(settings.currentMemo);
        expect(eventos.length).toBe(1);
        expect(eventos[0].detail.zona).toBe('ficha_rastreador');
        expect(eventos[0].detail.unidades).toBeGreaterThanOrEqual(1);
        expect(eventos[0].detail.motivo).toBeUndefined();
    });

    it('techo 0 = sin techo: no corta ni anuncia aunque explote', () => {
        const settings = {
            currentMemo: memoCon(2),
            memoHistory: [bloque('CHAR', 'c'.repeat(8000)), bloque('CHAR', 'b'.repeat(8000))],
            trackerHistoryCount: 3,
            [PROMPT_CEILING_SETTINGS_KEYS.trackerMemo]: 0,
        };
        const salida = construir(settings);
        expect(salida).toBe(mainPriorMemoText(settings));
        expect(eventos.length).toBe(0);
    });

    it('valor de campo basura → default de fábrica (clamp P1), corte como con 1600', () => {
        const settings = {
            currentMemo: memoCon(2),
            memoHistory: [bloque('CHAR', 'c'.repeat(5000)), bloque('CHAR', 'b'.repeat(5000)), bloque('CHAR', 'a'.repeat(5000))],
            trackerHistoryCount: 4,
            [PROMPT_CEILING_SETTINGS_KEYS.trackerMemo]: 'sin techo',
        };
        const salida = construir(settings);
        expect(salida).not.toContain('## TRACKER STATE -3');
        expect(eventos.length).toBe(1);
    });
});

describe('Rutas hermanas intocables (Non-Goals)', () => {
    it('el pase de instrucción directa (:3913-3927) sigue enviando el PRIOR MEMO íntegro, sin techo', () => {
        // Solo STATE 0 (nunca recortable en el rastreador): la composición textual
        // de main ha de seguir presente, sin llamada al techo en su tramo.
        const inicio = indexSource.indexOf('const sanitizedCurrentFull =');
        const fin = indexSource.indexOf('## USER INSTRUCTION', inicio);
        expect(inicio).toBeGreaterThan(-1);
        expect(fin).toBeGreaterThan(inicio);
        const tramo = indexSource.slice(inicio, fin);
        expect(tramo).toContain('`## PRIOR MEMO\\n${sanitizedCurrentForPrompt');
        expect(tramo).not.toContain('applyUnitCeiling');
        expect(tramo).not.toContain('buildTrackerPriorMemoText');
    });

    it('FULL_REVIEW / fullReviewStateMode siguen sin techo propio (Non-Goal §2)', () => {
        // Ola 5 (T10): la constante ya no se importa cruda (se resuelve en
        // agent-settings-editor.js). El invariante de ola 4 sigue vivo: la
        // Revisión Completa no tiene techo propio ni pasa por clampPromptCeiling.
        expect(indexSource).toContain('settings.fullReviewStateMode');
        expect(indexSource).toContain('resolveFullReviewPrompt');
        expect(indexSource).not.toContain('rpg_ceiling_full_review');
        const tramo = indexSource.slice(
            indexSource.indexOf('const revisionResuelta = resolveFullReviewPrompt(settings);'),
            indexSource.indexOf('revisionResuelta.suffix'),
        );
        expect(tramo).not.toContain('clampPromptCeiling');
        expect(tramo).not.toContain('applyUnitCeiling');
    });
});
