/**
 * Default NPC/PC section schemas and the extension settings key.
 */

export const DEFAULT_NPC_SECTIONS = [
    { id: 'sec_species', name: 'Especie', description: 'Especie/raza, cualquier subtipo y género — identidad estática que esencialmente nunca cambia después de registrar al PNJ por primera vez.', icon: '🧬', color: '#0ea5e9' },
    { id: 'sec_body', name: 'Cuerpo', description: 'Aspecto físico característico/predeterminado: complexión, edad, rostro, cabello, ojos, piel, cicatrices, lenguaje corporal natural. No es un atuendo pasajero de la escena ni una pose momentánea — solo cambios que se convierten en su nuevo aspecto duradero. NO describir el equipo equipado aquí — ver Equipo Equipado.', icon: '👁️', color: '#d4a940' },
    { id: 'sec_equipment', name: 'Equipo Equipado', description: 'Solo equipo equipado/llevado actualmente — armas, armaduras, ropa, accesorios visibles en el personaje. NO monedas, bolsas de botín, listas de inventario ni objetos de bolsillo. Se actualiza cuando cambia lo que llevan visiblemente equipado en la narrativa; copia directamente lo que la historia muestre que llevan puesto o empuñan.', icon: '🎽', color: '#f59e0b' },
    { id: 'sec_personality', name: 'Personalidad', description: 'Temperamento y motivaciones estables — no el estado de ánimo o estrés de hoy.', icon: '🧠', color: '#8b5cf6' },
    { id: 'sec_background', name: 'Breve Trasfondo', description: 'Rol actual, origen, historia — no su papel en la trama actual.', icon: '📜', color: '#3b82f6' },
    { id: 'sec_habits', name: 'Hábitos y Comportamientos', description: 'Manierismos y patrones recurrentes — no el comportamiento de una sola escena.', icon: '🔄', color: '#10b981' },
    { id: 'sec_strengths', name: 'Fortalezas', description: '[Frases concisas en formato de viñetas sobre sus fortalezas, habilidades o virtudes más destacadas. Precisas y específicas. Un personaje bondadoso puede tener más fortalezas que debilidades.]', icon: '⚡', color: '#22c55e' },
    { id: 'sec_flaws', name: 'Debilidades', description: '[Frases concisas en formato de viñetas sobre sus debilidades, malos hábitos o fallos morales más notables. Sé honesto y específico. Un personaje conflictivo puede tener más debilidades que fortalezas.]\n(Nota: La división entre fortalezas y debilidades no necesita ser equitativa; refleja fielmente al personaje.)', icon: '⚠️', color: '#ef4444' },
    { id: 'sec_combat_profile', name: 'Perfil de Combate', description: '[OCULTO HASTA ESTABLECER — creado a partir de un bloque [COMBAT] para este PNJ; una vez que existe, también actualiza las estadísticas duraderas desde [PARTY] tras subir de nivel. Copia el bloque de estadísticas completo: PV, CA, salvaciones, armas, habilidades, hechizos. Nunca fabriques ni resumas.]', icon: '🤺', color: '#38bdf8', hiddenUntilSet: true }
];

export const DEFAULT_PC_SECTIONS = [
    { id: 'sec_species', name: 'Especie', description: '[Indica especie, etnia y género basándote en la ficha del personaje y las Preferencias del Jugador. Intégralo en prosa fluida — NO antepongas una subetiqueta literal como "Especie:", "Etnia:" o "Género:". Identidad estática — esencialmente congelada tras la creación del personaje.]', icon: '🧬', color: '#0ea5e9' },
    { id: 'sec_body', name: 'Cuerpo', description: '[Describe rasgos físicos: complexión, altura, cabello, ojos, tono de piel, marcas distintivas, cicatrices y lenguaje corporal natural. DEBES incorporar explícitamente cualquier nota de apariencia provista en la ficha/preferencias. NO describas ropa, armadura o equipo llevado aquí — pertenecen a Equipo Equipado.]', icon: '👁️', color: '#d4a940' },
    { id: 'sec_equipment', name: 'Equipo Equipado', description: '[Describe solo el equipo que lleva puesto/transporta actualmente — armas, armaduras, ropa, accesorios visibles en el personaje. NO monedas, bolsas de botín ni listas de inventario. Basado en los objetos equipados [E] de CHARACTER/inventario de la ficha si están disponibles. Se actualiza conforme cambia el equipo equipado a lo largo de la partida.]', icon: '🎽', color: '#f59e0b' },
    { id: 'sec_personality', name: 'Personalidad', description: '[Describe el temperamento, cómo actúa con los demás y tendencias emocionales. DEBES incorporar cualquier rasgo proporcionado.]', icon: '🧠', color: '#8b5cf6' },
    { id: 'sec_background', name: 'Trasfondo', description: '[Proporciona contexto de historia basándote en la ficha del personaje. DEBES incorporar cualquier indicio de trasfondo provisto. Breve pero significativo.]', icon: '📜', color: '#3b82f6' },
    { id: 'sec_habits', name: 'Hábitos y Comportamientos', description: '[Describe manierismos recurrentes, hábitos, manías o patrones de comportamiento.]', icon: '🔄', color: '#10b981' },
    { id: 'sec_strengths', name: 'Fortalezas', description: '[Frases concisas en formato de viñetas sobre sus fortalezas, habilidades o virtudes más destacadas. Precisas y específicas.]', icon: '⚡', color: '#22c55e' },
    { id: 'sec_flaws', name: 'Debilidades', description: '[Frases concisas en formato de viñetas sobre sus debilidades, malos hábitos o fallos morales más notables. Sé honesto y específico.]\n(Nota: La división entre fortalezas y debilidades no necesita ser equitativa; puede reflejar fielmente al personaje.)', icon: '⚠️', color: '#ef4444' }
];

export const MODULE_NAME = 'rpg_tracker';
