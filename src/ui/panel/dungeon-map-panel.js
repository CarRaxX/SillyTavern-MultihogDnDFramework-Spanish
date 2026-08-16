import { getSettings, saveChatState } from '../../../state-manager.js';
import { runtimeState } from '../../app/runtime-state.js';
import { isLocationMappingEnabled } from '../../state/section-enabled.js';
import { canResizePanels, makeDraggable, makeResizableBR, resolveViewportClampedGeometry } from '../../../ui-geometry.js';
import { buildDungeonMapGraph, renderDungeonMapGraphSvg, renderDungeonMapReadableHtml } from '../../../dungeon-map-graph.js';
import { serializeDungeonMapDocument } from '../../../dungeon-reality.js';
import { describeEvolutionBacklog, formatEvolutionElapsedMinutes } from '../../../map-evolution-lib.js';

export const DUNGEON_MAP_DETACHED_KEY = 'rpg_tracker_dungeon_map_detached';
export const DUNGEON_MAP_GEOMETRY_KEY = 'rpg_tracker_geometry_dungeon_map';
const PANEL_ID = 'rt-dungeon-map-detached';
const PAN_THRESHOLD_PX = 5;

export function isDungeonMapRevealAll(settings = getSettings()) {
    return !!settings?.dungeonMapRevealAll;
}

function persistDungeonMapRevealAll(enabled) {
    const settings = getSettings();
    settings.dungeonMapRevealAll = !!enabled;
    const chatId = runtimeState.currentChatId;
    if (settings.chatLinkEnabled && chatId) saveChatState(chatId);
    else SillyTavern.getContext().saveSettingsDebounced();
}

function refreshDungeonMapViews() {
    if (typeof runtimeState.refreshImmersionView === 'function') {
        void runtimeState.refreshImmersionView();
    }
    const panel = document.getElementById(PANEL_ID);
    if (panel?._dungeonMapScene) {
        updateDetachedDungeonMapPanel(panel._dungeonMapScene, panel._dungeonMapHandlers || {});
    }
}

function currentLocationFromMemo() {
    const memo = String(getSettings().currentMemo || '');
    const match = memo.match(/\[LOCATION\]([\s\S]*?)\[\/LOCATION\]/i);
    if (!match) return '';
    return match[1].split('\n').map(line => line.trim()).find(Boolean) || '';
}

function dungeonMapGraphOptions(currentLocation = '') {
    return {
        playerFacing: !isDungeonMapRevealAll(),
        currentLocation: currentLocation || '',
    };
}

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
    const graph = buildDungeonMapGraph(map.document, dungeonMapGraphOptions(
        scene.rawLocationText || scene.resolvedPath || '',
    ));
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
    const scrolls = [];
    if (root instanceof HTMLElement && root.classList.contains('rt-dungeon-graph-scroll')) {
        scrolls.push(root);
    }
    if (typeof root.querySelectorAll === 'function') {
        root.querySelectorAll('.rt-dungeon-graph-scroll').forEach(scroll => scrolls.push(scroll));
    }
    for (const scroll of scrolls) {
        if (!(scroll instanceof HTMLElement) || scroll.dataset.panBound === '1') continue;
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
            event.stopPropagation();
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
    }
}

function escapePopupText(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/** Render the bounded per-site Evolution ledger without leaking material details while Reveal All is off. */
export function renderMapEvolutionHistoryHtml(backlogBySite, siteRoot, { revealAll = false } = {}) {
    const history = describeEvolutionBacklog(backlogBySite, siteRoot, -1, { lookback: 20 });
    if (!history.entries.length) {
        return '<div class="rt-dungeon-map-evolution-empty">No Map Evolution passes have been recorded for this site.</div>';
    }
    const rows = history.entries.map(entry => {
        const material = entry.kind === 'commit';
        const label = material ? 'Material commit' : 'Quiet checkpoint';
        const icon = material ? 'fa-code-commit' : 'fa-pause';
        const passes = !material && entry.passes > 1 ? ` · ${entry.passes} passes` : '';
        const elapsed = entry.elapsedMinutes >= 0
            ? formatEvolutionElapsedMinutes(entry.elapsedMinutes)
            : 'Unknown elapsed time';
        const details = material && !revealAll
            ? 'Material details hidden. Turn on Reveal All to inspect this commit.'
            : entry.summary;
        const operation = material && revealAll && entry.operationId
            ? `<code>${escapePopupText(entry.operationId)}</code>`
            : '';
        return `<div class="rt-dungeon-map-evolution-entry rt-dungeon-map-evolution-${entry.kind}">
            <div class="rt-dungeon-map-evolution-entry-head">
                <span><i class="fa-solid ${icon}"></i> ${label}${passes}</span>
                <time>${escapePopupText(entry.at)}</time>
            </div>
            <div class="rt-dungeon-map-evolution-elapsed">${escapePopupText(elapsed)}</div>
            <div class="rt-dungeon-map-evolution-summary">${escapePopupText(details)}</div>
            ${operation}
        </div>`;
    });
    return rows.join('');
}

/**
 * Shared mapped-site inspector used by both Visuals/Map and Lorebook Location entries.
 * UNREVEALED rooms/assets, raw JSON, and material Evolution details stay hidden
 * unless Reveal All is on. Reveal All is remembered per chat and also reveals
 * the Visuals/Map graph.
 * @param {object} mapDocument
 * @param {{ siteLabel?: string, currentLocation?: string }} [options]
 */
export async function openDungeonMapReadablePopup(mapDocument, { siteLabel = '', currentLocation = '' } = {}) {
    const ctx = globalThis.SillyTavern?.getContext?.();
    if (!ctx?.callGenericPopup || !mapDocument) return;
    const site = siteLabel || mapDocument.site || 'Site map';
    let currentDocument = mapDocument;
    let revealAll = isDungeonMapRevealAll();
    let currentView = 'readable';
    const locationLabel = currentLocation || currentLocationFromMemo();
    const popupDom = document.createElement('div');
    popupDom.className = 'rt-dungeon-map-popup';
    popupDom.innerHTML = `
        <div class="rt-dungeon-map-title"><i class="fa-solid fa-map-location-dot"></i> ${escapePopupText(site)} <small class="rt-dungeon-alpha-tag">ALPHA</small></div>
        <div class="rt-dungeon-map-subtitle">Revealed rooms, routes, and known assets. Unrevealed map facts and material Evolution details stay hidden unless you turn on Reveal All.</div>
        <div class="rt-dungeon-map-toolbar">
            <label class="rt-dungeon-map-reveal-toggle"><input type="checkbox" class="rt-dungeon-map-reveal-all"${revealAll ? ' checked' : ''}> Reveal All</label>
        </div>
        <div class="rt-dungeon-map-view-switch" role="tablist" aria-label="Map view">
            <button type="button" class="rt-dungeon-map-view-btn rt-dungeon-map-view-btn-active" data-map-view="readable" role="tab" aria-selected="true"><i class="fa-solid fa-list"></i> Map Entries</button>
            <button type="button" class="rt-dungeon-map-view-btn" data-map-view="raw" role="tab" aria-selected="false" ${revealAll ? '' : 'disabled '}title="${revealAll ? 'Inspect raw map JSON' : 'Turn on Reveal All to inspect raw JSON'}"><i class="fa-solid fa-code"></i> Raw JSON</button>
        </div>
        <div class="rt-dungeon-graph-scroll rt-dungeon-map-popup-graph" data-map-graph></div>
        <div class="rt-dungeon-map-readable" data-map-panel="readable"></div>
        <pre class="rt-dungeon-map-raw" data-map-panel="raw" hidden></pre>
        <section class="rt-dungeon-map-evolution-section">
            <div class="rt-dungeon-map-evolution-header">
                <div class="rt-dungeon-map-evolution-title"><i class="fa-solid fa-clock-rotate-left"></i> Map Evolution History</div>
                <button type="button" class="menu_button interactable rt-dungeon-map-evolve-now"><i class="fa-solid fa-wand-magic-sparkles"></i> Map Evolution: Run Now</button>
                <button type="button" class="menu_button interactable rt-dungeon-map-testing-ground"><i class="fa-solid fa-flask"></i> Testing Ground</button>
            </div>
            <div class="rt-dungeon-map-run-status" role="status" aria-live="polite"></div>
            <div class="rt-dungeon-map-evolution-privacy">Material summaries follow Reveal All; quiet checkpoints never reveal hidden map contents.</div>
            <div class="rt-dungeon-map-evolution-history"></div>
        </section>`;
    const readable = popupDom.querySelector('.rt-dungeon-map-readable');
    const raw = popupDom.querySelector('.rt-dungeon-map-raw');
    const rawButton = popupDom.querySelector('[data-map-view="raw"]');
    const graphHost = popupDom.querySelector('[data-map-graph]');
    const history = popupDom.querySelector('.rt-dungeon-map-evolution-history');
    const runButton = popupDom.querySelector('.rt-dungeon-map-evolve-now');
    const runStatus = popupDom.querySelector('.rt-dungeon-map-run-status');
    const setMapView = (view) => {
        currentView = view === 'raw' && revealAll ? 'raw' : 'readable';
        for (const button of popupDom.querySelectorAll('[data-map-view]')) {
            const active = button.dataset.mapView === currentView;
            button.classList.toggle('rt-dungeon-map-view-btn-active', active);
            button.setAttribute('aria-selected', String(active));
        }
        for (const panel of popupDom.querySelectorAll('[data-map-panel]')) {
            panel.hidden = panel.dataset.mapPanel !== currentView;
        }
    };
    const paint = () => {
        if (readable) readable.innerHTML = renderDungeonMapReadableHtml(currentDocument, { revealAll });
        if (raw) raw.textContent = serializeDungeonMapDocument(currentDocument);
        if (graphHost) {
            const graph = buildDungeonMapGraph(currentDocument, {
                playerFacing: !revealAll,
                currentLocation: locationLabel,
            });
            graphHost.innerHTML = renderDungeonMapGraphSvg(graph, { compact: false, siteRoot: site });
            bindDungeonMapPan(graphHost);
        }
        if (history) history.innerHTML = renderMapEvolutionHistoryHtml(
            getSettings().mapEvolutionBacklogBySite,
            site,
            { revealAll },
        );
        if (rawButton) {
            rawButton.disabled = !revealAll;
            rawButton.title = revealAll ? 'Inspect raw map JSON' : 'Turn on Reveal All to inspect raw JSON';
        }
        if (!revealAll && currentView === 'raw') setMapView('readable');
    };
    const reloadInspectorFromLiveMap = async () => {
        const fresh = typeof runtimeState.loadMappedEvolutionSiteRef === 'function'
            ? await runtimeState.loadMappedEvolutionSiteRef(site)
            : null;
        if (fresh?.document) currentDocument = fresh.document;
        paint();
        refreshDungeonMapViews();
        if (typeof runtimeState.refreshTrackerViewRef === 'function') {
            runtimeState.refreshTrackerViewRef();
        }
    };
    const live = typeof runtimeState.loadMappedEvolutionSiteRef === 'function'
        ? await runtimeState.loadMappedEvolutionSiteRef(site)
        : null;
    if (live?.document) currentDocument = live.document;
    paint();
    popupDom.querySelector('.rt-dungeon-map-reveal-all')?.addEventListener('change', (event) => {
        revealAll = !!event.target.checked;
        persistDungeonMapRevealAll(revealAll);
        paint();
        refreshDungeonMapViews();
    });
    for (const button of popupDom.querySelectorAll('[data-map-view]')) {
        button.addEventListener('click', () => setMapView(button.dataset.mapView));
    }
    runButton?.addEventListener('click', async () => {
        if (runtimeState.isLoreOrMapAgentBusyRef?.()) {
            if (runStatus) runStatus.textContent = 'Another lore or map agent is already running.';
            return;
        }
        if (typeof runtimeState.runMapEvolutionPassRef !== 'function') {
            if (runStatus) runStatus.textContent = 'Map Evolution is not available yet.';
            return;
        }
        runButton.disabled = true;
        if (runStatus) runStatus.textContent = `Running Map Evolution for ${site}…`;
        try {
            const result = await runtimeState.runMapEvolutionPassRef({ trigger: 'manual', isManual: true, siteRoots: [site] });
            if (result?.ok) {
                await reloadInspectorFromLiveMap();
                const applied = Number(result.applied) || 0;
                const noops = Number(result.noops) || 0;
                if (runStatus) runStatus.textContent = applied
                    ? `Map Evolution committed ${applied} material update${applied === 1 ? '' : 's'} for ${site}.`
                    : noops
                        ? `Map Evolution considered ${site} and made no material change.`
                        : `Map Evolution completed for ${site}.`;
            } else {
                const skipped = String(result?.skipped || '');
                if (runStatus) runStatus.textContent = skipped === 'busy'
                    ? 'Another lore or map agent is already running.'
                    : skipped === 'location_mapping_off'
                        ? 'Persistent Maps is off.'
                        : `Map Evolution could not complete for ${site}.`;
            }
        } catch (error) {
            if (runStatus) runStatus.textContent = `Map Evolution failed: ${String(error?.message || error)}`;
        } finally {
            runButton.disabled = false;
        }
    });
    popupDom.querySelector('.rt-dungeon-map-testing-ground')?.addEventListener('click', async () => {
        const { openMapEvolutionTestingGround } = await import('./panel-map-evolution-debug.js');
        await openMapEvolutionTestingGround({ siteRoot: site });
        await reloadInspectorFromLiveMap();
    });
    await ctx.callGenericPopup(popupDom, ctx.POPUP_TYPE?.TEXT ?? 1, '', {
        okButton: 'Close', cancelButton: false, wide: true, large: true,
        allowVerticalScrolling: true,
        leftAlign: true,
    });
}

function openSceneMapDetails(scene) {
    const mapDocument = scene?.dungeonMap?.document;
    if (!mapDocument) return;
    void openDungeonMapReadablePopup(mapDocument, {
        siteLabel: scene.dungeonMap?.siteRoot || mapDocument.site || '',
        currentLocation: scene.rawLocationText || scene.resolvedPath || '',
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
    if (!isLocationMappingEnabled(getSettings())) {
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
    if (!isLocationMappingEnabled(getSettings())) return;
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
