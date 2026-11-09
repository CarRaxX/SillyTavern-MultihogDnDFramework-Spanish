import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    buildWorldProgressionLocationDossiers,
    extractWorldReportForLocation,
    normalizeWorldReportMetadata,
    selectPendingWorldReportsForLocation,
    selectWorldProgressionLocations,
    stampLocationAdvancement,
    WORLD_REPORT_METADATA_KEY,
} from '../world-progression-lib.js';
import { DEFAULT_WORLD_PROGRESSION_SYSTEM_PROMPT } from '../world-progression-prompt.js';

const books = {
    Campaign_LOC: {
        entries: {
            1: {
                comment: 'Morrowfen',
                key: ['morrowfen'],
                content: `A tidal trade town governed by competing ward councils.
[MAP]
{"version":3,"site":"Morrowfen","assets":[{"id":"harbor-watch"}]}
[/MAP]`,
            },
            2: {
                comment: 'Morrowfen :: Docks',
                key: ['docks'],
                content: 'Warehouses and fish markets line the flood-prone quay.',
            },
            3: {
                comment: 'Glassmere',
                key: ['glassmere'],
                content: 'A lake settlement supported by reed farms.',
            },
        },
    },
    Campaign_NPC: {
        entries: {
            1: { comment: 'Captain Ilyra', key: ['ilyra'], content: 'Commands the Morrowfen harbor watch from the Docks.' },
            2: { comment: 'Remote Hermit', key: ['hermit'], content: 'Lives alone beyond the northern glaciers.' },
        },
    },
    Campaign_FAC: {
        entries: {
            1: { comment: 'Salt Compact', key: ['salt compact'], content: 'Controls Morrowfen shipping contracts.' },
            2: { comment: 'Sun Court', key: ['sun court'], content: 'A regional power contesting trade routes.' },
        },
    },
    Campaign_Skeleton: {
        entries: {
            1: { comment: 'Morrowfen', content: 'An obsolete Day 0 seed.', extensions: { rpgCategory: 'LOC' } },
            2: { comment: 'Old Barrow', content: 'An isolated burial hill.', extensions: { rpgCategory: 'LOC' } },
            3: { comment: 'Captain Ilyra', content: 'An obsolete NPC seed in Morrowfen.', extensions: { rpgCategory: 'NPC' } },
            4: { comment: 'Unrealized Envoy', content: 'A legacy named seed assigned to Morrowfen.', extensions: { rpgCategory: 'NPC' } },
        },
    },
    Campaign_World: {
        entries: {
            1: { comment: 'Day 1', content: 'Historical report.' },
        },
    },
};

// Oleada 6a (D-19): arnés «books» duplicado con libros de saga y de sucesos, cada
// uno con una entrada marcada `rpgGmOnly: true` y su gemela sin bandera. El bloque
// «books» de arriba no se toca: el fixture de byte-identidad (g) lo exige idéntico
// a la revisión 25bd74d.
const booksGmOnly = {
    ...books,
    Campaign_Arcos: {
        entries: {
            1: {
                comment: 'ARCO: La Escalera del GM',
                key: ['escalera'],
                content: 'Canon privado del GM sobre Morrowfen: paso 5 y la marca del sello (MARCA-GM-ARCO).',
                extensions: { rpgGmOnly: true },
            },
            2: {
                comment: 'Crónica Abierta de Morrowfen',
                key: ['crónica'],
                content: 'Canon privado del GM sobre Morrowfen: paso 5 y la marca del sello (MARCA-ABIERTA-ARCO).',
            },
        },
    },
    Campaign_Events: {
        entries: {
            1: {
                comment: 'Suceso del Sello Durmiente',
                key: ['sello'],
                content: 'Suceso global: el sello cede con los años (MARCA-GM-SUCESO).',
                extensions: { rpgGmOnly: true },
            },
            2: {
                comment: 'Suceso de la Feria Gremial',
                key: ['feria'],
                content: 'Suceso global: el sello cede con los años (MARCA-ABIERTA-SUCESO).',
            },
        },
    },
};

describe('location-centric World Progression', () => {
    it('builds complete location dossiers while stripping maps and treating entities as constraints', () => {
        const result = buildWorldProgressionLocationDossiers(books, { prefix: 'Campaign' });
        const morrowfen = result.dossiers.find(dossier => dossier.name === 'Morrowfen');

        expect(morrowfen.text).toContain('Morrowfen :: Docks');
        expect(morrowfen.text).toContain('Captain Ilyra');
        expect(morrowfen.text).toContain('READ-ONLY CONSTRAINTS');
        expect(morrowfen.text).not.toContain('[MAP]');
        expect(morrowfen.text).not.toContain('harbor-watch');
        expect(morrowfen.text).not.toContain('obsolete Day 0 seed');
        expect(morrowfen.text).not.toContain('obsolete NPC seed');
        expect(morrowfen.text).not.toContain('Unrealized Envoy');
        expect(morrowfen.hasNarrativeLore).toBe(true);
        expect(result.dossiers.some(dossier => dossier.name === 'Old Barrow')).toBe(true);
        expect(result.globalContext).toContain('Sun Court');
        expect(result.globalContext).not.toContain('Remote Hermit');
    });

    it('rotates oldest-unadvanced locations first and only randomizes equal cohorts', () => {
        const dossiers = buildWorldProgressionLocationDossiers(books, { prefix: 'Campaign' }).dossiers;
        const selected = selectWorldProgressionLocations(dossiers, {
            count: 2,
            lastAdvanced: { morrowfen: 'Day 3, 08:00', glassmere: 'Day 2, 08:00' },
            randomize: false,
        });
        expect(selected.map(dossier => dossier.name)).toEqual(['Old Barrow', 'Glassmere']);

        const stamped = stampLocationAdvancement({}, ['Morrowfen', 'Old Barrow'], 'Day 4, 08:00');
        expect(stamped).toEqual({ morrowfen: 'Day 4, 08:00', 'old barrow': 'Day 4, 08:00' });
    });

    it('routes prose by location section plus wider currents, never by entity mentions', () => {
        const report = `## Morrowfen
Dock labor slows as food prices rise and ward councils lose legitimacy.

## Glassmere
Reed harvests recover after the floodwater recedes.

## Wider Currents
A colder trade wind reverses the prior season's migration pattern.`;
        const excerpt = extractWorldReportForLocation(report, 'Morrowfen', ['Morrowfen', 'Glassmere']);
        expect(excerpt).toContain('Dock labor slows');
        expect(excerpt).toContain('colder trade wind');
        expect(excerpt).not.toContain('Reed harvests recover');

        expect(extractWorldReportForLocation('Captain Ilyra travels north.', 'Morrowfen', [])).toBe('');
    });

    it('keeps older targeted location pressure visible without replaying applied reports', () => {
        const reports = [
            {
                reportId: 'World::1',
                selectedLocations: ['Morrowfen'],
                content: '## Morrowfen\nA dock strike begins.\n\n## Wider Currents\nCredit tightens.',
            },
            ...[2, 3, 4, 5, 6].map(index => ({
                reportId: `World::${index}`,
                selectedLocations: ['Glassmere'],
                content: `## Glassmere\nReeds change ${index}.\n\n## Wider Currents\nCurrent ${index}.`,
            })),
        ];
        const pending = selectPendingWorldReportsForLocation(reports, 'Morrowfen', {
            lookback: 2,
            applied: { 'World::5': { status: 'considered' } },
        });
        expect(pending.map(report => report.reportId)).toEqual(['World::1', 'World::6']);
        expect(pending[0].excerpt).toContain('dock strike begins');
        expect(pending[1].excerpt).toContain('Current 6');
    });

    it('keeps report semantics as prose while storing only identity and routing metadata', () => {
        const entry = {
            comment: 'Day 4, 08:00',
            extensions: {
                [WORLD_REPORT_METADATA_KEY]: {
                    reportId: 'Campaign_World::12',
                    periodLabel: 'Day 4, 08:00',
                    selectedLocations: ['Morrowfen'],
                },
            },
        };
        expect(normalizeWorldReportMetadata(entry, 'Campaign_World', '12')).toEqual({
            reportId: 'Campaign_World::12',
            periodLabel: 'Day 4, 08:00',
            selectedLocations: ['Morrowfen'],
        });
        expect(DEFAULT_WORLD_PROGRESSION_SYSTEM_PROMPT).toContain('directional macro pressures');
        expect(DEFAULT_WORLD_PROGRESSION_SYSTEM_PROMPT).toContain('reverse abruptly');
        expect(DEFAULT_WORLD_PROGRESSION_SYSTEM_PROMPT).toContain('not JSON');
    });

    it('removes eager fan-out and entity pools from runtime wiring', () => {
        const router = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
        const hooks = readFileSync(new URL('../narrative-hooks.js', import.meta.url), 'utf8');
        expect(router).toContain('buildWorldProgressionLocationDossiers');
        expect(router).toContain('LOCATION-CENTRIC RUNTIME CONTRACT');
        expect(router).not.toContain('DESIGNATED ENTITIES FOR THIS PERIOD');
        expect(router).not.toContain('skeletonNpcNames');
        expect(hooks).not.toContain('groundMapsAfterWorldProgression');
    });
});

// Oleada 6a — Blindaje GM-only (D-19) y techos del expediente (D-20):
// spec docs/specs/2026-11-09-oleada6-blindaje-gm-only.spec.md.
describe('oleada 6a: cerrotejo GM-only en Progresión de Mundo', () => {
    it('mantiene fuera del expediente y del contexto global toda entrada con rpgGmOnly', () => {
        const result = buildWorldProgressionLocationDossiers(booksGmOnly, { prefix: 'Campaign' });
        const morrowfen = result.dossiers.find(dossier => dossier.name === 'Morrowfen');

        // (a) Con la bandera, el canon del GM no entra ni en el expediente ni en globalContext.
        expect(morrowfen.text).not.toContain('MARCA-GM-ARCO');
        expect(morrowfen.text).not.toContain('ARCO: La Escalera del GM');
        expect(result.globalContext).not.toContain('MARCA-GM-SUCESO');
        expect(result.globalContext).not.toContain('Suceso del Sello Durmiente');

        // (b) Sin la bandera, la gema idéntica sigue entrando en su canal de siempre.
        expect(morrowfen.text).toContain('MARCA-ABIERTA-ARCO');
        expect(result.globalContext).toContain('MARCA-ABIERTA-SUCESO');
    });
});

// Arnés mínimo de la Oleada 6a (D-20): un lugar pequeño y tres registros de
// contexto grandes que lo mencionan, para medir los techos de forma determinista.
const sufijoRegistro = [' El gremio controla Villa Prueba.', ' El concejo de Villa Prueba tasa las cargas.', ' La cofradía vigila Villa Prueba de noche.'];
const registroGrande = numero => `REGISTRO-${numero} ${'contenido denso del mundo. '.repeat(40)}${sufijoRegistro[numero - 1]}`;
const registroGlobal = numero => `GLOBAL-${numero} ${'crónica del ancho mundo. '.repeat(40)}Fin de la liga ${numero}.`;
const booksTechos = {
    Campaign_LOC: {
        entries: {
            1: { comment: 'Villa Prueba', key: ['villa prueba'], content: 'Lugar pequeño con muelle de piedra.' },
        },
    },
    Campaign_Arcos: {
        entries: {
            1: { comment: 'Trama Primera', key: ['trama primera'], content: registroGrande(1) },
            2: { comment: 'Trama Segunda', key: ['trama segunda'], content: registroGrande(2) },
            3: { comment: 'Trama Tercera', key: ['trama tercera'], content: registroGrande(3) },
        },
    },
    // Registros globales (facciones) para medir el techo de `globalContext`.
    Campaign_FAC: {
        entries: {
            1: { comment: 'Liga Uno', key: ['liga uno'], content: registroGlobal(1) },
            2: { comment: 'Liga Dos', key: ['liga dos'], content: registroGlobal(2) },
            3: { comment: 'Liga Tres', key: ['liga tres'], content: registroGlobal(3) },
        },
    },
};
const villaDe = resultado => resultado.dossiers.find(dossier => dossier.name === 'Villa Prueba');

describe('oleada 6a: techos del expediente y del contexto global', () => {
    it('techo de expediente descarta registros ENTEROS desde el final y anuncia los omitidos', () => {
        const sinTecho = buildWorldProgressionLocationDossiers(booksTechos, { prefix: 'Campaign' });
        const techo = Math.floor(villaDe(sinTecho).text.length * 0.6);
        const cortado = buildWorldProgressionLocationDossiers(booksTechos, { prefix: 'Campaign', dossierMaxChars: techo });
        const texto = villaDe(cortado).text;

        expect(texto).toContain('(2 registros de contexto omitidos por techo)');
        // Longitud TOTAL del expediente (cabecera, contexto y línea de omitidos) bajo el techo.
        expect(texto.length).toBeLessThanOrEqual(techo);
        // El LOCATION LORE viaja intacto y el primer registro sobrevive entero.
        expect(texto).toContain('muelle de piedra');
        expect(texto).toContain(registroGrande(1));
        // Los descartados faltan COMPLETOS: nunca se trunca un registro a mitad.
        for (const numero of [2, 3]) {
            expect(texto).not.toContain(registroGrande(numero));
            expect(texto).not.toContain(`REGISTRO-${numero}`);
        }
    });

    it('techo de expediente en 0 equivale exactamente a no medir nada', () => {
        const sinTecho = buildWorldProgressionLocationDossiers(booksTechos, { prefix: 'Campaign' });
        const conCero = buildWorldProgressionLocationDossiers(booksTechos, { prefix: 'Campaign', dossierMaxChars: 0, globalMaxChars: 0 });
        expect(JSON.stringify(conCero)).toBe(JSON.stringify(sinTecho));
    });

    it('techo de expediente de 1 deja el LOCATION LORE íntegro con el contexto vacío', () => {
        const minimo = buildWorldProgressionLocationDossiers(booksTechos, { prefix: 'Campaign', dossierMaxChars: 1 });
        const texto = villaDe(minimo).text;
        expect(texto).toContain('LOCATION LORE');
        expect(texto).toContain('muelle de piedra');
        expect(texto).not.toContain('PERTINENT CONTEXT');
        expect(texto).not.toContain('REGISTRO-');
        expect(texto).toContain('(3 registros de contexto omitidos por techo)');
    });

    it('techo global descarta registros ENTEROS de globalContext y anuncia los omitidos', () => {
        const sinTecho = buildWorldProgressionLocationDossiers(booksTechos, { prefix: 'Campaign' });
        const techo = Math.floor(sinTecho.globalContext.length * 0.6);
        const cortado = buildWorldProgressionLocationDossiers(booksTechos, { prefix: 'Campaign', globalMaxChars: techo });

        expect(cortado.globalContext).toContain('(2 registros de contexto omitidos por techo)');
        // La línea de omitidos cuenta dentro del techo: la longitud total cabe.
        expect(cortado.globalContext.length).toBeLessThanOrEqual(techo);
        // Sobrevive el primero entero y los descartados faltan COMPLETOS.
        expect(cortado.globalContext).toContain(registroGlobal(1));
        for (const numero of [2, 3]) {
            expect(cortado.globalContext).not.toContain(`GLOBAL-${numero}`);
        }
    });

    it('techo global de 1 deja el respaldo vacío con la línea de omitidos dentro del techo', () => {
        const minimo = buildWorldProgressionLocationDossiers(booksTechos, { prefix: 'Campaign', globalMaxChars: 1 });
        expect(minimo.globalContext).toContain('(No separate regional or global lore records.)');
        expect(minimo.globalContext).toContain('(3 registros de contexto omitidos por techo)');
        expect(minimo.globalContext).not.toContain('GLOBAL-');
    });

    it('los campos de techo guardan como 0 los valores negativos y vacíos', () => {
        // (f) Se evalúa la misma expresión del bindeo `on('input')` en index.js
        // con un `$` de juguete: así el test ata la conducta al cable real de la UI.
        const indexSrc = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
        for (const clave of ['worldProgressionDossierMaxChars', 'worldProgressionGlobalMaxChars']) {
            const m = indexSrc.match(new RegExp(`${clave} = (Math\\.max\\(0, parseInt[^;]+);`));
            expect(m, `bindeo de ${clave} no encontrado en index.js`).toBeTruthy();
            const evaluar = new Function('$', `return (${m[1]});`);
            const conValor = valor => () => ({ val: () => valor });
            expect(evaluar(conValor('-5'))).toBe(0);
            expect(evaluar(conValor(''))).toBe(0);
            expect(evaluar(conValor('20000'))).toBe(20000);
        }
    });

    it('reproduce byte a byte la salida de la revisión 25bd74d con techos 0 y libros sin bandera', () => {
        // (g) Línea base documentada en tests/fixtures/generate-baseline-25bd74d.mjs:
        // el fixture se generó con `node tests/fixtures/generate-baseline-25bd74d.mjs`
        // EJECUTADO CON EL MOTOR INTACTO DE 25bd74d — el generador verifica por
        // sha256 que «world-progression-lib.js», «dungeon-reality.js» y
        // «memo-processor.js» coinciden con `git show 25bd74d:<ruta>` y extrae el
        // arnés «books» de `git show 25bd74d:tests/world-progression-lib.test.js`
        // (aborta si el bloque del fichero de trabajo difiere). Con techos 0 la
        // conducta es la de siempre sin medir (D-20): la salida debe ser idéntica.
        const baseline = readFileSync(new URL('./fixtures/world-progression-baseline-25bd74d.json', import.meta.url), 'utf8').trimEnd();
        const actual = buildWorldProgressionLocationDossiers(books, { prefix: 'Campaign', dossierMaxChars: 0, globalMaxChars: 0 });
        expect(JSON.stringify(actual, null, 2)).toBe(baseline);
    });
});
