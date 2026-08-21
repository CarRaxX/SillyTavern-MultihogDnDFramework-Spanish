import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const settingsMarkup = readFileSync(new URL('../settings.html', import.meta.url), 'utf8');

function divDepthAt(marker) {
    const beforeMarker = settingsMarkup.slice(0, settingsMarkup.indexOf(marker));
    const tags = beforeMarker.match(/<\/?div(?:\s[^>]*)?>/g) || [];
    return tags.reduce((depth, tag) => depth + (tag.startsWith('</') ? -1 : 1), 0);
}

describe('General & Visuals settings', () => {
    it('keeps every primary section inside the framework drawer', () => {
        const primaryHeaders = [
            '<b>Ajustes General y Visuales</b>',
            '<b>Conexiones y Modelos</b>',
            '<b>Sistemas de Juego y Libros de Reglas</b>',
            '<b>Rastreador de Estado y Configuración de Ficha</b>',
            '<b>Agente de Lorebook y Asistente IA</b>',
            '<b>Mapas Persistentes</b>',
            '<b>Progresión del Mundo</b>',
            '<b>Acompañante de Aventura</b>',
        ];
        const expectedDepth = divDepthAt(primaryHeaders[0]);

        expect(primaryHeaders.map(divDepthAt)).toEqual(primaryHeaders.map(() => expectedDepth));
        expect((settingsMarkup.match(/<div(?:\s|>)/g) || []).length)
            .toBe((settingsMarkup.match(/<\/div>/g) || []).length);
    });

    it('organizes settings into Core & Branching, UI Appearance, and Portraits drawers', () => {
        expect(settingsMarkup).toContain('<b>Núcleo y Ramificación (Branching)</b>');
        expect(settingsMarkup).toContain('<b>Apariencia de la Interfaz</b>');
        expect(settingsMarkup).toContain('<b>Retratos</b>');
    });

    it('places Connections & Models immediately after General & Visuals', () => {
        const general = settingsMarkup.indexOf('<b>Ajustes General y Visuales</b>');
        const connections = settingsMarkup.indexOf('<b>Conexiones y Modelos</b>');
        const gameSystems = settingsMarkup.indexOf('<b>Sistemas de Juego y Libros de Reglas</b>');

        expect(general).toBeGreaterThanOrEqual(0);
        expect(connections).toBeGreaterThan(general);
        expect(gameSystems).toBeGreaterThan(connections);
    });

    it('provides one central slot for every feature connection', () => {
        [
            'rpg_connection_slot_state_tracker',
            'rpg_connection_slot_combat_override',
            'rpg_connection_slot_lorebook_agent',
            'rpg_connection_slot_character_creation',
            'rpg_connection_slot_adventure_companion',
            'rpg_connection_slot_game_system_wizard',
            'rpg_connection_slot_map_architect',
            'rpg_connection_slot_map_runtime',
            'rpg_connection_slot_world_progression',
            'rpg_connection_slot_portraits',
        ].forEach(id => expect(settingsMarkup).toContain(`id="${id}"`));

        const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
        expect(indexSource).toContain('organizeConnectionSettingsUI();');
        expect(indexSource).toContain('initSettingsOverlay(');
        expect(indexSource).toContain("settings-stub");
        expect(indexSource).toContain("control: '#rpg_tracker_connection_source'");
        expect(indexSource).toContain("control: '#rpg_tracker_router_source'");
        expect(indexSource).toContain("control: '#rpg_adventure_companion_connection_source'");
        expect(indexSource).toContain("control: '#rpg_gs_wizard_connection_source'");
        expect(indexSource).toContain("control: '#rpg_map_architect_connection_source'");
        expect(indexSource).toContain("control: '#rpg_map_runtime_connection_source'");
        expect(indexSource).toContain("control: '#rpg_world_connection_source'");
        expect(indexSource).toContain("control: '#rpg_portrait_connection_source'");
        expect(indexSource).toContain('I recommend a cheap mid-tier model such as GPT-5.6 Luna, Gemini Flash/Flash-Lite series, or Deepseek V4 Flash latest.');
        expect(indexSource).toContain('Same models work fine here as with the State Tracker.');
        expect(indexSource).toContain('I recommend using a somewhat better model here such as Sonnet 5 or above for more robust and complex systems. Your mileage varies a lot here. Experiment.');
        expect(indexSource).toContain('A lightweight model should do fine.');
        expect(indexSource).toContain("chevron.className = 'inline-drawer-icon fa-solid fa-circle-chevron-down rt-central-connection-chevron'");

        const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
        expect(style).toContain('.rpg-tracker-settings .rt-central-connection-header');
        expect(style).toContain('font-size: 0.88em !important;');
        expect(style).toContain('.rt-central-connection-chevron');
        expect(style).toContain('transform: rotate(-90deg) !important;');
        expect(style).toContain('.rt-central-connection-drawer.open');
        expect(style).toContain('transform: rotate(0deg) !important;');
    });

    it('centers the State Tracker utility drawer labels without moving their arrows', () => {
        expect(settingsMarkup).toContain('<b>Configuración de Conexión</b>');
        expect(settingsMarkup).toContain('<b>Sustitución de API en Combate</b>');
        expect(settingsMarkup).toContain('<b>Prompt Principal del Sistema</b>');
        const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
        expect(style).toContain('.rpg-tracker-settings .rt-centered-drawer-header');
        expect(style).toContain('justify-content: center;');
        expect(style).toContain('right: 14px;');
    });

    it('keeps portrait-specific drawers and the emergency purge within Portraits', () => {
        const portraitsStart = settingsMarkup.indexOf('<b>Retratos</b>');
        const developerStart = settingsMarkup.indexOf('<b>Depuración y Restablecimiento de Fábrica</b>');
        const portraitsMarkup = settingsMarkup.slice(portraitsStart, developerStart);

        expect(portraitsMarkup).toContain('<b>Conexión LLM para Retratos</b>');
        expect(portraitsMarkup).toContain('<b>Plantillas de Prompt para Retratos</b>');
        expect(portraitsMarkup).toContain('id="rpg_tracker_purge_all_portraits"');
    });

    it('mirrors every Adventure Companion option and gives it a dedicated connection', () => {
        const companionStart = settingsMarkup.indexOf('<b>Acompañante de Aventura</b>');
        const companionMarkup = settingsMarkup.slice(companionStart);

        expect(companionMarkup).toContain('Abre el Acompañante de Aventura con el botón <b>CHAT</b> en la parte superior del Rastreador de Estado. Puede ayudarte con tu aventura cuando el <b>MODO TUTORIAL</b> está activado');
        expect(companionMarkup).toContain('De lo contrario, está ahí si simplemente te apetece charlar sobre tu aventura o hacer una lluvia de ideas, etc.');
        expect(companionMarkup).toContain('También puedes pedirle que haga cambios en el Rastreador de Estado o en el Agente de Lorebook, y puede realizar acciones por ti si se lo pides');

        [
            'rpg_adventure_companion_tutorial_mode',
            'rpg_adventure_companion_lookback',
            'rpg_adventure_companion_lookback_all',
            'rpg_adventure_companion_inject_lore',
            'rpg_adventure_companion_inject_memo',
            'rpg_adventure_companion_inject_map',
            'rpg_adventure_companion_connection_source',
            'rpg_adventure_companion_connection_profile',
            'rpg_adventure_companion_ollama_url',
            'rpg_adventure_companion_ollama_model',
            'rpg_adventure_companion_openai_url',
            'rpg_adventure_companion_openai_key',
            'rpg_adventure_companion_openai_model',
            'rpg_adventure_companion_openai_model_manual',
            'rpg_adventure_companion_completion_preset',
        ].forEach((id) => expect(companionMarkup).toContain(`id="${id}"`));
    });

    it('places Persistent Maps directly below Lorebook Agent', () => {
        const agentStart = settingsMarkup.indexOf('<b>Agente de Lorebook');
        const mapStart = settingsMarkup.indexOf('<b>Mapas Persistentes</b>');
        const worldStart = settingsMarkup.indexOf('<b>Progresión del Mundo</b>');

        expect(agentStart).toBeGreaterThanOrEqual(0);
        expect(mapStart).toBeGreaterThan(agentStart);
        expect(worldStart).toBeGreaterThan(mapStart);
        expect(settingsMarkup.indexOf('<b>Arquitecto de Mapas</b>')).toBeGreaterThan(mapStart);
        expect(settingsMarkup.indexOf('<b>Architect Prompt</b>')).toBeLessThan(0);
    });

    it('places Adventure Companion directly below World Progression', () => {
        const worldStart = settingsMarkup.indexOf('<b>Progresión del Mundo</b>');
        const companionStart = settingsMarkup.indexOf('<b>Acompañante de Aventura</b>');

        expect(worldStart).toBeGreaterThanOrEqual(0);
        expect(companionStart).toBeGreaterThan(worldStart);
        expect(settingsMarkup.indexOf('<b>Agente de Lorebook</b>')).toBeLessThan(worldStart);
    });

    it('places the global custom-bar animation toggle beside the Rendering Tags Library', () => {
        const library = settingsMarkup.indexOf('id="rt_btn_tag_library"');
        const animation = settingsMarkup.indexOf('id="rpg_tracker_animate_all_custom_bars"');
        const moduleExport = settingsMarkup.indexOf('id="rpg_tracker_export_all_modules"');

        expect(library).toBeGreaterThanOrEqual(0);
        expect(animation).toBeLessThan(library);
        expect(animation).toBeLessThan(moduleExport);
        expect(settingsMarkup.slice(animation, library)).toContain('Animar todos los cambios de barras personalizadas en el Rastreador de Estado');
        expect(settingsMarkup).not.toContain('âˆ’value');
    });
});
