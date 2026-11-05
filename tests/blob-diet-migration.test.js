import { describe, expect, it } from 'vitest';
import {
    buildBundledPromptsSnapshot,
    computeBundledPromptsFingerprintForSnapshot,
    isBundledPromptsDigest,
    normalizeBundledPromptsSnapshot,
} from '../src/state/factory-and-diff.js';
import { fingerprintLorebook } from '../src/state/content-fingerprint.js';
import { isEntryRestorable } from '../src/state/lorebook-history.js';
import { migrateBlobDiet, migrateCustomFields } from '../src/state/settings.js';
import { MODULE_NAME } from '../src/state/schema-sections.js';

// Migración D6 (spec 2026-11-05): reescribir el blob sin perder ni un deshacer.
const LIBRO = { entries: { 0: { uid: 0, content: 'Ada antes del paso' } } };
const OTRA = { entries: { 0: { uid: 0, content: 'El castillo' } } };

/** Entrada de formato antigo (formato 1): copias textuales de todos los libros. */
const entradaLegada = () => ({
    runId: 'r1', chatId: 'A', campaignPrefix: 'A', timestamp: '10:00',
    campaignBookNames: ['A_NPCs', 'A_Locations'],
    campaignBooks: ['A_NPCs', 'A_Locations'],
    bookSnapshots: { A_NPCs: LIBRO, A_Locations: OTRA },
    routerLog: [], routerLastRunChatLength: 4,
});

const defaultsAntiguos = () => ({
    sysprompt: { main: 'texto de sysprompt v1', narrativePacingModes: { normal: 'ritmo v1' } },
    tracker: { systemPromptTemplate: 'tracker v1', userPromptSuffix: 'sufijo', stockPrompts: { CHARACTER: 'ficha' } },
    lorebook: { routerSystemPromptTemplate: 'lorebook v1', modules: { charter: { instruction: 'charter', format: 'f' } } },
    world: { worldProgressionSystemPrompt: 'mundo v1' },
    sections: { npcCoreSections: 'npc v1', pcCoreSections: 'pc v1' },
});

describe('Migración del historial del Agente de Lorebooks (D6)', () => {
    it('pasa las entradas antigas a formato 2 conservando sus copias', () => {
        const settings = { routerHistory: [entradaLegada()] };
        const antes = JSON.stringify(settings.routerHistory[0].bookSnapshots);
        expect(migrateBlobDiet(settings)).toBe(true);

        const entrada = settings.routerHistory[0];
        expect(entrada.snapshotFormat).toBe(2);
        expect(entrada.finalized).toBe(true);
        // Las copias siguen ahí: lo que se podía deshacer se sigue pudiendo.
        expect(JSON.stringify(entrada.bookSnapshots)).toBe(antes);
        expect(isEntryRestorable(entrada)).toBe(true);
        // Huellas previas derivadas de las propias copias.
        expect(entrada.bookFingerprintsPre).toEqual({
            A_NPCs: fingerprintLorebook(LIBRO),
            A_Locations: fingerprintLorebook(OTRA),
        });
        // Sin huellas posteriores: la guarda D2 no debe dar avisos falsos con datos
        // migrados (laudo del Oráculo, punto 1).
        expect(entrada).not.toHaveProperty('bookFingerprintsPost');
    });

    it('es idempotente: la segunda pasada no cambia nada', () => {
        const settings = { routerHistory: [entradaLegada()], lastSeenPromptDefaultsSnapshot: defaultsAntiguos() };
        expect(migrateBlobDiet(settings)).toBe(true);
        const foto = JSON.stringify(settings);
        expect(migrateBlobDiet(settings)).toBe(false);
        expect(JSON.stringify(settings)).toBe(foto);
    });

    it('descarta sólo las entradas a medias sin preimagen', () => {
        const sinCopias = { runId: 'r2', chatId: 'A', snapshotFormat: 2, finalized: false, bookSnapshots: {} };
        const conCopias = { runId: 'r3', chatId: 'A', snapshotFormat: 2, finalized: false, bookSnapshots: { A_NPCs: LIBRO } };
        const legadoSinCopias = { runId: 'r4', chatId: 'A', bookSnapshots: {} };
        const settings = { routerHistory: [sinCopias, conCopias, legadoSinCopias] };
        expect(migrateBlobDiet(settings)).toBe(true);
        // La abortada sin preimagen desaparece; las demás se quedan tal cual.
        expect(settings.routerHistory.map(e => e.runId)).toEqual(['r3', 'r4']);
        expect(settings.routerHistory[1].snapshotFormat).toBeUndefined();
    });

    it('no toca una entrada de formato 2 ya cerrada', () => {
        const moderna = {
            runId: 'r5', chatId: 'A', snapshotFormat: 2, finalized: true,
            bookSnapshots: { A_NPCs: LIBRO },
            bookFingerprintsPre: { A_NPCs: '1:aaaa1111bbbb2222' },
            bookFingerprintsPost: { A_NPCs: '1:cccc3333dddd4444' },
        };
        const settings = { routerHistory: [moderna] };
        const foto = JSON.stringify(moderna);
        expect(migrateBlobDiet(settings)).toBe(false);
        expect(JSON.stringify(settings.routerHistory[0])).toBe(foto);
    });
});

describe('Migración de los defaults enviados a digest (D6)', () => {
    it('sustituye el texto íntegro por huellas conservando la huella global', () => {
        const antiguos = defaultsAntiguos();
        const settings = { lastSeenPromptDefaultsSnapshot: antiguos };
        expect(migrateBlobDiet(settings)).toBe(true);

        const digest = settings.lastSeenPromptDefaultsSnapshot;
        expect(isBundledPromptsDigest(digest)).toBe(true);
        // La huella con la que se decide si hay defaults pendientes no cambia de
        // significado: sigue siendo la del snapshot normalizado.
        expect(digest.fingerprint).toBe(computeBundledPromptsFingerprintForSnapshot(normalizeBundledPromptsSnapshot(antiguos)));
    });

    it('con los defaults reales el digest ocupa una fracción mínima del texto', () => {
        const reales = buildBundledPromptsSnapshot();
        const settings = { lastSeenPromptDefaultsSnapshot: reales };
        expect(migrateBlobDiet(settings)).toBe(true);
        const texto = JSON.stringify(reales).length;
        const compacto = JSON.stringify(settings.lastSeenPromptDefaultsSnapshot).length;
        expect(texto).toBeGreaterThan(100 * 1024);
        expect(compacto / texto).toBeLessThan(0.1);
    });

    it('deja intacto un digest o la ausencia de datos', () => {
        expect(migrateBlobDiet({ lastSeenPromptDefaultsSnapshot: null })).toBe(false);
        expect(migrateBlobDiet({})).toBe(false);
        const digest = { v: 2, fingerprint: 'x', elements: { 'sysprompt|sysprompt.txt': '1:aaaa' } };
        const settings = { lastSeenPromptDefaultsSnapshot: digest };
        expect(migrateBlobDiet(settings)).toBe(false);
        expect(settings.lastSeenPromptDefaultsSnapshot).toBe(digest);
    });
});

describe('migrateCustomFields informa de que hay que persistir', () => {
    it('devuelve true cuando el blob necesitaba dieta y false cuando ya está limpio', () => {
        const sucias = { routerHistory: [entradaLegada()], lastSeenPromptDefaultsSnapshot: defaultsAntiguos() };
        globalThis.SillyTavern = { getContext: () => ({ extensionSettings: { [MODULE_NAME]: sucias } }) };
        try {
            expect(migrateCustomFields()).toBe(true);
            expect(isBundledPromptsDigest(sucias.lastSeenPromptDefaultsSnapshot)).toBe(true);
            expect(sucias.routerHistory[0].snapshotFormat).toBe(2);
            // Segunda carga sobre los mismos datos: no se vuelve a guardar.
            expect(migrateCustomFields()).toBe(false);
        } finally {
            delete globalThis.SillyTavern;
        }
    });
});
