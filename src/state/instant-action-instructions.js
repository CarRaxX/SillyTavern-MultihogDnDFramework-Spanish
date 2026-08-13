export const MAX_INSTANT_ACTION_INSTRUCTION_LENGTH = 1000;
export const DEFAULT_INSTANT_ACTION_PLAYER_CARD_WORDS = 150;

/** Normalize one-time Instant Action guidance without persisting it into later turns. */
export function normalizeInstantActionInstructions(value) {
    return String(value || '').trim().slice(0, MAX_INSTANT_ACTION_INSTRUCTION_LENGTH);
}

/** Resolve the Instant Action Player Card length, including the custom option. */
export function resolveInstantActionPlayerCardWords(selection, customValue) {
    const rawValue = selection === 'other' ? customValue : selection;
    const parsed = Number.parseInt(String(rawValue || ''), 10);
    if (!Number.isFinite(parsed)) return DEFAULT_INSTANT_ACTION_PLAYER_CARD_WORDS;
    return Math.max(50, Math.min(5000, parsed));
}

/** Prompt section shared with Instant Action character generation. */
export function buildInstantActionPromptSection(value) {
    const instructions = normalizeInstantActionInstructions(value);
    if (!instructions) return '';
    return `

--- CONFIGURACIÓN INICIAL: ---
${instructions}
Sigue estas instrucciones para el personaje, el entorno inicial, la premisa, el tono o cualquier otro detalle solicitado. Cuando entren en conflicto con valores aleatorios por defecto, estas instrucciones tienen prioridad. Preserva todo el formato de salida requerido.`;
}

/** Opening user message that grounds the narrator in the same one-time guidance. */
export function buildInstantActionOpeningMessage(value) {
    const instructions = normalizeInstantActionInstructions(value);
    if (!instructions) return 'Comenzar la aventura';
    return `Comenzar la aventura.\n\nConfiguración Inicial:\n${instructions}`;
}
