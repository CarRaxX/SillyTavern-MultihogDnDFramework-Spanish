import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

describe('startup settings persistence gate', () => {
    it('coalesces saves until the active chat projection is stable', () => {
        const saveStart = indexSource.indexOf('export function saveSettings(force = false, delay = 0)');
        const doSaveStart = indexSource.indexOf('const doSave = async', saveStart);
        const gateCheck = indexSource.indexOf('if (!_settingsPersistenceGateOpen)', saveStart);

        expect(saveStart).toBeGreaterThan(-1);
        expect(gateCheck).toBeGreaterThan(saveStart);
        expect(gateCheck).toBeLessThan(doSaveStart);
        expect(indexSource.slice(gateCheck, doSaveStart)).toContain('_startupSavePending = true');
        expect(indexSource.slice(gateCheck, doSaveStart)).toContain('_startupSavePendingForce');
    });

    it('opens persistence only after chat bootstrap and portrait migration', () => {
        const bootLoad = indexSource.indexOf('const restoredBootChat = loadChatState(bootChatId)');
        const portraitMigration = indexSource.indexOf('await runPortraitMigrationIfNeeded()', bootLoad);
        const gateOpen = indexSource.indexOf('await openSettingsPersistenceGate()', portraitMigration);

        expect(bootLoad).toBeGreaterThan(-1);
        expect(portraitMigration).toBeGreaterThan(bootLoad);
        expect(gateOpen).toBeGreaterThan(portraitMigration);
    });

    it('defers the prompt-default startup action until after the gate opens', () => {
        const assignment = indexSource.indexOf('_runPromptDefaultsStartupAction = _runPromptDefaultsDialog');
        const gateOpen = indexSource.indexOf('await openSettingsPersistenceGate()');
        const invocation = indexSource.indexOf('void action()', gateOpen);

        expect(assignment).toBeGreaterThan(-1);
        expect(gateOpen).toBeGreaterThan(assignment);
        expect(invocation).toBeGreaterThan(gateOpen);
        expect(indexSource.slice(assignment, gateOpen)).not.toContain('void _runPromptDefaultsDialog()');
    });
});
