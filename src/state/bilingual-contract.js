/**
 * src/state/bilingual-contract.js — Contrato bilingüe tolerante (C4).
 *
 * Un modelo local escrito en español traduce a veces lo que el contrato pide en
 * inglés: la clave de un objeto, la categoría de un registro, el valor de un enum
 * o el marcador de herramienta. Aquí se pliega SOLO ese token de máquina, y solo
 * contra una lista conocida de alias.
 *
 * Regla dura (D6): el plegado nunca toca contenido narrativo, títulos ni nombres
 * propios. Una clave que no esté en la tabla sale intacta, y ningún valor de
 * ninguna clave se transforma jamás. Se amplía así la resiliencia que ya había en
 * `router-utils.js` (`NPC_CORE_FIELD_HINT`, `inferRecordCategory`).
 */

/**
 * Plegado determinista de un token de máquina: NFC → minúsculas (caseFold) →
 * fuera diacríticos → espacios colapsados.
 *
 * Los acentos vienen compuestos (NFC guarda `í` como un solo punto de código),
 * así que para quitarlos hay que descomponer en NFD y eliminar los marcas
 * combinantes `\u0300-\u036F`; al final se vuelve a NFC. Sin ese paso intermedio
 * el plegado no quitaría ningún acento.
 *
 * @param {unknown} valor
 * @returns {string}
 */
export function foldMachineToken(valor) {
    return String(valor ?? '')
        .normalize('NFC')
        .toLowerCase()
        // `caseFold` real: la ß alemana equivale a "ss", y toLowerCase no la toca.
        .replace(/ß/g, 'ss')
        .normalize('NFD')
        .replace(/[\u0300-\u036F]/g, '')
        .normalize('NFC')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Tabla de alias (D6). Cada clave es el token canónico en inglés que ya entiende
 * el contrato; su lista trae las variantes en español y las formas inglesas que
 * el modelo escribe en plural. A propósito se dejan fuera sustantivos sueltos que
 * un usuario puede tener como categoría propia o como nombre de algo ('Grupo',
 * 'Bando', 'Aventura'): alias tan generales romperían la regla de no tocar los
 * nombres propios.
 */
export const MACHINE_TOKEN_ALIASES = Object.freeze({
    // ── Categorías del Agente de Lorebook ──────────────────────────────────────
    NPC: ['NPC', 'PNJ'],
    LOC: ['LOC', 'Location', 'Locations', 'Ubicación', 'Localización', 'Lugar'],
    QUEST: ['QUEST', 'Quest', 'Misión', 'Encargo'],
    FAC: ['FAC', 'Faction', 'Factions', 'Facción'],
    EVENT: ['EVENT', 'Event', 'Evento'],
    WORLD: ['WORLD', 'World', 'Mundo'],

    // ── Ejes de relación de los PNJ ────────────────────────────────────────────
    friendship: ['friendship', 'amistad'],
    affection: ['affection', 'afecto', 'cariño'],

    // ── Estado de los hilos causales de Evolución ──────────────────────────────
    open: ['open', 'abierto', 'abierta', 'activo'],
    resolved: ['resolved', 'resuelto', 'resuelta', 'cerrado', 'terminado', 'finalizado'],
    transformed: ['transformed', 'transformado', 'transformada', 'cambiado'],

    // ── Claves del registro del Agente de Lorebook ─────────────────────────────
    record: ['record', 'registro', 'entrada'],
    update: ['update', 'actualizacion', 'actualizar'],
    activate: ['activate', 'activar', 'activacion'],
    deactivate: ['deactivate', 'desactivar', 'desactivacion'],
    delete_ids: ['delete_ids', 'borrar_ids', 'eliminar_ids', 'ids_a_borrar'],
    rewrite: ['rewrite', 'reescribir', 'reescritura'],
    consolidate: ['consolidate', 'consolidar', 'fusionar'],
    rel: ['rel', 'relacion', 'relaciones'],
    appearance: ['appearance', 'apariencia', 'aspecto'],
    equipment: ['equipment', 'equipo', 'equipamiento'],
    core: ['core', 'nucleo', 'central'],
    targets: ['targets', 'objetivos', 'dianas'],
    survivor: ['survivor', 'superviviente', 'ganador'],

    // ── Claves comunes de cualquier objeto del contrato ────────────────────────
    category: ['category', 'Category', 'categoría', 'tipo_de_registro'],
    label: ['label', 'Label', 'etiqueta'],
    content: ['content', 'Content', 'contenido', 'texto_del_registro'],
    comment: ['comment', 'comentario', 'nota'],
    field: ['field', 'campo', 'eje'],
    delta: ['delta', 'cambio', 'variacion'],
    id: ['id', 'identificador'],
    uid: ['uid', 'clave_unica'],
    action: ['action', 'Action', 'acción', 'Acción', 'orden'],
    name: ['name', 'Name', 'nombre'],
    type: ['type', 'Type', 'tipo'],
    status: ['status', 'Status', 'estado'],
    cause: ['cause', 'causa', 'motivo'],
    actor: ['actor', 'autor', 'responsable'],
    subjectId: ['subjectId', 'subject_id', 'sujetoId', 'sujeto_id', 'sujeto'],
    summary: ['summary', 'Summary', 'resumen', 'sinopsis'],
    at: ['at', 'span', 'cuando', 'fecha', 'momento'],
    digests: ['digests', 'digest', 'resumenes'],
    operations: ['operations', 'operaciones'],
    op: ['op', 'operacion'],
    thread_status: ['thread_status', 'estado_del_hilo', 'estado_hilo'],
    report_outcomes: ['report_outcomes', 'resultados_de_informe', 'resultados_informe'],
    reason: ['reason', 'razon', 'motivo_explicito'],
});

/**
 * Índice plegado `alias plegado → token canónico`. Incluye el propio canónico,
 * para que `Acción`, `ACCION` y `action` lleguen todos al mismo sitio.
 */
export const FOLDED_MACHINE_TOKEN_ALIAS = Object.freeze((() => {
    /** @type {Record<string, string>} */
    const indice = {};
    for (const [canonico, variantes] of Object.entries(MACHINE_TOKEN_ALIASES)) {
        for (const variante of [canonico, ...variantes]) {
            const plegado = foldMachineToken(variante);
            if (!plegado) continue;
            if (!indice[plegado]) indice[plegado] = canonico;
        }
    }
    return indice;
})());

/**
 * Token canónico de un valor de máquina, o `null` si no está en la lista.
 * @param {unknown} valor
 * @returns {string|null}
 */
export function canonicalMachineToken(valor) {
    const plegado = foldMachineToken(valor);
    if (!plegado) return null;
    return FOLDED_MACHINE_TOKEN_ALIAS[plegado] || null;
}

/**
 * Devuelve el miembro canónico de `permitidos` que quiere decir `valor` (D6), o
 * `null` cuando el valor no es ninguno de ellos. Primero coincide exacta, luego
 * plegada, luego por alias.
 * @param {unknown} valor
 * @param {ReadonlyArray<string>|string[]} permitidos
 * @param {Record<string,string>} [alias] índice plegado (se puede acotar por dominio)
 * @returns {string|null}
 */
export function coerceMachineEnum(valor, permitidos, alias = FOLDED_MACHINE_TOKEN_ALIAS) {
    const lista = Array.isArray(permitidos) ? permitidos : [];
    if (typeof valor !== 'string' && typeof valor !== 'number') return null;
    const crudo = String(valor);
    if (lista.includes(crudo)) return crudo;
    const plegado = foldMachineToken(crudo);
    if (!plegado) return null;
    const exacta = lista.find(membero => foldMachineToken(membero) === plegado);
    if (exacta) return exacta;
    const canonico = alias?.[plegado];
    if (canonico && lista.includes(canonico)) return canonico;
    return null;
}

/**
 * Alternativa de regex para construir expresiones que acepten los alias crudos de un
 * token (p. ej. el marcador `Action:` / `Acción:`). Se usan las formas originales,
 * no plegadas, para que la expresión siga siendo literal sobre el texto.
 * @param {string} canonico
 * @returns {string}
 */
export function machineTokenAlternation(canonico) {
    const variantes = [canonico, ...(MACHINE_TOKEN_ALIASES[canonico] || [])]
        .map(v => String(v).trim())
        .filter(Boolean);
    const unicas = [...new Set(variantes)];
    return unicas.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
}

/**
 * Traduce las claves conocidas de un objeto al nombre del contrato (D6). Solo se
 * renombran claves que estén en la tabla y cuyo canónico no esté ya presente;
 * cualquier otra clave, y todos los valores, salen intactos.
 * @param {unknown} valor
 * @param {{maxDepth?: number}} [opciones]
 * @returns {unknown}
 */
export function normalizeMachineKeys(valor, opciones = {}) {
    const maxDepth = Number.isSafeInteger(opciones.maxDepth) ? opciones.maxDepth : 8;
    /** @param {unknown} nodo @param {number} profundidad */
    const andar = (nodo, profundidad) => {
        if (profundidad > maxDepth) return nodo;
        if (Array.isArray(nodo)) return nodo.map(item => andar(item, profundidad + 1));
        if (!nodo || typeof nodo !== 'object') return nodo;
        /** @type {Record<string, unknown>} */
        const salida = {};
        for (const [clave, hijo] of Object.entries(nodo)) {
            const canonico = canonicalMachineToken(clave);
            const definitiva = canonico && canonico !== clave && !(canonico in nodo) ? canonico : clave;
            salida[definitiva] = andar(hijo, profundidad + 1);
        }
        return salida;
    };
    return andar(valor, 0);
}
