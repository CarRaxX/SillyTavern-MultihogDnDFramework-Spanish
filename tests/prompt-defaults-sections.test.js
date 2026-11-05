import { describe, expect, it } from 'vitest';
import {
    buildBundledPromptsDigest,
    buildBundledPromptsSnapshot,
    diffBundledPromptsDigests,
    formatCoreSectionsSnapshot,
    getLivePromptCategoryBlocks,
    getPromptDigestElementBadge,
    getSnapshotCategoryBlocks,
    isBundledPromptsDigest,
    PROMPT_DEFAULTS_CATEGORY_LABELS,
    PROMPT_DEFAULTS_CATEGORY_LABELS_ES,
    PROMPT_DEFAULTS_CATEGORIES,
    PROMPT_DIGEST_BADGE_LABELS_ES,
    resolveCoreSections,
} from '../src/state/factory-and-diff.js';
import { fingerprintText } from '../src/state/content-fingerprint.js';
import { DEFAULT_NPC_SECTIONS, DEFAULT_PC_SECTIONS } from '../src/state/schema-sections.js';

describe('prompt-defaults Character Sheets category', () => {
    it('includes sections in PROMPT_DEFAULTS_CATEGORIES', () => {
        expect(PROMPT_DEFAULTS_CATEGORIES).toContain('sections');
    });

    it('ships Species/Body/Worn Equipment in the bundled sections snapshot', () => {
        const snap = buildBundledPromptsSnapshot();
        expect(snap.sections?.pcCoreSections).toMatch(/name:\s*(?:Species|Especie)/);
        expect(snap.sections?.pcCoreSections).toMatch(/name:\s*(?:Body|Cuerpo)/);
        expect(snap.sections?.pcCoreSections).toMatch(/name:\s*(?:Worn Equipment|Equipo Equipado)/);
        expect(snap.sections?.npcCoreSections).toMatch(/name:\s*(?:Species|Especie)/);
        expect(snap.sections?.npcCoreSections).toMatch(/name:\s*(?:Body|Cuerpo)/);
        expect(snap.sections?.npcCoreSections).toMatch(/name:\s*(?:Worn Equipment|Equipo Equipado)/);
        expect(snap.sections?.pcCoreSections).not.toContain('name: Appearance/Species');
        expect(snap.sections?.npcCoreSections).not.toContain('name: Appearance/Species');
    });

    it('fingerprints runtime narrative pacing tags, CYOA builder, and inject contract', () => {
        const snap = buildBundledPromptsSnapshot();
        expect(snap.sysprompt?.narrativePacingModes?.high_agency).toContain('<high_agency_mode_on>');
        expect(snap.sysprompt?.narrativePacingModes?.shorter_outputs).toContain('<output_length>');
        expect(snap.sysprompt?.narrativePacingModes?.downtime).toContain('<slice_of_life_mode_on>');
        expect(snap.sysprompt?.cyoaModeBlock).toContain('<CYOA_mode>');
        expect(snap.sysprompt?.cyoaModeBlock).not.toContain('USER-DEFINED: Use the exact complete choice text');
        expect(snap.sysprompt?.periodicContextInject).toContain('everyTurn: true');
        expect(snap.sysprompt?.periodicContextInject).toContain('CYOA_mode');
        const blocks = getSnapshotCategoryBlocks(snap, 'sysprompt');
        expect(blocks.some(b => b.label === 'narrative pacing: high_agency')).toBe(true);
        expect(blocks.some(b => b.label === 'CYOA mode (injected builder)')).toBe(true);
        expect(blocks.some(b => b.label === 'context inject contract (CYOA + pacing)')).toBe(true);
    });

    it('treats empty stored sections as matching shipped defaults for live impact badges', () => {
        const snap = buildBundledPromptsSnapshot();
        const live = getLivePromptCategoryBlocks({ npcCoreSections: [], pcCoreSections: [] }, 'sections');
        const shipped = getSnapshotCategoryBlocks(snap, 'sections');
        expect(live).toEqual(shipped);
    });

    it('resolveCoreSections falls back to defaults for empty arrays', () => {
        expect(resolveCoreSections([], DEFAULT_PC_SECTIONS)).toBe(DEFAULT_PC_SECTIONS);
        expect(resolveCoreSections(DEFAULT_PC_SECTIONS, DEFAULT_PC_SECTIONS)).toBe(DEFAULT_PC_SECTIONS);
    });

    it('formatCoreSectionsSnapshot is stable and includes descriptions', () => {
        const text = formatCoreSectionsSnapshot(DEFAULT_PC_SECTIONS);
        expect(text).toContain('id: sec_body');
        expect(text).toMatch(/(?:Do NOT describe clothing, armor, or worn gear here|NO describas ropa, armadura o equipo llevado aquí)/);
        expect(text.split('---').length).toBeGreaterThan(1);
    });
});

// Spec 2026-11-05 (D3/T8): el blob guarda una huella por elemento, no el texto
// íntegro de los defaults enviados (~205 KB).
describe('Digest de defaults enviados (huella por elemento)', () => {
    const V1 = {
        sysprompt: { main: 'prompt principal v1', legacy: '', narrativePacingModes: {}, periodicContextInject: 'contrato v1' },
        tracker: { systemPromptTemplate: 'tracker v1', userPromptSuffix: 'sufijo v1', stockPrompts: { CHARACTER: 'ficha v1' } },
        lorebook: { routerSystemPromptTemplate: 'lorebook v1', modules: { charter: { instruction: 'charter v1', format: 'formato v1' } } },
        world: { worldProgressionSystemPrompt: 'mundo v1' },
        sections: { npcCoreSections: 'npc v1', pcCoreSections: 'pc v1' },
    };
    /** Copia de V1 sobre la que se aplican los cambios indicados. */
    const v2 = cambios => {
        const copia = JSON.parse(JSON.stringify(V1));
        return typeof cambios === 'function' ? cambios(copia) : Object.assign(copia, cambios);
    };

    it('serializa una huella por elemento con forma `categoria|etiqueta`', () => {
        const digest = buildBundledPromptsDigest(V1);
        expect(digest.v).toBe(2);
        expect(typeof digest.fingerprint).toBe('string');
        expect(digest.elements['sysprompt|sysprompt.txt']).toMatch(/^\d+:[0-9a-f]{16}$/);
        expect(Object.keys(digest.elements)).toContain('lorebook|Module charter instruction');
        expect(Object.keys(digest.elements)).toContain('sections|NPC Core Sections');
        // Ninguna clave repite categoría y ninguna etiqueta viaja con texto.
        expect(Object.values(digest.elements).every(h => String(h).length < 40)).toBe(true);
    });

    it('es determinista y estable entre copias equivalentes', () => {
        expect(buildBundledPromptsDigest(V1)).toEqual(buildBundledPromptsDigest(JSON.parse(JSON.stringify(V1))));
    });

    it('ocupa una fracción mínima del snapshot que sustituye', () => {
        const real = buildBundledPromptsSnapshot();
        const digest = buildBundledPromptsDigest(real);
        const texto = JSON.stringify(real).length;
        const compacto = JSON.stringify(digest).length;
        expect(texto).toBeGreaterThan(100 * 1024);
        expect(compacto / texto).toBeLessThan(0.1);
    });

    it('distingue el digest del snapshot de texto antigo', () => {
        const digest = buildBundledPromptsDigest(V1);
        expect(isBundledPromptsDigest(digest)).toBe(true);
        expect(isBundledPromptsDigest(V1)).toBe(false);
        expect(isBundledPromptsDigest(null)).toBe(false);
        expect(isBundledPromptsDigest({ v: 2 })).toBe(false);
        expect(isBundledPromptsDigest('texto')).toBe(false);
    });

    it('detecta cambios, elementos nuevos y retirados por huella', () => {
        const anterior = buildBundledPromptsDigest(V1);
        const nuevo = buildBundledPromptsDigest(v2(s => {
            s.sysprompt.main = 'prompt principal v2';
            delete s.sysprompt.periodicContextInject;
            s.sysprompt.narrativePacingModes = { normal: 'ritmo v2' };
            return s;
        }));
        const diferencias = diffBundledPromptsDigests(anterior, nuevo);
        expect(diferencias.changed).toEqual(['sysprompt|sysprompt.txt']);
        expect(diferencias.added).toEqual(['sysprompt|narrative pacing: normal']);
        expect(diferencias.removed).toEqual(['sysprompt|context inject contract (CYOA + pacing)']);
        expect(diferencias.categories).toEqual(['sysprompt']);
    });

    it('no inventa diferencias entre dos digest idénticos', () => {
        const a = buildBundledPromptsDigest(V1);
        const b = buildBundledPromptsDigest(v2({}));
        expect(diffBundledPromptsDigests(a, b)).toEqual({ added: [], changed: [], removed: [], categories: [] });
        // Un valor antigo (texto) o ausente se trata como vacío: todo aparece como
        // nuevo y el llamador ofrece todas las categorías, como hacía antes.
        const sinBase = diffBundledPromptsDigests(V1, b);
        expect(sinBase.changed).toEqual([]);
        expect(sinBase.added.length).toBe(Object.keys(b.elements).length);
        expect(sinBase.categories.sort()).toEqual([...PROMPT_DEFAULTS_CATEGORIES].sort());
        expect(diffBundledPromptsDigests(null, null).categories).toEqual([]);
    });

    it('etiqueta el impacto de un elemento comparando sólo huellas', () => {
        const anterior = buildBundledPromptsDigest(V1);
        const nuevo = buildBundledPromptsDigest(v2({ sysprompt: { ...V1.sysprompt, main: 'prompt principal v2' } }));
        const clave = 'sysprompt|sysprompt.txt';
        const vivo = texto => ({ [clave]: fingerprintText(texto) });
        expect(getPromptDigestElementBadge(clave, anterior.elements, nuevo.elements, vivo('prompt principal v2')))
            .toBe('matches new');
        expect(getPromptDigestElementBadge(clave, anterior.elements, nuevo.elements, vivo('prompt principal v1')))
            .toBe('matches old');
        expect(getPromptDigestElementBadge(clave, anterior.elements, nuevo.elements, vivo('texto del usuario')))
            .toBe('customized');
        expect(getPromptDigestElementBadge(clave, anterior.elements, nuevo.elements, {})).toBe('unknown');
    });

    it('da etiquetas en español a categorías e insignias', () => {
        expect(Object.keys(PROMPT_DEFAULTS_CATEGORY_LABELS_ES).sort())
            .toEqual([...PROMPT_DEFAULTS_CATEGORIES].sort());
        for (const cat of PROMPT_DEFAULTS_CATEGORIES) {
            expect(PROMPT_DEFAULTS_CATEGORY_LABELS_ES[cat]).toBeTruthy();
            // No es una copia de la etiqueta inglesa préexistente.
            expect(PROMPT_DEFAULTS_CATEGORY_LABELS_ES[cat]).not.toBe(PROMPT_DEFAULTS_CATEGORY_LABELS[cat]);
        }
        expect(PROMPT_DIGEST_BADGE_LABELS_ES['matches new']).toContain('coincide');
        expect(PROMPT_DIGEST_BADGE_LABELS_ES.customized).toContain('distinta');
    });
});
