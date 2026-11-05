import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMapArchitectResponse } from '../map-architect-parser.js';
import { normalizeEvolutionThread } from '../map-evolution-lib.js';
import { getRouterCategoryBookSuffix } from '../src/state/router-utils.js';
import { coerceMachineEnum, machineTokenAlternation } from '../src/state/bilingual-contract.js';
import { THINKING_MODES, allowedThinkingModes } from '../src/state/thinking-policy.js';
import { funcionPrivada } from './helpers/codigo-fuente.js';

// Banco dorado del contrato bilingüe (spec 2026-11-05, T9/D7). Cinco familias
// sobre fixtures SINTÉTICOS: ni una sola línea sale de una partida real, y el
// guardián de abajo lo impide. Ninguna prueba toca la red ni un modelo.
const CARPETA = new URL('./fixtures/contrato-bilingue/', import.meta.url);
const fuenteRouter = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
const fuenteEvolucion = readFileSync(new URL('../map-evolution.js', import.meta.url), 'utf8');

const parsearTexto = funcionPrivada(fuenteRouter, 'parseTextAction', {
    machineTokenAlternation,
    parseJsonWithColorRepair: (crudo) => {
        try { return { ok: true, value: JSON.parse(crudo) }; } catch (error) { return { ok: false, error: String(error) }; }
    },
});

const parsearEtiquetas = funcionPrivada(fuenteRouter, 'parseBasicTags', {
    machineTokenAlternation,
    coerceMachineEnum,
    getSettings: () => ({}),
    RELATIONSHIP_AXES: ['friendship', 'affection'],
});

// El parser de Architect ya trae las claves plegadas (T8), así que el compresor
// se ejerce con el parser de verdad delante.
const parsearDigests = funcionPrivada(fuenteEvolucion, 'parseCompressionDigests', {
    parseMapArchitectResponse,
    normalizeMachineKeys: (valor) => valor,
});

/** Cómo se ejecuta y se proyecta cada sujeto del contrato. */
const SUJETOS = {
    'map-architect': (entrada) => {
        const r = parseMapArchitectResponse(String(entrada));
        return { value: r.value, error: !!r.error };
    },
    'compresor': (entrada) => {
        const r = parsearDigests(String(entrada));
        return { ok: !!r.ok, digests: r.digests || null };
    },
    'etiqueta-rel': (entrada) => ({ rel: parsearEtiquetas(String(entrada)).rel }),
    'categoria': (entrada) => ({ sufijo: getRouterCategoryBookSuffix(String(entrada)) }),
    'hilo': (entrada) => {
        const h = normalizeEvolutionThread(entrada);
        return { estado: h?.status ?? null, causa: h?.cause ?? null, resumen: h?.summary ?? null };
    },
    'accion-texto': (entrada) => {
        const r = parsearTexto(String(entrada));
        return { nombre: r?.name ?? null, args: r?.args ?? null };
    },
};

/** Carga los ficheros de la carpeta del banco. */
function cargarBanco() {
    return readdirSync(CARPETA)
        .filter(nombre => nombre.endsWith('.json'))
        .sort()
        .map(nombre => ({
            familia: nombre.replace(/\.json$/, ''),
            casos: JSON.parse(readFileSync(new URL(nombre, CARPETA), 'utf8')),
        }));
}

const BANCO = cargarBanco();
const CASOS = BANCO.flatMap(familia => familia.casos.map(caso => ({ ...familia, caso })));

describe('Banco dorado: guardián de anonimato y forma (D7)', () => {
    it('el banco trae las cinco familias de la spec y casos de sobra', () => {
        const familias = BANCO.map(f => f.familia);
        expect(familias).toEqual(expect.arrayContaining([
            'claves-correctas',
            'enums-en-espanol',
            'json-con-texto-alrededor',
            'truncado',
            'claves-duplicadas',
        ]));
        expect(CASOS.length).toBeGreaterThanOrEqual(15);
    });

    it('todo caso declara id, origen sintético, entrada y esperado con su sujeto', () => {
        const ids = new Set();
        for (const { familia, caso } of CASOS) {
            const donde = `${familia}/${caso?.id || '(sin id)'}`;
            expect(typeof caso.id).toBe('string');
            expect(ids.has(caso.id), `id repetido: ${caso.id}`).toBe(false);
            ids.add(caso.id);
            expect(typeof caso.origen, `falta origen en ${donde}`).toBe('string');
            expect(caso.origen.toLowerCase(), `el origen de ${donde} no declara ser sintético`).toContain('sintét');
            expect('entrada' in caso, `falta entrada en ${donde}`).toBe(true);
            expect(typeof caso.esperado).toBe('object');
            expect(SUJETOS, `sujeto desconocido en ${donde}`).toHaveProperty(caso.esperado.sujeto);
            expect('resultado' in caso.esperado, `falta esperado.resultado en ${donde}`).toBe(true);
        }
    });

    it('ningún fixture contiene identificadores reales de partida', () => {
        // `Libro::uuid`, nombres de libro del stock, uuid de chat o volcados de
        // settings.json son de una partida real: aquí están prohibidos.
        const prohibidos = [
            { nombre: 'clave de entrada de libro', patron: /::/ },
            { nombre: 'libro del stock', patron: /_(?:NPCs|Locations|Quests|Factions|Events|World)\b/ },
            { nombre: 'uuid', patron: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i },
            { nombre: 'ajustes de SillyTavern', patron: /extension_settings|settings\.json|chatId/i },
            { nombre: 'data URL de imagen', patron: /data:image/i },
        ];
        for (const { familia, caso } of CASOS) {
            const texto = JSON.stringify(caso);
            for (const regla of prohibidos) {
                expect(regla.patron.test(texto), `${familia}/${caso.id} lleva ${regla.nombre}`).toBe(false);
            }
        }
    });

    it('toda política declarada es alcanzable por su trabajo (D5)', () => {
        const conPolitica = CASOS.filter(({ caso }) => caso.politica);
        expect(conPolitica.length).toBeGreaterThanOrEqual(2);
        for (const { familia, caso } of conPolitica) {
            const { trabajo, modo } = caso.politica;
            expect(allowedThinkingModes(trabajo), `${familia}/${caso.id}: «${modo}» no vale para ${trabajo}`)
                .toContain(modo);
        }
        // La familia del compresor existe y está en `desactivar` (premisa del operador).
        const compresor = conPolitica.filter(({ caso }) => caso.politica.trabajo === 'map_evolution_compress');
        expect(compresor.length).toBeGreaterThanOrEqual(2);
        for (const { caso } of compresor) {
            expect(caso.politica.modo).toBe(THINKING_MODES.OFF);
            expect(caso.esperado.sujeto).toBe('compresor');
        }
    });
});

describe('Banco dorado: las salidas en español dan las mismas acciones que el inglés', () => {
    for (const { familia, caso } of CASOS) {
        it(`${familia}/${caso.id}`, () => {
            const ejecutar = SUJETOS[caso.esperado.sujeto];
            expect(ejecutar(caso.entrada)).toEqual(caso.esperado.resultado);
        });
    }

    it('cada familia tiene al menos un caso que no está en inglés', () => {
        for (const { familia, casos } of BANCO) {
            if (familia === 'claves-correctas') continue;
            const algunoEnEspanol = casos.some(caso => /[áéíóúñÁÉÍÓÚÑ]/.test(String(caso.entrada)));
            expect(algunoEnEspanol, `la familia ${familia} no prueba el español`).toBe(true);
        }
    });
});
