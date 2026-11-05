import { normalizeMachineKeys } from './src/state/bilingual-contract.js';

/**
 * Pull a JSON object from an otherwise valid fenced/prefaced model response.
 *
 * C4 (spec 2026-11-05): las claves del objeto se pliegan contra la tabla del
 * contrato (`Operaciones` → `operations`, `Nombre` → `name`, `Resumen` →
 * `summary`). Es la única transformación que sufre la respuesta: el JSON puede venir
 * con texto español alrededor, con las claves en español o truncado, y el
 * contenido narrativo de los valores no se toca nunca (D6).
 * @param {string} response
 */
export function parseMapArchitectResponse(response) {
    let source = String(response || '').trim();
    source = source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try { return { value: normalizeMachineKeys(JSON.parse(source)), error: null }; } catch (_) {}

    const start = source.indexOf('{');
    if (start < 0) return { value: null, error: 'No JSON object was found.' };
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index++) {
        const char = source[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') { inString = true; continue; }
        if (char === '{') depth++;
        if (char === '}') {
            depth--;
            if (depth === 0) {
                try { return { value: normalizeMachineKeys(JSON.parse(source.slice(start, index + 1))), error: null }; }
                catch (error) { return { value: null, error: `Invalid JSON: ${error.message}` }; }
            }
        }
    }
    return { value: null, error: 'The JSON object is incomplete or unbalanced.' };
}
