import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { THINKING_JOB_IDS, thinkingJobForTrackerPass } from '../src/state/thinking-policy.js';

// T5: cada trabajo de la spec D5 va etiquetado en su propia llamada, así que la
// política llega al cuerpo correcto. Se comprueba el código fuente real: una
// etiqueta mal puesta no se ve en los tests de comportamiento del cuerpo.
const fuente = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');
const indexSource = fuente('../index.js');
const routerSource = fuente('../router.js');
const mapUpdaterSource = fuente('../map-updater.js');
const mapEvolutionSource = fuente('../map-evolution.js');

/** Todas las etiquetas `thinkingJob: '<id>'` literales de un fichero. */
function etiquetas(texto) {
    return [...texto.matchAll(/thinkingJob:\s*'([a-z_]+)'/g)].map(m => m[1]);
}

describe('Trabajo del rastreador según el pase', () => {
    it('auditoría > revisión completa > transcripción', () => {
        expect(thinkingJobForTrackerPass({ isFullContext: true, fullReviewStateMode: true })).toBe('tracker_audit');
        expect(thinkingJobForTrackerPass({ isFullContext: true })).toBe('tracker_audit');
        expect(thinkingJobForTrackerPass({ fullReviewStateMode: true })).toBe('tracker_full_review');
        expect(thinkingJobForTrackerPass({})).toBe('state_tracker');
        expect(thinkingJobForTrackerPass()).toBe('state_tracker');
    });

    it('el pase por chunks etiqueta según isFullContext y fullReviewStateMode', () => {
        expect(indexSource).toContain(
            "thinkingJob: thinkingJobForTrackerPass({ isFullContext, fullReviewStateMode: settings.fullReviewStateMode })",
        );
    });

    it('el pase directo del memo también lleva su trabajo', () => {
        expect(indexSource).toContain(
            "thinkingJob: thinkingJobForTrackerPass({ fullReviewStateMode: settings.fullReviewStateMode })",
        );
    });
});

describe('Etiquetas en el Agente de Lorebook y World Progression', () => {
    it('los cinco puntos del Agente de Lorebook van como lorebook_agent', () => {
        const basicas = routerSource.match(/debugSource: 'Lorebook Agent', thinkingJob: 'lorebook_agent'/g) || [];
        const archivero = routerSource.match(/debugSource: 'Lorebook Archivist', thinkingJob: 'lorebook_agent'/g) || [];
        const turnos = routerSource.match(/_routerSignal, \{ thinkingJob: 'lorebook_agent' \}/g) || [];
        expect(basicas).toHaveLength(2);
        expect(archivero).toHaveLength(1);
        expect(turnos).toHaveLength(2);
    });

    it('los tres pases de World Progression van como world_progression', () => {
        expect((routerSource.match(/debugSource: 'World Progression', thinkingJob: 'world_progression'/g) || [])).toHaveLength(3);
    });

    it('los trabajos de mapas llevan su propio id', () => {
        expect(mapUpdaterSource).toContain("{ thinkingJob: 'map_runtime' }");
        expect(mapEvolutionSource).toContain("debugSource: 'Map Evolution', thinkingJob: 'map_evolution' }");
        expect(mapEvolutionSource).toContain("debugSource: 'Map Evolution', thinkingJob: 'map_evolution_compress' }");
    });
});

describe('Nada fuera del radio de la spec', () => {
    it('solo se etiquetan trabajos de la lista D5', () => {
        const todas = [indexSource, routerSource, mapUpdaterSource, mapEvolutionSource].flatMap(etiquetas);
        expect(todas.length).toBeGreaterThanOrEqual(11);
        for (const id of todas) {
            expect(THINKING_JOB_IDS, `trabajo inventado: ${id}`).toContain(id);
        }
    });

    it('el rastreador nunca se etiqueta como trabajo de juicio en el pase normal', () => {
        // Las dos llamadas del rastreador se resuelven con el helper; nunca puede
        // aparecer una etiqueta fija de auditoría o revisión completa en index.js.
        expect(etiquetas(indexSource)).toEqual([]);
    });
});
