import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testExtensionSettings } from './setup.js';
import { sendStateRequest } from '../llm-client.js';
import { MODULE_NAME } from '../src/state/schema-sections.js';

// Las cuatro ramas de `sendStateRequest` (Ollama, OpenAI propio, processRequest
// de SillyTavern y generateRaw) sólo reciben política en la rama `openai` (D1).
// El resto tiene que salir exactamente con los mismos campos que hoy (AC0).
const SSE = 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n';
const CAMPOS_PENSAMIENTO = ['reasoning_effort', 'chat_template_kwargs', 'reasoning_budget_tokens', 'thinking_budget_tokens', 'reasoning_budget_message'];

let peticiones;

function respuestaSse() {
    return new Response(new ReadableStream({
        start(controlador) {
            controlador.enqueue(new TextEncoder().encode(SSE));
            controlador.close();
        },
    }), { headers: { 'Content-Type': 'text/event-stream' } });
}

beforeEach(() => {
    peticiones = [];
    for (const key of Object.keys(testExtensionSettings)) delete testExtensionSettings[key];
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
        if (options?.body) peticiones.push({ url, cuerpo: JSON.parse(options.body) });
        if (String(url).includes('/api/chat')) return Response.json({ message: { content: 'ok' } });
        return respuestaSse();
    }));
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const AJUSTES_OPENAI = {
    connectionSource: 'openai',
    openaiUrl: 'http://localhost:8080/v1',
    openaiModel: 'modelo-prueba',
    maxTokens: 4096,
    localThinkingPolicy: { state_tracker: { mode: 'desactivar' }, map_evolution_compress: { mode: 'presupuesto', tokens: 1024 } },
};

function sinCamposDePensamiento(cuerpo) {
    for (const campo of CAMPOS_PENSAMIENTO) expect(campo in cuerpo).toBe(false);
}

describe('sendStateRequest: la política sólo entra por la rama openai', () => {
    it('rama openai: desactivar llega al cuerpo propio', async () => {
        await sendStateRequest(AJUSTES_OPENAI, 'SISTEMA', 'USUARIO', null, { thinkingJob: 'state_tracker' });
        expect(peticiones[0].cuerpo.reasoning_effort).toBe('none');
        expect(peticiones[0].cuerpo.chat_template_kwargs).toEqual({ enable_thinking: false });
    });

    it('rama openai: presupuesto llega con canónico y alias iguales', async () => {
        await sendStateRequest(AJUSTES_OPENAI, 'SISTEMA', 'USUARIO', null, { thinkingJob: 'map_evolution_compress' });
        expect(peticiones[0].cuerpo.reasoning_budget_tokens).toBe(1024);
        expect(peticiones[0].cuerpo.thinking_budget_tokens).toBe(1024);
    });

    it('rama openai sin etiqueta de trabajo: ni un campo nuevo', async () => {
        await sendStateRequest(AJUSTES_OPENAI, 'SISTEMA', 'USUARIO', null, { stream: true });
        sinCamposDePensamiento(peticiones[0].cuerpo);
    });

    it('rama ollama: la política no se aplica', async () => {
        await sendStateRequest(
            { connectionSource: 'ollama', ollamaUrl: 'http://localhost:11434', ollamaModel: 'modelo-prueba', localThinkingPolicy: { state_tracker: { mode: 'desactivar' } } },
            'SISTEMA', 'USUARIO', null,
            { thinkingJob: 'state_tracker' },
        );
        sinCamposDePensamiento(peticiones[0].cuerpo);
    });

    it('rama profile (SillyTavern): el override no gana campos de razonamiento', async () => {
        let override = null;
        const contextoOriginal = SillyTavern.getContext;
        SillyTavern.getContext = () => ({
            ...contextoOriginal(),
            ConnectionManagerRequestService: {
                getProfile: () => ({ preset: '' }),
                sendRequest: async (_perfil, _mensajes, _maxTokens, _opciones, sobrecarga) => {
                    override = sobrecarga || {};
                    return { content: 'ok', reasoning: '' };
                },
            },
        });
        try {
            await sendStateRequest(
                { connectionSource: 'profile', connectionProfileId: 'perfil-1', localThinkingPolicy: { state_tracker: { mode: 'desactivar' } } },
                'SISTEMA', 'USUARIO', null,
                { thinkingJob: 'state_tracker' },
            );
        } finally {
            SillyTavern.getContext = contextoOriginal;
        }
        expect(override).toEqual({});
        expect(peticiones).toHaveLength(0);
    });

    it('rama default con processRequest de SillyTavern: payload intacto', async () => {
        let datos = null;
        const contextoOriginal = SillyTavern.getContext;
        SillyTavern.getContext = () => ({
            ...contextoOriginal(),
            mainApi: 'openai',
            chatCompletionSettings: { chat_completion_source: 'core', nanogpt_model: '' },
            ChatCompletionService: {
                processRequest: async (data) => {
                    datos = data;
                    return async function* () { yield { text: 'ok' }; };
                },
            },
        });
        try {
            await sendStateRequest(
                { connectionSource: 'default', localThinkingPolicy: { state_tracker: { mode: 'desactivar' } } },
                'SISTEMA', 'USUARIO', null,
                { stream: true, thinkingJob: 'state_tracker' },
            );
        } finally {
            SillyTavern.getContext = contextoOriginal;
        }
        expect(datos).toBeTruthy();
        sinCamposDePensamiento(datos);
    });

    it('los ajustes derivados sin la clave usan la política global', async () => {
        testExtensionSettings[MODULE_NAME] = { localThinkingPolicy: { state_tracker: { mode: 'presupuesto', tokens: 777 } } };
        await sendStateRequest(
            { connectionSource: 'openai', openaiUrl: 'http://localhost:8080/v1', openaiModel: 'modelo-prueba', maxTokens: 4096 },
            'SISTEMA', 'USUARIO', null,
            { thinkingJob: 'state_tracker' },
        );
        expect(peticiones[0].cuerpo.reasoning_budget_tokens).toBe(777);
        expect(peticiones[0].cuerpo.thinking_budget_tokens).toBe(777);
    });

    it('un trabajo de juicio nunca llega apagado aunque la política vieja lo diga', async () => {
        await sendStateRequest(
            { ...AJUSTES_OPENAI, localThinkingPolicy: { lorebook_agent: { mode: 'desactivar' } } },
            'SISTEMA', 'USUARIO', null,
            { thinkingJob: 'lorebook_agent' },
        );
        sinCamposDePensamiento(peticiones[0].cuerpo);
    });
});

describe('Registro en español con debugMode (D8)', () => {
    it('anuncia la política activa en la ruta directa', async () => {
        const consola = vi.spyOn(console, 'log').mockImplementation(() => {});
        await sendStateRequest({ ...AJUSTES_OPENAI, debugMode: true }, 'SISTEMA', 'USUARIO', null, { thinkingJob: 'state_tracker' });
        const linea = consola.mock.calls.map(c => String(c[0])).find(texto => texto.includes('Pensamiento del trabajo'));
        expect(linea).toContain('"state_tracker"');
        expect(linea).toContain('desactivar');
        expect(linea).toContain('ruta directa');
    });

    it('avisa cuando la ruta SillyTavern deja la política inerte', async () => {
        const consola = vi.spyOn(console, 'log').mockImplementation(() => {});
        const contextoOriginal = SillyTavern.getContext;
        SillyTavern.getContext = () => ({
            ...contextoOriginal(),
            generateRaw: async () => 'ok',
        });
        try {
            await sendStateRequest(
                { connectionSource: 'default', debugMode: true, localThinkingPolicy: { state_tracker: { mode: 'desactivar' } } },
                'SISTEMA', 'USUARIO', null,
                { thinkingJob: 'state_tracker' },
            );
        } finally {
            SillyTavern.getContext = contextoOriginal;
        }
        const linea = consola.mock.calls.map(c => String(c[0])).find(texto => texto.includes('Pensamiento del trabajo'));
        expect(linea).toContain('inerte');
        expect(linea).toContain('Ruta SillyTavern');
    });

    it('sin debugMode no se escribe ninguna línea de política', async () => {
        const consola = vi.spyOn(console, 'log').mockImplementation(() => {});
        await sendStateRequest(AJUSTES_OPENAI, 'SISTEMA', 'USUARIO', null, { thinkingJob: 'state_tracker' });
        expect(consola.mock.calls.some(c => String(c[0]).includes('Pensamiento del trabajo'))).toBe(false);
    });
});
