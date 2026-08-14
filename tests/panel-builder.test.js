import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    createPanel,
    resolveInitialPanelContentMode,
    resolveModeAfterAgentAttach,
} from '../src/ui/panel/panel-builder.js';
import { runtimeState } from '../src/app/runtime-state.js';

describe('panel builder', () => {
    it('loads independently from the application entry point', () => {
        expect(typeof createPanel).toBe('function');
        expect(runtimeState).toMatchObject({
            currentChatId: null,
            historyViewIndex: -1,
            renderedViewActive: false,
        });
    });

    it('restores the tracker pane when the agent is attached during CHAT', () => {
        expect(resolveModeAfterAgentAttach(true, 'agent')).toBe('tracker');
        expect(resolveModeAfterAgentAttach(false, 'agent')).toBe('agent');
        expect(resolveModeAfterAgentAttach(false, 'tracker')).toBe('tracker');
    });

    it('always opens a rebuilt UI on State Tracker regardless of the saved tab', () => {
        expect(resolveInitialPanelContentMode('agent')).toBe('tracker');
        expect(resolveInitialPanelContentMode('tracker')).toBe('tracker');
        expect(resolveInitialPanelContentMode(undefined)).toBe('tracker');
    });

    it('shows a private-map viewer button on mapped Lorebook Agent locations', () => {
        const source = readFileSync(new URL('../src/ui/panel/panel-builder.js', import.meta.url), 'utf8');
        expect(source).toContain('node.item.has_dungeon_map');
        expect(source).toContain('rt-dungeon-map-badge');
        expect(source).toContain('View private dungeon map (alpha) attached to this root Location');
        expect(source).toContain('openDungeonMapPopup');
        expect(source).toContain('renderDungeonMapReadableHtml');
        expect(source).toContain('data-map-view="readable"');
        expect(source).toContain('data-map-view="raw"');
        expect(source).toContain('Raw JSON');
        expect(source).toContain('stripDungeonMapSection(item.content');
    });
});
