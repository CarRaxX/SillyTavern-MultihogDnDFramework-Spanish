import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    PROMPT_CEILING_BOUNDS,
    PROMPT_CEILING_DEFAULTS,
    PROMPT_CEILING_EVENT,
    PROMPT_CEILING_SETTINGS_KEYS,
    PROMPT_CEILING_ZONAS,
    announceCeilingCut,
    applyTextCeiling,
    applyUnitCeiling,
    clampPromptCeiling,
    estimatePromptTokens,
    splitPromptUnits,
} from '../src/state/prompt-ceilings.js';

// T2 (spec 2026-11-05, D-1/P1): el módulo de techos es puro y determinista.
// Cero VRAM, cero red: todo se verifica con cadenas en memoria.

const eventos = [];
let avisos = [];

beforeEach(() => {
    eventos.length = 0;
    avisos = [];
    globalThis.CustomEvent = class FakeCustomEvent {
        constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    };
    globalThis.document = {
        dispatchEvent: e => { eventos.push(e); return true; },
    };
});

afterEach(() => {
    delete globalThis.document;
    delete globalThis.CustomEvent;
});

describe('clampPromptCeiling (orden estricto de P1)', () => {
    it('cadena vacía, null, undefined, booleano o texto sin número → default (NUNCA «sin techo»)', () => {
        expect(clampPromptCeiling('trackerMemo', '')).toBe(1600);
        expect(clampPromptCeiling('trackerMemo', '   ')).toBe(1600);
        expect(clampPromptCeiling('trackerMemo', undefined)).toBe(1600);
        expect(clampPromptCeiling('trackerMemo', null)).toBe(1600);
        expect(clampPromptCeiling('trackerMemo', false)).toBe(1600);
        expect(clampPromptCeiling('trackerMemo', 'sin techo')).toBe(1600);
        // Number('') === 0: por eso el campo vacío jamás se interpreta como 0.
        expect(clampPromptCeiling('worldHistory', '')).toBe(5);
    });

    it('0 → 0 «sin techo», válido aunque esté fuera de la cota', () => {
        expect(clampPromptCeiling('worldHistory', 0)).toBe(0);
        expect(clampPromptCeiling('trackerMemo', '0')).toBe(0);
        expect(clampPromptCeiling('worldBlock', 0)).toBe(0);
    });

    it('negativo o decimal → default; entero fuera de cota → borde más cercano', () => {
        expect(clampPromptCeiling('trackerMemo', -1)).toBe(1600);
        expect(clampPromptCeiling('trackerMemo', -4000)).toBe(1600);
        expect(clampPromptCeiling('trackerMemo', 1600.5)).toBe(1600);
        expect(clampPromptCeiling('worldBlock', 4095.25)).toBe(4096);
        expect(clampPromptCeiling('trackerMemo', 100)).toBe(800);
        expect(clampPromptCeiling('trackerMemo', 99999)).toBe(4000);
        expect(clampPromptCeiling('worldBlock', 1)).toBe(2048);
        expect(clampPromptCeiling('worldBlock', 999999)).toBe(8192);
        // Given clamp('worldHistory',12) Then 10 (P1).
        expect(clampPromptCeiling('worldHistory', 12)).toBe(10);
        expect(clampPromptCeiling('worldHistory', 2)).toBe(3);
        expect(clampPromptCeiling('worldHistory', 5)).toBe(5);
    });

    it('tabla de fábrica y claves de ajustes expuestas', () => {
        expect(PROMPT_CEILING_DEFAULTS).toEqual({ trackerMemo: 1600, worldBlock: 4096, worldHistory: 5 });
        expect(PROMPT_CEILING_BOUNDS.worldBlock).toEqual([2048, 8192]);
        expect(PROMPT_CEILING_SETTINGS_KEYS).toEqual({
            trackerMemo: 'rpg_ceiling_tracker_memo',
            worldBlock: 'rpg_ceiling_world_block',
            worldHistory: 'rpg_ceiling_world_history',
        });
        expect([...PROMPT_CEILING_ZONAS].sort()).toEqual(
            ['ficha_narrador', 'ficha_rastreador', 'mundo_narrador', 'mundo_trabajo'].sort(),
        );
    });

    it('clave desconocida peta en seco (error de programación, no valor por defecto)', () => {
        expect(() => clampPromptCeiling('noExiste', 5)).toThrow(/clave desconocida/);
    });
});

describe('estimatePromptTokens (D-1: chars/4 hacia arriba)', () => {
    it('determinista y sin efectos', () => {
        expect(estimatePromptTokens('')).toBe(0);
        expect(estimatePromptTokens('abcd')).toBe(1);
        expect(estimatePromptTokens('abcde')).toBe(2);
        expect(estimatePromptTokens(null)).toBe(0);
        expect(estimatePromptTokens('x'.repeat(6400))).toBe(1600);
    });
});

describe('splitPromptUnits: sin pérdida y [TAG] sin partir', () => {
    it('memo [TAG]: join reproduce la entrada byte a byte, texto suelto a la unidad previa', () => {
        const memo = 'cabecera suelta\n[TIME]\nDía 3, 14:00\n[/TIME]\n[PARTY]\nOdran\n[/PARTY]\nreleo entre bloques\n[QUESTS]\nQ1\n[/QUESTS]\ncola suelta';
        const { unidades, sinUnidad } = splitPromptUnits(memo, 'tag');
        expect(sinUnidad).toBe(false);
        expect(unidades.length).toBe(3);
        // Sin pérdida: concatenar reconstruye la entrada exacta.
        expect(unidades.join('')).toBe(memo);
        // El texto suelto entre bloques viaja pegado a la unidad previa.
        expect(unidades[0]).toContain('cabecera suelta');
        expect(unidades[1]).toContain('releo entre bloques');
        expect(unidades[2]).toContain('cola suelta');
        // Ningún [TAG] queda partido: cada unidad abre y cierra su bloque.
        for (const u of unidades) {
            expect(u).toMatch(/\[[A-Z][A-Z0-9_]*\]/);
            expect(u).toMatch(/\[\/[A-Z][A-Z0-9_]*\]/);
        }
    });

    it('mundo ###: unidad por cabecera, prefix suelto a la primera', () => {
        const mundo = 'preámbulo\n### [Informe 1]\nviejo\n\n### [Informe 2]\nnuevo\n';
        const { unidades, sinUnidad } = splitPromptUnits(mundo, 'world');
        expect(sinUnidad).toBe(false);
        expect(unidades.length).toBe(2);
        expect(unidades.join('')).toBe(mundo);
        expect(unidades[0].startsWith('preámbulo')).toBe(true);
        expect(unidades[1].startsWith('### [Informe 2]')).toBe(true);
    });

    it('sin ninguna unidad → sinUnidad=true y el texto NO se corta (motivo sin_unidad)', () => {
        const { unidades, sinUnidad } = splitPromptUnits('prosa suelta sin bloques', 'tag');
        expect(unidades).toEqual([]);
        expect(sinUnidad).toBe(true);
        const salida = applyTextCeiling('prosa suelta sin bloques '.repeat(200), 100, 'tag', 'ficha_narrador');
        expect(salida.texto).toBe('prosa suelta sin bloques '.repeat(200));
        expect(salida.recortadas).toBe(0);
        expect(eventos.length).toBe(1);
        expect(eventos[0].detail).toMatchObject({ zona: 'ficha_narrador', motivo: 'sin_unidad', unidades: 0 });
    });
});

describe('applyUnitCeiling: oldest-first por unidad entera, orden conservado', () => {
    const bloque = (n, relleno = 200) => `[B${n}]\n${'x'.repeat(relleno)}\n[/B${n}]\n\n`;

    it('con techo 0 no corta nada (sin techo)', () => {
        const unidades = [bloque(1), bloque(2), bloque(3)];
        const r = applyUnitCeiling(unidades, 0);
        expect(r.texto).toBe(unidades.join(''));
        expect(r.recortadas).toBe(0);
        expect(r.excede).toBe(false);
    });

    it('si cabe, salida idéntica y contador 0 (AC1)', () => {
        const unidades = [bloque(1, 40), bloque(2, 40)];
        const r = applyUnitCeiling(unidades, 1600);
        expect(r).toEqual({ texto: unidades.join(''), conservadas: 2, recortadas: 0, tokensRecortados: 0, excede: false });
    });

    it('cae la más vieja primero, jamás se parte una unidad, el orden se conserva', () => {
        // 3 unidades de 4914 chars ≈ 1229 tok cada una; techo 1300 tok = 5200 chars.
        const unidades = [bloque(1, 4900), bloque(2, 4900), bloque(3, 4900)];
        const r = applyUnitCeiling(unidades, 1300);
        expect(r.recortadas).toBe(2);
        expect(r.conservadas).toBe(1);
        expect(r.texto).toBe(bloque(3, 4900));
        expect(r.texto).toContain('[B3]');
        expect(r.texto).not.toContain('[B2]');
        // Unidades enteras: si algo de B3 existiera partido, faltaría su cierre.
        expect(r.texto.match(/\[B3\]/g).length).toBe(1);
        expect(r.texto.match(/\[\/B3\]/g).length).toBe(1);
        expect(r.tokensRecortados).toBeGreaterThan(0);
    });

    it('desde "nuevas": cae la última primero, orden fijo (R4, ficha→narrador)', () => {
        const unidades = [bloque(1, 4900), bloque(2, 4900), bloque(3, 4900)];
        const r = applyUnitCeiling(unidades, 1300, { desde: 'nuevas' });
        expect(r.texto).toBe(bloque(1, 4900));
        expect(r.recortadas).toBe(2);
    });

    it('base intocable: la base nunca se corta y excede=true si sola pasa del techo', () => {
        const base = '## TRACKER STATE 0 (Current)\n' + 'x'.repeat(8100) + '\n\n'; // ≈2030 tok
        const unidades = [bloque(1, 900), bloque(2, 900)];
        const r = applyUnitCeiling(unidades, 1600, { base });
        expect(r.recortadas).toBe(2);
        expect(r.texto).toBe('');
        expect(r.excede).toBe(true);
        // La base viaja intacta en todas las unidades devueltas: la función no la toca.
        const r2 = applyUnitCeiling([bloque(1, 100)], 1600, { base: 'pequeña' });
        expect(r2.texto).toBe(bloque(1, 100));
        expect(r2.excede).toBe(false);
    });

    it('determinismo: misma entrada, misma salida, N veces', () => {
        const unidades = [bloque(1), bloque(2), bloque(3), bloque(4)];
        const a = applyUnitCeiling(unidades, 900);
        const b = applyUnitCeiling(unidades, 900);
        expect(a).toStrictEqual(b);
    });

    it('una sola unidad por encima del techo: cae ENTERA (el llamador protege con base) y excede=false', () => {
        const r = applyUnitCeiling([bloque(1, 16000)], 1600);
        expect(r.texto).toBe('');
        expect(r.recortadas).toBe(1);
        expect(r.excede).toBe(false); // sin base: con 0 unidades ya cabe
    });
});

describe('applyTextCeiling + announceCeilingCut (D-3: visibilidad)', () => {
    it('si cabe: ni log, ni evento, ni contador; texto idéntico', () => {
        const memo = '[TIME]\ncorto\n[/TIME]';
        const consola = [];
        const info = console.info;
        console.info = (...a) => consola.push(a);
        const r = applyTextCeiling(memo, 1600, 'tag', 'ficha_narrador');
        console.info = info;
        expect(r).toEqual({ texto: memo, recortadas: 0 });
        expect(eventos.length).toBe(0);
        expect(consola.length).toBe(0);
    });

    it('con recorte: UN evento por llamada con detail {zona, unidades, tokens} y log en español', () => {
        // 3 bloques de ~5013 chars ≈ 1254 tok; techo 1600 tok = 6400 chars.
        const memo = '[A]\n' + 'x'.repeat(5000) + '\n[/A]\n[B]\ny'.repeat(5000) + '\n[/B]\n[C]\nz'.repeat(5000) + '\n[/C]';
        const infos = [];
        const info = console.info;
        console.info = (...a) => infos.push(String(a[0] || ''));
        const r = applyTextCeiling(memo, 1600, 'tag', 'ficha_narrador', { desde: 'nuevas' });
        console.info = info;
        expect(r.recortadas).toBe(2);
        expect(eventos.length).toBe(1);
        expect(eventos[0].type).toBe(PROMPT_CEILING_EVENT);
        expect(eventos[0].detail.zona).toBe('ficha_narrador');
        expect(eventos[0].detail.unidades).toBe(2);
        expect(eventos[0].detail.tokens).toBeGreaterThan(0);
        expect(infos.some(l => l.includes('[Multihog][Techos]') && l.includes('Ficha→narrador'))).toBe(true);
    });

    it('zona inválida: null y warn, sin evento', () => {
        const warn = console.warn;
        const avisosLocales = [];
        console.warn = (...a) => avisosLocales.push(String(a[0] || ''));
        const r = announceCeilingCut('zona_falsa', { unidades: 1, tokens: 1 });
        console.warn = warn;
        expect(r).toBeNull();
        expect(eventos.length).toBe(0);
        expect(avisosLocales.some(l => l.includes('[Multihog][Techos]'))).toBe(true);
    });

    it('motivo excede_state0 sale en el evento y avisa en español (P2)', () => {
        const warn = console.warn;
        const locales = [];
        console.warn = (...a) => locales.push(String(a[0] || ''));
        const detail = announceCeilingCut('ficha_rastreador', { unidades: 0, tokens: 2200, motivo: 'excede_state0' });
        console.warn = warn;
        expect(detail).toMatchObject({ zona: 'ficha_rastreador', unidades: 0, tokens: 2200, motivo: 'excede_state0' });
        expect(eventos.length).toBe(1);
        expect(locales.some(l => l.includes('íntegro') && l.includes('nunca se corta'))).toBe(true);
    });
});
