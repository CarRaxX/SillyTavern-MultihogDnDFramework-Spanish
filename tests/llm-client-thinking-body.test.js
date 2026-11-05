import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { sendAgentTurn, sendViaOpenAI } from '../llm-client.js';

// Instantánea tomada sobre `main` (2d08f36): es la referencia de paridad del
// defecto (AC0/D4). Con `heredar` el cuerpo ha de seguir siendo idéntico.
const instantanea = JSON.parse(readFileSync(new URL('./fixtures/pensamiento-cuerpos-main.json', import.meta.url), 'utf8'));

const SSE = 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n';
const MENSAJES = [
    { role: 'system', content: 'SISTEMA' },
    { role: 'user', content: 'USUARIO' },
];

/** Cuerpo (crudo y parseado) del último POST capturado. */
let envio;

beforeEach(() => {
    envio = null;
    vi.stubGlobal('fetch', vi.fn(async (_url, options = {}) => {
        if (options?.body) envio = { texto: options.body, cuerpo: JSON.parse(options.body) };
        if (String(_url).includes('/api/chat')) return Response.json({ message: { content: 'ok' } });
        return new Response(new ReadableStream({
            start(controlador) {
                controlador.enqueue(new TextEncoder().encode(SSE));
                controlador.close();
            },
        }), { headers: { 'Content-Type': 'text/event-stream' } });
    }));
});

afterEach(() => vi.unstubAllGlobals());

const AJUSTES_OPENAI = {
    connectionSource: 'openai',
    openaiUrl: 'http://localhost:8080/v1',
    openaiModel: 'modelo-prueba',
    maxTokens: 4096,
};

const AJUSTES_OLLAMA = {
    connectionSource: 'ollama',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'modelo-prueba',
};

describe('sendViaOpenAI aplica la política de pensamiento (D3)', () => {
    it('sin política ni opciones el cuerpo es idéntico byte a byte al de main', async () => {
        await sendViaOpenAI('http://localhost:8080/v1', '', 'modelo-prueba', 'SISTEMA', 'USUARIO', 4096, {}, null, null);
        expect(envio.texto).toBe(instantanea['openai-directo'].texto);
    });

    it('«desactivar»: reasoning_effort none y chat_template_kwargs con booleano, sin presupuesto', async () => {
        await sendViaOpenAI('http://localhost:8080/v1', '', 'modelo-prueba', 'SISTEMA', 'USUARIO', 4096, {}, null, null,
            { thinkingPolicy: { mode: 'desactivar' }, thinkingJob: 'state_tracker' });
        expect(envio.cuerpo.reasoning_effort).toBe('none');
        expect(envio.cuerpo.chat_template_kwargs).toEqual({ enable_thinking: false });
        expect(typeof envio.cuerpo.chat_template_kwargs.enable_thinking).toBe('boolean');
        expect('reasoning_budget_tokens' in envio.cuerpo).toBe(false);
        expect('thinking_budget_tokens' in envio.cuerpo).toBe(false);
        expect('reasoning_budget_message' in envio.cuerpo).toBe(false);
    });

    it('«presupuesto»: campo canónico y alias con el mismo valor', async () => {
        await sendViaOpenAI('http://localhost:8080/v1', '', 'modelo-prueba', 'SISTEMA', 'USUARIO', 4096, {}, null, null,
            { thinkingPolicy: { mode: 'presupuesto', tokens: 1024 }, thinkingJob: 'lorebook_agent' });
        expect(envio.cuerpo.reasoning_budget_tokens).toBe(1024);
        expect(envio.cuerpo.thinking_budget_tokens).toBe(1024);
        expect('reasoning_effort' in envio.cuerpo).toBe(false);
        expect('chat_template_kwargs' in envio.cuerpo).toBe(false);
    });

    it('«heredar» explícito deja el cuerpo byte a byte como en main', async () => {
        await sendViaOpenAI('http://localhost:8080/v1', '', 'modelo-prueba', 'SISTEMA', 'USUARIO', 4096, {}, null, null,
            { thinkingPolicy: { mode: 'heredar' }, thinkingJob: 'state_tracker' });
        expect(envio.texto).toBe(instantanea['openai-directo'].texto);
    });

    it('un «desactivar» etiquetado en un trabajo de juicio no llega al cuerpo', async () => {
        await sendViaOpenAI('http://localhost:8080/v1', '', 'modelo-prueba', 'SISTEMA', 'USUARIO', 4096, {}, null, null,
            { thinkingPolicy: { mode: 'desactivar' }, thinkingJob: 'map_evolution' });
        expect(envio.texto).toBe(instantanea['openai-directo'].texto);
    });
});

/** Copia de la entrada de la instantánea sin el campo `tools` (no se envían). */
function cuerpoBase(nombre) {
    const cuerpo = { ...instantanea[nombre].cuerpo };
    delete cuerpo.tools;
    return JSON.stringify(cuerpo);
}

describe('sendAgentTurn aplica la política solo en su rama openai (D3)', () => {
    it('con política resuelta por trabajo añade los campos al cuerpo propio', async () => {
        await sendAgentTurn(
            { ...AJUSTES_OPENAI, localThinkingPolicy: { state_tracker: { mode: 'desactivar' } } },
            MENSAJES, null, null,
            { thinkingJob: 'state_tracker' },
        );
        expect(envio.cuerpo.reasoning_effort).toBe('none');
        expect(envio.cuerpo.chat_template_kwargs).toEqual({ enable_thinking: false });
    });

    it('sin etiqueta de trabajo el cuerpo es el de siempre', async () => {
        await sendAgentTurn({ ...AJUSTES_OPENAI, localThinkingPolicy: { state_tracker: { mode: 'desactivar' } } }, MENSAJES, null, null);
        expect(envio.texto).toBe(cuerpoBase('turno-agente-openai'));
    });

    it('la rama ollama ignora la política: ni un campo nuevo', async () => {
        await sendAgentTurn(
            { ...AJUSTES_OLLAMA, localThinkingPolicy: { map_evolution_compress: { mode: 'desactivar' } } },
            MENSAJES, null, null,
            { thinkingJob: 'map_evolution_compress' },
        );
        expect(envio.texto).toBe(cuerpoBase('turno-agente-ollama'));
        expect('reasoning_effort' in envio.cuerpo).toBe(false);
        expect('chat_template_kwargs' in envio.cuerpo).toBe(false);
    });
});
