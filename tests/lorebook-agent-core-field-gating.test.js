import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    getEligibleCoreFieldNames,
    isCombatProfileField,
    isAppearanceField,
    isEquipmentField,
} from '../src/state/router-utils.js';
import { DEFAULT_NPC_SECTIONS } from '../src/state/schema-sections.js';

const routerSource = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
const fragmentSource = readFileSync(new URL('../src/state/lorebook-runtime-fragments.js', import.meta.url), 'utf8');
const schemaSource = readFileSync(new URL('../src/state/schema-sections.js', import.meta.url), 'utf8');
const moduleInstrSource = readFileSync(new URL('../src/state/module-instructions.js', import.meta.url), 'utf8');

describe('getEligibleCoreFieldNames', () => {
    it('automatic passes expose only Combat Profile', () => {
        const result = getEligibleCoreFieldNames(DEFAULT_NPC_SECTIONS, false);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatch(/(?:Combat Profile|Perfil de Combate)/);
    });

    it('manual/Direct Prompt passes expose identity fields (including Species) but not Body/Equipment', () => {
        const fields = getEligibleCoreFieldNames(DEFAULT_NPC_SECTIONS, true);
        expect(fields.some(f => /Species|Especie/i.test(f))).toBe(true);
        expect(fields.some(f => /Personality|Personalidad/i.test(f))).toBe(true);
        expect(fields.some(f => /Background|Trasfondo/i.test(f))).toBe(true);
        expect(fields.some(f => /Habits|Hábitos/i.test(f))).toBe(true);
        expect(fields.some(f => /Strengths|Fortalezas/i.test(f))).toBe(true);
        expect(fields.some(f => /Flaws|Debilidades/i.test(f))).toBe(true);
        expect(fields.some(f => /Combat Profile|Perfil de Combate/i.test(f))).toBe(true);
        expect(fields.some(isCombatProfileField)).toBe(true);
        expect(fields).not.toContain('Body');
        expect(fields).not.toContain('Cuerpo');
        expect(fields).not.toContain('Equipment');
        expect(fields).not.toContain('Equipo Equipado');
        expect(fields).not.toContain('Worn Equipment');
        expect(fields.every(f => !/^body$|^cuerpo$|^equipment$|appearance|apariencia/i.test(f))).toBe(true);
        expect(fields.every(f => !isEquipmentField(f))).toBe(true);
    });

    it('manual passes expose custom hex/color NPC sections', () => {
        const sections = [...DEFAULT_NPC_SECTIONS, { name: 'Color Code' }];
        expect(getEligibleCoreFieldNames(sections, true)).toContain('Color Code');
        const autoResult = getEligibleCoreFieldNames(sections, false);
        expect(autoResult).toHaveLength(1);
        expect(autoResult[0]).toMatch(/(?:Combat Profile|Perfil de Combate)/);
    });

    it('falls back to Combat Profile when sections are empty on automatic passes', () => {
        expect(getEligibleCoreFieldNames([], false)).toEqual(['Combat Profile']);
    });
});

describe('router.js core-field gating wiring', () => {
    it('threads isManual into applyAction', () => {
        expect(routerSource).toContain('async function applyAction(action, allBooks = {}, currentTime = \'\', breadcrumb = \'\', isManual = false, options = {})');
        expect(routerSource).toContain('await commitOwnedAction(basicAction)');
        expect(routerSource).toContain('const commitResult = await commitOwnedAction(args)');
        expect(routerSource).toContain('await applyAction(action, archiveBooks, currentTime, breadcrumb, isManual, { canCommit: ownsChat })');
    });

    it('hard-rejects non-Combat-Profile core updates on automatic passes', () => {
        expect(routerSource).toContain('if (!isManual && !isAppearanceField(field) && !isEquipmentField(field) && !isCombatProfileField(field))');
        expect(routerSource).toContain('Automatic pass rejected core update');
    });

    it('commit.core enum uses eligibleCoreFields (not the full section list)', () => {
        expect(routerSource).toContain('const eligibleCoreFields = getEligibleCoreFieldNames(coreSections, isManual)');
        expect(routerSource).toContain("field:   { type: 'string', enum: eligibleCoreFields, description: 'The exact eligible [CORE] field to update this pass.' }");
        expect(fragmentSource).toMatch(/(?:AUTOMATIC PASS RESTRICTION: Combat Profile is the only \[CORE\] field|RESTRICCIÓN DE PASE AUTOMÁTICO: Combat Profile es el único campo \[CORE\])/);
        expect(routerSource).toContain('resolveAutoPassRestriction(settings, isManual, eligibleCoreFieldsList)');
    });

    it('Body/Species/Worn Equipment sections exist with clear, non-overlapping descriptions', () => {
        const names = DEFAULT_NPC_SECTIONS.map(s => s.name);
        expect(names).toEqual(expect.arrayContaining([
            expect.stringMatching(/Species|Especie/),
            expect.stringMatching(/Body|Cuerpo/),
            expect.stringMatching(/Worn Equipment|Equipo Equipado/),
        ]));
        expect(schemaSource).toMatch(/(?:Not a transient outfit-of-the-scene|No es un atuendo pasajero de la escena)/);
        expect(schemaSource).toMatch(/(?:Do NOT describe worn gear here — see Worn Equipment\.|NO describir el equipo equipado aquí — ver Equipo Equipado\.)/);
        const species = DEFAULT_NPC_SECTIONS.find(s => s.id === 'sec_species');
        expect(species?.description).toMatch(/gender|género/i);
    });

    it('prompts nudge chronicle entries for notable existing-NPC moments', () => {
        expect(fragmentSource).toMatch(/(?:For notable existing-NPC moments that do not change any \[CORE\] field|Para momentos notables de un PNJ existente que no alteren ningún campo \[CORE\])/);
        expect(routerSource).toContain('resolveExistingNpcNudge(settings)');
        expect(moduleInstrSource).toMatch(/(?:For notable existing-NPC moments that do not change any \[CORE\] field|Para momentos notables de un PNJ existente que no alteren ningún campo \[CORE\])/);
    });

    it('lets automatic Combat Profile patches follow [PARTY] lasting progression after level-up', () => {
        expect(moduleInstrSource).toMatch(/(?:## PARTY MECHANICAL STATE|## ESTADO MECÁNICO DEL GRUPO)/);
        expect(moduleInstrSource).toMatch(/(?:Do NOT create a Combat Profile from \[PARTY\] if none exists|NO crees un Perfil de Combate desde \[PARTY\] si no existía)/);
        expect(schemaSource).toMatch(/(?:also patch lasting stats from \[PARTY\] after level-up|también actualiza las estadísticas duraderas desde \[PARTY\] tras subir de nivel)/);
    });
});
