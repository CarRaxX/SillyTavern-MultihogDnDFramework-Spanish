import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { sendAgentTurn, sendStateRequest, sendViaOpenAI } from '../../llm-client.js';

// T9 (spec 2026-11-08, ola 5, D-3): tope de salida por trabajo con mando propio.
// `0`/ausente = auto ⇒ la cascada de siempre (resolveMaxTokens → 8192). Con
// valor, el cap clampeado manda sobre la cascada SOLO en su jobId. Las tres
// rutas gobernales: `sendStateRequest` (rama SillyTavern), rama OpenAI de
// `sendAgentTurn` y su rama SillyTavern —donde el local `const options` de
// antes de T9 ensombrecía el parámetro y ocultaría el cap (rawOptions)—.
// La ruta Perfil y `sendViaOpenAI` NO duplican el cap: reciben el valor resuelto.

const instantanea = JSON.parse(readFileSync(new URL('../fixtures/pensamiento-cuerpos-main.json', import.meta.url), 'utf8'));

const SSE = 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n';
const MENSAJES = [
    { role: 'system', content: 'SISTEMA' },
    { role: 'user', content: 'USUARIO' },
];

/** Cuerpo del último POST por fetch. */
let envio;
/** Últimas opciones entregadas a generateRaw (ruta SillyTavern). */
let opcionesRaw;

function respuestaSse() {
    return new Response(new ReadableStream({
        start(controlador) {
            controlador.enqueue(new TextEncoder().encode(SSE));
            controlador.close();
        },
    }), { headers: { 'Content-Type': 'text/event-stream' } });
}

let contextoOriginal;

beforeEach(() => {
    envio = null;
    opcionesRaw = null;
    contextoOriginal = SillyTavern.getContext;
    vi.stubGlobal('fetch', vi.fn(async (_url, options = {}) => {
        if (options?.body) envio = { texto: options.body, cuerpo: JSON.parse(options.body) };
        if (String(_url).includes('/api/chat')) return Response.json({ message: { content: 'ok' } });
        return respuestaSse();
    }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    SillyTavern.getContext = contextoOriginal;
    vi.restoreAllMocks();
});

/** Ruta SillyTavern (generateRaw) en lugar de fetch. */
function rutaSillyTavern() {
    SillyTavern.getContext = () => ({
        ...contextoOriginal(),
        generateRaw: async (options) => {
            opcionesRaw = options;
            return 'ok';
        },
    });
}

const AJUSTES_OPENAI = {
    connectionSource: 'openai',
    openaiUrl: 'http://localhost:8080/v1',
    openaiModel: 'modelo-prueba',
    maxTokens: 4096,
};

/** Copia de la entrada de la instantánea sin el campo `tools` (no se envían). */
function cuerpoBase(nombre) {
    const cuerpo = { ...instantanea[nombre].cuerpo };
    delete cuerpo.tools;
    return JSON.stringify(cuerpo);
}

describe('sendAgentTurn (rama OpenAI): el cap manda sobre la cascada', () => {
    it('sin cap el cuerpo es el de la instantánea (AC0)', async () => {
        await sendAgentTurn(AJUSTES_OPENAI, MENSAJES, null, null, { thinkingJob: 'state_tracker' });
        expect(envio.texto).toBe(cuerpoBase('turno-agente-openai'));
    });

    it('cap legítimo de su trabajo manda en max_tokens', async () => {
        await sendAgentTurn(
            { ...AJUSTES_OPENAI, rpgOutputCapStateTracker: 5000 },
            MENSAJES, null, null, { thinkingJob: 'state_tracker' },
        );
        expect(envio.cuerpo.max_tokens).toBe(5000);
    });

    it('cap fuera de cota llega clampeado a [256,8000]', async () => {
        await sendAgentTurn(
            { ...AJUSTES_OPENAI, rpgOutputCapStateTracker: 50 },
            MENSAJES, null, null, { thinkingJob: 'state_tracker' },
        );
        expect(envio.cuerpo.max_tokens).toBe(256);
        await sendAgentTurn(
            { ...AJUSTES_OPENAI, rpgOutputCapStateTracker: 99999 },
            MENSAJES, null, null, { thinkingJob: 'state_tracker' },
        );
        expect(envio.cuerpo.max_tokens).toBe(8000);
    });

    it('0 = auto: la cascada queda intacta', async () => {
        await sendAgentTurn(
            { ...AJUSTES_OPENAI, rpgOutputCapStateTracker: 0 },
            MENSAJES, null, null, { thinkingJob: 'state_tracker' },
        );
        expect(envio.cuerpo.max_tokens).toBe(4096);
    });

    it('el cap de un trabajo no salpica a otro (lorebook_agent no tiene mando)', async () => {
        await sendAgentTurn(
            { ...AJUSTES_OPENAI, rpgOutputCapStateTracker: 5000 },
            MENSAJES, null, null, { thinkingJob: 'lorebook_agent' },
        );
        expect(envio.cuerpo.max_tokens).toBe(4096);
    });

    it('sin etiqueta de trabajo tampoco manda ningún cap', async () => {
        await sendAgentTurn({ ...AJUSTES_OPENAI, rpgOutputCapWorldProgression: 1234 }, MENSAJES, null, null);
        expect(envio.texto).toBe(cuerpoBase('turno-agente-openai'));
    });
});

describe('sendAgentTurn (rama SillyTavern): el rename rawOptions destapa el cap', () => {
    it('sin cap la cascada decide responseLength como siempre', async () => {
        rutaSillyTavern();
        await sendAgentTurn({ maxTokens: 4096 }, MENSAJES, null, null, { thinkingJob: 'state_tracker' });
        expect(opcionesRaw.responseLength).toBe(4096);
    });

    it('con cap, la ruta SillyTavern lo respeta (antes lo ocultaba el shadowing)', async () => {
        rutaSillyTavern();
        await sendAgentTurn(
            { maxTokens: 4096, rpgOutputCapStateTracker: 1500 },
            MENSAJES, null, null, { thinkingJob: 'state_tracker' },
        );
        expect(opcionesRaw.responseLength).toBe(1500);
    });

    it('0 = auto también en SillyTavern', async () => {
        rutaSillyTavern();
        await sendAgentTurn(
            { rpgOutputCapStateTracker: 0 },
            MENSAJES, null, null, { thinkingJob: 'state_tracker' },
        );
        expect(opcionesRaw.responseLength).toBe(8192);
    });
});

describe('sendStateRequest: cap en su rama SillyTavern, valor resuelto en OpenAI', () => {
    it('sin cap, la rama OpenAI sale byte a byte como la instantánea', async () => {
        await sendStateRequest(AJUSTES_OPENAI, 'SISTEMA', 'USUARIO', null, { thinkingJob: 'state_tracker' });
        expect(envio.texto).toBe(instantanea['estado-peticion-openai'].texto);
    });

    it('con cap, la rama OpenAI recibe el valor ya resuelto (sendViaOpenAI no lo duplica)', async () => {
        await sendStateRequest(
            { ...AJUSTES_OPENAI, rpgOutputCapWorldProgression: 2048 },
            'SISTEMA', 'USUARIO', null, { thinkingJob: 'world_progression' },
        );
        expect(envio.cuerpo.max_tokens).toBe(2048);
    });

    it('sendViaOpenAI por sí sola nunca aplica caps: solo obedece al valor recibido', async () => {
        await sendViaOpenAI('http://localhost:8080/v1', '', 'modelo-prueba', 'SISTEMA', 'USUARIO', 4096, {}, null, null,
            { thinkingJob: 'state_tracker' });
        expect(envio.texto).toBe(instantanea['openai-directo'].texto);
    });

    it('la rama SillyTavern respeta el cap de map_evolution_compress', async () => {
        rutaSillyTavern();
        await sendStateRequest(
            { rpgOutputCapMapEvolutionCompress: 9000 },
            'SISTEMA', 'USUARIO', null, { thinkingJob: 'map_evolution_compress' },
        );
        expect(opcionesRaw.responseLength).toBe(8000);
    });

    it('0 = auto deja la cascada de la rama SillyTavern intacta', async () => {
        rutaSillyTavern();
        await sendStateRequest(
            { maxTokens: 4096, rpgOutputCapStateTracker: 0 },
            'SISTEMA', 'USUARIO', null, { thinkingJob: 'state_tracker' },
        );
        expect(opcionesRaw.responseLength).toBe(4096);
    });

    it('trabajo sin mando (map_updater) jamás recibe cap ajeno', async () => {
        rutaSillyTavern();
        await sendStateRequest(
            { maxTokens: 4096, rpgOutputCapStateTracker: 5000 },
            'SISTEMA', 'USUARIO', null, { thinkingJob: 'map_updater' },
        );
        expect(opcionesRaw.responseLength).toBe(4096);
    });
});

describe('T9: forma del código (anti-ensombrecimiento y cero duplicación)', () => {
    const fuente = readFileSync(new URL('../../llm-client.js', import.meta.url), 'utf8');

    it('la ruta SillyTavern de sendAgentTurn usa rawOptions, sin shadowing de options', () => {
        expect(fuente).toMatch(/const rawOptions = \{ prompt: flatUser/);
        expect(fuente).toContain('rawOptions.responseLength');
        expect(fuente).toMatch(/generateRaw\(rawOptions\)/);
        expect(fuente).not.toMatch(/const options = \{ prompt: flatUser/);
    });

    it('el cap se lee del módulo puro, con 0 = auto como única cascada', () => {
        expect(fuente).toMatch(/import\s*\{[^}]*\bclampOutputCap\b[^}]*\}\s*from\s*'\.\/src\/state\/agent-controls\.js'/s);
        const cuerpo = fuente.slice(fuente.indexOf('function maxTokensEfectivos'));
        const trozo = cuerpo.slice(0, cuerpo.indexOf('\n}') + 2);
        expect(trozo).toContain('clampOutputCap');
        expect(trozo).toContain('outputCapSettingsKey');
        expect(trozo).toContain('resolveMaxTokens');
    });

    it('la ruta Perfil conserva resolveMaxTokens sin cap (sin jobId, D-3)', () => {
        const inicio = fuente.indexOf('async function sendViaConnectionProfile');
        const trozo = fuente.slice(inicio, fuente.indexOf('\n}', inicio) + 2);
        expect(trozo).toContain('const maxTokens = resolveMaxTokens(settings);');
        expect(trozo).not.toContain('maxTokensEfectivos');
    });
});
