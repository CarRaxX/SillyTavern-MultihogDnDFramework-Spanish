import { createContext, runInContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { escapeHtml } from '../../memo-processor.js';
import { buildDefaultSettings } from '../../src/state/defaults.js';
import { CHAT_STATE_GLOBAL_UI_KEYS } from '../../src/state/settings.js';
import { AG_CONTROL_KEYS, OUTPUT_CAP_JOBS } from '../../src/state/agent-controls.js';
import { PERF_PROFILES, perfilGobiernaPensamiento, resolvePerfProfileId } from '../../src/state/performance-profiles.js';
import { PROMPT_CEILING_SETTINGS_KEYS } from '../../src/state/prompt-ceilings.js';
import { clampLoreRhythmCustom, resolveLoreRhythmId, LORE_RHYTHM_CUSTOM_ID } from '../../src/state/lore-rhythm.js';
import { perfProfileValues, previewPerfProfile } from '../../src/state/performance-profiles.js';
import { getSettings, saveChatState } from '../../state-manager.js';
import { testExtensionSettings } from '../setup.js';

// T12 (spec 2026-11-08, ola 5): ciclo de vida de los perfiles. Con generación
// activa se RECHAZA con aviso (los límites de esa pasada ya están leídos);
// aplicar escribe en memoria y persiste DESPUÉS, una sola vez; el dial de
// pensamiento se re-suspende cuando algo reescribe las claves; y las claves
// nuevas no viajan por chat (D-11: cero claves en CHAT_STATE_GLOBAL_UI_KEYS y
// la proyección campo a campo de saveChatState no las copia).

const indexSource = readFileSync(new URL('../../index.js', import.meta.url), 'utf8');

function extraer(nombre) {
    const inicio = indexSource.search(new RegExp(`(?:async )?function ${nombre}\\(`));
    if (inicio < 0) throw new Error(`Falta ${nombre} en index.js`);
    const despues = indexSource.slice(inicio + 1);
    const siguiente = despues.search(/\n(?:async )?function /);
    return siguiente < 0 ? indexSource.slice(inicio) : indexSource.slice(inicio, inicio + 1 + siguiente);
}

const NUEVAS_CLAVES = [
    AG_CONTROL_KEYS.agentRetries,
    AG_CONTROL_KEYS.jsonCorrections,
    AG_CONTROL_KEYS.auditChunkBuffer,
    ...OUTPUT_CAP_JOBS.map(t => t.settingsKey),
    'fullReviewSystemPromptOverride',
    'fullReviewUserPromptSuffixOverride',
    'rpgPerfProfile',
    'rpgPerfProfileCustom',
];

let esc;
beforeEach(() => {
    esc = { guardado: 0, orden: [], avisos: [], info: [], exitos: [] };
    for (const key of Object.keys(testExtensionSettings)) delete testExtensionSettings[key];
});

function toastrSim(orden) {
    const t = () => {};
    t.warning = (...a) => { orden.push('aviso'); esc.avisos.push(a.join(' ')); };
    t.info = (...a) => esc.info.push(a.join(' '));
    t.success = (...a) => esc.exitos.push(a.join(' '));
    t.error = vi.fn();
    return t;
}

/**
 * vm con `confirmarYAplicarPerfil` + `aplicarPerfilRendimiento` +
 * `suspenderDialPensamientoPorPerfil` y los módulos puros reales.
 */
function maquina({ ocupado = {}, popup = { show: { confirm: vi.fn(async () => 1) } }, dial = null } = {}) {
    const orden = [];
    const ctx = createContext({
        escapeHtml,
        toastr: toastrSim(orden),
        saveSettings: () => { esc.guardado += 1; orden.push('save'); },
        SillyTavern: { getContext: () => ({ Popup: popup }) },
        isRouterRunning: () => !!ocupado.router,
        runtimeState: {
            stateModelRunning: !!ocupado.tracker,
            isLoreOrMapAgentBusyRef: () => !!ocupado.agentes,
        },
        previewPerfProfile,
        perfProfileValues,
        resolveLoreRhythmId,
        LORE_RHYTHM_CUSTOM_ID,
        clampLoreRhythmCustom,
        resolvePerfProfileId,
        perfilGobiernaPensamiento,
        PROMPT_CEILING_SETTINGS_KEYS,
        AG_CONTROL_KEYS,
        OUTPUT_CAP_JOBS,
        applyLoreRhythmPreset: (settings, fila) => {
            orden.push('ritmo');
            settings.routerRunEvery = { cada_turno: 1, cada_2: 2, cada_3: 3 }[fila];
            settings.routerMaxTurns = { cada_turno: 3, cada_2: 4, cada_3: 5 }[fila];
            return { runEvery: settings.routerRunEvery, maxTurns: settings.routerMaxTurns };
        },
        validateAgentControlSet: (set) => ({
            valido: true, avisos: [], cambios: [],
            valores: {
                routerMaxTurns: set.routerMaxTurns ?? 5,
                [AG_CONTROL_KEYS.agentRetries]: set[AG_CONTROL_KEYS.agentRetries] ?? 2,
                [AG_CONTROL_KEYS.jsonCorrections]: set[AG_CONTROL_KEYS.jsonCorrections] ?? 2,
            },
        }),
        document: (dial && dial.document) || { getElementById: () => null, querySelectorAll: () => [], dispatchEvent: () => {} },
        renderAgentPerfBox: () => {},
        renderLoreRhythmBox: () => {},
        renderPromptCeilingsBox: () => {},
        renderThinkingPolicyBox: () => {},
        suspenderDialPensamientoPorPerfil: () => {},
        globalThis: {},
    });
    for (const nombre of ['construirResumenPerfilHtml', 'aplicarPerfilRendimiento', 'confirmarYAplicarPerfil', 'suspenderDialPensamientoPorPerfil']) {
        runInContext(extraer(nombre), ctx);
    }
    return { ctx, orden };
}

describe('con generación activa el perfil se rechaza con aviso (T12)', () => {
    it.each([
        ['router trabajando', { router: true }],
        ['Rastreador trabajando', { tracker: true }],
        ['Agente de Lore/Mapa trabajando', { agentes: true }],
    ])('%s: ni Popup, ni escritura, ni guardado', async (_nombre, ocupado) => {
        const confirm = vi.fn(async () => 1);
        const ajustes = { ...buildDefaultSettings() };
        const antes = JSON.stringify(ajustes);
        const { ctx, orden } = maquina({ ocupado, popup: { show: { confirm } } });
        const aplicado = await ctx.confirmarYAplicarPerfil(ajustes, 'Rapido');
        expect(aplicado).toBe(false);
        expect(confirm).not.toHaveBeenCalled();
        expect(esc.guardado).toBe(0);
        expect(JSON.stringify(ajustes)).toBe(antes);
        expect(esc.avisos.join(' ')).toMatch(/en curso/);
        expect(orden.filter(x => x === 'save')).toHaveLength(0);
    });

    it('el aviso explica el porqué determinista: los límites ya están leídos', async () => {
        const ajustes = { ...buildDefaultSettings() };
        const { ctx } = maquina({ ocupado: { router: true } });
        await ctx.confirmarYAplicarPerfil(ajustes, 'Rapido');
        expect(esc.avisos.join(' ')).toContain('ya están leídos');
    });
});

describe('aplicar antes de persistir: el guardado es lo último y único', () => {
    it('primero se escriben los valores en memoria y saveSettings sale al final', async () => {
        const ajustes = { ...buildDefaultSettings() };
        const { ctx, orden } = maquina();
        let perfilAlGuardar = null;
        // Se captura el estado de los ajustes en el instante del guardado:
        // si persistiera antes de aplicar, el perfil aún no estaría escrito.
        ctx.saveSettings = () => {
            esc.guardado += 1;
            perfilAlGuardar = ajustes.rpgPerfProfile;
            orden.push('save');
        };
        const aplicado = await ctx.confirmarYAplicarPerfil(ajustes, 'Rapido');
        expect(aplicado).toBe(true);
        expect(orden[orden.length - 1]).toBe('save');
        expect(orden.indexOf('ritmo')).toBeLessThan(orden.indexOf('save'));
        expect(perfilAlGuardar).toBe('Rapido');
        expect(esc.guardado).toBe(1);
    });

    it('sin generación activa NADA escribe los mandos por detrás del guardado', () => {
        // `aplicarPerfilRendimiento` es la única puerta: tras su saveSettings no
        // toca ninguna tecla más (su última sentencia es el return).
        const cuerpo = extraer('aplicarPerfilRendimiento');
        const despuesDelGuardado = cuerpo.slice(cuerpo.lastIndexOf('saveSettings();') + 'saveSettings();'.length);
        expect(despuesDelGuardado).not.toMatch(/settings\[/);
        expect(despuesDelGuardado).not.toMatch(/settings\.\w+\s*=/);
        expect(despuesDelGuardado.trim()).toMatch(/^return\b/);
    });
});

describe('el dial de pensamiento se re-suspende cuando algo reescribe las claves', () => {
    function dialSim() {
        const selects = ['state_tracker', 'world_progression', 'map_evolution_compress'].map(job => ({
            dataset: { job }, disabled: false, title: '',
        }));
        const aviso = { style: { display: 'none' }, textContent: '' };
        return {
            document: {
                getElementById: id => (id === 'rpg_thinking_policy_rows'
                    ? { querySelectorAll: () => selects }
                    : id === 'rpg_thinking_policy_profile_note' ? aviso : null),
                querySelectorAll: () => [],
                dispatchEvent: () => {},
            },
            selects, aviso,
        };
    }

    it('tras aplicar Rapido el dial queda heredado con aviso en español', () => {
        const dial = dialSim();
        const { ctx } = maquina({ dial });
        const ajustes = { ...buildDefaultSettings() };
        ctx.aplicarPerfilRendimiento(ajustes, 'Rapido', []);
        const gobernado = ctx.suspenderDialPensamientoPorPerfil(ajustes);
        expect(gobernado).toBe(true);
        for (const select of dial.selects) {
            expect(select.disabled, select.dataset.job).toBe(true);
            expect(select.title).toContain('Lo gobierna el perfil «Rapido»');
        }
        expect(dial.aviso.style.display).toBe('block');
        expect(dial.aviso.textContent).toContain('«Rapido»');
    });

    it('tocar un modo a mano devuelve el dial a la vida (D-10 derivado, no guardado)', () => {
        const dial = dialSim();
        const { ctx } = maquina({ dial });
        const ajustes = { ...buildDefaultSettings() };
        ctx.aplicarPerfilRendimiento(ajustes, 'Rapido', []);
        expect(ctx.suspenderDialPensamientoPorPerfil(ajustes)).toBe(true);
        // El humano toca un modo: la política ya no coincide con ninguna matriz.
        ajustes.localThinkingPolicy = {
            ...ajustes.localThinkingPolicy,
            state_tracker: { mode: 'presupuesto', tokens: 512 },
        };
        expect(resolvePerfProfileId(ajustes, [])).not.toBe('Rapido');
        expect(ctx.suspenderDialPensamientoPorPerfil(ajustes)).toBe(false);
        for (const select of dial.selects) expect(select.disabled).toBe(false);
        expect(dial.aviso.style.display).toBe('none');
    });

    it('Equilibrado (fábrica) nunca gobierna el dial', () => {
        const dial = dialSim();
        const { ctx } = maquina({ dial });
        const ajustes = { ...buildDefaultSettings() };
        expect(perfilGobiernaPensamiento('Equilibrado')).toBe(false);
        expect(ctx.suspenderDialPensamientoPorPerfil(ajustes)).toBe(false);
        for (const select of dial.selects) expect(select.disabled, select.dataset.job).toBe(false);
    });

    it('la suspensión se re-evalúa SIEMPRE tras aplicar, sin memoria del estado previo', () => {
        const dial = dialSim();
        const { ctx } = maquina({ dial });
        const ajustes = { ...buildDefaultSettings() };
        // Aplicar Rapido → suspendido; volver a Equilibrado → vivo; Rapido otra
        // vez → vuelto a suspender (la función deriva de los ajustes cada vez).
        ctx.aplicarPerfilRendimiento(ajustes, 'Rapido', []);
        expect(ctx.suspenderDialPensamientoPorPerfil(ajustes)).toBe(true);
        ctx.aplicarPerfilRendimiento(ajustes, 'Equilibrado', []);
        expect(ctx.suspenderDialPensamientoPorPerfil(ajustes)).toBe(false);
        ctx.aplicarPerfilRendimiento(ajustes, 'Calidad', []);
        expect(ctx.suspenderDialPensamientoPorPerfil(ajustes)).toBe(true);
    });
});

describe('cambio de chat: las claves nuevas no viajan por el estado del chat (D-11)', () => {
    it('cero claves nuevas registradas en CHAT_STATE_GLOBAL_UI_KEYS', () => {
        for (const clave of NUEVAS_CLAVES) {
            expect(CHAT_STATE_GLOBAL_UI_KEYS, clave).not.toContain(clave);
        }
    });

    it('la proyección de saveChatState es campo a campo y no menciona las claves', () => {
        const fuente = readFileSync(new URL('../../src/state/chat-persistence.js', import.meta.url), 'utf8');
        const inicio = fuente.indexOf('export function saveChatState');
        const proyeccion = fuente.slice(inicio, fuente.indexOf('s.chatStates[chatId] = {', inicio) + 4000);
        for (const clave of NUEVAS_CLAVES) {
            expect(proyeccion, clave).not.toContain(clave);
        }
    });

    it('tras un cambio de chat los mandos globales sobreviven y la partición no los copia', () => {
        const s = getSettings();
        Object.assign(s, buildDefaultSettings());
        s.chatId = 'chat-uno';
        s[AG_CONTROL_KEYS.agentRetries] = 1;
        s[AG_CONTROL_KEYS.auditChunkBuffer] = 1000;
        s.rpgPerfProfile = 'Rapido';
        s.rpgPerfProfileCustom = [{ nombre: 'Propio', valores: { reintentos: { agenteRetriesExtra: 1 } } }];
        s.fullReviewSystemPromptOverride = 'PROMPIO {{modulesText}} [TAG][/TAG] REMOVED';

        saveChatState('chat-uno', { skipDiskWrite: true });

        const particion = s.chatStates['chat-uno'];
        expect(particion).toBeTruthy();
        for (const clave of NUEVAS_CLAVES) {
            expect(Object.prototype.hasOwnProperty.call(particion, clave), clave).toBe(false);
        }
        // Los valores globales sobreviven intactos al cambio de chat.
        expect(s[AG_CONTROL_KEYS.agentRetries]).toBe(1);
        expect(s[AG_CONTROL_KEYS.auditChunkBuffer]).toBe(1000);
        expect(s.rpgPerfProfile).toBe('Rapido');
        expect(s.rpgPerfProfileCustom).toHaveLength(1);
        expect(s.fullReviewSystemPromptOverride).toContain('PROMPIO');
    });

    it('una partición antigua con restos de estas claves no gana sobre los globales', () => {
        // Anti-regresión: si alguien copiara las claves a la partición, la
        // proyección de carga (campo a campo) sigue sin leerlas: se comprueba
        // que ni el cargador ni el guardador las citan fuera de su sitio.
        const cargador = readFileSync(new URL('../../src/features/chat/chat-state-loader.js', import.meta.url), 'utf8');
        for (const clave of NUEVAS_CLAVES) {
            expect(cargador, clave).not.toContain(clave);
        }
    });
});

describe('los tres perfiles siguen gobernales con el ciclo completo', () => {
    it.each(PERF_PROFILES.map(p => [p.id]))('%s: aplicar → un guardado → dial coherente', async (id) => {
        const dial = (() => {
            const selects = ['state_tracker'].map(job => ({ dataset: { job }, disabled: false, title: '' }));
            const aviso = { style: { display: 'none' }, textContent: '' };
            return {
                document: {
                    getElementById: x => (x === 'rpg_thinking_policy_rows'
                        ? { querySelectorAll: () => selects }
                        : x === 'rpg_thinking_policy_profile_note' ? aviso : null),
                    querySelectorAll: () => [], dispatchEvent: () => {},
                },
                selects, aviso,
            };
        })();
        const ajustes = { ...buildDefaultSettings() };
        const { ctx } = maquina({ dial });
        const aplicado = await ctx.confirmarYAplicarPerfil(ajustes, id);
        if (id === 'Equilibrado') {
            // Ya estaba en fábrica: no hay nada que confirmar.
            expect(aplicado).toBe(false);
        } else {
            expect(aplicado).toBe(true);
            expect(esc.guardado).toBe(1);
        }
        expect(ctx.suspenderDialPensamientoPorPerfil(ajustes)).toBe(perfilGobiernaPensamiento(id) && resolvePerfProfileId(ajustes, []) === id);
    });
});
