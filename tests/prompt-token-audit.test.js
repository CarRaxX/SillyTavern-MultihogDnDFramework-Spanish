import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT } from '../map-evolution-prompt.js';
import { DEFAULT_MAP_UPDATER_SYSTEM_PROMPT } from '../map-updater-prompt.js';
import { DEFAULT_MAP_EVOLUTION_COMPRESS_SYSTEM_PROMPT } from '../map-evolution-compress-prompt.js';
import { DEFAULT_WORLD_PROGRESSION_SYSTEM_PROMPT } from '../world-progression-prompt.js';
import { DEFAULT_MAP_ARCHITECT_TOPOLOGY_SYSTEM_PROMPT, DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT, DEFAULT_MAP_ARCHITECT_BRIEF_SYSTEM_PROMPT } from '../map-architect-prompt.js';
import { DEFAULT_MAP_EVOLUTION_DIRECT_SYSTEM_PROMPT } from '../map-evolution-direct-prompt.js';
import { DEFAULT_MAP_UPDATER_DIRECT_SYSTEM_PROMPT } from '../map-updater-direct-prompt.js';
import { FULL_REVIEW_STATE_SYSTEM_PROMPT, FULL_REVIEW_USER_PROMPT_SUFFIX } from '../src/state/defaults.js';

// T3 (spec 2026-11-05, D-7): auditoría versionada de tamaños contra la línea
// base de main=df7b3cc. Regla binaria: NINGÚN prompt de máquina puede CRECER ni
// un carácter sobre la base (los recortes sí se permiten, pero los de EXAMPLES
// están aplazados por el oráculo certificado). Cero modelo, cero red: solo
// miden las constantes de fábrica exportadas.

const base = JSON.parse(readFileSync(new URL('./fixtures/prompt-token-baseline.json', import.meta.url), 'utf8'));
const tok4 = s => Math.ceil(String(s).length / 4);

const corrientes = {
    map_evolution: DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT,
    map_updater: DEFAULT_MAP_UPDATER_SYSTEM_PROMPT,
    map_evolution_compress: DEFAULT_MAP_EVOLUTION_COMPRESS_SYSTEM_PROMPT,
    world_progression: DEFAULT_WORLD_PROGRESSION_SYSTEM_PROMPT,
    map_architect_topology: DEFAULT_MAP_ARCHITECT_TOPOLOGY_SYSTEM_PROMPT,
    map_architect: DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT,
    map_architect_brief: DEFAULT_MAP_ARCHITECT_BRIEF_SYSTEM_PROMPT,
    map_evolution_direct: DEFAULT_MAP_EVOLUTION_DIRECT_SYSTEM_PROMPT,
    map_updater_direct: DEFAULT_MAP_UPDATER_DIRECT_SYSTEM_PROMPT,
    // T4 (ola 5): los dos prompts de Revisión de Estado Completa entran en la
    // línea base, medidos sobre main=9440ed0. Desde aquí tampoco crecen.
    full_review_state_system: FULL_REVIEW_STATE_SYSTEM_PROMPT,
    full_review_user_suffix: FULL_REVIEW_USER_PROMPT_SUFFIX,
};

describe('Auditoría D-7: ningún prompt de máquina crece sobre la base', () => {
    it.each(Object.keys(base.prompts))('%s: chars actuales ≤ chars de la línea base (crecimiento > 0 % = FAIL)', (nombre) => {
        const esperado = base.prompts[nombre];
        const actual = corrientes[nombre];
        expect(actual, `falta la constante de fábrica ${nombre}`).toBeTruthy();
        expect(
            actual.length,
            `${nombre} creció ${actual.length - esperado.chars} chars sobre la base ${esperado.chars} (medición 2026-11-05, rama ${base.rama_base})`,
        ).toBeLessThanOrEqual(esperado.chars);
    });

    it('la línea base se autocoincide con la métrica tok = ceil(chars/4) declarada (R3 documentada)', () => {
        for (const [nombre, dato] of Object.entries(base.prompts)) {
            expect(dato.tok4, nombre).toBe(Math.ceil(dato.chars / 4));
        }
        expect(base._nota).toContain('15-30 %');
    });

    it('los cinco prompts declarados compactos (D-6) mantienen su tamaño exacto de fábrica', () => {
        for (const nombre of base.compactos_sin_recorte_D6) {
            expect(corrientes[nombre].length, `${nombre} no es compacto intacto`).toBe(base.prompts[nombre].chars);
        }
    });
});

describe('Ahorro medido de la dieta D-6(a): «## MAPPED SITE» duplicado', () => {
    it('el bloque (con el siteRoot de ejemplo) mide los chars fijados en la base', () => {
        const src = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
        const i = src.indexOf('function formatMappedSiteAgentNote');
        expect(i).toBeGreaterThan(-1);
        const fn = src.slice(i, src.indexOf('\n}', i));
        const lit = fn.match(/return `([\s\S]*)`;/)[1];
        const bloque = lit.replace(/\\n/g, '\n').replace('${context.siteRoot}', base.mapped_site_bloque.ejemplo_siteRoot);
        expect(bloque.length).toBe(base.mapped_site_bloque.chars_con_ejemplo);
        expect(tok4(bloque)).toBe(base.mapped_site_bloque.tok4_con_ejemplo);
    });

    it('tras la dieta, cada petición del agente lleva UNA sola copia: el ahorro por vuelta es el bloque completo', () => {
        // (a) se verifica a fondo en prompt-diet-contracts; aquí solo que el
        // ahorro fijado en la base (≈75 tok/vuelta) sigue siendo cierto.
        expect(base.mapped_site_bloque.tok4_con_ejemplo).toBeGreaterThanOrEqual(70);
        expect(base.mapped_site_bloque.ahorro_dieta_a_por_pasada).toContain('user message');
    });
});

describe('Secciones EXAMPLES aplazadas (b)/(c): tamaño registrado, estado honesto', () => {
    it.each(['map_evolution', 'map_updater'])('%s: la base fija sus EXAMPLES con Nº de ejemplos y estado APLAZADO', (nombre) => {
        const registro = base.examples_secciones_aplazadas_ola5[nombre];
        expect(registro.estado).toContain('APLADADO');
        expect(registro.ejemplos).toBeGreaterThan(5);
        expect(registro.tok4).toBe(Math.ceil(registro.chars / 4));
    });
});

describe('T4 (ola 5): los dos prompts de Revisión de Estado Completa entran en la línea base', () => {
    it('una línea por prompt, medida sobre main=9440ed0 con la misma métrica', () => {
        expect(base.ola5_T4_prompts_full_review.medido_en).toBe('main=9440ed0');
        for (const nombre of ['full_review_state_system', 'full_review_user_suffix']) {
            const dato = base.prompts[nombre];
            expect(dato, nombre).toBeTruthy();
            expect(dato.tok4, nombre).toBe(Math.ceil(dato.chars / 4));
            expect(corrientes[nombre].length, `${nombre}: cambió desde la medición`).toBe(dato.chars);
        }
    });

    it('la procedencia dice dónde se consumen y dónde se pintan (D-4)', () => {
        const nota = base.ola5_T4_prompts_full_review;
        expect(nota.consumo).toContain('index.js:3573');
        expect(nota.consumo).toContain('index.js:3755');
        for (const sitio of ['7517', '7788', '10151', '13421']) {
            expect(nota.consumo.includes(`:${sitio}`) || nota.pintado_en?.includes(sitio), sitio).toBe(true);
        }
    });

    it('el system de fábrica trae los tokens de máquina que exige el parser (lista blanca viva)', () => {
        const sys = corrientes.full_review_state_system;
        expect(sys).toContain('{{modulesText}}');
        expect(sys).toContain('[TAG]');
        expect(sys).toContain('[/TAG]');
        expect(sys).toContain('REMOVED');
        // `{{actionRequestRaw}}` NO está en el system de fábrica (lo añade la ruta
        // del user): por eso el validador del editor lo admite pero no lo exige.
        expect(sys).not.toContain('{{actionRequestRaw}}');
    });
});
