import { t } from '../../i18n/index.js';

/** Produces the static Tracker and Lorebook Agent panel structure. */
export function buildPanelMarkup({ settings, agentPanelCollapsedClass }) {
    return `
            <div class="rt-resizer-tr" id="rt-resizer-tr" title="Redimensionar desde arriba a la derecha"></div>
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
                    <button type="button" class="rpg-tracker-icon-btn" id="rpg-tracker-settings-btn" title="Open Settings"><i class="fa-solid fa-wrench" aria-hidden="true"></i></button>
                    <button class="rpg-tracker-icon-btn rt-tutorial-help-btn" id="rpg-tracker-help-btn" title="CHAT">CHAT</button>
                    <button class="rpg-tracker-icon-btn" id="rpg-tracker-view-btn" title="Alternar vista renderizada">⊞</button>
                    <button class="rpg-tracker-icon-btn" id="rpg-tracker-enable-btn" title="${settings.enabled ? 'Desactivar Rastreador de Estado' : 'Activar Rastreador de Estado'}" style="${settings.enabled ? '' : 'opacity:0.4;'}" >⏻</button>
                    <button class="rpg-tracker-icon-btn" id="rpg-tracker-update-btn" title="Actualizar Estado Ahora">🔄</button>
                    <button class="rpg-tracker-icon-btn" id="rpg-tracker-pause-btn" title="Pausar Rastreador">⏸</button>
                    <button class="rpg-tracker-icon-btn" id="rpg-tracker-portraits-menu-btn" title="Acciones de Retrato IA">🖼️</button>
                    <button class="rpg-tracker-icon-btn rt-overflow-trigger" id="rt-overflow-btn" title="Más acciones">⋯</button>
                    <button class="rpg-tracker-icon-btn" id="rpg-tracker-collapse-btn" title="Plegar Panel"><i class="fa-solid ${settings.trackerCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"></i></button>
                    <button class="rpg-tracker-icon-btn" id="rpg-tracker-close-btn" title="Ocultar panel">✕</button>
                </div>
                </div>
                <div class="rt-header-face rt-header-face-inactive" id="rt-header-face-agent">
                    <div class="rpg-tracker-header-left">
                        <i class="fa-solid fa-robot"></i> <span>${t('agent.headerTitle', 'Agente de Lorebook: Bibliotecario Autónomo')}</span>
                    </div>
                    <div class="rpg-tracker-header-center" id="rt-agent-pause-banner" style="color:#ffa500; font-size:0.7em; font-weight:bold; letter-spacing:0.04em;">${settings.routerPaused ? 'AGENTE EN PAUSA' : ''}</div>
                    <div class="rpg-tracker-header-right">
                        <div id="rt-research-menu-wrap" style="position:relative; display:inline-flex;">
                            <button class="rpg-tracker-icon-btn" id="rt-agent-router-manual-run" title="Ejecutar Investigación Ahora — Agente de Lorebook, Actualizador de Mapas o Evolución de Mapas" style="color: var(--rt-accent);"><i class="fa-solid fa-play"></i></button>
                            <div id="rt-research-dropdown" class="rt-update-menu rt-research-dropdown" style="display:none;">
                                <div class="rt-menu-item" id="rt-research-lorebook"><b>Agente de Lorebook</b><small>PNJs, ubicaciones, relaciones</small></div>
                                <div class="rt-menu-item" id="rt-research-map-updater"><b>Actualizador de Mapas</b><small>Ocupación de mazmorras y pueblos</small></div>
                                <div class="rt-menu-item" id="rt-research-map-evolution"><b>Evolución de Mapas</b><small>Elegir mapas a evolucionar ahora</small></div>
                            </div>
                        </div>
                        <button class="rpg-tracker-stop-btn" id="rt-agent-stop-btn" title="Detener Agente" style="display:none;">■</button>
                        <button class="rpg-tracker-icon-btn" id="rt-agent-router-full-audit-panel" title="Ejecutar Auditoría Completa (Por fragmentos)" style="color: #ff5555;"><i class="fa-solid fa-book-journal-whills"></i></button>
                         <div id="rt-cleanup-menu-wrap" style="position:relative; display:inline-flex;">
                             <button class="rpg-tracker-icon-btn" id="rt-agent-router-cleanup" title="Menú de Limpieza" style="color: #e67e22;"><i class="fa-solid fa-broom"></i></button>
                             <div id="rt-cleanup-dropdown" class="rt-cleanup-dropdown" style="display:none;">
                                 <button id="rt-cleanup-run-btn" style="display:block; width:100%; text-align:left; padding:7px 14px; background:none; border:none; color:var(--rt-text,#e0e0e0); font-size:12px; cursor:pointer; white-space:nowrap;">🧹 Ejecutar Limpieza</button>
                                 <div style="height:1px; background:rgba(255,255,255,0.06); margin:2px 0;"></div>
                                 <button id="rt-cleanup-settings-toggle" style="display:block; width:100%; text-align:left; padding:7px 14px; background:none; border:none; color:var(--rt-text,#e0e0e0); font-size:12px; cursor:pointer; white-space:nowrap;">⚙ Ajustes de Limpieza</button>
                                 <div id="rt-cleanup-settings-panel" style="display:none; padding:8px 12px; border-top:1px solid rgba(255,255,255,0.07); margin-top:2px;">
                                     <label style="display:flex; align-items:center; gap:6px; font-size:10px; opacity:0.75; margin-bottom:8px; cursor:pointer; user-select:none;">
                                         <input id="rt-cleanup-use-threshold-chk" type="checkbox" ${settings.routerCleanupUseThreshold !== false ? 'checked' : ''} style="margin:0; cursor:pointer; accent-color:#e67e22;">
                                         Usar Umbral de Tokens
                                     </label>
                                     <div id="rt-cleanup-threshold-row" style="transition:opacity 0.15s; opacity:${settings.routerCleanupUseThreshold !== false ? '1' : '0.35'}; pointer-events:${settings.routerCleanupUseThreshold !== false ? 'auto' : 'none'};">
                                         <label style="font-size:10px; opacity:0.6; display:block; margin-bottom:2px;">Umbral de Tokens</label>
                                         <input id="rt-cleanup-threshold-inp" type="text" inputmode="numeric" pattern="[0-9]*" min="50" max="5000" step="50" value="${settings.routerCleanupTokenThreshold || 300}" style="width:100%; background:rgba(0,0,0,0.35); color:var(--rt-text,#e0e0e0); border:1px solid rgba(255,255,255,0.15); border-radius:4px; padding:3px 6px; font-size:11px; box-sizing:border-box; margin-bottom:8px;">
                                     </div>
                                     <label style="font-size:10px; opacity:0.6; display:block; margin-bottom:2px;">Limpieza Automática Cada N Turnos <span style="opacity:0.45;">(0 = desactivado)</span></label>
                                     <input id="rt-cleanup-every-inp" type="text" inputmode="numeric" pattern="[0-9]*" min="0" max="100" step="1" value="${settings.routerCleanupEvery || 0}" style="width:100%; background:rgba(0,0,0,0.35); color:var(--rt-text,#e0e0e0); border:1px solid rgba(255,255,255,0.15); border-radius:4px; padding:3px 6px; font-size:11px; box-sizing:border-box;">
                                 </div>
                             </div>
                         </div>
                        <button class="rpg-tracker-icon-btn" id="rt-agent-router-enable-btn" title="${settings.routerEnabled ? 'Desactivar Agente de Lorebook' : 'Activar Agente de Lorebook'}" style="${settings.routerEnabled ? '' : 'opacity:0.35;'}">⏻</button>
                        <button class="rpg-tracker-icon-btn" id="rt-agent-router-pause-btn" title="${settings.routerPaused ? 'Reanudar Agente (ejecuciones automáticas pausadas)' : 'Pausar Agente (omitir ejecuciones automáticas)'}" style="${settings.routerPaused ? 'color:#ffa500;' : ''}">${settings.routerPaused ? '▶' : '⏸'}</button>
                        <button class="rpg-tracker-icon-btn" id="rt-agent-router-detach" title="Desacoplar Agente de Lorebook">⧉</button>
                        <button class="rpg-tracker-icon-btn" id="rt-agent-router-collapse-btn" title="Plegar Panel"><i class="fa-solid ${settings.agentCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"></i></button>
                        <button class="rpg-tracker-icon-btn" id="rpg-tracker-agent-close" title="Ocultar">✕</button>
                    </div>
                </div>
            </div>
            <div class="rpg-tracker-content">
                <div class="rt-panel-mode-switch-wrap" id="rt-panel-mode-switch-wrap">
                    <div class="rt-adventure-companion-header" id="rt-adventure-companion-header" style="display:none;" aria-hidden="true">
                        <i class="fa-solid fa-compass" aria-hidden="true"></i>
                        <span>Adventure Companion</span>
                    </div>
                    <div class="rt-agent-view-mode-switch rt-panel-mode-switch" id="rt-panel-mode-switch" role="tablist" aria-label="Panel content mode">
                        <button type="button" id="rt-panel-mode-tracker" class="rt-agent-view-mode-btn rt-agent-view-mode-btn-active" role="tab" aria-selected="true">${t('hud.stateTracker', 'State Tracker')}</button>
                        <button type="button" id="rt-panel-mode-agent" class="rt-agent-view-mode-btn" role="tab" aria-selected="false">${t('hud.lorebookAgent', 'Lorebook Agent')}</button>
                    </div>
                </div>
                <div class="rt-panel-mode-pane" id="rt-panel-tracker-pane">
                <textarea class="rpg-tracker-memo-area" id="rpg-tracker-memo">${settings.currentMemo}</textarea>
                <div class="rpg-tracker-render-view" id="rpg-tracker-render" style="display:none;"></div>
                <div class="rt-tutorial-view" id="rt-tutorial-view" style="display:none;" aria-label="CHAT"></div>
                <div class="rt-bottom-xp-bar" id="rt-bottom-xp-bar" style="display:none;" aria-label="Experience progress"></div>
                </div>
                <div class="rt-panel-mode-pane" id="rt-panel-agent-pane" style="display:none;">
            <div class="rpg-tracker-panel rpg-tracker-agent-panel rt-agent-integrated ${agentPanelCollapsedClass}${settings.trackerTheme || 'rt-theme-native'}" id="rpg-tracker-agent">
                <div class="rpg-tracker-content" style="flex: 1; min-height: 0; resize: none; padding: 10px; color: var(--rt-text); display: flex; flex-direction: column;">
                    <!-- Quick Settings Collapsible Header -->
                    <div id="rt-agent-settings-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; cursor: pointer; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.08); user-select: none; flex-shrink: 0;">
                        <div style="font-weight: bold; font-size: 0.846em; display: flex; align-items: center; gap: 6px; color: var(--rt-text-muted);">
                            <i class="fa-solid ${settings.agentSettingsOpen !== false ? 'fa-chevron-down' : 'fa-chevron-right'}" id="rt-agent-settings-toggle-icon"></i> ${t('agent.quickSettings', 'Quick Settings')}
                        </div>
                        <button id="rt-agent-help-btn" style="background: var(--rt-accent-bg); border: 1px solid var(--rt-accent-dim); color: var(--rt-accent); border-radius: 12px; width: 18px; height: 18px; font-size: 0.769em; cursor: pointer; display: flex; align-items: center; justify-content: center; margin: 0; flex-shrink: 0;" title="¿Qué es el Agente de Lorebook?">?</button>
                    </div>

                    <!-- Quick Settings Drawer -->
                    <div id="rt-agent-settings-drawer" style="display: ${settings.agentSettingsOpen !== false ? 'block' : 'none'}; margin-bottom: 10px; flex-shrink: 0;">
                        <label style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; cursor: pointer; opacity: 0.8; font-size: 0.846em;" title="Usa etiquetas de texto simples [[NPC: Nombre | Desc]] en lugar de herramientas complejas. Mejor para modelos pequeños.">
                            ${t('agent.basicMode', 'Modo Básico (basado en etiquetas)')}
                            <input type="checkbox" id="rt-agent-router-basic" ${settings.routerBasicMode ? 'checked' : ''}>
                        </label>

                        <label style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; cursor: pointer; opacity: 0.8; font-size: 0.846em;" title="Cuando está activado, el escáner de palabras clave de la extensión se deshabilita por completo. El sistema nativo de palabras clave de SillyTavern gestiona toda la activación por palabras clave. El agente no activará ni desactivará automáticamente entradas según palabras clave.">
                            ${t('agent.nativeKeywordActivation', 'Activación Nativa por Palabras Clave')}
                            <input type="checkbox" id="rt-agent-router-native-kw" ${settings.routerNativeKeywordActivation ? 'checked' : ''}>
                        </label>

                        ${(() => {
            const mode = settings.routerLookbackSinceLastRun !== false ? 'since_last_run'
                : settings.routerLookbackSinceLastUser === true ? 'since_last_user' : 'fixed';
            return `
                        <div style="margin-bottom: 8px;">
                            <div style="font-size: 0.769em; opacity: 0.7; margin-bottom: 4px;">${t('agent.lookbackMode', 'Modo de revisión:')}</div>
                            <label style="display: flex; align-items: center; gap: 5px; margin-bottom: 4px; cursor: pointer; font-size: 0.769em; opacity: 0.85;" title="Lee todos los mensajes desde la última ejecución exitosa del agente — ideal si Ejecutar cada > 1.">
                                <input type="radio" name="rt-lookback-mode" id="rt-agent-lookback-mode-run" value="since_last_run" ${mode === 'since_last_run' ? 'checked' : ''}>
                                <span>${t('agent.sinceLastRun', 'Desde la última ejecución')}</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 5px; margin-bottom: 4px; cursor: pointer; font-size: 0.769em; opacity: 0.75;" title="Lee desde el mensaje más reciente del usuario hasta la respuesta más reciente de la IA.">
                                <input type="radio" name="rt-lookback-mode" id="rt-agent-lookback-mode-user" value="since_last_user" ${mode === 'since_last_user' ? 'checked' : ''}>
                                <span>${t('agent.sinceLastUserMsg', 'Desde el último mensaje del usuario')}</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 5px; margin-bottom: 4px; cursor: pointer; font-size: 0.769em; opacity: 0.75;" title="Lee un número fijo de turnos recientes del usuario.">
                                <input type="radio" name="rt-lookback-mode" id="rt-agent-lookback-mode-fixed" value="fixed" ${mode === 'fixed' ? 'checked' : ''}>
                                <span>${t('agent.fixedTurnCount', 'Número de turnos fijo:')}</span>
                            </label>
                            <div id="rt-agent-router-lookback-container" style="display: inline-flex; align-items: center; gap: 6px; margin-left: 20px; transition: opacity 0.2s; ${mode !== 'fixed' ? 'opacity: 0.35; pointer-events: none;' : ''}" title="Lee los últimos N turnos del usuario (incluye los mensajes de herramientas en cada turno).">
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-router-lookback" value="${settings.routerLookback || 4}" min="1" max="100" style="width: 40px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 3px; text-align: center; font-size: 0.769em; padding: 1px;">
                                <span style="font-size: 0.769em; opacity: 0.5;">msgs</span>
                            </div>
                        </div>`;
        })()}

                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                            <div style="display: flex; align-items: center; gap: 6px; flex: 1;" title="Ejecutar cada N mensajes: 1 = se ejecuta cada turno (siempre al día, pero puede generar demasiadas entradas). 3+ = se ejecuta con menos frecuencia pero ve más contexto narrativo, produciendo actualizaciones más coherentes. Las coincidencias por palabra clave se ejecutan de inmediato.">
                                <span style="font-size: 0.769em; opacity: 0.7;">${t('agent.runEvery', 'Ejecutar cada:')}</span>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-router-run-every" value="${settings.routerRunEvery || 3}" min="1" max="50" style="width: 40px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 3px; text-align: center; font-size: 0.769em; padding: 1px;">
                                <span style="font-size: 0.769em; opacity: 0.5;">msgs</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px; flex: 1;" title="Cadencia del Actualizador de Mapas al estar dentro de una mazmorra o asentamiento mapeado. Independiente del Agente de Lorebook. 1 = actualiza ocupación cada turno.">
                                <span style="font-size: 0.769em; opacity: 0.7;">Mapa cada:</span>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-map-updater-run-every" value="${settings.mapUpdaterRunEvery ?? 1}" min="1" max="50" style="width: 40px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 3px; text-align: center; font-size: 0.769em; padding: 1px;">
                                <span style="font-size: 0.769em; opacity: 0.5;">msgs</span>
                            </div>
                        </div>

                        <label style="display: flex; align-items: center; gap: 5px; margin-bottom: 10px; cursor: pointer; font-size: 0.769em; opacity: 0.75;" title="Incluye mensajes ocultos (ej. mensajes colapsados por un resumidor) en la ventana de revisión del agente.">
                            <input type="checkbox" id="rt-agent-router-include-hidden" ${settings.routerIncludeHidden ? 'checked' : ''}>
                            <span>${t('agent.includeHiddenMsgs', 'Incluir msjs ocultos (resumen)')}</span>
                        </label>

                        <label style="display: flex; align-items: center; gap: 5px; margin-bottom: 10px; cursor: pointer; font-size: 0.769em; opacity: 0.75;" title="Cuando está activado, deslizar (swipe) una respuesta que activó al agente deshace esa pasada de lorebook. Deslizar no avanza el contador de 'Ejecutar cada' en ningún caso.">
                            <input type="checkbox" id="rt-agent-router-swipe-rollback" ${settings.routerSwipeRollback !== false ? 'checked' : ''}>
                            <span>${t('agent.autoRollbackSwipe', 'Restauración automática al deslizar')}</span>
                        </label>

                        <div style="display: flex; gap: 8px; margin-bottom: 10px; align-items: flex-end;">
                            <div style="flex: 1;" title="Turnos Máximos: Cuántos bucles de Pensamiento/Acción puede realizar el agente antes de agotar el tiempo (solo Modo Avanzado).">
                                <div style="margin-bottom: 5px; opacity: 0.8; font-size: 0.846em; color: var(--rt-text-muted);">${t('agent.maxAgentTurns', 'Turnos Máximos del Agente:')}</div>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-router-max-turns" value="${settings.routerMaxTurns || 5}" style="width: 100%; background: var(--rt-card-bg); color: var(--rt-text); border: var(--rt-border); border-radius: 4px; padding: 4px; font-size: 0.846em; box-sizing: border-box;">
                            </div>
                            <div style="flex: 1;" title="Claves Activas Máximas: El número máximo de entradas de lore que el agente puede mantener en Memoria Activa. Una vez alcanzado, debe desactivar entradas antiguas para añadir nuevas.">
                                <div style="margin-bottom: 5px; opacity: 0.8; font-size: 0.846em; color: var(--rt-text-muted);">${t('agent.maxActiveKeys', 'Claves Activas Máximas:')}</div>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-router-max-activations" value="${settings.routerMaxActivations || 12}" min="1" max="20" style="width: 100%; background: var(--rt-card-bg); color: var(--rt-text); border: var(--rt-border); border-radius: 4px; padding: 4px; font-size: 0.846em; box-sizing: border-box;">
                            </div>
                            <div style="flex: 1;" title="Límite de Desbordamiento de Claves: máximo de entradas por palabras clave permitidas por encima de las Claves Activas Máximas (0 = sin límite). Cuando se supera, las más antiguas se desalojan. Ejemplo: Máximo Activo=12, Límite=6 → techo de 18 en total.">
                                <div style="margin-bottom: 5px; opacity: 0.8; font-size: 0.846em; color: var(--rt-text-muted); line-height: 1.2;">${t('agent.keywordOverflowCap', 'Límite de Desbordamiento de Claves')}<br><span style="font-size: 0.75em; opacity: 0.5; font-weight: normal;">${t('agent.noCap', '(0 = sin límite)')}</span>:</div>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-router-kw-overflow-cap" value="${settings.routerMaxKeywordOverflow ?? 6}" min="0" max="50" style="width: 100%; background: var(--rt-card-bg); color: var(--rt-text); border: var(--rt-border); border-radius: 4px; padding: 4px; font-size: 0.846em; box-sizing: border-box;">
                            </div>
                        </div>

                    </div>

                    <!-- Modular Repertoire Collapsible Header -->
                    <div id="rt-agent-modules-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; cursor: pointer; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.08); user-select: none; flex-shrink: 0;">
                        <div style="font-weight: bold; font-size: 0.846em; display: flex; align-items: center; gap: 6px; color: var(--rt-text-muted);">
                            <i class="fa-solid ${settings.agentModulesOpen !== false ? 'fa-chevron-down' : 'fa-chevron-right'}" id="rt-agent-modules-toggle-icon"></i> ${t('agent.modularRepertoire', 'Repertorio Modular (Reglas de Prompt)')}
                        </div>
                    </div>

                    <!-- Modular Repertoire Drawer -->
                    <div id="rt-agent-modules-drawer" style="display: ${settings.agentModulesOpen !== false ? 'block' : 'none'}; margin-bottom: 10px; flex-shrink: 0;">
                        <div style="margin-bottom: 5px; font-weight: bold; opacity: 0.8; font-size: 0.846em;">${t('agent.enabledModulesStock', 'Módulos Habilitados:')}</div>
                        <div id="rt-agent-stock-modules-list" style="margin-bottom: 10px;"></div>

                        <div style="margin-bottom: 5px; font-weight: bold; opacity: 0.8; font-size: 0.846em;">${t('agent.customTags', 'Etiquetas Personalizadas:')}</div>
                        <div id="rt-agent-custom-tags-list"></div>
                        <button id="rt-agent-add-custom-tag" style="width: 100%; background: #333; border: 1px solid #444; color: #ddd; font-size: 0.769em; padding: 2px; border-radius: 3px; cursor: pointer; margin-top: 4px; flex-shrink: 0;">${t('agent.addCustomTag', '+ Añadir Etiqueta Personalizada')}</button>
                    </div>

                    <!-- Console Collapsible Header -->
                    <div id="rt-agent-console-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; cursor: pointer; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.08); user-select: none; flex-shrink: 0;">
                        <div style="font-weight: bold; font-size: 0.846em; display: flex; align-items: center; gap: 6px; color: var(--rt-text-muted);">
                            <i class="fa-solid ${settings.agentConsoleOpen !== false ? 'fa-chevron-down' : 'fa-chevron-right'}" id="rt-agent-console-toggle-icon"></i> ${t('agent.console', 'Consola')}
                        </div>
                    </div>

                    <!-- Console Section Drawer -->
                    <div id="rt-agent-console-drawer" style="display: ${settings.agentConsoleOpen !== false ? 'block' : 'none'}; margin-bottom: 10px; flex-shrink: 0;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                            <div style="font-weight: bold; opacity: 0.8; font-size: 0.846em;">${t('agent.lorebookTerminal', 'Terminal del Lorebook:')}</div>
                            <button id="rt-agent-router-terminal-clear" style="background: transparent; border: none; color: #ff5555; font-size: 0.692em; cursor: pointer; opacity: 0.7;">${t('common.clear', 'Limpiar')}</button>
                        </div>
                        <div id="rt-agent-router-terminal" style="background: var(--rt-card-bg); border: var(--rt-border); border-radius: 4px; padding: 8px; min-height: 80px; max-height: 200px; overflow-y: auto; margin-bottom: 10px; font-family: var(--rt-font-mono);">
                            <div style="opacity: 0.4; font-size: 0.769em; font-style: italic; color: var(--rt-text-muted);">${t('agent.waitingForActivity', 'Esperando actividad del agente...')}</div>
                        </div>

                        <hr style="border-color: rgba(255,255,255,0.05); margin: 10px 0;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                            <div style="font-weight: bold; opacity: 0.8; font-size: 0.846em;">${t('agent.logHistory', 'Historial del Agente:')}</div>
                            <button id="rt-agent-router-log-clear" style="background: transparent; border: none; color: #ff5555; font-size: 0.692em; cursor: pointer; opacity: 0.7;">${t('common.clear', 'Limpiar')}</button>
                        </div>
                        <div id="rt-agent-router-log" style="display: flex; flex-direction: column; gap: 5px; margin-bottom: 15px; max-height: 150px; overflow-y: auto;">
                        </div>
                    </div>

                    <!-- Map Evolution Collapsible Header -->
                    <div id="rt-agent-map-evo-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; cursor: pointer; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.08); user-select: none; flex-shrink: 0;">
                        <div style="font-weight: bold; font-size: 0.846em; display: flex; align-items: center; gap: 6px; color: var(--rt-text-muted);">
                            <i class="fa-solid ${settings.agentMapEvolutionOpen ? 'fa-chevron-down' : 'fa-chevron-right'}" id="rt-agent-map-evo-toggle-icon"></i>
                            🗺️ Evolución de Mapas
                        </div>
                        <span id="rt-agent-map-evo-enabled-badge" style="font-size:0.692em; padding:1px 7px; border-radius:10px; font-weight:bold; cursor:pointer; user-select:none; ${settings.mapEvolutionEnabled !== false ? 'background:rgba(52,168,83,0.18); color:#34a853; border:1px solid rgba(52,168,83,0.3);' : 'background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.35); border:1px solid rgba(255,255,255,0.1);'}" title="Clic para alternar Evolución de Mapas">${settings.mapEvolutionEnabled !== false ? 'ON' : 'OFF'}</span>
                    </div>

                    <!-- Map Evolution Drawer -->
                    <div id="rt-agent-map-evo-drawer" style="display: ${settings.agentMapEvolutionOpen ? 'block' : 'none'}; margin-bottom: 10px; flex-shrink: 0;">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:8px;">
                            <div style="background:var(--rt-card-bg); border:var(--rt-border); border-radius:4px; padding:5px 8px;">
                                <div style="font-size:0.692em; opacity:0.5; color:var(--rt-text-muted); margin-bottom:2px;">Última evolución</div>
                                <div id="rt-agent-map-evo-last-fired" style="font-size:0.769em; color:var(--rt-text);">—</div>
                            </div>
                            <div style="background:var(--rt-card-bg); border:var(--rt-border); border-radius:4px; padding:5px 8px;">
                                <div style="font-size:0.692em; opacity:0.5; color:var(--rt-text-muted); margin-bottom:2px;">Siguiente evolución</div>
                                <div id="rt-agent-map-evo-next-fire" style="font-size:0.769em; color:var(--rt-text);">—</div>
                            </div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;">
                            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                <span style="font-size:0.769em; opacity:0.7; white-space:nowrap;">Otros mapas:</span>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-map-evo-interval" value="${settings.mapEvolutionIntervalHours ?? 8}" style="width:50px; background:var(--rt-card-bg); color:var(--rt-text); border:var(--rt-border); border-radius:3px; text-align:center; font-size:0.769em; padding:2px;" title="Intervalo para lugares mapeados donde no está el grupo.">
                                <span style="font-size:0.769em; opacity:0.7; white-space:nowrap;">Mapa actual:</span>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-map-evo-onsite-interval" value="${settings.mapEvolutionOnSiteIntervalHours ?? 8}" style="width:50px; background:var(--rt-card-bg); color:var(--rt-text); border:var(--rt-border); border-radius:3px; text-align:center; font-size:0.769em; padding:2px;" title="Intervalo para el lugar mapeado donde está el grupo. 0 omite ciclos automáticos allí. Mismo redactor de Evolución.">
                                <span style="font-size:0.769em; opacity:0.5;">horas en el mundo</span>
                            </div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;">
                            <label style="font-size:0.769em; opacity:0.7; display:flex; flex-direction:column; gap:3px;">
                                Mapas por ciclo de intervalo
                                <select id="rt-agent-map-evo-tick-scope" style="width:100%; background:var(--rt-card-bg); color:var(--rt-text); border:var(--rt-border); border-radius:3px; font-size:0.769em; padding:3px 4px;">
                                    <option value="active"${(settings.mapEvolutionTickScope || 'all') === 'active' ? ' selected' : ''}>Solo mapa actual</option>
                                    <option value="count"${settings.mapEvolutionTickScope === 'count' ? ' selected' : ''}>N mapas de todos los sitios mapeados</option>
                                    <option value="all"${(settings.mapEvolutionTickScope || 'all') === 'all' ? ' selected' : ''}>Todos los sitios mapeados pendientes</option>
                                    <option value="selected"${settings.mapEvolutionTickScope === 'selected' ? ' selected' : ''}>Mapas seleccionados</option>
                                </select>
                            </label>
                            <div id="rt-agent-map-evo-n-row" style="display:${(settings.mapEvolutionTickScope === 'count' || settings.mapEvolutionTickScope === 'selected') ? 'flex' : 'none'}; align-items:center; gap:8px; flex-wrap:wrap;">
                                <label style="font-size:0.769em; opacity:0.7; display:flex; align-items:center; gap:5px;">
                                    Cuántos
                                    <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-map-evo-tick-count" value="${settings.mapEvolutionTickCount ?? 1}" style="width:44px; background:var(--rt-card-bg); color:var(--rt-text); border:var(--rt-border); border-radius:3px; text-align:center; font-size:0.769em; padding:2px;" title="0 = todos los mapas pendientes del conjunto">
                                </label>
                                <label style="font-size:0.769em; opacity:0.7; display:flex; align-items:center; gap:5px; cursor:pointer; user-select:none;">
                                    <input type="checkbox" id="rt-agent-map-evo-tick-randomize" ${settings.mapEvolutionTickRandomize !== false ? 'checked' : ''} style="margin:0; cursor:pointer;">
                                    Aleatorizar mapas pendientes
                                </label>
                            </div>
                            <div id="rt-agent-map-evo-selected-hint" style="display:${settings.mapEvolutionTickScope === 'selected' ? 'block' : 'none'}; font-size:0.692em; opacity:0.55; line-height:1.35;">
                                Los mapas seleccionados usan la lista de verificación bajo Ajustes → Mapas Persistentes → Evolución de Mapas.
                            </div>
                        </div>
                        <button id="rt-agent-map-evo-fire-now" style="width:100%; background:rgba(156,39,176,0.15); border:1px solid rgba(156,39,176,0.3); color:#ce93d8; border-radius:4px; padding:5px; font-size:0.769em; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px;">
                            <i class="fa-solid fa-map-location-dot"></i> Evolucionar Ahora
                        </button>
                        <button id="rt-agent-map-evo-reset-timeline" title="Limpia las marcas de tiempo de última evolución para que la Evolución de Mapas empiece de cero desde ahora" style="width:100%; background:rgba(234,67,53,0.1); border:1px solid rgba(234,67,53,0.25); color:rgba(234,67,53,0.75); border-radius:4px; padding:4px; font-size:0.692em; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; margin-top:5px;">
                            <i class="fa-solid fa-clock-rotate-left"></i> Restablecer Línea Temporal
                        </button>
                        <button id="rt-agent-map-evo-testing-ground" title="Avanza el tiempo, genera entidades y ejecuta ciclos de evolución sin jugar" style="width:100%; background:rgba(125,211,252,0.1); border:1px solid rgba(125,211,252,0.28); color:#7dd3fc; border-radius:4px; padding:4px; font-size:0.692em; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; margin-top:5px;">
                            <i class="fa-solid fa-flask"></i> Entorno de Pruebas
                        </button>
                    </div>

                    <!-- World Progression Collapsible Header -->
                    <div id="rt-agent-world-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; cursor: pointer; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.08); user-select: none; flex-shrink: 0;">
                        <div style="font-weight: bold; font-size: 0.846em; display: flex; align-items: center; gap: 6px; color: var(--rt-text-muted);">
                            <i class="fa-solid ${settings.agentWorldOpen ? 'fa-chevron-down' : 'fa-chevron-right'}" id="rt-agent-world-toggle-icon"></i>
                            🌍 ${t('agent.worldProgression', 'World Progression')}
                        </div>
                        <span id="rt-agent-world-enabled-badge" style="font-size:0.692em; padding:1px 7px; border-radius:10px; font-weight:bold; cursor:pointer; user-select:none; ${settings.worldProgressionEnabled ? 'background:rgba(52,168,83,0.18); color:#34a853; border:1px solid rgba(52,168,83,0.3);' : 'background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.35); border:1px solid rgba(255,255,255,0.1);'}" title="Click to toggle World Progression">${settings.worldProgressionEnabled ? 'ON' : 'OFF'}</span>
                    </div>

                    <!-- World Progression Drawer -->
                    <div id="rt-agent-world-drawer" style="display: ${settings.agentWorldOpen ? 'block' : 'none'}; margin-bottom: 10px; flex-shrink: 0;">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:8px;">
                            <div style="background:var(--rt-card-bg); border:var(--rt-border); border-radius:4px; padding:5px 8px;">
                                <div style="font-size:0.692em; opacity:0.5; color:var(--rt-text-muted); margin-bottom:2px;">${t('agent.lastFired', 'Last fired')}</div>
                                <div id="rt-agent-world-last-fired" style="font-size:0.769em; color:var(--rt-text);">—</div>
                            </div>
                            <div style="background:var(--rt-card-bg); border:var(--rt-border); border-radius:4px; padding:5px 8px;">
                                <div style="font-size:0.692em; opacity:0.5; color:var(--rt-text-muted); margin-bottom:2px;">${t('agent.nextFire', 'Next fire')}</div>
                                <div id="rt-agent-world-next-fire" style="font-size:0.769em; color:var(--rt-text);">—</div>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
                            <span style="font-size:0.769em; opacity:0.7; white-space:nowrap;">${t('agent.interval', 'Interval:')}</span>
                            <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-world-interval" value="${settings.worldProgressionIntervalHours || 24}" style="width:50px; background:var(--rt-card-bg); color:var(--rt-text); border:var(--rt-border); border-radius:3px; text-align:center; font-size:0.769em; padding:2px;">
                            <span style="font-size:0.769em; opacity:0.5;">${t('agent.inWorldHours', 'in-world hours')}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
                            <span style="font-size:0.769em; opacity:0.7; white-space:nowrap;">Locations:</span>
                            <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-world-locations" value="${settings.worldProgressionLocationsPerReport ?? 3}" style="width:50px; background:var(--rt-card-bg); color:var(--rt-text); border:var(--rt-border); border-radius:3px; text-align:center; font-size:0.769em; padding:2px;" title="How many location dossiers receive their own section in each report.">
                            <span style="font-size:0.769em; opacity:0.5;">per report</span>
                        </div>
                        <button id="rt-agent-world-fire-now" style="width:100%; background:rgba(52,168,83,0.15); border:1px solid rgba(52,168,83,0.3); color:#34a853; border-radius:4px; padding:5px; font-size:0.769em; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px;">
                            <i class="fa-solid fa-globe"></i> ${t('agent.fireNow', 'Fire Now')}
                        </button>
                        <button id="rt-agent-world-fire-extra" style="width:100%; background:rgba(0,180,216,0.15); border:1px solid rgba(0,180,216,0.3); color:#00b4d8; border-radius:4px; padding:5px; font-size:0.769em; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; margin-top:5px;">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> ${t('agent.fireExtra', 'Fire with Extra Instructions')}
                        </button>
                        <button id="rt-agent-world-reset-timeline" title="Limpia la fecha de última ejecución para que la Progresión del Mundo empiece de cero desde ahora" style="width:100%; background:rgba(234,67,53,0.1); border:1px solid rgba(234,67,53,0.25); color:rgba(234,67,53,0.75); border-radius:4px; padding:4px; font-size:0.692em; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; margin-top:5px;">
                            <i class="fa-solid fa-clock-rotate-left"></i> ${t('agent.resetTimeline', 'Restablecer Línea Temporal')}
                        </button>
                        <button id="rt-agent-world-purge-history" title="Elimina todos los informes de Progresión del Mundo y datos de esqueleto para este prefijo de campaña y reinicia el estado del temporizador para este chat" style="width:100%; background:rgba(234,67,53,0.14); border:1px solid rgba(234,67,53,0.35); color:rgba(234,67,53,0.9); border-radius:4px; padding:4px; font-size:0.692em; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; margin-top:5px;">
                            <i class="fa-solid fa-trash-can"></i> ${t('agent.purgeHistory', 'Purgar Historial del Mundo para este Chat')}
                        </button>
                    </div>

                    <div id="rt-agent-keys-toggle" style="display: flex; align-items: center; gap: 6px; margin-bottom: 5px; flex-shrink: 0; cursor: pointer; user-select: none;">
                        <div style="font-weight: bold; opacity: 0.8; font-size: 0.846em; display: flex; align-items: center; gap: 4px;">
                            <span id="rt-agent-keys-chevron" style="display: inline-block; width: 10px; transition: transform 0.2s; font-size: 0.9em; opacity: 0.7;"><i class="fa-solid fa-chevron-down"></i></span>
                            ${t('agent.activeLoreKeys', 'Claves de Lore Activas:')}
                            <span id="rt-agent-active-tokens" style="font-weight: normal; opacity: 0.55; color: var(--rt-text-muted); font-size: 0.95em;">(0t)</span>
                        </div>
                        <button id="rt-agent-keys-refresh" title="Actualizar claves activas desde disco" style="background: none; border: none; color: var(--rt-accent); font-size: 0.769em; cursor: pointer; opacity: 0.6; padding: 0;" ><i class="fa-solid fa-arrows-rotate"></i></button>
                    </div>
                    <div id="rt-agent-router-active-keys" style="margin-bottom: 10px; display: flex; flex-wrap: wrap; gap: 4px; min-height: 24px; flex-shrink: 0;">
                    </div>

                    <div id="rt-agent-campaign-section" style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px; display: flex; flex-direction: column; flex-shrink: 0;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-shrink: 0; gap: 8px;">
                            <div id="rt-agent-campaign-header-title" style="font-weight: bold; opacity: 0.8; font-size: 0.846em; flex: 1; min-width: 0;${settings.locationImages ? ' display: none;' : ''}">${t('agent.campaignRecords', 'REGISTROS DE CAMPAÑA')}</div>
                            <div class="rt-agent-view-mode-switch" id="rt-agent-view-mode-switch" role="tablist" aria-label="Registros de Campaña o Visuales / Mapa"${settings.locationImages ? '' : ' style="display: none;"'}>
                                <button type="button" class="rt-agent-view-mode-btn${settings.agentImmersionMode ? '' : ' rt-agent-view-mode-btn-active'}" id="rt-agent-view-mode-records" role="tab" aria-selected="${settings.agentImmersionMode ? 'false' : 'true'}">${t('agent.campaignRecordsTab', 'Registros de Campaña')}</button>
                                <button type="button" class="rt-agent-view-mode-btn rt-agent-view-mode-btn-visualization${settings.agentImmersionMode ? ' rt-agent-view-mode-btn-active' : ''}" id="rt-agent-view-mode-visualization" role="tab" aria-selected="${settings.agentImmersionMode ? 'true' : 'false'}">
                                    <span class="rt-agent-view-mode-glow" aria-hidden="true"></span>
                                    <span class="rt-agent-view-mode-label">${t('agent.visualsMapTab', 'Visuales / Mapa')}</span>
                                </button>
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                                <button class="rpg-tracker-icon-btn" id="rt-agent-activate-books" title="Activar libros de lore de campaña ahora" style="font-size: 0.769em; opacity: 0.5;"><i class="fa-solid fa-book-open"></i></button>
                                <button class="rpg-tracker-icon-btn" id="rt-agent-manifest-refresh" title="Actualizar Manifiesto" style="font-size: 0.769em; opacity: 0.5;"><i class="fa-solid fa-arrows-rotate"></i></button>
                            </div>
                        </div>
                        <div id="rt-agent-immersion-view" style="display: ${settings.agentImmersionMode ? 'flex' : 'none'}; flex-direction: column; flex-shrink: 0;"></div>
                        <div id="rt-agent-manifest-list" style="display: ${settings.agentImmersionMode ? 'none' : 'flex'}; flex-direction: column; gap: 6px; flex-shrink: 0;">
                            <div style="text-align: center; opacity: 0.5; font-size: 0.769em; padding: 10px;">${t('agent.clickRefreshToLoad', 'Haz clic en actualizar para cargar el lore...')}</div>
                        </div>
                    </div>
                </div>
                <div class="rpg-tracker-prompt-bar" id="rt-agent-prompt-bar" style="display:none; border-top: var(--rt-border); box-sizing: border-box;">
                    <textarea class="rpg-tracker-prompt-input" id="rt-agent-prompt-input" rows="2" placeholder="Instruir al modelo del agente… (Entrar para enviar, Mayús+Entrar para nueva línea)">${settings.routerDirectPrompt || ''}</textarea>
                    <div style="display: flex; flex-direction: column; gap: 4px; align-items: center; justify-content: flex-end;">
                        <div class="rt-prompt-ctx-control" style="font-size: 0.692em; display: flex; flex-direction: column; align-items: center; gap: 0;" title="Revisión directa: últimos N mensajes de chat (usuario y asistente) para esta ejecución manual.">
                            <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-agent-prompt-context-val" value="${settings.routerDirectLookback || 10}" min="1" max="100" style="width: 28px; height: 16px; font-size: 0.692em; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 3px; text-align: center; padding: 0;">
                            <span style="opacity: 0.5; font-size: 8px; line-height: 1;">msj</span>
                        </div>
                        <button class="rpg-tracker-prompt-send" id="rt-agent-prompt-send" title="Ejecutar comando">▶</button>
                    </div>
                </div>
                <div class="rpg-tracker-footer" id="rt-agent-footer">
                    <div class="rt-footer-starfield" aria-hidden="true"></div>
                    <div class="rt-agent-footer-left">
                        <div class="rpg-tracker-nav">
                            <button class="rpg-tracker-nav-btn" id="rt-agent-nav-back" title="Deshacer última pasada de lorebook">←</button>
                            <span class="rpg-tracker-nav-label" id="rt-agent-nav-label">[ EN VIVO ]</span>
                            <button class="rpg-tracker-nav-btn" id="rt-agent-nav-fwd" title="Rehacer pasada de lorebook">→</button>
                        </div>
                    </div>
                    <div class="rt-agent-footer-center">
                        <div id="rt-agent-footer-location" class="rt-footer-location-text" title="Ubicación Actual (Principal, Sub)"></div>
                    </div>
                    <div class="rt-agent-footer-right">
                        <div id="rt-agent-last-run"></div>
                        <button class="rpg-tracker-icon-btn rt-footer-prompt-btn" id="rt-agent-prompt-btn" title="Alternar prompt directo">💬</button>
                    </div>
                </div>
                <div class="rt-resizer-br" id="rt-agent-resizer-br" title="Redimensionar desde abajo a la derecha"></div>
                <div class="rt-resizer-bl" id="rt-agent-resizer-bl" title="Redimensionar desde abajo a la izquierda"></div>
            </div>
                </div>
            </div>
            <div class="rpg-tracker-delta-resize-handle" id="rpg-tracker-delta-handle" style="display:none;"></div>
            <div class="rpg-tracker-delta-panel" id="rpg-tracker-delta" style="display:none;">
                <div class="rpg-tracker-delta-toolbar">
                    <span class="rpg-tracker-delta-title">Registro de Cambios</span>
                    <button class="rpg-tracker-icon-btn" id="rpg-tracker-delta-clear" title="Limpiar registro">✕</button>
                </div>
                <div id="rpg-tracker-delta-content">${settings.lastDelta || '<span class="delta-empty">Sin cambios todavía.</span>'}</div>
            </div>
            <div class="rpg-tracker-prompt-bar" id="rpg-tracker-prompt-bar" style="display:none;">
                <textarea class="rpg-tracker-prompt-input" id="rpg-tracker-prompt-input" rows="2" placeholder="Instruir al modelo del rastreador… (Entrar para enviar, Mayús+Entrar para nueva línea)"></textarea>
                <div style="display: flex; flex-direction: column; gap: 4px; align-items: center; justify-content: flex-end;">
                    <div class="rt-prompt-ctx-control" style="font-size: 0.692em; display: flex; flex-direction: column; align-items: center; gap: 0;" title="Contexto: número de mensajes recientes a incluir">
                        <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-prompt-context-val" value="${settings.directPromptContext || 5}" min="0" max="50" style="width: 28px; height: 16px; font-size: 0.692em; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 3px; text-align: center; padding: 0;">
                        <span style="opacity: 0.5; font-size: 8px; line-height: 1;">msj</span>
                    </div>
                    <button class="rpg-tracker-prompt-send" id="rpg-tracker-prompt-send" title="Enviar instrucción">▶</button>
                </div>
            </div>
            <div class="rpg-tracker-footer" id="rt-main-footer">
                <div class="rt-footer-starfield" aria-hidden="true"></div>
                <div class="rt-mobile-top-row">
                    <button class="rt-footer-toggle-btn" id="rt-footer-expand-btn" title="Alternar Cajón de Ajustes"><i class="fa-solid fa-chevron-up"></i></button>
                    <div class="rpg-tracker-nav">
                        <button class="rpg-tracker-nav-btn" id="rpg-tracker-nav-back" title="Ver captura anterior">←</button>
                        <span class="rpg-tracker-nav-label" id="rpg-tracker-nav-label">[ EN VIVO ]</span>
                        <button class="rpg-tracker-nav-btn" id="rpg-tracker-nav-fwd" title="Ver captura siguiente">→</button>
                    </div>
                </div>
                <div class="flex-container gap-1 alignitemscenter rt-rng-footer-group" style="display:none;">
                    <!-- Removed inline RNG toggles, now located in extension settings -->
                </div>
                <div class="rt-footer-center-group" id="rt-footer-center-group" style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
                    <div id="rt-footer-time" style="display: none; font-size: 0.769em; color: var(--rt-accent); white-space: nowrap; flex-shrink: 0; opacity: 0.9; cursor: help;" title="Hora actual en el juego"></div>
                    <div id="rt-footer-location" class="rt-footer-location-text" title="Ubicación Actual (Principal, Sub)"></div>
                </div>
                <div class="flex-container gap-1 alignitemscenter rt-utility-footer-group">
                    <span id="rpg-tracker-count">~${Math.round(settings.currentMemo.length / 2.62)} tokens</span>
                    <button class="rpg-tracker-nav-btn" id="rpg-tracker-delta-btn" title="Alternar registro de cambios" style="padding: 1px 5px; font-size: 0.692em; opacity: 0.8; margin-left: 5px;">δ</button>
                    <button class="rpg-tracker-nav-btn" id="rpg-tracker-memo-clear" style="padding: 1px 5px; font-size: 0.692em; opacity: 0.8; margin-left: 5px;" title="Limpiar memo e historial">LIMPIAR</button>
                </div>
                <button class="rpg-tracker-icon-btn rt-footer-prompt-btn" id="rpg-tracker-prompt-btn" title="Alternar prompt directo">💬</button>
            </div>
        `;
}
