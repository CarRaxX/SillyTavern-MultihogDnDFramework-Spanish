import { getSettings } from '../../../state-manager.js';
import { runtimeState } from '../../app/runtime-state.js';
import { isEffectiveSectionEnabled } from '../../state/section-enabled.js';
import { canResizePanels, makeDraggable, makeResizableBR, resolveViewportClampedGeometry } from '../../../ui-geometry.js';
import { buildDungeonMapGraph, renderDungeonMapGraphSvg } from '../../../dungeon-map-graph.js';

export const DUNGEON_MAP_DETACHED_KEY = 'rpg_tracker_dungeon_map_detached';
export const DUNGEON_MAP_GEOMETRY_KEY = 'rpg_tracker_geometry_dungeon_map';
const PANEL_ID = 'rt-dungeon-map-detached';

export function isDungeonMapDetached() {
    try {
        return localStorage.getItem(DUNGEON_MAP_DETACHED_KEY) === 'true';
    } catch {
        return false;
    }
}

function setDungeonMapDetached(value) {
    try {
        localStorage.setItem(DUNGEON_MAP_DETACHED_KEY, value ? 'true' : 'false');
    } catch (_) { /* ignore */ }
}

function spawnGeometry() {
    const main = document.getElementById('rpg-tracker-agent') || document.getElementById('rpg-tracker-panel');
    const rect = main?.getBoundingClientRect();
    let left = 80;
    let top = 80;
    if (rect) {
        left = rect.right + 12;
        top = rect.top;
        if (left + 420 > window.innerWidth) left = Math.max(12, rect.left - 432);
    }
    return resolveViewportClampedGeometry({
        left, top, width: 440, height: 380,
    }, { defaultWidth: 440, defaultHeight: 380, minWidth: 280, minHeight: 220 });
}

function renderDetachedBody(scene) {
    const map = scene?.dungeonMap;
    if (!map?.document) {
        return '<div class="rt-dungeon-graph-empty">No mapped site at the current location.</div>';
    }
    const graph = buildDungeonMapGraph(map.document, {
        playerFacing: true,
        currentLocation: scene.rawLocationText || scene.resolvedPath || '',
    });
    if (!graph.nodes.length) {
        return '<div class="rt-dungeon-graph-empty">No revealed rooms yet.</div>';
    }
    return `<div class="rt-dungeon-graph-scroll rt-dungeon-graph-scroll-expanded">${renderDungeonMapGraphSvg(graph, {
        compact: false,
        siteRoot: map.siteRoot || graph.site,
    })}</div>`;
}

function bindAreaClicks(root, onAreaClick) {
    if (!root || typeof onAreaClick !== 'function') return;
    root.querySelectorAll('.rt-dungeon-graph-node-revealed[data-area-path]').forEach(node => {
        const activate = (event) => {
            event.preventDefault();
            event.stopPropagation();
            const path = node.getAttribute('data-area-path') || '';
            if (path) void onAreaClick(path);
        };
        node.addEventListener('click', activate);
        node.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') activate(event);
        });
    });
}

/**
 * Create or reuse the floating site-map window.
 * @param {{ onAreaClick?: (path: string) => Promise<void>|void, onReattach?: () => void }} [handlers]
 */
export function ensureDetachedDungeonMapPanel(handlers = {}) {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    const settings = getSettings();
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = `rpg-tracker-panel rpg-tracker-detached-panel rt-detached-panel rt-dungeon-map-detached-panel ${settings.trackerTheme || 'rt-theme-native'}`;
    panel.innerHTML = `
        <div class="rpg-tracker-header rt-detached-header" id="rt-dungeon-map-detached-header">
            <div class="rpg-tracker-header-left">
                <span><i class="fa-solid fa-map-location-dot"></i> Site map</span>
            </div>
            <div class="rpg-tracker-header-right">
                <button type="button" class="rpg-tracker-icon-btn rt-reattach-btn" title="Re-attach">✕</button>
            </div>
        </div>
        <div class="rpg-tracker-content rpg-tracker-detached-body" id="rt-dungeon-map-detached-body"></div>
        <div class="rt-resizer-br rt-detached-resizer-br" title="Resize"></div>
    `;
    document.body.appendChild(panel);

    const header = panel.querySelector('#rt-dungeon-map-detached-header');
    if (header instanceof HTMLElement) {
        makeDraggable(panel, header, DUNGEON_MAP_GEOMETRY_KEY);
    }
    const resizer = panel.querySelector('.rt-detached-resizer-br');
    if (resizer instanceof HTMLElement && canResizePanels()) {
        makeResizableBR(panel, resizer, DUNGEON_MAP_GEOMETRY_KEY);
    }

    try {
        const saved = JSON.parse(localStorage.getItem(DUNGEON_MAP_GEOMETRY_KEY) || 'null');
        const geo = saved
            ? resolveViewportClampedGeometry(saved, { defaultWidth: 440, defaultHeight: 380, minWidth: 280, minHeight: 220 })
            : spawnGeometry();
        panel.style.left = geo.left + 'px';
        panel.style.top = geo.top + 'px';
        panel.style.width = geo.width + 'px';
        panel.style.height = geo.height + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    } catch {
        const geo = spawnGeometry();
        panel.style.left = geo.left + 'px';
        panel.style.top = geo.top + 'px';
        panel.style.width = geo.width + 'px';
        panel.style.height = geo.height + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    }

    panel.querySelector('.rt-reattach-btn')?.addEventListener('click', () => {
        reattachDungeonMapPanel();
        if (typeof handlers.onReattach === 'function') handlers.onReattach();
    });

    panel._dungeonMapHandlers = handlers;
    return panel;
}

export function updateDetachedDungeonMapPanel(scene, handlers = {}) {
    if (!isEffectiveSectionEnabled('dungeon_reality_and_hidden_mapping', getSettings())) {
        reattachDungeonMapPanel();
        return;
    }
    if (!isDungeonMapDetached()) {
        document.getElementById(PANEL_ID)?.remove();
        return;
    }
    const panel = ensureDetachedDungeonMapPanel(handlers);
    const merged = { ...(panel._dungeonMapHandlers || {}), ...handlers };
    panel._dungeonMapHandlers = merged;
    const site = scene?.dungeonMap?.siteRoot || scene?.dungeonMap?.document?.site || 'Site map';
    const title = panel.querySelector('.rpg-tracker-header-left span');
    if (title) {
        title.replaceChildren();
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-map-location-dot';
        title.append(icon, ` ${site}`);
    }
    const body = panel.querySelector('#rt-dungeon-map-detached-body');
    if (body) {
        body.innerHTML = renderDetachedBody(scene);
        bindAreaClicks(body, merged.onAreaClick);
    }
    panel.style.display = 'flex';
}

export function detachDungeonMapPanel(scene, handlers = {}) {
    if (!isEffectiveSectionEnabled('dungeon_reality_and_hidden_mapping', getSettings())) return;
    setDungeonMapDetached(true);
    runtimeState.hasActiveDungeonMap = !!scene?.dungeonMap;
    updateDetachedDungeonMapPanel(scene, handlers);
}

export function reattachDungeonMapPanel() {
    setDungeonMapDetached(false);
    document.getElementById(PANEL_ID)?.remove();
}

/** Bind pop-out / reattach / area clicks inside a Visuals/Map embed. */
export function bindDungeonMapEmbedEvents(root, {
    scene,
    onAreaClick,
    onDetach,
    onReattach,
} = {}) {
    if (!root) return;
    bindAreaClicks(root, onAreaClick);
    root.querySelector('.rt-dungeon-map-detach')?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        detachDungeonMapPanel(scene, { onAreaClick, onReattach });
        if (typeof onDetach === 'function') onDetach();
    });
    root.querySelector('.rt-dungeon-map-reattach')?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        reattachDungeonMapPanel();
        if (typeof onReattach === 'function') onReattach();
    });
}
