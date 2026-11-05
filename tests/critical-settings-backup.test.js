import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseAst } from 'rollup/parseAst';
import {
    applyCriticalSettingsBackup,
    CRITICAL_SETTINGS_BACKUP_KEY,
    readCriticalSettingsBackup,
    stampCriticalSettingsSynced,
    writeCriticalSettingsBackup,
} from '../src/state/critical-settings-backup.js';
import { buildBundledPromptsDigest, buildBundledPromptsSnapshot, isBundledPromptsDigest } from '../src/state/factory-and-diff.js';

describe('critical settings backup', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('writes and reads displayGroups + prompt ack fields', () => {
        const settings = {
            displayGroups: [{ id: 'g1', name: 'TEST GROUP', enabled: true, members: ['STYLE'] }],
            displayGroupsEnabled: true,
            displayGroupsShowGaps: false,
            lastResetVersion: '7.1.2',
            lastSeenPromptDefaultsFingerprint: 'abc',
            lastSeenPromptDefaultsSnapshot: { lorebook: { x: 1 } },
            autoResetPromptsOnUpdate: false,
        };

        const ts = writeCriticalSettingsBackup(settings);
        expect(ts).toBeGreaterThan(0);
        const backup = readCriticalSettingsBackup();
        expect(backup?.displayGroups?.[0]?.name).toBe('TEST GROUP');
        expect(backup?.lastSeenPromptDefaultsFingerprint).toBe('abc');
        expect(localStorage.getItem(CRITICAL_SETTINGS_BACKUP_KEY)).toBeTruthy();
    });

    it('restores deleted displayGroups when disk stamp is older than the WAL', () => {
        const live = {
            displayGroups: [{ id: 'g1', name: 'TEST GROUP', enabled: true, members: ['STYLE'] }],
            displayGroupsEnabled: true,
            displayGroupsShowGaps: true,
            lastResetVersion: '7.1.2',
            lastSeenPromptDefaultsFingerprint: 'new-fp',
            lastSeenPromptDefaultsSnapshot: { v: 2 },
            autoResetPromptsOnUpdate: false,
            criticalSettingsSyncedTs: 0,
        };
        const ts = stampCriticalSettingsSynced(live, writeCriticalSettingsBackup(live));

        // Simulate a cancelled disk save: disk still has the old group + old ack.
        const disk = {
            displayGroups: [{ id: 'g1', name: 'TEST GROUP', enabled: true, members: ['STYLE'] }],
            displayGroupsEnabled: true,
            displayGroupsShowGaps: true,
            lastResetVersion: '7.0.0',
            lastSeenPromptDefaultsFingerprint: 'old-fp',
            lastSeenPromptDefaultsSnapshot: { v: 1 },
            autoResetPromptsOnUpdate: false,
            criticalSettingsSyncedTs: ts - 10_000,
        };

        // User deleted the group in-session; WAL already reflects that.
        live.displayGroups = [];
        writeCriticalSettingsBackup(live);

        expect(applyCriticalSettingsBackup(disk)).toBe(true);
        expect(disk.displayGroups).toEqual([]);
        expect(disk.lastSeenPromptDefaultsFingerprint).toBe('new-fp');
        expect(disk.criticalSettingsSyncedTs).toBeGreaterThan(ts - 10_000);
    });

    it('does not overwrite disk when the synced stamp matches the WAL', () => {
        const settings = {
            displayGroups: [],
            displayGroupsEnabled: true,
            lastResetVersion: '7.1.2',
            lastSeenPromptDefaultsFingerprint: 'fp',
            lastSeenPromptDefaultsSnapshot: null,
            autoResetPromptsOnUpdate: false,
            criticalSettingsSyncedTs: 0,
        };
        const ts = stampCriticalSettingsSynced(settings, writeCriticalSettingsBackup(settings));
        settings.criticalSettingsSyncedTs = ts;

        expect(applyCriticalSettingsBackup(settings)).toBe(false);
        expect(settings.displayGroups).toEqual([]);
    });
});

// Spec 2026-11-05 (T10/R5): si el acknowledge siguiera escribiendo el texto íntegro
// de los defaults, la WAL de localStorage lo resucitaría en cada recarga y la dieta
// del blob no serviría de nada. Se extrae el ack real de index.js y se comprueba
// qué acaba en localStorage.
const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
function extractAck() {
    let encontrado = null;
    const visitar = nodo => {
        if (!nodo || typeof nodo !== 'object' || encontrado) return;
        if (nodo.type === 'VariableDeclarator' && nodo.id?.name === 'persistPromptDefaultsAck') {
            encontrado = indexSource.slice(nodo.init.start, nodo.init.end);
            return;
        }
        for (const valor of Object.values(nodo)) {
            if (Array.isArray(valor)) valor.forEach(visitar);
            else if (valor && typeof valor === 'object') visitar(valor);
        }
    };
    visitar(parseAst(indexSource));
    if (!encontrado) throw new Error('Falta persistPromptDefaultsAck en index.js');
    return encontrado;
}

describe('acknowledge de defaults y WAL compacta', () => {
    const contextoAck = () => {
        const context = createContext({
            currentVersion: '7.10.5',
            currentFingerprint: 'huella-global',
            currentSnapshot: buildBundledPromptsSnapshot(),
            buildBundledPromptsDigest,
            writeCriticalSettingsBackup,
            stampCriticalSettingsSynced,
            localStorage: globalThis.localStorage,
            console,
        });
        runInContext(`globalThis.persistPromptDefaultsAck = ${extractAck()};`, context);
        return context;
    };

    it('guarda el digest y reescribe la WAL sin el texto íntegro', () => {
        const context = contextoAck();
        const target = { displayGroups: [], criticalSettingsSyncedTs: 0 };
        context.persistPromptDefaultsAck(target);

        expect(isBundledPromptsDigest(target.lastSeenPromptDefaultsSnapshot)).toBe(true);
        expect(target.lastSeenPromptDefaultsFingerprint).toBe('huella-global');
        expect(target.lastResetVersion).toBe('7.10.5');
        expect(target.criticalSettingsSyncedTs).toBeGreaterThan(0);

        const wal = localStorage.getItem(CRITICAL_SETTINGS_BACKUP_KEY) || '';
        const texto = JSON.stringify(context.currentSnapshot).length;
        expect(texto).toBeGreaterThan(100 * 1024);
        // La WAL es compacta: guarda huellas, no prompts.
        expect(wal.length / texto).toBeLessThan(0.1);
        expect(JSON.parse(wal).lastSeenPromptDefaultsSnapshot.v).toBe(2);
    });

    it('al recargar, la WAL devuelve el digest y no resurrecta el texto', () => {
        const context = contextoAck();
        const escrito = { displayGroups: [], criticalSettingsSyncedTs: 0 };
        context.persistPromptDefaultsAck(escrito);

        // Recarga: los ajustes del disco van vacíos y la WAL los cura.
        const recargados = { lastSeenPromptDefaultsSnapshot: null, criticalSettingsSyncedTs: 0 };
        expect(applyCriticalSettingsBackup(recargados)).toBe(true);
        expect(isBundledPromptsDigest(recargados.lastSeenPromptDefaultsSnapshot)).toBe(true);
        expect(JSON.stringify(recargados.lastSeenPromptDefaultsSnapshot)).not.toContain('You are');
    });
});
