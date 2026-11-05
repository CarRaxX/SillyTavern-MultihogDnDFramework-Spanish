/**
 * Huellas deterministas de contenido (spec 2026-11-05, D7).
 *
 * Deciden qué libros necesitan preimagen en `routerHistory` y activan la guarda
 * anti-edición manual del deshacer (D2). Una huella de sólo 32 bits fue descartada
 * por el Oráculo: una colisión dejaría un libro modificado sin preimagen y el undo
 * no la restauraría ni avisaría. Aquí se concatenan dos pasadas independientes de
 * 32 bits (FNV-1a y djb2) con prefijo de longitud, lo que da ~64 bits de salida.
 *
 * Sin dependencias externas y sin `JSON.stringify` sobre el objeto canónico: se
 * escribe directamente sobre un array de fragmentos para que coste y memoria sean
 * proporcionales al tamaño del libro (~2 ms por libro de 100 KB medido en el test).
 */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const DJB2_OFFSET = 5381;

/**
 * Serializa un valor JSON de forma estable: claves ordenadas, `undefined` y
 * valores no serializables se omiten como lo haría `JSON.stringify`.
 * @param {any} valor
 * @param {string[]} partes
 */
function escribirCanonico(valor, partes) {
    if (valor === null || valor === undefined) {
        partes.push('null');
        return;
    }
    const tipo = typeof valor;
    if (tipo === 'string') {
        partes.push(JSON.stringify(valor));
        return;
    }
    if (tipo === 'number') {
        partes.push(Number.isFinite(valor) ? String(valor) : 'null');
        return;
    }
    if (tipo === 'boolean' || tipo === 'bigint') {
        partes.push(String(valor));
        return;
    }
    if (tipo !== 'object') {
        // Funciones, símbolos y extraños: no viajan a disco, no cuentan.
        partes.push('null');
        return;
    }
    if (Array.isArray(valor)) {
        partes.push('[');
        for (let i = 0; i < valor.length; i++) {
            if (i) partes.push(',');
            escribirCanonico(valor[i], partes);
        }
        partes.push(']');
        return;
    }
    const claves = Object.keys(valor)
        .filter(clave => valor[clave] !== undefined && typeof valor[clave] !== 'function')
        .sort();
    partes.push('{');
    for (let i = 0; i < claves.length; i++) {
        if (i) partes.push(',');
        partes.push(JSON.stringify(claves[i]), ':');
        escribirCanonico(valor[claves[i]], partes);
    }
    partes.push('}');
}

/**
 * Forma canónica de un valor JSON: dos objetos equivalentes con distinto orden de
 * claves producen exactamente la misma cadena.
 * @param {any} value
 * @returns {string}
 */
export function canonicalJsonValue(value) {
    const partes = [];
    escribirCanonico(value, partes);
    return partes.join('');
}

/**
 * Huella de 64 bits (dos pasadas de 32) de una cadena, con prefijo de longitud.
 * @param {string} text
 * @returns {string} Ej. `12:a1b2c3d4e5f60718`
 */
export function fingerprintText(text) {
    const source = typeof text === 'string' ? text : String(text ?? '');
    let fnv = FNV_OFFSET;
    let djb2 = DJB2_OFFSET;
    for (let i = 0; i < source.length; i++) {
        const code = source.charCodeAt(i);
        fnv = Math.imul(fnv ^ code, FNV_PRIME);
        djb2 = (Math.imul(djb2, 33) + code) | 0;
    }
    const alto = (fnv >>> 0).toString(16).padStart(8, '0');
    const bajo = (djb2 >>> 0).toString(16).padStart(8, '0');
    return `${source.length}:${alto}${bajo}`;
}

/**
 * Huella determinista de un valor JSON estructurado (claves ordenadas).
 * @param {any} value
 * @returns {string}
 */
export function fingerprintJsonValue(value) {
    return fingerprintText(canonicalJsonValue(value));
}

/**
 * Huella de un libro de lore completo tal y como se persiste en disco.
 * @param {any} book
 * @returns {string}
 */
export function fingerprintLorebook(book) {
    return fingerprintJsonValue(book || null);
}
