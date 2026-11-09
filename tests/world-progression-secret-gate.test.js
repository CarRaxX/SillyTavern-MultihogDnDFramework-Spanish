import { describe, expect, it } from 'vitest';
import { buildWorldProgressionLocationDossiers } from '../world-progression-lib.js';

// Oleada 6b (D-23/T20) — Compuerta de los secretos del GM.
// spec docs/specs/2026-11-09-oleada6b-cortafuegos-informacional-secretos.spec.md
//
// TODO lo de este fichero es SINTÉTICO: ninguna entrada, nombre ni frase pertenece al canon
// de la campaña (D-24). Se comprueban dos cosas: que la regla `AND ALL` de SillyTavern exige
// pista de investigación Y titular, y que el cerrotejo `rpgGmOnly` (D-19) mantiene el secreto
// fuera de los expedientes de Progresión de Mundo.

const AND_ALL = 3;

function keyMatch(buffer, key) {
    const needle = String(key || '').trim().toLowerCase();
    return Boolean(needle) && String(buffer).toLowerCase().includes(needle);
}

/**
 * Espejo mínimo del escaneo de teclas de `public/scripts/world-info.js` de SillyTavern
 * (enum `world_info_logic`: AND_ANY 0 · NOT_ALL 1 · NOT_ANY 2 · AND_ALL 3): sin teclas
 * primarias no hay activación; con `selective` y `keysecondary` no vacío, `AND_ALL` solo
 * activa cuando TODAS las secundarias aparecen en el búfer. Queda aplazado (spec §6)
 * importar el módulo real; aquí se reimplementa la regla que gobierna las entradas
 * `SECRETO:` y nada más. `NOT_ALL`/`NOT_ANY` no los usa ningún secreto.
 */
function activatesByAndAll(entry, buffer) {
    if (entry.constant) return true;
    if (!Array.isArray(entry.key) || !entry.key.length) return false;
    if (!entry.key.some(key => keyMatch(buffer, key))) return false;
    const hasSecondary = entry.selective
        && Array.isArray(entry.keysecondary)
        && entry.keysecondary.length > 0;
    if (!hasSecondary) return true;
    const logic = entry.selectiveLogic ?? 0;
    if (logic === AND_ALL) return entry.keysecondary.every(key => keyMatch(buffer, key));
    if (logic === 0) return entry.keysecondary.some(key => keyMatch(buffer, key));
    return false;
}

// Entrada de prueba con el mismo contrato que las cinco reales (D-23): pista en `key`,
// titular solo en `keysecondary`, `constant` apagado y compuerta `AND ALL`.
const secretoSintetico = {
    comment: 'SECRETO: El pozo seco de Villa Norte',
    content: 'Reservado para el narrador (MARCA-SECRETO-SINTETICO).',
    key: ['pozo seco', 'luces a medianoche'],
    keysecondary: ['alcaldesa Vela'],
    constant: false,
    selective: true,
    selectiveLogic: AND_ALL,
};

const soloTitular = 'La alcaldesa Vela revisa las cuentas del mercado de Villa Norte.';
const soloFrase = 'Alguien jura haber visto luces a medianoche junto al pozo seco.';
const titularYFrase = 'La alcaldesa Vela habló del pozo seco con la voz muy baja.';

// Arnés del canario: una entrada con `rpgGmOnly` cuyo contenido menciona el lugar, o sea,
// un registro que ENTRARÍA en el expediente de `Morrowfen` si el filtro D-19 no existiera.
// Su gemela sin bandera es el control de que el arnés sí inyecta cuando debe.
const booksCanario = {
    Campaign_LOC: {
        entries: {
            1: { comment: 'Morrowfen', key: ['morrowfen'], content: 'Villa portuaria gobernada por dos consejos.' },
        },
    },
    Campaign_Secretos: {
        entries: {
            1: {
                comment: 'SECRETO: El pozo seco de Morrowfen',
                key: ['pozo seco'],
                content: 'Canon del narrador sobre Morrowfen (CANARIO_X).',
                extensions: { rpgGmOnly: true },
            },
            2: {
                comment: 'Crónica del pozo de Morrowfen',
                key: ['pozo'],
                content: 'Crónica abierta sobre Morrowfen (CANARIO_OK).',
            },
        },
    },
};

describe('oleada 6b: compuerta AND ALL del libro de secretos y canario GM-only', () => {
    it('solo titular', () => {
        // El nombre del titular en el búfer, sin ninguna pista de investigación, no abre nada.
        expect(activatesByAndAll(secretoSintetico, soloTitular)).toBe(false);
    });

    it('solo frase', () => {
        // La frase de investigación sola tampoco abre: con `AND ALL` el titular es obligatorio.
        expect(activatesByAndAll(secretoSintetico, soloFrase)).toBe(false);
        // Control de que el endurecimiento 0 → 3 hace algo: con dos teclas secundarias, el
        // defecto `AND ANY` (0) se conforma con una y `AND ALL` (3) exige las dos.
        const dosSecundarias = { ...secretoSintetico, keysecondary: ['alcaldesa Vela', 'el gremio'] };
        const mediaInvestigacion = 'Junto al pozo seco alguien ha preguntado por la alcaldesa Vela.';
        expect(activatesByAndAll({ ...dosSecundarias, selectiveLogic: 0 }, mediaInvestigacion)).toBe(true);
        expect(activatesByAndAll(dosSecundarias, mediaInvestigacion)).toBe(false);
    });

    it('titular y frase', () => {
        // Pista + titular concurrentes: aquí, y solo aquí, se abre el secreto.
        expect(activatesByAndAll(secretoSintetico, titularYFrase)).toBe(true);
    });

    it('canario', () => {
        const result = buildWorldProgressionLocationDossiers(booksCanario, { prefix: 'Campaign' });
        const morrowfen = result.dossiers.find(dossier => dossier.name === 'Morrowfen');
        expect(morrowfen.text).not.toContain('CANARIO_X');
        expect(result.globalContext).not.toContain('CANARIO_X');
        expect(morrowfen.text).toContain('CANARIO_OK');
    });
});
