/**
 * Global NPC Library — reusable NPC templates (CORE text + optional portrait)
 * that are not bound to a campaign chat. Export packages embed the portrait
 * as base64 so a single `.mnpc.json` file is enough to share an NPC.
 */

import { getSettings } from './state-manager.js';
import { saveSettings } from './src/app/runtime-bridge.js';
import {
    persistPortraitSrc,
    deletePortraitFile,
    countPortraitPathRefs,
    isManagedPortraitPath,
} from './portrait-storage.js';
import { getCardAppearanceSynopsis } from './src/ui/panel/card-synopsis.js';
import {
    NPC_LIBRARY_CHAT_ID,
    createLibraryRecord,
    dataUrlFromPortraitPayload,
    findLibraryNpcById,
    findLibraryNpcByName,
    getNpcLibrary,
    parseNpcPackages,
    serializeNpcPackage,
    slugifyNpcName,
    uniqueLibraryNpcName,
    upsertLibraryNpc,
    removeLibraryNpcRecord,
    resolveLibraryPortraitUpdate,
} from './npc-library-lib.js';

export * from './npc-library-lib.js';

export function libraryNpcSynopsis(content) {
    return getCardAppearanceSynopsis(content) || '';
}

export function downloadTextFile(filename, text, mime = 'application/json') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Failed to read image'));
        reader.readAsDataURL(blob);
    });
}

/** Fetch a portrait URL/path (or pass through a data URL) as a data URL. */
export async function fetchSrcAsDataUrl(src) {
    if (!src) return '';
    if (String(src).startsWith('data:image/')) return src;
    const url = /^https?:\/\//i.test(src) || src.startsWith('/') ? src : `/${src}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to read portrait (${res.status})`);
    const blob = await res.blob();
    const dataUrl = await blobToDataUrl(blob);
    if (!String(dataUrl).startsWith('data:image/')) {
        throw new Error('Portrait was not an image');
    }
    return dataUrl;
}

export async function persistLibraryPortrait(src, entityName) {
    if (!src) return '';
    const dataUrl = String(src).startsWith('data:image/')
        ? src
        : await fetchSrcAsDataUrl(src);
    if (!dataUrl) return '';
    return persistPortraitSrc(dataUrl, NPC_LIBRARY_CHAT_ID, entityName, true);
}

export async function deleteLibraryPortraitIfOrphan(settings, path) {
    if (!path || !isManagedPortraitPath(path)) return;
    if (countPortraitPathRefs(settings, path) > 0) return;
    await deletePortraitFile(path);
}

/**
 * Save a campaign NPC (or imported package) into the global library.
 * Copies the portrait into library storage so campaign and library stay independent.
 * Omit `portraitSrc` to keep an existing library portrait; pass `''` to clear it.
 */
export async function saveNpcToLibrary(settings, { name, content, keys, portraitSrc, notes } = {}, { overwriteId } = {}) {
    const s = settings || getSettings();
    getNpcLibrary(s);
    const existing = overwriteId
        ? findLibraryNpcById(s, overwriteId)
        : findLibraryNpcByName(s, name);
    const targetId = overwriteId || existing?.id;
    const previousPath = existing?.portraitPath || '';

    const portraitUpdate = resolveLibraryPortraitUpdate(previousPath, portraitSrc);
    let portraitPath = previousPath;
    if (portraitUpdate.kind === 'replace') {
        try {
            portraitPath = await persistLibraryPortrait(portraitSrc, name);
        } catch (err) {
            console.warn('[RPG Tracker] NPC library portrait copy failed:', err);
            portraitPath = previousPath;
        }
    } else {
        portraitPath = portraitUpdate.path;
    }

    const record = createLibraryRecord({
        id: targetId,
        name,
        content,
        keys,
        portraitPath,
        notes,
        createdAt: existing?.createdAt,
    });
    const stored = upsertLibraryNpc(s, record, { overwriteId: targetId });

    if (previousPath && previousPath !== stored.portraitPath) {
        await deleteLibraryPortraitIfOrphan(s, previousPath);
    }
    saveSettings();
    return stored;
}

export async function deleteNpcFromLibrary(settings, id) {
    const s = settings || getSettings();
    const removed = removeLibraryNpcRecord(s, id);
    if (!removed) return false;
    if (removed.portraitPath) await deleteLibraryPortraitIfOrphan(s, removed.portraitPath);
    saveSettings();
    return true;
}

export async function exportNpcToFile(record) {
    let portraitDataUrl = '';
    if (record?.portraitPath) {
        try {
            portraitDataUrl = await fetchSrcAsDataUrl(record.portraitPath);
        } catch (err) {
            console.warn('[RPG Tracker] NPC export could not read portrait:', err);
        }
    }
    const pkg = serializeNpcPackage(record, portraitDataUrl);
    downloadTextFile(
        `multihog_npc_${slugifyNpcName(record?.name)}.mnpc.json`,
        JSON.stringify(pkg, null, 2),
    );
    return !!pkg.portrait;
}

/**
 * Import one or more packages into the library. Name collisions get a suffix.
 * @returns {Promise<object[]>} Stored records.
 */
export async function importNpcPackages(settings, text) {
    const s = settings || getSettings();
    const packages = parseNpcPackages(text);
    const stored = [];
    for (const pkg of packages) {
        const name = uniqueLibraryNpcName(pkg.name, s);
        const portraitSrc = dataUrlFromPortraitPayload(pkg.portrait);
        const record = await saveNpcToLibrary(s, {
            name,
            content: pkg.content,
            keys: pkg.keys,
            portraitSrc,
            notes: pkg.notes,
        });
        stored.push(record);
    }
    return stored;
}
