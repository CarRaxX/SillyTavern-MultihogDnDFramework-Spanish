import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARTRIDGE_PAYLOAD_KEYS, CARTRIDGE_PAYLOAD_GROUPS, getFactoryCartridgePayload } from '../src/state/factory-and-diff.js';

const editorSource = readFileSync(new URL('../ui-editors.js', import.meta.url), 'utf8');

describe('stock module editor live preview', () => {
    it('adds the custom-module style testing sandbox and floating preview', () => {
        expect(editorSource).toContain('id="rt_pe_template"');
        expect(editorSource).toContain('id="rt_pe_preview"');
        expect(editorSource).toContain('id="rt_pe_preview_header"');
        expect(editorSource).toContain('id="rt_pe_preview_view"');
        expect(editorSource).toContain('UI Live Preview');
    });

    it('renders sandbox changes through the normal stock-card renderer', () => {
        expect(editorSource).toContain('buildStockModulePreviewMemo(templateEl.value, blockTag)');
        expect(editorSource).toContain('renderMemoAsCards(previewMemo, blockTag.toUpperCase(), _sectionPages)');
        expect(editorSource).toContain('templateEl.oninput = schedulePreview');
    });

    it('keeps mobile behavior aligned with the custom module preview', () => {
        expect(editorSource).toContain('const isSmallScreen = window.innerWidth <= 700;');
        expect(editorSource).toContain('if (previewEl && !isSmallScreen)');
    });

    it('lets both live preview windows expand from their bottom-right corners', () => {
        expect(editorSource).toContain('id="rt_cfe_preview_resizer" class="rt-resizer-br"');
        expect(editorSource).toContain('id="rt_pe_preview_resizer" class="rt-resizer-br"');
        expect(editorSource).toContain("makeResizableBR(previewEl, previewResizer, 'rpg_tracker_geometry_custom_module_preview')");
        expect(editorSource).toContain("makeResizableBR(previewEl, previewResizer, 'rpg_tracker_geometry_stock_module_preview')");
        expect(editorSource).not.toContain('position:fixed;resize:both');
    });

    it('does not overwrite the main framework geometry when a preview is moved', () => {
        expect(editorSource).toContain("makeDraggable(previewEl, previewHeader, 'rpg_tracker_geometry_custom_module_preview')");
        expect(editorSource).toContain("makeDraggable(previewEl, previewHeader, 'rpg_tracker_geometry_stock_module_preview')");
    });

    it('persists sandbox preview templates into stockTemplates and cartridges', () => {
        expect(editorSource).toContain('s.stockTemplates[modKey] = templateEl.value;');
        expect(editorSource).toContain('delete s.stockTemplates[modKey];');
        expect(editorSource).toContain('getInitialStockModulePreviewContent(s, blockTag, currentText, modKey)');
        expect(CARTRIDGE_PAYLOAD_KEYS).toContain('stockTemplates');
        const stateTrackerGroup = CARTRIDGE_PAYLOAD_GROUPS.find(g => g.id === 'stateTracker');
        expect(stateTrackerGroup?.keys).toContain('stockTemplates');
        const factory = getFactoryCartridgePayload();
        expect(factory.stockTemplates).toBeDefined();
        expect(factory.stockTemplates).toEqual({});
    });

    it('supports cascading fallback resolution in getInitialStockModulePreviewContent', () => {
        expect(editorSource).toContain('extractStockModulePreviewContent(settings?.currentMemo, normalizedTag)');
        expect(editorSource).toContain('settings?.stockTemplates?.[modKey]');
        expect(editorSource).toContain('extractStockModulePreviewContent(promptText, normalizedTag)');
        expect(editorSource).toContain('STOCK_MODULE_PREVIEW_SAMPLES[normalizedTag]');
    });
});
