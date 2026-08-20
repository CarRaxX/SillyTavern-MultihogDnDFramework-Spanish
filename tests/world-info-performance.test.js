import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Persistent Maps world-info performance guards', () => {
    it('does not open a generated Locations lorebook that is absent from the live registry', async () => {
        const immersion = readFileSync(new URL('../immersion.js', import.meta.url), 'utf8');
        const locationLoader = immersion.slice(
            immersion.indexOf('export async function loadAllLocationPaths'),
            immersion.indexOf('/** Return normalized Location paths'),
        );
        expect(locationLoader).toContain('isWorldInfoBookKnown(bookName, ctx)');
        expect(locationLoader).not.toContain('updateWorldInfoList');
    });

    it('treats the frontend registry as authoritative even when saved campaignBooks is stale', async () => {
        const router = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
        const guardStart = router.indexOf('export async function isWorldInfoBookKnown');
        const guardEnd = router.indexOf('\n}', guardStart);
        const guard = router.slice(guardStart, guardEnd);
        expect(guard).toContain('if (Array.isArray(names))');
        expect(guard).toContain('return names.some');
        expect(guard.indexOf('return names.some')).toBeLessThan(guard.indexOf('campaignBooks'));
    });

    it('does not fetch the complete settings payload during archive or manifest discovery', () => {
        const router = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
        expect(router).not.toContain("fetch('/api/settings/get'");
        const archiveStart = router.indexOf('async function fetchRouterArchiveBooks');
        const archiveEnd = router.indexOf('\n}', archiveStart);
        const archive = router.slice(archiveStart, archiveEnd);
        expect(archive).toContain('getWorldInfoNamesSafe({ fullProbe: false })');
        expect(archive).not.toContain('updateWorldInfoList');

        const finalizeStart = router.indexOf('async function finalizeRouterHistorySnapshot');
        const finalizeEnd = router.indexOf('\n}', finalizeStart);
        expect(router.slice(finalizeStart, finalizeEnd)).toContain('getWorldInfoNamesSafe({ fullProbe: false })');
        expect(router).toContain('if (createdNewBook && typeof ctx.updateWorldInfoList');
    });
});
