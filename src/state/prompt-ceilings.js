/**
 * src/state/prompt-ceilings.js — Techos de prompts (ola 4, C5).
 *
 * Módulo PURO (patrón lore-rhythm.js / thinking-policy.js): CERO imports, cero
 * estado persistente, cero red, cero modelo. Cada token se paga en cada
 * re-prefill (sin caché de prefijo), así que aquí se recorta conservando lo más
 * nuevo, por UNIDAD SEMÁNTICA COMPLETA y con split sin pérdida.
 *
 * Reglas cerradas de la spec (D-1 / P1):
 *  - tokens ≈ Math.ceil(longitud / 4). R3: chars/4 SUBESTIMA español y JSON
 *    (~15-30 %): el techo efectivo es mayor que el nominal. Va en el tooltip.
 *  - clampPromptCeiling, en ESTE orden: undefined/null/''/no numérico → default;
 *    0 → 0 = «sin techo» (válido fuera de cota); negativo o decimal → default;
 *    entero fuera de cota → borde más cercano. Campo vacío JAMÁS es «sin techo»
 *    (Number('') === 0).
 *  - applyUnitCeiling descarta unidades ENTERAS oldest-first (o desde la cola,
 *    con { desde: 'nuevas' }) hasta caber; conserva el orden sin partir unidades.
 *  - splitPromptUnits es sin pérdida: unidades.join('') === entrada. El texto
 *    suelto se pega a la unidad previa; sin ninguna unidad no se corta y se
 *    avisa con motivo `sin_unidad`.
 */

/** Defaults de fábrica (D-1). 5 en worldHistory sustituye al 0=todo del lookback. */
export const PROMPT_CEILING_DEFAULTS = Object.freeze({
    trackerMemo: 1600,
    worldBlock: 4096,
    worldHistory: 5,
});

/** Cotas [mín, máx] (D-1). El 0 «sin techo» vive FUERA de la cota a propósito. */
export const PROMPT_CEILING_BOUNDS = Object.freeze({
    trackerMemo: Object.freeze([800, 4000]),
    worldBlock: Object.freeze([2048, 8192]),
    worldHistory: Object.freeze([3, 10]),
});

/** Claves de ajustes que persiste la UI (D-4). */
export const PROMPT_CEILING_SETTINGS_KEYS = Object.freeze({
    trackerMemo: 'rpg_ceiling_tracker_memo',
    worldBlock: 'rpg_ceiling_world_block',
    worldHistory: 'rpg_ceiling_world_history',
});

/** Zonas de recorte, una por punto de D-2. El panel agrupa por prefijo. */
export const PROMPT_CEILING_ZONAS = Object.freeze([
    'ficha_rastreador',
    'ficha_narrador',
    'mundo_narrador',
    'mundo_trabajo',
]);

/** Etiquetas en español para el log `[Multihog][Techos]` (D-3). */
export const PROMPT_CEILING_ZONA_LABELS_ES = Object.freeze({
    ficha_rastreador: 'Ficha→rastreador',
    ficha_narrador: 'Ficha→narrador',
    mundo_narrador: 'Mundo→narrador',
    mundo_trabajo: 'Mundo→trabajo',
});

/** Evento propio del panel (D-3): UNO por llamada con recorte. */
export const PROMPT_CEILING_EVENT = 'rt_prompt_ceiling_cut';

/**
 * Estimación determinista de tokens (D-1): chars/4 hacia arriba.
 * @param {unknown} texto
 * @returns {number}
 */
export function estimatePromptTokens(texto) {
    return Math.ceil(String(texto ?? '').length / 4);
}

/**
 * Clamp determinista de un techo (P1), en este orden estricto:
 * undefined / null / cadena vacía o en blanco / booleano / no numérico → default.
 * 0 → 0 («sin techo», aceptado aunque esté fuera de cota).
 * Negativo o decimal → default. Entero fuera de cota → borde más cercano.
 * @param {'trackerMemo'|'worldBlock'|'worldHistory'} clave
 * @param {unknown} valor
 * @returns {number}
 */
export function clampPromptCeiling(clave, valor) {
    const defecto = PROMPT_CEILING_DEFAULTS[clave];
    if (defecto === undefined) throw new Error(`clampPromptCeiling: clave desconocida "${String(clave)}"`);
    if (valor === undefined || valor === null) return defecto;
    if (typeof valor === 'boolean') return defecto;
    if (typeof valor === 'string' && valor.trim() === '') return defecto;
    const n = Number(valor);
    if (!Number.isFinite(n)) return defecto;
    if (n === 0) return 0;
    if (n < 0 || !Number.isInteger(n)) return defecto;
    const [min, max] = PROMPT_CEILING_BOUNDS[clave];
    if (n < min) return min;
    if (n > max) return max;
    return n;
}

/**
 * Divide un texto en unidades semánticas completas, SIN PÉRDIDA:
 * `unidades.join('') === entrada`. El texto suelto antes de la primera unidad o
 * entre unidades se pega a la unidad previa (prefix → primera).
 *  - tipo 'tag':   bloques `[NOMBRE]…[/NOMBRE]` del memo (pareja exacta, case-insensitive).
 *  - tipo 'world': bloques que arrancan con `### ` al inicio de línea.
 * Sin ninguna unidad → `{ unidades: [], sinUnidad: true }`: el llamador NO corta.
 * @param {unknown} texto
 * @param {'tag'|'world'} tipo
 * @returns {{ unidades: string[], sinUnidad: boolean }}
 */
export function splitPromptUnits(texto, tipo = 'tag') {
    const fuente = String(texto ?? '');
    if (!fuente) return { unidades: [], sinUnidad: true };
    const starts = [];
    if (tipo === 'tag') {
        const re = /\[([A-Z][A-Z0-9_]*)\][\s\S]*?\[\/\1\]/gi;
        for (const m of fuente.matchAll(re)) starts.push(m.index);
    } else {
        for (let i = 0; i < fuente.length; i++) {
            if ((i === 0 || fuente[i - 1] === '\n') && fuente.startsWith('### ', i)) starts.push(i);
        }
    }
    if (!starts.length) return { unidades: [], sinUnidad: true };
    const unidades = [];
    for (let k = 0; k < starts.length; k++) {
        const fin = k + 1 < starts.length ? starts[k + 1] : fuente.length;
        const inicio = k === 0 ? 0 : starts[k];
        // El texto suelto anterior a la unidad k (k>0) quedó pegado a la unidad
        // previa; el que precede a la primera (k=0) se pega a ella: inicio=0.
        unidades.push(fuente.slice(inicio, fin));
    }
    return { unidades, sinUnidad: false };
}

/**
 * Aplica un techo de tokens descartando unidades ENTERAS hasta caber, sin partir
 * ninguna y conservando el orden original de las conservadas.
 *  - `{ desde: 'viejas' }` (por defecto): cae primero la unidad más antigua (cabeza).
 *  - `{ desde: 'nuevas' }`: cae primero la última (cola), orden fijo (R4).
 *  - `{ base: texto }`: texto intocable que se suma al cómputo pero nunca se corta
 *    (p. ej. TRACKER STATE 0 del rastreador, jamás recortable: D-2/P2).
 * techo ≤ 0 o no numérico → sin techo: no corta nada.
 * @param {string[]} unidades
 * @param {unknown} techo tokens
 * @param {{ desde?: 'viejas'|'nuevas', base?: string }} opciones
 * @returns {{ texto: string, conservadas: number, recortadas: number, tokensRecortados: number, excede: boolean }}
 */
export function applyUnitCeiling(unidades, techo, opciones = {}) {
    const lista = (Array.isArray(unidades) ? unidades : []).map(u => String(u ?? ''));
    const base = String(opciones.base ?? '');
    const t = Number(techo);
    const total = arr => estimatePromptTokens(arr.join('') + base);
    if (!Number.isFinite(t) || t <= 0 || total(lista) <= t) {
        return { texto: lista.join(''), conservadas: lista.length, recortadas: 0, tokensRecortados: 0, excede: false };
    }
    const desdeCola = opciones.desde === 'nuevas';
    const vivos = lista.slice();
    let recortadas = 0;
    while (vivos.length > 0 && total(vivos) > t) {
        if (desdeCola) vivos.pop(); else vivos.shift();
        recortadas += 1;
    }
    return {
        texto: vivos.join(''),
        conservadas: vivos.length,
        recortadas,
        tokensRecortados: total(lista) - total(vivos),
        // Con todas las unidades fuera y base aún por encima del techo: el
        // llamador decide el aviso propio (excede_state0 en el rastreador).
        excede: total(vivos) > t,
    };
}

/**
 * Unifica recorte por unidad para los cuatro puntos de D-2: split sin pérdida +
 * techo + anuncio. Con techo 0 o texto que cabe, salida IDÉNTICA a la entrada
 * (AC1) y ni log, ni evento, ni contador (D-3). Si el texto no tiene ninguna
 * unidad, NO se corta y se avisa con motivo `sin_unidad`.
 * @param {unknown} texto texto íntegro candidato al techo
 * @param {unknown} techo tokens (0 = sin techo)
 * @param {'tag'|'world'} tipo
 * @param {string} zona una de PROMPT_CEILING_ZONAS
 * @param {{ desde?: 'viejas'|'nuevas' }} opciones
 * @returns {{ texto: string, recortadas: number }}
 */
export function applyTextCeiling(texto, techo, tipo, zona, opciones = {}) {
    const fuente = String(texto ?? '');
    const t = Number(techo);
    if (!Number.isFinite(t) || t <= 0) return { texto: fuente, recortadas: 0 };
    const { unidades, sinUnidad } = splitPromptUnits(fuente, tipo);
    if (sinUnidad) {
        const tokens = estimatePromptTokens(fuente);
        if (tokens > t) announceCeilingCut(zona, { unidades: 0, tokens, motivo: 'sin_unidad' });
        return { texto: fuente, recortadas: 0 };
    }
    const corte = applyUnitCeiling(unidades, t, opciones);
    if (corte.recortadas > 0) announceCeilingCut(zona, { unidades: corte.recortadas, tokens: corte.tokensRecortados });
    return { texto: corte.texto, recortadas: corte.recortadas };
}

/**
 * Visibilidad de un recorte (D-3): log en español + UN evento `rt_prompt_ceiling_cut`
 * con `detail { zona, unidades, tokens }` (y `motivo` si lo hay). Nunca guarda
 * ajustes. Silencioso si no hay nada que anunciar: el llamador solo llama aquí
 * cuando hay recorte o aviso.
 * @param {string} zona
 * @param {{ unidades?: number, tokens?: number, motivo?: string }} detalle
 * @returns {ReadonlyObject|null} el detail emitido, o null si la zona no es válida
 */
export function announceCeilingCut(zona, detalle = {}) {
    const etiqueta = PROMPT_CEILING_ZONA_LABELS_ES[zona];
    if (!etiqueta) {
        console.warn(`[Multihog][Techos] Zona de recorte desconocida: ${String(zona)}`);
        return null;
    }
    const detail = Object.freeze({
        zona,
        unidades: Number(detalle.unidades) || 0,
        tokens: Number(detalle.tokens) || 0,
        ...(detalle.motivo ? { motivo: String(detalle.motivo) } : {}),
    });
    if (detail.motivo === 'sin_unidad') {
        console.warn(`[Multihog][Techos] ${etiqueta}: el texto supera el techo (${detail.tokens} tok) pero no contiene unidades recortables; se envía íntegro.`);
    } else if (detail.motivo === 'excede_state0') {
        console.warn(`[Multihog][Techos] ${etiqueta}: TRACKER STATE 0 supera el techo en solitario (${detail.tokens} tok); viaja íntegro, nunca se corta.`);
    } else {
        console.info(`[Multihog][Techos] ${etiqueta}: ${detail.unidades} unidad(es) fuera del techo (≈${detail.tokens} tok ahorrados).`);
    }
    if (typeof globalThis.document?.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
        globalThis.document.dispatchEvent(new globalThis.CustomEvent(PROMPT_CEILING_EVENT, { detail }));
    }
    return detail;
}
