/**
 * Editable Lorebook Agent runtime prompt fragments.
 *
 * These used to be hardcoded string literals inside router.js / relationship-prompts.js.
 * Selection logic (which variant applies this pass) stays in code; the wording lives in
 * settings-backed templates the user can edit from the Lorebook Agent prompt UI.
 */

import { getNpcRelationshipMax, relPctOfMax } from './relationship-math.js';

/** Local expand helper — avoids a defaults ↔ fragments ↔ lorebook-prompt-templates cycle. */
function expandFragmentTemplate(template, values = {}) {
    let result = String(template || '');
    for (const [key, value] of Object.entries(values)) {
        result = result.replaceAll(`{{${key}}}`, String(value ?? ''));
    }
    return result;
}

export const LOREBOOK_RUNTIME_FRAGMENT_KEYS = Object.freeze([
    'routerCombatProfileGuidanceBasicTemplate',
    'routerCombatProfileGuidanceAgentTemplate',
    'routerAutoPassRestrictionTemplate',
    'routerManualPassRestrictionTemplate',
    'routerExistingNpcNudgeTemplate',
    'routerRelSectionBasicTemplate',
    'routerRelSectionAgentTemplate',
]);

/** Fragment keys reset together with Basic Mode prompts. */
export const LOREBOOK_BASIC_FRAGMENT_KEYS = Object.freeze([
    'routerCombatProfileGuidanceBasicTemplate',
    'routerRelSectionBasicTemplate',
    'routerAutoPassRestrictionTemplate',
    'routerManualPassRestrictionTemplate',
    'routerExistingNpcNudgeTemplate',
]);

/** Fragment keys reset together with Agent Mode prompts. */
export const LOREBOOK_AGENT_FRAGMENT_KEYS = Object.freeze([
    'routerCombatProfileGuidanceAgentTemplate',
    'routerRelSectionAgentTemplate',
    'routerAutoPassRestrictionTemplate',
    'routerManualPassRestrictionTemplate',
    'routerExistingNpcNudgeTemplate',
]);

const COMBAT_SCOPE_RULE = `- CRÍTICO — UN COMBATIENTE POR PERFIL: un Perfil de Combate es ÚNICAMENTE el bloque de estadísticas propio de ese combatiente individual (desde su línea "Nombre: PV" hasta su línea "Estado:", nada más). NUNCA copies el encabezado "RONDA DE COMBATE N", los encabezados "ENEMIGOS:/ALIADOS NO DEL GRUPO" ni el bloque de *otro* combatiente en él. Si estás actualizando a Schwarzenegev, el contenido del Perfil de Combate contiene únicamente el bloque de Schwarzenegev; las estadísticas de otros combatientes NO pertenecen a él, aunque aparezcan en la misma sección [COMBAT].`;

export const DEFAULT_ROUTER_COMBAT_PROFILE_GUIDANCE_BASIC = `
## PERFIL DE COMBATE (estadísticas mecánicas proporcionadas este turno)
- Fuentes canónicas, en orden de prioridad:
  1. ## ESTADO DE COMBATE ACTIVO — para combatientes listados en [COMBAT], copia el bloque propio de ese combatiente textualmente.
  2. ## ESTADO MECÁNICO DEL GRUPO — para miembros de [PARTY] que YA tengan un Perfil de Combate en MEMORIA ACTIVA, actualiza las estadísticas duraderas (PV máx., BAB/APR, ataque total, CA, salvaciones, atributos, DG, nuevos rasgos de clase/habilidades) para que coincidan con la hoja de [PARTY]. Disparador típico: PARTY LEVEL SYNC / subida de nivel. Mantén el formato del bloque existente; no lo reemplaces por la hoja completa de [PARTY]. NO crees un Perfil de Combate desde [PARTY] si no existía uno previamente. NO reescribas un perfil solo porque cambiaron los PV actuales, PV temporales, estado o ranuras de conjuros.
- **PNJs existentes** (en MEMORIA ACTIVA o ARCHIVO): emite \`[[UPDATE_CORE: Nombre PNJ | Combat Profile | estadísticas actualizadas]]\` — NO un registro completo \`[[NPC:...]]\`.
- **Combatientes totalmente nuevos** sin entrada existente: incluye \`Combat Profile:\` dentro de \`[CORE]\` en un nuevo registro \`[[NPC:...]]\`, y solo desde ESTADO DE COMBATE ACTIVO — nunca desde [PARTY].
- Nunca inventes números de la prosa del DM. PARTY LEVEL SYNC en la narrativa es una señal para leer ## ESTADO MECÁNICO DEL GRUPO.
${COMBAT_SCOPE_RULE}
- Ejemplo: \`[[UPDATE_CORE: Marcus Thorne | Combat Profile | Marcus Thorne: 12/12 HP\\nAtt/def: Longsword (1 attack, +5 / 1d8+2 Slashing) | Chainmail (AC: 15)\\nSaves: Fort +4, Ref +2, Will +1\\nAbilities: Ninguna declarada\\nStatus: Saludable]]\``;

export const DEFAULT_ROUTER_COMBAT_PROFILE_GUIDANCE_AGENT = `
## PERFIL DE COMBATE (estadísticas mecánicas proporcionadas este turno)
- Fuentes canónicas, en orden de prioridad:
  1. ## ACTIVE COMBAT STATE — para combatientes listados en [COMBAT], copia el bloque propio de ese combatiente textualmente.
  2. ## PARTY MECHANICAL STATE — para miembros de [PARTY] con nombre que YA tengan un Perfil de Combate en ACTIVE MEMORY, actualiza las estadísticas duraderas (PV máx., BAB/APR, ataques totales, CA, salvaciones, atributos, DG, nuevos rasgos de clase/habilidades) para que coincidan con la hoja de [PARTY]. Disparador típico: PARTY LEVEL SYNC / subida de nivel. Mantén el formato del bloque existente; no lo reemplaces por la hoja completa de [PARTY]. NO crees un Perfil de Combate desde [PARTY] si no existía uno previamente. NO reescribas un perfil únicamente porque cambiaron los PV actuales, PV temporales, estado o ranuras de conjuros.
- **PNJs existentes** (listados en ACTIVE MEMORY con un ID): usa \`commit({"core": [{"id": "Libro::UID o Nombre PNJ", "field": "Combat Profile", "content": "estadísticas actualizadas"}]})\`. NO vuelvas a registrar todo el PNJ mediante \`record\` ni incrustes un nuevo bloque \`[CORE]\` en \`update\`.
- **Combatientes totalmente nuevos** sin entrada aún en el libro de lore: incluye \`Combat Profile:\` dentro de \`[CORE]\` en un elemento \`record\`, y solo desde ACTIVE COMBAT STATE — nunca desde [PARTY].
- Nunca inventes números de la prosa del DM. PARTY LEVEL SYNC en la narrativa es la señal para leer ## PARTY MECHANICAL STATE.
${COMBAT_SCOPE_RULE}
- Ejemplo (actualizando solo a "Schwarzenegev", ignorando cualquier otro combatiente adyacente): \`commit({"core": [{"id": "Schwarzenegev", "field": "Combat Profile", "content": "Schwarzenegev: 40/45 HP\\nAtt/def: Argument Ender (1 attack, +8 / 2d10+4 Piercing) | Armor (AC: 16)\\nSaves: Fort unknown, Ref unknown, Will unknown\\nAbilities: Ninguna declarada\\nOther: Combatiente aliado temporal\\nStatus: (-) Herido (hasta curarse), Activo (este combate)"}]})\``;

export const DEFAULT_ROUTER_AUTO_PASS_RESTRICTION = `- RESTRICCIÓN DE PASE AUTOMÁTICO: Combat Profile es el único campo [CORE] que puedes actualizar en este pase vía UPDATE_CORE / commit.core. No modifiques Especie, Personalidad, Trasfondo, Hábitos, Fortalezas o Defectos a menos que el usuario dé una instrucción explícita este turno (Prompt Directo). Los cambios de equipo o cuerpo usan UPDATE_APPEARANCE / UPDATE_EQUIPMENT en su lugar.`;

export const DEFAULT_ROUTER_MANUAL_PASS_RESTRICTION = `- PASE DE PROMPT DIRECTO: puedes actualizar cualquier campo de identidad [CORE] elegible ({{eligibleCoreFields}}) cuando la instrucción del usuario lo justifique. Los cambios de equipo o cuerpo siguen usando UPDATE_APPEARANCE / UPDATE_EQUIPMENT. Conserva etiquetas <font color=#RRGGBB>texto</font> y códigos de color hexadecimales; escribe atributos hexadecimales sin comillas (nunca color="#RRGGBB") para que las llamadas a herramientas JSON sigan siendo válidas.`;

export const DEFAULT_ROUTER_EXISTING_NPC_NUDGE = `- Para momentos notables de un PNJ existente que no alteren ningún campo [CORE], añade una línea de crónica/EVENTO con marca de tiempo para que el evento no se pierda.`;

export const DEFAULT_ROUTER_REL_SECTION_BASIC = `## VALORES INICIALES DE RELACIÓN DE PNJ
Cuando registres un NUEVO PNJ, DEBES definir sus valores iniciales de relación usando etiquetas [[REL:]] según el contexto narrativo. Esto es ÚNICAMENTE para los valores iniciales al registrar por primera vez a un PNJ; los cambios continuos de relación son rastreados automáticamente por el sistema. Rango válido: -{{max}} a +{{max}}. Ejemplos:
  [[REL: NombreOUID | friendship | +{{p30}}]]
  [[REL: NombreOUID | affection | {{n05}}]]
Pautas para valores iniciales:
- Amigos de mucho tiempo, compañeros habituales, mentores o socios cercanos: establece una amistad inicial fuerte (ej. +{{p30}} a +{{p60}}).
- Amigos casuales, conocidos colaboradores o encuentros positivos: establece una amistad inicial menor (ej. +{{p10}} a +{{p25}}).
- Interés romántico o seres queridos cercanos: establece afecto y/o amistad inicial (ej. +{{p20}} a +{{p50}}).
- Rivales menores, conocidos antipáticos o encuentros tensos: establece una amistad inicial negativa menor (ej. {{n05}} a {{n15}}).
- Enemigos directos, antagonistas o amenazas mortales: establece una amistad inicial negativa fuerte (ej. {{n20}} a {{n60}}).
- Desconocido/neutral: por defecto 0 (sin variación).`;

export const DEFAULT_ROUTER_REL_SECTION_AGENT = `## RELACIONES DE PNJ
Al registrar un NUEVO PNJ, define sus valores iniciales de relación usando el parámetro \`rel\` en tu llamada commit. Infiere las variaciones iniciales apropiadas según el contexto narrativo. Rango válido: -{{max}} a +{{max}}.
- Amigos de mucho tiempo, compañeros habituales, mentores o socios cercanos: establece una amistad inicial fuerte (ej. +{{p30}} a +{{p60}}).
- Amigos casuales, conocidos colaboradores o encuentros positivos: establece una amistad inicial menor (ej. +{{p10}} a +{{p25}}).
- Interés romántico o seres queridos cercanos: establece afecto y/o amistad inicial (ej. +{{p20}} a +{{p50}}).
- Rivales menores, conocidos antipáticos o encuentros tensos: establece una amistad inicial negativa menor (ej. {{n05}} a {{n15}}).
- Enemigos directos, antagonistas o amenazas mortales: establece una amistad inicial negativa fuerte (ej. {{n20}} a {{n60}}).
- Desconocido/neutral: por defecto 0 (sin variación).
Los cambios continuos de relación son rastreados automáticamente por el sistema a partir de la salida narrativa. NO emitas variaciones de relación para PNJs ya existentes.`;

/**
 * Expand relationship templates that use {{max}} / {{p30}} / {{n05}} style placeholders.
 * @param {string} template
 * @param {number} [max]
 * @returns {string}
 */
export function expandRelationshipPctPlaceholders(template, max) {
    const m = max ?? getNpcRelationshipMax();
    const p = (f) => relPctOfMax(f, m);
    return expandFragmentTemplate(template, {
        max: m,
        p10: p(0.10),
        p20: p(0.20),
        p25: p(0.25),
        p30: p(0.30),
        p50: p(0.50),
        p60: p(0.60),
        n05: p(-0.05),
        n15: p(-0.15),
        n20: p(-0.20),
        n60: p(-0.60),
    });
}

/**
 * @param {Record<string, any>} settings
 * @param {boolean} hasMechanicalStats — true when [COMBAT] and/or [PARTY] is available this pass
 * @param {'basic'|'agent'} [mode]
 * @returns {string}
 */
export function resolveCombatProfileGuidance(settings, hasMechanicalStats, mode = 'basic') {
    if (!hasMechanicalStats) return '';
    const key = mode === 'agent'
        ? 'routerCombatProfileGuidanceAgentTemplate'
        : 'routerCombatProfileGuidanceBasicTemplate';
    const fallback = mode === 'agent'
        ? DEFAULT_ROUTER_COMBAT_PROFILE_GUIDANCE_AGENT
        : DEFAULT_ROUTER_COMBAT_PROFILE_GUIDANCE_BASIC;
    return String(settings?.[key] || fallback);
}

/**
 * @param {Record<string, any>} settings
 * @param {boolean} isManual
 * @param {string} eligibleCoreFieldsList
 * @returns {string}
 */
export function resolveAutoPassRestriction(settings, isManual, eligibleCoreFieldsList) {
    if (!isManual) {
        return String(settings?.routerAutoPassRestrictionTemplate || DEFAULT_ROUTER_AUTO_PASS_RESTRICTION);
    }
    return expandFragmentTemplate(
        String(settings?.routerManualPassRestrictionTemplate || DEFAULT_ROUTER_MANUAL_PASS_RESTRICTION),
        { eligibleCoreFields: eligibleCoreFieldsList },
    );
}

/**
 * @param {Record<string, any>} settings
 * @returns {string}
 */
export function resolveExistingNpcNudge(settings) {
    return String(settings?.routerExistingNpcNudgeTemplate || DEFAULT_ROUTER_EXISTING_NPC_NUDGE);
}

/**
 * @param {Record<string, any>} settings
 * @param {'basic'|'agent'} mode
 * @param {number} [max]
 * @returns {string}
 */
export function resolveRelSection(settings, mode, max) {
    if (!settings?.npcRelationshipBars) return '';
    const key = mode === 'agent' ? 'routerRelSectionAgentTemplate' : 'routerRelSectionBasicTemplate';
    const fallback = mode === 'agent' ? DEFAULT_ROUTER_REL_SECTION_AGENT : DEFAULT_ROUTER_REL_SECTION_BASIC;
    const template = String(settings?.[key] || fallback);
    return expandRelationshipPctPlaceholders(template, max ?? getNpcRelationshipMax(settings)).trim();
}
