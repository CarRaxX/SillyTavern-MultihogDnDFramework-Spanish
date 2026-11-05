/**
 * Herramienta de procedencia de `tests/fixtures/pensamiento-cuerpos-main.json`.
 *
 * Captura los cuerpos de petición que arma `llm-client.js` contra un checkout
 * cualquiera (el commit base, o el árbol de trabajo) sin tocar la red: se
 * sustituye `fetch` por un capturer y se imitan los globales de SillyTavern.
 *
 * Uso:
 *   git worktree add --detach /tmp/opencode/base-t10 2d08f36
 *   node tests/helpers/captura-cuerpos.mjs /tmp/opencode/base-t10/llm-client.js /tmp/opencode/cuerpos-base.json
 *   node tests/helpers/captura-cuerpos.mjs "$PWD/llm-client.js" /tmp/opencode/cuerpos-head.json
 *   diff /tmp/opencode/cuerpos-base.json /tmp/opencode/cuerpos-head.json   # sin diferencias = paridad
 *
 * No forma parte de la suite: es un script de mantenimiento.
 */
import { writeFileSync } from 'node:fs';

if (process.argv.length < 4) {
    console.error('Uso: node tests/helpers/captura-cuerpos.mjs <ruta/llm-client.js> <salida.json>');
    process.exit(2);
}

const localStore = Object.create(null);
globalThis.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(localStore, k) ? localStore[k] : null),
    setItem: (k, v) => { localStore[k] = String(v); },
    removeItem: (k) => { delete localStore[k]; },
    clear: () => { for (const k of Object.keys(localStore)) delete localStore[k]; },
    key: (i) => Object.keys(localStore)[i] ?? null,
    get length() { return Object.keys(localStore).length; },
};
globalThis.saveSettingsDebounced = () => {};
globalThis.SillyTavern = {
    getContext: () => ({ extensionSettings: {}, chatId: 'captura', saveSettingsDebounced: globalThis.saveSettingsDebounced }),
};

const SSE = 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n';
let captured = [];
globalThis.fetch = async (url, options = {}) => {
    if (options?.body) captured.push({ texto: options.body, cuerpo: JSON.parse(options.body) });
    if (String(url).includes('/api/chat')) return Response.json({ message: { content: 'ok' } });
    return new Response(new ReadableStream({
        start(controlador) {
            controlador.enqueue(new TextEncoder().encode(SSE));
            controlador.close();
        },
    }), { headers: { 'Content-Type': 'text/event-stream' } });
};

// El cliente escribe por consola en cada petición; aquí sobra ruido.
console.log = () => {};
console.warn = () => {};
console.debug = () => {};

const modulo = await import(process.argv[2]);

const MENSAJES = [{ role: 'system', content: 'SISTEMA' }, { role: 'user', content: 'USUARIO' }];
const HERRAMIENTAS = [{ type: 'function', function: { name: 'herramienta_prueba', parameters: { type: 'object', properties: {} } } }];
const AJUSTES = { connectionSource: 'openai', openaiUrl: 'http://localhost:8080/v1', openaiModel: 'modelo-prueba', maxTokens: 4096 };

const salida = {};
const toma = async (clave, fn) => {
    captured = [];
    await fn();
    if (captured.length !== 1) throw new Error(`${clave}: se esperaba 1 cuerpo y hay ${captured.length}`);
    salida[clave] = captured[0];
};

// Los cinco viajes reales del cliente: dos cuerpos propios gobernarables por la
// política (openai-directo, turno-agente-openai), dos que no (ollama) y el
// sendStateRequest de la rama openai, que rellena las directrices de razonamiento.
await toma('ollama-directo', () => modulo.sendViaOllama('http://localhost:11434', 'modelo-prueba', 'SISTEMA', 'USUARIO', 4096, {}, null, null, false));
await toma('openai-directo', () => modulo.sendViaOpenAI('http://localhost:8080/v1', '', 'modelo-prueba', 'SISTEMA', 'USUARIO', 4096, {}, null, null));
await toma('estado-peticion-openai', () => modulo.sendStateRequest(AJUSTES, 'SISTEMA', 'USUARIO', null, {}));
await toma('turno-agente-openai', () => modulo.sendAgentTurn(AJUSTES, MENSAJES, HERRAMIENTAS, null));
await toma('turno-agente-ollama', () => modulo.sendAgentTurn({ connectionSource: 'ollama', ollamaUrl: 'http://localhost:11434', ollamaModel: 'modelo-prueba' }, MENSAJES, HERRAMIENTAS, null));

writeFileSync(process.argv[3], `${JSON.stringify(salida, null, 2)}\n`, 'utf8');
process.stdout.write(`capturados ${Object.keys(salida).length} cuerpos desde ${process.argv[2]}\n`);
