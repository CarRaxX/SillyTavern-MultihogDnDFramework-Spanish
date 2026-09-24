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
        const findHeaderPos = (pattern) => {
            const m = settingsMarkup.match(pattern);
            if (!m) throw new Error(`Header not found for pattern ${pattern}`);
            return m[0];
        };
        const primaryHeaders = [
            findHeaderPos(/<b>(?:General & Visuals|Ajustes General(?:es)? y Visuales)<\/b>/),
            findHeaderPos(/<b>(?:Connections &amp; Models|Conexiones y Modelos)<\/b>/),
            findHeaderPos(/<b>(?:Game Systems & Customization|Sistemas de Juego y Libros de Reglas)<\/b>/),
            findHeaderPos(/<b>(?:State Tracker & Modules|Rastreador de Estado y Configuración de Ficha)<\/b>/),
            findHeaderPos(/<b>(?:Lorebook Agent|Agente de Lorebook(?: y Asistente IA)?)<\/b>/),
            findHeaderPos(/<b>(?:Persistent Maps|Mapas Persistentes)<\/b>/),
            findHeaderPos(/<b>(?:World Progression|Progresión del Mundo)<\/b>/),
            findHeaderPos(/<b>(?:Adventure Companion|Acompañante de Aventura)<\/b>/),
        ];
        const expectedDepth = divDepthAt(primaryHeaders[0]);

        expect(primaryHeaders.map(divDepthAt)).toEqual(primaryHeaders.map(() => expectedDepth));
        expect((settingsMarkup.match(/<div(?:\s|>)/g) || []).length)
            .toBe((settingsMarkup.match(/<\/div>/g) || []).length);
    });

    it('organizes settings into Core & Branching, UI Appearance, and Portraits and Location Images drawers', () => {
        expect(settingsMarkup).toMatch(/(?:<b>Core &amp; Branching<\/b>|<b>Núcleo y Ramificación \(Branching\)<\/b>)/);
        expect(settingsMarkup).toMatch(/(?:<b>UI Appearance<\/b>|<b>Apariencia de la Interfaz<\/b>)/);
        expect(settingsMarkup).toMatch(/(?:<b>Portraits and Location Images<\/b>|<b>Retratos e Imágenes de Ubicación<\/b>)/);
    });

    it('can reopen the API setup checklist from Core & Branching Help', () => {
        const generalStart = settingsMarkup.search(/<b>(?:General & Visuals|Ajustes General(?:es)? y Visuales)<\/b>/);
        const connectionsStart = settingsMarkup.search(/<b>(?:Connections &amp; Models|Conexiones y Modelos)<\/b>/);
        const generalMarkup = settingsMarkup.slice(generalStart, connectionsStart);
        expect(generalMarkup).toContain('id="rpg_tracker_api_setup_checklist"');
        expect(generalMarkup).toMatch(/(?:Anti-Museum Tour|Tour Anti-Museo)/);
        expect(generalMarkup).toContain('id="rpg_tracker_game_master_name"');
        expect(generalMarkup).toContain('id="rpg_tracker_create_game_master_card"');
        const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
        expect(indexSource).toContain('showApiSetupGate');
        expect(indexSource).toContain("$('#rpg_tracker_api_setup_checklist')");
        expect(indexSource).toContain('createOrSelectGameMasterCard');
        expect(indexSource).toContain("$('#rpg_tracker_create_game_master_card')");
    });

    it('links General & Visuals to the canonical Map Themes controls', () => {
        const generalStart = settingsMarkup.search(/<b>(?:General & Visuals|Ajustes General(?:es)? y Visuales)<\/b>/);
        const connectionsStart = settingsMarkup.search(/<b>(?:Connections &amp; Models|Conexiones y Modelos)<\/b>/);
        const generalMarkup = settingsMarkup.slice(generalStart, connectionsStart);
        expect(generalMarkup).toMatch(/(?:<b>Map Appearance<\/b>|<b>Apariencia de Mapas<\/b>)/);
        expect(generalMarkup).toContain('id="rpg_open_map_themes"');
        expect(generalMarkup).toMatch(/(?:managed under Persistent Maps|se gestionan en Mapas Persistentes)/);
    });

    it('places Connections & Models immediately after General & Visuals', () => {
        const general = settingsMarkup.search(/<b>(?:General & Visuals|Ajustes General(?:es)? y Visuales)<\/b>/);
        const connections = settingsMarkup.search(/<b>(?:Connections &amp; Models|Conexiones y Modelos)<\/b>/);
        const gameSystems = settingsMarkup.search(/<b>(?:Game Systems & Customization|Sistemas de Juego y Libros de Reglas)<\/b>/);

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
            'rpg_connection_slot_map_evolution',
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
        expect(indexSource).toContain("control: '#rpg_map_evolution_connection_source'");
        expect(indexSource).toContain("control: '#rpg_world_connection_source'");
        expect(indexSource).toContain("control: '#rpg_portrait_connection_source'");
        expect(indexSource).toMatch(/(?:I recommend a cheap mid-tier model such as GPT-5.6 Luna|Recomiendo un modelo económico de nivel medio)/);
        expect(indexSource).toMatch(/(?:Same models work fine here as with the State Tracker\.|Los mismos modelos funcionan bien aquí)/);
        expect(indexSource).toMatch(/(?:I recommend using a somewhat better model here such as Sonnet 5|Recomiendo usar un modelo algo mejor aquí, como Sonnet 5)/);
        expect(indexSource).toMatch(/(?:A lightweight model should do fine\.|Un modelo ligero debería funcionar bien\.)/);
        expect(indexSource).not.toContain('Prefer a fast model above all');
        expect(indexSource).toContain("chevron.className = 'inline-drawer-icon fa-solid fa-circle-chevron-down rt-central-connection-chevron'");
        expect(settingsMarkup).toContain('id="rpg_connection_apply_all_box"');
        expect(settingsMarkup).toMatch(/(?:Apply Connection Setup to All|Aplicar Configuración de Conexión a Todos)/);

        const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
        expect(style).toContain('.rpg-tracker-settings .rt-central-connection-header');
        expect(style).toContain('font-size: 0.88em !important;');
        expect(style).toContain('.rt-central-connection-chevron');
        expect(style).toContain('transform: rotate(-90deg) !important;');
        expect(style).toContain('.rt-central-connection-drawer.open');
        expect(style).toContain('transform: rotate(0deg) !important;');
    });

    it('centers the State Tracker utility drawer labels without moving their arrows', () => {
        expect(settingsMarkup).toMatch(/(?:<b>Connection Settings<\/b>|<b>Configuración de Conexión<\/b>)/);
        expect(settingsMarkup).toMatch(/(?:<b>Combat API Override<\/b>|<b>Sustitución de API en Combate<\/b>)/);
        expect(settingsMarkup).toMatch(/(?:<b>Core Prompt<\/b>|<b>Prompt Principal del Sistema<\/b>)/);
        const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
        expect(style).toContain('.rpg-tracker-settings .rt-centered-drawer-header');
        expect(style).toContain('justify-content: center;');
        expect(style).toContain('right: 14px;');
    });

    it('keeps portrait-specific drawers and the emergency purge within Portraits and Location Images', () => {
        const portraitsStart = settingsMarkup.search(/<b>(?:Portraits and Location Images|Retratos e Imágenes de Ubicación)<\/b>/);
        const developerStart = settingsMarkup.search(/(?:Developer &amp; Reset|Desarrollador y Restablecimiento)/);
        const portraitsMarkup = settingsMarkup.slice(portraitsStart, developerStart);

        expect(portraitsMarkup).toMatch(/(?:<b>Portraits LLM Connection<\/b>|<b>Conexión LLM para Retratos<\/b>)/);
        expect(portraitsMarkup).toMatch(/(?:<b>Portrait and Location Image Styles<\/b>|<b>Estilos de Retratos e Imágenes de Ubicación<\/b>)/);
        expect(portraitsMarkup).toMatch(/(?:<b>Portrait Prompt Templates<\/b>|<b>Plantillas de Prompt para Retratos<\/b>)/);
        expect(portraitsMarkup).toContain('id="rpg_portrait_prompt_presets_container"');
        expect(portraitsMarkup).toContain('id="rpg_portrait_prompt_preset_save_btn"');
        expect(portraitsMarkup).toContain('id="rpg_tracker_purge_all_portraits"');
        expect(portraitsMarkup).toContain('id="rpg_tracker_portrait_use_story_lookback"');
        expect(portraitsMarkup).toContain('id="rpg_tracker_portrait_story_lookback"');
        expect(portraitsMarkup.search(/(?:Portrait and Location Image Styles|Estilos de Retratos e Imágenes de Ubicación)/))
            .toBeLessThan(portraitsMarkup.search(/<b>(?:Portrait Prompt Templates|Plantillas de Prompt para Retratos)<\/b>/));
        expect(portraitsMarkup).not.toContain('<b>Portrait Prompt Presets</b>');
        expect(portraitsMarkup).toMatch(/(?:load it into the <b>Portrait Prompt Templates<\/b> below|cárgalo en las <b>Plantillas de Prompt para Retratos<\/b> a continuación)/);
        expect(portraitsMarkup).toMatch(/(?:Save Setup to Library|Guardar Configuración en Biblioteca)/);
    });

    it('mirrors every Adventure Companion option and gives it a dedicated connection', () => {
        const companionStart = settingsMarkup.search(/<b>(?:Adventure Companion|Acompañante de Aventura)<\/b>/);
        const companionMarkup = settingsMarkup.slice(companionStart);

        expect(companionMarkup).toMatch(/(?:Open Adventure Companion with the <b>CHAT<\/b> button|Abre el Acompañante de Aventura con el botón <b>CHAT<\/b>)/);
        expect(companionMarkup).toMatch(/(?:Otherwise, it's there if you just feel like chatting|De lo contrario, está ahí si simplemente te apetece charlar)/);
        expect(companionMarkup).toMatch(/(?:You can also ask it to make changes in the State Tracker|También puedes pedirle que haga cambios en el Rastreador de Estado)/);

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
        const agentStart = settingsMarkup.search(/<b>(?:Lorebook Agent|Agente de Lorebook(?: y Asistente IA)?)<\/b>/);
        const mapStart = settingsMarkup.search(/<b>(?:Persistent Maps|Mapas Persistentes)<\/b>/);
        const worldStart = settingsMarkup.search(/<b>(?:World Progression|Progresión del Mundo)<\/b>/);

        expect(agentStart).toBeGreaterThanOrEqual(0);
        expect(mapStart).toBeGreaterThan(agentStart);
        expect(worldStart).toBeGreaterThan(mapStart);
        expect(settingsMarkup.search(/<b>(?:Map Architect|Arquitecto de Mapas)<\/b>/)).toBeGreaterThan(mapStart);
        expect(settingsMarkup.indexOf('<b>Architect Prompt</b>')).toBeLessThan(0);
    });

    it('places editable map themes at the bottom of Persistent Maps', () => {
        const mapStart = settingsMarkup.search(/<b>(?:Persistent Maps|Mapas Persistentes)<\/b>/);
        const evolutionMatch = settingsMarkup.match(/<b>(?:Map Evolution|Evolución de Mapas)<\/b>/);
        const evolutionStart = settingsMarkup.indexOf(evolutionMatch ? evolutionMatch[0] : '', mapStart);
        const themesMatch = settingsMarkup.match(/<b>(?:Map Themes|Temas de Mapas)<\/b>/);
        const themesStart = settingsMarkup.indexOf(themesMatch ? themesMatch[0] : '', mapStart);
        const worldStart = settingsMarkup.search(/<b>(?:World Progression|Progresión del Mundo)<\/b>/);
        const mapMarkup = settingsMarkup.slice(mapStart, worldStart);

        expect(themesStart).toBeGreaterThan(evolutionStart);
        expect(themesStart).toBeLessThan(worldStart);
        expect(mapMarkup).toContain('id="rpg_map_theme_preset"');
        expect(mapMarkup).toContain('id="rpg_map_theme_load"');
        expect(mapMarkup).toContain('id="rpg_map_theme_save"');
        expect(mapMarkup).toContain('id="rpg_map_theme_delete"');
        expect(mapMarkup).toContain('id="rpg_map_theme_colors"');
        expect(mapMarkup).toContain('id="rpg_map_theme_bg_upload"');
        expect(mapMarkup).toContain('id="rpg_map_theme_bg_clear"');
        expect(mapMarkup).toContain('id="rpg_map_theme_bg_url"');
        expect(mapMarkup).toContain('id="rpg_map_theme_bg_overlay"');
    });

    it('places Adventure Companion directly below World Progression', () => {
        const worldStart = settingsMarkup.search(/<b>(?:World Progression|Progresión del Mundo)<\/b>/);
        const companionStart = settingsMarkup.search(/<b>(?:Adventure Companion|Acompañante de Aventura)<\/b>/);

        expect(worldStart).toBeGreaterThanOrEqual(0);
        expect(companionStart).toBeGreaterThan(worldStart);
        expect(settingsMarkup.search(/<b>(?:Lorebook Agent|Agente de Lorebook(?: y Asistente IA)?)<\/b>/)).toBeLessThan(worldStart);
    });

    it('places the global custom-bar animation toggle beside the Rendering Tags Library', () => {
        const library = settingsMarkup.indexOf('id="rt_btn_tag_library"');
        const animation = settingsMarkup.indexOf('id="rpg_tracker_animate_all_custom_bars"');
        const moduleExport = settingsMarkup.indexOf('id="rpg_tracker_export_all_modules"');

        expect(library).toBeGreaterThanOrEqual(0);
        expect(animation).toBeLessThan(library);
        expect(animation).toBeLessThan(moduleExport);
        expect(settingsMarkup.slice(animation, library)).toMatch(/(?:Animate all custom bar changes in State Tracker|Animar todos los cambios de barras personalizadas)/);
        expect(settingsMarkup).not.toContain('âˆ’value');
    });
});
