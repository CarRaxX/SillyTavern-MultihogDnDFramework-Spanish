import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// AC5 (spec 2026-11-08, ola 5): lo que la interfaz promete tiene que estar
// documentado en español en el manual de la extensión, y el Changelog tiene que
// contar la ola. Este test es el candado: si alguien renombra una clave o borra
// la sección, la documentación miente y la suite lo grita.

const doc = readFileSync(new URL('../docs/multihogDnDdoc.es.md', import.meta.url), 'utf8');
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');

describe('AC5: el manual documenta los mandos, la matriz y los límites', () => {
    it('existe la sección «Mandos y perfiles de rendimiento»', () => {
        expect(doc).toContain('## Mandos y perfiles de rendimiento');
    });

    it.each([
        'agenteRetriesExtra',
        'jsonCorrectionRetriesExtra',
        'rpgAuditChunkBuffer',
        'rpgOutputCapStateTracker',
        'rpgOutputCapWorldProgression',
        'rpgOutputCapMapEvolutionCompress',
        'fullReviewSystemPromptOverride',
        'fullReviewUserPromptSuffixOverride',
        'rpgPerfProfile',
    ])('el manual nombra la clave %s', (clave) => {
        expect(doc).toContain(clave);
    });

    it('el manual fija los límites reales (no promesas)', () => {
        expect(doc).toContain('256-8000');
        expect(doc).toContain('≤ 12');
        expect(doc).toContain('8192');
        expect(doc).toContain('20.000');
    });

    it('el manual dice la verdad del `0` y de los reintentos', () => {
        expect(doc).toMatch(/`0` = auto/);
        expect(doc).toMatch(/añaden llamadas, \*\*nunca vueltas\*\*/);
    });

    it('el Changelog cuenta la ola 5 con sus claves', () => {
        expect(changelog).toMatch(/ola 5/i);
        for (const clave of ['agenteRetriesExtra', 'rpgOutputCapStateTracker', 'fullReviewSystemPromptOverride', 'rpgPerfProfile']) {
            expect(changelog, clave).toContain(clave);
        }
        expect(changelog).toContain('PERF_PROFILE');
    });
});
