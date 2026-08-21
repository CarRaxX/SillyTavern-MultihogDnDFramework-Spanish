import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { captureXpGainAnimationState, formatAnimatedXpValue, getXpGainTransition } from '../src/ui/panel/xp-gain-animation.js';

const snapshot = (current, max = 2700, level = '3', showAsPercentage = false) => ({
    current,
    max,
    level,
    showAsPercentage,
});

describe('XP gain animation', () => {
    it('calculates a same-level XP gain from the previous rendered value', () => {
        expect(getXpGainTransition(snapshot(1200), snapshot(1500))).toEqual({
            gained: 300,
            fromPct: (1200 / 2700) * 100,
            toPct: (1500 / 2700) * 100,
        });
    });

    it('does not animate initial loads, losses, level-ups, or threshold changes', () => {
        expect(getXpGainTransition(null, snapshot(1200))).toBeNull();
        expect(getXpGainTransition(snapshot(1200), snapshot(1100))).toBeNull();
        expect(getXpGainTransition(snapshot(2600), snapshot(0, 6500, '4'))).toBeNull();
        expect(getXpGainTransition(snapshot(1200), snapshot(1500, 6500))).toBeNull();
    });

    it('formats both numeric and percentage labels during the trickle', () => {
        expect(formatAnimatedXpValue(1500, 2700, false)).toBe('1,500');
        expect(formatAnimatedXpValue(1500, 2700, true)).toBe('56');
    });

    it('renders machine-readable XP values and wires animation into refreshes', () => {
        const renderer = readFileSync(new URL('../renderer.js', import.meta.url), 'utf8');
        const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
        const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

        expect(renderer).toContain('data-xp-current="${cur}"');
        expect(renderer.match(/data-xp-current="\$\{cur\}"/g)).toHaveLength(3);
        expect(renderer).toContain('class="rt-xp-current"');
        expect(index).toContain('captureXpGainAnimationState(xpAnimationHost, xpAnimationContext)');
        expect(index).toContain('playXpGainAnimation(xpAnimationHost, capturedXp, xpAnimationContext)');
        expect(index).toContain('renderBottomXpBar(displayMemo)');
        expect(styles).toContain('.rt-bottom-xp-content .rt-xp-gain-floater');
        expect(styles).toContain('@keyframes rt-xp-bottom-gain-fade');
        expect(styles).toContain('#rt-bottom-xp-bar .rt-xp-bar-wrap[data-recolor-id]');
        expect(styles).toContain('color: #29b6ff;');
        expect(styles).toContain('0 0 7px rgba(0, 180, 255, 0.65)');
        expect(styles).toContain('var(--rt-xp-trickle-duration, 2640ms)');
    });

    it('preserves the visible XP amount across repeated tracker renders', () => {
        const NativeHTMLElement = globalThis.HTMLElement;
        class FakeHTMLElement {
            constructor(dataset = {}) {
                this.dataset = dataset;
                this.row = null;
            }
            querySelector() {
                return this.row;
            }
        }
        globalThis.HTMLElement = FakeHTMLElement;

        try {
            const row = new FakeHTMLElement({
                xpCurrent: '1500',
                xpVisibleCurrent: '1240',
                xpMax: '2700',
                xpLevel: '3',
                xpShowPercentage: 'false',
            });
            const container = new FakeHTMLElement({ rtXpAnimationContext: 'chat::live' });
            container.row = row;

            expect(captureXpGainAnimationState(container, 'chat::live')).toEqual({
                contextMatches: true,
                previous: {
                    current: 1240,
                    max: 2700,
                    level: '3',
                    showAsPercentage: false,
                },
            });
        } finally {
            if (NativeHTMLElement === undefined) delete globalThis.HTMLElement;
            else globalThis.HTMLElement = NativeHTMLElement;
        }
    });
});
