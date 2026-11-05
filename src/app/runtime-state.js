/**
 * Mutable UI/controller state shared by the entry module and extracted UI builders.
 * Keeping this in one small module lets large UI units move out without stale copies
 * of chat, history, and callback state.
 */
export const runtimeState = {
    stateModelRunning: false,
    stateController: null,
    currentChatId: null,
    pendingUnseenChatReset: null,
    historyViewIndex: -1,
    dungeonMapHistoryOverlay: null,
    liveDungeonMapBackup: null,
    renderedViewActive: false,
    loreRedoStack: [],
    /**
     * Preimagen completa del paso del Agente de Lorebooks, por `runId` y sólo en
     * memoria (spec 2026-11-05, D1-A). Al cerrar el paso sólo los libros tocados
     * pasan a `routerHistory`; el resto se descarta aquí para no hinchar el blob.
     * @type {Record<string, Record<string, any>>}
     */
    lorePrePassPreimages: {},
    renderRouterUI: null,
    refreshAgentManifest: async () => {},
    refreshImmersionView: async () => {},
    hasActiveDungeonMap: false,
    refreshNpcManifest: async () => {},
    updateAgentWorldStatusRef: null,
    updateAgentPanelDisabledRef: null,
    updateWorldProgressionLastFiredDisplayRef: null,
    updateMapEvolutionScheduleDisplayRef: null,
    refreshTrackerViewRef: null,
    runMapEvolutionPassRef: null,
    runMapUpdaterPassRef: null,
    loadMappedEvolutionSiteRef: null,
    isLoreOrMapAgentBusyRef: null,
};
