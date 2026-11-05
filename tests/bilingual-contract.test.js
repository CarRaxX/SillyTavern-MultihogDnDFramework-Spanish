import { describe, expect, it } from 'vitest';
import {
    FOLDED_MACHINE_TOKEN_ALIAS,
    MACHINE_TOKEN_ALIASES,
    canonicalMachineToken,
    coerceMachineEnum,
    foldMachineToken,
    machineTokenAlternation,
    normalizeMachineKeys,
} from '../src/state/bilingual-contract.js';

describe('foldMachineToken', () => {
    it('plega mayúsculas, acentos y espacios de golpe', () => {
        expect(foldMachineToken('Categoría')).toBe('categoria');
        expect(foldMachineToken('  ACCIÓN   ')).toBe('accion');
        expect(foldMachineToken('Mi   Sión')).toBe('mi sion');
        expect(foldMachineToken('AMISTAD')).toBe('amistad');
    });

    it('funciona igual con acentos compuestos (NFC) y descompuestos (NFD)', () => {
        const compuesto = 'Misión'.normalize('NFC');
        const descompuesto = 'Misión'.normalize('NFD');
        expect(compuesto).not.toBe(descompuesto);
        expect(foldMachineToken(compuesto)).toBe(foldMachineToken(descompuesto));
        expect(foldMachineToken(descompuesto)).toBe('mision');
    });

    it('caseFold real: la ß equivale a ss', () => {
        expect(foldMachineToken('Straße')).toBe('strasse');
        expect(foldMachineToken('STRASSE')).toBe('strasse');
    });

    it('no inventa nada con valores vacíos o nulos', () => {
        expect(foldMachineToken('')).toBe('');
        expect(foldMachineToken(null)).toBe('');
        expect(foldMachineToken(undefined)).toBe('');
        expect(foldMachineToken(0)).toBe('0');
    });
});

describe('Alias de máquina (D6)', () => {
    it('los alias plegados son únicos: un token plegado no puede valer dos cosas', () => {
        const seen = new Map();
        for (const [canonico, variantes] of Object.entries(MACHINE_TOKEN_ALIASES)) {
            // Dentro de un mismo token canónico las formas repetidas (con acento y
            // sin él) son bienvenidas: lo que no puede pasar es que un alias plegado
            // pertenezca a dos tokens distintos.
            const propios = new Set([canonico, ...variantes].map(v => foldMachineToken(v)));
            for (const plegado of propios) {
                expect(plegado.length, `alias vacío en ${canonico}`).toBeGreaterThan(0);
                const previo = seen.get(plegado);
                expect(previo, `"${plegado}" vale para ${previo} y para ${canonico}`).toBeUndefined();
                seen.set(plegado, canonico);
            }
        }
        expect(seen.size).toBeGreaterThan(Object.keys(MACHINE_TOKEN_ALIASES).length * 2);
    });

    it('el índice plegado coincide con la tabla y todo canónico se apunta a sí mismo', () => {
        for (const canonico of Object.keys(MACHINE_TOKEN_ALIASES)) {
            expect(canonicalMachineToken(canonico)).toBe(canonico);
        }
        expect(FOLDED_MACHINE_TOKEN_ALIAS[foldMachineToken('Acción')]).toBe('action');
        expect(FOLDED_MACHINE_TOKEN_ALIAS[foldMachineToken('Mundo')]).toBe('WORLD');
        expect(FOLDED_MACHINE_TOKEN_ALIAS[foldMachineToken('PNJ')]).toBe('NPC');
        expect(FOLDED_MACHINE_TOKEN_ALIAS[foldMachineToken('resumen')]).toBe('summary');
    });

    it('un token que no está en la lista no tiene canónico', () => {
        expect(canonicalMachineToken('Bóveda Del Dragón Rojo')).toBeNull();
        expect(canonicalMachineToken('')).toBeNull();
    });

    it('la alternativa de regex conserva las formas crudas con acento', () => {
        const patron = machineTokenAlternation('action');
        expect(patron).toContain('Action');
        expect(patron).toContain('Acción');
        expect(patron.split('|')).toEqual(['action', 'Action', 'acción', 'Acción', 'orden']);
        expect(new RegExp(`^(?:${patron})$`, 'i').test('Acción')).toBe(true);
        expect(new RegExp(`^(?:${patron})$`, 'i').test('action')).toBe(true);
    });
});

describe('coerceMachineEnum', () => {
    const ESTADOS = ['open', 'resolved', 'transformed'];

    it('acepta exacto, con acentos, en mayúsculas y por alias', () => {
        expect(coerceMachineEnum('open', ESTADOS)).toBe('open');
        expect(coerceMachineEnum('OPEN', ESTADOS)).toBe('open');
        expect(coerceMachineEnum('Resuelto', ESTADOS)).toBe('resolved');
        expect(coerceMachineEnum('TRANSFORMADO', ESTADOS)).toBe('transformed');
        expect(coerceMachineEnum('cerrado', ESTADOS)).toBe('resolved');
    });

    it('devuelve null con un valor que no es ninguno', () => {
        expect(coerceMachineEnum('en_llamas', ESTADOS)).toBeNull();
        expect(coerceMachineEnum('', ESTADOS)).toBeNull();
        expect(coerceMachineEnum(undefined, ESTADOS)).toBeNull();
        expect(coerceMachineEnum({ estado: 'open' }, ESTADOS)).toBeNull();
    });

    it('respeta una tabla de alias acotada por dominio', () => {
        const soloEjes = { amistad: 'friendship', afecto: 'affection' };
        expect(coerceMachineEnum('amistad', ['friendship', 'affection'], soloEjes)).toBe('friendship');
        expect(coerceMachineEnum('ABIERTO', ['open', 'resolved'], soloEjes)).toBeNull();
    });
});

describe('normalizeMachineKeys: solo claves, jamás contenido (D6)', () => {
    it('traduce las claves conocidas y deja el texto tal cual', () => {
        const salida = normalizeMachineKeys({
            'Categoría': 'MUNDO',
            'Etiqueta': 'PjN de prueba — Aliado',
            'Contenido': 'El PjN de prueba dijo: «¡Hola, Mundo!» con acentos í ó ñ',
        });
        expect(salida).toEqual({
            category: 'MUNDO',
            label: 'PjN de prueba — Aliado',
            content: 'El PjN de prueba dijo: «¡Hola, Mundo!» con acentos í ó ñ',
        });
    });

    it('una clave desconocida sale intacta, con su acento y su mayúscula', () => {
        const salida = normalizeMachineKeys({ 'Bóveda': { 'Nombre Propio': 'Álvaro del Pozo' } });
        expect(salida).toEqual({ 'Bóveda': { 'Nombre Propio': 'Álvaro del Pozo' } });
    });

    it('no pisa una clave canónica que ya existe', () => {
        const salida = normalizeMachineKeys({ name: 'Primero', nombre: 'Segundo' });
        expect(salida.name).toBe('Primero');
        expect(salida.nombre).toBe('Segundo');
    });

    it('baja por arrays y objetos anidados sin tocar los valores', () => {
        const salida = normalizeMachineKeys({
            'Operaciones': [
                { 'Operacion': 'ADD_ASSET', 'Nombre': 'Torre Vigía', 'Causa': 'Construida en el asalto 3' },
                ['Abierto', 7],
            ],
        });
        expect(salida.operations[0]).toEqual({ op: 'ADD_ASSET', name: 'Torre Vigía', cause: 'Construida en el asalto 3' });
        expect(salida.operations[1]).toEqual(['Abierto', 7]);
    });

    it('un objeto sin claves traducibles se devuelve igual', () => {
        const original = { memo: 'Día 1, 08:00 — El PjN de prueba despierta.', secciones: ['A', 'B'] };
        expect(normalizeMachineKeys(original)).toEqual(original);
    });

    it('no se pierde con valores raros', () => {
        expect(normalizeMachineKeys(null)).toBeNull();
        expect(normalizeMachineKeys('texto')).toBe('texto');
        expect(normalizeMachineKeys(7)).toBe(7);
    });
});
