import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { funcionPrivada, valorConstante } from './helpers/codigo-fuente.js';

vi.mock('../portrait-storage.js', () => ({
    lookupCustomPortraitSrc: () => '',
}));

import {
    extractCurrentTimeStr,
    replaceMemoCurrentTime,
    isRestTimeUnset,
    parseInWorldTime,
    isArchivedQuestStatus,
    parseQuestsFromText,
    questHasEffectiveDeadline,
    isEmergentQuest,
} from '../memo-processor.js';
import {
    parseCombatSideHeader,
    isResolvedCombatantStatusLine,
} from '../src/state/combat-persistence.js';
import { getCardAppearanceSynopsis } from '../src/ui/panel/card-synopsis.js';
import { parseMapArchitectCreateDirective } from '../src/ui/panel/agent-terminal-direct.js';
import { renderSpellGroups } from '../renderer.js';
import { getRouterCategoryBookSuffix, buildRouterCategoryMap } from '../src/state/router-utils.js';
import { normalizeEvolutionThread } from '../map-evolution-lib.js';
import { parseMapArchitectResponse } from '../map-architect-parser.js';
import { coerceMachineEnum, machineTokenAlternation } from '../src/state/bilingual-contract.js';

describe('Bilingual Resilience: Time and Rest parsers', () => {
    it('extracts current time from Spanish time block', () => {
        const timeBlockEs = `Último descanso: 08:00, Día 1\nHora actual: 14:30, Día 1`;
        expect(extractCurrentTimeStr(timeBlockEs)).toBe('14:30, Día 1');

        const timeBlockEs2 = `Ultimo descanso: N/A\nHora: 22:00, Día 2`;
        expect(extractCurrentTimeStr(timeBlockEs2)).toBe('22:00, Día 2');

        const timeBlockEn = `Last Rest: 08:00 AM, Day 1\nCurrent Time: 10:00 PM, Day 1`;
        expect(extractCurrentTimeStr(timeBlockEn)).toBe('10:00 PM, Day 1');
    });

    it('replaces current time while preserving Spanish and English rest headers', () => {
        const memoEs = `[TIME]\nÚltimo descanso: 08:00, Día 1\nHora actual: 12:00, Día 1\n[/TIME]`;
        const updatedEs = replaceMemoCurrentTime(memoEs, 'Hora actual: 16:00, Día 1');
        expect(updatedEs).toContain('Último descanso: 08:00, Día 1');
        expect(updatedEs).toContain('Hora actual: 16:00, Día 1');

        const memoEn = `[TIME]\nLast Rest: 08:00 AM, Day 1\nCurrent Time: 12:00 PM, Day 1\n[/TIME]`;
        const updatedEn = replaceMemoCurrentTime(memoEn, 'Current Time: 04:00 PM, Day 1');
        expect(updatedEn).toContain('Last Rest: 08:00 AM, Day 1');
        expect(updatedEn).toContain('Current Time: 04:00 PM, Day 1');
    });

    it('identifies unset rest time in Spanish and English', () => {
        expect(isRestTimeUnset('NUNCA')).toBe(true);
        expect(isRestTimeUnset('NINGUNO')).toBe(true);
        expect(isRestTimeUnset('NINGUNA')).toBe(true);
        expect(isRestTimeUnset('SIN DESCANSO')).toBe(true);
        expect(isRestTimeUnset('N/A')).toBe(true);
        expect(isRestTimeUnset('NEVER')).toBe(true);
        expect(isRestTimeUnset('08:00 AM, Day 1')).toBe(false);
    });

    it('parses in-world time with Día and Day', () => {
        const minsDay = parseInWorldTime('08:00 AM, Day 1');
        const minsDia = parseInWorldTime('08:00 AM, Día 1');
        const minsDiaNoAccent = parseInWorldTime('08:00 AM, Dia 1');

        expect(minsDay).not.toBeNull();
        expect(minsDia).toBe(minsDay);
        expect(minsDiaNoAccent).toBe(minsDay);

        const minsDay2 = parseInWorldTime('10:00, Día 2');
        expect(minsDay2).toBe(1440 + 10 * 60);
    });
});

describe('Bilingual Resilience: Quests parser', () => {
    it('parses archived status in Spanish and English', () => {
        expect(isArchivedQuestStatus('completed')).toBe(true);
        expect(isArchivedQuestStatus('failed')).toBe(true);
        expect(isArchivedQuestStatus('completada')).toBe(true);
        expect(isArchivedQuestStatus('completado')).toBe(true);
        expect(isArchivedQuestStatus('fallida')).toBe(true);
        expect(isArchivedQuestStatus('vencida')).toBe(true);
        expect(isArchivedQuestStatus('active')).toBe(false);
        expect(isArchivedQuestStatus('activa')).toBe(false);
    });

    it('parses full quest blocks in Spanish', () => {
        const questText = `MISIÓN: El Misterio de la Cripta
  ID: quest_cripta_01
  ESTADO: activa
  EMISOR: Alcalde @ Aldea del Roble
  ACEPTADA: 09:00, Día 1
  PLAZO: 20:00, Día 2
  OBJ_ACTIVO: Investigar la entrada [0/1]
  OBJ_ACTIVO: Recoger tres reliquias (opcional) [1/3]
  RECOMPENSA: 50 Monedas de Oro`;

        const parsed = parseQuestsFromText(questText);
        expect(parsed).toHaveLength(1);
        const q = parsed[0];
        expect(q.title).toBe('El Misterio de la Cripta');
        expect(q.status).toBe('active');
        expect(q.giver_name).toBe('Alcalde');
        expect(q.giver_location).toBe('Aldea del Roble');
        expect(q.deadline_time).toBe('20:00, Día 2');
        expect(q.objectives).toHaveLength(2);
        expect(q.objectives[0].text).toBe('Investigar la entrada');
        expect(q.objectives[0].status).toBe('active');
        expect(q.objectives[0].required).toBe(true);
        expect(q.objectives[1].text).toBe('Recoger tres reliquias');
        expect(q.objectives[1].required).toBe(false);
        expect(q.rewards).toEqual(['50 Monedas de Oro']);

        expect(questHasEffectiveDeadline(q)).toBe(true);
        expect(isEmergentQuest(q)).toBe(false);
    });

    it('identifies emergent quest givers in Spanish', () => {
        expect(isEmergentQuest({ giver_name: 'propio' })).toBe(true);
        expect(isEmergentQuest({ giver_name: 'jugador' })).toBe(true);
        expect(isEmergentQuest({ giver_name: 'emergente' })).toBe(true);
        expect(isEmergentQuest({ giver_name: 'Alcalde' })).toBe(false);
    });
});

describe('Bilingual Resilience: Combat and Status parser', () => {
    it('parses combat side headers in Spanish and English', () => {
        expect(parseCombatSideHeader('ENEMIES:')).toBe('enemies');
        expect(parseCombatSideHeader('ENEMIGOS:')).toBe('enemies');
        expect(parseCombatSideHeader('ALLIES:')).toBe('allies');
        expect(parseCombatSideHeader('ALIADOS:')).toBe('allies');
        expect(parseCombatSideHeader('NON-PARTY ALLIES:')).toBe('allies');
        expect(parseCombatSideHeader('ALIADOS EXTERNOS:')).toBe('allies');
    });

    it('identifies resolved combatant status lines in Spanish and English', () => {
        expect(isResolvedCombatantStatusLine('Status: Defeated')).toBe(true);
        expect(isResolvedCombatantStatusLine('Status: Dead')).toBe(true);
        expect(isResolvedCombatantStatusLine('Estado: Derrotado')).toBe(true);
        expect(isResolvedCombatantStatusLine('Estado: Muerto')).toBe(true);
        expect(isResolvedCombatantStatusLine('Estado: ((PILLS)) Abatido')).toBe(true);
        expect(isResolvedCombatantStatusLine('Estado: Saludable')).toBe(false);
        expect(isResolvedCombatantStatusLine('Status: Healthy')).toBe(false);
    });
});

describe('Bilingual Resilience: NPC Synopsis, Map Directives and Router World Time', () => {
    it('extracts NPC appearance synopsis from Spanish fields', () => {
        const spanishNpc = `[CORE]
Especie / Linaje: Humano de la Tierra
Cuerpo: Joven de piel morena con ojos violetas
Equipo Visible: Gabardina negra y ropa casual
Personalidad: Analítico y reflexivo
Naturaleza Álmica: Manifestado — Punto de Quiebre
[/CORE]`;
        const synopsis = getCardAppearanceSynopsis(spanishNpc);
        expect(synopsis).toBe('Humano de la Tierra — Joven de piel morena con ojos violetas');
    });

    it('parses map creation directives in both Spanish and English', () => {
        const enDirect = 'create a DUNGEON map for "Forgotten Crypt"';
        expect(parseMapArchitectCreateDirective(enDirect)).toEqual({
            kind: 'DUNGEON',
            site: 'Forgotten Crypt',
        });

        const esDirect = 'crear mapa de mazmorra para "Cripta Olvidada"';
        expect(parseMapArchitectCreateDirective(esDirect)).toEqual({
            kind: 'DUNGEON',
            site: 'Cripta Olvidada',
        });

        const esDirect2 = 'crea un mapa de ASENTAMIENTO para \'Aldea del Roble\'';
        expect(parseMapArchitectCreateDirective(esDirect2)).toEqual({
            kind: 'SETTLEMENT',
            site: 'Aldea del Roble',
        });
    });

    it('renders spell groups in Spanish with Nivel and Trucos', () => {
        const html = renderSpellGroups('Trucos: Luz | Nivel 1 (2/3): Misil Mágico');
        expect(html).toContain('Trucos');
        expect(html).toContain('Nivel 1');
        expect(html).toContain('rt-slot-available');
    });
});


// ── C4 aplicado (spec 2026-11-05, T8) ─────────────────────────────────────────
// Un test por cada punto tocado. Las funciones privadas de `router.js` y
// `map-evolution.js` se ejecutan de verdad dentro de un contexto con sus
// dependencias inyectadas (el mismo patrón de `router-snapshot-diet.test.js`),
// así que no hace falta abrir ningún export nuevo ni llamar a un servidor.
const fuenteRouter = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
const fuenteEvolucion = readFileSync(new URL('../map-evolution.js', import.meta.url), 'utf8');

describe('C4 aplicado: categorías del Agente de Lorebook (router-utils.js)', () => {
    it('una categoría en español cae en el libro del stock correcto', () => {
        expect(getRouterCategoryBookSuffix('Mundo')).toBe('World');
        expect(getRouterCategoryBookSuffix('EVENTO')).toBe('Events');
        expect(getRouterCategoryBookSuffix(' PNJ ')).toBe('NPCs');
        expect(getRouterCategoryBookSuffix('Misión')).toBe('Quests');
        expect(getRouterCategoryBookSuffix('Ubicación')).toBe('Locations');
        expect(getRouterCategoryBookSuffix('Facción')).toBe('Factions');
    });

    it('una categoría propia conserva su nombre, acentos incluidos (D6)', () => {
        expect(getRouterCategoryBookSuffix('Bóveda')).toBe('Bóveda');
        expect(getRouterCategoryBookSuffix('Tesoro')).toBe('Tesoro');
        expect(buildRouterCategoryMap({ routerCustomTags: [{ tag: 'Bóveda' }] })).toEqual({ 'BÓVEDA': 'Bóveda' });
    });
});

describe('C4 aplicado: marcador de herramienta (router.js parseTextAction)', () => {
    const parsearTexto = funcionPrivada(fuenteRouter, 'parseTextAction', {
        machineTokenAlternation,
        parseJsonWithColorRepair: (crudo) => {
            try { return { ok: true, value: JSON.parse(crudo) }; } catch (error) { return { ok: false, error: String(error) }; }
        },
    });

    it('acepta «Acción:» escrito en español, también con markdown', () => {
        const en = parsearTexto('Antes nada.\nAction: grep_lore("PjN de prueba")');
        expect(en?.name).toBe('grep_lore');
        expect(en?.args).toEqual({ query: 'PjN de prueba' });

        const es = parsearTexto('Antes nada.\n**Acción:** grep_lore("PjN de prueba")');
        expect(es?.name).toBe('grep_lore');
        expect(es?.args).toEqual({ query: 'PjN de prueba' });

        const esAcentoMal = parsearTexto('Acción:inspect_book("PjN de prueba")');
        expect(esAcentoMal?.name).toBe('inspect_book');
    });

    it('una frase normal en español que contiene «accion» no se vuelve herramienta', () => {
        expect(parsearTexto('La acción del vigilante fue rápida.')).toBeNull();
        expect(parsearTexto('Acción recomendada: esperar fuera de la bóveda.')).toBeNull();
    });
});

describe('C4 aplicado: eje de relación (router.js parseBasicTags)', () => {
    const parsearEtiquetas = funcionPrivada(fuenteRouter, 'parseBasicTags', {
        machineTokenAlternation,
        coerceMachineEnum,
        getSettings: () => ({}),
        RELATIONSHIP_AXES: valorConstante(fuenteRouter, 'RELATIONSHIP_AXES'),
    });

    it('«Amistad» y «Afecto» valen lo que Friendship y Affection', () => {
        const ingles = parsearEtiquetas('[[REL: A_NPCs::3 | Friendship | +15]]');
        const espanol = parsearEtiquetas('[[REL: A_NPCs::3 | Amistad | +15]]');
        expect(espanol.rel).toEqual(ingles.rel);
        expect(espanol.rel).toEqual([{ id: 'A_NPCs::3', field: 'friendship', delta: 15 }]);

        const afecto = parsearEtiquetas('[[REL: A_NPCs::3 | Afecto | -4]]');
        expect(afecto.rel).toEqual([{ id: 'A_NPCs::3', field: 'affection', delta: -4 }]);

        const carino = parsearEtiquetas('[[REL: A_NPCs::3 | CARIÑO | -4]]');
        expect(carino.rel).toEqual([{ id: 'A_NPCs::3', field: 'affection', delta: -4 }]);
    });

    it('un eje inventado sigue sin producir comando', () => {
        expect(parsearEtiquetas('[[REL: A_NPCs::3 | Lealtad | +15]]').rel).toEqual([]);
    });

    it('applyAction pliega el eje antes de validarlo', () => {
        expect(fuenteRouter).toContain("const f = coerceMachineEnum(field, RELATIONSHIP_AXES) || String(field || '').toLowerCase();");
    });
});

describe('C4 aplicado: estado del hilo causal (map-evolution-lib.js)', () => {
    it('abierto, resuelto y transformado valen como el inglés', () => {
        const base = { cause: 'El PjN de prueba encendió la antorcha' };
        expect(normalizeEvolutionThread({ ...base, status: 'Abierto' }).status).toBe('open');
        expect(normalizeEvolutionThread({ ...base, status: 'RESUELTO' }).status).toBe('resolved');
        expect(normalizeEvolutionThread({ ...base, status: 'transformada' }).status).toBe('transformed');
        expect(normalizeEvolutionThread({ ...base, status: 'en_llamas' }).status).toBe('open');
        expect(normalizeEvolutionThread(base).status).toBe('open');
    });

    it('la causa y el resumen salen intactos', () => {
        const hilo = normalizeEvolutionThread({
            cause: 'La Bóveda del Dragón Álmico se derrumbó — Día 4',
            summary: 'Los guardianes huyen al norte, sin plegar acentos',
            status: 'cerrado',
        });
        expect(hilo.status).toBe('resolved');
        expect(hilo.cause).toBe('La Bóveda del Dragón Álmico se derrumbó — Día 4');
        expect(hilo.summary).toBe('Los guardianes huyen al norte, sin plegar acentos');
    });
});

describe('C4 aplicado: claves del compresor de Evolución (map-evolution.js)', () => {
    // El parser ya pliega las claves del contrato (T8): aquí se inyecta tal cual.
    const parsearDigests = funcionPrivada(fuenteEvolucion, 'parseCompressionDigests', {
        parseMapArchitectResponse,
        normalizeMachineKeys: (valor) => valor,
    });

    it('lee «Cuándo» y «Resumen» igual que at y summary', () => {
        const ingles = parsearDigests('{"digests":[{"at":"Día 3","summary":"Cae la torre"}]}');
        const espanol = parsearDigests('{"Resúmenes":[{"Cuándo":"Día 3","Resumen":"Cae la torre"}]}');
        expect(espanol.ok).toBe(true);
        expect(espanol.digests).toEqual(ingles.digests);
    });

    it('sin resumen utilizable falla igual que antes', () => {
        expect(parsearDigests('{"digests":[{"at":"Día 3"}]}')).toMatchObject({ ok: false });
        expect(parsearDigests('texto suelto sin JSON')).toMatchObject({ ok: false });
    });
});

describe('C4 aplicado: JSON con claves en español (map-architect-parser.js)', () => {
    it('pliega las claves del contrato y deja el texto tal cual', () => {
        const salida = parseMapArchitectResponse([
            'Por supuesto, aquí tienes el mapa pedido:',
            '```json',
            '{"Operaciones":[{"Operacion":"ADD_ASSET","Nombre":"Torre Vigía del PjN de prueba","Causa":"Vigilancia"}],"Tipo":"DUNGEON"}',
            '```',
            'Espero que te sirva para la sesión de hoy.',
        ].join('\n'));
        expect(salida.error).toBeNull();
        expect(salida.value.operations[0]).toEqual({ op: 'ADD_ASSET', name: 'Torre Vigía del PjN de prueba', cause: 'Vigilancia' });
        expect(salida.value.type).toBe('DUNGEON');
    });

    it('una clave desconocida y su valor salen intactos', () => {
        const salida = parseMapArchitectResponse('{"Bóveda":{"Nombre Propio":"Álvaro del Pozo"},"notas":"Día 4, 08:00"}');
        expect(salida.value).toEqual({ 'Bóveda': { 'Nombre Propio': 'Álvaro del Pozo' }, notas: 'Día 4, 08:00' });
    });

    it('un JSON truncado sigue devolviendo error en lugar de reventar', () => {
        const salida = parseMapArchitectResponse('{"operations":[{"op":"ADD_ASSET","name":"Torre');
        expect(salida.value).toBeNull();
        expect(salida.error).toMatch(/incomplete|Invalid/i);
    });
});
