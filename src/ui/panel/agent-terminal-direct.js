/** Wire per-tab Terminal/Direct Prompt send bars in the Lorebook Agent panel. */

import { AGENT_TERMINAL_TAB_IDS } from './agent-terminal.js';

const DRAFT_KEYS = {
    state_tracker: 'stateTrackerDirectPrompt',
    lorebook_agent: 'routerDirectPrompt',
    map_updater: 'mapUpdaterDirectPrompt',
    map_evolution: 'mapEvolutionDirectPrompt',
    map_architect: 'mapArchitectDirectPrompt',
};

const LOOKBACK_KEYS = {
    state_tracker: 'directPromptContext',
    lorebook_agent: 'routerDirectLookback',
    map_updater: 'mapUpdaterDirectLookback',
    map_evolution: 'mapEvolutionDirectLookback',
    map_architect: 'mapArchitectDirectLookback',
};

function parseLookback(raw, fallback = 10) {
    const n = parseInt(String(raw ?? ''), 10);
    return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

/** Extract an explicit Map Architect creation target from a natural direct command. */
export function parseMapArchitectCreateDirective(value) {
    const text = String(value || '').trim();
    const match = text.match(/\bcreate\s+(?:an?\s+)?(SETTLEMENT|DUNGEON|INTERIOR)\s+map\s+for\s+(?:"([^"]+)"|'([^']+)'|([^:\r\n]+?))\s*(?::|$)/i);
    if (!match) return null;
    const site = String(match[2] || match[3] || match[4] || '').trim();
    if (!site) return null;
    return { kind: match[1].toUpperCase(), site };
}

/**
 * @param {object} options
 * @param {HTMLElement} options.agentPanel
 * @param {() => object} options.getSettings
 * @param {() => void} options.saveSettings
 * @param {() => boolean} options.agentsBusy
 * @param {(chat: any[], lookback: number, includeHidden?: boolean) => string} options.getNarrativeBlocks
 * @param {(narrative: string, manualPrompt: string|null, lookback: number|null, isManual: boolean) => Promise<any>} options.runRouterPass
 * @param {(msg: string, options?: object) => Promise<any>} options.sendDirectPrompt
 * @param {(opts: object) => Promise<any>} options.runMapUpdaterPass
 * @param {(opts: object) => Promise<any>} options.runMapEvolutionPass
 * @param {() => Promise<Array<{siteRoot: string, kind: string, current?: boolean}>>} options.listMappedEvolutionSites
 * @param {(sites: any[], escapeHtml: Function) => Promise<string[]|null>} options.promptMappedEvolutionSites
 * @param {(args: object) => Promise<any>} options.runMapArchitect
 * @param {(args: object) => Promise<object>} options.inferMapArchitectArgs
 * @param {(s: string) => string} options.escapeHtml
 * @param {(running?: boolean) => void} [options.updateAgentStatusIndicator]
 * @param {() => boolean} [options.isRouterRunning]
 */
export function wireAgentTerminalDirectPrompts({
    agentPanel,
    getSettings,
    saveSettings,
    agentsBusy,
    getNarrativeBlocks,
    runRouterPass,
    sendDirectPrompt,
    runMapUpdaterPass,
    runMapEvolutionPass,
    listMappedEvolutionSites,
    promptMappedEvolutionSites,
    runMapArchitect,
    inferMapArchitectArgs,
    escapeHtml,
    updateAgentStatusIndicator,
    isRouterRunning,
}) {
    if (!agentPanel) return;

    const persistDraft = (tabId, value) => {
        const key = DRAFT_KEYS[tabId];
        if (!key) return;
        const s = getSettings();
        s[key] = value;
        saveSettings();
    };

    const persistLookback = (tabId, value) => {
        const key = LOOKBACK_KEYS[tabId];
        if (!key) return;
        const s = getSettings();
        s[key] = value;
        saveSettings();
    };

    const readLookback = (tabId) => {
        const input = agentPanel.querySelector(`#rt-terminal-direct-lookback-${tabId}`);
        const s = getSettings();
        const fallback = Number(s[LOOKBACK_KEYS[tabId]]) || 10;
        return input ? parseLookback(input.value, fallback) : fallback;
    };

    const clearDraft = (tabId) => {
        const input = /** @type {HTMLTextAreaElement|null} */ (agentPanel.querySelector(`#rt-terminal-direct-${tabId}`));
        if (input) input.value = '';
        persistDraft(tabId, '');
    };

    const summarizeMapUpdater = (result) => {
        const skipped = result?.skipped;
        if (skipped === 'location_mapping_off' || skipped === 'dungeon_reality_off') {
            return { kind: 'warning', message: 'Mapas Persistentes está desactivado.' };
        }
        if (skipped === 'no_active_map') return { kind: 'warning', message: 'No hay un mapa de mazmorra o asentamiento activo.' };
        if (skipped === 'no_such_map') return { kind: 'warning', message: 'No se pudo cargar ese lugar mapeado.' };
        if (skipped === 'disabled') return { kind: 'warning', message: 'El Actualizador de Mapas está desactivado.' };
        if (skipped === 'busy') return { kind: 'warning', message: 'Otro agente ya se está ejecutando.' };
        if (skipped === 'stopped') return { kind: 'info', message: 'Detenido.' };
        if (result?.ok && result?.noop) return { kind: 'info', message: 'No hubo cambios duraderos.' };
        if (result?.ok) return { kind: 'success', message: 'Actualización de ocupación aplicada.' };
        return { kind: 'error', message: 'No se pudo aplicar una actualización válida de ocupación.' };
    };

    const summarizeMapEvolution = (result) => {
        const skipped = result?.skipped;
        if (skipped === 'location_mapping_off') return { kind: 'warning', message: 'Mapas Persistentes está desactivado.' };
        if (skipped === 'no_maps' || skipped === 'no_matching_sites') return { kind: 'warning', message: 'No hay lugares mapeados para evolucionar.' };
        if (skipped === 'disabled') return { kind: 'warning', message: 'La Evolución de Mapas está desactivada.' };
        if (skipped === 'busy') return { kind: 'warning', message: 'Otro agente ya se está ejecutando.' };
        if (result?.ok && result?.baseline) return { kind: 'info', message: 'Sellado de línea base únicamente — nada que evolucionar aún.' };
        if (result?.ok) return { kind: 'success', message: 'Pase de Evolución de Mapas completado.' };
        return { kind: 'error', message: 'La Evolución de Mapas no pudo completarse.' };
    };

    const resolveCurrentSiteRoot = async () => {
        const sites = typeof listMappedEvolutionSites === 'function'
            ? await listMappedEvolutionSites().catch(() => [])
            : [];
        const current = sites.find(site => site.current);
        if (current?.siteRoot) return current.siteRoot;
        if (sites.length === 1) return sites[0].siteRoot;
        return '';
    };

    const runForTab = async (tabId) => {
        const input = /** @type {HTMLTextAreaElement|null} */ (agentPanel.querySelector(`#rt-terminal-direct-${tabId}`));
        if (!input) return;
        const msg = String(input.value || '').trim();
        if (!msg) return;

        const lookback = readLookback(tabId);
        const lookbackInput = /** @type {HTMLInputElement|null} */ (agentPanel.querySelector(`#rt-terminal-direct-lookback-${tabId}`));
        if (lookbackInput) {
            lookbackInput.value = String(lookback);
            persistLookback(tabId, lookback);
        }

        if (tabId !== 'state_tracker' && typeof agentsBusy === 'function' && agentsBusy()) {
            toastr.warning('Otro agente ya se está ejecutando.', 'Terminal/Prompt Directo');
            return;
        }

        clearDraft(tabId);

        if (tabId === 'state_tracker') {
            const s = getSettings();
            s.directPromptContext = lookback;
            saveSettings();
            toastr['info']('Ejecutando Rastreador de Estado con comando específico...', 'Rastreador de Estado');
            await sendDirectPrompt(msg);
            return;
        }

        if (tabId === 'lorebook_agent') {
            const s = getSettings();
            const { chat } = SillyTavern.getContext();
            const combinedNarrative = getNarrativeBlocks(chat, -1, !!s.routerIncludeHidden);
            toastr['info']('Ejecutando Agente de Lorebook con comando específico...', 'Agente de Lorebook');
            await runRouterPass(combinedNarrative, msg, lookback, true);
            return;
        }

        if (tabId === 'map_updater') {
            toastr['info']('Ejecutando Actualizador de Mapas con comando específico...', 'Actualizador de Mapas');
            if (typeof updateAgentStatusIndicator === 'function' && typeof isRouterRunning === 'function') {
                updateAgentStatusIndicator(isRouterRunning());
            }
            const result = await runMapUpdaterPass({
                isManual: true,
                lookback,
                directInstruction: msg,
            });
            if (typeof updateAgentStatusIndicator === 'function' && typeof isRouterRunning === 'function') {
                updateAgentStatusIndicator(isRouterRunning());
            }
            const summary = summarizeMapUpdater(result);
            toastr[summary.kind === 'success' ? 'success' : summary.kind === 'warning' ? 'warning' : summary.kind === 'error' ? 'error' : 'info'](
                summary.message,
                'Actualizador de Mapas',
            );
            return;
        }

        if (tabId === 'map_evolution') {
            const sites = typeof listMappedEvolutionSites === 'function'
                ? await listMappedEvolutionSites()
                : [];
            if (!sites.length) {
                toastr.warning('No hay lugares mapeados para evolucionar.', 'Evolución de Mapas');
                return;
            }
            let siteRoots = sites.filter(site => site.current).map(site => site.siteRoot);
            if (!siteRoots.length) {
                siteRoots = await promptMappedEvolutionSites(sites, escapeHtml);
                if (!siteRoots) return;
                if (!siteRoots.length) {
                    toastr.warning('Selecciona al menos un lugar mapeado.', 'Evolución de Mapas');
                    return;
                }
            }
            toastr['info']('Ejecutando Evolución de Mapas con comando específico...', 'Evolución de Mapas');
            if (typeof updateAgentStatusIndicator === 'function' && typeof isRouterRunning === 'function') {
                updateAgentStatusIndicator(isRouterRunning());
            }
            const result = await runMapEvolutionPass({
                trigger: 'manual',
                isManual: true,
                siteRoots,
                directInstruction: msg,
                lookback,
            });
            if (typeof updateAgentStatusIndicator === 'function' && typeof isRouterRunning === 'function') {
                updateAgentStatusIndicator(isRouterRunning());
            }
            const summary = summarizeMapEvolution(result);
            toastr[summary.kind === 'success' ? 'success' : summary.kind === 'warning' ? 'warning' : summary.kind === 'error' ? 'error' : 'info'](
                summary.message,
                'Evolución de Mapas',
            );
            return;
        }

        if (tabId === 'map_architect') {
            const directive = parseMapArchitectCreateDirective(msg);
            const activeSiteRoot = await resolveCurrentSiteRoot();
            const siteRoot = directive?.site || activeSiteRoot;
            if (!siteRoot) {
                toastr.warning('Indica un lugar con "Crear mapa de INTERIOR/MAZMORRA/ASENTAMIENTO para \\"Nombre\\"", o abre una ubicación mapeada primero.', 'Arquitecto de Mapas');
                return;
            }
            toastr['info'](`Ejecutando Arquitecto de Mapas para ${siteRoot}...`, 'Arquitecto de Mapas');
            try {
                const args = await inferMapArchitectArgs({
                    site: siteRoot,
                    userBrief: msg,
                    lookback,
                });
                if (directive) args.kind = directive.kind;
                await runMapArchitect(args);
                toastr['success'](`Arquitecto de Mapas finalizado para ${siteRoot}.`, 'Arquitecto de Mapas');
            } catch (error) {
                console.error('[RPG Tracker] Error en el prompt directo del Arquitecto de Mapas:', error);
                toastr.error(String(error?.message || error), 'Arquitecto de Mapas');
            }
        }
    };

    AGENT_TERMINAL_TAB_IDS.forEach(tabId => {
        const input = agentPanel.querySelector(`#rt-terminal-direct-${tabId}`);
        const lookbackInput = agentPanel.querySelector(`#rt-terminal-direct-lookback-${tabId}`);
        const runBtn = agentPanel.querySelector(`.rt-agent-terminal-direct-run[data-terminal-tab="${tabId}"]`);

        if (input) {
            const grow = () => {
                const line = parseFloat(getComputedStyle(input).lineHeight) || 16;
                const max = line * 5;
                input.style.height = 'auto';
                input.style.overflowY = 'hidden';
                const next = Math.min(max, Math.max(line, input.scrollHeight));
                input.style.height = `${next}px`;
                input.style.overflowY = input.scrollHeight > max + 1 ? 'auto' : 'hidden';
            };
            grow();
            input.addEventListener('input', () => {
                grow();
                persistDraft(tabId, /** @type {HTMLTextAreaElement} */ (input).value);
            });
            input.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void runForTab(tabId);
                }
            });
        }
        if (lookbackInput) {
            lookbackInput.addEventListener('change', () => {
                const value = parseLookback(/** @type {HTMLInputElement} */ (lookbackInput).value, 10);
                /** @type {HTMLInputElement} */ (lookbackInput).value = String(value);
                persistLookback(tabId, value);
            });
        }
        if (runBtn) {
            runBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                void runForTab(tabId);
            });
        }
    });
}
