import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runtimeState } from '../src/app/runtime-state.js';
import { wireAgentActivity } from '../src/ui/panel/panel-agent-activity.js';

// T9 (spec 2026-11-05, D-3): el pie del panel del agente resume los recortes de
// techo por zona (ficha_* · mundo_*), suma con UN evento por llamada y no guarda
// nada (R5: contadores solo de sesión). Patrón de harness: el de
// panel-agent-activity.test.js (wireAgentActivity con DOM y document falsos).

const markupSource = readFileSync(new URL('../src/ui/panel/panel-markup.js', import.meta.url), 'utf8');

let listeners;
let ceilingEl;

beforeEach(() => {
    listeners = {};
    ceilingEl = { textContent: 'INICIAL', title: '' };
    runtimeState.currentChatId = 'Chat A';
    globalThis._rpgCurrentChatId = () => runtimeState.currentChatId;
    globalThis.document = {
        addEventListener: vi.fn((type, fn) => { listeners[type] = fn; }),
    };
});

afterEach(() => {
    delete globalThis.document;
    delete globalThis.toastr;
    delete globalThis._rpgCurrentChatId;
    runtimeState.currentChatId = null;
});

function cablear(saveSettings = vi.fn()) {
    wireAgentActivity({
        agentPanel: { querySelector: id => (id === '#rt-agent-ceiling-cuts' ? ceilingEl : null) },
        getSettings: () => ({}),
        getRouterTick: () => 0,
        getMapUpdaterTick: () => 0,
        saveSettings,
    });
    return saveSettings;
}

const corte = detail => ({ detail });

describe('panel-markup.js: el hueco del contador existe y se explica solo', () => {
    it('#rt-agent-ceiling-cuts vive junto a #rt-agent-last-run y aclara que es efímero', () => {
        expect(markupSource).toContain('id="rt-agent-ceiling-cuts"');
        const linea = markupSource.split('\n').find(l => l.includes('id="rt-agent-ceiling-cuts"'));
        expect(linea).toContain('esta sesión');
        const i = markupSource.indexOf('id="rt-agent-last-run"');
        expect(i).toBeGreaterThan(-1);
        expect(markupSource.indexOf('id="rt-agent-ceiling-cuts"')).toBeGreaterThan(i);
    });
});

describe('syncCeilingCutsDisplay: suma por zona con un evento por llamada', () => {
    it('arranca vacío (ni un recorte = ni un texto) y escucha rt_prompt_ceiling_cut', () => {
        cablear();
        expect(ceilingEl.textContent).toBe('');
        expect(globalThis.document.addEventListener).toHaveBeenCalledWith('rt_prompt_ceiling_cut', expect.any(Function));
    });

    it('suma ficha_* y mundo_* por separado y pinta el formato canónico', () => {
        cablear();
        listeners.rt_prompt_ceiling_cut(corte({ zona: 'ficha_rastreador', unidades: 2, tokens: 900 }));
        listeners.rt_prompt_ceiling_cut(corte({ zona: 'ficha_narrador', unidades: 1, tokens: 500 }));
        listeners.rt_prompt_ceiling_cut(corte({ zona: 'mundo_narrador', unidades: 3, tokens: 2000 }));
        listeners.rt_prompt_ceiling_cut(corte({ zona: 'mundo_trabajo', unidades: 4, tokens: 3000 }));
        expect(ceilingEl.textContent).toBe('✂️ Recortes de techo (sesión): ficha 3 · mundo 7');
    });

    it('UN evento con N unidades suma N una sola vez (sin doble conteo R1)', () => {
        cablear();
        listeners.rt_prompt_ceiling_cut(corte({ zona: 'mundo_narrador', unidades: 2, tokens: 1000 }));
        expect(ceilingEl.textContent).toBe('✂️ Recortes de techo (sesión): ficha 0 · mundo 2');
    });

    it('evento sin unidades (aviso sin_unidad/excede_state0) no mueve el contador', () => {
        cablear();
        listeners.rt_prompt_ceiling_cut(corte({ zona: 'ficha_narrador', unidades: 0, tokens: 4000, motivo: 'sin_unidad' }));
        expect(ceilingEl.textContent).toBe('');
    });

    it('zona desconocida o unidades basura: no suma ni pinta', () => {
        cablear();
        listeners.rt_prompt_ceiling_cut(corte({ zona: 'raro', unidades: 5 }));
        listeners.rt_prompt_ceiling_cut(corte({ zona: 'ficha_rastreador', unidades: 'muchas' }));
        expect(ceilingEl.textContent).toBe('');
    });

    it('nunca guarda ajustes: los contadores son solo de sesión (R5, sin saveSettings)', () => {
        const guardados = cablear();
        listeners.rt_prompt_ceiling_cut(corte({ zona: 'ficha_rastreador', unidades: 2, tokens: 100 }));
        expect(guardados).not.toHaveBeenCalled();
    });

    it('sin el elemento en el DOM (panel alternativo) no peta', () => {
        ceilingEl = null;
        wireAgentActivity({
            agentPanel: { querySelector: () => null },
            getSettings: () => ({}),
            getRouterTick: () => 0,
            getMapUpdaterTick: () => 0,
            saveSettings: vi.fn(),
        });
        expect(() => listeners.rt_prompt_ceiling_cut(corte({ zona: 'mundo_trabajo', unidades: 1 }))).not.toThrow();
    });
});

describe('Superficie devuelta por wireAgentActivity', () => {
    it('expone syncCeilingCutsDisplay para el refresco externo', () => {
        const api = wireAgentActivity({
            agentPanel: { querySelector: id => (id === '#rt-agent-ceiling-cuts' ? ceilingEl : null) },
            getSettings: () => ({}),
            getRouterTick: () => 0,
            getMapUpdaterTick: () => 0,
            saveSettings: vi.fn(),
        });
        expect(typeof api.syncCeilingCutsDisplay).toBe('function');
        listeners.rt_prompt_ceiling_cut(corte({ zona: 'ficha_rastreador', unidades: 1 }));
        api.syncCeilingCutsDisplay();
        expect(ceilingEl.textContent).toBe('✂️ Recortes de techo (sesión): ficha 1 · mundo 0');
    });
});
