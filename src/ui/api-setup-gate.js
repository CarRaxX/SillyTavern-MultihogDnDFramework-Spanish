/**
 * First-open API checklist. SillyTavern still defaults to Text Completion and
 * cramped token sliders. This overlay shows live status checkboxes; it is not
 * a hard gate and can always be dismissed.
 */

import { getSettings } from '../state/settings-ref.js';
import { saveSettings } from '../app/runtime-bridge.js';
import { GAME_MASTER_CARD_NAME, resolveNarratorCardName } from './game-master-card-lib.js';

export const CHAT_COMPLETION_API = 'openai';
export const RECOMMENDED_OUTPUT_LENGTH = 100000;

const OVERLAY_ID = 'rt-api-setup-gate';
const PULSE_CLASS = 'rt-api-setup-pulse';
const API_SCREENSHOT = '/scripts/extensions/third-party/SillyTavern-MultihogDnDFramework-Spanish/assets/st-api-chat-completion.png';

const API_LABELS = {
    openai: 'Chat Completion',
    textgenerationwebui: 'Text Completion',
    novel: 'NovelAI',
    koboldhorde: 'AI Horde',
    kobold: 'KoboldAI Classic',
};

const CHECKLIST_ITEMS = [
    {
        id: 'chatCompletion',
        title: 'Chat Completion está activado',
        body: 'Text Completion es una API heredada previa al lanzamiento de ChatGPT. No la utilices.',
        shot: true,
    },
    {
        id: 'functionCalling',
        title: 'Llamadas a funciones (Function Calling) activadas',
        body: 'Es crucial para usar la versión más eficaz de herramientas en Multihog D&D, aunque existe un modo alternativo si tu modelo no soporta herramientas.',
    },
    {
        id: 'maxContextUnlocked',
        title: 'Límite de contexto máximo desbloqueado (ilimitado)',
        body: 'No hay motivo para limitar el contexto hoy en día. Se recomienda usar un {{summarizer}} que oculte mensajes antiguos para que el contexto real no supere ~30k tokens. Imponer un límite artificial destruye las coincidencias de caché y aumenta el coste.',
    },
    {
        id: 'outputLength',
        title: 'Longitud de salida configurada en 100.000 tokens',
        body: 'Los valores predeterminados de SillyTavern son extremadamente bajos, lo que puede truncar respuestas largas de agentes (generando errores de sintaxis JSON al cortar la estructura). Configurar 100.000 tokens asegura que los agentes y el narrador puedan responder sin cortes.',
    },
];

export function getSillyTavernMainApi() {
    try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        const fromContext = String(ctx?.mainApi || '').trim();
        if (fromContext) return fromContext;
    } catch (_) { /* context not ready */ }
    if (typeof document === 'undefined') return '';
    return String(document.querySelector('#main_api')?.value || '').trim();
}

export function isChatCompletionApi(api = getSillyTavernMainApi()) {
    return api === CHAT_COMPLETION_API;
}

export function describeMainApi(api = getSillyTavernMainApi()) {
    const id = String(api || '').trim();
    if (!id) return 'not set';
    return API_LABELS[id] || id;
}

export function getChatCompletionSettings() {
    try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        const settings = ctx?.chatCompletionSettings;
        if (settings && typeof settings === 'object') return settings;
    } catch (_) { /* context not ready */ }
    return null;
}

function readBoolSetting(settings, key, selector) {
    if (settings && typeof settings[key] === 'boolean') return settings[key];
    if (typeof document === 'undefined') return false;
    return !!document.querySelector(selector)?.checked;
}

function readNumberSetting(settings, key, selector) {
    if (settings && Number.isFinite(Number(settings[key]))) return Number(settings[key]);
    if (typeof document === 'undefined') return 0;
    const raw = document.querySelector(selector)?.value;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
}

export function isFunctionCallingEnabled(settings = getChatCompletionSettings()) {
    return readBoolSetting(settings, 'function_calling', '#openai_function_calling');
}

export function isMaxContextUnlocked(settings = getChatCompletionSettings()) {
    return readBoolSetting(settings, 'max_context_unlocked', '#oai_max_context_unlocked');
}

export function isOutputLengthRecommended(settings = getChatCompletionSettings()) {
    return readNumberSetting(settings, 'openai_max_tokens', '#openai_max_tokens') >= RECOMMENDED_OUTPUT_LENGTH;
}

export function getApiSetupStatuses() {
    const settings = getChatCompletionSettings();
    return {
        chatCompletion: isChatCompletionApi(),
        functionCalling: isFunctionCallingEnabled(settings),
        maxContextUnlocked: isMaxContextUnlocked(settings),
        outputLength: isOutputLengthRecommended(settings),
    };
}

export function shouldShowApiSetupGate(seen) {
    if (seen === true || seen === false) return seen !== true;
    try {
        return getSettings().apiSetupGateSeen !== true;
    } catch (_) {
        return true;
    }
}

function markGateSeen() {
    try {
        const settings = getSettings();
        settings.apiSetupGateSeen = true;
        saveSettings();
    } catch (_) { /* init race */ }
}

function setDomCheckbox(selector, checked) {
    if (typeof document === 'undefined') return false;
    const el = /** @type {HTMLInputElement|null} */ (document.querySelector(selector));
    if (!el) return false;
    const jq = globalThis.$;
    if (jq && typeof jq === 'function') {
        jq(el).prop('checked', checked).trigger('input');
        return !!el.checked === checked;
    }
    el.checked = checked;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return !!el.checked === checked;
}

function setDomNumber(selector, value) {
    if (typeof document === 'undefined') return false;
    const el = /** @type {HTMLInputElement|null} */ (document.querySelector(selector));
    if (!el) return false;
    const max = Number(el.max);
    if (Number.isFinite(max) && max < value) el.max = String(value);
    const jq = globalThis.$;
    if (jq && typeof jq === 'function') {
        jq(el).val(value).trigger('input');
        return Number(el.value) === value;
    }
    el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return Number(el.value) === value;
}

export function switchSillyTavernToChatCompletion() {
    if (typeof document === 'undefined') return false;
    const select = /** @type {HTMLSelectElement|null} */ (document.querySelector('#main_api'));
    if (!select) return false;
    const option = select.querySelector(`option[value="${CHAT_COMPLETION_API}"]`);
    if (!option) return false;
    const jq = globalThis.$;
    if (jq && typeof jq === 'function') {
        jq(select).val(CHAT_COMPLETION_API).trigger('change');
        return select.value === CHAT_COMPLETION_API;
    }
    if (select.value !== CHAT_COMPLETION_API) {
        select.value = CHAT_COMPLETION_API;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return select.value === CHAT_COMPLETION_API;
}

export function applyRecommendedApiSettings() {
    switchSillyTavernToChatCompletion();
    try {
        const settings = getChatCompletionSettings();
        if (settings) {
            settings.function_calling = true;
            settings.max_context_unlocked = true;
            settings.openai_max_tokens = RECOMMENDED_OUTPUT_LENGTH;
        }
    } catch (_) { /* settings bag not ready */ }
    setDomCheckbox('#openai_function_calling', true);
    setDomCheckbox('#oai_max_context_unlocked', true);
    const applyOutput = () => {
        try {
            const settings = getChatCompletionSettings();
            if (settings) settings.openai_max_tokens = RECOMMENDED_OUTPUT_LENGTH;
        } catch (_) { /* ignore */ }
        setDomNumber('#openai_max_tokens', RECOMMENDED_OUTPUT_LENGTH);
    };
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
        window.setTimeout(applyOutput, 150);
    } else {
        applyOutput();
    }
    return getApiSetupStatuses();
}

export function revealSillyTavernApiDropdown() {
    if (typeof document === 'undefined') return false;
    const select = /** @type {HTMLSelectElement|null} */ (document.querySelector('#main_api'));
    if (!select) return false;
    let node = select.parentElement;
    while (node && node !== document.body) {
        if (node instanceof HTMLElement && node.style.display === 'none') node.style.display = '';
        node = node.parentElement;
    }
    const drawer = select.closest('.drawer-content, .inline-drawer-content, #rm_api_block');
    if (drawer instanceof HTMLElement && drawer.style.display === 'none') drawer.style.display = '';
    select.classList.add(PULSE_CLASS);
    try { select.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) { /* ignore */ }
    try { select.focus(); } catch (_) { /* ignore */ }
    window.setTimeout(() => select.classList.remove(PULSE_CLASS), 8000);
    return true;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const SUMMARIZER_LINK = '<a href="https://github.com/Lodactio/Extension-Summaryception" target="_blank" rel="noopener noreferrer">resumidor (summarizer)</a>';

function renderBody(text) {
    return escapeHtml(text)
        .replace(/\n\n/g, '</span><span class="rt-api-setup-item-why">')
        .replace(/\{\{summarizer\}\}/g, SUMMARIZER_LINK);
}

function renderChecklist(statuses) {
    return CHECKLIST_ITEMS.map(item => {
        const ok = !!statuses[item.id];
        const shot = item.shot
            ? `<img class="rt-api-setup-shot" src="${API_SCREENSHOT}" alt="Selector de API de SillyTavern con Chat Completion seleccionado">`
            : '';
        return `
            <div class="rt-api-setup-item${ok ? ' is-ok' : ''}">
                <input type="checkbox" disabled ${ok ? 'checked' : ''} aria-label="${escapeHtml(item.title)}">
                <span>
                    <span class="rt-api-setup-item-title">${escapeHtml(item.title)}</span>
                    <span class="rt-api-setup-item-why">${renderBody(item.body)}</span>
                    ${shot}
                </span>
            </div>`;
    }).join('');
}

export function buildOverlayHtml(statuses = getApiSetupStatuses(), options = {}) {
    const doneCount = Object.values(statuses).filter(Boolean).length;
    const narratorCardName = resolveNarratorCardName(options.narratorCardName);
    return `
        <div class="rt-api-setup-card" role="dialog" aria-labelledby="rt-api-setup-title">
            <div class="rt-api-setup-scroll">
            <div class="rt-api-setup-kicker">Anti-Museum Tour</div>
            <h2 id="rt-api-setup-title">Ajustes de API de SillyTavern a revisar</h2>
            <p>Este menú nace tras meses de revisar informes de error y descubrir que el 98% de las veces la causa son los ajustes por defecto de SillyTavern. Si se reciben errores de sintaxis JSON suele ser debido a que ST limita demasiado la longitud de salida máxima por defecto.</p>
            <div class="rt-api-setup-list" id="rt-api-setup-list">
                ${renderChecklist(statuses)}
            </div>
            <div class="rt-api-setup-gm-block">
                <div class="rt-api-setup-gm-row">
                    <label class="rt-api-setup-gm-label" for="rt-api-setup-gm-name">Nombre de ficha del narrador</label>
                    <input id="rt-api-setup-gm-name" class="rt-api-setup-gm-name text_pole" type="text" value="${escapeHtml(narratorCardName)}" placeholder="${escapeHtml(GAME_MASTER_CARD_NAME)}" maxlength="120">
                    <button type="button" class="rt-api-setup-create-gm" id="rt-api-setup-create-gm">Crear ficha de narrador</button>
                </div>
                <p class="rt-api-setup-gm-note">Multihog no utiliza un formato de chat 1 a 1, sino un formato narrativo similar a una novela que permite gestionar múltiples personajes con fluidez. Los mensajes se atribuyen a un narrador, no a un único personaje.</p>
            </div>
            <div class="rt-api-setup-status ${doneCount === 4 ? 'rt-api-setup-status-ok' : 'rt-api-setup-status-bad'}">
                ${doneCount} / 4 ajustes recomendados activos. API actual: <b>${escapeHtml(describeMainApi())}</b>.
            </div>
            </div>
            <div class="rt-api-setup-actions">
                <button type="button" class="rt-api-setup-apply" id="rt-api-setup-apply">Aplicar ajustes recomendados</button>
                <button type="button" class="rt-api-setup-show" id="rt-api-setup-show">Resaltar selector de API</button>
                <button type="button" class="rt-api-setup-continue" id="rt-api-setup-continue">Continuar</button>
            </div>
            <p class="rt-api-setup-foot">Esta pantalla no volverá a aparecer automáticamente tras continuar. Puedes reabrirla en cualquier momento desde General y Visuales → Núcleo y Ramificaciones → Anti-Museum Tour.</p>
        </div>`;
}

function readNarratorCardNameFromOverlay(overlay) {
    const input = /** @type {HTMLInputElement|null} */ (overlay?.querySelector('#rt-api-setup-gm-name'));
    return resolveNarratorCardName(input?.value);
}

function refreshIfOpen() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const narratorCardName = readNarratorCardNameFromOverlay(overlay);
    overlay.innerHTML = buildOverlayHtml(getApiSetupStatuses(), { narratorCardName });
    bindOverlayControls(overlay);
}

function bindOverlayControls(overlay) {
    overlay.querySelector('#rt-api-setup-apply')?.addEventListener('click', () => {
        const switched = switchSillyTavernToChatCompletion();
        applyRecommendedApiSettings();
        if (!switched) revealSillyTavernApiDropdown();
        refreshIfOpen();
        if (typeof window !== 'undefined') window.setTimeout(refreshIfOpen, 180);
    });
    overlay.querySelector('#rt-api-setup-show')?.addEventListener('click', () => {
        revealSillyTavernApiDropdown();
    });
    overlay.querySelector('#rt-api-setup-create-gm')?.addEventListener('click', async () => {
        const btn = /** @type {HTMLButtonElement|null} */ (overlay.querySelector('#rt-api-setup-create-gm'));
        const name = readNarratorCardNameFromOverlay(overlay);
        if (btn) btn.disabled = true;
        try {
            const { createOrSelectGameMasterCard } = await import('./game-master-card.js');
            await createOrSelectGameMasterCard({ name });
        } finally {
            if (btn) btn.disabled = false;
        }
    });
    overlay.querySelector('#rt-api-setup-continue')?.addEventListener('click', () => {
        markGateSeen();
        overlay.remove();
    });
}

export function hideApiSetupGate() {
    if (typeof document === 'undefined') return;
    document.getElementById(OVERLAY_ID)?.remove();
}

export function showApiSetupGate() {
    if (typeof document === 'undefined') return;
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'rt-api-setup-gate';
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = buildOverlayHtml(getApiSetupStatuses());
    bindOverlayControls(overlay);
}

export function syncApiSetupGate() {
    if (shouldShowApiSetupGate()) showApiSetupGate();
    else hideApiSetupGate();
}

function bindLiveStatusRefresh() {
    try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        const eventSource = ctx?.eventSource;
        const eventTypes = ctx?.eventTypes || ctx?.event_types;
        if (eventSource?.on) {
            if (eventTypes?.MAIN_API_CHANGED) eventSource.on(eventTypes.MAIN_API_CHANGED, refreshIfOpen);
            if (eventTypes?.SETTINGS_UPDATED) eventSource.on(eventTypes.SETTINGS_UPDATED, refreshIfOpen);
        }
    } catch (_) { /* ST events not ready */ }
    if (typeof document === 'undefined') return;
    document.addEventListener('change', (event) => {
        if (event.target?.id === 'main_api') refreshIfOpen();
    }, true);
    document.addEventListener('input', (event) => {
        const id = event.target?.id;
        if (id === 'openai_function_calling' || id === 'oai_max_context_unlocked' || id === 'openai_max_tokens') {
            refreshIfOpen();
        }
    }, true);
}

export function installApiSetupGate() {
    if (typeof document === 'undefined') return;
    syncApiSetupGate();
    bindLiveStatusRefresh();
}
