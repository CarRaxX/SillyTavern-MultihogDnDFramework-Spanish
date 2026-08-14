import { getSettings } from '../../../state-manager.js';
import { runtimeState } from '../../app/runtime-state.js';
import { isEffectiveSectionEnabled } from '../../state/section-enabled.js';
import { canResizePanels, makeDraggable, makeResizableBR, resolveViewportClampedGeometry } from '../../../ui-geometry.js';
import { buildDungeonMapGraph, renderDungeonMapGraphSvg, renderDungeonMapReadableHtml } from '../../../dungeon-map-graph.js';

export const DUNGEON_MAP_DETACHED_KEY = 'rpg_tracker_dungeon_map_detached';
export const DUNGEON_MAP_GEOMETRY_KEY = 'rpg_tracker_geometry_dungeon_map';
const PANEL_ID = 'rt-dungeon-map-detached';
const PAN_THRESHOLD_PX = 5;

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
            const scroll = node.closest('.rt-dungeon-graph-scroll');
            if (scroll?.dataset.didPan === '1') {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
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

/** Pointer-drag pans the overflow container instead of selecting SVG text. */
export function bindDungeonMapPan(root) {
    if (!root) return;
    root.querySelectorAll('.rt-dungeon-graph-scroll').forEach(scroll => {
        if (!(scroll instanceof HTMLElement) || scroll.dataset.panBound === '1') return;
        scroll.dataset.panBound = '1';
        let dragging = false;
        let moved = false;
        let pointerId = null;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;

        const endDrag = (event) => {
            if (!dragging) return;
            if (pointerId !== null && event?.pointerId !== undefined && event.pointerId !== pointerId) return;
            dragging = false;
            scroll.classList.remove('rt-dungeon-graph-panning');
            if (pointerId !== null) {
                try { scroll.releasePointerCapture(pointerId); } catch (_) { /* ignore */ }
            }
            pointerId = null;
            if (moved) {
                scroll.dataset.didPan = '1';
                requestAnimationFrame(() => {
                    delete scroll.dataset.didPan;
                });
            }
        };

        scroll.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            if (event.target instanceof Element && event.target.closest('button')) return;
            dragging = true;
            moved = false;
            pointerId = event.pointerId;
            startX = event.clientX;
            startY = event.clientY;
            startLeft = scroll.scrollLeft;
            startTop = scroll.scrollTop;
            try { scroll.setPointerCapture(event.pointerId); } catch (_) { /* ignore */ }
        });
        scroll.addEventListener('pointermove', (event) => {
            if (!dragging || event.pointerId !== pointerId) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            if (!moved && (Math.abs(dx) > PAN_THRESHOLD_PX || Math.abs(dy) > PAN_THRESHOLD_PX)) {
                moved = true;
                scroll.classList.add('rt-dungeon-graph-panning');
            }
            if (!moved) return;
            scroll.scrollLeft = startLeft - dx;
            scroll.scrollTop = startTop - dy;
            event.preventDefault();
        });
        scroll.addEventListener('pointerup', endDrag);
        scroll.addEventListener('pointercancel', endDrag);
        scroll.addEventListener('lostpointercapture', endDrag);
        scroll.addEventListener('dragstart', (event) => event.preventDefault());
        scroll.addEventListener('selectstart', (event) => event.preventDefault());
    });
}

function escapePopupText(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Player-facing readable inspector. UNREVEALED rooms/assets stay hidden unless Reveal all is on.
 * @param {object} mapDocument
 * @param {{ siteLabel?: string, playerFacing?: boolean }} [options]
 */
export async function openDungeonMapReadablePopup(mapDocument, { siteLabel = '', playerFacing = true } = {}) {
    const ctx = globalThis.SillyTavern?.getContext?.();
    if (!ctx?.callGenericPopup || !mapDocument) return;
    const site = siteLabel || mapDocument.site || 'Site map';
    let revealAll = !playerFacing;
    const popupDom = document.createElement('div');
    popupDom.className = 'rt-dungeon-map-popup';
    popupDom.innerHTML = `
        <div class="rt-dungeon-map-title"><i class="fa-solid fa-map-location-dot"></i> ${escapePopupText(site)} <small class="rt-dungeon-alpha-tag">ALPHA</small></div>
        <div class="rt-dungeon-map-subtitle">${playerFacing
            ? 'Revealed rooms, routes, and known assets. Unrevealed areas stay hidden unless you turn on Reveal all.'
            : 'Private current state for this mapped site.'}</div>
        ${playerFacing ? '<label class="rt-dungeon-map-reveal-toggle"><input type="checkbox" class="rt-dungeon-map-reveal-all"> Reveal all</label>' : ''}
        <div class="rt-dungeon-map-readable"></div>`;
    const readable = popupDom.querySelector('.rt-dungeon-map-readable');
    const paint = () => {
        if (readable) readable.innerHTML = renderDungeonMapReadableHtml(mapDocument, { revealAll });
    };
    paint();
    popupDom.querySelector('.rt-dungeon-map-reveal-all')?.addEventListener('change', (event) => {
        revealAll = !!event.target.checked;
        paint();
    });
    await ctx.callGenericPopup(popupDom, ctx.POPUP_TYPE?.TEXT ?? 1, '', {
        okButton: 'Close', cancelButton: false, wide: true, large: true,
    });
}

function openSceneMapDetails(scene) {
    const mapDocument = scene?.dungeonMap?.document;
    if (!mapDocument) return;
    void openDungeonMapReadablePopup(mapDocument, {
        siteLabel: scene.dungeonMap?.siteRoot || mapDocument.site || '',
        playerFacing: true,
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
                <span><i class="fa-solid fa-map-location-dot"></i> Site map <small class="rt-dungeon-alpha-tag">ALPHA</small></span>
            </div>
            <div class="rpg-tracker-header-right">
                <button type="button" class="rt-dungeon-map-details rpg-tracker-icon-btn" title="Open site details" aria-label="Open site details"><i class="fa-solid fa-list"></i></button>
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

    panel.querySelector('.rt-dungeon-map-details')?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openSceneMapDetails(panel._dungeonMapScene);
    });
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
    panel._dungeonMapScene = scene;
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
        bindDungeonMapPan(body);
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
    bindDungeonMapPan(root);
    root.querySelectorAll('.rt-dungeon-map-details').forEach(button => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openSceneMapDetails(scene);
        });
    });
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
