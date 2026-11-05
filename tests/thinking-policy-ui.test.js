import { createContext, runInContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAst } from 'rollup/parseAst';
import { describeThinkingRoute } from '../src/state/thinking-policy.js';
import { escapeHtml } from '../memo-processor.js';
import { THINKING_JOBS } from '../src/state/thinking-policy.js';

// T6/D8: el cajón «Rendimiento (modelo local)» se construye desde THINKING_JOBS,
// así que el test ejecuta de verdad la función de la fila sobre los ocho trabajos
// y comprueba que «desactivar» es inalcanzable en los seis de juicio (AC3).
const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const settingsHtml = readFileSync(new URL('../settings.html', import.meta.url), 'utf8');

function extraer(nombre) {
    let encontrado = null;
    const visitar = nodo => {
        if (!nodo || typeof nodo !== 'object' || encontrado) return;
        if (nodo.type === 'FunctionDeclaration' && nodo.id?.name === nombre) {
            encontrado = indexSource.slice(nodo.start, nodo.end);
            return;
        }
        if (nodo.type === 'VariableDeclaration') {
            for (const declaracion of nodo.declarations || []) {
                if (declaracion.id?.name === nombre) {
                    encontrado = indexSource.slice(nodo.start, nodo.end);
                    return;
                }
            }
        }
        for (const valor of Object.values(nodo)) {
            if (Array.isArray(valor)) valor.forEach(visitar);
            else if (valor && typeof valor === 'object') visitar(valor);
        }
    };
    visitar(parseAst(indexSource));
    if (!encontrado) throw new Error(`Falta "${nombre}" en index.js`);
    return encontrado;
}

/** Etiquetas de modo tal y como las define index.js (única fuente). */
const ETIQUETAS_MODO = runInContext(
    `${extraer('THINKING_MODE_LABELS_ES')}\n;THINKING_MODE_LABELS_ES;`,
    createContext({}),
);

/** Construye la fila con las dependencias de index.js inyectadas. */
function fila(job, policy, fuente) {
    const contexto = createContext({ describeThinkingRoute, escapeHtml, THINKING_MODE_LABELS_ES: ETIQUETAS_MODO });
    runInContext(extraer('buildThinkingPolicyRowHtml'), contexto);
    return contexto.buildThinkingPolicyRowHtml(job, policy, fuente);
}

describe('Cajón «Rendimiento (modelo local)» en settings.html', () => {
    it('existe, está en español y vive junto a las conexiones', () => {
        expect(settingsHtml).toContain('id="rpg_local_thinking_policy_box"');
        expect(settingsHtml).toContain('Rendimiento (modelo local)');
        expect(settingsHtml).toContain('id="rpg_thinking_policy_rows"');
        const caja = settingsHtml.slice(settingsHtml.indexOf('id="rpg_local_thinking_policy_box"'));
        expect(caja.slice(0, 4000)).toContain('id="rpg_thinking_policy_reset"');
        expect(caja.slice(0, 4000)).toContain('Restaurar valores heredados');
        // Debajo de «Aplicar a Todos» y antes del siguiente sub-cajón del mismo cajón.
        expect(settingsHtml.indexOf('id="rpg_connection_apply_all_box"')).toBeLessThan(settingsHtml.indexOf('id="rpg_local_thinking_policy_box"'));
        expect(settingsHtml.indexOf('id="rpg_local_thinking_policy_box"')).toBeLessThan(settingsHtml.indexOf('SUB-DRAWER 3'));
    });

    it('explica el requisito del motor y el límite de la ruta de SillyTavern', () => {
        const caja = settingsHtml.slice(settingsHtml.indexOf('id="rpg_local_thinking_policy_box"'));
        const texto = caja.slice(0, 4000);
        expect(texto).toContain('llama.cpp b9982');
        expect(texto).toContain('OpenAI compatible');
        expect(texto).toContain('política queda inerte');
        expect(texto).toContain('Herdar');
        expect(texto).toMatch(/re-prefila/i);
    });
});

describe('Filas del cajón construidas desde THINKING_JOBS (D8)', () => {
    it('un selector y su ruta por cada trabajo', () => {
        for (const job of THINKING_JOBS) {
            const html = fila(job, { mode: 'heredar' }, 'openai');
            expect(html).toContain(`id="rpg_thinking_mode_${job.id}"`);
            expect(html).toContain(`id="rpg_thinking_tokens_${job.id}"`);
            expect(html).toContain(`id="rpg_thinking_route_${job.id}"`);
            expect(html).toContain(job.label);
            expect(html).toContain('title=');
        }
    });

    it('«desactivar» solo aparece en la transcripción y en la compresión (AC3)', () => {
        for (const job of THINKING_JOBS) {
            const html = fila(job, { mode: 'heredar' }, 'openai');
            const ofrece = html.includes('value="desactivar"');
            expect(ofrece, job.id).toBe(job.offEligible);
        }
        expect(fila(THINKING_JOBS.find(j => j.id === 'state_tracker'), { mode: 'heredar' }, 'openai')).toContain('Sin pensamiento');
        expect(fila(THINKING_JOBS.find(j => j.id === 'map_evolution_compress'), { mode: 'heredar' }, 'openai')).toContain('value="desactivar"');
        expect(fila(THINKING_JOBS.find(j => j.id === 'lorebook_agent'), { mode: 'heredar' }, 'openai')).not.toContain('value="desactivar"');
    });

    it('muestra la ruta efectiva: directa frente a SillyTavern inerte', () => {
        const job = THINKING_JOBS.find(j => j.id === 'state_tracker');
        const directa = fila(job, { mode: 'desactivar' }, 'openai');
        expect(directa).toContain('Ruta directa');
        expect(directa).not.toContain('política inerte');
        const inerte = fila(job, { mode: 'desactivar' }, 'default');
        expect(inerte).toContain('Ruta SillyTavern');
        expect(inerte).toContain('política inerte');
        expect(inerte).toContain('Custom Include Body');
    });

    it('el campo de presupuesto solo se muestra cuando hace falta', () => {
        const job = THINKING_JOBS.find(j => j.id === 'map_runtime');
        expect(fila(job, { mode: 'heredar' }, 'openai')).toMatch(/display:none/);
        const conPresupuesto = fila(job, { mode: 'presupuesto', tokens: 1024 }, 'openai');
        expect(conPresupuesto).not.toMatch(/display:none/);
        expect(conPresupuesto).toContain('value="1024"');
        expect(conPresupuesto).toContain('selected');
    });
});

describe('Enlaces del cajón en index.js', () => {
    it('se enlaza al montar la ventana de ajustes', () => {
        expect(indexSource).toContain('bindConnectionApplyAllControls();\n        bindThinkingPolicyControls(settings);');
    });

    it('cada cambio pasa por la validación y guarda', () => {
        expect(indexSource).toMatch(/function saveThinkingPolicyJob\(settings, jobId\)[\s\S]*?normalizeThinkingPolicy\(\{[\s\S]*?settings\.localThinkingPolicy = saneado;\s*\n\s*saveSettings\(\);/);
    });

    it('el botón de restaurar deja el mapa otra vez en heredar', () => {
        expect(indexSource).toMatch(/settings\.localThinkingPolicy = normalizeThinkingPolicy\(\{\}\);/);
        expect(indexSource).toMatch(/function bindThinkingPolicyControls\(settings\)/);
        expect(indexSource).toMatch(/caja\.addEventListener\('toggle', pintar\)/);
    });

    it('el aviso del presupuesto inválido está en español', () => {
        expect(indexSource).toContain("toastr.warning('El presupuesto ha de ser un número entero mayor que cero; el trabajo se queda en Heredar.'");
    });
});
