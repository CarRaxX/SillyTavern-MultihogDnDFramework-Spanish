import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAst } from 'rollup/parseAst';
import { CHAT_STATE_GLOBAL_UI_KEYS } from '../../src/state/settings.js';
import { perfProfileValues, PERF_PROFILES } from '../../src/state/performance-profiles.js';

// T14 (spec 2026-11-08, ola 5): pureza de `performance-profiles.js` por AST.
// La matriz es DATOS que delegan (D-7): PROHIBIDO copiar clamps o cotas propias,
// prohibido escribir claves literales de presupuesto/reintentos/chunk, prohibido
// tocar el motor de inferencia, el slot o la conexión, y las claves nuevas no
// viajan por el estado del chat (D-11). Cada regla es determinista y su fallo
// señala el nodo; aquí no manda el modelo.

const fuente = readFileSync(new URL('../../src/state/performance-profiles.js', import.meta.url), 'utf8');
const llmClient = readFileSync(new URL('../../llm-client.js', import.meta.url), 'utf8');
const ast = parseAst(fuente);

const NUEVAS_CLAVES = [
    'agenteRetriesExtra', 'jsonCorrectionRetriesExtra', 'rpgAuditChunkBuffer',
    'rpgOutputCapStateTracker', 'rpgOutputCapWorldProgression', 'rpgOutputCapMapEvolutionCompress',
    'fullReviewSystemPromptOverride', 'fullReviewUserPromptSuffixOverride',
    'rpgPerfProfile', 'rpgPerfProfileCustom',
];

/** Recorrido total del AST llamando a `fn` con cada nodo. */
function todos(fn) {
    const visitar = nodo => {
        if (!nodo || typeof nodo !== 'object') return;
        fn(nodo);
        for (const v of Object.values(nodo)) {
            if (Array.isArray(v)) v.forEach(visitar);
            else if (v && typeof v === 'object') visitar(v);
        }
    };
    visitar(ast);
}

/** Todos los literales de texto del módulo. */
function literales() {
    const salida = [];
    todos(n => { if (n.type === 'Literal' && typeof n.value === 'string') salida.push(n.value); });
    return salida;
}

describe('performance-profiles.js: cero clamps ni cotas propias (D-7)', () => {
    it('ni un Math.*: no hay mini-clamps artesanales en el módulo', () => {
        const matematicos = [];
        todos(n => {
            if (n.type === 'CallExpression'
                && n.callee?.type === 'MemberExpression'
                && n.callee.object?.type === 'Identifier'
                && n.callee.object.name === 'Math') {
                matematicos.push(fuente.slice(n.start, n.end));
            }
        });
        expect(matematicos).toEqual([]);
    });

    it('ninguna función propia con nombre de clamp/min/max', () => {
        const declaradas = [];
        todos(n => {
            if (n.type === 'FunctionDeclaration' && /clamp|minim|maxim|recort/i.test(n.id?.name || '')) {
                declaradas.push(n.id.name);
            }
        });
        expect(declaradas).toEqual([]);
    });

    it('los cuatro aplicadores delegados están importados (la matriz no reinventa cotas)', () => {
        const importados = new Set();
        todos(n => {
            if (n.type !== 'ImportDeclaration') return;
            for (const espec of n.specifiers || []) {
                if (espec.imported?.name) importados.add(espec.imported.name);
            }
        });
        for (const nombre of [
            'clampLoreRhythmCustom',   // ola 3: el PAR de ritmo
            'clampPromptCeiling',      // ola 4: los techos
            'normalizeThinkingPolicyEntry', // ola 2: el pensamiento
            'clampAgControl',          // ola 5: mandos
            'clampOutputCap',          // ola 5: topes de salida
            'validateAgentControlSet', // D-6: la suma ≤ 12
        ]) {
            expect(importados.has(nombre), nombre).toBe(true);
        }
    });

    it('el ritmo sale de la tabla canónica de la ola 3, no de números sueltos', () => {
        expect(fuente).toMatch(/getLoreRhythmPreset/);
        expect(fuente).toMatch(/LORE_RHYTHM_SETTINGS_KEYS\.runEvery/);
        expect(fuente).toMatch(/LORE_RHYTHM_SETTINGS_KEYS\.maxTurns/);
    });
});

describe('performance-profiles.js: cero claves literales de presupuesto', () => {
    const PROHIBIDAS = /^(routerMaxTurns|routerRunEvery|chunkTokenLimit|tokenBuffer|MAX_(AGENT|JSON_CORRECTION|CLEANUP)_RETRIES|agenteRetriesExtra|jsonCorrectionRetriesExtra|rpgAuditChunkBuffer)$/;

    it('las claves de mando solo viajan por sus mapas exportados', () => {
        const malas = [];
        todos(n => {
            if (n.type !== 'Literal' || typeof n.value !== 'string') return;
            if (!PROHIBIDAS.test(n.value)) return;
            // Único escape admitido: los nombres de campo que acepta el clamp de
            // la ola 3 como PRIMER argumento literal (`clampLoreRhythmCustom('maxTurns', …)`).
            let nodo = n;
            const escapeValido = fuente.includes('clampLoreRhythmCustom') && (() => {
                let encontrado = false;
                todos(m => {
                    if (m.type === 'CallExpression'
                        && m.callee?.name === 'clampLoreRhythmCustom'
                        && m.arguments?.[0] === n) encontrado = true;
                });
                return encontrado;
            })();
            if (!escapeValido) malas.push(n.value);
        });
        expect(malas).toEqual([]);
    });

    it('las claves nuevas de sesión no se registran en CHAT_STATE_GLOBAL_UI_KEYS (D-11)', () => {
        for (const clave of NUEVAS_CLAVES) {
            expect(CHAT_STATE_GLOBAL_UI_KEYS, clave).not.toContain(clave);
        }
    });

    it('el módulo de perfiles no menciona el estado por chat', () => {
        expect(fuente).not.toMatch(/CHAT_STATE|saveChatState|chatStates/);
    });
});

describe('performance-profiles.js: ningún perfil toca el motor, el slot ni la conexión', () => {
    it('cero referencias textuales al orquestador, al slot o a la inferencia', () => {
        // Sin comentarios: el propio módulo documenta lo que NO hace y eso no puede
        // hacer saltar la guarda. Se comprueba solo el código.
        const codigo = fuente
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');
        expect(codigo).not.toMatch(/ai-manager|STATE_DIR|primary_backend|AI_MANAGER|strata|\bslot\b|parallel|sm_120|VRAM|RTX/i);
    });

    it('ninguna clave de conexión o modelo entre las que escriben los perfiles', () => {
        const PROHIBIDAS = new Set([
            'connectionSource', 'connectionProfileId', 'completionPresetId',
            'openaiUrl', 'openaiKey', 'openaiModel', 'ollamaUrl', 'ollamaModel',
            'routerConnectionSource', 'routerOllamaUrl', 'routerOllamaModel',
            'routerOpenaiUrl', 'routerOpenaiKey', 'routerOpenaiModel',
            'maxTokens', 'routerMaxTokens', 'maxTokensOverride',
        ]);
        for (const perfil of PERF_PROFILES) {
            const valores = perfProfileValues(perfil.id, []);
            for (const clave of Object.keys(valores)) {
                expect(PROHIBIDAS.has(clave), `${perfil.id} escribe ${clave}`).toBe(false);
            }
        }
    });

    it('módulo puro: cero DOM, cero red, cero guardado y cero imports impuros', () => {
        expect(fuente).not.toMatch(/\bdocument\b|\bwindow\b|\bfetch\(|localStorage|SillyTavern|saveSettings/);
        const orígenes = [];
        todos(n => { if (n.type === 'ImportDeclaration') orígenes.push(n.source.value); });
        for (const origen of orígenes) {
            expect(origen, origen).not.toMatch(/index|router|llm-client|state-manager|\/app\//);
        }
    });
});

describe('llm-client.js: el anti-ensombrecimiento de T9 sigue vivo', () => {
    it('la ruta SillyTavern declara rawOptions y ningún `const options` local la ensombrece', () => {
        expect(llmClient).toMatch(/const rawOptions = \{ prompt: flatUser/);
        expect(llmClient).not.toMatch(/const options = \{ prompt: flatUser/);
        expect(llmClient).toMatch(/generateRaw\(rawOptions\)/);
    });

    it('el cap por trabajo se aplica en las tres rutas gobernales', () => {
        const usos = llmClient.match(/maxTokensEfectivos\(settings, /g) || [];
        expect(usos.length).toBeGreaterThanOrEqual(4);
    });
});

describe('los overrides de Revisión Completa no viajan en perfiles (addendum §4)', () => {
    it('ni la matriz ni los valores aplicados mencionan las claves de override', () => {
        const lits = literales();
        expect(lits).not.toContain('fullReviewSystemPromptOverride');
        expect(lits).not.toContain('fullReviewUserPromptSuffixOverride');
        for (const perfil of PERF_PROFILES) {
            const valores = perfProfileValues(perfil.id, []);
            expect(valores).not.toHaveProperty('fullReviewSystemPromptOverride');
            expect(valores).not.toHaveProperty('fullReviewUserPromptSuffixOverride');
        }
    });
});
