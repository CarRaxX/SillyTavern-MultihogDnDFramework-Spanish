import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
    changedBooksFromFingerprints,
    getBookPreimage,
    getLorebookSnapshotNames,
    isEntryRestorable,
} from '../src/state/lorebook-history.js';
import { fingerprintLorebook } from '../src/state/content-fingerprint.js';

// Fixture de tamaño (spec 2026-11-05, T13): campaña sintética de 8 libros donde cada
// paso toca 3. Se ejecuta el cierre real del paso (`finalizeRouterHistorySnapshot`)
// cinco veces y se compara el blob resultante contra el texto íntegro equivalente.
const source = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
function functionSource(name) {
    const start = source.search(new RegExp(`(?:export )?(?:async )?function ${name}\\(`));
    if (start < 0) throw new Error(`Missing ${name}`);
    return source.slice(start, source.indexOf('\n}', start) + 2).replace(/^export /, '');
}

const KB = 1024;
const TAMANOS = {
    Campaña_Chronicle: 45, Campaña_WorldInfo: 40, Campaña_Locations: 35, Campaña_Maps: 30,
    Campaña_Factions: 25, Campaña_Quests: 20, Campaña_NPCs: 18, Campaña_Items: 12,
};
// Libros de otra campaña que conviven en el registro: jamás deben aparecer citado.
const AJENOS = { Otra_NPCs: 60, Otra_Locations: 60 };
const TOCADOS = ['Campaña_NPCs', 'Campaña_Quests', 'Campaña_Items'];

function libro(nombre, kb) {
    const entradas = {};
    const porEntrada = Math.ceil((kb * KB) / 20);
    for (let i = 0; i < 20; i++) {
        entradas[String(i)] = {
            uid: i, comment: `${nombre} · entrada ${i}`, content: 'p'.repeat(porEntrada),
            keys: ['clave'], extensions: {}, disable: false,
        };
    }
    return { name: nombre, entries: entradas, disable: false, recursive_scanning: false, scan_depth: null };
}

function escenario() {
    const disco = {};
    for (const [nombre, kb] of Object.entries({ ...TAMANOS, ...AJENOS })) disco[nombre] = libro(nombre, kb);
    const settings = {
        routerHistory: [],
        chatStates: { 'chat-1': { campaignBooks: Object.keys(TAMANOS) } },
        activeRouterKeys: [], activeWorldKeys: [], keywordActivatedKeys: [], pinnedRouterKeys: [],
        routerLog: [], pcCharacterBlockSeeded: true, routerLastRunChatLength: 10, routerLastRunAt: 0,
    };
    const equivalentes = [];
    const guardados = [];
    const runtimeState = { lorePrePassPreimages: {} };
    const context = createContext({
        disco,
        equivalentes,
        getSettings: () => settings,
        getRouterChatId: () => 'chat-1',
        getLivePrefix: () => 'Campaña',
        getWorldInfoNamesSafe: () => Promise.resolve(Object.keys(disco)),
        loadWorldInfoFresh: nombre => Promise.resolve(disco[nombre] ? JSON.parse(JSON.stringify(disco[nombre])) : null),
        saveSettings: () => { guardados.push(1); },
        runtimeState,
        cloneRouterValue: (valor, fallback) => JSON.parse(JSON.stringify(valor ?? fallback)),
        fingerprintLorebook, changedBooksFromFingerprints, getBookPreimage, getLorebookSnapshotNames,
        isEntryRestorable,
        bookBelongsToPrefix: (nombre, prefijo) => nombre.startsWith(`${prefijo}_`),
        isSkeletonBookName: nombre => nombre.endsWith('_Skeleton'),
        console: { log() {}, warn() {}, error() {}, info() {} },
    });
    runInContext(`
        ${functionSource('buildRouterLoreState')}
        ${functionSource('finalizeRouterHistorySnapshot')}
        globalThis.pasarPaso = async function (tocados) {
            const s = getSettings();
            const huellas = {};
            const preimagenes = {};
            for (const nombre of Object.keys(campaignBooksOnDisk())) {
                huellas[nombre] = fingerprintLorebook(disco[nombre]);
                preimagenes[nombre] = JSON.parse(JSON.stringify(disco[nombre]));
            }
            const snapshot = buildRouterLoreState(s, { prefix: 'Campaña', chatId: 'chat-1', bookFingerprints: huellas, finalized: false });
            snapshot.runId = 'paso-' + s.routerHistory.length;
            runtimeState.lorePrePassPreimages[snapshot.runId] = preimagenes;
            s.routerHistory.unshift(snapshot);
            // Equivalente antiguo: el formato 1 clonaba TODOS los libros de la campaña.
            equivalentes.push({ runId: snapshot.runId, bookSnapshots: JSON.parse(JSON.stringify(preimagenes)) });
            for (const nombre of tocados) {
                const editado = JSON.parse(JSON.stringify(disco[nombre]));
                editado.entries['0'].content += '-reescrito-por-el-agente';
                disco[nombre] = editado;
            }
            await finalizeRouterHistorySnapshot(snapshot.runId, function () { return true; });
        };
        function campaignBooksOnDisk() {
            const solo = {};
            for (const nombre of Object.keys(disco)) if (bookBelongsToPrefix(nombre, 'Campaña')) solo[nombre] = disco[nombre];
            return solo;
        }
    `, context);
    return { context, settings, disco, runtimeState, equivalentes, guardados };
}

describe('Huella del historial tras cinco pasos (T13)', () => {
    it('el historial ocupa como máximo el 40 % del texto íntegro equivalente', async () => {
        const e = escenario();
        for (let paso = 0; paso < 5; paso++) await e.context.pasarPaso(TOCADOS);

        const dieta = JSON.stringify(e.settings.routerHistory).length;
        const integro = JSON.stringify(e.equivalentes).length;
        expect(integro).toBeGreaterThan(900 * KB);
        expect(dieta / integro).toBeLessThanOrEqual(0.4);
        // Cada entrada guarda copia de los tres libros tocados y nada más.
        for (const entrada of e.settings.routerHistory) {
            expect(Object.keys(entrada.bookSnapshots).sort()).toEqual([...TOCADOS].sort());
            expect(entrada.finalized).toBe(true);
            expect(entrada.snapshotFormat).toBe(2);
            expect(Object.keys(entrada.bookFingerprintsPre)).toHaveLength(Object.keys(TAMANOS).length);
        }
    });

    it('ninguna entrada referencia libros de otra campaña', async () => {
        const e = escenario();
        for (let paso = 0; paso < 5; paso++) await e.context.pasarPaso(TOCADOS);
        for (const entrada of e.settings.routerHistory) {
            for (const nombre of getLorebookSnapshotNames(entrada)) {
                expect(nombre.startsWith('Otra_')).toBe(false);
                expect(nombre.startsWith('Campaña_')).toBe(true);
            }
        }
        // Y el deshacer sigue siendo posible para cada uno de los cinco pasos.
        expect(e.settings.routerHistory.filter(isEntryRestorable)).toHaveLength(5);
    });

    it('no acumula preimágenes en memoria al cerrar cada paso', async () => {
        const e = escenario();
        for (let paso = 0; paso < 5; paso++) {
            await e.context.pasarPaso(TOCADOS);
            expect(Object.keys(e.runtimeState.lorePrePassPreimages)).toEqual([]);
        }
        expect(e.guardados.length).toBe(5);
    });
});
