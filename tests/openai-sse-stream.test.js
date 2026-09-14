import { describe, expect, it } from 'vitest';
import { readOpenAISSEStream } from '../llm-client.js';

describe('readOpenAISSEStream', () => {
    it('accumulates streamed content and reasoning', async () => {
        const ssePayload = [
            'data: {"choices":[{"delta":{"role":"assistant","reasoning_content":"Analizando"}}]}\n\n',
            'data: {"choices":[{"delta":{"reasoning_content":" el contexto..."}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"Hola "}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"mundo!"}}]}\n\n',
            'data: [DONE]\n\n',
        ].join('');

        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(ssePayload));
                controller.close();
            },
        });

        const mockResponse = new Response(stream, {
            headers: { 'Content-Type': 'text/event-stream' },
        });

        const result = await readOpenAISSEStream(mockResponse);
        expect(result.content).toBe('Hola mundo!');
        expect(result.reasoning).toBe('Analizando el contexto...');
        expect(result.tool_calls).toEqual([]);
    });

    it('accumulates fragmented tool calls incrementally', async () => {
        const ssePayload =
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"commit","arguments":"{\\"rec"}}]}}]}\n\n' +
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ord\\": [\\""}}]}}]}\n\n' +
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"Valle\\"]}"}}]}}]}\n\n' +
            'data: [DONE]\n\n';

        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(ssePayload));
                controller.close();
            },
        });

        const mockResponse = new Response(stream, {
            headers: { 'Content-Type': 'text/event-stream' },
        });

        const result = await readOpenAISSEStream(mockResponse);
        expect(result.tool_calls.length).toBe(1);
        expect(result.tool_calls[0].id).toBe('call_123');
        expect(result.tool_calls[0].function.name).toBe('commit');
        expect(result.tool_calls[0].function.arguments).toBe('{"record": ["Valle"]}');
    });
});
