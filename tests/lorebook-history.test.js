import { describe, expect, it } from 'vitest';
import {
    bookBelongsToCampaignPrefix,
    changedBooksFromFingerprints,
    findLoreHistoryIndexForChat,
    getBookPreimage,
    getCreatedLorebookNames,
    getEntryBookNames,
    getLorebookSnapshotNames,
    isEntryRestorable,
    isLoreHistoryEntryForChat,
    isLoreRedoEntryForChat,
    trimLoreHistoryForRollback,
} from '../src/state/lorebook-history.js';

describe('Lorebook Agent history safety', () => {
    it('represents a first-ever pass as an explicit empty baseline', () => {
        expect(getLorebookSnapshotNames({ campaignBookNames: [], bookSnapshots: {} })).toEqual([]);
    });

    it('keeps owned campaign books in the pre-pass baseline even if discovery missed them', () => {
        const names = getLorebookSnapshotNames({
            campaignBookNames: [],
            bookSnapshots: {},
            campaignBooks: ['Camp_NPCs', 'Camp_Locations'],
        });
        expect(names.sort()).toEqual(['Camp_Locations', 'Camp_NPCs']);

        const created = getCreatedLorebookNames({
            snapshot: {
                campaignBookNames: [],
                bookSnapshots: {},
                campaignBooks: ['Camp_NPCs'],
                createdBookNames: ['Camp_NPCs'],
            },
            currentNames: ['Camp_NPCs'],
            currentRouterLog: [],
            prefix: 'Camp',
        });
        expect(created).toEqual([]);
    });

    it('scopes history entries to the active chat id', () => {
        const history = [
            { chatId: 'Chat B', campaignPrefix: 'B' },
            { chatId: 'Chat A', campaignPrefix: 'A' },
        ];
        expect(isLoreHistoryEntryForChat(history[0], { chatId: 'Chat A', campaignPrefix: 'A' })).toBe(false);
        expect(findLoreHistoryIndexForChat(history, { chatId: 'Chat A', campaignPrefix: 'A' })).toBe(1);
        expect(findLoreHistoryIndexForChat(history, { chatId: 'Chat B', campaignPrefix: 'B' })).toBe(0);
    });

    it('falls back to campaign prefix only for legacy snapshots without chatId', () => {
        const legacy = { campaignPrefix: 'Camp' };
        expect(isLoreHistoryEntryForChat(legacy, { chatId: 'Chat A', campaignPrefix: 'Camp' })).toBe(true);
        expect(isLoreHistoryEntryForChat(legacy, { chatId: 'Chat A', campaignPrefix: 'Other' })).toBe(false);
        expect(isLoreHistoryEntryForChat(
            { chatId: 'Chat A', campaignPrefix: 'Camp' },
            { chatId: 'Chat B', campaignPrefix: 'Camp' },
        )).toBe(false);
    });

    it('requires both redo snapshots to belong to the active chat', () => {
        const scope = { chatId: 'Chat A', campaignPrefix: 'A' };
        expect(isLoreRedoEntryForChat({
            prePassSnapshot: { chatId: 'Chat A', campaignPrefix: 'A' },
            postPassState: { chatId: 'Chat A', campaignPrefix: 'A' },
        }, scope)).toBe(true);
        expect(isLoreRedoEntryForChat({
            prePassSnapshot: { chatId: 'Chat A', campaignPrefix: 'A' },
            postPassState: { chatId: 'Chat B', campaignPrefix: 'B' },
        }, scope)).toBe(false);
    });

    it('preserves other chats when trimming history after a scoped rollback', () => {
        const history = [
            { runId: 'b-new', chatId: 'Chat B', campaignPrefix: 'B' },
            { runId: 'a-selected', chatId: 'Chat A', campaignPrefix: 'A' },
            { runId: 'b-old', chatId: 'Chat B', campaignPrefix: 'B' },
            { runId: 'a-old', chatId: 'Chat A', campaignPrefix: 'A' },
        ];
        expect(trimLoreHistoryForRollback(history, 1).map(entry => entry.runId))
            .toEqual(['b-new', 'b-old', 'a-old']);
    });

    it('removes newer entries only for the rolled-back chat', () => {
        const history = [
            { runId: 'a-new', chatId: 'Chat A', campaignPrefix: 'A' },
            { runId: 'b-new', chatId: 'Chat B', campaignPrefix: 'B' },
            { runId: 'a-selected', chatId: 'Chat A', campaignPrefix: 'A' },
            { runId: 'b-old', chatId: 'Chat B', campaignPrefix: 'B' },
        ];
        expect(trimLoreHistoryForRollback(history, 2).map(entry => entry.runId))
            .toEqual(['b-new', 'b-old']);
    });

    it('deletes only books exactly recorded as created by a modern pass', () => {
        const created = getCreatedLorebookNames({
            snapshot: {
                campaignBookNames: [],
                bookSnapshots: {},
                createdBookNames: ['First_Campaign_NPCs'],
            },
            currentNames: ['First_Campaign_NPCs', 'First_Campaign_Manual', 'Other_NPCs'],
            currentRouterLog: [],
            prefix: 'First_Campaign',
        });

        expect(created).toEqual(['First_Campaign_NPCs']);
    });

    it('uses recorded entry IDs conservatively for legacy first-pass snapshots', () => {
        const created = getCreatedLorebookNames({
            snapshot: { bookSnapshots: {} },
            currentNames: ['First_Campaign_NPCs', 'First_Campaign_Manual', 'Other_NPCs'],
            currentRouterLog: [{ record: ['First_Campaign_NPCs::0'] }],
            prefix: 'First_Campaign',
        });

        expect(created).toEqual(['First_Campaign_NPCs']);
    });

    it('does not attribute an older log entry to a legacy no-op pass', () => {
        const created = getCreatedLorebookNames({
            snapshot: {
                bookSnapshots: { First_Campaign_NPCs: { entries: {} } },
            },
            currentNames: ['First_Campaign_NPCs'],
            currentRouterLog: [{ record: ['First_Campaign_NPCs::0'] }],
            prefix: 'First_Campaign',
        });

        expect(created).toEqual([]);
    });

    it('does not treat a longer campaign prefix as part of a shorter one', () => {
        expect(bookBelongsToCampaignPrefix('Campaign_NPCs', 'Campaign')).toBe(true);
        expect(bookBelongsToCampaignPrefix('Campaign_2026_NPCs', 'Campaign')).toBe(false);
    });
});

describe('Formato 2 del historial (spec 2026-11-05, dieta del blob)', () => {
    const entrada = {
        campaignBookNames: ['Campaña_NPCs', 'Campaña_Locations', 'Campaña_WorldInfo'],
        bookFingerprintsPre: {
            Campaña_NPCs: '10:aaaa1111bbbb2222',
            Campaña_Locations: '10:cccc3333dddd4444',
            Campaña_WorldInfo: '10:eeee5555ffff6666',
        },
        // Sólo el libro tocado por el paso guarda copia textual.
        bookSnapshots: { Campaña_NPCs: { entries: { 0: { content: 'antes' } } } },
        snapshotFormat: 2,
        finalized: true,
    };

    it('une las huellas al conjunto de libros previos al paso', () => {
        expect(getEntryBookNames(entrada).sort()).toEqual([
            'Campaña_Locations', 'Campaña_NPCs', 'Campaña_WorldInfo',
        ]);
        expect(getLorebookSnapshotNames(entrada).sort())
            .toEqual(getEntryBookNames(entrada).sort());
    });

    it('no borra un libro intacto sin copia al deshacer', () => {
        // Paso moderno: la entrada declara los libros creados. El libro intacto sin
        // copia está en las huellas previas, así que NO pudo ser creado por el paso.
        const modernos = getCreatedLorebookNames({
            snapshot: { ...entrada, createdBookNames: ['Campaña_Nuevo', 'Campaña_Locations'] },
            currentNames: ['Campaña_NPCs', 'Campaña_Locations', 'Campaña_WorldInfo', 'Campaña_Nuevo'],
            currentRouterLog: [],
            prefix: 'Campaña',
        });
        expect(modernos).toEqual(['Campaña_Nuevo']);

        // Paso legado sin lista exacta: se apoya en el registro del paso. Sin las
        // huellas previas, WorldInfo parecería creado y el deshacer lo borraría.
        const sinHuellas = { ...entrada, bookFingerprintsPre: undefined, campaignBookNames: undefined };
        const conHuellas = getCreatedLorebookNames({
            snapshot: entrada,
            currentNames: ['Campaña_NPCs', 'Campaña_Locations', 'Campaña_WorldInfo'],
            currentRouterLog: [{ record: ['Campaña_WorldInfo::0'] }],
            prefix: 'Campaña',
        });
        const legado = getCreatedLorebookNames({
            snapshot: sinHuellas,
            currentNames: ['Campaña_NPCs', 'Campaña_Locations', 'Campaña_WorldInfo'],
            currentRouterLog: [{ record: ['Campaña_WorldInfo::0'] }],
            prefix: 'Campaña',
        });
        expect(conHuellas).toEqual([]);
        expect(legado).toEqual(['Campaña_WorldInfo']);
    });

    it('devuelve la preimagen sólo del libro que la conserva', () => {
        expect(getBookPreimage(entrada, 'Campaña_NPCs')).toEqual({ entries: { 0: { content: 'antes' } } });
        expect(getBookPreimage(entrada, 'Campaña_Locations')).toBeNull();
        expect(getBookPreimage(null, 'Campaña_Locations')).toBeNull();
    });

    it('descarta como no deshacible la entrada sin cerrar y sin copias', () => {
        expect(isEntryRestorable(entrada)).toBe(true);
        expect(isEntryRestorable({ ...entrada, bookSnapshots: {} })).toBe(true);
        expect(isEntryRestorable({ snapshotFormat: 2, finalized: false, bookSnapshots: {} })).toBe(false);
        expect(isEntryRestorable({ bookSnapshots: { A: { entries: {} } } })).toBe(true);
        expect(isEntryRestorable({ chatId: 'A' })).toBe(false);
        expect(isEntryRestorable(null)).toBe(false);
    });

    it('detecta cambios, libros creados y libros borrados por huella', () => {
        const pre = { A: '1:x', B: '1:y', C: '1:z' };
        const post = { A: '1:x', B: '1:y2', D: '1:w' };
        expect(changedBooksFromFingerprints(pre, post).sort()).toEqual(['B', 'C', 'D']);
        expect(changedBooksFromFingerprints(pre, pre)).toEqual([]);
        expect(changedBooksFromFingerprints(null, null)).toEqual([]);
    });
});
