import { createContext, runInContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAst } from 'rollup/parseAst';
import {
    buildBundledPromptsDigest,
    diffBundledPromptsDigests,
    getLivePromptCategoryBlocks,
    getPromptCategoryImpactBadge,
    getPromptDigestElementBadge,
    getSnapshotCategoryBlocks,
    isBundledPromptsDigest,
    parsePromptDigestElementKey,
    PROMPT_DEFAULTS_CATEGORY_LABELS,
    PROMPT_DEFAULTS_CATEGORY_LABELS_ES,
    PROMPT_DEFAULTS_CATEGORIES,
    PROMPT_DIGEST_BADGE_LABELS_ES,
    promptDigestElementKey,
} from '../src/state/factory-and-diff.js';
import { fingerprintText } from '../src/state/content-fingerprint.js';
import { escapeHtml } from '../memo-processor.js';
import { diffHasChanges, diffTextLines } from '../prompt-diff.js';

// El diálogo «Qué cambió» de index.js (spec 2026-11-05, T9): sobre digest ya no
// hay texto íntegro en disco, así que se listan elementos por etiqueta e insignia
// calculada comparando huellas.
const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
function extractFunction(name) {
    let encontrado = null;
    const visitar = nodo => {
        if (!nodo || typeof nodo !== 'object' || encontrado) return;
        if (nodo.type === 'FunctionDeclaration' && nodo.id?.name === name) {
            encontrado = indexSource.slice(nodo.start, nodo.end);
            return;
        }
        for (const valor of Object.values(nodo)) {
            if (Array.isArray(valor)) valor.forEach(visitar);
            else if (valor && typeof valor === 'object') visitar(valor);
        }
    };
    visitar(parseAst(indexSource));
    if (!encontrado) throw new Error(`Falta la función ${name} en index.js`);
    return encontrado;
}

function contexto() {
    const context = createContext({
        PROMPT_DEFAULTS_CATEGORIES, PROMPT_DEFAULTS_CATEGORY_LABELS, PROMPT_DEFAULTS_CATEGORY_LABELS_ES,
        PROMPT_DIGEST_BADGE_LABELS_ES, getSnapshotCategoryBlocks, getLivePromptCategoryBlocks,
        getPromptCategoryImpactBadge, buildBundledPromptsDigest, isBundledPromptsDigest,
        diffBundledPromptsDigests, getPromptDigestElementBadge, promptDigestElementKey,
        parsePromptDigestElementKey, fingerprintText, escapeHtml, diffTextLines, diffHasChanges,
        console,
    });
    runInContext([
        'buildLivePromptDigestElements',
        'buildPromptDefaultsDigestSectionHtml',
        'buildPromptDefaultsDiffSectionHtml',
        'getChangedPromptDefaultCategories',
    ].map(extractFunction).join('\n'), context);
    return context;
}

const V1 = () => ({
    sysprompt: { main: 'prompt principal v1', narrativePacingModes: {}, periodicContextInject: 'contrato v1' },
    tracker: { systemPromptTemplate: 'tracker v1', userPromptSuffix: 'sufijo v1', stockPrompts: {} },
    lorebook: { routerSystemPromptTemplate: 'lorebook v1', modules: {} },
    world: { worldProgressionSystemPrompt: 'mundo v1' },
    sections: { npcCoreSections: 'npc v1', pcCoreSections: 'pc v1' },
});
const v2 = cambios => {
    const copia = V1();
    return typeof cambios === 'function' ? cambios(copia) : Object.assign(copia, cambios);
};

const ctx = contexto();

describe('Diálogo «Qué cambió» sobre huellas (index.js)', () => {
    it('sólo marca las categorías cuyos elementos cambiaron de huella', () => {
        const cambiadas = ctx.getChangedPromptDefaultCategories(
            buildBundledPromptsDigest(V1()),
            v2(s => {
                s.sysprompt.main = 'prompt principal v2';
                s.sections.npcCoreSections = 'npc v2';
                return s;
            }),
        );
        expect([...cambiadas].sort()).toEqual(['sections', 'sysprompt']);
    });

    it('no marca nada cuando las huellas coinciden', () => {
        const cambiadas = ctx.getChangedPromptDefaultCategories(
            buildBundledPromptsDigest(V1()), v2({}),
        );
        expect([...cambiadas]).toEqual([]);
    });

    it('sigue comparando texto con un snapshot antigo y sin snapshot', () => {
        const legado = ctx.getChangedPromptDefaultCategories(V1(), v2({ sysprompt: { ...V1().sysprompt, main: 'otro' } }));
        expect(legado.has('sysprompt')).toBe(true);
        const sinBase = ctx.getChangedPromptDefaultCategories(null, V1());
        expect([...sinBase].sort()).toEqual([...PROMPT_DEFAULTS_CATEGORIES].sort());
    });

    it('enumera los elementos por etiqueta sin volcar texto íntegro', () => {
        const html = ctx.buildPromptDefaultsDiffSectionHtml(
            buildBundledPromptsDigest(V1()),
            v2(s => {
                s.sysprompt.main = 'prompt principal v2';
                delete s.sysprompt.periodicContextInject;
                s.sysprompt.narrativePacingModes = { normal: 'ritmo v2' };
                return s;
            }),
            {}, '',
        );
        expect(html).toContain('Qué cambió');
        expect(html).not.toContain('What changed');
        expect(html).toContain('sysprompt.txt');
        expect(html).toContain('modificado');
        expect(html).toContain('nuevo');
        expect(html).toContain('retirado');
        // Nada del contenido de los prompts: sólo etiquetas, estados e insignias.
        expect(html).not.toContain('prompt principal v1');
        expect(html).not.toContain('prompt principal v2');
        expect(html).not.toContain('contrato v1');
        expect(html).toContain(PROMPT_DEFAULTS_CATEGORY_LABELS_ES.sysprompt);
    });

    it('insignia del elemento según la copia viva del usuario', () => {
        const anterior = buildBundledPromptsDigest(V1());
        const nuevo = v2({ sysprompt: { ...V1().sysprompt, main: 'prompt principal v2' } });
        const seccion = main => ctx.buildPromptDefaultsDiffSectionHtml(anterior, nuevo, {}, main);
        expect(seccion('prompt principal v2')).toContain(PROMPT_DIGEST_BADGE_LABELS_ES['matches new']);
        expect(seccion('prompt principal v1')).toContain(PROMPT_DIGEST_BADGE_LABELS_ES['matches old']);
        expect(seccion('texto escrito a mano')).toContain(PROMPT_DIGEST_BADGE_LABELS_ES.customized);
    });

    it('avisa en español cuando no hay cambios de texto', () => {
        const html = ctx.buildPromptDefaultsDiffSectionHtml(
            buildBundledPromptsDigest(V1()), v2({}), {}, '',
        );
        expect(html).toContain('No hay cambios de texto');
    });

    it('conserva el diff línea a línea mientras el valor persistido sea texto', () => {
        const html = ctx.buildPromptDefaultsDiffSectionHtml(
            V1(), v2({ sysprompt: { ...V1().sysprompt, main: 'prompt principal v2\nañadido' } }), {}, '',
        );
        // Ruta antiga: sigue mostrando el cambio de texto con sus marcas.
        expect(html).toContain('prompt principal v2');
        expect(html).toContain('What changed');
    });
});
