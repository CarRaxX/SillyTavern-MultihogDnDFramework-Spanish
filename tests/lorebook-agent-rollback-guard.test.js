import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import * as affinity from '../src/state/pass-affinity.js';
import { fingerprintLorebook } from '../src/state/content-fingerprint.js';
import {
    getCreatedLorebookNames,
    getLorebookSnapshotNames,
    isEntryRestorable,
    isLoreHistoryEntryForChat,
    trimLoreHistoryForRollback,
} from '../src/state/lorebook-history.js';
import { isSkeletonBookName } from '../src/state/lorebook-keyring.js';

const source = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
function functionSource(name) {
    const start = source.search(new RegExp(`(?:export )?(?:async )?function ${name}\\(`));
    if (start < 0) throw new Error(`Missing ${name}`);
    return source.slice(start, source.indexOf('\n}', start) + 2).replace(/^export /, '');
}

const clone = value => JSON.parse(JSON.stringify(value));
const huellas = libros => Object.fromEntries(Object.entries(libros).map(([name, book]) => [name, fingerprintLorebook(book)]));

// Estado de los cuatro libros de la campaña antes del paso del agente.
const ANTES = {
    A_NPCs: { entries: { 0: { uid: 0, content: 'NPCs antes del paso' } } },
    A_Locations: { entries: { 0: { uid: 0, content: 'Ubicaciones siempre igual' } } },
    A_WorldInfo: { entries: { 0: { uid: 0, content: 'Mapamundi antes del paso' } } },
    A_Chronicle: { entries: { 0: { uid: 0, content: 'Crónica siempre igual' } } },
};
// Lo que el agente dejó en disco al terminar: reescribió NPCs y borró WorldInfo.
const DESPUES = {
    A_NPCs: { entries: { 0: { uid: 0, content: 'NPCs reescritos por el agente' } } },
    A_Locations: ANTES.A_Locations,
    A_Chronicle: ANTES.A_Chronicle,
};
const EDICION_MANUAL = { entries: { 0: { uid: 0, content: 'Edición hecha a mano tras el paso' } } };

/** Entrada del historial en formato 2: sólo las `copias` guardan preimagen. */
function crearEntrada({ copias = ['A_NPCs', 'A_WorldInfo'], finalized = true } = {}) {
    return {
        runId: 'r1',
        chatId: 'A',
        campaignPrefix: 'A',
        timestamp: '10:00',
        snapshotFormat: 2,
        finalized,
        campaignBooks: Object.keys(ANTES),
        campaignBookNames: Object.keys(ANTES),
        bookFingerprintsPre: huellas(ANTES),
        bookFingerprintsPost: huellas(DESPUES),
        bookSnapshots: Object.fromEntries(copias.map(name => [name, clone(ANTES[name])])),
        createdBookNames: [],
        deletedBookNames: ['A_WorldInfo'],
        routerLog: [],
        routerLastRunChatLength: 3,
    };
}

/**
 * Deshacer sobre un disco controlado. `discos` es el estado actual de los libros,
 * `popupResult` es lo que devuelve el diálogo (undefined = sin diálogo disponible).
 */
function harness({ entrada = crearEntrada(), discos = DESPUES, popupResult = undefined } = {}) {
    const books = clone(discos);
    const orden = [];
    const writes = [];
    const deletes = [];
    const toastr = { warning: vi.fn(), info: vi.fn(), success: vi.fn(), error: vi.fn() };
    const confirm = vi.fn(() => {
        orden.push('dialogo');
        return Promise.resolve(popupResult);
    });
    const ctx = { chatId: 'A', chat: [], updateWorldInfoList: vi.fn(() => Promise.resolve()) };
    if (popupResult !== undefined) ctx.Popup = { show: { confirm } };
    ctx.POPUP_RESULT = { AFFIRMATIVE: 1, CANCEL: 2 };
    const settings = {
        routerLog: [],
        chatStates: { A: { campaignBooks: Object.keys(ANTES) } },
        routerHistory: [entrada],
    };
    const context = createContext({
        ...affinity,
        console: { log() {}, warn() {}, error() {}, info() {} },
        getActiveChatId: () => 'A',
        getRouterChatId: () => 'A',
        getLivePrefix: () => 'A',
        getSettings: () => settings,
        saveSettings: vi.fn(),
        SillyTavern: { getContext: () => ctx },
        toastr,
        fingerprintLorebook,
        isEntryRestorable,
        isLoreHistoryEntryForChat,
        getCreatedLorebookNames,
        getLorebookSnapshotNames,
        trimLoreHistoryForRollback,
        isSkeletonBookName,
        getWorldInfoNamesSafe: () => Promise.resolve(Object.keys(books)),
        loadWorldInfoFresh: name => Promise.resolve(books[name] ? clone(books[name]) : null),
        evictWorldInfoCache: () => Promise.resolve(true),
        saveWorldInfoSnapshot: (name, data) => {
            orden.push('escritura');
            writes.push(name);
            books[name] = clone(data);
            return Promise.resolve(true);
        },
        deleteWorldInfoFresh: name => {
            orden.push('borrado');
            deletes.push(name);
            delete books[name];
            return Promise.resolve(true);
        },
        captureRouterLoreState: () => Promise.resolve({ books: clone(books) }),
        captureActiveDungeonMapHistory: () => Promise.resolve({}),
        recordLiveDungeonMapSnapshot: vi.fn(),
        restoreRouterLoreMetadata: vi.fn(),
        persistRouterLastRunWatermark: vi.fn(),
        recoverRouterLoreState: vi.fn(),
        document: { dispatchEvent: vi.fn() },
        CustomEvent: class { constructor(type, detail) { this.type = type; this.detail = detail; } },
    });
    runInContext(`${functionSource('librosOmitidosPorEdicionManual')}
        ${functionSource('rollbackRouterPass')}`, context);
    return { context, settings, books, orden, writes, deletes, toastr, confirm, ctx,
        deshacer: () => context.rollbackRouterPass(0) };
}

describe('Guarda anti-edición manual del deshacer (spec 2026-11-05, D2)', () => {
    it('no toca los libros de campaña que el paso no modificó', async () => {
        const h = harness();
        await expect(h.deshacer()).resolves.toBe(true);
        // Sólo se reescriben los libros que guardan preimagen; el resto ni se abre.
        expect(h.writes.sort()).toEqual(['A_NPCs', 'A_WorldInfo']);
        expect(h.books.A_Locations).toEqual(ANTES.A_Locations);
        expect(h.books.A_Chronicle).toEqual(ANTES.A_Chronicle);
        // Ningún libro intacto se borra: las huellas previas evitan crear falsos.
        expect(h.deletes).toEqual([]);
        expect(h.confirm).not.toHaveBeenCalled();
    });

    it('restaura también un libro editado a mano cuando el usuario lo confirma', async () => {
        const h = harness({ discos: { ...DESPUES, A_NPCs: EDICION_MANUAL }, popupResult: 1 });
        await expect(h.deshacer()).resolves.toBe(true);
        expect(h.confirm).toHaveBeenCalledTimes(1);
        expect(String(h.confirm.mock.calls[0][0])).toContain('A_NPCs');
        expect(h.books.A_NPCs).toEqual(ANTES.A_NPCs);
        // La pregunta se muestra antes de escribir nada en disco.
        expect(h.orden[0]).toBe('dialogo');
    });

    it('conserva la edición manual y restaura los demás cuando el usuario cancela', async () => {
        const h = harness({ discos: { ...DESPUES, A_NPCs: EDICION_MANUAL }, popupResult: 2 });
        await expect(h.deshacer()).resolves.toBe(true);
        expect(h.books.A_NPCs).toEqual(EDICION_MANUAL);
        expect(h.writes).toEqual(['A_WorldInfo']);
        expect(h.toastr.warning).toHaveBeenCalledTimes(1);
        expect(String(h.toastr.warning.mock.calls[0][0])).toContain('A_NPCs');
        // Un solo diálogo por deshacer, aunque haya varios libros dudosos.
        expect(h.confirm).toHaveBeenCalledTimes(1);
    });

    it('omite todos los libros dudosos cuando no hay diálogo disponible', async () => {
        const h = harness({ discos: { ...DESPUES, A_NPCs: EDICION_MANUAL, A_Locations: EDICION_MANUAL },
            entrada: crearEntrada({ copias: ['A_NPCs', 'A_WorldInfo', 'A_Locations'] }) });
        await expect(h.deshacer()).resolves.toBe(true);
        // Sin Popup ni window.confirm, la opción segura es no sobrescribir nada dudosos.
        expect(h.books.A_NPCs).toEqual(EDICION_MANUAL);
        expect(h.books.A_Locations).toEqual(EDICION_MANUAL);
        expect(h.writes).toEqual(['A_WorldInfo']);
        expect(h.toastr.warning).toHaveBeenCalledTimes(1);
    });

    it('recrea un libro que el paso borró sin abrir el diálogo', async () => {
        expect(harness().books.A_WorldInfo).toBeUndefined();
        const h = harness();
        await expect(h.deshacer()).resolves.toBe(true);
        expect(h.books.A_WorldInfo).toEqual(ANTES.A_WorldInfo);
        expect(h.confirm).not.toHaveBeenCalled();
    });

    it('rechaza una entrada de paso a medias sin preimagen y no escribe nada', async () => {
        const h = harness({ entrada: crearEntrada({ copias: [], finalized: false }) });
        await expect(h.deshacer()).resolves.toBe(false);
        expect(h.writes).toEqual([]);
        expect(h.deletes).toEqual([]);
        expect(h.settings.routerHistory).toHaveLength(1);
        expect(h.settings.routerHistory[0].finalized).toBe(false);
        expect(h.context.restoreRouterLoreMetadata).not.toHaveBeenCalled();
        expect(h.toastr.warning).toHaveBeenCalledTimes(1);
    });

    it('no avisa de nada en una entrada heredada sin huellas posteriores', async () => {
        // Blobs antiguos (formato 1): migrados con copias textuales y sin huellas.
        // Aquí no hay nada que comparar, así que el deshacer no debe abrir diálogo.
        const entrada = {
            chatId: 'A', campaignPrefix: 'A', runId: 'r0',
            bookSnapshots: { A_NPCs: clone(ANTES.A_NPCs) },
            routerLog: [], routerLastRunChatLength: 2,
        };
        const h = harness({ entrada, discos: { ...DESPUES, A_NPCs: EDICION_MANUAL } });
        await expect(h.deshacer()).resolves.toBe(true);
        expect(h.confirm).not.toHaveBeenCalled();
        expect(h.toastr.warning).not.toHaveBeenCalled();
        expect(h.books.A_NPCs).toEqual(ANTES.A_NPCs);
    });
});
