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
        expect(source).toContain('revealAll: true');
        expect(source).toContain('data-map-view="readable"');
        expect(source).toContain('data-map-view="raw"');
        expect(source).toContain('Raw JSON');
        expect(source).toContain('stripDungeonMapSection(item.content');
    });

    it('probes the mapped site on first panel build so Visuals/Map does not wait for a settings toggle', () => {
        const source = readFileSync(new URL('../src/ui/panel/panel-builder.js', import.meta.url), 'utf8');
        expect(source).toContain('dungeonRealityEnabled || !s.locationImages || s.agentImmersionMode');
        expect(source).toContain('void runtimeState.refreshImmersionView()');
        expect(source).toContain('void Promise.resolve(refreshManifest()).then(() => {');
        const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
        expect(indexSource).toContain('Still probe the mapped site so Visuals/Map is ready on first open.');
        expect(indexSource).toContain('applyDungeonMapForHistoryView');
        expect(indexSource).toContain('captureActiveDungeonMapHistory');
    });

    it('opens a knowledge-filtered site inspector from Visuals/Map', () => {
        const source = readFileSync(new URL('../src/ui/panel/dungeon-map-panel.js', import.meta.url), 'utf8');
        expect(source).toContain('bindDungeonMapPan');
        expect(source).toContain('openDungeonMapReadablePopup');
        expect(source).toContain('Reveal all');
        expect(source).toContain('playerFacing: true');
        expect(source).toContain('dataset.didPan');
        expect(source).toContain('rt-dungeon-map-details');
    });

    it('expands Run Research Now into Lorebook Agent and Map Updater', () => {
        const source = readFileSync(new URL('../src/ui/panel/panel-builder.js', import.meta.url), 'utf8');
        expect(source).toContain('runMapUpdaterPass({ isManual: true, lookback: s.routerLookback || 4 })');
        expect(source).toContain('rt-research-lorebook');
        expect(source).toContain('rt-research-map-updater');
        expect(source).toContain("toastr['info']('Starting Lorebook Agent pass...')");
        expect(source).toContain("toastr['info']('Starting Map Updater pass...')");
    });

    it('shares Stop and Lorebook Terminal with Map Updater without NPC auto-portraits', () => {
        const source = readFileSync(new URL('../src/ui/panel/panel-builder.js', import.meta.url), 'utf8');
        const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
        expect(source).toContain('stopRouterPass()');
        expect(source).toContain('stopMapUpdaterPass()');
        expect(source).toContain("skipped === 'stopped'");
        expect(source).toContain("toastr['info']('Stopped.', 'Map Updater')");
        expect(source).toContain("step.metadata?.source !== 'map_updater'");
        expect(source).toContain('checkAndTriggerAutoGenerations(refreshAll)');
        expect(indexSource).toContain("stopBtn.style.display = busy ? 'flex' : 'none'");
        expect(indexSource).toContain('const busy = !!running || isMapUpdaterRunning()');
        expect(indexSource).toContain('stopMapUpdaterPass');
    });
});
