/**
 * src/ui/agent-settings-editor.js — Editor de los prompts de Revisión de Estado
 * Completa (ola 5, C9/D-4/D-5).
 *
 * Por qué existe un editor propio: con «Revisión de Estado Completa» activa, los
 * dos `textarea` de siempre quedan `disabled` y se les pinta la fábrica (los
 * cuatro sitios: `index.js:7517`, `:7788`, `:10151` y `:13421`). Habilitarlos
 * obligaría a reabrir cuatro sitios de escritura y los `input` de
 * `systemPromptTemplate`/`userPromptSuffix`, con riesgo de verter texto de
 * revisión dentro del Core Prompt del usuario. Así que los `textarea` siguen de
 * solo lectura y la edición vive en ESTE cajón, que solo escribe las dos claves de
 * override.
 *
 * El módulo es PURO: fabrica cadenas HTML y valida texto. El DOM real lo monta
 * `index.js`; aquí no hay `document`, ni `jQuery`, ni `saveSettings`, ni modelo.
 *
 * Reglas de la spec:
 *  - vacío = fábrica (el override NO se envía: viaja la resolución de D-4);
 *  - «Restaurar fábrica» deja las dos claves en `''` SIN pintar la fábrica en los
 *    campos (el campo queda vacío, que es lo que significa «fábrica»);
 *  - techo con `clampPromptCeiling` (D-5): un override desmedido desbordaría el
 *    slot `parallel = 1`;
 *  - sin herramienta tras validar: cero reenvíos, solo aviso (T10) — por eso
 *    escribir no dispara ninguna petición ni ninguna pasada del rastreador.
 */

import { FULL_REVIEW_STATE_SYSTEM_PROMPT, FULL_REVIEW_USER_PROMPT_SUFFIX } from '../state/defaults.js';
import { clampPromptCeiling, estimatePromptTokens } from '../state/prompt-ceilings.js';

/** Claves que escribe el editor (D-4). Nada más. */
export const FULL_REVIEW_OVERRIDE_KEYS = Object.freeze({
    system: 'fullReviewSystemPromptOverride',
    suffix: 'fullReviewUserPromptSuffixOverride',
});

/**
 * Techo del system override (D-5), delegando en el aplicador de la ola 4: se pide
 * el borde superior de la cota de bloque (8192 tokens), que es lo que cabe en el
 * contexto del slot sin desplazar la auditoría. No se inventa una cota nueva.
 */
export const FULL_REVIEW_SYSTEM_TOKEN_CEILING = clampPromptCeiling('worldBlock', 8192);

/** Techo del sufijo en caracteres (addendum §3). */
export const FULL_REVIEW_SUFFIX_MAX_CHARS = 20000;

/**
 * Placeholders que la ruta de Revisión Completa sí sabe sustituir. El system solo
 * sustituye `{{modulesText}}` (`index.js:3574`); el sufijo admite las dos macros
 * de SillyTavern. Cualquier otra `{{llave}}` del sufijo se rechaza (addendum §3)
 * porque viajaría literal al modelo.
 */
export const FULL_REVIEW_ALLOWED_PLACEHOLDERS = Object.freeze(['{{char}}', '{{user}}', '{{modulesText}}', '{{actionRequestRaw}}']);

/** Tokens que el parser exige en el system no vacío (addendum §3). */
export const FULL_REVIEW_REQUIRED_TOKENS = Object.freeze(['{{modulesText}}', '[TAG]', '[/TAG]', 'REMOVED']);

/** Los campos del cajón, para que el test y el handler compartan nombres. */
export const FULL_REVIEW_EDITOR_FIELDS = Object.freeze(['system', 'suffix']);

/** ¿El override está vacío (o es basura)? Vacío = fábrica. */
function overrideVacio(texto) {
    return texto === undefined || texto === null || String(texto).trim() === '';
}

/**
 * Lista de las `{{llaves}}` que aparecen en un texto (para el aviso honesto).
 * @param {unknown} texto
 * @returns {string[]}
 */
export function listarPlaceholders(texto) {
    return [...new Set(String(texto ?? '').match(/\{\{[^{}]*\}\}/g) || [])];
}

/**
 * Valida el system override (addendum §3). Vacío = fábrica y es válido. Un system
 * no vacío debe traer los cuatro tokens de máquina que el parser necesita:
 * `{{modulesText}}` (lo sustituye `index.js:3574`), la pareja `[TAG]`/`[/TAG]`
 * (`tagPattern` en `memo-processor.js:456`) y `REMOVED` (`isRemoval`,
 * `memo-processor.js:495`). `{{actionRequestRaw}}` SE ADMITE pero no se exige: la
 * fábrica no lo lleva (lo añade la construcción del user), y exigir dejaría el
 * texto de fábrica pegable.
 * @param {unknown} texto
 * @returns {{valido:boolean,motivo:string,avisos:string[],tokens: number,excedeTecho:boolean}}
 */
export function validarFullReviewSystem(texto) {
    if (overrideVacio(texto)) {
        return { valido: true, motivo: '', avisos: [], tokens: 0, excedeTecho: false };
    }
    const textoLimpio = String(texto);
    const faltan = FULL_REVIEW_REQUIRED_TOKENS.filter(token => !textoLimpio.includes(token));
    const tokens = estimatePromptTokens(textoLimpio);
    const excedeTecho = tokens > FULL_REVIEW_SYSTEM_TOKEN_CEILING;
    const avisos = [];
    const desconocidos = listarPlaceholders(textoLimpio).filter(p => !FULL_REVIEW_ALLOWED_PLACEHOLDERS.includes(p));
    if (desconocidos.length) {
        avisos.push(`Placeholders que esta ruta no sustituye: ${desconocidos.join(', ')}. Viajarán como texto literal.`);
    }
    if (excedeTecho) {
        return {
            valido: false,
            motivo: `Supera el techo del cajón (${tokens} tokens estimados frente a ${FULL_REVIEW_SYSTEM_TOKEN_CEILING}): desbordaría el slot. Recórtalo o deja el campo vacío para usar la fábrica.`,
            avisos,
            tokens,
            excedeTecho: true,
        };
    }
    if (faltan.length) {
        return {
            valido: false,
            motivo: `El system de la revisión necesita estos tokens para que la fusión del memo funcione: ${faltan.join(', ')}. Sin ellos la salida no se puede combinar.`,
            avisos,
            tokens,
            excedeTecho: false,
        };
    }
    return { valido: true, motivo: '', avisos, tokens, excedeTecho: false };
}

/**
 * Valida el sufijo de usuario (addendum §3): sin `{{llave}}` salvo `{{char}}` y
 * `{{user}}`, y como mucho 20000 caracteres. Vacío = fábrica.
 * @param {unknown} texto
 * @returns {{valido:boolean,motivo:string,avisos:string[],tokens:number,caracteres:number}}
 */
export function validarFullReviewSufijo(texto) {
    if (overrideVacio(texto)) {
        return { valido: true, motivo: '', avisos: [], tokens: 0, caracteres: 0 };
    }
    const textoLimpio = String(texto);
    const avisos = [];
    const prohibidos = listarPlaceholders(textoLimpio)
        .filter(p => p !== '{{char}}' && p !== '{{user}}');
    if (prohibidos.length) {
        return {
            valido: false,
            motivo: `El sufijo solo admite {{char}} y {{user}}; quita ${prohibidos.join(', ')} o irán literales al modelo.`,
            avisos,
            tokens: estimatePromptTokens(textoLimpio),
            caracteres: textoLimpio.length,
        };
    }
    if (textoLimpio.length > FULL_REVIEW_SUFFIX_MAX_CHARS) {
        return {
            valido: false,
            motivo: `Demasiado largo: ${textoLimpio.length} caracteres (tope ${FULL_REVIEW_SUFFIX_MAX_CHARS}).`,
            avisos,
            tokens: estimatePromptTokens(textoLimpio),
            caracteres: textoLimpio.length,
        };
    }
    return { valido: true, motivo: '', avisos, tokens: estimatePromptTokens(textoLimpio), caracteres: textoLimpio.length };
}

/** Valida uno de los dos campos por su nombre. */
export function validarFullReviewCampo(campo, texto) {
    if (campo === FULL_REVIEW_EDITOR_FIELDS[0]) return validarFullReviewSystem(texto);
    if (campo === FULL_REVIEW_EDITOR_FIELDS[1]) return validarFullReviewSufijo(texto);
    throw new Error(`validarFullReviewCampo: campo desconocido "${String(campo)}"`);
}

/**
 * Resolución del prompt que se envía (D-4). Con el override vacío devuelve la
 * FÁBRICA byte a byte, así AC0 se mantiene y el cuadro de solo lectura deja de
 * mentir cuando haya override.
 * @param {unknown} settings
 * @returns {{system:string,suffix:string,systemEsFabrica:boolean,suffixEsFabrica:boolean,avisos:string[]}}
 */
export function resolveFullReviewPrompt(settings) {
    const avisos = [];
    const crudoSystem = settings?.[FULL_REVIEW_OVERRIDE_KEYS.system];
    const crudoSufijo = settings?.[FULL_REVIEW_OVERRIDE_KEYS.suffix];
    const systemUsable = !overrideVacio(crudoSystem) && validarFullReviewSystem(crudoSystem).valido;
    const sufijoUsable = !overrideVacio(crudoSufijo) && validarFullReviewSufijo(crudoSufijo).valido;
    if (!overrideVacio(crudoSystem) && !systemUsable) {
        avisos.push('El override del system no es válido: se envía el prompt de fábrica.');
    }
    if (!overrideVacio(crudoSufijo) && !sufijoUsable) {
        avisos.push('El override del sufijo no es válido: se envía el sufijo de fábrica.');
    }
    return {
        system: systemUsable ? String(crudoSystem) : FULL_REVIEW_STATE_SYSTEM_PROMPT,
        suffix: sufijoUsable ? String(crudoSufijo) : FULL_REVIEW_USER_PROMPT_SUFFIX,
        systemEsFabrica: !systemUsable,
        suffixEsFabrica: !sufijoUsable,
        avisos,
    };
}

/** Contador en vivo del cajón (tokens ≈ chars/4, con la honestidad de R3). */
export function contadorFullReview(texto, campo = 'system') {
    const limpio = String(texto ?? '');
    if (!limpio.trim()) return 'Vacío: se envía el prompt de fábrica.';
    const tokens = estimatePromptTokens(limpio);
    const base = `${limpio.length} caracteres · ≈${tokens} tokens`;
    if (campo === 'system' && tokens > FULL_REVIEW_SYSTEM_TOKEN_CEILING) {
        return `${base} — por encima del techo (${FULL_REVIEW_SYSTEM_TOKEN_CEILING}): no se guardará`;
    }
    if (campo === 'suffix' && limpio.length > FULL_REVIEW_SUFFIX_MAX_CHARS) {
        return `${base} — por encima del tope de ${FULL_REVIEW_SUFFIX_MAX_CHARS} caracteres: no se guardará`;
    }
    return base;
}

/**
 * HTML del `<details>` propio del cajón (D-5). Todo lo del editor se marca con
 * `data-rpg-agent-*` para que el enlace sea inequívoco y el test lo pueda leer:
 *  - dos `textarea` con `data-rpg-agent-field`;
 *  - un contador por campo con `data-rpg-agent-counter` (en vivo);
 *  - un botón `data-rpg-agent-action="restaurar"`;
 *  - `data-rpg-agent-estado="fabrica|propio"` para el resumen.
 * Los campos salen CON el override guardado (o vacíos = fábrica): nunca se pinta
 * la fábrica dentro del campo, porque «vacío» es justo lo que significa fábrica.
 * @param {unknown} settings
 * @param {{ escapar?: (s: unknown) => string }} [deps]
 * @returns {string}
 */
export function buildFullReviewEditorHtml(settings, deps = {}) {
    const escapar = deps.escapar || (s => String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
    const system = String(settings?.[FULL_REVIEW_OVERRIDE_KEYS.system] ?? '');
    const sufijo = String(settings?.[FULL_REVIEW_OVERRIDE_KEYS.suffix] ?? '');
    const resuelto = resolveFullReviewPrompt(settings);
    const estado = resuelto.systemEsFabrica && resuelto.suffixEsFabrica ? 'fabrica' : 'propio';
    const area = (campo, valor, titulo) => `
        <textarea id="rpg_agent_fr_${campo}" class="text_pole" rows="6" data-rpg-agent-field="${campo}"
            style="width:100%;font-size:0.78em;white-space:pre-wrap;" title="${escapar(titulo)}">${escapar(valor)}</textarea>
        <span class="rt-agent-fr-counter" data-rpg-agent-counter="${campo}" style="font-size:0.72em;opacity:0.75;">${escapar(contadorFullReview(valor, campo))}</span>`;
    return `<div id="rpg_agent_fr_box" class="rt-agent-fr-box" data-rpg-agent-estado="${estado}">
    <div class="rt-agent-fr-title" style="font-size:0.78em;font-weight:bold;opacity:0.85;">📝 Prompt de Revisión de Estado Completa</div>
    <div class="rt-agent-fr-aviso" style="font-size:0.75em;opacity:0.7;line-height:1.4;">
        Solo se aplica con <b>Revisión de Estado Completa</b> activa. <b>Vacío = el prompt de siempre</b>: mientras los dos campos estén vacíos, lo que sale por la red es idéntico byte a byte al de fábrica. Los dos cuadros de arriba siguen de <b>solo lectura</b> para no mezclar este texto con tu Core Prompt. El contador usa 4 caracteres ≈ 1 token y <b>subestima el inglés con acentos y los corchetes</b>. Techo: ${FULL_REVIEW_SYSTEM_TOKEN_CEILING} tokens en el system y ${FULL_REVIEW_SUFFIX_MAX_CHARS} caracteres en el sufijo.
    </div>
    <label title="System de la revisión. Debe traer {{modulesText}}, la pareja [TAG]/[/TAG] y REMOVED: sin ellos el memo no se puede fusionar.">System (obligatorio en lo que respetamos)</label>
    ${area('system', system, 'System propio de la revisión completa. Vacío = fábrica. Debe contener {{modulesText}}, [TAG], [/TAG] y REMOVED.')}
    <label title="Sufijo del mensaje de usuario. Solo admite {{char}} y {{user}}; cualquier otra {{llave}} iría literal al modelo. Tope ${FULL_REVIEW_SUFFIX_MAX_CHARS} caracteres.">Sufijo del mensaje de usuario</label>
    ${area('suffix', sufijo, 'Sufijo propio. Vacío = fábrica. Solo admite {{char}} y {{user}}.')}
    <button type="button" class="menu_button interactable rt-agent-fr-restore" data-rpg-agent-action="restaurar"
        style="width:100%;font-size:11px;" title="Deja los dos campos vacíos: se vuelve a enviar la fábrica byte a byte. No pega el texto de fábrica en los campos, porque vacío significa fábrica.">
        <i class="fa-solid fa-arrow-rotate-left"></i> Restaurar fábrica (deja los campos vacíos)
    </button>
</div>`;
}

/**
 * Escribe un campo del editor (autosave ÚNICO: una sola llamada a `guardar` por
 * edición, D-5/T13). Si el texto no pasa su validador no se escribe nada y se
 * devuelve el motivo para el aviso: un texto desbordado no puede llegar al slot.
 * @param {{ settings: object, guardar?: () => void }} deps
 * @param {'system'|'suffix'} campo
 * @param {unknown} texto
 * @returns {{guardado:boolean,motivo:string,avisos:string[],validacion:object}}
 */
export function aplicarEdicionFullReview(deps, campo, texto) {
    const settings = deps?.settings;
    if (!settings || typeof settings !== 'object') {
        return { guardado: false, motivo: 'No hay ajustes donde escribir.', avisos: [], validacion: { valido: false } };
    }
    const clave = FULL_REVIEW_OVERRIDE_KEYS[campo];
    if (!clave) return { guardado: false, motivo: 'Campo desconocido.', avisos: [], validacion: { valido: false } };
    const validacion = validarFullReviewCampo(campo, texto);
    if (!validacion.valido) {
        return { guardado: false, motivo: validacion.motivo, avisos: validacion.avisos, validacion };
    }
    const limpio = overrideVacio(texto) ? '' : String(texto);
    if (settings[clave] === limpio) {
        // Sin cambio no hay escritura: el autosave único tampoco dispara guardado.
        return { guardado: false, motivo: '', avisos: validacion.avisos, validacion, sinCambio: true };
    }
    settings[clave] = limpio;
    if (typeof deps.guardar === 'function') deps.guardar();
    return { guardado: true, motivo: '', avisos: validacion.avisos, validacion };
}

/**
 * «Restaurar fábrica» (D-5): deja las dos claves en `''`. No devuelve texto de
 * fábrica para pintarlo en los campos: vacío ES la fábrica. Idempotente: pulsarlo
 * dos veces no vuelve a guardar.
 * @param {{ settings: object, guardar?: () => void }} deps
 * @returns {{guardado:boolean,antes:string,despues:string}}
 */
export function restaurarFabricaFullReview(deps) {
    const settings = deps?.settings;
    if (!settings || typeof settings !== 'object') return { guardado: false, antes: '', despues: '' };
    const antes = `${settings[FULL_REVIEW_OVERRIDE_KEYS.system] ? 'system' : ''} ${settings[FULL_REVIEW_OVERRIDE_KEYS.suffix] ? 'sufijo' : ''}`.trim();
    const yaVacío = overrideVacio(settings[FULL_REVIEW_OVERRIDE_KEYS.system])
        && overrideVacio(settings[FULL_REVIEW_OVERRIDE_KEYS.suffix]);
    settings[FULL_REVIEW_OVERRIDE_KEYS.system] = '';
    settings[FULL_REVIEW_OVERRIDE_KEYS.suffix] = '';
    if (yaVacío) return { guardado: false, antes: '', despues: '' };
    if (typeof deps.guardar === 'function') deps.guardar();
    return { guardado: true, antes, despues: '' };
}
