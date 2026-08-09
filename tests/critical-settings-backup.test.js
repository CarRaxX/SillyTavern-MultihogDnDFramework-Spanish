import { beforeEach, describe, expect, it } from 'vitest';
import {
    applyCriticalSettingsBackup,
    CRITICAL_SETTINGS_BACKUP_KEY,
    readCriticalSettingsBackup,
    stampCriticalSettingsSynced,
    writeCriticalSettingsBackup,
} from '../src/state/critical-settings-backup.js';

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
