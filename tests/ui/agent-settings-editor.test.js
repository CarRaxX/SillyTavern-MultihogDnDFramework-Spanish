import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
    FULL_REVIEW_ALLOWED_PLACEHOLDERS,
    FULL_REVIEW_EDITOR_FIELDS,
    FULL_REVIEW_OVERRIDE_KEYS,
    FULL_REVIEW_REQUIRED_TOKENS,
    FULL_REVIEW_SUFFIX_MAX_CHARS,
    FULL_REVIEW_SYSTEM_TOKEN_CEILING,
    aplicarEdicionFullReview,
    buildFullReviewEditorHtml,
    contadorFullReview,
    listarPlaceholders,
    resolveFullReviewPrompt,
    restaurarFabricaFullReview,
    validarFullReviewCampo,
    validarFullReviewSufijo,
    validarFullReviewSystem,
} from '../../src/ui/agent-settings-editor.js';
import { FULL_REVIEW_STATE_SYSTEM_PROMPT, FULL_REVIEW_USER_PROMPT_SUFFIX } from '../../src/state/defaults.js';

// T5 (spec 2026-11-08, D-4/D-5 y addendum §3): el editor del cajón es un módulo
// puro que fabrica HTML y valida texto. La lista blanca de tokens de máquina se
// RE-DERIVA aquí del parser real (memo-processor.js) y de la fábrica, no copiada
// a mano: si el parser cambia, este test se entera.

const memoSource = readFileSync(new URL('../../memo-processor.js', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('../../src/ui/agent-settings-editor.js', import.meta.url), 'utf8');

/** `tagPattern` de memo-processor.js (línea ~456), re-derivado del fuente. */
const tagPattern = (() => {
    const m = memoSource.match(/const tagPattern = (\/[^\n]+\/[a-z]*);/);
    if (!m) throw new Error('No se encontró tagPattern en memo-processor.js');
    return new RegExp(m[1].slice(1, m[1].lastIndexOf('/')), m[1].slice(m[1].lastIndexOf('/') + 1));
})();

/** Literales de `isRemoval` (memo-processor.js ~495), re-derivados del fuente. */
const literalesRemoval = (() => {
    const m = memoSource.match(/\^\(\?:([A-Z_|]+)\)\$/i);
    if (!m) throw new Error('No se encontró la lista de isRemoval en memo-processor.js');
    return m[1].split('|');
})();

/** Con `g` el `test` es con estado (lastIndex): para probar casos, copia sin `g`. */
const tagPatternPrueba = new RegExp(tagPattern.source, tagPattern.flags.replace('g', ''));

describe('T5: la lista blanca se deriva del parser y de la fábrica (addendum §3)', () => {
    it('tagPattern admite la pareja [TAG]/[/TAG] que el editor exige', () => {
        expect(tagPattern.flags).toContain('g');
        expect(tagPatternPrueba.test('[TAG]x[/TAG]')).toBe(true);
        expect(tagPatternPrueba.test('[COMBAT]x[/COMBAT]')).toBe(true);
        expect(tagPatternPrueba.test('[TAG]x[/OTRA]')).toBe(false);
        expect(FULL_REVIEW_REQUIRED_TOKENS).toContain('[TAG]');
        expect(FULL_REVIEW_REQUIRED_TOKENS).toContain('[/TAG]');
    });

    it('REMOVED es de la lista de isRemoval del parser (los demás no se exigen)', () => {
        expect(literalesRemoval).toContain('REMOVED');
        expect(FULL_REVIEW_REQUIRED_TOKENS).toContain('REMOVED');
        for (const opcional of ['EXPIRED', 'CLEARED', 'NONE', 'END_COMBAT']) {
            expect(literalesRemoval).toContain(opcional);
            expect(FULL_REVIEW_REQUIRED_TOKENS).not.toContain(opcional);
        }
    });

    it('COMBAT/TIME/PARTY/STATUS NO están en la lista: vienen de los módulos dinámicos', () => {
        for (const tag of ['COMBAT', 'TIME', 'PARTY', 'STATUS']) {
            expect(FULL_REVIEW_REQUIRED_TOKENS).not.toContain(`[${tag}]`);
        }
    });

    it('los cuatro placeholders admitidos son los que la ruta sabe sustituir', () => {
        expect(FULL_REVIEW_ALLOWED_PLACEHOLDERS).toEqual(expect.arrayContaining(['{{char}}', '{{user}}', '{{modulesText}}']));
        expect(listarPlaceholders('Hola {{user}} con {{modulesText}} y {{raro}}')).toEqual(['{{user}}', '{{modulesText}}', '{{raro}}']);
    });

    it('el system de fábrica pasa su propio validador (pegable y editable)', () => {
        const v = validarFullReviewSystem(FULL_REVIEW_STATE_SYSTEM_PROMPT);
        expect(v.valido).toBe(true);
        expect(v.motivo).toBe('');
    });
});

describe('T5: validadores de los dos campos (addendum §3)', () => {
    it('vacío = fábrica y es válido (D-4)', () => {
        for (const campo of FULL_REVIEW_EDITOR_FIELDS) {
            for (const vacio of ['', '   ', null, undefined]) {
                expect(validarFullReviewCampo(campo, vacio).valido, `${campo}:${String(vacio)}`).toBe(true);
            }
        }
    });

    it.each(FULL_REVIEW_REQUIRED_TOKENS)('un system sin %s se rechaza con el motivo en español', (token) => {
        const texto = FULL_REVIEW_STATE_SYSTEM_PROMPT.split(token).join('nada-inutil'); // todas las apariciones
        const v = validarFullReviewSystem(texto);
        expect(v.valido).toBe(false);
        expect(v.motivo).toContain(token);
        expect(/[áéíóúñ]/.test(v.motivo)).toBe(true);
    });

    it('un system desbordado se rechaza por el techo (D-5: no desborda el slot)', () => {
        const base = `{{modulesText}} [TAG]REMOVED[/TAG] ${'x'.repeat(FULL_REVIEW_SYSTEM_TOKEN_CEILING * 4 + 8)}`;
        const v = validarFullReviewSystem(base);
        expect(v.excedeTecho).toBe(true);
        expect(v.valido).toBe(false);
        expect(v.motivo).toContain(String(FULL_REVIEW_SYSTEM_TOKEN_CEILING));
    });

    it('un placeholder desconocido en el system es AVISO, no rechazo', () => {
        const v = validarFullReviewSystem('{{modulesText}} {{persona}} [TAG]x[/TAG] REMOVED');
        expect(v.valido).toBe(true);
        expect(v.avisos.join(' ')).toContain('{{persona}}');
    });

    it('el sufijo solo admite {{char}} y {{user}}', () => {
        expect(validarFullReviewSufijo('Revisa {{char}} para {{user}}').valido).toBe(true);
        const malo = validarFullReviewSufijo('Revisa {{modulesText}}');
        expect(malo.valido).toBe(false);
        expect(malo.motivo).toContain('{{modulesText}}');
    });

    it('el sufijo respeta el tope de 20000 caracteres', () => {
        expect(validarFullReviewSufijo('x'.repeat(FULL_REVIEW_SUFFIX_MAX_CHARS)).valido).toBe(true);
        const largo = validarFullReviewSufijo('x'.repeat(FULL_REVIEW_SUFFIX_MAX_CHARS + 1));
        expect(largo.valido).toBe(false);
        expect(largo.motivo).toContain(String(FULL_REVIEW_SUFFIX_MAX_CHARS));
    });

    it('campo desconocido: explota en vez de validar de más', () => {
        expect(() => validarFullReviewCampo('otro', 'x')).toThrow(/campo desconocido/i);
    });
});

describe('T5: resolveFullReviewPrompt — vacío es la fábrica byte a byte (D-4/AC0)', () => {
    it('sin overrides devuelve las constantes de fábrica intactas', () => {
        const r = resolveFullReviewPrompt({});
        expect(r.system).toBe(FULL_REVIEW_STATE_SYSTEM_PROMPT);
        expect(r.suffix).toBe(FULL_REVIEW_USER_PROMPT_SUFFIX);
        expect(r.systemEsFabrica).toBe(true);
        expect(r.suffixEsFabrica).toBe(true);
        expect(r.avisos).toEqual([]);
    });

    it('con override válido manda el override y lo dice', () => {
        const propio = '{{modulesText}} [TAG]REMOVED[/TAG] versión mía';
        const r = resolveFullReviewPrompt({ [FULL_REVIEW_OVERRIDE_KEYS.system]: propio });
        expect(r.system).toBe(propio);
        expect(r.systemEsFabrica).toBe(false);
        expect(r.suffix).toBe(FULL_REVIEW_USER_PROMPT_SUFFIX);
    });

    it('un override basura NO sale por la red: se usa la fábrica y se avisa', () => {
        const r = resolveFullReviewPrompt({
            [FULL_REVIEW_OVERRIDE_KEYS.system]: 'sin los tokens obligatorios',
            [FULL_REVIEW_OVERRIDE_KEYS.suffix]: '{{modulesText}}',
        });
        expect(r.system).toBe(FULL_REVIEW_STATE_SYSTEM_PROMPT);
        expect(r.suffix).toBe(FULL_REVIEW_USER_PROMPT_SUFFIX);
        expect(r.avisos).toHaveLength(2);
    });

    it('un override pegado del mismo campo es un bucle inofensivo: misma resolución', () => {
        const settings = { [FULL_REVIEW_OVERRIDE_KEYS.system]: FULL_REVIEW_STATE_SYSTEM_PROMPT };
        expect(resolveFullReviewPrompt(settings).system).toBe(FULL_REVIEW_STATE_SYSTEM_PROMPT);
    });
});

describe('T5: HTML del cajón (D-5)', () => {
    it('marca cada campo, su contador y el botón con data-rpg-agent-*', () => {
        const html = buildFullReviewEditorHtml({}, { escapar: s => String(s ?? '') });
        for (const campo of FULL_REVIEW_EDITOR_FIELDS) {
            expect(html).toContain(`data-rpg-agent-field="${campo}"`);
            expect(html).toContain(`data-rpg-agent-counter="${campo}"`);
        }
        expect(html).toContain('data-rpg-agent-action="restaurar"');
        expect(html).toContain('data-rpg-agent-estado="fabrica"');
    });

    it('con override el estado pasa a «propio» y el campo trae lo guardado', () => {
        const html = buildFullReviewEditorHtml(
            { [FULL_REVIEW_OVERRIDE_KEYS.suffix]: 'mi sufijo' },
            { escapar: s => String(s ?? '') },
        );
        expect(html).toContain('data-rpg-agent-estado="propio"');
        expect(html).toContain('mi sufijo');
    });

    it('vacío = campo vacío: NO se pinta la fábrica dentro del textarea', () => {
        const html = buildFullReviewEditorHtml({}, { escapar: s => String(s ?? '') });
        expect(html).not.toContain('FULL REVIEW MODE');
        expect(html).toContain('Vacío: se envía el prompt de fábrica.');
    });

    it('escapa el texto guardado (no se escapa HTML desde un ajuste)', () => {
        const html = buildFullReviewEditorHtml({ [FULL_REVIEW_OVERRIDE_KEYS.system]: '</textarea><script>alert(1)</script>' });
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('los textos del cajón están en español y citan el techo real', () => {
        const html = buildFullReviewEditorHtml({});
        expect(html).toContain('Restaurar fábrica');
        expect(html).toContain(String(FULL_REVIEW_SYSTEM_TOKEN_CEILING));
        expect(html).toContain(String(FULL_REVIEW_SUFFIX_MAX_CHARS));
        expect(html).toMatch(/subestima/);
    });
});

describe('T5: contador en vivo', () => {
    it('vacío dice fábrica y el texto cuenta caracteres y tokens', () => {
        expect(contadorFullReview('')).toContain('fábrica');
        const cuenta = contadorFullReview('x'.repeat(400));
        expect(cuenta).toContain('400 caracteres');
        expect(cuenta).toContain('≈100 tokens');
    });

    it('por encima del techo avisa de que no se guardará', () => {
        expect(contadorFullReview('x'.repeat(FULL_REVIEW_SYSTEM_TOKEN_CEILING * 4 + 1), 'system')).toContain('no se guardará');
        expect(contadorFullReview('x'.repeat(FULL_REVIEW_SUFFIX_MAX_CHARS + 1), 'suffix')).toContain('no se guardará');
    });
});

describe('T5: autosave único y restaurar (D-5)', () => {
    it('una edición válida escribe y guarda UNA sola vez', () => {
        const settings = {};
        const guardar = vi.fn();
        const r = aplicarEdicionFullReview({ settings, guardar }, 'system', '{{modulesText}} [TAG]x[/TAG] REMOVED');
        expect(r.guardado).toBe(true);
        expect(settings[FULL_REVIEW_OVERRIDE_KEYS.system]).toContain('[TAG]');
        expect(guardar).toHaveBeenCalledTimes(1);
    });

    it('una edición inválida NO escribe ni guarda (AC1: inválido nunca guardado)', () => {
        const settings = { [FULL_REVIEW_OVERRIDE_KEYS.system]: 'valor previo' };
        const guardar = vi.fn();
        const r = aplicarEdicionFullReview({ settings, guardar }, 'system', 'sin tokens obligatorios');
        expect(r.guardado).toBe(false);
        expect(settings[FULL_REVIEW_OVERRIDE_KEYS.system]).toBe('valor previo');
        expect(guardar).not.toHaveBeenCalled();
        expect(r.motivo.length).toBeGreaterThan(0);
    });

    it('repetir el mismo texto no vuelve a guardar (autosave único)', () => {
        const settings = {};
        const guardar = vi.fn();
        const texto = '{{modulesText}} [TAG]x[/TAG] REMOVED';
        aplicarEdicionFullReview({ settings, guardar }, 'system', texto);
        const segunda = aplicarEdicionFullReview({ settings, guardar }, 'system', texto);
        expect(segunda.guardado).toBe(false);
        expect(segunda.sinCambio).toBe(true);
        expect(guardar).toHaveBeenCalledTimes(1);
    });

    it('vaciar el campo escribe la cadena vacía (= fábrica) y guarda una vez', () => {
        const settings = { [FULL_REVIEW_OVERRIDE_KEYS.suffix]: 'algo' };
        const guardar = vi.fn();
        aplicarEdicionFullReview({ settings, guardar }, 'suffix', '   ');
        expect(settings[FULL_REVIEW_OVERRIDE_KEYS.suffix]).toBe('');
        expect(guardar).toHaveBeenCalledTimes(1);
    });

    it('restaurar deja las dos claves vacías SIN pintar la fábrica y guarda una vez', () => {
        const settings = {
            [FULL_REVIEW_OVERRIDE_KEYS.system]: 'propio',
            [FULL_REVIEW_OVERRIDE_KEYS.suffix]: 'sufijo propio',
        };
        const guardar = vi.fn();
        const r = restaurarFabricaFullReview({ settings, guardar });
        expect(settings[FULL_REVIEW_OVERRIDE_KEYS.system]).toBe('');
        expect(settings[FULL_REVIEW_OVERRIDE_KEYS.suffix]).toBe('');
        expect(r.antes).toBe('system sufijo');
        expect(guardar).toHaveBeenCalledTimes(1);
    });

    it('restaurar dos veces no vuelve a guardar (idempotente)', () => {
        const settings = { [FULL_REVIEW_OVERRIDE_KEYS.system]: 'propio' };
        const guardar = vi.fn();
        restaurarFabricaFullReview({ settings, guardar });
        const segunda = restaurarFabricaFullReview({ settings, guardar });
        expect(segunda.guardado).toBe(false);
        expect(guardar).toHaveBeenCalledTimes(1);
    });

    it('sin ajustes no se escribe ni se guarda nada', () => {
        const guardar = vi.fn();
        expect(aplicarEdicionFullReview({ guardar }, 'system', 'x').guardado).toBe(false);
        expect(restaurarFabricaFullReview({ guardar }).guardado).toBe(false);
        expect(guardar).not.toHaveBeenCalled();
    });
});

describe('T5: el módulo es puro (cero DOM, cero red, cero modelo)', () => {
    it.each([
        'document.', 'window.', 'jQuery(', '$(', 'fetch(', 'sendStateRequest(', 'sendAgentTurn(',
        'saveSettings(', 'localStorage.', 'Popup.', 'toastr.',
    ])('el fuente no contiene %s', (prohibido) => {
        expect(editorSource).not.toContain(prohibido);
    });
});
