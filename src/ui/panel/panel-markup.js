/** Produces the static Tracker and Lorebook Agent panel structure. */
import { AGENT_TERMINAL_TABS, resolveActiveTerminalTab } from './agent-terminal.js';

export function buildPanelMarkup({ settings, agentPanelCollapsedClass }) {
    return `
            <div class="rt-resizer-tr" id="rt-resizer-tr" title="Redimensionar desde arriba-derecha"></div>
            <div class="rpg-tracker-header" id="rpg-tracker-header">
                <div class="rt-header-starfield" aria-hidden="true"></div>
                <div class="rt-header-face rt-header-face-active" id="rt-header-face-tracker">
                <div class="rpg-tracker-header-left">
                    <div class="rpg-tracker-status-indicator active" id="rpg-tracker-status"></div>
                    <span class="rt-header-title-desktop">Multihog D&D Framework</span>
                    <span class="rt-header-title-mobile" style="display: none;">Multihog D&D</span>
                    <div id="rt-daynight-badge-slot"></div>
                    <button class="rpg-tracker-stop-btn" id="rpg-tracker-stop-btn" title="Detener Generación" style="display:none;">■</button>
                </div>
                <div class="rpg-tracker-header-center" id="rpg-tracker-pause-banner"></div>
                <div class="rpg-tracker-header-right">
                    <button type="button" class="rpg-tracker-icon-btn" id="rpg-tracker-settings-btn" title="Abrir Ajustes"><i class="fa-solid fa-wrench" aria-hidden="true"></i></button>
                    <button class="rpg-tracker-icon-btn rt-tutorial-help-btn" id="rpg-tracker-help-btn" title="CHAT">CHAT</button>
                    <button class="rpg-tracker-icon-btn" id="rpg-tracker-view-btn" title="Alternar vista renderizada">⊞</button>
                    <button class="rpg-tracker-icon-btn" id="rpg-tracker-enable-btn" title="${settings.enabled ? 'Desactivar Multihog Framework' : 'Activar Multihog Framework'}" style="${settings.enabled ? '' : 'opacity:0.4;'}" >⏻</button>
                    <button class="rpg-tracker-icon-btn" id="rpg-tracker-update-btn" title="Actualizar Estado Ahora">🔄</button>
                    <button class="rpg-tracker-icon-btn" id="rpg-tracker-pause-btn" title="Pausar Rastreador">⏸</button>
                    <button class="rpg-tracker-icon-btn" id="rpg-tracker-portraits-menu-btn" title="Acciones de Retratos IA">🖼️</button>
                    <button class="rpg-tracker-icon-btn rt-overflow-trigger" id="rt-overflow-btn" title="Más acciones">⋯</button>
                    <button class="rpg-tracker-icon-btn" id="rpg-tracker-collapse-btn" title="Plegar Panel"><i class="fa-solid ${settings.trackerCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"></i></button>
                    <button class="rpg-tracker-icon-btn" id="rpg-tracker-close-btn" title="Ocultar panel">✕</button>
                </div>
                </div>
                <div class="rt-header-face rt-header-face-inactive" id="rt-header-face-agent">
                    <div class="rpg-tracker-header-left">
                        <i class="fa-solid fa-robot"></i> <span>Agente de Lorebook y Mapas</span>
                    </div>
                    <div class="rpg-tracker-header-center" id="rt-agent-pause-banner" style="color:#ffa500; font-size:0.7em; font-weight:bold; letter-spacing:0.04em;">${settings.routerPaused ? 'AGENTE PAUSADO' : ''}</div>
                    <div class="rpg-tracker-header-right">
                        <div id="rt-research-menu-wrap" style="position:relative; display:inline-flex;">
                            <button class="rpg-tracker-icon-btn" id="rt-agent-router-manual-run" title="Ejecutar investigación ahora — Agente de Lorebook, Actualizador de Mapas o Evolución de Mapas" style="color: var(--rt-accent);"><i class="fa-solid fa-play"></i></button>
                            <div id="rt-research-dropdown" class="rt-update-menu rt-research-dropdown" style="display:none;">
                                <div class="rt-menu-item" id="rt-research-lorebook"><b>Agente de Lorebook</b><small>PNJs, lugares, relaciones</small></div>
                                <div class="rt-menu-item" id="rt-research-map-updater"><b>Actualizador de Mapas</b><small>Ocupación de mazmorras y asentamientos</small></div>
                                <div class="rt-menu-item" id="rt-research-map-evolution"><b>Evolución de Mapas</b><small>Elegir mapas a evolucionar ahora</small></div>
                            </div>
                        </div>
                        <button class="rpg-tracker-stop-btn" id="rt-agent-stop-btn" title="Detener Agente" style="display:none;">■</button>
                        <button class="rpg-tracker-icon-btn" id="rt-agent-router-full-audit-panel" title="Ejecutar Auditoría Completa (Por bloques)" style="color: #ff5555;"><i class="fa-solid fa-book-journal-whills"></i></button>
                         <div id="rt-cleanup-menu-wrap" style="position:relative; display:inline-flex;">
                             <button class="rpg-tracker-icon-btn" id="rt-agent-router-cleanup" title="Menú de Limpieza" style="color: #e67e22;"><i class="fa-solid fa-broom"></i></button>
                             <div id="rt-cleanup-dropdown" class="rt-cleanup-dropdown" style="display:none;">
                                 <button id="rt-cleanup-run-btn" style="display:block; width:100%; text-align:left; padding:7px 14px; background:none; border:none; color:var(--rt-text,#e0e0e0); font-size:12px; cursor:pointer; white-space:nowrap;">🧹 Ejecutar Limpieza</button>
                                 <div style="height:1px; background:rgba(255,255,255,0.06); margin:2px 0;"></div>
                                 <button id="rt-cleanup-settings-toggle" style="display:block; width:100%; text-align:left; padding:7px 14px; background:none; border:none; color:var(--rt-text,#e0e0e0); font-size:12px; cursor:pointer; white-space:nowrap;">⚙ Ajustes de Limpieza</button>
                                 <div id="rt-cleanup-settings-panel" style="display:none; padding:8px 12px; border-top:1px solid rgba(255,255,255,0.07); margin-top:2px;">
                                     <label style="display:flex; align-items:center; gap:6px; font-size:10px; opacity:0.75; margin-bottom:8px; cursor:pointer; user-select:none;">
                                         <input id="rt-cleanup-use-threshold-chk" type="checkbox" ${settings.routerCleanupUseThreshold !== false ? 'checked' : ''} style="margin:0; cursor:pointer; accent-color:#e67e22;">
                                         Usar Límite de Tokens
                                     </label>
                                     <div id="rt-cleanup-threshold-row" style="transition:opacity 0.15s; opacity:${settings.routerCleanupUseThreshold !== false ? '1' : '0.35'}; pointer-events:${settings.routerCleanupUseThreshold !== false ? 'auto' : 'none'};">
                                         <label style="font-size:10px; opacity:0.6; display:block; margin-bottom:2px;">Límite de Tokens</label>
                                         <input id="rt-cleanup-threshold-inp" type="text" inputmode="numeric" pattern="[0-9]*" min="50" max="5000" step="50" value="${settings.routerCleanupTokenThreshold || 300}" style="width:100%; background:rgba(0,0,0,0.35); color:var(--rt-text,#e0e0e0); border:1px solid rgba(255,255,255,0.15); border-radius:4px; padding:3px 6px; font-size:11px; box-sizing:border-box; margin-bottom:8px;">
                                     </div>
                                     <label style="font-size:10px; opacity:0.6; display:block; margin-bottom:2px;">Auto-limpiar cada N turnos <span style="opacity:0.45;">(0 = desactivado)</span></label>
                                     <input id="rt-cleanup-every-inp" type="text" inputmode="numeric" pattern="[0-9]*" min="0" max="100" step="1" value="${settings.routerCleanupEvery || 0}" style="width:100%; background:rgba(0,0,0,0.35); color:var(--rt-text,#e0e0e0); border:1px solid rgba(255,255,255,0.15); border-radius:4px; padding:3px 6px; font-size:11px; box-sizing:border-box;">
                                 </div>
                             </div>
                         </div>
                        <button class="rpg-tracker-icon-btn" id="rt-agent-router-pause-btn" title="${settings.routerPaused ? 'Reanudar Agente (auto-ejecuciones pausadas)' : 'Pausar Agente (omitir auto-ejecuciones)'}" style="${settings.routerPaused ? 'color:#ffa500;' : ''}">${settings.routerPaused ? '▶' : '⏸'}</button>
                        <button class="rpg-tracker-icon-btn" id="rt-agent-router-detach" title="Desacoplar Agente de Lorebook">⧉</button>
                        <button class="rpg-tracker-icon-btn" id="rt-agent-router-collapse-btn" title="Plegar Panel"><i class="fa-solid ${settings.agentCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"></i></button>
                        <button class="rpg-tracker-icon-btn" id="rpg-tracker-agent-close" title="Cerrar">✕</button>
                    </div>
                </div>
            </div>
            <div class="rpg-tracker-content">
                <div class="rt-panel-mode-switch-wrap" id="rt-panel-mode-switch-wrap">
                    <div class="rt-adventure-companion-header" id="rt-adventure-companion-header" style="display:none;" aria-hidden="true">
                        <i class="fa-solid fa-compass" aria-hidden="true"></i>
                        <span>Acompañante de Aventura</span>
                    </div>
                    <div class="rt-agent-view-mode-switch rt-panel-mode-switch" id="rt-panel-mode-switch" role="tablist" aria-label="Modo de contenido del panel">
                        <button type="button" id="rt-panel-mode-tracker" class="rt-agent-view-mode-btn rt-agent-view-mode-btn-active" role="tab" aria-selected="true">Rastreador de Estado</button>
                        <button type="button" id="rt-panel-mode-agent" class="rt-agent-view-mode-btn" role="tab" aria-selected="false">Agente de Lorebook y Mapas</button>
                    </div>
                </div>
                <div class="rt-panel-mode-pane" id="rt-panel-tracker-pane">
                <textarea class="rpg-tracker-memo-area" id="rpg-tracker-memo">${settings.currentMemo}</textarea>
                <div class="rpg-tracker-render-view" id="rpg-tracker-render" style="display:none;"></div>
                <div class="rt-tutorial-view" id="rt-tutorial-view" style="display:none;" aria-label="CHAT"></div>
                <div class="rt-bottom-xp-bar" id="rt-bottom-xp-bar" style="display:none;" aria-label="Progreso de experiencia"></div>
                </div>
                <div class="rt-panel-mode-pane" id="rt-panel-agent-pane" style="display:none;">
            <div class="rpg-tracker-panel rpg-tracker-agent-panel rt-agent-integrated ${agentPanelCollapsedClass}${settings.trackerTheme || 'rt-theme-native'}" id="rpg-tracker-agent">
                <div class="rpg-tracker-content" style="flex: 1; min-height: 0; resize: none; padding: 10px; color: var(--rt-text); display: flex; flex-direction: column;">
                    <!-- Quick Settings Collapsible Header -->
                    <div id="rt-agent-settings-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; cursor: pointer; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.08); user-select: none; flex-shrink: 0;">
                        <div style="font-weight: bold; font-size: 0.846em; display: flex; align-items: center; gap: 6px; color: var(--rt-text-muted);">
                            <i class="fa-solid ${settings.agentSettingsOpen !== false ? 'fa-chevron-down' : 'fa-chevron-right'}" id="rt-agent-settings-toggle-icon"></i> Ajustes Rápidos
                        </div>
                        <button id="rt-agent-help-btn" style="background: var(--rt-accent-bg); border: 1px solid var(--rt-accent-dim); color: var(--rt-accent); border-radius: 12px; width: 18px; height: 18px; font-size: 0.769em; cursor: pointer; display: flex; align-items: center; justify-content: center; margin: 0; flex-shrink: 0;" title="¿Qué es el Agente de Lorebook?">?</button>
                    </div>

                    <!-- Quick Settings Drawer -->
                    <div id="rt-agent-settings-drawer" style="display: ${settings.agentSettingsOpen !== false ? 'block' : 'none'}; margin-bottom: 10px; flex-shrink: 0;">
                        <label style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; cursor: pointer; opacity: 0.8; font-size: 0.846em;" title="Usa etiquetas simples [[NPC: Nombre | Desc]] en vez de herramientas complejas. Mejor para modelos pequeños.">
                            Modo Básico (basado en etiquetas, sin llamadas a herramientas)
                            <input type="checkbox" id="rt-agent-router-basic" ${settings.routerBasicMode ? 'checked' : ''}>
                        </label>

                        <label style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; cursor: pointer; opacity: 0.8; font-size: 0.846em;" title="Cuando está activado, el escáner de palabras clave de la extensión se desactiva por completo. El sistema nativo de palabras clave de SillyTavern gestiona toda la activación. El agente no auto-activará ni auto-expirará entradas.">
                            Activación Nativa por Palabras Clave
                            <input type="checkbox" id="rt-agent-router-native-kw" ${settings.routerNativeKeywordActivation ? 'checked' : ''}>
                        </label>

                        ${(() => {
            const mode = settings.routerLookbackSinceLastRun !== false ? 'since_last_run'
                : settings.routerLookbackSinceLastUser === true ? 'since_last_user' : 'fixed';
            return `
                        <div style="margin-bottom: 8px;">
                            <div style="font-size: 0.769em; opacity: 0.7; margin-bottom: 4px;">Modo de retroceso:</div>
                            <label style="display: flex; align-items: center; gap: 5px; margin-bottom: 4px; cursor: pointer; font-size: 0.769em; opacity: 0.85;" title="Lee cada mensaje desde la última ejecución exitosa del agente — ideal cuando Ejecutar cada > 1.">
                                <input type="radio" name="rt-lookback-mode" id="rt-agent-lookback-mode-run" value="since_last_run" ${mode === 'since_last_run' ? 'checked' : ''}>
                                <span>Desde la última ejecución</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 5px; margin-bottom: 4px; cursor: pointer; font-size: 0.769em; opacity: 0.75;" title="Lee desde el mensaje del usuario más reciente hasta la última respuesta de la IA.">
                                <input type="radio" name="rt-lookback-mode" id="rt-agent-lookback-mode-user" value="since_last_user" ${mode === 'since_last_user' ? 'checked' : ''}>
                                <span>Desde el último mensaje del usuario</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 5px; margin-bottom: 4px; cursor: pointer; font-size: 0.769em; opacity: 0.75;" title="Lee un número fijo de turnos recientes del usuario.">
                                <input type="radio" name="rt-lookback-mode" id="rt-agent-lookback-mode-fixed" value="fixed" ${mode === 'fixed' ? 'checked' : ''}>
                                <span>Número fijo de turnos:</span>
                            </label>
                            <div id="rt-agent-router-lookback-container" style="display: inline-flex; align-items: center; gap: 6px; margin-left: 20px; transition: opacity 0.2s; ${mode !== 'fixed' ? 'opacity: 0.35; pointer-events: none;' : ''}" title="Lee los últimos N turnos del usuario (incluye todos los mensajes de herramientas de cada turno).">
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-router-lookback" value="${settings.routerLookback || 4}" min="1" max="100" style="width: 40px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 3px; text-align: center; font-size: 0.769em; padding: 1px;">
                                <span style="font-size: 0.769em; opacity: 0.5;">msjs</span>
                            </div>
                        </div>`;
        })()}

                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                            <div style="display: flex; align-items: center; gap: 6px; flex: 1;" title="Ejecutar cada N mensajes: 1 = cada turno. 3+ = con menos frecuencia pero con más contexto narrativo. Los aciertos por palabras clave se activan de inmediato sin importar este ajuste.">
                                <span style="font-size: 0.769em; opacity: 0.7;">Ejecutar cada:</span>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-router-run-every" value="${settings.routerRunEvery || 3}" min="1" max="50" style="width: 40px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 3px; text-align: center; font-size: 0.769em; padding: 1px;">
                                <span style="font-size: 0.769em; opacity: 0.5;">msjs</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px; flex: 1;" title="Frecuencia del Actualizador de Mapas mientras estás en una mazmorra o asentamiento. Independiente del Agente de Lorebook. 1 = ocupación se actualiza en cada turno.">
                                <span style="font-size: 0.769em; opacity: 0.7;">Mapear cada:</span>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-map-updater-run-every" value="${settings.mapUpdaterRunEvery ?? 1}" min="1" max="50" style="width: 40px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 3px; text-align: center; font-size: 0.769em; padding: 1px;">
                                <span style="font-size: 0.769em; opacity: 0.5;">msjs</span>
                            </div>
                        </div>

                        <label style="display: flex; align-items: center; gap: 5px; margin-bottom: 10px; cursor: pointer; font-size: 0.769em; opacity: 0.75;" title="Incluir mensajes ocultos (ej. mensajes comprimidos por un resumidor) en la ventana de retroceso del agente.">
                            <input type="checkbox" id="rt-agent-router-include-hidden" ${settings.routerIncludeHidden ? 'checked' : ''}>
                            <span>Incluir msjs ocultos (resumidor)</span>
                        </label>

                        <label style="display: flex; align-items: center; gap: 5px; margin-bottom: 10px; cursor: pointer; font-size: 0.769em; opacity: 0.75;" title="Cuando está activado, deslizar (swipe) fuera de una respuesta que activó el agente deshace ese pase de lorebook.">
                            <input type="checkbox" id="rt-agent-router-swipe-rollback" ${settings.routerSwipeRollback !== false ? 'checked' : ''}>
                            <span>Reversión automática al deslizar</span>
                        </label>

                        <div style="display: flex; gap: 8px; margin-bottom: 10px; align-items: flex-end;">
                            <div style="flex: 1;" title="Turnos Máx.: Cuántos ciclos de Pensamiento/Acción puede realizar el agente antes de agotarse el tiempo (Solo Modo Avanzado).">
                                <div style="margin-bottom: 5px; opacity: 0.8; font-size: 0.846em; color: var(--rt-text-muted);">Turnos Máx. del Agente:</div>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-router-max-turns" value="${settings.routerMaxTurns || 5}" style="width: 100%; background: var(--rt-card-bg); color: var(--rt-text); border: var(--rt-border); border-radius: 4px; padding: 4px; font-size: 0.846em; box-sizing: border-box;">
                            </div>
                            <div style="flex: 1;" title="Claves Activas Máx.: El número máximo de entradas de lore que el agente puede mantener en Memoria Activa. Al alcanzarse, debe desactivar entradas antiguas para añadir nuevas.">
                                <div style="margin-bottom: 5px; opacity: 0.8; font-size: 0.846em; color: var(--rt-text-muted);">Claves Activas Máx.:</div>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-router-max-activations" value="${settings.routerMaxActivations || 12}" min="1" max="20" style="width: 100%; background: var(--rt-card-bg); color: var(--rt-text); border: var(--rt-border); border-radius: 4px; padding: 4px; font-size: 0.846em; box-sizing: border-box;">
                            </div>
                            <div style="flex: 1;" title="Límite de Desbordamiento por Palabras Clave: máx. de entradas activadas por palabras clave permitidas por encima de Claves Activas Máx. (0 = sin límite).">
                                <div style="margin-bottom: 5px; opacity: 0.8; font-size: 0.846em; color: var(--rt-text-muted); line-height: 1.2;">Límite de Desbordamiento<br><span style="font-size: 0.75em; opacity: 0.5; font-weight: normal;">(0 = sin límite)</span>:</div>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-router-kw-overflow-cap" value="${settings.routerMaxKeywordOverflow ?? 6}" min="0" max="50" style="width: 100%; background: var(--rt-card-bg); color: var(--rt-text); border: var(--rt-border); border-radius: 4px; padding: 4px; font-size: 0.846em; box-sizing: border-box;">
                            </div>
                        </div>
                        


                    </div>

                    <!-- Modular Repertoire Collapsible Header -->
                    <div id="rt-agent-modules-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; cursor: pointer; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.08); user-select: none; flex-shrink: 0;">
                        <div style="font-weight: bold; font-size: 0.846em; display: flex; align-items: center; gap: 6px; color: var(--rt-text-muted);">
                            <i class="fa-solid ${settings.agentModulesOpen !== false ? 'fa-chevron-down' : 'fa-chevron-right'}" id="rt-agent-modules-toggle-icon"></i> Repertorio Modular (Reglas de Prompt)
                        </div>
                    </div>

                    <!-- Modular Repertoire Drawer -->
                    <div id="rt-agent-modules-drawer" style="display: ${settings.agentModulesOpen !== false ? 'block' : 'none'}; margin-bottom: 10px; flex-shrink: 0;">
                        <div style="margin-bottom: 5px; font-weight: bold; opacity: 0.8; font-size: 0.846em;">Módulos Activados (Predeterminados):</div>
                        <div id="rt-agent-stock-modules-list" style="margin-bottom: 10px;"></div>

                        <div style="margin-bottom: 5px; font-weight: bold; opacity: 0.8; font-size: 0.846em;">Etiquetas Personalizadas:</div>
                        <div id="rt-agent-custom-tags-list"></div>
                        <button id="rt-agent-add-custom-tag" style="width: 100%; background: #333; border: 1px solid #444; color: #ddd; font-size: 0.769em; padding: 2px; border-radius: 3px; cursor: pointer; margin-top: 4px; flex-shrink: 0;">+ Añadir Etiqueta Personalizada</button>
                    </div>

                    <!-- Terminal/Direct Prompt Collapsible Header -->
                    <div id="rt-agent-console-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; cursor: pointer; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.08); user-select: none; flex-shrink: 0;">
                        <div style="font-weight: bold; font-size: 0.846em; display: flex; align-items: center; gap: 6px; color: var(--rt-text-muted);">
                            <i class="fa-solid ${settings.agentConsoleOpen !== false ? 'fa-chevron-down' : 'fa-chevron-right'}" id="rt-agent-console-toggle-icon"></i> Terminal / Prompt Directo
                        </div>
                    </div>

                    <!-- Terminal/Direct Prompt Section Drawer -->
                    <div id="rt-agent-console-drawer" style="display: ${settings.agentConsoleOpen !== false ? 'block' : 'none'}; margin-bottom: 10px; flex-shrink: 0;">
                        ${(() => {
            const activeTab = resolveActiveTerminalTab(settings.agentTerminalTab);
            const directConfig = {
                state_tracker: {
                    draft: settings.stateTrackerDirectPrompt || '',
                    lookback: settings.directPromptContext ?? 5,
                    lookbackMax: 50,
                    lookbackMin: 0,
                    placeholder: 'Instruir al modelo del rastreador… (Enter para enviar, Shift+Enter para nueva línea)',
                },
                lorebook_agent: {
                    draft: settings.routerDirectPrompt || '',
                    lookback: settings.routerDirectLookback || 10,
                    lookbackMax: 100,
                    lookbackMin: 1,
                    placeholder: 'Instruir al Agente de Lorebook… (Enter para enviar, Shift+Enter para nueva línea)',
                },
                map_updater: {
                    draft: settings.mapUpdaterDirectPrompt || '',
                    lookback: settings.mapUpdaterDirectLookback ?? 10,
                    lookbackMax: 100,
                    lookbackMin: 0,
                    placeholder: 'Instruir al Actualizador de Mapas para el mapa activo… (Enter para enviar, Shift+Enter para nueva línea)',
                },
                map_evolution: {
                    draft: settings.mapEvolutionDirectPrompt || '',
                    lookback: settings.mapEvolutionDirectLookback ?? 10,
                    lookbackMax: 100,
                    lookbackMin: 0,
                    placeholder: 'Instruir a la Evolución de Mapas… (Enter para enviar, Shift+Enter para nueva línea)',
                },
                map_architect: {
                    draft: settings.mapArchitectDirectPrompt || '',
                    lookback: settings.mapArchitectDirectLookback ?? 10,
                    lookbackMax: 100,
                    lookbackMin: 0,
                    placeholder: 'Instruir al Arquitecto de Mapas para el lugar actual… (Enter para enviar, Shift+Enter para nueva línea)',
                },
            };
            const tabButtons = AGENT_TERMINAL_TABS.map(tab => {
                const isActive = tab.id === activeTab;
                return `<button type="button" class="rt-agent-view-mode-btn rt-agent-terminal-tab-btn${isActive ? ' rt-agent-view-mode-btn-active' : ''}" data-terminal-tab="${tab.id}" role="tab" aria-selected="${isActive ? 'true' : 'false'}">${tab.label}</button>`;
            }).join('');
            const panes = AGENT_TERMINAL_TABS.map(tab => {
                const isActive = tab.id === activeTab;
                const cfg = directConfig[tab.id] || { draft: '', lookback: 10, lookbackMax: 100, lookbackMin: 0, placeholder: 'Instruir…' };
                return `<div id="rt-agent-terminal-${tab.id}" class="rt-agent-terminal-pane${isActive ? ' rt-agent-terminal-pane-active' : ''}">
                            <div class="rt-agent-terminal-shell">
                                 <div class="rt-agent-terminal-feed"></div>
                                 <div class="rt-agent-terminal-direct-bar">
                                     <span class="rt-agent-terminal-direct-prompt" aria-hidden="true">$</span>
                                     <textarea class="rt-agent-terminal-direct-input" id="rt-terminal-direct-${tab.id}" rows="1" data-terminal-tab="${tab.id}" placeholder="${cfg.placeholder}">${cfg.draft}</textarea>
                                     <div class="rt-agent-terminal-direct-actions">
                                         <label class="rt-lookback-field rt-agent-terminal-direct-lookback-label" title="Retroceso de mensajes recientes para esta ejecución directa">
                                             <span class="rt-lookback-field-label rt-agent-terminal-direct-lookback-text">Retroceso:</span>
                                             <input type="text" inputmode="numeric" pattern="[0-9]*" class="rt-lookback-field-input rt-agent-terminal-direct-lookback" id="rt-terminal-direct-lookback-${tab.id}" data-terminal-tab="${tab.id}" min="${cfg.lookbackMin}" max="${cfg.lookbackMax}" value="${cfg.lookback}">
                                         </label>
                                         <button type="button" class="rt-agent-terminal-direct-run" data-terminal-tab="${tab.id}" title="Ejecutar comando">↵</button>
                                     </div>
                                 </div>
                            </div>
                        </div>`;
            }).join('');
            return `
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 5px;">
                            <div class="rt-agent-view-mode-switch rt-agent-terminal-tabs" id="rt-agent-terminal-tabs" role="tablist" aria-label="Terminal / Prompt Directo">${tabButtons}</div>
                            <button id="rt-agent-terminal-clear" style="background: transparent; border: none; color: #ff5555; font-size: 0.692em; cursor: pointer; opacity: 0.7; flex-shrink: 0;">Limpiar</button>
                        </div>
                        <div id="rt-agent-terminal-panes">${panes}</div>`;
        })()}

                        <div id="rt-agent-terminal-log-history" style="display: ${resolveActiveTerminalTab(settings.agentTerminalTab) === 'lorebook_agent' ? 'block' : 'none'};">
                        <hr style="border-color: rgba(255,255,255,0.05); margin: 10px 0;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                            <div style="font-weight: bold; opacity: 0.8; font-size: 0.846em;">Historial de Registro del Agente:</div>
                            <button id="rt-agent-router-log-clear" style="background: transparent; border: none; color: #ff5555; font-size: 0.692em; cursor: pointer; opacity: 0.7;">Limpiar</button>
                        </div>
                        <div id="rt-agent-router-log" style="display: flex; flex-direction: column; gap: 5px; margin-bottom: 15px; max-height: 150px; overflow-y: auto;">
                        </div>
                        </div>
                    </div>

                    <!-- Map Evolution Collapsible Header -->
                    <div id="rt-agent-map-evo-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; cursor: pointer; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.08); user-select: none; flex-shrink: 0;">
                        <div style="font-weight: bold; font-size: 0.846em; display: flex; align-items: center; gap: 6px; color: var(--rt-text-muted);">
                            <i class="fa-solid ${settings.agentMapEvolutionOpen ? 'fa-chevron-down' : 'fa-chevron-right'}" id="rt-agent-map-evo-toggle-icon"></i>
                            🗺️ Evolución de Mapas
                        </div>
                        <span id="rt-agent-map-evo-enabled-badge" style="font-size:0.692em; padding:1px 7px; border-radius:10px; font-weight:bold; cursor:pointer; user-select:none; ${settings.mapEvolutionEnabled !== false ? 'background:rgba(52,168,83,0.18); color:#34a853; border:1px solid rgba(52,168,83,0.3);' : 'background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.35); border:1px solid rgba(255,255,255,0.1);'}" title="Haz clic para activar/desactivar la Evolución de Mapas">${settings.mapEvolutionEnabled !== false ? 'ACTIVADO' : 'DESACTIVADO'}</span>
                    </div>

                    <!-- Map Evolution Drawer -->
                    <div id="rt-agent-map-evo-drawer" style="display: ${settings.agentMapEvolutionOpen ? 'block' : 'none'}; margin-bottom: 10px; flex-shrink: 0;">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:8px;">
                            <div style="background:var(--rt-card-bg); border:var(--rt-border); border-radius:4px; padding:5px 8px;">
                                <div style="font-size:0.692em; opacity:0.5; color:var(--rt-text-muted); margin-bottom:2px;">Última evolución</div>
                                <div id="rt-agent-map-evo-last-fired" style="font-size:0.769em; color:var(--rt-text);">—</div>
                            </div>
                            <div style="background:var(--rt-card-bg); border:var(--rt-border); border-radius:4px; padding:5px 8px;">
                                <div style="font-size:0.692em; opacity:0.5; color:var(--rt-text-muted); margin-bottom:2px;">Próxima evolución</div>
                                <div id="rt-agent-map-evo-next-fire" style="font-size:0.769em; color:var(--rt-text);">—</div>
                            </div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;">
                            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                <span style="font-size:0.769em; opacity:0.7; white-space:nowrap;">Otros mapas:</span>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-map-evo-interval" value="${settings.mapEvolutionIntervalHours ?? 12}" style="width:50px; background:var(--rt-card-bg); color:var(--rt-text); border:var(--rt-border); border-radius:3px; text-align:center; font-size:0.769em; padding:2px;" title="Intervalo para lugares mapeados donde el grupo no se encuentra.">
                                <span style="font-size:0.769em; opacity:0.5;">h</span>
                                <span style="font-size:0.769em; opacity:0.7; white-space:nowrap;">Mapa actual:</span>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-map-evo-onsite-interval" value="${settings.mapEvolutionOnSiteIntervalHours ?? 1}" style="width:42px; background:var(--rt-card-bg); color:var(--rt-text); border:var(--rt-border); border-radius:3px; text-align:center; font-size:0.769em; padding:2px;" title="Horas de intervalo para el mapa actual. Usa 0 con minutos no nulos para intervalos menores a una hora.">
                                <span style="font-size:0.769em; opacity:0.5;">h</span>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-map-evo-onsite-minutes" value="${settings.mapEvolutionOnSiteIntervalMinutes ?? 0}" style="width:42px; background:var(--rt-card-bg); color:var(--rt-text); border:var(--rt-border); border-radius:3px; text-align:center; font-size:0.769em; padding:2px;" title="Minutos adicionales de intervalo para el mapa actual (0–59). 0h 0m omite los ciclos automáticos en el mapa actual.">
                                <span style="font-size:0.769em; opacity:0.5;">m en el mundo</span>
                            </div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;">
                            <label style="font-size:0.769em; opacity:0.7; display:flex; flex-direction:column; gap:3px;">
                                Mapas por ciclo de intervalo
                                <select id="rt-agent-map-evo-tick-scope" style="width:100%; background:var(--rt-card-bg); color:var(--rt-text); border:var(--rt-border); border-radius:3px; font-size:0.769em; padding:3px 4px;">
                                    <option value="active"${(settings.mapEvolutionTickScope || 'all') === 'active' ? ' selected' : ''}>Solo mapa actual</option>
                                    <option value="count"${settings.mapEvolutionTickScope === 'count' ? ' selected' : ''}>N mapas de cada lugar mapeado</option>
                                    <option value="all"${(settings.mapEvolutionTickScope || 'all') === 'all' ? ' selected' : ''}>Todos los lugares mapeados pendientes</option>
                                    <option value="selected"${settings.mapEvolutionTickScope === 'selected' ? ' selected' : ''}>Mapas seleccionados</option>
                                </select>
                            </label>
                            <div id="rt-agent-map-evo-n-row" style="display:${(settings.mapEvolutionTickScope === 'count' || settings.mapEvolutionTickScope === 'selected') ? 'flex' : 'none'}; align-items:center; gap:8px; flex-wrap:wrap;">
                                <label style="font-size:0.769em; opacity:0.7; display:flex; align-items:center; gap:5px;">
                                    Cuántos
                                    <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-map-evo-tick-count" value="${settings.mapEvolutionTickCount ?? 1}" style="width:44px; background:var(--rt-card-bg); color:var(--rt-text); border:var(--rt-border); border-radius:3px; text-align:center; font-size:0.769em; padding:2px;" title="0 = todos los mapas pendientes del grupo">
                                </label>
                                <label style="font-size:0.769em; opacity:0.7; display:flex; align-items:center; gap:5px; cursor:pointer; user-select:none;">
                                    <input type="checkbox" id="rt-agent-map-evo-tick-randomize" ${settings.mapEvolutionTickRandomize !== false ? 'checked' : ''} style="margin:0; cursor:pointer;">
                                    Aleatorizar mapas pendientes
                                </label>
                            </div>
                            <div id="rt-agent-map-evo-selected-hint" style="display:${settings.mapEvolutionTickScope === 'selected' ? 'block' : 'none'}; font-size:0.692em; opacity:0.55; line-height:1.35;">
                                Los mapas seleccionados usan la lista en Ajustes → Mapas Persistentes → Evolución de Mapas.
                            </div>
                        </div>
                        <button id="rt-agent-map-evo-fire-now" style="width:100%; background:rgba(156,39,176,0.15); border:1px solid rgba(156,39,176,0.3); color:#ce93d8; border-radius:4px; padding:5px; font-size:0.769em; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px;">
                            <i class="fa-solid fa-map-location-dot"></i> Evolucionar Ahora
                        </button>
                        <button id="rt-agent-map-evo-reset-timeline" title="Borra las marcas de tiempo de última evolución por lugar para que la Evolución de Mapas empiece de nuevo" style="width:100%; background:rgba(234,67,53,0.1); border:1px solid rgba(234,67,53,0.25); color:rgba(234,67,53,0.75); border-radius:4px; padding:4px; font-size:0.692em; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; margin-top:5px;">
                            <i class="fa-solid fa-clock-rotate-left"></i> Restablecer Cronología
                        </button>
                        <button id="rt-agent-map-evo-testing-ground" title="Avanzar tiempo, generar entidades y ejecutar ciclos de evolución sin jugar" style="width:100%; background:rgba(125,211,252,0.1); border:1px solid rgba(125,211,252,0.28); color:#7dd3fc; border-radius:4px; padding:4px; font-size:0.692em; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; margin-top:5px;">
                            <i class="fa-solid fa-flask"></i> Campo de Pruebas
                        </button>
                    </div>

                    <!-- World Progression Collapsible Header -->
                    <div id="rt-agent-world-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; cursor: pointer; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.08); user-select: none; flex-shrink: 0;">
                        <div style="font-weight: bold; font-size: 0.846em; display: flex; align-items: center; gap: 6px; color: var(--rt-text-muted);">
                            <i class="fa-solid ${settings.agentWorldOpen ? 'fa-chevron-down' : 'fa-chevron-right'}" id="rt-agent-world-toggle-icon"></i>
                            🌍 Progresión del Mundo
                        </div>
                        <span id="rt-agent-world-enabled-badge" style="font-size:0.692em; padding:1px 7px; border-radius:10px; font-weight:bold; cursor:pointer; user-select:none; ${settings.worldProgressionEnabled ? 'background:rgba(52,168,83,0.18); color:#34a853; border:1px solid rgba(52,168,83,0.3);' : 'background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.35); border:1px solid rgba(255,255,255,0.1);'}" title="Haz clic para activar/desactivar la Progresión del Mundo">${settings.worldProgressionEnabled ? 'ACTIVADO' : 'DESACTIVADO'}</span>
                    </div>

                    <!-- World Progression Drawer -->
                    <div id="rt-agent-world-drawer" style="display: ${settings.agentWorldOpen ? 'block' : 'none'}; margin-bottom: 10px; flex-shrink: 0;">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:8px;">
                            <div style="background:var(--rt-card-bg); border:var(--rt-border); border-radius:4px; padding:5px 8px;">
                                <div style="font-size:0.692em; opacity:0.5; color:var(--rt-text-muted); margin-bottom:2px;">Última ejecución</div>
                                <div id="rt-agent-world-last-fired" style="font-size:0.769em; color:var(--rt-text);">—</div>
                            </div>
                            <div style="background:var(--rt-card-bg); border:var(--rt-border); border-radius:4px; padding:5px 8px;">
                                <div style="font-size:0.692em; opacity:0.5; color:var(--rt-text-muted); margin-bottom:2px;">Próxima ejecución</div>
                                <div id="rt-agent-world-next-fire" style="font-size:0.769em; color:var(--rt-text);">—</div>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
                            <span style="font-size:0.769em; opacity:0.7; white-space:nowrap;">Intervalo:</span>
                            <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-world-interval" value="${settings.worldProgressionIntervalHours || 24}" style="width:50px; background:var(--rt-card-bg); color:var(--rt-text); border:var(--rt-border); border-radius:3px; text-align:center; font-size:0.769em; padding:2px;">
                            <span style="font-size:0.769em; opacity:0.5;">horas en el mundo</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
                            <span style="font-size:0.769em; opacity:0.7; white-space:nowrap;">Ubicaciones:</span>
                            <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-world-locations" value="${settings.worldProgressionLocationsPerReport ?? 3}" style="width:50px; background:var(--rt-card-bg); color:var(--rt-text); border:var(--rt-border); border-radius:3px; text-align:center; font-size:0.769em; padding:2px;" title="Cuántos expedientes de ubicación reciben su propia sección en cada informe.">
                            <span style="font-size:0.769em; opacity:0.5;">por informe</span>
                        </div>
                        <button id="rt-agent-world-fire-now" style="width:100%; background:rgba(52,168,83,0.15); border:1px solid rgba(52,168,83,0.3); color:#34a853; border-radius:4px; padding:5px; font-size:0.769em; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px;">
                            <i class="fa-solid fa-globe"></i> Ejecutar Ahora
                        </button>
                        <button id="rt-agent-world-fire-extra" style="width:100%; background:rgba(0,180,216,0.15); border:1px solid rgba(0,180,216,0.3); color:#00b4d8; border-radius:4px; padding:5px; font-size:0.769em; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; margin-top:5px;">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> Ejecutar con Instrucciones Adicionales
                        </button>
                        <button id="rt-agent-world-reset-timeline" title="Borra la marca de tiempo de última ejecución para que la Progresión del Mundo empiece de nuevo" style="width:100%; background:rgba(234,67,53,0.1); border:1px solid rgba(234,67,53,0.25); color:rgba(234,67,53,0.75); border-radius:4px; padding:4px; font-size:0.692em; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; margin-top:5px;">
                            <i class="fa-solid fa-clock-rotate-left"></i> Restablecer Cronología
                        </button>
                        <button id="rt-agent-world-purge-history" title="Elimina todos los informes de Progresión del Mundo y datos de esqueletos para este prefijo de campaña y restablece los temporizadores de este chat" style="width:100%; background:rgba(234,67,53,0.14); border:1px solid rgba(234,67,53,0.35); color:rgba(234,67,53,0.9); border-radius:4px; padding:4px; font-size:0.692em; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; margin-top:5px;">
                            <i class="fa-solid fa-trash-can"></i> Purgar Historial del Mundo para este Chat
                        </button>
                    </div>

                    <div id="rt-agent-keys-toggle" style="display: flex; align-items: center; gap: 6px; margin-bottom: 5px; flex-shrink: 0; cursor: pointer; user-select: none;">
                        <div style="font-weight: bold; opacity: 0.8; font-size: 0.846em; display: flex; align-items: center; gap: 4px;">
                            <span id="rt-agent-keys-chevron" style="display: inline-block; width: 10px; transition: transform 0.2s; font-size: 0.9em; opacity: 0.7;"><i class="fa-solid fa-chevron-down"></i></span>
                            Claves de Lore Activas:
                            <span id="rt-agent-active-tokens" style="font-weight: normal; opacity: 0.55; color: var(--rt-text-muted); font-size: 0.95em;">(0t)</span>
                        </div>
                        <button id="rt-agent-keys-refresh" title="Actualizar claves activas desde disco" style="background: none; border: none; color: var(--rt-accent); font-size: 0.769em; cursor: pointer; opacity: 0.6; padding: 0;" ><i class="fa-solid fa-arrows-rotate"></i></button>
                    </div>
                    <div id="rt-agent-router-active-keys" style="margin-bottom: 10px; display: flex; flex-wrap: wrap; gap: 4px; min-height: 24px; flex-shrink: 0;">
                    </div>

                    <div id="rt-agent-campaign-section" style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px; display: flex; flex-direction: column; flex-shrink: 0;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-shrink: 0; gap: 8px;">
                            <div id="rt-agent-campaign-header-title" style="font-weight: bold; opacity: 0.8; font-size: 0.846em; flex: 1; min-width: 0;${settings.locationImages ? ' display: none;' : ''}">REGISTROS DE CAMPAÑA</div>
                            <div class="rt-agent-view-mode-switch" id="rt-agent-view-mode-switch" role="tablist" aria-label="Registros de Campaña o Visual/Mapa"${settings.locationImages ? '' : ' style="display: none;"'}>
                                <button type="button" class="rt-agent-view-mode-btn${settings.agentImmersionMode ? '' : ' rt-agent-view-mode-btn-active'}" id="rt-agent-view-mode-records" role="tab" aria-selected="${settings.agentImmersionMode ? 'false' : 'true'}">Registros de Campaña</button>
                                <button type="button" class="rt-agent-view-mode-btn rt-agent-view-mode-btn-visualization${settings.agentImmersionMode ? ' rt-agent-view-mode-btn-active' : ''}" id="rt-agent-view-mode-visualization" role="tab" aria-selected="${settings.agentImmersionMode ? 'true' : 'false'}">
                                    <span class="rt-agent-view-mode-glow" aria-hidden="true"></span>
                                    <span class="rt-agent-view-mode-label">Visual / Mapa</span>
                                </button>
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                                <button class="rpg-tracker-icon-btn" id="rt-agent-activate-books" title="Activar lorebooks de campaña ahora" style="font-size: 0.769em; opacity: 0.5;"><i class="fa-solid fa-book-open"></i></button>
                                <button class="rpg-tracker-icon-btn" id="rt-agent-manifest-refresh" title="Actualizar Manifiesto" style="font-size: 0.769em; opacity: 0.5;"><i class="fa-solid fa-arrows-rotate"></i></button>
                            </div>
                        </div>
                        <div id="rt-agent-immersion-view" style="display: ${settings.agentImmersionMode ? 'flex' : 'none'}; flex-direction: column; flex-shrink: 0;"></div>
                        <div id="rt-agent-manifest-list" style="display: ${settings.agentImmersionMode ? 'none' : 'flex'}; flex-direction: column; gap: 6px; flex-shrink: 0;">
                            <div style="text-align: center; opacity: 0.5; font-size: 0.769em; padding: 10px;">Haz clic en actualizar para cargar el lore...</div>
                        </div>
                    </div>
                </div>
                <div class="rpg-tracker-footer" id="rt-agent-footer">
                    <div class="rt-footer-starfield" aria-hidden="true"></div>
                    <div class="rt-agent-footer-left">
                        <div class="rpg-tracker-nav">
                            <button class="rpg-tracker-nav-btn" id="rt-agent-nav-back" title="Deshacer último pase de lorebook">←</button>
                            <span class="rpg-tracker-nav-label" id="rt-agent-nav-label">[ EN VIVO ]</span>
                            <button class="rpg-tracker-nav-btn" id="rt-agent-nav-fwd" title="Rehacer pase de lorebook">→</button>
                        </div>
                    </div>
                    <div class="rt-agent-footer-center">
                        <div id="rt-agent-footer-location" class="rt-footer-location-text" title="Ubicación Actual (Principal, Secundaria)"></div>
                    </div>
                    <div class="rt-agent-footer-right">
                        <div id="rt-agent-last-run"></div>
                    </div>
                </div>
                <div class="rt-resizer-br" id="rt-agent-resizer-br" title="Redimensionar desde abajo-derecha"></div>
                <div class="rt-resizer-bl" id="rt-agent-resizer-bl" title="Redimensionar desde abajo-izquierda"></div>
            </div>
                </div>
            </div>
            <div class="rpg-tracker-delta-resize-handle" id="rpg-tracker-delta-handle" style="display:none;"></div>
            <div class="rpg-tracker-delta-panel" id="rpg-tracker-delta" style="display:none;">
                <div class="rpg-tracker-delta-toolbar">
                    <span class="rpg-tracker-delta-title">Registro de Cambios</span>
                    <button class="rpg-tracker-icon-btn" id="rpg-tracker-delta-clear" title="Limpiar registro">✕</button>
                </div>
                <div id="rpg-tracker-delta-content">${settings.lastDelta || '<span class="delta-empty">Sin cambios aún.</span>'}</div>
            </div>
            <div class="rpg-tracker-prompt-bar" id="rpg-tracker-prompt-bar" style="display:none;">
                <textarea class="rpg-tracker-prompt-input" id="rpg-tracker-prompt-input" rows="2" placeholder="Instruir al modelo del rastreador… (Enter para enviar, Shift+Enter para nueva línea)"></textarea>
                <div class="rpg-tracker-prompt-actions">
                    <label class="rt-lookback-field rt-prompt-ctx-control" title="Retroceso: número de mensajes recientes a incluir">
                        <span class="rt-lookback-field-label">Retroceso:</span>
                        <input type="text" inputmode="numeric" pattern="[0-9]*" class="rt-lookback-field-input" id="rt-prompt-context-val" value="${settings.directPromptContext || 5}" min="0" max="50">
                    </label>
                    <button class="rpg-tracker-prompt-send" id="rpg-tracker-prompt-send" title="Enviar instrucción">▶</button>
                </div>
            </div>
            <div class="rpg-tracker-footer" id="rt-main-footer">
                <div class="rt-footer-starfield" aria-hidden="true"></div>
                <div class="rt-mobile-top-row">
                    <button class="rt-footer-toggle-btn" id="rt-footer-expand-btn" title="Alternar panel de ajustes"><i class="fa-solid fa-chevron-up"></i></button>
                    <div class="rpg-tracker-nav">
                        <button class="rpg-tracker-nav-btn" id="rpg-tracker-nav-back" title="Ver captura anterior">←</button>
                        <span class="rpg-tracker-nav-label" id="rpg-tracker-nav-label">En vivo</span>
                        <button class="rpg-tracker-nav-btn" id="rpg-tracker-nav-fwd" title="Ver siguiente captura">→</button>
                    </div>
                </div>
                <div class="flex-container gap-1 alignitemscenter rt-rng-footer-group" style="display:none;">
                    <!-- Removed inline RNG toggles, now located in extension settings -->
                </div>
                <div class="rt-footer-center-group" id="rt-footer-center-group" style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
                    <div id="rt-footer-time" style="display: none; font-size: 0.769em; color: var(--rt-accent); white-space: nowrap; flex-shrink: 0; opacity: 0.9; cursor: help;" title="Hora actual en el mundo"></div>
                    <div id="rt-footer-location" class="rt-footer-location-text" title="Ubicación Actual (Principal, Secundaria)"></div>
                </div>
                <div class="flex-container gap-1 alignitemscenter rt-utility-footer-group">
                    <span id="rpg-tracker-count">~${Math.round(settings.currentMemo.length / 2.62)} tokens</span>
                    <button class="rpg-tracker-nav-btn" id="rpg-tracker-delta-btn" title="Alternar registro de cambios" style="padding: 1px 5px; font-size: 0.692em; opacity: 0.8; margin-left: 5px;">δ</button>
                    <button class="rpg-tracker-nav-btn" id="rpg-tracker-memo-clear" style="padding: 1px 5px; font-size: 0.692em; opacity: 0.8; margin-left: 5px;" title="Limpiar memorando e historial">LIMPIAR</button>
                </div>
                <button class="rpg-tracker-icon-btn rt-footer-prompt-btn" id="rpg-tracker-prompt-btn" title="Alternar prompt directo">💬</button>
            </div>
        `;
}
