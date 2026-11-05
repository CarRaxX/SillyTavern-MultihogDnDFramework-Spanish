import * as chatAffinity from '../src/state/pass-affinity.js';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { canCommitPassForChat } from '../src/state/pass-affinity.js';
import { changedBooksFromFingerprints, getBookPreimage, getLorebookSnapshotNames, isEntryRestorable } from '../src/state/lorebook-history.js';
import { fingerprintLorebook } from '../src/state/content-fingerprint.js';
import { LOREBOOK_ROLLBACK_LIMIT } from '../src/state/history-retention.js';

// Dieta del paso del Agente de Lorebooks (spec 2026-11-05, D1-A/D5): durante el paso
// las preimágenes viven en memoria y la entrada del historial sólo lleva huellas; al
// cerrarlo se guarda copia textual únicamente de los libros cambiados o borrados.
const source = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
function functionSource(name) {
    const start = source.search(new RegExp(`(?:export )?(?:async )?function ${name}\\(`));
    if (start < 0) throw new Error(`Missing ${name}`);
    return source.slice(start, source.indexOf('\n}', start) + 2).replace(/^export /, '');
}

const clone = value => JSON.parse(JSON.stringify(value));
const LIBROS_INICIALES = () => ({
    A_NPCs: { entries: { 0: { uid: 0, comment: 'Ada', content: 'Long chronicle' } } },
    A_Locations: { entries: { 0: { uid: 0, comment: 'Keep', content: 'A keep' } } },
    A_WorldInfo: { entries: { 0: { uid: 0, comment: 'World', content: 'A world' } } },
    A_Chronicle: { entries: { 0: { uid: 0, comment: 'Chronicle', content: 'A chronicle' } } },
});

/**
 * Paso completo con E/S controlada. `efecto` simula en el disco lo que el agente
 * escribe durante el paso; `fallo` hace que la aplicación aborte después de escribir
 * (paso detenido o roto con libros ya tocados).
 */
function harness({ efecto = () => {}, campaignBooks = null, fallo = null, falloTrasCierre = false } = {}) {
    let chatId = 'A';
    const books = LIBROS_INICIALES();
    const nombresIniciales = Object.keys(books);
    const abrirPuerta = { resolve: null };
    const puerta = new Promise(done => { abrirPuerta.resolve = done; });
    const entrar = { resolve: null };
    const haEntrado = new Promise(done => { entrar.resolve = done; });
    const settings = {
        routerBasicMode: true, activeRouterKeys: [], routerHistory: [], routerCleanupEvery: 0,
        pcCharacterBlockSeeded: true, npcCoreSections: [{ name: 'Body' }],
        // Lista de propiedad de la campaña: en producción no se poda al borrar un
        // libro, así que por defecto conserva los cuatro nombres.
        chatStates: { A: { campaignBooks: (campaignBooks || nombresIniciales).slice() } },
        routerLog: [],
    };
    const runtimeState = { lorePrePassPreimages: {} };
    const persist = vi.fn();
    const avisos = [];
    const consola = {
        log() {}, error() {}, info() {},
        warn: (...args) => { avisos.push(args.map(String).join(' ')); },
    };
    const registrarEvento = (evento) => {
        // Simula el fallo de un sitio posterior al cierre feliz: con el panel de
        // depuración abierto, renderSchedulerPanel() corre sin try dentro de este
        // registro y soltaba el `catch` por segunda vez sobre la misma entrada.
        if (falloTrasCierre && evento === 'la_pass_complete') {
            throw new Error('renderSchedulerPanel exploded');
        }
    };
    const chat = [{ is_user: false, mes: 'A narrative.' }];
    const apply = vi.fn(async () => {
        entrar.resolve();
        await puerta;
        efecto(books);
        if (fallo === 'aborto') {
            const error = new Error('Stopped by user');
            error.name = 'AbortError';
            throw error;
        }
        return { success: true, errors: [], recordedIds: [] };
    });
    const noop = () => {};
    const empty = () => '';
    const llm = vi.fn(() => 'A response');
    const context = createContext({
        ...chatAffinity,
        AbortController, console: consola,
        canCommitPassForChat, LOREBOOK_ROLLBACK_LIMIT, LORE_EXISTENCE_RULE: '',
        getActiveChatId: () => chatId, getLivePrefix: () => chatId,
        getSettings: () => settings, isLocationMappingEnabled: () => false,
        isLorebookAgentRuntimeActive: () => true,
        SillyTavern: { getContext: () => ({ chatId, chat, generateRaw: noop }) },
        broadcastStep: noop, stripSkeletonFromRouterPools: () => false,
        fetchRouterArchiveBooks: () => Promise.resolve(books),
        getRouterChatId: () => chatId, recordSchedulerEvent: registrarEvento, saveSettings: persist,
        getWorldInfoNamesSafe: () => Promise.resolve(Object.keys(books)),
        runtimeState,
        cloneRouterValue: (value, fallback) => JSON.parse(JSON.stringify(value ?? fallback)),
        fingerprintLorebook, changedBooksFromFingerprints, getBookPreimage, isEntryRestorable,
        getLorebookSnapshotNames,
        loadWorldInfoFresh: name => Promise.resolve(books[name] ? clone(books[name]) : null),
        toastr: { warning: noop, info: noop, success: noop, error: noop },
        bookBelongsToPrefix: (name, prefix) => name.startsWith(`${prefix}_`),
        isSkeletonBookName: () => false, buildKeyringText: empty,
        formatAgentChatLogFromIndex: empty, extractFooterLocation: empty, findLatestDungeonLocation: empty,
        extractCurrentTimeStr: empty, computeUnpinnedActiveCount: () => 0,
        extractActiveCombatBlock: empty, extractPartyBlock: empty,
        resolveCombatProfileGuidance: empty, getEnabledRouterCategoryTags: () => [],
        adjustPromptTimestamps: text => text, getEligibleCoreFieldNames: () => [],
        resolveAutoPassRestriction: empty, resolveExistingNpcNudge: empty,
        expandLorebookPromptTemplate: text => text, stripStaticDungeonAgentGuidance: text => text,
        formatMappedSiteAgentNote: empty, formatArchiveIndexSection: empty, formatCurrentLocationSection: empty,
        sendStateRequest: llm, sendAgentTurn: llm, parseBasicTags: () => ({
            record: [], update: [], activate: ['A_NPCs::0'], deactivate: [],
            rewrite: [{ id: 'A_NPCs::0', content: 'Rewritten chronicle' }], consolidate: [],
        }), applyAction: apply,
        persistRouterLastRunWatermark: noop, persistRouterLastRunTimestamp: noop,
        document: { dispatchEvent: noop }, CustomEvent: class {},
        estimateTokens: () => 400, stripDungeonMapSection: text => text,
        countRedundantPairs: () => 0,
        setTimeout: callback => { void callback; return 0; }, clearTimeout: noop,
    });
    runInContext(`let _routerRunning = false, _routerController = null, _routerCleanupTimer = null, _routerNormalRunCount = 0;
        ${functionSource('stopRouterPass')}
        ${functionSource('buildRouterLoreState')}
        ${functionSource('finalizeRouterHistorySnapshot')}
        ${functionSource('runRouterPass')}`, context);
    const pending = context.runRouterPass('Narrative', null, null, false);
    return { context, settings, runtimeState, books, persist, avisos, haEntrado,
        abrir: () => abrirPuerta.resolve(), terminar: () => pending,
        // Cambio de chat real: invalida los guardas de propiedad igual que onChatChanged.
        cambiarChat: () => { chatId = 'B'; chatAffinity.invalidateChatCommitGuards(); },
        cambiarChatId: id => { chatId = id; } };
}

// El agente reescribe NPCs y elimina el libro de mundo, como haría un paso real.
const EFECTO_ESTANDAR = books => {
    books.A_NPCs = { entries: { 0: { uid: 0, comment: 'Ada', content: 'Rewritten chronicle' } } };
    delete books.A_WorldInfo;
};

describe('Dieta de la entrada del historial (D1-A, D5)', () => {
    it('mantiene las preimágenes en memoria y no guarda antes del paso', async () => {
        const h = harness({ efecto: EFECTO_ESTANDAR });
        await h.haEntrado;
        const entrada = h.settings.routerHistory[0];
        expect(entrada.snapshotFormat).toBe(2);
        expect(entrada.finalized).toBe(false);
        // Huellas de TODOS los libros de la campaña y ninguna copia textual.
        expect(Object.keys(entrada.bookFingerprintsPre).sort()).toEqual([
            'A_Chronicle', 'A_Locations', 'A_NPCs', 'A_WorldInfo',
        ]);
        expect(entrada.bookSnapshots).toEqual({});
        expect(entrada.campaignBookNames.slice().sort()).toEqual(Object.keys(LIBROS_INICIALES()).sort());
        // Las preimágenes completas están aparcadas en memoria, indexadas por runId.
        const aparcadas = h.runtimeState.lorePrePassPreimages[entrada.runId];
        expect(Object.keys(aparcadas).sort()).toEqual(Object.keys(LIBROS_INICIALES()).sort());
        expect(aparcadas.A_WorldInfo).toEqual(LIBROS_INICIALES().A_WorldInfo);
        // D5: sin guardado forzoso antes del paso.
        expect(h.persist).not.toHaveBeenCalled();
        h.abrir();
        await h.terminar();
    });

    it('sólo guarda copia de los libros cambiados o borrados al cerrar el paso', async () => {
        const h = harness({ efecto: EFECTO_ESTANDAR });
        await h.haEntrado;
        const runId = h.settings.routerHistory[0].runId;
        h.abrir();
        await h.terminar();
        const entrada = h.settings.routerHistory[0];
        expect(entrada.finalized).toBe(true);
        // A_NPCs (modificado) y A_WorldInfo (borrado): los intactos no ocupan nada.
        expect(Object.keys(entrada.bookSnapshots).sort()).toEqual(['A_NPCs', 'A_WorldInfo']);
        expect(entrada.bookSnapshots.A_NPCs).toEqual(LIBROS_INICIALES().A_NPCs);
        expect(entrada.bookSnapshots.A_WorldInfo).toEqual(LIBROS_INICIALES().A_WorldInfo);
        expect(entrada.bookFingerprintsPost.A_NPCs).not.toBe(entrada.bookFingerprintsPre.A_NPCs);
        expect(entrada.bookFingerprintsPost.A_Locations).toBe(entrada.bookFingerprintsPre.A_Locations);
        expect(entrada.bookFingerprintsPost.A_WorldInfo).toBeUndefined();
        // La lista de propiedad sigue reclamando el libro borrado, así que el paso
        // no lo declara borrado: aún así se guarda su preimagen porque la huella
        // posterior falta, que es lo que necesita el deshacer.
        expect(entrada.deletedBookNames).toEqual([]);
        expect(entrada.createdBookNames).toEqual([]);
        expect(isEntryRestorable(entrada)).toBe(true);
        // La preimagen en memoria se libera al cerrarla, y es entonces cuando el
        // blob llega a disco (D5).
        expect(h.runtimeState.lorePrePassPreimages[runId]).toBeUndefined();
        expect(h.persist).toHaveBeenCalled();
    });

    it('declara borrado un libro que ya no está entre los de la campaña', async () => {
        const h = harness({ efecto: EFECTO_ESTANDAR, campaignBooks: ['A_NPCs', 'A_Locations', 'A_Chronicle'] });
        await h.haEntrado;
        h.abrir();
        await h.terminar();
        const entrada = h.settings.routerHistory[0];
        expect(entrada.deletedBookNames).toEqual(['A_WorldInfo']);
        // Su preimagen es la que permite recrear el libro al deshacer.
        expect(entrada.bookSnapshots.A_WorldInfo).toEqual(LIBROS_INICIALES().A_WorldInfo);
        expect(Object.keys(entrada.bookFingerprintsPost).sort())
            .toEqual(['A_Chronicle', 'A_Locations', 'A_NPCs']);
    });

    it('no copia nada cuando el paso no tocó ningún libro', async () => {
        const h = harness();
        await h.haEntrado;
        h.abrir();
        await h.terminar();
        const entrada = h.settings.routerHistory[0];
        expect(entrada.finalized).toBe(true);
        expect(entrada.bookSnapshots).toEqual({});
        expect(entrada.deletedBookNames).toEqual([]);
        // Sin copias pero cerrada: sigue siendo deshacible (sólo se reponen metadatos).
        expect(isEntryRestorable(entrada)).toBe(true);
        expect(Object.keys(entrada.bookFingerprintsPost)).toHaveLength(4);
    });

    it('no deja preimágenes huérfanas al terminar un paso', async () => {
        const h = harness({ efecto: EFECTO_ESTANDAR });
        await h.haEntrado;
        expect(Object.keys(h.runtimeState.lorePrePassPreimages)).toHaveLength(1);
        h.abrir();
        await h.terminar();
        expect(Object.keys(h.runtimeState.lorePrePassPreimages)).toEqual([]);
    });

    it('mantiene la preimagen aparcada mientras la entrada no está cerrada', async () => {
        // A mitad de paso el blob aún no tiene copia: la entrada no se ofrece como
        // deshacible y la preimagen espera en memoria al cierre.
        const h = harness({ efecto: EFECTO_ESTANDAR });
        await h.haEntrado;
        const entrada = h.settings.routerHistory[0];
        expect(entrada.finalized).toBe(false);
        expect(isEntryRestorable(entrada)).toBe(false);
        expect(Object.keys(h.runtimeState.lorePrePassPreimages[entrada.runId])).toHaveLength(4);
        h.abrir();
        await h.terminar();
    });
});

// Regresión del paso abortado (laudo D5/R3): sin el guardado previo al paso, si la
// entrada no se cerrara al abortar, los libros que el agente ya escribió quedarían
// irreversibles y la preimagen seguiría colgada en memoria toda la sesión.
describe('Paso abortado con libros ya escritos (D5/R3)', () => {
    it('cierra la entrada y persiste las copias de lo que llegó a escribirse', async () => {
        const h = harness({ efecto: EFECTO_ESTANDAR, fallo: 'aborto' });
        await h.haEntrado;
        const runId = h.settings.routerHistory[0].runId;
        h.abrir();
        await expect(h.terminar()).resolves.toBe(false);

        const entrada = h.settings.routerHistory[0];
        expect(entrada.runId).toBe(runId);
        expect(entrada.finalized).toBe(true);
        // Lo que el agente tocó antes de caerse queda deshacible.
        expect(Object.keys(entrada.bookSnapshots).sort()).toEqual(['A_NPCs', 'A_WorldInfo']);
        expect(entrada.bookSnapshots.A_NPCs).toEqual(LIBROS_INICIALES().A_NPCs);
        expect(entrada.bookFingerprintsPost.A_NPCs).toBeDefined();
        expect(isEntryRestorable(entrada)).toBe(true);
        // Y se persiste en el cierre (D5): sin este guardado el undo moriría al recargar.
        expect(h.persist).toHaveBeenCalled();
        expect(h.runtimeState.lorePrePassPreimages[runId]).toBeUndefined();
    });

    it('no escribe en el chat ajeno al abortar, pero libera la preimagen aparcada', async () => {
        const h = harness({ efecto: EFECTO_ESTANDAR, fallo: 'aborto' });
        await h.haEntrado;
        const entrada = h.settings.routerHistory[0];
        h.persist.mockClear();
        h.abrir();
        h.cambiarChat();
        await expect(h.terminar()).resolves.toBe(false);

        // Sin propiedad del chat no se toca el blob del chat que llegó.
        expect(entrada.finalized).toBe(false);
        expect(entrada.bookSnapshots).toEqual({});
        expect(entrada.createdBookNames).toBeUndefined();
        expect(h.persist).not.toHaveBeenCalled();
        // La entrada sin cerrar no se ofrece como deshacible (se descarta al arrancar),
        // y su preimagen no puede quedarse megas colgada en la sesión.
        expect(isEntryRestorable(entrada)).toBe(false);
        expect(Object.keys(h.runtimeState.lorePrePassPreimages)).toEqual([]);
    });
});

// Regresión del doble cierre (ronda 2): el camino feliz ya cerró y persistió la
// entrada; si después lanza un sitio real del `try` (registro del scheduler con el
// panel de depuración abierto, tick automático o auto-limpieza), el `catch` no puede
// volver a cerrarla: su preimagen ya está liberada y un segundo cierre vaciaría
// `bookSnapshots` dejando una entrada «deshacible» que no restaura nada (AC2/AC5).
describe('Segundo cierre sobre una entrada ya cerrada', () => {
    it('no vacía las copias ni persiste dos veces si algo falla tras el cierre feliz', async () => {
        const h = harness({ efecto: EFECTO_ESTANDAR, falloTrasCierre: true });
        await h.haEntrado;
        const runId = h.settings.routerHistory[0].runId;
        h.abrir();
        // El paso falla despues del cierre: debe devolver false sin dañar la entrada.
        await expect(h.terminar()).resolves.toBe(false);

        const entrada = h.settings.routerHistory[0];
        expect(entrada.runId).toBe(runId);
        expect(entrada.finalized).toBe(true);
        // Las copias del cierre feliz siguen intactas: es lo que necesita el deshacer.
        expect(Object.keys(entrada.bookSnapshots).sort()).toEqual(['A_NPCs', 'A_WorldInfo']);
        expect(entrada.bookSnapshots.A_NPCs).toEqual(LIBROS_INICIALES().A_NPCs);
        expect(entrada.bookSnapshots.A_WorldInfo).toEqual(LIBROS_INICIALES().A_WorldInfo);
        expect(isEntryRestorable(entrada)).toBe(true);
        // El cierre persistio una sola vez: un segundo guardado seria el vaciado.
        expect(h.persist).toHaveBeenCalledTimes(1);
        // Y no hubo un segundo cierre rebuscando preimagenes ya liberadas.
        expect(h.avisos.filter(aviso => aviso.includes('no preimage'))).toEqual([]);
        expect(Object.keys(h.runtimeState.lorePrePassPreimages)).toEqual([]);
    });
});
