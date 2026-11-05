import { describe, expect, it } from 'vitest';
import {
    canonicalJsonValue,
    fingerprintJsonValue,
    fingerprintLorebook,
    fingerprintText,
} from '../src/state/content-fingerprint.js';

/** Libro de lore sintético con `bytes` de contenido repartido en entradas. */
function libroDeBytes(bytes, semilla = 'a') {
    const relleno = semilla.repeat(Math.max(1, Math.floor(bytes / 4)));
    const entradas = {};
    for (let i = 0; i < 4; i++) {
        entradas[`uid-${i}`] = { uid: `uid-${i}`, comment: `Entrada ${i}`, content: `${relleno}-${i}`, keys: ['x'] };
    }
    return { entries: entradas, name: 'Campaña_NPCs', disable: false, recursive_scanning: false };
}

describe('Huella determinista de contenido (D7)', () => {
    it('es determinista para el mismo valor', () => {
        const valor = { b: 1, a: [1, 2, { z: 'z' }] };
        expect(fingerprintJsonValue(valor)).toBe(fingerprintJsonValue(valor));
        expect(fingerprintJsonValue(JSON.parse(JSON.stringify(valor)))).toBe(fingerprintJsonValue(valor));
    });

    it('ignora el orden de claves, también anidado', () => {
        const uno = { b: 2, a: { d: 4, c: 3 } };
        const dos = { a: { c: 3, d: 4 }, b: 2 };
        expect(canonicalJsonValue(uno)).toBe(canonicalJsonValue(dos));
        expect(fingerprintJsonValue(uno)).toBe(fingerprintJsonValue(dos));
    });

    it('cambia con una sola letra, con la longitud y con el orden de arrays', () => {
        expect(fingerprintText('hola')).not.toBe(fingerprintText('hola!'));
        expect(fingerprintText('hola')).not.toBe(fingerprintText('hola mas larga'));
        expect(fingerprintJsonValue([1, 2])).not.toBe(fingerprintJsonValue([2, 1]));
    });

    it('omite undefined y funciones igual que JSON.stringify', () => {
        expect(fingerprintJsonValue({ a: 1, b: undefined, fn: () => {} }))
            .toBe(fingerprintJsonValue({ a: 1 }));
    });

    it('es sensible al contenido del libro y estable entre copias equivalentes', () => {
        const libro = libroDeBytes(4000, 'a');
        const gema = { ...libro };
        expect(fingerprintLorebook(libro)).toBe(fingerprintLorebook(gema));
        const editado = JSON.parse(JSON.stringify(libro));
        editado.entries['uid-2'].content += ' párrafo nuevo del agente';
        expect(fingerprintLorebook(editado)).not.toBe(fingerprintLorebook(libro));
    });

    it('no colisiona en 5.000 textos distintos y respeta el formato largo', () => {
        const vistas = new Set();
        for (let i = 0; i < 5000; i++) vistas.add(fingerprintText(`libro-${i}-contenido-${i * 7919}`));
        expect(vistas.size).toBe(5000);
        expect(fingerprintText('abc')).toMatch(/^3:[0-9a-f]{16}$/);
        // 16 díhex = 64 bits: la huella de 32 bits fue rechazada por colisiones.
        expect(fingerprintText('abc').split(':')[1]).toHaveLength(16);
    });

    it('coste por debajo del techo de 10 ms sobre ~200 KB', () => {
        const libro = libroDeBytes(200 * 1024, 'q');
        expect(JSON.stringify(libro).length).toBeGreaterThan(180 * 1024);
        const inicio = performance.now();
        const huella = fingerprintLorebook(libro);
        const coste = performance.now() - inicio;
        expect(huella).toBeTruthy();
        expect(coste).toBeLessThan(10);
    });
});
