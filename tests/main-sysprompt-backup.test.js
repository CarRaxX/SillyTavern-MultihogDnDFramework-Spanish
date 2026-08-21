import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { clearExtensionLocalStorageUiState } from '../src/state/defaults.js';
import { configureRuntimeActions } from '../src/app/runtime-bridge.js';
import {
    MAIN_SYSPROMPT_BACKUP_KEY,
    captureMainSyspromptBackup,
    getEffectiveBackupText,
    getLiveMainSyspromptText,
    hydrateMainSyspromptBackup,
    looksLikeFrameworkSysprompt,
    maybeRestoreMainIfTrackerDisabled,
    pickPreferredBackupText,
    readDurableMainSyspromptBackup,
    restoreMainSyspromptStash,
    setLiveMainSyspromptText,
    shouldReplaceBackup,
    writeDurableMainSyspromptBackup,
} from '../src/state/main-sysprompt-backup.js';

const USER_PROMPT = 'Write {{char}} next reply in a fictional roleplay.';
const FRAMEWORK_PROMPT = `<role>
DM/World Simulator for a D&D-style TTRPG. Narrate the world.
</role>
<rng_system>
- [RNG_QUEUE v7.0] is the sole RNG mechanic
</rng_system>`;

function installHost({ textareaValue = null, mainContent = '', saveCalls } = {}) {
    const ta = textareaValue == null
        ? null
        : {
            value: textareaValue,
            dispatchEvent() {},
        };
    globalThis.document = {
        getElementById(id) {
            return id === 'main_prompt_quick_edit_textarea' ? ta : null;
        },
    };
    const oai = {
        prompts: [{ identifier: 'main', content: mainContent }],
        main_prompt: mainContent,
    };
    const previous = globalThis.SillyTavern.getContext;
    globalThis.SillyTavern.getContext = () => ({
        ...previous(),
        chatCompletionSettings: oai,
        saveSettingsDebounced: () => {
            if (saveCalls) saveCalls.push(oai.prompts[0].content);
        },
    });
    return { ta, oai };
}

const originalGetContext = globalThis.SillyTavern.getContext;

describe('main sysprompt backup', () => {
    beforeEach(() => {
        localStorage.clear();
        configureRuntimeActions({ saveSettings: () => {} });
        globalThis.SillyTavern.getContext = originalGetContext;
        installHost({ textareaValue: '', mainContent: '' });
    });

    it('prefers Prompt Manager content over an unhydrated empty textarea', () => {
        installHost({ textareaValue: '', mainContent: USER_PROMPT });
        expect(getLiveMainSyspromptText()).toBe(USER_PROMPT);
    });

    it('never writes an empty string over a durable non-empty backup', () => {
        writeDurableMainSyspromptBackup(USER_PROMPT);
        writeDurableMainSyspromptBackup('');
        expect(readDurableMainSyspromptBackup()?.text).toBe(USER_PROMPT);
    });

    it('heals empty settings from localStorage after a cancelled disk save', () => {
        writeDurableMainSyspromptBackup(USER_PROMPT);
        const settings = { stashedMainSysprompt: '', syspromptStashArmed: false };
        expect(hydrateMainSyspromptBackup(settings)).toBe(true);
        expect(settings.stashedMainSysprompt).toBe(USER_PROMPT);
        expect(settings.syspromptStashArmed).toBe(true);
        expect(getEffectiveBackupText(settings)).toBe(USER_PROMPT);
    });

    it('does not replace a user backup with the framework narrator prompt', () => {
        expect(shouldReplaceBackup(USER_PROMPT, FRAMEWORK_PROMPT, {
            builtFrameworkText: FRAMEWORK_PROMPT,
        })).toBe(false);
        expect(shouldReplaceBackup(USER_PROMPT, FRAMEWORK_PROMPT, {
            manual: true,
            builtFrameworkText: FRAMEWORK_PROMPT,
        })).toBe(false);
        expect(looksLikeFrameworkSysprompt(FRAMEWORK_PROMPT, FRAMEWORK_PROMPT)).toBe(true);
    });

    it('captures live Main before overwrite and keeps it when re-enabled on the framework prompt', () => {
        installHost({ textareaValue: '', mainContent: USER_PROMPT });
        const settings = {
            enabled: true,
            customSysprompt: false,
            mainSyspromptBackupEnabled: true,
            stashedMainSysprompt: '',
            syspromptStashArmed: false,
        };

        const first = captureMainSyspromptBackup(settings, { builtFrameworkText: FRAMEWORK_PROMPT });
        expect(first).toMatchObject({ ok: true, changed: true, reason: 'captured' });
        expect(settings.stashedMainSysprompt).toBe(USER_PROMPT);
        expect(readDurableMainSyspromptBackup()?.text).toBe(USER_PROMPT);

        installHost({ textareaValue: FRAMEWORK_PROMPT, mainContent: FRAMEWORK_PROMPT });
        const second = captureMainSyspromptBackup(settings, { builtFrameworkText: FRAMEWORK_PROMPT });
        expect(second.changed).toBe(false);
        expect(settings.stashedMainSysprompt).toBe(USER_PROMPT);
        expect(readDurableMainSyspromptBackup()?.text).toBe(USER_PROMPT);
    });

    it('defers capture when Prompt Manager has not loaded yet and no backup exists', () => {
        globalThis.document = { getElementById: () => null };
        globalThis.SillyTavern.getContext = () => ({
            extensionSettings: {},
            chatId: 'vitest-chat',
            saveSettingsDebounced() {},
        });
        const settings = {
            enabled: true,
            customSysprompt: false,
            mainSyspromptBackupEnabled: true,
            stashedMainSysprompt: '',
        };
        const result = captureMainSyspromptBackup(settings);
        expect(result.shouldDefer).toBe(true);
        expect(result.ok).toBe(false);
    });

    it('restores through Prompt Manager when the Quick Prompt textarea is missing', () => {
        const saveCalls = [];
        installHost({ textareaValue: null, mainContent: FRAMEWORK_PROMPT, saveCalls });
        const settings = {
            enabled: false,
            customSysprompt: false,
            mainSyspromptBackupEnabled: true,
            stashedMainSysprompt: USER_PROMPT,
            syspromptStashArmed: true,
        };
        writeDurableMainSyspromptBackup(USER_PROMPT);

        expect(restoreMainSyspromptStash(settings)).toBe(true);
        const ctx = globalThis.SillyTavern.getContext();
        expect(ctx.chatCompletionSettings.prompts[0].content).toBe(USER_PROMPT);
        expect(settings.syspromptStashArmed).toBe(true);
        expect(readDurableMainSyspromptBackup()?.text).toBe(USER_PROMPT);
    });

    it('puts the backup back when the tracker is off but Main still has the framework prompt', () => {
        installHost({ textareaValue: FRAMEWORK_PROMPT, mainContent: FRAMEWORK_PROMPT });
        const settings = {
            enabled: false,
            customSysprompt: false,
            mainSyspromptBackupEnabled: true,
            stashedMainSysprompt: USER_PROMPT,
        };
        writeDurableMainSyspromptBackup(USER_PROMPT);
        expect(maybeRestoreMainIfTrackerDisabled(settings)).toBe(true);
        expect(getLiveMainSyspromptText()).toBe(USER_PROMPT);
    });

    it('refuses to save an empty Main over an existing backup', () => {
        installHost({ textareaValue: '', mainContent: '' });
        const settings = {
            enabled: true,
            customSysprompt: false,
            mainSyspromptBackupEnabled: true,
            stashedMainSysprompt: USER_PROMPT,
            syspromptStashArmed: true,
        };
        writeDurableMainSyspromptBackup(USER_PROMPT);
        const result = captureMainSyspromptBackup(settings, { manual: true });
        expect(result).toMatchObject({ ok: false, reason: 'empty' });
        expect(getEffectiveBackupText(settings)).toBe(USER_PROMPT);
    });

    it('writes Main even when only Prompt Manager is available', () => {
        const saveCalls = [];
        installHost({ textareaValue: null, mainContent: USER_PROMPT, saveCalls });
        configureRuntimeActions({
            saveSettings: () => saveCalls.push(globalThis.SillyTavern.getContext().chatCompletionSettings.prompts[0].content),
        });
        expect(setLiveMainSyspromptText(FRAMEWORK_PROMPT)).toBe(true);
        expect(globalThis.SillyTavern.getContext().chatCompletionSettings.prompts[0].content).toBe(FRAMEWORK_PROMPT);
        expect(saveCalls).toEqual([FRAMEWORK_PROMPT]);
    });

    it('prefers a non-framework localStorage copy over a framework-shaped settings copy', () => {
        const picked = pickPreferredBackupText(FRAMEWORK_PROMPT, { ts: 1, text: USER_PROMPT });
        expect(picked).toBe(USER_PROMPT);
    });

    it('prefers a newer shorter user backup over an older longer copy', () => {
        const picked = pickPreferredBackupText('old longer original prompt text', { ts: 50, text: 'newer' }, 10);
        expect(picked).toBe('newer');
    });

    it('does not delete the Main backup during factory-reset UI localStorage wipe', () => {
        writeDurableMainSyspromptBackup(USER_PROMPT);
        localStorage.setItem('rpg_tracker_collapsed', 'true');
        clearExtensionLocalStorageUiState();
        expect(localStorage.getItem('rpg_tracker_collapsed')).toBeNull();
        expect(readDurableMainSyspromptBackup()?.text).toBe(USER_PROMPT);
        expect(localStorage.getItem(MAIN_SYSPROMPT_BACKUP_KEY)).toBeTruthy();
    });

    it('captures the backup in autoApply before writing the framework prompt', () => {
        const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
        const captureAt = src.indexOf('captureMainSyspromptBackup(s, { builtFrameworkText: built })');
        const writeAt = src.indexOf('setLiveMainSyspromptText(built)');
        expect(captureAt).toBeGreaterThan(0);
        expect(writeAt).toBeGreaterThan(captureAt);
    });
});
