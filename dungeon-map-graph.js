/**
 * Knowledge-filtered node graph for Visuals/Map.
 * Player-facing views hide UNREVEALED rooms except as unlabeled fog stubs
 * adjacent to a discovered or visited area.
 */

import {
    dungeonLabelsMatch,
    getLocationLeaf,
    normalizeDungeonMapDocument,
} from './dungeon-reality.js';

function escapeXml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function truncateLabel(name, max = 18) {
    const text = String(name || '').trim();
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(1, max - 1))}…`;
}

function uniqueConnectionEdges(areas) {
    const edges = [];
    const seen = new Set();
    const areasById = new Map(areas.map(area => [area.id, area]));
    for (const area of areas) {
        for (const connection of area.connections || []) {
            const target = areasById.get(connection.to);
            if (!target) continue;
            const pairKey = [area.id, target.id].sort().join('|');
            const key = `${pairKey}:${connection.state}:${connection.detail || ''}`;
            if (seen.has(key)) continue;
            seen.add(key);
            edges.push({
                from: area.id,
                to: target.id,
                state: connection.state || 'OPEN',
                detail: String(connection.detail || '').trim(),
            });
        }
    }
    return edges;
}

/** Match a footer/lore location to an area ID. */
export function resolveDungeonGraphCurrentArea(document, currentLocation = '') {
    const map = normalizeDungeonMapDocument(document, document?.site);
    const leaf = getLocationLeaf(currentLocation);
    if (!leaf) return map.areas[0]?.id || '';
    const exact = map.areas.find(area => dungeonLabelsMatch(area.name, leaf));
    if (exact) return exact.id;
    if (map.areas[0] && dungeonLabelsMatch(map.areas[0].name, leaf)) return map.areas[0].id;
    return map.areas[0]?.id || '';
}

/**
 * Convert a v3 map document into a drawable graph.
 * @param {object} document
 * @param {{ playerFacing?: boolean, currentLocation?: string }} [options]
 */
export function buildDungeonMapGraph(document, { playerFacing = true, currentLocation = '' } = {}) {
    const map = normalizeDungeonMapDocument(document, document?.site);
    const currentAreaId = resolveDungeonGraphCurrentArea(map, currentLocation);
    const areasById = new Map(map.areas.map(area => [area.id, area]));
    const known = new Set();
    for (const area of map.areas) {
        if (!playerFacing || area.knowledge === 'VISITED' || area.knowledge === 'DISCOVERED') {
            known.add(area.id);
        }
    }
    const fog = new Set();
    if (playerFacing) {
        for (const id of known) {
            for (const connection of areasById.get(id)?.connections || []) {
                const target = areasById.get(connection.to);
                if (target && !known.has(target.id) && target.knowledge === 'UNREVEALED') {
                    fog.add(target.id);
                }
            }
        }
    }
    const visibleIds = new Set([...known, ...fog]);
    const nodes = map.areas
        .filter(area => visibleIds.has(area.id))
        .map(area => ({
            id: area.id,
            name: area.name,
            knowledge: area.knowledge,
            fog: fog.has(area.id),
            revealed: known.has(area.id),
            current: area.id === currentAreaId,
            entrance: map.areas[0]?.id === area.id,
        }));
    const edges = uniqueConnectionEdges(map.areas).filter(edge =>
        visibleIds.has(edge.from) && visibleIds.has(edge.to));
    return {
        site: map.site,
        currentAreaId,
        nodes,
        edges,
    };
}

function bfsRanks(nodes, edges, rootId) {
    const ids = new Set(nodes.map(node => node.id));
    const adj = new Map(nodes.map(node => [node.id, []]));
    for (const edge of edges) {
        if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
        adj.get(edge.from).push(edge.to);
        adj.get(edge.to).push(edge.from);
    }
    const rank = new Map();
    if (!rootId || !ids.has(rootId)) return rank;
    const queue = [rootId];
    rank.set(rootId, 0);
    while (queue.length) {
        const id = queue.shift();
        for (const next of adj.get(id) || []) {
            if (rank.has(next)) continue;
            rank.set(next, rank.get(id) + 1);
            queue.push(next);
        }
    }
    return rank;
}

/**
 * Layered left-to-right layout from the entrance (or current / first node).
 * @param {{ nodes: object[], edges: object[] }} graph
 * @param {{ compact?: boolean }} [options]
 */
export function layoutDungeonMapGraph(graph, { compact = true } = {}) {
    const nodeWidth = compact ? 108 : 148;
    const nodeHeight = compact ? 28 : 36;
    const fogSize = compact ? 18 : 22;
    const rankGap = compact ? 56 : 84;
    const nodeGap = compact ? 10 : 16;
    const padding = compact ? 14 : 24;
    const nodes = graph.nodes || [];
    const edges = graph.edges || [];
    const root = nodes.find(node => node.entrance && node.revealed)
        || nodes.find(node => node.current)
        || nodes.find(node => node.revealed)
        || nodes[0];
    const ranks = bfsRanks(nodes, edges, root?.id);
    const layers = new Map();
    let maxRank = 0;
    for (const node of nodes) {
        const rank = ranks.has(node.id) ? ranks.get(node.id) : 0;
        maxRank = Math.max(maxRank, rank);
        if (!layers.has(rank)) layers.set(rank, []);
        layers.get(rank).push(node);
    }
    for (const layer of layers.values()) {
        layer.sort((a, b) => {
            if (a.fog !== b.fog) return a.fog ? 1 : -1;
            return String(a.name).localeCompare(String(b.name));
        });
    }
    const positioned = [];
    const byId = new Map();
    let maxBottom = padding;
    for (const [rank, layer] of [...layers.entries()].sort((a, b) => a[0] - b[0])) {
        layer.forEach((node, order) => {
            const width = node.fog ? fogSize : nodeWidth;
            const height = node.fog ? fogSize : nodeHeight;
            const x = padding + rank * (nodeWidth + rankGap) + (nodeWidth - width) / 2;
            const y = padding + order * (nodeHeight + nodeGap) + (nodeHeight - height) / 2;
            const placed = { ...node, x, y, width, height, cx: x + width / 2, cy: y + height / 2 };
            positioned.push(placed);
            byId.set(node.id, placed);
            maxBottom = Math.max(maxBottom, y + height);
        });
    }
    const width = padding * 2 + (maxRank + 1) * nodeWidth + maxRank * rankGap;
    const height = Math.max(maxBottom + padding, padding * 2 + nodeHeight);
    const laidEdges = edges
        .map(edge => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (!from || !to) return null;
            const clipped = clipEdgeToNodeBorders(from, to);
            return {
                ...edge,
                x1: clipped.x1,
                y1: clipped.y1,
                x2: clipped.x2,
                y2: clipped.y2,
            };
        })
        .filter(Boolean);
    return { nodes: positioned, edges: laidEdges, width, height, compact };
}

/** Keep connectors just outside the node stroke so they never cross labels. */
const EDGE_NODE_GAP = 2.5;

function nodeExitPoint(node, towardX, towardY, gap = EDGE_NODE_GAP) {
    const dx = towardX - node.cx;
    const dy = towardY - node.cy;
    const length = Math.hypot(dx, dy);
    if (!length) return { x: node.cx, y: node.cy };
    let t;
    if (node.fog) {
        t = (node.width / 2) / length;
    } else {
        const scaleX = node.width ? Math.abs(dx) / (node.width / 2) : Infinity;
        const scaleY = node.height ? Math.abs(dy) / (node.height / 2) : Infinity;
        const scale = Math.max(scaleX, scaleY);
        t = scale ? 1 / scale : 0;
    }
    const extra = gap / length;
    return {
        x: node.cx + dx * (t + extra),
        y: node.cy + dy * (t + extra),
    };
}

function clipEdgeToNodeBorders(from, to) {
    const start = nodeExitPoint(from, to.cx, to.cy);
    const end = nodeExitPoint(to, from.cx, from.cy);
    const along = (end.x - start.x) * (to.cx - from.cx) + (end.y - start.y) * (to.cy - from.cy);
    if (along > 0) return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
    const tightStart = nodeExitPoint(from, to.cx, to.cy, 0);
    const tightEnd = nodeExitPoint(to, from.cx, from.cy, 0);
    return { x1: tightStart.x, y1: tightStart.y, x2: tightEnd.x, y2: tightEnd.y };
}

function nodeClass(node) {
    const parts = ['rt-dungeon-graph-node'];
    if (node.fog) parts.push('rt-dungeon-graph-node-fog');
    else parts.push(`rt-dungeon-graph-node-${String(node.knowledge || '').toLowerCase()}`);
    if (node.current) parts.push('rt-dungeon-graph-node-current');
    if (node.revealed) parts.push('rt-dungeon-graph-node-revealed');
    return parts.join(' ');
}

/**
 * Render a player-facing (or full) graph as inline SVG.
 * @param {object} graph from buildDungeonMapGraph
 * @param {{ compact?: boolean, siteRoot?: string }} [options]
 */
export function renderDungeonMapGraphSvg(graph, { compact = true, siteRoot = '' } = {}) {
    const layout = layoutDungeonMapGraph(graph, { compact });
    if (!layout.nodes.length) {
        return '<div class="rt-dungeon-graph-empty">No revealed rooms yet.</div>';
    }
    const fontSize = compact ? 10 : 12;
    const edges = layout.edges.map(edge => {
        const title = escapeXml([edge.state, edge.detail].filter(Boolean).join(' — '));
        const stateClass = `rt-dungeon-graph-edge rt-dungeon-graph-edge-${String(edge.state || 'OPEN').toLowerCase()}`;
        return `<line class="${stateClass}" x1="${edge.x1}" y1="${edge.y1}" x2="${edge.x2}" y2="${edge.y2}"><title>${title}</title></line>`;
    }).join('');
    const nodes = layout.nodes.map(node => {
        const label = node.fog ? '?' : truncateLabel(node.name, compact ? 16 : 22);
        const path = !node.fog && siteRoot
            ? `${siteRoot} :: ${node.name}`
            : '';
        const attrs = [
            `class="${nodeClass(node)}"`,
            node.fog ? 'data-fog="1" aria-hidden="true"' : `data-area-id="${escapeXml(node.id)}" data-area-path="${escapeXml(path)}" role="button" tabindex="0"`,
        ].join(' ');
        const title = node.fog
            ? 'Unexplored'
            : escapeXml(`${node.name}${node.current ? ' (you are here)' : ''}`);
        const shape = node.fog
            ? `<circle cx="${node.cx}" cy="${node.cy}" r="${node.width / 2}"></circle>`
            : `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="6"></rect>`;
        return `<g ${attrs}><title>${title}</title>${shape}<text x="${node.cx}" y="${node.cy}" text-anchor="middle" dominant-baseline="middle" font-size="${fontSize}">${escapeXml(label)}</text></g>`;
    }).join('');
    return `<svg class="rt-dungeon-graph-svg" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" role="img" aria-label="${escapeXml(graph.site || 'Site map')}">${edges}${nodes}</svg>`;
}

/**
 * Compact Visuals/Map embed, or a reattach placeholder when the map is popped out.
 * @param {object} graph
 * @param {{ detached?: boolean, siteRoot?: string }} [options]
 */
export function renderDungeonMapEmbedHtml(graph, { detached = false, siteRoot = '' } = {}) {
    if (!graph?.nodes?.length) return '';
    const site = escapeXml(graph.site || 'Mapped site');
    if (detached) {
        return `<div class="rt-immersion-map rt-immersion-map-popped">
            <div class="rt-immersion-section-label"><span>Site map</span></div>
            <div class="rt-immersion-map-popped-body">
                <span>${site} is open in a separate window.</span>
                <button type="button" class="rt-dungeon-map-reattach rpg-tracker-icon-btn" title="Reattach site map">Reattach</button>
            </div>
        </div>`;
    }
    return `<div class="rt-immersion-map">
        <div class="rt-immersion-section-label">
            <span>Site map</span>
            <button type="button" class="rt-dungeon-map-detach rpg-tracker-icon-btn" title="Open map in a separate window" aria-label="Open map in a separate window">⧉</button>
        </div>
        <div class="rt-dungeon-graph-scroll">${renderDungeonMapGraphSvg(graph, { compact: true, siteRoot: siteRoot || graph.site })}</div>
    </div>`;
}
