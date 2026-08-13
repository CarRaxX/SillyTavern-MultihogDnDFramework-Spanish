/**
 * Structured-output contract for the one-shot Map Architect request.
 * Runtime validation remains authoritative; this schema prevents providers from
 * spending the entire response on reasoning or returning a non-map message.
 */
export const MAP_ARCHITECT_JSON_SCHEMA = Object.freeze({
    name: 'dungeon_map_v3',
    description: 'A complete private objective map for one dangerous site.',
    strict: false,
    returnInvalid: true,
    value: {
        type: 'object',
        additionalProperties: false,
        properties: {
            version: { type: 'integer', enum: [3] },
            site: { type: 'string', minLength: 1 },
            areas: {
                type: 'array',
                minItems: 2,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        id: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
                        name: { type: 'string', minLength: 1 },
                        knowledge: { type: 'string', enum: ['UNREVEALED', 'DISCOVERED', 'VISITED'] },
                        geometry: { type: 'array', items: { type: 'string', minLength: 1 } },
                        connections: {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                properties: {
                                    to: { type: 'string', minLength: 1 },
                                    state: { type: 'string', enum: ['OPEN', 'CLOSED', 'LOCKED', 'BLOCKED', 'DESTROYED', 'UNKNOWN'] },
                                    detail: { type: 'string' },
                                },
                                required: ['to', 'state', 'detail'],
                            },
                        },
                    },
                    required: ['id', 'name', 'knowledge', 'geometry', 'connections'],
                },
            },
            assets: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        id: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
                        kind: { type: 'string', enum: ['CREATURE', 'GROUP', 'TRAP', 'HAZARD', 'OBJECT', 'LOOT', 'BARRIER', 'ALARM', 'EFFECT', 'OTHER'] },
                        name: { type: 'string', minLength: 1 },
                        location: { type: 'string', minLength: 1 },
                        state: {
                            type: 'string',
                            enum: [
                                'ACTIVE', 'ALERT', 'IDLE', 'DORMANT', 'FLEEING', 'CAPTURED',
                                'DEAD', 'DESTROYED', 'DISABLED', 'DISARMED', 'ARMED', 'TRIGGERED',
                                'LOCKED', 'UNLOCKED', 'OPEN', 'CLOSED', 'BLOCKED', 'CLEARED',
                                'INTACT', 'DAMAGED', 'TAKEN', 'AVAILABLE', 'EXHAUSTED', 'EXPIRED',
                                'DISMISSED', 'REMOVED', 'UNKNOWN',
                            ],
                        },
                        knowledge: { type: 'string', enum: ['UNREVEALED', 'SUSPECTED', 'KNOWN'] },
                        detail: { type: 'string' },
                        origin: { type: 'string', enum: ['INITIAL_MAP'] },
                        behavior: { type: 'string', minLength: 1 },
                        route: { type: 'array', items: { type: 'string', minLength: 1 } },
                        faction: { type: 'string', minLength: 1 },
                        owner: { type: 'string', minLength: 1 },
                        duration: { type: 'string', minLength: 1 },
                    },
                    required: ['id', 'kind', 'name', 'location', 'state', 'knowledge', 'detail', 'origin'],
                },
            },
        },
        required: ['version', 'site', 'areas', 'assets'],
    },
});
