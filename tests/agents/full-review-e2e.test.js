import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAst } from 'rollup/parseAst';
import { buildDefaultSettings, FULL_REVIEW_STATE_SYSTEM_PROMPT, FULL_REVIEW_USER_PROMPT_SUFFIX } from '../../src/state/defaults.js';
import { resolveFullReviewPrompt, FULL_REVIEW_OVERRIDE_KEYS } from '../../src/ui/agent-settings-editor.js';

// T10 (spec 2026-11-08, ola 5, D-4/D-5): la Revisión de Estado Completa se
// resuelve UNA vez por pasada con `resolveFullReviewPrompt` (override vacío =
// fábrica byte a byte, AC0) y los cuatro sitios que pintan los cuadros de solo
// lectura muestran lo que DE VERDAD se envía. Un override inválido NO reenvía
// nada: se envía la fábrica y solo se avisa en español.

const indexSource = readFileSync(new URL('../../index.js', import.meta.url), 'utf8');
const indexAst = parseAst(indexSource);

/** Cuerpo de la función declarada `nombre` en index.js. */
function cuerpoFuncion(nombre) {
    let texto = null;
    const visitar = nodo => {
        if (!nodo || typeof nodo !== 'object' || texto) return;
        if (nodo.type === 'FunctionDeclaration' && nodo.id?.name === nombre) {
            texto = indexSource.slice(nodo.start, nodo.end);
            return;
        }
        for (const v of Object.values(nodo)) {
            if (Array.isArray(v)) v.forEach(visitar);
            else if (v && typeof v === 'object') visitar(v);
        }
    };
    visitar(indexAst);
    if (!texto) throw new Error(`Falta la función ${nombre} en index.js`);
    return texto;
}

describe('runStateModelPass: el prompt FR se resuelve una vez por pasada (D-4)', () => {
    const cuerpo = cuerpoFuncion('runStateModelPass');

    it('usa resolveFullReviewPrompt y lo envuelve en las dos ramas activas', () => {
        expect(cuerpo).toMatch(/const \w+ = resolveFullReviewPrompt\(settings\);/);
        expect(cuerpo).toMatch(/settings\.fullReviewStateMode \? \w+\.system : settings\.systemPromptTemplate/);
        expect(cuerpo).toMatch(/settings\.fullReviewStateMode\s*\?\s*\w+\.suffix/);
    });

    it('no queda ninguna constante cruda de FR en el pase del modelo', () => {
        expect(cuerpo).not.toContain('FULL_REVIEW_STATE_SYSTEM_PROMPT');
        expect(cuerpo).not.toContain('FULL_REVIEW_USER_PROMPT_SUFFIX');
    });

    it('un override inválido solo produce aviso: cero reenvíos, cero reintento', () => {
        // El aviso sale de los `avisos` de la resolución; en TODO index.js no hay
        // ningún reintento de `sendStateRequest` dentro del pase (una llamada por
        // trozo, como en main): la resolución inválida no añade llamadas.
        expect(cuerpo).toMatch(/\.avisos/);
        const envios = cuerpo.match(/await sendStateRequest\(/g) || [];
        expect(envios).toHaveLength(1);
    });
});

describe('los cuatro sitios de pintado muestran la resolución, no la constante', () => {
    it('ningún sitio pinta ya la constante de fábrica cruda', () => {
        const pintados = indexSource.match(/\.(val|val\()\s*\(?\s*FULL_REVIEW_(STATE_SYSTEM_PROMPT|USER_PROMPT_SUFFIX)\b/g) || [];
        expect(pintados).toHaveLength(0);
        expect(indexSource).not.toMatch(/\.val\(FULL_REVIEW_STATE_SYSTEM_PROMPT\)/);
        expect(indexSource).not.toMatch(/\.val\(FULL_REVIEW_USER_PROMPT_SUFFIX\)/);
    });

    it('los cuatro sitios llaman a resolveFullReviewPrompt antes de pintar', () => {
        const llamadas = indexSource.match(/resolveFullReviewPrompt\(/g) || [];
        // 2 de pintado en handlers + 2 en applyFullReviewUI/sync + 1 en el pase.
        expect(llamadas.length).toBeGreaterThanOrEqual(5);
    });

    it('los cuadros siguen de solo lectura con el modo activo (D-4 intacto)', () => {
        expect(indexSource).toContain("$('#rpg_tracker_core_prompt').val(revisionPintada.system).prop('disabled', true)");
        expect(indexSource).toContain("$('#rpg_tracker_user_prompt_suffix').val(revisionPintada.suffix).prop('disabled', true)");
        expect(indexSource).toContain("corePromptTextarea.prop('disabled', enabled)");
        expect(indexSource).toContain("suffixPromptTextarea.prop('disabled', enabled)");
    });

    it('ningún handler nuevo escribe en los textarea de solo lectura', () => {
        // D-4: los `input` originales de rpg_tracker_core_prompt/user_prompt_suffix
        // siguen siendo EXACTAMENTE dos (index.js:10172/10178 sobre main).
        const escritorCore = indexSource.match(/#rpg_tracker_core_prompt'?\)[\s\S]{0,120}?\.on\('input'/g) || [];
        expect(escritorCore.length).toBeLessThanOrEqual(1);
    });
});

describe('resolución real: fábrica, override válido e inválido', () => {
    it('sin override la resolución es la fábrica byte a byte (AC0)', () => {
        const res = resolveFullReviewPrompt(buildDefaultSettings());
        expect(res.system).toBe(FULL_REVIEW_STATE_SYSTEM_PROMPT);
        expect(res.suffix).toBe(FULL_REVIEW_USER_PROMPT_SUFFIX);
        expect(res.systemEsFabrica && res.suffixEsFabrica).toBe(true);
        expect(res.avisos).toHaveLength(0);
    });

    it('el system enviado con override respeta el techo de D-5 (no desborda el slot)', () => {
        const desbordado = `{{modulesText}} [TAG][/TAG] REMOVED ${'x'.repeat(200000)}`;
        const ajustes = { [FULL_REVIEW_OVERRIDE_KEYS.system]: desbordado };
        const res = resolveFullReviewPrompt(ajustes);
        expect(res.system).toBe(FULL_REVIEW_STATE_SYSTEM_PROMPT);
        expect(res.avisos.join(' ')).toContain('fábrica');
    });

    it('override válido manda sobre la fábrica en las dos claves', () => {
        const ajustes = {
            [FULL_REVIEW_OVERRIDE_KEYS.system]: 'REVISIÓN PROPIA {{modulesText}} [TAG][/TAG] REMOVED',
            [FULL_REVIEW_OVERRIDE_KEYS.suffix]: 'SUFIJO PROPIO {{char}} {{user}}',
        };
        const res = resolveFullReviewPrompt(ajustes);
        expect(res.system).toBe('REVISIÓN PROPIA {{modulesText}} [TAG][/TAG] REMOVED');
        expect(res.suffix).toBe('SUFIJO PROPIO {{char}} {{user}}');
        expect(res.avisos).toHaveLength(0);
    });
});
