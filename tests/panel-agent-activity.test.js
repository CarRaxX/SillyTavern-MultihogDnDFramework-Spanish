import { afterEach, describe, expect, it, vi } from 'vitest';
import { wireAgentActivity } from '../src/ui/panel/panel-agent-activity.js';

afterEach(() => {
    delete globalThis.document;
    delete globalThis.toastr;
});

describe('Agent activity controls', () => {
    it('wires lifecycle listeners even when optional Agent controls are absent', () => {
        const addEventListener = vi.fn();
        globalThis.document = { addEventListener };

        const activity = wireAgentActivity({
            agentPanel: { querySelector: () => null },
            getRouterTick: () => 0,
            getSettings: () => ({}),
            reapplyRouterPass: vi.fn(),
            refreshManifest: vi.fn(),
            rollbackRouterPass: vi.fn(),
            saveSettings: vi.fn(),
        });

        expect(typeof activity.syncAgentNav).toBe('function');
        expect(typeof activity.syncLastRunDisplay).toBe('function');
        expect(addEventListener).toHaveBeenCalledWith('rt_lore_agent_updated', expect.any(Function));
        expect(addEventListener).toHaveBeenCalledWith('rt_generation_tick', expect.any(Function));
    });

    it('captures the complete live state before undoing an empty first-pass baseline', async () => {
        const handlers = {};
        const back = {
            disabled: false,
            addEventListener: (name, handler) => { handlers[name] = handler; },
        };
        const forward = { disabled: false, addEventListener: vi.fn() };
        const history = [{ bookSnapshots: {}, campaignBookNames: [] }];
        const captureRouterLoreState = vi.fn().mockResolvedValue({
            campaignBookNames: ['Campaign_NPCs'],
            bookSnapshots: { Campaign_NPCs: { entries: { 0: { content: 'Initial world' } } } },
        });
        const rollbackRouterPass = vi.fn().mockResolvedValue(true);
        const refreshManifest = vi.fn().mockResolvedValue(undefined);
        globalThis.document = { addEventListener: vi.fn() };
        globalThis.toastr = { error: vi.fn() };

        wireAgentActivity({
            agentPanel: {
                querySelector: selector => selector === '#rt-agent-nav-back'
                    ? back
                    : selector === '#rt-agent-nav-fwd' ? forward : null,
            },
            captureRouterLoreState,
            getRouterTick: () => 0,
            getSettings: () => ({ routerHistory: history }),
            reapplyRouterPass: vi.fn(),
            refreshManifest,
            rollbackRouterPass,
            saveSettings: vi.fn(),
        });

        await handlers.click();

        expect(captureRouterLoreState).toHaveBeenCalledOnce();
        expect(rollbackRouterPass).toHaveBeenCalledWith(0, expect.objectContaining({
            campaignBookNames: ['Campaign_NPCs'],
        }));
        expect(refreshManifest).toHaveBeenCalledWith('rollback');
    });
});
