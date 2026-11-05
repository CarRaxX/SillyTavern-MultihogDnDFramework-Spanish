import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT } from '../map-evolution-prompt.js';
import { DEFAULT_MAP_UPDATER_SYSTEM_PROMPT } from '../map-updater-prompt.js';
import { DEFAULT_MAP_ARCHITECT_TOPOLOGY_SYSTEM_PROMPT, DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT, DEFAULT_MAP_ARCHITECT_BRIEF_SYSTEM_PROMPT } from '../map-architect-prompt.js';
import { MACHINE_TOKEN_ALIASES } from '../src/state/bilingual-contract.js';

// T10 (spec 2026-11-05, D-6): dieta REAL aplicada = (a) «## MAPPED SITE»
// duplicado en la misma petición del Agente de Lorebook (fuera la copia del user;
// el system la conserva) y (d) NO aplicada: el T6 probó que el bloque de mundo de
// index.js es ruta MUERTA, no duplicado real (ver fixture world-block-request-main.json).
// (b)/(c) —recorte de EXAMPLES— quedan APLAZADOS por el oráculo certificado: sin
// medir la tasa de JSON válido con VRAM (AC0 prohíbe usarla) el ahorro no es
// verificable. El TEST DE CONTRATO que la spec exige para (b)/(c) vive aquí
// igualmente y queda ARMADO: lista blanca de tokens de máquina derivada de los
// parsers, TODOS presentes antes y después. Si ola 5 recorta EXAMPLES, este test
// es la red. Cero VRAM, cero red.

const routerSource = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
const base = JSON.parse(readFileSync(new URL('./fixtures/prompt-token-baseline.json', import.meta.url), 'utf8'));

const lineaDe = (aguja) => {
    const linea = routerSource.split('\n').find(l => l.trimStart().startsWith(aguja));
    if (!linea) throw new Error(`Falta la línea "${aguja}" en router.js`);
    return linea;
};

describe('Dieta (a): UN solo «## MAPPED SITE» por petición del agente', () => {
    it('el literal de la cabecera vive solo en el formateador (una ocurrencia en router.js)', () => {
        expect(routerSource.split('## MAPPED SITE').length - 1).toBe(1);
    });

    it('formatMappedSiteAgentNote se llama EXACTAMENTE 2 veces y ambas en la composición del system prompt', () => {
        const llamadas = routerSource.split('formatMappedSiteAgentNote(activeDungeonContext)').length - 1;
        // Definición + 2 sistemas (básico :2333 y nativo :2605) + 0 usuarios.
        expect(routerSource.split('formatMappedSiteAgentNote(').length - 1).toBe(3);
        expect(llamadas).toBe(2);
        expect(lineaDe('const finalBasicSystemPrompt =')).toContain('formatMappedSiteAgentNote(activeDungeonContext)');
        expect(lineaDe('const adjustedSharedContext =')).toContain('formatMappedSiteAgentNote(activeDungeonContext)');
    });

    it('los user messages del agente (básico y nativo) ya NO llevan la copia', () => {
        expect(lineaDe('const basicUserPrompt =')).not.toContain('formatMappedSiteAgentNote');
        expect(lineaDe('const contextMessage =')).not.toContain('formatMappedSiteAgentNote');
    });

    it('la dieta (d) NO se aplicó: no hay duplicado real de mundo (T6: ruta muerta) y el techo lo cubre', () => {
        const hooks = readFileSync(new URL('../narrative-hooks.js', import.meta.url), 'utf8');
        expect(hooks).toContain('applyWorldInjectionCeiling(worldUnits, settings)');
        expect(routerSource).not.toContain('dieta (d)');
    });
});

describe('Test de contrato (red para la dieta aplazada (b)/(c))', () => {
    it('la lista blanca sigue derivable de los parsers (literales y tabla de claves)', () => {
        const derivarLiterales = (archivo) => new Set(
            [...readFileSync(new URL(`../${archivo}`, import.meta.url), 'utf8').matchAll(/'([A-Z][A-Z0-9_]{2,})'/g)].map(m => m[1]),
        );
        for (const token of base.blancas.evolution) {
            expect(derivarLiterales('map-evolution-lib.js').has(token), `evolution: ${token} dejó de derivarse del parser`).toBe(true);
        }
        for (const token of base.blancas.updater) {
            expect(derivarLiterales('map-updater-lib.js').has(token), `updater: ${token} dejó de derivarse del parser`).toBe(true);
        }
        // El parser del arquitecto valida claves VÍA bilingual-contract (normalizeMachineKeys).
        for (const token of base.blancas.architect) {
            expect(token in MACHINE_TOKEN_ALIASES, `architect: ${token} salió del contrato`).toBe(true);
        }
    });

    it('TODOS los tokens de máquina presentes ANTES de cualquier dieta: sin recortar, la lista completa está en sus prompts', () => {
        for (const token of base.blancas.evolution) {
            expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT, `map_evolution perdió ${token}`).toContain(token);
        }
        for (const token of base.blancas.updater) {
            expect(DEFAULT_MAP_UPDATER_SYSTEM_PROMPT, `map_updater perdió ${token}`).toContain(token);
        }
        const arquitecto = DEFAULT_MAP_ARCHITECT_TOPOLOGY_SYSTEM_PROMPT + DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT + DEFAULT_MAP_ARCHITECT_BRIEF_SYSTEM_PROMPT;
        for (const token of base.blancas.architect) {
            expect(arquitecto, `map_architect perdió la clave ${token}`).toContain(token);
        }
    });

    it('los prompts de mapa NO se recortaron en esta ola (bytes exactos de la base)', () => {
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT.length).toBe(base.prompts.map_evolution.chars);
        expect(DEFAULT_MAP_UPDATER_SYSTEM_PROMPT.length).toBe(base.prompts.map_updater.chars);
    });

    it('EXAMPLES intactos: 12 y 10 ejemplos siguen en su sitio (APLAZADO declarado, no recorte silencioso)', () => {
        const cuenta = (archivo) => {
            const src = readFileSync(new URL(`../${archivo}`, import.meta.url), 'utf8');
            const k = src.indexOf('\nEXAMPLES');
            const fin = src.indexOf('\nNever write', k);
            return (src.slice(k, fin).match(/^\{"operation_id"|^\{"noop"/gm) || []).length;
        };
        expect(cuenta('map-evolution-prompt.js')).toBe(base.examples_secciones_aplazadas_ola5.map_evolution.ejemplos);
        expect(cuenta('map-updater-prompt.js')).toBe(base.examples_secciones_aplazadas_ola5.map_updater.ejemplos);
    });
});
