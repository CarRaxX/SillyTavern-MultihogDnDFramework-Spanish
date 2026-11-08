import { createContext, runInContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAst } from 'rollup/parseAst';
import { escapeHtml } from '../../memo-processor.js';
import {
    AG_CONTROL_KEYS,
    AG_CONTROL_SPECS,
    OUTPUT_CAP_BOUNDS,
    OUTPUT_CAP_JOBS,
    analizarAgControl,
    analizarOutputCap,
    estimarLlamadasDeBucles,
    tooltipAgControl,
    validateAgentControlSet,
} from '../../src/state/agent-controls.js';
import {
    PERF_PROFILES,
    PERF_PROFILE_CUSTOM_LABEL_ES,
    borrarPerfilPropio,
    describePerfProfileName,
    estimarCostePerfil,
    guardarPerfilPropio,
    perfProfileValues,
    perfilGobiernaPensamiento,
    previewPerfProfile,
    resolvePerfProfileId,
    validarNombrePerfilPropio,
} from '../../src/state/performance-profiles.js';
import { buildDefaultSettings } from '../../src/state/defaults.js';
import { LORE_RHYTHM_CUSTOM_ID, clampLoreRhythmCustom, resolveLoreRhythmId } from '../../src/state/lore-rhythm.js';
import { PROMPT_CEILING_SETTINGS_KEYS } from '../../src/state/prompt-ceilings.js';
import {
    aplicarEdicionFullReview,
    buildFullReviewEditorHtml,
    contadorFullReview,
    restaurarFabricaFullReview,
} from '../../src/ui/agent-settings-editor.js';

// T6/T7 (spec 2026-11-08): el cajón «🎛️ Mandos y perfiles de rendimiento» de
// index.js y su marcado en settings.html. Se ejecutan de verdad las funciones de
// index.js sobre un DOM simulado (patrón lore-rhythm-ui.test.js), con un solo
// guardado por acción y cero modelo/red.

const indexSource = readFileSync(new URL('../../index.js', import.meta.url), 'utf8');
const settingsHtml = readFileSync(new URL('../../settings.html', import.meta.url), 'utf8');

/** Cache de textos extraídos: este archivo analiza index.js muchas veces. */
const CACHE_EXTRAIDO = new Map();

function extraer(nombre) {
    if (CACHE_EXTRAIDO.has(nombre)) return CACHE_EXTRAIDO.get(nombre);
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
    CACHE_EXTRAIDO.set(nombre, encontrado);
    return encontrado;
}

/** Campos que el cajón necesita del DOM, con su estado. */
function domInic(ajustes) {
    const ids = [
        'rpg_ag_agent_retries', 'rpg_ag_json_retries', 'rpg_ag_audit_buffer',
        'rpg_output_cap_state_tracker', 'rpg_output_cap_world_progression', 'rpg_output_cap_map_evolution_compress',
        'rpg_perf_profile_select', 'rpg_perf_profile_state', 'rpg_perf_custom_name',
        'rpg_agent_fr_host', 'rpg_thinking_policy_profile_note',
    ];
    const elementos = Object.fromEntries(ids.map(id => [id, { id, value: '', title: '', innerHTML: '', textContent: '', style: {}, dataset: {} }]));
    const filasPensamiento = [{ dataset: { job: 'state_tracker' }, disabled: false, title: '' }];
    const contenedorPensamiento = {
        querySelectorAll: () => filasPensamiento,
    };
    const elementosConocidos = {
        ...elementos,
        rpg_thinking_policy_rows: contenedorPensamiento,
    };
    const trazas = { guardado: 0, pintados: [], eventos: [], avisos: [], reset: [] };
    const document = {
        getElementById: id => elementosConocidos[id] || null,
        querySelectorAll: () => [],
        dispatchEvent: e => trazas.eventos.push(e.type),
        addEventListener: () => {},
    };
    // Semillas: el render sobreescribe estos valores desde los ajustes.
    Object.values(elementos).forEach(campo => { campo.value = ''; });
    void ajustes;
    return { elementos: elementosConocidos, campos: elementos, trazas, document, filasPensamiento };
}

/** Dependencias comunes de las funciones del cajón. */
function baseDependencias(esc, extra = {}) {
    const toastr = Object.assign(vi.fn(), {
        warning: vi.fn(), info: vi.fn(), success: vi.fn(), error: vi.fn(),
    });
    return {
        document: esc.document,
        toastr,
        saveSettings: () => { esc.trazas.guardado += 1; },
        escapeHtml,
        AG_CONTROL_KEYS,
        AG_CONTROL_SPECS,
        OUTPUT_CAP_BOUNDS,
        OUTPUT_CAP_JOBS,
        AGENT_PERF_CONTROL_FIELDS: [
            ['rpg_ag_agent_retries', AG_CONTROL_KEYS.agentRetries],
            ['rpg_ag_json_retries', AG_CONTROL_KEYS.jsonCorrections],
            ['rpg_ag_audit_buffer', AG_CONTROL_KEYS.auditChunkBuffer],
        ],
        AGENT_PERF_CAP_FIELDS: OUTPUT_CAP_JOBS.map(t => [`rpg_output_cap_${t.jobId}`, t.jobId]),
        analizarAgControl,
        analizarOutputCap,
        estimarLlamadasDeBucles,
        tooltipAgControl,
        validateAgentControlSet,
        CustomEvent: class { constructor(tipo) { this.type = tipo; } },
        ...extra,
    };
}

function ejecutar(nombre, dependencias, fn, antes = []) {
    const contexto = createContext(dependencias);
    for (const extra of antes) runInContext(extraer(extra), contexto);
    runInContext(extraer(nombre), contexto);
    return fn(contexto);
}

/** Funciones privadas de index.js que `renderAgentPerfBox` necesita en el mismo contexto. */
const AYUDANTES_RENDER = ['fraseCosteDeBucles', 'buildPerfProfileOptionsHtml', 'suspenderDialPensamientoPorPerfil'];

let esc;
beforeEach(() => { esc = domInic(); });

describe('T7: el cajón vive en settings.html con sus IDs y su español', () => {
    it('el cajón rpgApplyAgentPerfBox está dentro de «Rendimiento (modelo local)»', () => {
        const inicioCajon = settingsHtml.indexOf('id="rpg_local_thinking_policy_box"');
        const inicioPerf = settingsHtml.indexOf('id="rpgApplyAgentPerfBox"');
        expect(inicioCajon).toBeGreaterThan(-1);
        expect(inicioPerf).toBeGreaterThan(inicioCajon);
        expect(settingsHtml.slice(inicioPerf)).toContain('Mandos y perfiles de rendimiento');
    });

    it.each([
        'rpg_perf_profile_select', 'rpg_perf_apply_Rapido', 'rpg_perf_apply_Equilibrado', 'rpg_perf_apply_Calidad',
        'rpg_perf_profile_state', 'rpg_perf_custom_name', 'rpg_perf_custom_save', 'rpg_perf_custom_delete',
        'rpg_ag_agent_retries', 'rpg_ag_json_retries', 'rpg_ag_audit_buffer',
        'rpg_output_cap_state_tracker', 'rpg_output_cap_world_progression', 'rpg_output_cap_map_evolution_compress',
        'rpg_agent_fr_host', 'rpg_thinking_policy_profile_note',
    ])('existe #%s', (id) => {
        expect(settingsHtml).toContain(`id="${id}"`);
    });

    it('los mandos no traen valor ni cota escrita a mano en el HTML (una sola fuente: el módulo)', () => {
        const tramo = settingsHtml.slice(settingsHtml.indexOf('id="rpgApplyAgentPerfBox"'));
        for (const id of ['rpg_ag_agent_retries', 'rpg_ag_json_retries', 'rpg_ag_audit_buffer', 'rpg_output_cap_state_tracker']) {
            const linea = tramo.slice(tramo.indexOf(`id="${id}"`), tramo.indexOf('>', tramo.indexOf(`id="${id}"`)));
            expect(linea, id).not.toMatch(/value=/);
            expect(linea, id).not.toMatch(/min=/);
            expect(linea, id).not.toMatch(/max=/);
        }
    });

    it('las etiquetas y avisos están en español estricto y explican el 0 = auto', () => {
        const tramo = settingsHtml.slice(settingsHtml.indexOf('id="rpgApplyAgentPerfBox"'));
        expect(tramo).toContain('0 = auto');
        expect(tramo).toContain('Aplicar un perfil es siempre una acción explícita');
        expect(tramo).toMatch(/Personalizado/);
        expect(tramo).toMatch(/nunca la sube/);
        expect(tramo).toMatch(/Abrir estos ajustes no escribe nada/);
    });

    it('el aviso del dial gobernado (D-10) vive junto a las filas de pensamiento', () => {
        const filas = settingsHtml.indexOf('id="rpg_thinking_policy_rows"');
        const aviso = settingsHtml.indexOf('id="rpg_thinking_policy_profile_note"');
        expect(aviso).toBeGreaterThan(filas);
        expect(aviso - filas).toBeLessThan(220);
    });

    it('los textarea de siempre siguen intactos: el editor propio no los reemplaza', () => {
        expect(settingsHtml).toContain('id="rpg_tracker_core_prompt"');
        expect(settingsHtml).toContain('id="rpg_tracker_user_prompt_suffix"');
    });
});

describe('T6: renderAgentPerfBox pinta desde los módulos (leer no escribe)', () => {
    function pintar(ajustes) {
        const deps = baseDependencias(esc, {
            buildFullReviewEditorHtml,
            contadorFullReview,
            resolvePerfProfileId,
            describePerfProfileName,
            perfilGobiernaPensamiento,
            PERF_PROFILES,
            PERF_PROFILE_CUSTOM_LABEL_ES,
            estimarCostePerfil,
        });
        return ejecutar('renderAgentPerfBox', deps, ctx => {
            const antes = JSON.stringify(ajustes);
            ctx.renderAgentPerfBox(ajustes);
            return { deps, mutado: JSON.stringify(ajustes) !== antes };
        }, AYUDANTES_RENDER);
    }

    it('los seis mandos salen con su valor, su cota y su tooltip del módulo', () => {
        const ajustes = { ...buildDefaultSettings(), rpgOutputCapStateTracker: 3000 };
        const { deps } = pintar(ajustes);
        expect(esc.campos.rpg_ag_agent_retries.value).toBe(2);
        expect(esc.campos.rpg_ag_audit_buffer.min).toBe('500');
        expect(esc.campos.rpg_ag_audit_buffer.max).toBe('8000');
        expect(esc.campos.rpg_ag_audit_buffer.step).toBe('500');
        expect(esc.campos.rpg_ag_agent_retries.title).toContain(AG_CONTROL_SPECS[AG_CONTROL_KEYS.agentRetries].tooltip);
        expect(esc.campos.rpg_ag_agent_retries.title).toContain('DOS bucles');
        expect(esc.campos.rpg_output_cap_state_tracker.value).toBe(3000);
        expect(esc.campos.rpg_output_cap_state_tracker.title).toContain('0 = auto');
        expect(esc.campos.rpg_output_cap_map_evolution_compress.title).toContain('NUNCA sube ese tope');
        expect(esc.trazas.guardado).toBe(0);
    });

    it('el selector deriva el perfil y añade «Personalizado» deshabilitado cuando no coincide', () => {
        const { deps } = pintar({ ...buildDefaultSettings(), agenteRetriesExtra: 1 });
        const html = esc.campos.rpg_perf_profile_select.innerHTML;
        for (const perfil of PERF_PROFILES) expect(html).toContain(`value="${perfil.id}"`);
        expect(html).toContain(`value="${PERF_PROFILE_CUSTOM_LABEL_ES}"`);
        expect(html).toContain('selected');
        expect(esc.campos.rpg_perf_profile_state.textContent).toContain(PERF_PROFILE_CUSTOM_LABEL_ES);
        void deps;
    });

    it('con los valores de una fila, el selector la marca y el estado la nombra', () => {
        const valores = perfProfileValues('Calidad', []);
        pintar({ ...buildDefaultSettings(), ...valores });
        expect(esc.campos.rpg_perf_profile_state.textContent).toContain('Máxima calidad');
        expect(esc.campos.rpg_perf_profile_select.innerHTML).toMatch(/value="Calidad"[^>]*selected/);
    });

    it('los perfiles propios aparecen en el selector', () => {
        const ajustes = { ...buildDefaultSettings(), rpgPerfProfileCustom: [{ nombre: 'Mi fila', valores: {} }] };
        pintar(ajustes);
        expect(esc.campos.rpg_perf_profile_select.innerHTML).toContain('value="Mi fila"');
    });

    it('el editor de Revisión Completa se monta en su hueco', () => {
        pintar({ ...buildDefaultSettings() });
        expect(esc.campos.rpg_agent_fr_host.innerHTML).toContain('data-rpg-agent-field="system"');
        expect(esc.campos.rpg_agent_fr_host.innerHTML).toContain('data-rpg-agent-estado="fabrica"');
    });

    it('render no escribe ajustes ni guarda (AC0)', () => {
        const ajustes = { ...buildDefaultSettings() };
        const { mutado } = pintar(ajustes);
        expect(mutado).toBe(false);
        expect(esc.trazas.guardado).toBe(0);
    });
});

describe('T6/D-10: el dial de pensamiento lo gobierna el perfil', () => {
    function suspender(ajustes) {
        const deps = baseDependencias(esc, { resolvePerfProfileId, perfilGobiernaPensamiento });
        return ejecutar('suspenderDialPensamientoPorPerfil', deps, ctx => ctx.suspenderDialPensamientoPorPerfil(ajustes));
    }

    it('con Rapido: selects desactivados y aviso en español', () => {
        const ajustes = { ...buildDefaultSettings(), ...perfProfileValues('Rapido', []) };
        expect(suspender(ajustes)).toBe(true);
        expect(esc.filasPensamiento[0].disabled).toBe(true);
        expect(esc.campos.rpg_thinking_policy_profile_note.textContent).toContain('Rapido');
        expect(esc.campos.rpg_thinking_policy_profile_note.style.display).toBe('block');
    });

    it('con Equilibrado o con valores propios: dial libre', () => {
        expect(suspender({ ...buildDefaultSettings() })).toBe(false);
        expect(esc.filasPensamiento[0].disabled).toBe(false);
        expect(esc.campos.rpg_thinking_policy_profile_note.style.display).toBe('none');
        const propio = { ...buildDefaultSettings(), ...perfProfileValues('Calidad', []), rpgAuditChunkBuffer: 2750 };
        expect(suspender(propio)).toBe(false); // «Personalizado» ⇒ el usuario manda
    });

    it('se deriva de los ajustes, no del selector (tocar un modo reactiva el dial)', () => {
        esc.campos.rpg_perf_profile_select.value = 'Rapido';
        expect(suspender({ ...buildDefaultSettings() })).toBe(false);
    });
});

describe('T6: escribir un mando (AC1: inválido nunca guardado)', () => {
    function guardarMando(ajustes, clave, crudo) {
        const deps = baseDependencias(esc);
        const r = ejecutar('guardarMandoAg', deps, ctx => ctx.guardarMandoAg(ajustes, clave, crudo));
        return { r, avisos: deps.toastr };
    }

    it('texto basura: aviso, cero escrituras y cero guardados', () => {
        const ajustes = { ...buildDefaultSettings(), [AG_CONTROL_KEYS.agentRetries]: 2 };
        const { r, avisos } = guardarMando(ajustes, AG_CONTROL_KEYS.agentRetries, 'muchos');
        expect(r.estado).toBe('invalido');
        expect(ajustes[AG_CONTROL_KEYS.agentRetries]).toBe(2);
        expect(esc.trazas.guardado).toBe(0);
        expect(avisos.warning).toHaveBeenCalledTimes(1);
        expect(avisos.warning.mock.calls[0][0]).toContain('Reintentos extra del Agente');
    });

    it('fuera de cota: se guarda el borde con aviso y un solo guardado', () => {
        const ajustes = { ...buildDefaultSettings() };
        const { avisos } = guardarMando(ajustes, AG_CONTROL_KEYS.auditChunkBuffer, 12000);
        expect(ajustes[AG_CONTROL_KEYS.auditChunkBuffer]).toBe(8000);
        expect(esc.trazas.guardado).toBe(1);
        expect(avisos.info).toHaveBeenCalledTimes(1);
    });

    it('el 0 se guarda como 0 (auto/ninguno), no como el defecto', () => {
        const ajustes = { ...buildDefaultSettings() };
        guardarMando(ajustes, AG_CONTROL_KEYS.jsonCorrections, '0');
        expect(ajustes[AG_CONTROL_KEYS.jsonCorrections]).toBe(0);
        expect(esc.trazas.guardado).toBe(1);
    });

    it('D-6 al escribir: con 8 vueltas, 4/4 se recorta a 4/3 y se avisa', () => {
        const ajustes = { ...buildDefaultSettings(), routerMaxTurns: 8, [AG_CONTROL_KEYS.agentRetries]: 4, [AG_CONTROL_KEYS.jsonCorrections]: 4 };
        guardarMando(ajustes, AG_CONTROL_KEYS.agentRetries, 4);
        expect(ajustes[AG_CONTROL_KEYS.jsonCorrections]).toBeLessThan(4);
        expect(ajustes.routerMaxTurns).toBe(8);
        expect(ajustes[AG_CONTROL_KEYS.agentRetries] + ajustes[AG_CONTROL_KEYS.jsonCorrections] + ajustes.routerMaxTurns).toBeLessThanOrEqual(12);
        expect(esc.trazas.guardado).toBe(1);
    });
});

describe('T6: topes de salida por trabajo (D-3)', () => {
    function guardar(ajustes, jobId, crudo) {
        const deps = baseDependencias(esc);
        return ejecutar('guardarTechoSalidaAg', deps, ctx => ctx.guardarTechoSalidaAg(ajustes, jobId, crudo));
    }

    it('0 = auto se escribe tal cual y guarda una vez', () => {
        const ajustes = { ...buildDefaultSettings(), rpgOutputCapStateTracker: 3000 };
        guardar(ajustes, 'state_tracker', '0');
        expect(ajustes.rpgOutputCapStateTracker).toBe(0);
        expect(esc.trazas.guardado).toBe(1);
    });

    it('basura: no se escribe nada (la cascada sigue intacta)', () => {
        const ajustes = { ...buildDefaultSettings(), rpgOutputCapWorldProgression: 4000 };
        const r = guardar(ajustes, 'world_progression', 'auto');
        expect(r.estado).toBe('invalido');

        expect(ajustes.rpgOutputCapWorldProgression).toBe(4000);
        expect(esc.trazas.guardado).toBe(0);
    });

    it('fuera de rango: se guarda el borde', () => {
        const ajustes = { ...buildDefaultSettings() };
        guardar(ajustes, 'map_evolution_compress', '90000');
        expect(ajustes.rpgOutputCapMapEvolutionCompress).toBe(OUTPUT_CAP_BOUNDS[1]);
    });
});

describe('T6/T11: aplicar un perfil delega y guarda UNA vez (D-8)', () => {
    function aplicar(ajustes, id, extras = {}) {
        const llamada = { rithmo: [] };
        const deps = baseDependencias(esc, {
            perfProfileValues,
            resolveLoreRhythmId,
            LORE_RHYTHM_CUSTOM_ID,
            clampLoreRhythmCustom,
            PROMPT_CEILING_SETTINGS_KEYS,
            applyLoreRhythmPreset: (settings, filaId, opciones) => {
                llamada.rithmo.push([filaId, opciones]);
                settings.routerRunEvery = { cada_turno: 1, cada_2: 2, cada_3: 3 }[filaId];
                settings.routerMaxTurns = { cada_turno: 3, cada_2: 4, cada_3: 5 }[filaId];
                return { runEvery: settings.routerRunEvery, maxTurns: settings.routerMaxTurns };
            },
            globalThis: { _rpgResetRouterAutoTick: motivo => esc.trazas.reset.push(motivo) },
            ...extras,
        });
        const resultado = ejecutar('aplicarPerfilRendimiento', deps, ctx => ctx.aplicarPerfilRendimiento(ajustes, id, ajustes.rpgPerfProfileCustom || []));
        return { resultado, llamada };
    }

    it('Rapido desde fábrica: un solo saveSettings y el ritmo pasa por su aplicador', () => {
        const ajustes = { ...buildDefaultSettings() };
        const { resultado, llamada } = aplicar(ajustes, 'Rapido');
        expect(esc.trazas.guardado).toBe(1);
        expect(llamada.rithmo).toEqual([['cada_3', { guardar: false }]]);
        expect(resultado.validacion.valido).toBe(true);
    });

    it('escribe las doce claves de la matriz y el nombre del perfil aplicado', () => {
        const ajustes = { ...buildDefaultSettings() };
        aplicar(ajustes, 'Calidad');
        const valores = perfProfileValues('Calidad', []);
        expect(ajustes.routerRunEvery).toBe(valores.routerRunEvery);
        expect(ajustes.routerMaxTurns).toBe(valores.routerMaxTurns);
        expect(ajustes.rpg_ceiling_tracker_memo).toBe(4000);
        expect(ajustes.rpg_ceiling_world_block).toBe(8192);
        expect(ajustes.rpg_ceiling_world_history).toBe(10);
        expect(ajustes.agenteRetriesExtra).toBe(3);
        expect(ajustes.rpgAuditChunkBuffer).toBe(1500);
        expect(ajustes.localThinkingPolicy).toEqual({});
        expect(ajustes.rpgPerfProfile).toBe('Calidad');
    });

    it('Rapido apaga el pensamiento solo en los dos elegibles y topa las salidas', () => {
        const ajustes = { ...buildDefaultSettings() };
        aplicar(ajustes, 'Rapido');
        expect(Object.keys(ajustes.localThinkingPolicy).sort()).toEqual(['map_evolution_compress', 'state_tracker']);
        expect(ajustes.rpgOutputCapStateTracker).toBe(3000);
        expect(ajustes.rpgOutputCapWorldProgression).toBe(4000);
        expect(ajustes.rpgOutputCapMapEvolutionCompress).toBe(2000);
        expect(ajustes.routerRunEvery).toBe(3);
    });

    it('perfil inexistente: devuelve null y no escribe ni guarda', () => {
        const ajustes = { ...buildDefaultSettings() };
        const { resultado } = aplicar(ajustes, 'Fantasma');
        expect(resultado).toBeNull();
        expect(esc.trazas.guardado).toBe(0);
        expect(ajustes.rpgPerfProfile).toBe('Equilibrado');
    });

    it('perfil propio con pareja fuera de tabla: clamp de la ola 3, evento y reset del tick', () => {
        const valores = { ...perfProfileValues('Rapido', []), routerRunEvery: 5, routerMaxTurns: 7 };
        const ajustes = { ...buildDefaultSettings(), rpgPerfProfileCustom: [{ nombre: 'Mío', valores }] };
        aplicar(ajustes, 'Mío');
        expect(ajustes.routerRunEvery).toBe(5);
        expect(ajustes.routerMaxTurns).toBe(7);
        expect(esc.trazas.eventos).toEqual(['rt_lore_rhythm_changed']);
        expect(esc.trazas.reset).toEqual(['perf_profile']);
        expect(esc.trazas.guardado).toBe(1);
    });
});

describe('T11/T12: confirmar antes de aplicar y rechazar con trabajo activo', () => {
    let aplicado = null;

    function confirmar(ajustes, id, { Popup, busy = false }) {
        aplicado = null;
        const deps = baseDependencias(esc, {
            isRouterRunning: () => busy,
            runtimeState: { stateModelRunning: false, isLoreOrMapAgentBusyRef: () => false },
            SillyTavern: { getContext: () => ({ Popup }) },
            previewPerfProfile,
            perfProfileValues,
            aplicarPerfilRendimiento: (settings, idAplicado) => {
                aplicado = idAplicado;
                return { validacion: { avisos: [] }, valores: {} };
            },
            construirResumenPerfilHtml: vista => `<table>${vista.queCambian.length}</table>`,
            renderAgentPerfBox: () => esc.trazas.pintados.push('perf'),
            renderLoreRhythmBox: () => esc.trazas.pintados.push('ritmo'),
            renderPromptCeilingsBox: () => esc.trazas.pintados.push('techos'),
            renderThinkingPolicyBox: () => esc.trazas.pintados.push('pensamiento'),
            suspenderDialPensamientoPorPerfil: () => esc.trazas.pintados.push('suspension'),
        });
        return ejecutar('confirmarYAplicarPerfil', deps, ctx => ctx.confirmarYAplicarPerfil(ajustes, id));
    }

    it('con el Agente trabajando se rechaza con aviso y no se abre el diálogo', async () => {
        const Popup = { show: { confirm: vi.fn(async () => 1) } };
        const res = await confirmar({ ...buildDefaultSettings() }, 'Rapido', { Popup, busy: true });
        expect(res).toBe(false);
        expect(Popup.show.confirm).not.toHaveBeenCalled();
        expect(aplicado).toBeNull();
    });

    it('el Popup muestra el resumen actual→nuevo y, al confirmar, se aplica y repinta', async () => {
        const Popup = { show: { confirm: vi.fn(async () => 1) } };
        const res = await confirmar({ ...buildDefaultSettings() }, 'Rapido', { Popup });
        expect(res).toBe(true);
        expect(Popup.show.confirm).toHaveBeenCalledTimes(1);
        const [titulo, cuerpo] = Popup.show.confirm.mock.calls[0];
        expect(titulo).toContain('Rápido');
        expect(cuerpo).toContain('6'); // seis mandos cambian desde la fábrica
        expect(aplicado).toBe('Rapido');
        expect(esc.trazas.pintados).toEqual(expect.arrayContaining(['perf', 'ritmo', 'techos', 'pensamiento', 'suspension']));
    });

    it('cancelado: no se aplica ni se guarda', async () => {
        const Popup = { show: { confirm: vi.fn(async () => 2) } };
        const ajustes = { ...buildDefaultSettings() };
        const res = await confirmar(ajustes, 'Rapido', { Popup });
        expect(res).toBe(false);
        expect(aplicado).toBeNull();
        expect(ajustes.agenteRetriesExtra).toBe(2);
    });

    it('un perfil que ya está puesto no escribe nada', async () => {
        const Popup = { show: { confirm: vi.fn(async () => 1) } };
        const res = await confirmar({ ...buildDefaultSettings() }, 'Equilibrado', { Popup });
        expect(res).toBe(false);
        expect(Popup.show.confirm).not.toHaveBeenCalled();
    });

    it('un nombre que no es ningún perfil avisa y no abre el diálogo', async () => {
        const Popup = { show: { confirm: vi.fn(async () => 1) } };
        const res = await confirmar({ ...buildDefaultSettings() }, 'Nadie', { Popup });
        expect(res).toBe(false);
        expect(Popup.show.confirm).not.toHaveBeenCalled();
    });
});

describe('T6: enlaces del cajón', () => {
    it('se enlaza después de los techos y repinta al abrir el cajón', () => {
        expect(indexSource).toContain('bindPromptCeilingControls(settings);\n        bindAgentPerfControls(settings);');
        const enlace = extraer('bindAgentPerfControls');
        expect(enlace).toContain("caja.addEventListener('toggle', pintar)");
        expect(enlace).toContain("document.getElementById('rpgApplyAgentPerfBox')");
        expect(enlace).toContain("dataset.rtBound !== '1'");
    });

    it.each(['fetch(', 'runRouterPass(', 'sendStateRequest(', 'sendAgentTurn(', 'localStorage', 'aiManager'])(
        'ninguna función del cajón llama a %s (cero red, cero modelo)', (prohibido) => {
            for (const nombre of ['renderAgentPerfBox', 'guardarMandoAg', 'guardarTechoSalidaAg', 'aplicarPerfilRendimiento', 'confirmarYAplicarPerfil', 'bindAgentPerfControls', 'buildPerfProfileOptionsHtml', 'suspenderDialPensamientoPorPerfil']) {
                expect(extraer(nombre), `${nombre} contiene ${prohibido}`).not.toContain(prohibido);
            }
        },
    );

    it('el enlace del editor usa el módulo puro y un solo guardado por cambio', () => {
        const enlace = extraer('bindAgentPerfControls');
        expect(enlace).toContain('aplicarEdicionFullReview({ settings, guardar: () => saveSettings() }');
        expect(enlace).toContain('restaurarFabricaFullReview({ settings, guardar: () => saveSettings() }');
        expect(enlace).toContain('data-rpg-agent-counter');
    });
});

describe('T7: el dial de ola 3 sigue siendo el dueño de las vueltas (sin mando duplicado)', () => {
    it('el cajón nuevo no crea ningún input de routerMaxTurns ni de runEvery', () => {
        const tramo = settingsHtml.slice(settingsHtml.indexOf('id="rpgApplyAgentPerfBox"'));
        expect(tramo).not.toContain('rpg_tracker_router_max_turns"');
        expect(tramo).not.toContain('rpg_tracker_router_run_every"');
        expect(tramo).toContain('Turnos Máximos del Agente');
    });

    it('applyLoreRhythmPreset acepta { guardar: false } sin cambiar su comportamiento por defecto', () => {
        const fn = extraer('applyLoreRhythmPreset');
        expect(fn).toContain('opciones = {}');
        expect(fn).toContain('const { guardar = true } = opciones;');
        expect(fn).toContain('if (guardar) saveSettings();');
    });
});
