import { createContext, runInContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAst } from 'rollup/parseAst';
import { escapeHtml } from '../memo-processor.js';
import {
    FACTORY_RHYTHM_ID,
    LORE_RHYTHM_CUSTOM_ID,
    LORE_RHYTHM_PRESETS,
    getLoreRhythmPreset,
    resolveLoreRhythmId,
    rhythmPresetEstimate,
} from '../src/state/lore-rhythm.js';

// T5: el cajón «Ritmo del Agente de Lorebook» se construye desde la tabla canónica,
// así que el test ejecuta de verdad las funciones de index.js sobre las filas
// (patrón thinking-policy-ui.test.js) y verifica los tooltips honestos de D-5.
const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const settingsHtml = readFileSync(new URL('../settings.html', import.meta.url), 'utf8');
const panelSource = readFileSync(new URL('../src/ui/panel/panel-agent-activity.js', import.meta.url), 'utf8');

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
                if (declaracion.id?.name === nombre) {
                    encontrado = indexSource.slice(nodo.start, nodo.end);
                    return;
                }
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

/** Ejecuta `buildLoreRhythmOptionsHtml` con las dependencias de index.js inyectadas. */
function opciones(ajustes) {
    const contexto = createContext({
        escapeHtml, LORE_RHYTHM_PRESETS, LORE_RHYTHM_CUSTOM_ID, FACTORY_RHYTHM_ID, resolveLoreRhythmId, rhythmPresetEstimate,
    });
    runInContext(extraer('buildLoreRhythmOptionsHtml'), contexto);
    return contexto.buildLoreRhythmOptionsHtml(ajustes);
}

/** DOM falso mínimo para ejecutar `renderLoreRhythmBox` en vm. */
function escenario(ajustes) {
    const elementos = {
        rpg_lore_rhythm_select: { innerHTML: '', value: '' },
        rpg_lore_rhythm_custom_row: { style: { display: 'none' } },
        rpg_tracker_router_run_every: { value: '' },
        rpg_tracker_router_max_turns: { value: '' },
    };
    const eventos = [];
    const contexto = createContext({
        document: { getElementById: id => elementos[id] || null, dispatchEvent: e => eventos.push(e) },
        escapeHtml, LORE_RHYTHM_PRESETS, LORE_RHYTHM_CUSTOM_ID, FACTORY_RHYTHM_ID, resolveLoreRhythmId, rhythmPresetEstimate,
        eventos,
        elementos,
    });
    // El render llama al builder de opciones: se carga en el mismo contexto, como en index.js.
    runInContext(extraer('buildLoreRhythmOptionsHtml'), contexto);
    runInContext(extraer('renderLoreRhythmBox'), contexto);
    contexto.renderLoreRhythmBox(ajustes);
    return { elementos, eventos };
}

describe('Cajón del ritmo en settings.html (ola 2, cajón de rendimiento)', () => {
    it('vive dentro de «Rendimiento (modelo local)», con dial, sueltos ocultos y botón', () => {
        const caja = settingsHtml.slice(settingsHtml.indexOf('id="rpg_local_thinking_policy_box"'));
        const bloque = caja.slice(0, 8000);
        expect(bloque).toContain('id="rpg_lore_rhythm_select"');
        expect(bloque).toContain('id="rpg_lore_rhythm_custom_row"');
        expect(bloque).toContain('id="rpg_lore_rhythm_reset"');
        expect(bloque).toContain('Ritmo del Agente de Lorebook');
        // D-5: «Restaurar» anuncia (3,5) en el propio botón.
        expect(bloque).toContain('Restaurar valores de fábrica (3, 5)');
        // AC1: los sueltos nacen ocultos (display:none) y solo el render los revela.
        const fila = bloque.slice(bloque.indexOf('id="rpg_lore_rhythm_custom_row"'));
        expect(fila.slice(0, 120)).toContain('display:none');
        expect(bloque.indexOf('id="rpg_lore_rhythm_custom_row"')).toBeLessThan(settingsHtml.length);
    });

    it('los dos sueltos viajaron: un solo ID cada uno y ya fuera del cajón Agente', () => {
        expect(settingsHtml.match(/id="rpg_tracker_router_run_every"/g)).toHaveLength(1);
        expect(settingsHtml.match(/id="rpg_tracker_router_max_turns"/g)).toHaveLength(1);
        // Viajaron DENTRO del cajón de rendimiento: aparecen después de su apertura.
        expect(settingsHtml.indexOf('id="rpg_tracker_router_run_every"'))
            .toBeGreaterThan(settingsHtml.indexOf('id="rpg_local_thinking_policy_box"'));
        // Y el cajón Agente conserva lo demás: «Claves Activas Máximas» va justo después.
        expect(settingsHtml.indexOf('rpg_tracker_router_max_activations"'))
            .toBeGreaterThan(settingsHtml.indexOf('id="rpg_tracker_router_max_turns"'));
    });
});

describe('Opciones del dial construidas desde la tabla canónica (D-1/D-5)', () => {
    it('cuatro opciones en español: tres filas + «Personalizado (avanzado)»', () => {
        const html = opciones({ routerRunEvery: 3, routerMaxTurns: 5 });
        expect(html.match(/<option/g)).toHaveLength(4);
        for (const etiqueta of ['Cada turno (máximo detalle)', 'Cada 2 turnos (equilibrado)', 'Cada 3 turnos (ahorrativo)', 'Personalizado (avanzado)']) {
            expect(html).toContain(etiqueta);
        }
    });

    it('cada tooltip de fila cita «10 turnos» y SU cifra real de la fórmula D-1', () => {
        const html = opciones({});
        for (const fila of LORE_RHYTHM_PRESETS) {
            const est = rhythmPresetEstimate(fila);
            const opcion = html.slice(html.indexOf(`value="${fila.id}"`));
            const titulo = opcion.slice(opcion.indexOf('title="'), opcion.indexOf('>', opcion.indexOf('title="')));
            expect(titulo, `${fila.id}: cita los 10 turnos`).toContain('10 turnos');
            expect(titulo, `${fila.id}: típicas ~${est.tipicas}`).toContain(`~${est.tipicas} llamadas`);
            expect(titulo, `${fila.id}: peor ≤${est.peor}`).toContain(`≤${est.peor}`);
            expect(titulo, `${fila.id}: ${est.pasadas} pasadas`).toContain(`${est.pasadas} pasadas`);
            // D-5: los avisos honestos, en español.
            expect(titulo, `${fila.id}: avisa del retraso del lore`).toContain('retrasa el lore');
            expect(titulo, `${fila.id}: backlog solo desde la última ejecución`).toContain('Desde la última ejecución');
            expect(titulo, `${fila.id}: R2 sin backlog en turnos fijos`).toContain('Número de turnos fijo');
            expect(titulo, `${fila.id}: un commit por pasada`).toContain('Un único commit por pasada');
            // R3: en modo básico las vueltas son inertes: el tooltip no las promete.
            expect(titulo, `${fila.id}: matiz del modo básico`).toContain('modo básico');
        }
    });

    it('la fila de fábrica se anuncia como tal y la opción derivada lleva selected', () => {
        const html = opciones({});
        const fila = html.slice(html.indexOf(`value="${FACTORY_RHYTHM_ID}"`));
        expect(fila.slice(0, 400)).toContain('Valores de fábrica');
        expect(opciones({ routerRunEvery: 2, routerMaxTurns: 4 })).toContain(`value="cada_2" selected`);
        expect(opciones({ routerRunEvery: 1, routerMaxTurns: 5 })).toContain(`value="${LORE_RHYTHM_CUSTOM_ID}" selected`);
    });

    it('«Personalizado» advierte de que elegirlo no escribe nada (D-3)', () => {
        const html = opciones({});
        const opcion = html.slice(html.indexOf(`value="${LORE_RHYTHM_CUSTOM_ID}"`));
        expect(opcion).toContain('no escribe nada');
    });
});

describe('Render puro y revelado de los sueltos (AC0/AC1)', () => {
    it('con (1,5) guardados: dial en personalizado, sueltos visibles y con sus valores', () => {
        const { elementos } = escenario({ routerRunEvery: 1, routerMaxTurns: 5 });
        expect(elementos.rpg_lore_rhythm_select.value).toBe(LORE_RHYTHM_CUSTOM_ID);
        expect(elementos.rpg_lore_rhythm_custom_row.style.display).toBe('flex');
        expect(elementos.rpg_tracker_router_run_every.value).toBe(1);
        expect(elementos.rpg_tracker_router_max_turns.value).toBe(5);
    });

    it('con (3,5): dial en «Cada 3 turnos» y sueltos ocultos (display:none)', () => {
        const { elementos, eventos } = escenario({ routerRunEvery: 3, routerMaxTurns: 5 });
        expect(elementos.rpg_lore_rhythm_select.value).toBe('cada_3');
        expect(elementos.rpg_lore_rhythm_custom_row.style.display).toBe('none');
        expect(eventos).toHaveLength(0);
    });

    it('valores fuera de tabla (50) se muestran tal cual, sin clamps ni eventos en el render', () => {
        const { elementos, eventos } = escenario({ routerRunEvery: 50, routerMaxTurns: 10 });
        expect(elementos.rpg_lore_rhythm_custom_row.style.display).toBe('flex');
        expect(elementos.rpg_tracker_router_run_every.value).toBe(50);
        expect(elementos.rpg_tracker_router_max_turns.value).toBe(10);
        expect(eventos).toHaveLength(0);
    });
});

describe('Aplicar el dial (D-6) y enlaces en index.js/panel', () => {
    /** Ejecuta `applyLoreRhythmPreset` con el entorno de index.js simulado. */
    function aplicar(id) {
        const trazas = { guardado: 0, reset: [], eventos: [], panel: [] };
        class CustomEvent { constructor(nombre) { this.type = nombre; } }
        const contexto = createContext({
            getLoreRhythmPreset,
            saveSettings: () => { trazas.guardado += 1; },
            document: { dispatchEvent: e => trazas.eventos.push(e.type) },
            CustomEvent,
            window: { jQuery: selector => ({ val: valor => trazas.panel.push([selector, valor]) }) },
            _rpgResetRouterAutoTick: motivo => trazas.reset.push(motivo),
        });
        runInContext(extraer('applyLoreRhythmPreset'), contexto);
        const ajustes = { routerRunEvery: 1, routerMaxTurns: 5 };
        const aplicada = contexto.applyLoreRhythmPreset(ajustes, id);
        return { ajustes, aplicada, trazas };
    }

    it('cada_2 persiste EXACTAMENTE (2,4), resetea el tick y emite el evento propio', () => {
        const { ajustes, aplicada, trazas } = aplicar('cada_2');
        expect([aplicada.runEvery, aplicada.maxTurns]).toEqual([2, 4]);
        expect([ajustes.routerRunEvery, ajustes.routerMaxTurns]).toEqual([2, 4]);
        expect(trazas.guardado).toBe(1);
        expect(trazas.reset).toEqual(['lore_rhythm_dial']);
        expect(trazas.eventos).toEqual(['rt_lore_rhythm_changed']);
        expect(trazas.panel).toEqual([['#rt-agent-router-run-every', 2], ['#rt-agent-router-max-turns', 4]]);
    });

    it('la fábrica (cada_3) deja (3,5): AC4', () => {
        const { ajustes, trazas } = aplicar(FACTORY_RHYTHM_ID);
        expect([ajustes.routerRunEvery, ajustes.routerMaxTurns]).toEqual([3, 5]);
        expect(trazas.eventos).toEqual(['rt_lore_rhythm_changed']);
    });

    it('«personalizado» o id basura no escriben, no resetean y no emiten nada', () => {
        for (const id of [LORE_RHYTHM_CUSTOM_ID, 'inexistente', '']) {
            const { ajustes, aplicada, trazas } = aplicar(id);
            expect(aplicada).toBeNull();
            expect([ajustes.routerRunEvery, ajustes.routerMaxTurns]).toEqual([1, 5]);
            expect(trazas.guardado).toBe(0);
            expect(trazas.reset).toEqual([]);
            expect(trazas.eventos).toEqual([]);
        }
    });

    it('el handler de tabla no invoca al modelo: sin runRouterPass ni fetch (T5′)', () => {
        const aplicador = extraer('applyLoreRhythmPreset');
        expect(aplicador).not.toContain('runRouterPass');
        expect(aplicador).not.toContain('fetch');
        const enlace = extraer('bindLoreRhythmControls');
        expect(enlace).not.toContain('runRouterPass');
        expect(enlace).not.toContain('fetch');
    });

    it('el reset del tick pasa por globalThis con guarda typeof (unificación del oráculo)', () => {
        expect(extraer('applyLoreRhythmPreset')).toContain("typeof globalThis._rpgResetRouterAutoTick === 'function'");
        // El dial no reescribe el binding antiguo: el reset es la única vía.
        expect(extraer('applyLoreRhythmPreset')).toContain("_rpgResetRouterAutoTick('lore_rhythm_dial')");
    });

    it('se enlaza tras la política de pensamiento y repinta al abrir el cajón', () => {
        expect(indexSource).toContain('bindThinkingPolicyControls(settings);\n        bindLoreRhythmControls(settings);');
        const enlace = extraer('bindLoreRhythmControls');
        expect(enlace).toContain("caja.addEventListener('toggle', pintar)");
        // Sin doble binding: los IDs sueltos no se vuelven a enlazar en el dial.
        expect(enlace).not.toContain('rpg_tracker_router_run_every');
        expect(enlace).not.toContain('rpg_tracker_router_max_turns');
    });

    it('el panel escucha rt_lore_rhythm_changed solo para repintar el «Next in»', () => {
        const oyente = panelSource.slice(panelSource.indexOf("document.addEventListener('rt_lore_rhythm_changed'"));
        expect(oyente).toBeTruthy();
        const cuerpo = oyente.slice(0, oyente.indexOf('});'));
        expect(cuerpo).toContain('syncLastRunDisplay()');
        expect(cuerpo).not.toMatch(/getRouterTick|getMapUpdaterTick|runRouterPass|fetch|saveSettings/);
    });

    it('los sueltos: input filtra enteros en cota y change clampa citando el original', () => {
        const bloque = indexSource.slice(indexSource.indexOf("$('#rpg_tracker_router_run_every')"));
        const recorte = bloque.slice(0, 2600);
        expect(recorte).toContain("clampLoreRhythmCustom('runEvery'");
        expect(recorte).toContain('.on(\'change\'');
        expect(recorte).toContain('se ha recortado de');
        // input no clampa ni tostea: el único toastr del bloque es el del change.
        const input = recorte.slice(0, recorte.indexOf(".on('change'"));
        expect(input).not.toContain('toastr');
    });
});
