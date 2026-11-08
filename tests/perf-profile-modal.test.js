import { createContext, runInContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { escapeHtml } from '../memo-processor.js';
import { buildDefaultSettings } from '../src/state/defaults.js';
import { AG_CONTROL_KEYS, AG_CONTROL_SPECS, OUTPUT_CAP_JOBS } from '../src/state/agent-controls.js';
import { PERF_PROFILES, describePerfProfileName, previewPerfProfile } from '../src/state/performance-profiles.js';
import { PROMPT_CEILING_SETTINGS_KEYS } from '../src/state/prompt-ceilings.js';
import { clampLoreRhythmCustom, resolveLoreRhythmId, LORE_RHYTHM_CUSTOM_ID } from '../src/state/lore-rhythm.js';
import { perfProfileValues } from '../src/state/performance-profiles.js';

// T11 (spec 2026-11-08, ola 5, D-8): «Aplicar perfil» es acción EXPLÍCITA con
// Popup de confirmación. El resumen lista solo lo que cambia (`actual→nuevo`,
// con la etiqueta española de la matriz), hay UN solo guardado después del «Sí»,
// y la tabla vive en style.css (nada de confirmaciones nativas del navegador).

const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const styleCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

/** PERF_PROFILES es una matriz ordenada (addendum §4): acceso por id. */
const PERF_POR_ID = Object.fromEntries(PERF_PROFILES.map(p => [p.id, p]));

function extraer(nombre) {
    const inicio = indexSource.search(new RegExp(`(?:async )?function ${nombre}\\(`));
    if (inicio < 0) throw new Error(`Falta ${nombre} en index.js`);
    // Corte por la función de nivel superior siguiente (mismo patrón que el resto
    // de arneses de index.js).
    const despues = indexSource.slice(inicio + 1);
    const siguiente = despues.search(/\n(?:async )?function /);
    return siguiente < 0 ? indexSource.slice(inicio) : indexSource.slice(inicio, inicio + 1 + siguiente);
}

let esc;
beforeEach(() => {
    esc = { guardado: 0, avisos: [], info: [], exitos: [] };
});

function toastrSim() {
    const t = (...a) => esc.avisos.push(a);
    t.warning = (...a) => esc.avisos.push(['warning', ...a]);
    t.info = (...a) => esc.info.push(a);
    t.success = (...a) => esc.exitos.push(a);
    t.error = vi.fn();
    return t;
}

/** Contexto vm con los módulos reales y los stubs justos del cajón. */
function contexto(ajustes, popup) {
    const renders = [];
    const ctx = createContext({
        escapeHtml,
        toastr: toastrSim(),
        saveSettings: () => { esc.guardado += 1; },
        SillyTavern: { getContext: () => ({ Popup: popup }) },
        isRouterRunning: () => false,
        runtimeState: { stateModelRunning: false, isLoreOrMapAgentBusyRef: () => false },
        previewPerfProfile,
        perfProfileValues,
        resolveLoreRhythmId,
        LORE_RHYTHM_CUSTOM_ID,
        clampLoreRhythmCustom,
        PROMPT_CEILING_SETTINGS_KEYS,
        AG_CONTROL_KEYS,
        OUTPUT_CAP_JOBS,
        applyLoreRhythmPreset: (settings, fila) => {
            settings.routerRunEvery = { cada_turno: 1, cada_2: 2, cada_3: 3 }[fila];
            settings.routerMaxTurns = { cada_turno: 3, cada_2: 4, cada_3: 5 }[fila];
            return { runEvery: settings.routerRunEvery, maxTurns: settings.routerMaxTurns };
        },
        validateAgentControlSet: (set) => ({
            valido: true, avisos: [], cambios: [],
            valores: {
                routerMaxTurns: set.routerMaxTurns ?? 5,
                [AG_CONTROL_KEYS.agentRetries]: set[AG_CONTROL_KEYS.agentRetries] ?? 2,
                [AG_CONTROL_KEYS.jsonCorrections]: set[AG_CONTROL_KEYS.jsonCorrections] ?? 2,
            },
        }),
        renderAgentPerfBox: () => renders.push('perf'),
        renderLoreRhythmBox: () => renders.push('rhythm'),
        renderPromptCeilingsBox: () => renders.push('ceilings'),
        renderThinkingPolicyBox: () => renders.push('thinking'),
        suspenderDialPensamientoPorPerfil: () => renders.push('suspension'),
        globalThis: {},
    });
    for (const nombre of ['construirResumenPerfilHtml', 'aplicarPerfilRendimiento', 'confirmarYAplicarPerfil']) {
        runInContext(extraer(nombre), ctx);
    }
    return { ctx, renders };
}

describe('construirResumenPerfilHtml: tabla actual→nuevo con la etiqueta de la matriz', () => {
    it('una fila por mando que cambia, con etiqueta española y ambos valores', () => {
        const { ctx } = contexto({}, { show: { confirm: vi.fn() } });
        const vista = previewPerfProfile(buildDefaultSettings(), 'Rapido', []);
        const html = ctx.construirResumenPerfilHtml(vista);
        expect(html).toContain('rt-perf-diff-tabla');
        expect(html).toContain('<th>Mando</th><th>Ahora</th><th></th><th>Con el perfil</th>');
        for (const d of vista.queCambian) {
            expect(html, d.etiqueta).toContain(`<td>${escapeHtml(d.etiqueta)}</td>`);
            expect(html, d.etiqueta).toContain(escapeHtml(String(d.actual)));
            expect(html, d.etiqueta).toContain(escapeHtml(String(d.nuevo)));
            expect(html).toContain('rt-perf-diff-flecha');
        }
        // Las etiquetas salen de la matriz (D-8): no hay claves crudas en la tabla.
        for (const clave of [AG_CONTROL_KEYS.agentRetries, 'routerMaxTurns']) {
            const enFila = vista.queCambian.some(d => d.etiqueta === clave);
            if (vista.queCambian.some(d => d.clave === clave)) expect(enFila, clave).toBe(false);
        }
    });

    it('escapa HTML hostil en etiquetas y valores (el Popup inyecta HTML)', () => {
        const { ctx } = contexto({}, { show: { confirm: vi.fn() } });
        const vista = {
            perfil: { label: '<img src=x>', resumen: '<script>mal</script>' },
            queCambian: [{ clave: 'x', etiqueta: '<b>Etiqueta</b>', actual: '<i>1</i>', nuevo: '<u>2</u>' }],
            avisos: ['<em>aviso</em>'],
            coste: { pasadas: 3, normal: 9, limpieza: 9 },
        };
        const html = ctx.construirResumenPerfilHtml(vista);
        expect(html).not.toContain('<img src=x>');
        expect(html).not.toContain('<script>mal</script>');
        expect(html).toContain('&lt;b&gt;Etiqueta&lt;/b&gt;');
        expect(html).toContain('&lt;i&gt;1&lt;/i&gt;');
        expect(html).toContain('&lt;u&gt;2&lt;/u&gt;');
        expect(html).toContain('&lt;em&gt;aviso&lt;/em&gt;');
    });

    it('el coste prometido en el resumen es el honesto de los dos bucles', () => {
        const { ctx } = contexto({}, { show: { confirm: vi.fn() } });
        const vista = previewPerfProfile(buildDefaultSettings(), 'Rapido', []);
        const html = ctx.construirResumenPerfilHtml(vista);
        expect(html).toContain(`${vista.coste.pasadas} pasadas`);
        expect(html).toContain(`hasta ${vista.coste.normal} llamadas del bucle normal y ${vista.coste.limpieza} del de limpieza`);
        expect(html).toContain('añaden llamadas, nunca vueltas');
    });

    it('avisos de D-6 y nota de un solo guardado, en español', () => {
        const { ctx } = contexto({}, { show: { confirm: vi.fn() } });
        const vista = previewPerfProfile(buildDefaultSettings(), 'Rapido', []);
        const html = ctx.construirResumenPerfilHtml(vista);
        expect(html).toContain('Se guarda una sola vez');
        expect(html).toContain('no viajan en perfiles');
        const conAvisos = ctx.construirResumenPerfilHtml({ ...vista, avisos: ['se han bajado los reintentos'] });
        expect(conAvisos).toContain('<li>');
    });
});

describe('confirmarYAplicarPerfil: Popup de confirmación y UN solo guardado (D-8)', () => {
    it('usa Popup.show.confirm con la tabla dentro y botones en español', async () => {
        const confirm = vi.fn(async () => 1);
        const ajustes = { ...buildDefaultSettings() };
        const { ctx } = contexto(ajustes, { show: { confirm } });
        const aplicado = await ctx.confirmarYAplicarPerfil(ajustes, 'Rapido');
        expect(aplicado).toBe(true);
        expect(confirm).toHaveBeenCalledTimes(1);
        const [titulo, cuerpo, botones] = confirm.mock.calls[0];
        expect(titulo).toContain(`«${PERF_POR_ID.Rapido.label}»`);
        expect(cuerpo).toContain('rt-perf-diff-tabla');
        expect(botones).toMatchObject({ okButton: 'Aplicar perfil', cancelButton: 'Cancelar' });
    });

    it('cancelado: no escribe nada y devuelve false', async () => {
        const confirm = vi.fn(async () => 0);
        const ajustes = { ...buildDefaultSettings() };
        const { ctx } = contexto(ajustes, { show: { confirm } });
        const antes = JSON.stringify(ajustes);
        const aplicado = await ctx.confirmarYAplicarPerfil(ajustes, 'Rapido');
        expect(aplicado).toBe(false);
        expect(esc.guardado).toBe(0);
        expect(JSON.stringify(ajustes)).toBe(antes);
    });

    it('confirmado: el perfil queda escrito y hay UN solo saveSettings', async () => {
        const confirm = vi.fn(async () => 1);
        const ajustes = { ...buildDefaultSettings() };
        const { ctx } = contexto(ajustes, { show: { confirm } });
        const aplicado = await ctx.confirmarYAplicarPerfil(ajustes, 'Rapido');
        expect(aplicado).toBe(true);
        expect(esc.guardado).toBe(1);
        expect(ajustes.rpgPerfProfile).toBe('Rapido');
        expect(ajustes[AG_CONTROL_KEYS.agentRetries]).toBe(PERF_POR_ID.Rapido.valores[AG_CONTROL_KEYS.agentRetries]);
        expect(ajustes[AG_CONTROL_KEYS.auditChunkBuffer]).toBe(PERF_POR_ID.Rapido.valores[AG_CONTROL_KEYS.auditChunkBuffer]);
    });

    it('repintado completo tras confirmar: cajones del plan y dial suspendido', async () => {
        const confirm = vi.fn(async () => 1);
        const ajustes = { ...buildDefaultSettings() };
        const { ctx, renders } = contexto(ajustes, { show: { confirm } });
        await ctx.confirmarYAplicarPerfil(ajustes, 'Rapido');
        expect(renders).toEqual(expect.arrayContaining(['perf', 'rhythm', 'ceilings', 'thinking', 'suspension']));
    });

    it('sin cambios respecto a fábrica: aviso y el Popup ni se abre (AC0)', async () => {
        const confirm = vi.fn(async () => 1);
        const ajustes = { ...buildDefaultSettings() };
        // Equilibrado ES la fábrica clave a clave: no hay nada que confirmar.
        const { ctx } = contexto(ajustes, { show: { confirm } });
        const aplicado = await ctx.confirmarYAplicarPerfil(ajustes, 'Equilibrado');
        expect(aplicado).toBe(false);
        expect(confirm).not.toHaveBeenCalled();
        expect(esc.guardado).toBe(0);
        expect(esc.info.join(' ')).toContain('no se escribe nada');
    });

    it('inventa un perfil inexistente: aviso, sin Popup y sin escritura', async () => {
        const confirm = vi.fn(async () => 1);
        const ajustes = { ...buildDefaultSettings() };
        const { ctx } = contexto(ajustes, { show: { confirm } });
        const aplicado = await ctx.confirmarYAplicarPerfil(ajustes, 'Turbo');
        expect(aplicado).toBe(false);
        expect(confirm).not.toHaveBeenCalled();
        expect(esc.guardado).toBe(0);
        expect(esc.avisos.join(' ')).toContain('no existe');
    });
});

describe('la tabla vive en style.css y no hay confirmaciones nativas', () => {
    it('style.css define la tabla del resumen con densidad técnica', () => {
        expect(styleCss).toMatch(/\.rt-perf-diff-tabla\s*\{/);
        expect(styleCss).toMatch(/\.rt-perf-diff-valor\s*\{/);
        expect(styleCss).toMatch(/\.rt-perf-diff-flecha\s*\{/);
        // Números alineados: fuente monoespaciada/tabular en los valores.
        const bloque = styleCss.slice(styleCss.indexOf('.rt-perf-diff-valor'));
        expect(bloque.slice(0, 400)).toMatch(/tabular-nums|font-family/);
    });

    it('el flujo de perfiles no usa window.confirm ni alert nativos', () => {
        const cuerpo = extraer('confirmarYAplicarPerfil');
        expect(cuerpo).not.toMatch(/(^|[^.\w])window\.confirm\(/);
        expect(cuerpo).not.toMatch(/(^|[^.\w])alert\(/);
        expect(cuerpo).toContain('Popup.show.confirm');
    });

    it('el título del Popup nombra el perfil con su etiqueta en español', () => {
        expect(describePerfProfileName(buildDefaultSettings())).toBeTruthy();
        const vista = previewPerfProfile(buildDefaultSettings(), 'Calidad', []);
        expect(vista.perfil.label).toBe(PERF_POR_ID.Calidad.label);
    });

    it('toda etiqueta de la matriz es español legible (gobernanza anti-clave-cruda)', () => {
        for (const perfil of Object.values(PERF_PROFILES)) {
            const vista = previewPerfProfile(buildDefaultSettings(), perfil.id, []);
            for (const d of vista.queCambian) {
                expect(d.etiqueta, `${perfil.id}/${d.clave}`).toBeTruthy();
                expect(d.etiqueta, `${perfil.id}/${d.clave}`).not.toMatch(/^[a-z]+[A-Z]/);
            }
        }
    });

    it('la tabla usa la etiqueta de la matriz (§1), no la clave cruda', () => {
        const vista = previewPerfProfile(buildDefaultSettings(), 'Rapido', []);
        const deMandos = vista.queCambian.filter(d => AG_CONTROL_KEYS.agentRetries === d.clave);
        expect(deMandos).toHaveLength(1);
        // La etiqueta del resumen es la corta de la matriz §1; coincide al menos
        // en la primera palabra con la del módulo de mandos (una sola fuente).
        expect(deMandos[0].etiqueta).toContain('Reintentos extra del Agente');
    });
});
