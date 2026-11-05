import { describe, expect, it } from 'vitest';
import {
    THINKING_JOBS,
    THINKING_JOB_IDS,
    THINKING_MODES,
    allowedThinkingModes,
    applyThinkingPolicyToBody,
    describeThinkingEffect,
    describeThinkingRoute,
    getThinkingJob,
    isThinkingJob,
    normalizeThinkingPolicy,
    normalizeThinkingPolicyEntry,
    resolveThinkingPolicy,
} from '../src/state/thinking-policy.js';

// Los cinco trabajos de juicio o narrativa de la spec D5 no pueden quedarse sin
// pensamiento; sólo la transcripción del rastreador y la compresión del
// historial cerrado de Evolución lo admiten.
const OFF_ELIGIBLE = ['state_tracker', 'map_evolution_compress'];
const JUICIO_ONLY = [
    'tracker_full_review',
    'tracker_audit',
    'lorebook_agent',
    'map_runtime',
    'map_evolution',
    'world_progression',
];

describe('Trabajos gobernables (D5)', () => {
    it('lista los ocho trabajos de la spec con su etiqueta en español', () => {
        expect(THINKING_JOB_IDS).toEqual([
            'state_tracker',
            'tracker_full_review',
            'tracker_audit',
            'lorebook_agent',
            'map_runtime',
            'map_evolution',
            'map_evolution_compress',
            'world_progression',
        ]);
        expect(THINKING_JOBS.map(job => job.label)).toEqual([
            'Rastreador de Estado (transcripción del memo)',
            'Rastreador en modo Revisión de Estado Completa',
            'Auditoría de contexto completo del Rastreador',
            'Agente de Lorebook (básico, turno y archivero)',
            'Actualizador de Mapas',
            'Evolución de Mapas',
            'Compresión de historial de Evolución de Mapas',
            'World Progression',
        ]);
        for (const job of THINKING_JOBS) {
            expect(job.note.length).toBeGreaterThan(20);
            expect(job.source).toMatch(/[cC]onnectionSource$/);
        }
    });

    it('los trabajos derivados comparten la conexión del trabajo madre', () => {
        expect(getThinkingJob('tracker_full_review').source).toBe('connectionSource');
        expect(getThinkingJob('tracker_audit').source).toBe('connectionSource');
        expect(getThinkingJob('map_evolution_compress').source).toBe('mapEvolutionConnectionSource');
        expect(getThinkingJob('lorebook_agent').source).toBe('routerConnectionSource');
        expect(getThinkingJob('world_progression').source).toBe('worldConnectionSource');
    });

    it('reserva «desactivar» a la transcripción y a la compresión del compresor', () => {
        for (const id of OFF_ELIGIBLE) {
            expect(allowedThinkingModes(id)).toEqual([THINKING_MODES.INHERIT, THINKING_MODES.BUDGET, THINKING_MODES.OFF]);
        }
        for (const id of JUICIO_ONLY) {
            expect(allowedThinkingModes(id)).toEqual([THINKING_MODES.INHERIT, THINKING_MODES.BUDGET]);
        }
    });

    it('un trabajo desconocido solo admite heredar', () => {
        expect(isThinkingJob('narrador')).toBe(false);
        expect(getThinkingJob('inexistente')).toBeNull();
        expect(allowedThinkingModes('inexistente')).toEqual([THINKING_MODES.INHERIT]);
    });
});

describe('normalizeThinkingPolicyEntry (D2)', () => {
    it('acepta los tres modos y el presupuesto entero positivo', () => {
        expect(normalizeThinkingPolicyEntry({ mode: 'heredar' }, 'state_tracker')).toEqual({ mode: 'heredar' });
        expect(normalizeThinkingPolicyEntry({ mode: 'desactivar' }, 'state_tracker')).toEqual({ mode: 'desactivar' });
        expect(normalizeThinkingPolicyEntry({ mode: 'presupuesto', tokens: 1024 }, 'lorebook_agent')).toEqual({ mode: 'presupuesto', tokens: 1024 });
    });

    it('devuelve heredar con modo desconocido, presupuesto ausente o basura', () => {
        expect(normalizeThinkingPolicyEntry({ mode: 'rapido' }, 'state_tracker')).toEqual({ mode: 'heredar' });
        expect(normalizeThinkingPolicyEntry(undefined, 'state_tracker')).toEqual({ mode: 'heredar' });
        expect(normalizeThinkingPolicyEntry(null, 'state_tracker')).toEqual({ mode: 'heredar' });
        expect(normalizeThinkingPolicyEntry({ mode: 'presupuesto' }, 'state_tracker')).toEqual({ mode: 'heredar' });
        expect(normalizeThinkingPolicyEntry({ mode: 'presupuesto', tokens: 0 }, 'state_tracker')).toEqual({ mode: 'heredar' });
        expect(normalizeThinkingPolicyEntry({ mode: 'presupuesto', tokens: -5 }, 'state_tracker')).toEqual({ mode: 'heredar' });
        expect(normalizeThinkingPolicyEntry({ mode: 'presupuesto', tokens: 1024.5 }, 'state_tracker')).toEqual({ mode: 'heredar' });
        expect(normalizeThinkingPolicyEntry({ mode: 'presupuesto', tokens: 'muchos' }, 'state_tracker')).toEqual({ mode: 'heredar' });
    });

    it('hace inalcanzable «desactivar» en los trabajos de juicio', () => {
        for (const id of JUICIO_ONLY) {
            expect(normalizeThinkingPolicyEntry({ mode: 'desactivar' }, id)).toEqual({ mode: 'heredar' });
        }
    });

    it('ignora el presupuesto cuando el modo no lo pide', () => {
        expect(normalizeThinkingPolicyEntry({ mode: 'desactivar', tokens: 512 }, 'state_tracker')).toEqual({ mode: 'desactivar' });
    });
});

describe('normalizeThinkingPolicy (mapa completo)', () => {
    it('sin clave o con basura devuelve mapa vacío', () => {
        expect(normalizeThinkingPolicy(undefined)).toEqual({});
        expect(normalizeThinkingPolicy(null)).toEqual({});
        expect(normalizeThinkingPolicy('desactivar')).toEqual({});
        expect(normalizeThinkingPolicy([])).toEqual({});
    });

    it('no guarda entradas en heredar: cero bytes para quien no mueva nada', () => {
        expect(normalizeThinkingPolicy({ state_tracker: { mode: 'heredar' } })).toEqual({});
        expect(normalizeThinkingPolicy({ state_tracker: { mode: 'presupuesto', tokens: 2048 }, lorebook_agent: { mode: 'desactivar' } }))
            .toEqual({ state_tracker: { mode: 'presupuesto', tokens: 2048 } });
    });

    it('descarta trabajos desconocidos', () => {
        expect(normalizeThinkingPolicy({ narrador: { mode: 'desactivar' } })).toEqual({});
    });
});

describe('resolveThinkingPolicy', () => {
    it('lee desde los ajustes completos o desde el mapa directo', () => {
        const ajustes = { localThinkingPolicy: { state_tracker: { mode: 'desactivar' } } };
        expect(resolveThinkingPolicy(ajustes, 'state_tracker')).toEqual({ mode: 'desactivar' });
        expect(resolveThinkingPolicy({ state_tracker: { mode: 'desactivar' } }, 'state_tracker')).toEqual({ mode: 'desactivar' });
    });

    it('sin clave ni mapa devuelve heredar', () => {
        expect(resolveThinkingPolicy({}, 'map_evolution')).toEqual({ mode: 'heredar' });
        expect(resolveThinkingPolicy(undefined, 'map_evolution')).toEqual({ mode: 'heredar' });
        expect(resolveThinkingPolicy({ localThinkingPolicy: {} }, 'map_evolution')).toEqual({ mode: 'heredar' });
    });

    it('trabajo desconocido nunca hereda política ajena', () => {
        expect(resolveThinkingPolicy({ localThinkingPolicy: { state_tracker: { mode: 'desactivar' } } }, 'narrador')).toEqual({ mode: 'heredar' });
    });
});

describe('applyThinkingPolicyToBody (D3)', () => {
    it('heredar no añade ni reordena un solo byte (D4)', () => {
        const cuerpo = { model: 'm', messages: [], stream: true, temperature: 0.1 };
        const antes = JSON.stringify(cuerpo);
        expect(JSON.stringify(applyThinkingPolicyToBody(cuerpo, { mode: 'heredar' }, 'state_tracker'))).toBe(antes);
        expect(JSON.stringify(applyThinkingPolicyToBody(cuerpo, undefined, 'state_tracker'))).toBe(antes);
        expect(JSON.stringify(applyThinkingPolicyToBody(cuerpo, { mode: 'presupuesto', tokens: 'no' }, 'state_tracker'))).toBe(antes);
    });

    it('desactivar: reasoning_effort none y enable_thinking en booleano, sin presupuesto', () => {
        const cuerpo = applyThinkingPolicyToBody({ model: 'm' }, { mode: 'desactivar' }, 'state_tracker');
        expect(cuerpo.reasoning_effort).toBe('none');
        expect(cuerpo.chat_template_kwargs).toEqual({ enable_thinking: false });
        expect(typeof cuerpo.chat_template_kwargs.enable_thinking).toBe('boolean');
        expect('reasoning_budget_tokens' in cuerpo).toBe(false);
        expect('thinking_budget_tokens' in cuerpo).toBe(false);
        expect('reasoning_budget_message' in cuerpo).toBe(false);
        expect('enable_thinking' in cuerpo).toBe(false);
    });

    it('presupuesto: canónico y alias con el mismo valor, nunca el message', () => {
        const cuerpo = applyThinkingPolicyToBody({ model: 'm' }, { mode: 'presupuesto', tokens: 1024 }, 'lorebook_agent');
        expect(cuerpo.reasoning_budget_tokens).toBe(1024);
        expect(cuerpo.thinking_budget_tokens).toBe(1024);
        expect('reasoning_budget_message' in cuerpo).toBe(false);
        expect('reasoning_effort' in cuerpo).toBe(false);
        expect('chat_template_kwargs' in cuerpo).toBe(false);
    });

    it('revalida la elegibilidad por trabajo aunque la política venga sucia', () => {
        const cuerpo = applyThinkingPolicyToBody({ model: 'm' }, { mode: 'desactivar' }, 'map_evolution');
        expect('reasoning_effort' in cuerpo).toBe(false);
        expect('chat_template_kwargs' in cuerpo).toBe(false);
    });

    it('conserva otros chat_template_kwargs ya presentes', () => {
        const cuerpo = applyThinkingPolicyToBody({ model: 'm', chat_template_kwargs: { add_bos_token: true } }, { mode: 'desactivar' }, 'state_tracker');
        expect(cuerpo.chat_template_kwargs).toEqual({ add_bos_token: true, enable_thinking: false });
    });
});

describe('Ruta efectiva del trabajo (D8)', () => {
    it('la fuente OpenAI compatible es ruta directa y el resto SillyTavern', () => {
        expect(describeThinkingRoute('openai').key).toBe('directa');
        expect(describeThinkingRoute('openai').controlable).toBe(true);
        for (const fuente of ['default', 'profile', 'ollama', '']) {
            expect(describeThinkingRoute(fuente).key).toBe('st');
            expect(describeThinkingRoute(fuente).controlable).toBe(false);
        }
    });

    it('el texto en español distingue política activa de inerte', () => {
        const ajustes = { localThinkingPolicy: { state_tracker: { mode: 'desactivar' } } };
        expect(describeThinkingEffect(ajustes, 'state_tracker', 'openai').text).toContain('activa en la ruta directa');
        const inerte = describeThinkingEffect(ajustes, 'state_tracker', 'default');
        expect(inerte.text).toContain('inerte');
        expect(inerte.text).toContain('desactivar');
        expect(describeThinkingEffect({ localThinkingPolicy: { state_tracker: { mode: 'presupuesto', tokens: 1024 } } }, 'state_tracker', 'openai').text).toContain('1024 tokens');
    });
});
