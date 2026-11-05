import { createContext, runInContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAst } from 'rollup/parseAst';
import {
    PROMPT_CEILING_DEFAULTS,
    PROMPT_CEILING_SETTINGS_KEYS,
    clampPromptCeiling,
} from '../src/state/prompt-ceilings.js';

// T8 (spec 2026-11-05, D-4): el bloque «🧱 Techos de prompts» vive en el cajón
// «Rendimiento (modelo local)», bajo el dial de ola 3. Ejecuta de verdad
// renderPromptCeilingsBox / bindPromptCeilingControls (patrón ola 2-3: parseAst + vm).

const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const settingsHtml = readFileSync(new URL('../settings.html', import.meta.url), 'utf8');

function extraer(nombre) {
    let encontrado = null;
    const visitar = nodo => {
        if (!nodo || typeof nodo !== 'object' || encontrado) return;
        if (nodo.type === 'FunctionDeclaration' && nodo.id?.name === nombre) {
            encontrado = indexSource.slice(nodo.start, nodo.end);
            return;
        }
        if (nodo.type === 'VariableDeclaration') {
            for (const declaracion of nodo.declarations || []) {
                if (declaracion.id?.name === nombre) return (encontrado = indexSource.slice(nodo.start, nodo.end));
            }
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

function escenario(ajustes) {
    const elementos = {
        rpg_prompt_ceilings_box: { dataset: {} },
        rpg_ceiling_tracker_memo: { value: '', dataset: {}, addEventListener: vi.fn() },
        rpg_ceiling_world_block: { value: '', dataset: {}, addEventListener: vi.fn() },
        rpg_ceiling_world_history: { value: '', dataset: {}, addEventListener: vi.fn() },
        rpg_ceiling_reset: { dataset: {}, addEventListener: vi.fn() },
    };
    const guardados = vi.fn();
    const toasts = [];
    const contexto = createContext({
        document: { getElementById: id => elementos[id] || null },
        saveSettings: guardados,
        toastr: { success: (...a) => toasts.push(a), info: (...a) => toasts.push(a) },
        PROMPT_CEILING_DEFAULTS,
        PROMPT_CEILING_SETTINGS_KEYS,
        clampPromptCeiling,
    });
    runInContext(extraer('renderPromptCeilingsBox'), contexto);
    runInContext(extraer('bindPromptCeilingControls'), contexto);
    return { contexto, elementos, guardados, toasts, ajustes };
}

beforeEach(() => { /* nada global que limpiar: el vm es hermético */ });

describe('settings.html: el cajón donde manda la spec', () => {
    it('vive en «Rendimiento (modelo local)», bajo el dial de ritmo, con 3 campos y restaurar', () => {
        const caja = settingsHtml.slice(settingsHtml.indexOf('id="rpg_local_thinking_policy_box"'));
        const bloque = caja.slice(0, 12000);
        expect(bloque).toContain('id="rpg_prompt_ceilings_box"');
        expect(bloque).toContain('id="rpg_ceiling_tracker_memo"');
        expect(bloque).toContain('id="rpg_ceiling_world_block"');
        expect(bloque).toContain('id="rpg_ceiling_world_history"');
        // Debajo del dial de ola 3.
        expect(bloque.indexOf('id="rpg_lore_rhythm_reset"')).toBeLessThan(bloque.indexOf('id="rpg_prompt_ceilings_box"'));
        // D-4: «Restaurar (1600 / 4096 / 5)» anunciado en el botón.
        expect(bloque).toContain('Restaurar valores de fábrica (1600 / 4096 / 5)');
    });

    it('tooltips honestos: promedios medidos, «0 = sin techo» y la nota R3 de chars/4', () => {
        const tramo = settingsHtml.slice(settingsHtml.indexOf('id="rpg_prompt_ceilings_box"'));
        const caja = tramo.slice(0, 6000);
        expect(caja).toContain('≈358 tok');            // memo medio medido
        expect(caja).toContain('852 tok');             // respuesta del narrador medida
        expect(caja).toContain('0 = sin techo');       // semántica del 0 (R5)
        expect(caja).toContain('15-30 %');             // R3: subestimación español/JSON
        expect(caja).toContain('solo la sesión');      // R5: contadores efímeros
    });

    it('verificador binario T8: tres o más líneas con rpg_ceiling_ en settings.html', () => {
        const lineas = settingsHtml.split('\n').filter(l => l.includes('rpg_ceiling_'));
        expect(lineas.length).toBeGreaterThanOrEqual(3);
    });
});

describe('renderPromptCeilingsBox: leer no escribe (AC0)', () => {
    it('pinta los valores guardados tal cual y no muta nada', () => {
        const ajustes = {
            rpg_ceiling_tracker_memo: 1600,
            rpg_ceiling_world_block: 4096,
            rpg_ceiling_world_history: 5,
        };
        const antes = structuredClone(ajustes);
        const { contexto, elementos, guardados } = escenario(ajustes);
        contexto.renderPromptCeilingsBox(ajustes);
        expect(elementos.rpg_ceiling_tracker_memo.value).toBe(1600);
        expect(elementos.rpg_ceiling_world_block.value).toBe(4096);
        expect(elementos.rpg_ceiling_world_history.value).toBe(5);
        expect(ajustes).toEqual(antes);
        expect(guardados).not.toHaveBeenCalled();
    });

    it('claves ausentes → campo vacío, jamás un 0 falso', () => {
        const { contexto, elementos } = escenario({});
        contexto.renderPromptCeilingsBox({});
        expect(elementos.rpg_ceiling_tracker_memo.value).toBe('');
    });
});

describe('bindPromptCeilingControls: change persiste clamp y avisa en español', () => {
    it('enlaza change+restore una sola vez y repinta al abrir', () => {
        const ajustes = { rpg_ceiling_tracker_memo: 1600, rpg_ceiling_world_block: 4096, rpg_ceiling_world_history: 5 };
        const { contexto, elementos } = escenario(ajustes);
        contexto.bindPromptCeilingControls(ajustes);
        expect(elementos.rpg_ceiling_tracker_memo.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
        expect(elementos.rpg_ceiling_reset.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
        expect(elementos.rpg_ceiling_tracker_memo.value).toBe(1600);
        // Segundo bind: sin doble enlace (dataset.rtBound).
        contexto.bindPromptCeilingControls(ajustes);
        expect(elementos.rpg_ceiling_tracker_memo.addEventListener).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['5000', 4000],     // entero fuera de cota → borde
        ['0', 0],           // 0 = sin techo
        ['sin techo', 1600],// basura → default (NUNCA 0)
        ['', 1600],         // vacío → default
        ['100', 800],       // por debajo → borde mínimo
    ])('memo «%s» persiste %s', (bruto, esperado) => {
        const ajustes = { rpg_ceiling_tracker_memo: 1600, rpg_ceiling_world_block: 4096, rpg_ceiling_world_history: 5 };
        const { contexto, elementos, guardados, toasts } = escenario(ajustes);
        contexto.bindPromptCeilingControls(ajustes);
        const onChang = elementos.rpg_ceiling_tracker_memo.addEventListener.mock.calls[0][1];
        elementos.rpg_ceiling_tracker_memo.value = bruto;
        onChang();
        expect(ajustes.rpg_ceiling_tracker_memo).toBe(esperado);
        expect(guardados).toHaveBeenCalledTimes(1);
        expect(toasts.length).toBe(1);
        expect(String(toasts[0][0]) + String(toasts[0][1])).toContain('Techos de Prompts');
        // Repintado con el valor aplicado de vuelta al campo.
        expect(elementos.rpg_ceiling_tracker_memo.value).toBe(esperado);
    });

    it('world_history con decimales y basura cae al default 5; 12 al borde 10', () => {
        const ajustes = {};
        const { contexto, elementos } = escenario(ajustes);
        contexto.bindPromptCeilingControls(ajustes);
        const onChange = elementos.rpg_ceiling_world_history.addEventListener.mock.calls[0][1];
        elementos.rpg_ceiling_world_history.value = '4.5';
        onChange();
        expect(ajustes.rpg_ceiling_world_history).toBe(5);
        elementos.rpg_ceiling_world_history.value = '12';
        onChange();
        expect(ajustes.rpg_ceiling_world_history).toBe(10);
    });

    it('«Restaurar» deja 1600 / 4096 / 5, guarda y avisa en español', () => {
        const ajustes = { rpg_ceiling_tracker_memo: 0, rpg_ceiling_world_block: 8192, rpg_ceiling_world_history: 0 };
        const { contexto, elementos, guardados, toasts } = escenario(ajustes);
        contexto.bindPromptCeilingControls(ajustes);
        const onClick = elementos.rpg_ceiling_reset.addEventListener.mock.calls[0][1];
        onClick();
        expect(ajustes).toMatchObject({
            [PROMPT_CEILING_SETTINGS_KEYS.trackerMemo]: 1600,
            [PROMPT_CEILING_SETTINGS_KEYS.worldBlock]: 4096,
            [PROMPT_CEILING_SETTINGS_KEYS.worldHistory]: 5,
        });
        expect(guardados).toHaveBeenCalledTimes(1);
        expect(String(toasts[0][0])).toContain('1600 / 4096 / 5');
        expect(elementos.rpg_ceiling_tracker_memo.value).toBe(1600);
    });

    it('sin la caja en el DOM no hace nada (stub settings.html ligero)', () => {
        const contexto = createContext({
            document: { getElementById: () => null },
            saveSettings: () => { throw new Error('no debe guardar'); },
            toastr: { success: () => {}, info: () => {} },
            PROMPT_CEILING_DEFAULTS, PROMPT_CEILING_SETTINGS_KEYS, clampPromptCeiling,
        });
        runInContext(extraer('bindPromptCeilingControls'), contexto);
        expect(() => contexto.bindPromptCeilingControls({})).not.toThrow();
    });
});
