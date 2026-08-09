import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const stubMarkup = readFileSync(new URL('../settings-stub.html', import.meta.url), 'utf8');
const overlaySource = readFileSync(new URL('../src/ui/settings-overlay.js', import.meta.url), 'utf8');
const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

describe('settings overlay', () => {
    it('ships a stub entry point for the extensions drawer', () => {
        expect(stubMarkup).toContain('class="rpg-tracker-settings-stub"');
        expect(stubMarkup).toContain('id="rpg_tracker_open_settings"');
        expect(stubMarkup).toContain('Open Settings');
    });

    it('implements a floating external window rather than a fullscreen takeover', () => {
        expect(style).toContain('.rt-settings-overlay');
        expect(style).toContain('.rt-so-panel');
        expect(style).toContain('width: min(1176px, calc(100vw - 16px))');
        expect(style).toContain('height: min(984px, 94vh)');
        expect(style).toContain('height: min(984px, 94dvh)');
        expect(style).toContain('position: fixed !important');
        expect(style).toContain('env(safe-area-inset-top');
        expect(overlaySource).toContain('installPanelDrag');
        expect(overlaySource).toContain('resetSettingsPanelGeometry');
        expect(overlaySource).toContain('isCompactSettingsViewport');
        expect(overlaySource).toContain('centered panel rather than a literal fullscreen');
    });

    it('locks Dark/Light settings chrome with a General-tab toggle', () => {
        expect(overlaySource).toContain('installAppearanceToggle');
        expect(overlaySource).toContain('settingsOverlayAppearance');
        expect(overlaySource).toContain('rt-so-mode-dark');
        expect(overlaySource).toContain('rt-so-mode-light');
        expect(style).toContain('.rt-settings-overlay.rt-so-mode-light .rt-so-panel');
        expect(style).toContain('.rt-so-appearance-bar');
        expect(style).toContain('--rt-so-fg:');
        expect(style).toContain('Lift the floor');
        const defaults = readFileSync(new URL('../src/state/defaults.js', import.meta.url), 'utf8');
        expect(defaults).toContain("settingsOverlayAppearance: 'light'");
    });

    it('maps Multihog primary sections to left-rail tabs and wires init before bindings', () => {
        [
            "id: 'general'",
            "id: 'connections'",
            "id: 'gamesystems'",
            "id: 'statetracker'",
            "id: 'agent'",
            "id: 'worldprog'",
            "id: 'companion'",
        ].forEach((fragment) => expect(overlaySource).toContain(fragment));

        expect(indexSource).toContain('initSettingsOverlay(settingsHtml');
        expect(indexSource).toContain("settings-stub");
        expect(indexSource).toContain("openSettingsOverlay('connections')");
        expect(indexSource).toContain('#rpg_tracker_open_settings');
    });

    it('scopes drawer-toggle delegation so checkbox clicks are not swallowed', () => {
        expect(indexSource).toContain('#rt-settings-overlay .rpg-tracker-settings .inline-drawer-toggle');
        expect(indexSource).toContain('.rpg-tracker-settings-stub .inline-drawer-toggle');
        // Guard against the broken comma-concat form that matched the whole settings root.
        expect(indexSource).not.toContain('settingsDrawerRoot} .inline-drawer-toggle');
        expect(indexSource).toContain("closest('input, select, textarea, button, a, label.checkbox_label')");
    });
});
