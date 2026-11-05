/**
 * tests/helpers/codigo-fuente.js — Sacar funciones privadas de un módulo para
 * ejercitarlas de verdad (con sus dependencias inyectadas) sin abrir exports ni
 * llamar a un servidor. Mismo patrón que `router-snapshot-diet.test.js`.
 */
import { createContext, runInContext } from 'node:vm';
import { parseAst } from 'rollup/parseAst';

/** Texto fuente de una función declarada en `codigo`. */
export function fuenteFuncion(codigo, nombre) {
    let encontrada = null;
    const visitar = nodo => {
        if (!nodo || typeof nodo !== 'object' || encontrada) return;
        if (nodo.type === 'FunctionDeclaration' && nodo.id?.name === nombre) {
            encontrada = codigo.slice(nodo.start, nodo.end);
            return;
        }
        for (const valor of Object.values(nodo)) {
            if (Array.isArray(valor)) valor.forEach(visitar);
            else if (valor && typeof valor === 'object') visitar(valor);
        }
    };
    visitar(parseAst(codigo));
    if (!encontrada) throw new Error(`Falta la función ${nombre} en la fuente`);
    return encontrada;
}

/** Texto fuente de una constante `const NOMBRE = …;`. */
export function fuenteConstante(codigo, nombre) {
    const inicio = codigo.indexOf(`const ${nombre} =`);
    if (inicio < 0) throw new Error(`Falta la constante ${nombre} en la fuente`);
    const fin = codigo.indexOf(';', inicio);
    if (fin < 0) throw new Error(`La constante ${nombre} no termina`);
    return codigo.slice(inicio, fin + 1);
}

/**
 * Ejecuta una función privada con sus dependencias inyectadas y la devuelve
 * lista para llamar.
 * @param {string} codigo Fuente completa del módulo
 * @param {string} nombre Nombre de la función
 * @param {Record<string, unknown>} dependencias Globals que la función necesita
 * @returns {(…args: unknown[]) => unknown}
 */
export function funcionPrivada(codigo, nombre, dependencias = {}) {
    const contexto = createContext({ console, ...dependencias });
    runInContext(fuenteFuncion(codigo, nombre), contexto);
    return contexto[nombre];
}

/** Lee el valor de una constante de módulo (por ejemplo una lista de dominios). */
export function valorConstante(codigo, nombre) {
    return runInContext(`${fuenteConstante(codigo, nombre)}\n;${nombre};`, createContext({}));
}
