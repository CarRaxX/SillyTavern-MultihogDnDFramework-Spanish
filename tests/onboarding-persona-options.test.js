import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { testExtensionSettings } from './setup.js';

vi.mock('../portrait-storage.js', () => ({
    lookupCustomPortraitSrc: () => '',
}));

import { renderMemoAsCards } from '../renderer.js';

describe('onboarding Player Card and ST persona options', () => {
    beforeEach(() => {
        for (const key of Object.keys(testExtensionSettings)) delete testExtensionSettings[key];
    });

    it('renders separate controls in Other Ways to Begin and Character Creator', () => {
        const html = renderMemoAsCards('', null, {});

        expect(html).toContain('id="rt-onboarding-player-card-cb"');
        expect(html).toContain('id="rt-onboarding-st-persona-cb" checked');
        expect(html).toContain('id="rt-cr-player-card-cb"');
        expect(html).toContain('id="rt-cr-st-persona-cb" checked');
        expect(html.match(/(?:Create Player Card in Lorebook Agent \(Recommended\)|Crear Ficha de Jugador en Agente de Lorebook \(Recomendado\))/g)).toHaveLength(2);
        expect(html.match(/(?:Create ST Persona \(Recommended\)|Crear Persona de ST \(Recomendado\))/g)).toHaveLength(2);
        expect(html).toMatch(/(?:same player name|nombre del personaje)/);
        expect(html).not.toMatch(/(?:Create Persona \(Recommended\)|Crear Persona \(Recomendado\))/);
    });

    it('requires a rolled name for the Other Ways Custom path', () => {
        const html = renderMemoAsCards('', null, {});

        expect(html).toMatch(/id="rt-onboarding-rolled-name"\s+placeholder="(?:Roll or enter a name|Genera o escribe un nombre)"/);
        expect(html).toContain('id="rt-onboarding-roll-name"');
        expect(html).toMatch(/data-archetype="custom" data-name-required="true" disabled/);
        expect(html).toMatch(/data-archetype="persona">/);
        expect(html).toMatch(/data-archetype="pc_import">/);
    });

    it('preserves the active Persona when deriving a character from it', () => {
        const cardEventsSource = readFileSync(new URL('../src/ui/panel/card-events.js', import.meta.url), 'utf8');
        const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

        expect(cardEventsSource).toContain("const requiresRolledName = archetype !== 'persona';");
        expect(cardEventsSource).toContain('preferredName: personaName');
        expect(indexSource).toContain(
            'preserveExistingDescription: !!options.preserveActivePersona',
        );
        expect(indexSource).toMatch(
            /const charName = preferredName \|\| extractCharNameFromMemo\(s\.currentMemo\) \|\| '(?:My Character|Mi Personaje)';/,
        );
    });

    it('includes numbered onboarding help with embedded video and CHAT links', () => {
        const html = renderMemoAsCards('', null, {});

        expect(html).toMatch(/(?:Need help\? Try these:|¿Necesitas ayuda\? Prueba esto:)/);
        expect(html).toMatch(/(?:this basic video walkthrough|este video tutorial básico)/);
        expect(html).toContain('href="https://www.youtube.com/watch?v=82Lt9pRYFS0"');
        expect(html).toContain('id="rt-onboarding-open-chat"');
        expect(html).toMatch(/(?:Adventure Companion|Acompañante de Aventura)/);
        expect(html).not.toContain('SillyTavern Discord');
        expect(html).not.toContain('Hell, head there anyway!');
        expect(html).not.toMatch(/(?:Need help\? Open|¿Necesitas ayuda\? Abre)/);
    });

    it('keeps How It Works as system explainers, separate from Need Help', () => {
        const html = renderMemoAsCards('', null, {});
        const headingIndex = html.search(/<span>(?:How It Works|Cómo Funciona)<\/span>/);
        const noteIndex = html.indexOf('class="rt-onboarding-prompt-backup-note"');
        const howIndex = html.indexOf('class="rt-onboarding-how-it-works"');
        const autoIndex = html.search(/(?:Auto-Tracking:|Seguimiento Automático:)/);
        const mapEvoIndex = html.search(/(?:Makes maps\/locations dynamic|Hace que los mapas y ubicaciones sean dinámicos)/);
        const helpHeadingIndex = html.search(/<span>(?:Need Help|¿Necesitas Ayuda\?)<\/span>/);
        const helpIndex = html.indexOf('class="rt-onboarding-chat-tip"');

        expect(headingIndex).toBeGreaterThanOrEqual(0);
        expect(noteIndex).toBeGreaterThan(headingIndex);
        expect(howIndex).toBeGreaterThan(noteIndex);
        expect(autoIndex).toBeGreaterThan(howIndex);
        expect(mapEvoIndex).toBeGreaterThan(autoIndex);
        expect(helpHeadingIndex).toBeGreaterThan(mapEvoIndex);
        expect(helpIndex).toBeGreaterThan(helpHeadingIndex);
        expect(html).toMatch(/(?:Persistent Maps section of the settings|sección de Mapas Persistentes de los ajustes)/);
        expect(html).toMatch(/(?:Multihog D&amp;D Framework auto-applies its own system prompt\.|Multihog D&amp;D Framework aplica automáticamente su propio prompt de sistema\.)/);
        expect(html).toMatch(/(?:General &amp; Visuals -> Core -> Restore backup to Main\.|General y Visuales -> Núcleo -> Restaurar copia de seguridad en Principal\.)/);
        expect(html).toMatch(/(?:A summarizer is <b>mandatory<\/b> for this extension to compress the context\.|Un resumidor es <b>obligatorio<\/b> para comprimir el contexto con esta extensión\.)/);
        expect(html).toContain('href="https://github.com/Lodactio/Extension-Summaryception"');
        expect(html).toMatch(/(?:hides verbatim messages|oculta\/fantasma mensajes|oculte mensajes literales)/);
    });

    it('lists Chat Completion API before Function Calling in the Setup Guide', () => {
        const html = renderMemoAsCards('', null, {});
        const setupIndex = html.search(/<span>(?:Setup Guide|Guía de Configuración)<\/span>/);
        const apiIndex = html.search(/(?:API must be Chat Completion|La API debe ser Chat Completion)/);
        const functionIndex = html.search(/(?:Function Calling|Llamadas a funciones \(Function Calling\))/);
        const narratorCardIndex = html.search(/(?:Leave the card content empty|Deja el contenido de la ficha vacío)/);
        const instantIndex = html.search(/(?:Instant Action to get started quicker|Acción Instantánea para empezar más rápido)/);

        expect(setupIndex).toBeGreaterThanOrEqual(0);
        expect(apiIndex).toBeGreaterThan(setupIndex);
        expect(functionIndex).toBeGreaterThan(apiIndex);
        expect(narratorCardIndex).toBeGreaterThan(functionIndex);
        expect(instantIndex).toBeGreaterThan(narratorCardIndex);
        expect(html).toMatch(/(?:Text command|Comando de texto)/);
        expect(html).toContain('CreateAreaMap');
        expect(html).toMatch(/(?:connection settings|ajustes de conexión)/);
        expect(html).not.toMatch(/(?:Leave the card fields empty|Deja los campos de la ficha vacíos)/);
    });

    it('offers a named narrator card creator in the Setup Guide', () => {
        const html = renderMemoAsCards('', null, {});

        expect(html).toContain('id="rt-onboarding-create-gm"');
        expect(html).toContain('id="rt-onboarding-gm-name"');
        expect(html).toContain('value="Game Master"');
        expect(html).toMatch(/(?:Create narrator card|Crear ficha de narrador)/);
        expect(html).toMatch(/(?:attributed to a narrator, not a single character|se atribuyen a un narrador, no a un único personaje)/);
        expect(html).toMatch(/(?:Leave the card content empty|Deja el contenido de la ficha vacío)/);
    });

    it('links the startup welcome note to the GitHub releases page', () => {
        const html = renderMemoAsCards('', null, {});

        expect(html).toMatch(/(?:Welcome to Multihog D&D Framework!|¡Bienvenido a Multihog D&D Framework!)/);
        expect(html).toContain('href="https://github.com/MultihogAurelius/SillyTavern-MultihogDnDFramework/releases"');
        expect(html).toMatch(/(?:Releases section of the GitHub page|sección de Releases en GitHub)/);
    });

    it('does not show a Discord link on the startup menu', () => {
        const html = renderMemoAsCards('', null, {});

        expect(html).not.toContain('class="rt-discord-btn"');
        expect(html).not.toContain('href="https://discord.gg/bgjAeWEc2p"');
        expect(html).toContain('class="rt-bmc-btn"');
    });
});
