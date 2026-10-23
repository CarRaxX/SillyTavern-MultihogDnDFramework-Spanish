import { describe, expect, it, vi } from 'vitest';

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

