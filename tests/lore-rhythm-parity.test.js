import { createContext, runInContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAst } from 'rollup/parseAst';
import { escapeHtml } from '../memo-processor.js';
import {
    FACTORY_RHYTHM_ID,
    LORE_RHYTHM_CUSTOM_ID,
    LORE_RHYTHM_PRESETS,
    resolveLoreRhythmId,
    rhythmPresetEstimate,
} from '../src/state/lore-rhythm.js';

// T6 — Paridad AC0 (laudo del defecto). Con los valores guardados actuales
// (routerRunEvery=1, routerMaxTurns=5) el agente corre cada turno y NADIE toca
// esa semántica: el render del dial es puro y `narrative-hooks.js` sigue leyendo
// `settings.routerRunEvery` en vivo, sin capa de presets intermedia. La
// instantánea de las dos líneas se tomó sobre `main` (b3edbde) con `git show`
// y se conserva como test permanente (patrón thinking-default-parity.test.js).
const instantanea = JSON.parse(readFileSync(new URL('./fixtures/ritmo-gating-main.json', import.meta.url), 'utf8'));
const narrativeSource = readFileSync(new URL('../narrative-hooks.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

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

describe('Paridad AC0: el render del dial no muta los ajustes guardados (1,5)', () => {
    it('cotejo profundo antes/después: ni un byte de (1,5) cambia, cero eventos, cero guardados', () => {
        const ajustes = {
            routerRunEvery: 1,
            routerMaxTurns: 5,
            routerLastRunChatLength: 42,
            routerLookbackSinceLastRun: true,
            memoOtro: 'lo que sea',
            lista: [1, 2, 3],
        };
        const antes = JSON.parse(JSON.stringify(ajustes));
        let guardados = 0;
        const eventos = [];
        const elementos = {
            rpg_lore_rhythm_select: { innerHTML: '', value: '' },
            rpg_lore_rhythm_custom_row: { style: { display: 'none' } },
            rpg_tracker_router_run_every: { value: '' },
            rpg_tracker_router_max_turns: { value: '' },
        };
        const contexto = createContext({
            document: { getElementById: id => elementos[id] || null, dispatchEvent: e => eventos.push(e) },
            saveSettings: () => { guardados += 1; },
            escapeHtml, LORE_RHYTHM_PRESETS, LORE_RHYTHM_CUSTOM_ID, FACTORY_RHYTHM_ID, resolveLoreRhythmId, rhythmPresetEstimate,
        });
        // El render real de index.js, con el builder real de opciones.
        runInContext(extraerDe(indexSource, 'buildLoreRhythmOptionsHtml'), contexto);
        runInContext(extraerDe(indexSource, 'renderLoreRhythmBox'), contexto);
        contexto.renderLoreRhythmBox(ajustes);
        expect(ajustes).toEqual(antes);
        expect(guardados).toBe(0);
        expect(eventos).toEqual([]);
        // AC1: el dial muestra «Personalizado (avanzado)» con los sueltos y sus valores.
        expect(elementos.rpg_lore_rhythm_select.value).toBe(LORE_RHYTHM_CUSTOM_ID);
        expect(elementos.rpg_lore_rhythm_custom_row.style.display).toBe('flex');
        expect(elementos.rpg_tracker_router_run_every.value).toBe(1);
        expect(elementos.rpg_tracker_router_max_turns.value).toBe(5);
    });

    it('el par heredado del defecto resuelve «personalizado», no cualquier cosa', () => {
        expect(resolveLoreRhythmId({ routerRunEvery: 1, routerMaxTurns: 5 })).toBe(LORE_RHYTHM_CUSTOM_ID);
    });
});

describe('Paridad AC0: la ruta de gating byte a byte contra la instantánea de main', () => {
    it('la sentencia del throttle sigue escrita exactamente como el día de la captura', () => {
        expect(narrativeSource).toContain(instantanea.gating);
    });

    it('«Ejecutar ahora» conserva la llamada manual intacta (AC4): misma línea, misma isManual', () => {
        expect(narrativeSource).toContain(instantanea.manual);
    });

    it('con (1,5) persistidos la expresión real del throttle decide «cada turno» (comportamiento del defecto)', () => {
        // Se ejecuta el fragmento literal de la instantánea, no una paráfrasis.
        const contexto = createContext({ settings: { ...instantanea.decision_defecto.ajustes } });
        const runEvery = runInContext(extraerGating() + '; runEvery', contexto);
        expect(runEvery).toBe(instantanea.decision_defecto.runEvery_efe);
        expect(runEvery === 1).toBe(instantanea.decision_defecto.corre_cada_turno);
    });

    function extraerGating() {
        const linea = instantanea.gating.trim();
        const idx = narrativeSource.indexOf(linea);
        expect(idx, 'el gating instantaneado ya no está en narrative-hooks.js').toBeGreaterThan(-1);
        return linea;
    }
});

describe('Paridad AC0: cero capa de presets en el gating (aserción AST)', () => {
    /** Todos los MemberExpression `settings.routerRunEvery` del fichero. */
    function lecturasDeSettingsRouterRunEvery() {
        const lecturas = [];
        const visitar = nodo => {
            if (!nodo || typeof nodo !== 'object') return;
            if (
                nodo.type === 'MemberExpression'
                && !nodo.computed
                && nodo.object?.type === 'Identifier' && nodo.object.name === 'settings'
                && nodo.property?.type === 'Identifier' && nodo.property.name === 'routerRunEvery'
            ) lecturas.push(nodo);
            for (const valor of Object.values(nodo)) {
                if (Array.isArray(valor)) valor.forEach(visitar);
                else if (valor && typeof valor === 'object') visitar(valor);
            }
        };
        visitar(parseAst(narrativeSource));
        return lecturas;
    }

    it('el throttle lee settings.routerRunEvery directamente, como siempre', () => {
        expect(lecturasDeSettingsRouterRunEvery().length).toBeGreaterThan(0);
    });

    it('narrative-hooks.js no importa ni menciona la tabla de ritmos: sin capa intermedia', () => {
        const imports = [];
        const visitar = nodo => {
            if (!nodo || typeof nodo !== 'object') return;
            if (nodo.type === 'ImportDeclaration' || nodo.type === 'ExportAllDeclaration') {
                imports.push(String(nodo.source?.value || ''));
            }
            for (const valor of Object.values(nodo)) {
                if (Array.isArray(valor)) valor.forEach(visitar);
                else if (valor && typeof valor === 'object') visitar(valor);
            }
        };
        visitar(parseAst(narrativeSource));
        for (const origen of imports) expect(origen).not.toContain('lore-rhythm');
        expect(narrativeSource).not.toMatch(/LORE_RHYTHM|resolveLoreRhythmId|loreRhythm/i);
    });
});
