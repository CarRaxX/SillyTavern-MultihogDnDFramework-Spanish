import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { sendAgentTurn, sendStateRequest, sendViaOllama, sendViaOpenAI } from '../llm-client.js';

// T10 — Paridad del defecto (AC0/D4). La instantánea de los cinco cuerpos se
// tomó sobre `main` (2d08f36) ANTES de tocar `llm-client.js` con
// `tests/helpers/captura-cuerpos.mjs` y se conserva aquí como test permanente:
// con la política en `heredar`, que es el default, cada petición ha de salir
// byte a byte como salía aquel día. Si alguien añade un campo suelto "por si
// acaso", este fichero se rompe.
const instantanea = JSON.parse(readFileSync(new URL('./fixtures/pensamiento-cuerpos-main.json', import.meta.url), 'utf8'));

const SSE = 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n';
const MENSAJES = [
    { role: 'system', content: 'SISTEMA' },
    { role: 'user', content: 'USUARIO' },
];
const HERRAMIENTAS = [{ type: 'function', function: { name: 'herramienta_prueba', parameters: { type: 'object', properties: {} } } }];
const CAMPOS_PENSAMIENTO = ['reasoning_effort', 'chat_template_kwargs', 'reasoning_budget_tokens', 'thinking_budget_tokens', 'reasoning_budget_message'];

/** Ningún campo de razonamiento debe aparecer en un cuerpo sin política (AC0.2). */
function sinCamposDePensamiento(objeto) {
    for (const campo of CAMPOS_PENSAMIENTO) expect(campo in objeto, `campo nuevo: ${campo}`).toBe(false);
}

let captured;

beforeEach(() => {
    captured = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
        if (options?.body) captured.push({ url: String(url), texto: options.body, cuerpo: JSON.parse(options.body) });
        if (String(url).includes('/api/chat')) return Response.json({ message: { content: 'ok' } });
        return new Response(new ReadableStream({
            start(controlador) {
                controlador.enqueue(new TextEncoder().encode(SSE));
                controlador.close();
            },
        }), { headers: { 'Content-Type': 'text/event-stream' } });
    }));
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('Paridad del defecto: los cinco cuerpos con «heredar» (D4)', () => {
    it('sendViaOllama sin opciones', async () => {
        await sendViaOllama('http://localhost:11434', 'modelo-prueba', 'SISTEMA', 'USUARIO', 4096, {}, null, null, false);
        expect(captured[0].texto).toBe(instantanea['ollama-directo'].texto);
    });

    it('sendViaOpenAI sin opciones y con «heredar» explícito', async () => {
        // El noveno argumento es `jsonSchema`; el décimo, nuevo, son las opciones.
        // Un llamante que pasa `null` en vez de `{}` no puede romperse.
        await sendViaOpenAI('http://localhost:8080/v1', '', 'modelo-prueba', 'SISTEMA', 'USUARIO', 4096, {}, null, null, null);
        expect(captured[0].texto).toBe(instantanea['openai-directo'].texto);
        captured = [];
        await sendViaOpenAI('http://localhost:8080/v1', '', 'modelo-prueba', 'SISTEMA', 'USUARIO', 4096, {}, null, null, { thinkingPolicy: { mode: 'heredar' }, thinkingJob: 'state_tracker' });
        expect(captured[0].texto).toBe(instantanea['openai-directo'].texto);
    });

    it('sendAgentTurn (rama openai) sin opciones y con «heredar» explícito', async () => {
        await sendAgentTurn({ connectionSource: 'openai', openaiUrl: 'http://localhost:8080/v1', openaiModel: 'modelo-prueba', maxTokens: 4096 }, MENSAJES, HERRAMIENTAS, null);
        expect(captured[0].texto).toBe(instantanea['turno-agente-openai'].texto);
        captured = [];
        await sendAgentTurn(
            { connectionSource: 'openai', openaiUrl: 'http://localhost:8080/v1', openaiModel: 'modelo-prueba', maxTokens: 4096, localThinkingPolicy: { state_tracker: { mode: 'heredar' } } },
            MENSAJES, HERRAMIENTAS, null,
            { thinkingJob: 'state_tracker' },
        );
        expect(captured[0].texto).toBe(instantanea['turno-agente-openai'].texto);
    });

    it('sendAgentTurn (rama ollama) nunca recibe política, ni poniéndola a mano', async () => {
        await sendAgentTurn({ connectionSource: 'ollama', ollamaUrl: 'http://localhost:11434', ollamaModel: 'modelo-prueba' }, MENSAJES, HERRAMIENTAS, null);
        expect(captured[0].texto).toBe(instantanea['turno-agente-ollama'].texto);
        captured = [];
        await sendAgentTurn(
            { connectionSource: 'ollama', ollamaUrl: 'http://localhost:11434', ollamaModel: 'modelo-prueba', localThinkingPolicy: { state_tracker: { mode: 'desactivar' } } },
            MENSAJES, HERRAMIENTAS, null,
            { thinkingJob: 'state_tracker', thinkingPolicy: { mode: 'desactivar' } },
        );
        expect(captured[0].texto).toBe(instantanea['turno-agente-ollama'].texto);
    });

    it('la rama openai de sendStateRequest reproduce el cuerpo de main etiqueta de trabajo mediante', async () => {
        // `sendStateRequest` no usa el sistema tal cual: desde antes de esta ola
        // le antepone sus directrices de razonamiento, así que viaja en su propia
        // entrada de la instantánea y no se compara con `openai-directo`.
        expect(instantanea['estado-peticion-openai'].texto).toContain('<reasoning_guidelines>');
        await sendStateRequest(
            { connectionSource: 'openai', openaiUrl: 'http://localhost:8080/v1', openaiModel: 'modelo-prueba', maxTokens: 4096 },
            'SISTEMA', 'USUARIO', null,
            { thinkingJob: 'state_tracker' },
        );
        expect(captured[0].texto).toBe(instantanea['estado-peticion-openai'].texto);
    });
});

describe('Paridad del defecto: nada nuevo hacia SillyTavern', () => {
    it('generateRaw (API Principal) sigue pasando exactamente las mismas claves', async () => {
        let opciones = null;
        const original = SillyTavern.getContext;
        SillyTavern.getContext = () => ({
            ...original(),
            generateRaw: async (opts) => { opciones = opts; return 'ok'; },
        });
        try {
            await sendStateRequest(
                { connectionSource: 'default', localThinkingPolicy: { state_tracker: { mode: 'desactivar' }, world_progression: { mode: 'presupuesto', tokens: 512 } } },
                'SISTEMA', 'USUARIO', null,
                { thinkingJob: 'state_tracker' },
            );
        } finally {
            SillyTavern.getContext = original;
        }
        expect(Object.keys(opciones).sort()).toEqual([
            'bypassAll', 'jsonSchema', 'prompt', 'reasoning_format', 'responseLength', 'signal', 'systemPrompt', 'trimNames',
        ]);
        sinCamposDePensamiento(opciones);
    });

    it('el processRequest de SillyTavern (API Principal en streaming) no gana campos', async () => {
        let datos = null;
        const original = SillyTavern.getContext;
        SillyTavern.getContext = () => ({
            ...original(),
            mainApi: 'openai',
            chatCompletionSettings: { chat_completion_source: 'core' },
            ChatCompletionService: {
                processRequest: async (payload) => {
                    datos = payload;
                    return async function* () { yield { text: 'ok' }; };
                },
            },
        });
        try {
            await sendStateRequest(
                { connectionSource: 'default', localThinkingPolicy: { map_runtime: { mode: 'desactivar' } } },
                'SISTEMA', 'USUARIO', null,
                { stream: true, thinkingJob: 'map_runtime' },
            );
        } finally {
            SillyTavern.getContext = original;
        }
        expect(Object.keys(datos).sort()).toEqual([
            'chat_completion_source', 'max_tokens', 'messages', 'minimax_endpoint', 'model', 'proxy_password',
            'reverse_proxy', 'siliconflow_endpoint', 'stream', 'vertexai_region', 'custom_url', 'zai_endpoint',
        ].sort());
        sinCamposDePensamiento(datos);
    });

    it('el override del Perfil sigue vacío y la lista blanca de campos no crece', async () => {
        let override = null;
        const original = SillyTavern.getContext;
        SillyTavern.getContext = () => ({
            ...original(),
            ConnectionManagerRequestService: {
                getProfile: () => ({ preset: '' }),
                sendRequest: async (_p, _m, _t, _o, sobrecarga) => {
                    override = sobrecarga || {};
                    return { content: 'ok', reasoning: '' };
                },
            },
        });
        try {
            await sendStateRequest(
                { connectionSource: 'profile', connectionProfileId: 'perfil-1', localThinkingPolicy: { tracker_audit: { mode: 'presupuesto', tokens: 2048 } } },
                'SISTEMA', 'USUARIO', null,
                { thinkingJob: 'tracker_audit' },
            );
        } finally {
            SillyTavern.getContext = original;
        }
        expect(override).toEqual({});
    });

    it('la lista blanca de campos reenviados a SillyTavern no incluye razonamiento', () => {
        const fuente = readFileSync(new URL('../llm-client.js', import.meta.url), 'utf8');
        const bloque = fuente.slice(
            fuente.indexOf('const LIVE_CHAT_COMPLETION_OVERRIDE_FIELDS'),
            fuente.indexOf('];', fuente.indexOf('const LIVE_CHAT_COMPLETION_OVERRIDE_FIELDS')),
        );
        expect(bloque).toBeTruthy();
        for (const campo of CAMPOS_PENSAMIENTO) expect(bloque, `se coló ${campo} en la lista blanca`).not.toContain(campo);
    });
});

describe('Paridad del defecto: «desactivar» no lleva presupuesto', () => {
    it('apagado = effort none y enable_thinking booleano, sin ningún presupuesto', async () => {
        await sendViaOpenAI('http://localhost:8080/v1', '', 'modelo-prueba', 'SISTEMA', 'USUARIO', 4096, {}, null, null,
            { thinkingPolicy: { mode: 'desactivar' }, thinkingJob: 'state_tracker' });
        const cuerpo = captured[0].cuerpo;
        expect(cuerpo.reasoning_effort).toBe('none');
        expect(cuerpo.chat_template_kwargs).toEqual({ enable_thinking: false });
        expect('reasoning_budget_tokens' in cuerpo).toBe(false);
        expect('thinking_budget_tokens' in cuerpo).toBe(false);
        expect('reasoning_budget_message' in cuerpo).toBe(false);
    });

    it('presupuesto = canónico y alias iguales, sin apagar el esfuerzo', async () => {
        await sendViaOpenAI('http://localhost:8080/v1', '', 'modelo-prueba', 'SISTEMA', 'USUARIO', 4096, {}, null, null,
            { thinkingPolicy: { mode: 'presupuesto', tokens: 1024 }, thinkingJob: 'map_evolution_compress' });
        const cuerpo = captured[0].cuerpo;
        expect(cuerpo.reasoning_budget_tokens).toBe(1024);
        expect(cuerpo.thinking_budget_tokens).toBe(1024);
        expect('reasoning_effort' in cuerpo).toBe(false);
        expect('chat_template_kwargs' in cuerpo).toBe(false);
        expect('reasoning_budget_message' in cuerpo).toBe(false);
    });

    it('los trabajos de juicio no pueden apagarse ni con la política escrita a mano', async () => {
        for (const trabajo of ['tracker_full_review', 'tracker_audit', 'lorebook_agent', 'map_runtime', 'map_evolution', 'world_progression']) {
            captured = [];
            await sendStateRequest(
                { connectionSource: 'openai', openaiUrl: 'http://localhost:8080/v1', openaiModel: 'modelo-prueba', maxTokens: 4096, localThinkingPolicy: { [trabajo]: { mode: 'desactivar' } } },
                'SISTEMA', 'USUARIO', null,
                { thinkingJob: trabajo },
            );
            // `normalizeThinkingPolicy` devuelve `heredar` → ni un byte de más (D5).
            sinCamposDePensamiento(captured[0].cuerpo);
            expect(captured[0].texto, `${trabajo} se apagó`).toBe(instantanea['estado-peticion-openai'].texto);
        }
    });

    it('los dos trabajos elegibles sí se apagan, y sin presupuesto suelto', async () => {
        for (const trabajo of ['state_tracker', 'map_evolution_compress']) {
            captured = [];
            await sendStateRequest(
                { connectionSource: 'openai', openaiUrl: 'http://localhost:8080/v1', openaiModel: 'modelo-prueba', maxTokens: 4096, localThinkingPolicy: { [trabajo]: { mode: 'desactivar' } } },
                'SISTEMA', 'USUARIO', null,
                { thinkingJob: trabajo },
            );
            const cuerpo = captured[0].cuerpo;
            expect(cuerpo.reasoning_effort, `${trabajo} no se apagó`).toBe('none');
            expect(cuerpo.chat_template_kwargs, `${trabajo} sin enable_thinking`).toEqual({ enable_thinking: false });
            expect('reasoning_budget_tokens' in cuerpo, `${trabajo} con presupuesto`).toBe(false);
            expect('thinking_budget_tokens' in cuerpo, `${trabajo} con alias`).toBe(false);
        }
    });
});
