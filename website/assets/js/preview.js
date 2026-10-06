/**
 * Verteon Interactive Preview
 * Main interactive application preview with state management and user interactions.
 */

import { VerteonState, Animations, DOM, subscribe, setState, getState } from './verteon-core.js';
import { Keyboard } from './verteon-core.js';
import { wireCopyButtons } from './ui-utils.js';

export class PreviewApp {
    constructor() {
        this.isInitialized = false;
        this.init();
    }

    init() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        // State management and subscriptions
        this.setupStateManagement();
        this.setupProviderSelectors();
        this.setupChatInterface();
        this.setupSidebarNavigation();
        this.setupTerminal();
        this.setupApprovalSystem();
        this.setupSettings();
        this.setupKeyboardShortcuts();
        this.setupThemeAndAnimations();

        // Initialize logo moment
        this.initLogoMoment();

        // Wire up utilities
        wireCopyButtons();

        // Setup responsive behavior
        this.setupResponsiveBehavior();

        // Emit initial state
        console.log('Verteon Interactive Preview initialized');
    }

    setupStateManagement() {
        // Agent state machine
        subscribe('agentState', (state) => {
            this.updateAgentStatus(state);
            this.updateActivityPanel(state);
        });

        // Provider state machine
        subscribe('providerState', (state) => {
            this.updateProviderStatus(state);
        });

        // Terminal state machine
        subscribe('terminalState', (state) => {
            this.updateTerminalStatus(state);
        });

        // Provider changes
        subscribe('currentProvider', (provider) => {
            this.updateProviderSelectorUI(provider);
            this.updateModelSelectorOptions(provider);
        });

        // Provider/model for updates
        subscribe('currentModel', (model) => {
            DOM.setAttribute('#modelLabel', 'textContent', model);
        });
    }

    setupProviderSelectors() {
        const providerButton = DOM.$('#providerButton');
        const providerDropdown = DOM.$('#providerDropdown');
        const modelButton = DOM.$('#modelButton');
        const modelDropdown = DOM.$('#modelDropdown');

        if (!providerButton || !providerDropdown) return;

        // Provider dropdown
        providerButton.addEventListener('click', () => {
            const expanded = providerButton.getAttribute('aria-expanded') === 'true';
            providerButton.setAttribute('aria-expanded', !expanded);
            providerDropdown.hidden = expanded;
        });

        // Model dropdown
        modelButton.addEventListener('click', () => {
            const expanded = modelButton.getAttribute('aria-expanded') === 'true';
            modelButton.setAttribute('aria-expanded', !expanded);
            modelDropdown.hidden = expanded;
        });

        // Close dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (!DOM.$('#providerSelector').contains(e.target) &&
                !DOM.$('#modelSelector').contains(e.target)) {
                providerDropdown.hidden = true;
                modelDropdown.hidden = true;
                providerButton.setAttribute('aria-expanded', 'false');
                modelButton.setAttribute('aria-expanded', 'false');
            }
        });

        // Initialize provider dropdown content
        this.initProviderDropdown(providerDropdown);
        this.initModelDropdown(modelDropdown);
    }

    initProviderDropdown(dropdown) {
        const providers = ['ollama', 'groq', 'openai', 'anthropic', 'google'];

        providers.forEach(provider => {
            const option = DOM.create('div', {
                class: 'selector-option',
                'data-value': provider,
                role: 'option',
                tabindex: '-1'
            });

            option.innerHTML = `
                <span class="provider-badge provider-${provider}">${provider}</span>
            `;

            option.addEventListener('click', () => {
                setState('currentProvider', provider);
                dropdown.hidden = true;
                DOM.$('#providerButton').setAttribute('aria-expanded', 'false');
            });

            dropdown.appendChild(option);
        });
    }

    initModelDropdown(dropdown) {
        const currentProvider = getState('currentProvider');
        const models = {
            'ollama': ['qwen2.5-coder:7b', 'llama3.2:13b', 'codellama:7b'],
            'groq': ['llama3-70b-8192', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
            'openai': ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
            'anthropic': ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
            'google': ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro']
        };

        const providerModels = models[currentProvider] || models['ollama'];

        providerModels.forEach(model => {
            const option = DOM.create('div', {
                class: 'selector-option',
                'data-value': model,
                role: 'option',
                tabindex: '-1'
            });

            option.textContent = model;
            option.addEventListener('click', () => {
                setState('currentModel', model);
                dropdown.hidden = true;
                DOM.$('#modelButton').setAttribute('aria-expanded', 'false');
            });

            dropdown.appendChild(option);
        });
    }

    updateProviderSelectorUI(provider) {
        const label = DOM.$('#providerLabel');
        if (label) {
            label.textContent = provider;
        }
    }

    updateModelSelectorOptions(provider) {
        const dropdown = DOM.$('#modelDropdown');
        if (!dropdown) return;

        // Clear existing options
        dropdown.innerHTML = '';

        // Re-initialize with new provider
        this.initModelDropdown(dropdown);
    }

    setupChatInterface() {
        const input = DOM.$('#composerInput');
        const sendBtn = DOM.$('#sendBtn');
        const composer = DOM.$('#composer');
        const messages = DOM.$('#messages');
        const cancelBtn = DOM.$('#cancelBtn');

        if (!input || !sendBtn || !composer || !messages) return;

        // Send message
        const sendMessage = () => {
            const text = input.value.trim();
            if (!text) return;

            // Add user message
            const userMessage = DOM.create('div', {
                class: 'message message-user'
            }, [
                DOM.create('div', { class: 'message-meta' }, ['You']),
                DOM.create('div', { class: 'message-text' }, [text])
            ]);

            messages.appendChild(userMessage);
            input.value = '';

            // Simulate agent response
            this.simulateAgentResponse(text);

            // Set agent state to thinking
            setState('agentState', 'thinking');

            // Auto-scroll
            messages.scrollTop = messages.scrollHeight;
        };

        // Send button click
        sendBtn.addEventListener('click', sendMessage);

        // Enter key (without Shift for newline)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Cancel current operation
        cancelBtn.addEventListener('click', () => {
            setState('agentState', 'idle');
            cancelBtn.hidden = true;
            this.addSystemMessage('Operation cancelled');
        });

        // Auto-resize textarea
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        });
    }

    setupSidebarNavigation() {
        const tabs = DOM.$$('.sidebar-tab');
        const panels = DOM.$$('.sidebar-panel');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const panelId = tab.getAttribute('data-panel');

                // Update active tab
                DOM.$$('.sidebar-tab').forEach(t => {
                    DOM.removeClass(t, 'active');
                    t.setAttribute('aria-selected', 'false');
                });

                DOM.addClass(tab, 'active');
                tab.setAttribute('aria-selected', 'true');

                // Show panel
                DOM.$$('.sidebar-panel').forEach(p => {
                    DOM.addClass(p, 'd-none');
                    p.setAttribute('hidden', '');
                });

                const targetPanel = DOM.$(`#${panelId}-panel`);
                if (targetPanel) {
                    DOM.removeClass(targetPanel, 'd-none');
                    targetPanel.removeAttribute('hidden');

                    // Animate panel
                    Animations.fadeIn(targetPanel, 200);
                }

                // Update state
                setState('activePanel', panelId);
            });
        });
    }

    setupTerminal() {
        const runCommandBtn = DOM.$('#runCommandBtn');
        const terminalInput = DOM.$('#terminalInput');

        if (!runCommandBtn || !terminalInput) return;

        runCommandBtn.addEventListener('click', () => {
            const command = terminalInput.value.trim();
            if (!command) return;

            // Add command to terminal
            this.addTerminalOutput(`> ${command}`, 'prompt');

            // Set terminal state
            setState('terminalState', 'running');

            // Simulate command execution
            setTimeout(() => {
                setState('terminalState', 'completed');
                this.addTerminalOutput('Command executed successfully', 'output');
                terminalInput.value = '';
            }, 1500);
        });

        terminalInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                runCommandBtn.click();
            }
        });
    }

    setupApprovalSystem() {
        const approveBtn = DOM.$('#approveBtn');
        const denyBtn = DOM.$('#denyBtn');

        if (!approveBtn || !denyBtn) return;

        // Allow button click
        approveBtn.addEventListener('click', () => {
            setState('agentState', 'completed');
            this.showApprovalResult('Approved', true);
            this.hideApprovalCard();
            this.addSystemMessage('Action approved');
        });

        // Deny button click
        denyBtn.addEventListener('click', () => {
            setState('agentState', 'error');
            this.showApprovalResult('Denied', false);
            this.hideApprovalCard();
            this.addSystemMessage('Action denied');
        });
    }

    setupSettings() {
        const settingsToggles = DOM.$$('.toggle');

        settingsToggles.forEach(toggle => {
            const isChecked = toggle.getAttribute('aria-checked') === 'true';

            toggle.addEventListener('click', () => {
                const checked = toggle.getAttribute('aria-checked') === 'true';
                toggle.setAttribute('aria-checked', !checked);
                DOM.toggleClass(toggle, 'active', !checked);

                // Save to localStorage
                const settingName = toggle.id.replace('setting', '');
                localStorage.setItem(`verteon.setting.${settingName}`, !checked);
            });
        });
    }

    setupKeyboardShortcuts() {
        Keyboard.bind('k', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                DOM.$('#composerInput').focus();
            }
        });

        Keyboard.bind('Escape', (e) => {
            if (VerteonState.mobileMenuOpen) {
                const navToggle = DOM.$('#navToggle');
                if (navToggle) navToggle.click();
            }
        });
    }

    setupThemeAndAnimations() {
        // Apply theme class based on system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');

        // Watch for animation preference changes
        const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        motionQuery.addEventListener('change', (e) => {
            setState('reducedMotion', e.matches);
            setState('animationsEnabled', !e.matches);
        });
    }

    initLogoMoment() {
        const logo = DOM.$('.nav-brand');
        if (!logo) return;

        // Add pulse animation after initial load
        setTimeout(() => {
            DOM.addClass(logo, 'pulse');
            setTimeout(() => DOM.removeClass(logo, 'pulse'), 2000);
        }, 500);
    }

    setupResponsiveBehavior() {
        // Handle mobile menu
        const navToggle = DOM.$('#navToggle');
        const navLinks = DOM.$('.nav-links');

        if (navToggle && navLinks) {
            navToggle.addEventListener('click', () => {
                const isOpen = navLinks.style.display !== 'none';
                if (isOpen) {
                    navLinks.style.display = 'none';
                    setState('mobileMenuOpen', false);
                } else {
                    navLinks.style.display = 'flex';
                    navLinks.style.flexDirection = 'column';
                    navLinks.style.position = 'absolute';
                    navLinks.style.top = '100%';
                    navLinks.style.left = '0';
                    navLinks.style.right = '0';
                    navLinks.style.background = 'var(--surface)';
                    navLinks.style.padding = '1rem';
                    navLinks.style.borderBottom = '1px solid var(--border)';
                    navLinks.style.gap = '0.5rem';
                    setState('mobileMenuOpen', true);
                }
            });
        }

        // Close mobile menu on resize
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                navLinks.style.display = '';
                navLinks.style.flexDirection = '';
                navLinks.style.position = '';
                navLinks.style.top = '';
                navLinks.style.left = '';
                navLinks.style.right = '';
                navLinks.style.background = '';
                navLinks.style.padding = '';
                navLinks.style.borderBottom = '';
                navLinks.style.gap = '';
                setState('mobileMenuOpen', false);
            }
        });
    }

    // UI update methods

    updateAgentStatus(state) {
        const indicator = DOM.$('#agentStatusIndicator');
        const text = DOM.$('#agentStatusText');
        const cancelBtn = DOM.$('#cancelBtn');

        if (!indicator || !text) return;

        // Update status indicator
        DOM.removeClass(indicator, 'pulse', 'activity-status-active');
        DOM.removeClass(text, 'text-tertiary', 'text-primary', 'text-danger');

        switch (state) {
            case 'idle':
                DOM.addClass(indicator, 'activity-status-idle');
                DOM.addClass(text, 'text-tertiary');
                text.textContent = 'Idle';
                cancelBtn.hidden = true;
                break;
            case 'thinking':
                DOM.addClass(indicator, 'activity-status-thinking');
                DOM.addClass(text, 'text-primary');
                text.textContent = 'Thinking...';
                cancelBtn.hidden = false;
                break;
            case 'using-tool':
                DOM.addClass(indicator, 'activity-status-using-tool');
                DOM.addClass(text, 'text-primary');
                text.textContent = 'Using tool...';
                cancelBtn.hidden = false;
                break;
            case 'waiting-approval':
                DOM.addClass(indicator, 'activity-status-approval');
                DOM.addClass(text, 'text-warning');
                text.textContent = 'Waiting approval';
                cancelBtn.hidden = false;
                break;
            case 'completed':
                DOM.addClass(indicator, 'activity-status-completed');
                DOM.addClass(text, 'text-success');
                text.textContent = 'Completed';
                cancelBtn.hidden = true;
                break;
            case 'error':
                DOM.addClass(indicator, 'activity-status-error');
                DOM.addClass(text, 'text-danger');
                text.textContent = 'Error';
                cancelBtn.hidden = true;
                break;
        }
    }

    updateProviderStatus(state) {
        const dot = DOM.$('#providerDot');
        const statusText = DOM.$('#providerStatusText');

        if (!dot || !statusText) return;

        DOM.removeClass(dot, 'pulse');
        DOM.removeClass(statusText, 'text-danger', 'text-warning', 'text-success');

        switch (state) {
            case 'connected':
                DOM.addClass(dot, 'pulse');
                DOM.addClass(statusText, 'text-success');
                statusText.textContent = 'Connected';
                break;
            case 'connecting':
                DOM.addClass(statusText, 'text-warning');
                statusText.textContent = 'Connecting...';
                break;
            case 'error':
                DOM.addClass(statusText, 'text-danger');
                statusText.textContent = 'Connection error';
                break;
        }
    }

    updateTerminalStatus(state) {
        const dot = DOM.$('#terminalDot');
        const statusText = DOM.$('#terminalStatusText');

        if (!dot || !statusText) return;

        DOM.removeClass(dot, 'pulse');
        DOM.removeClass(statusText, 'text-danger', 'text-warning', 'text-success');

        switch (state) {
            case 'idle':
                DOM.addClass(statusText, 'text-tertiary');
                statusText.textContent = 'Idle';
                break;
            case 'running':
                DOM.addClass(dot, 'pulse');
                DOM.addClass(statusText, 'text-primary');
                statusText.textContent = 'Running...';
                break;
            case 'completed':
                DOM.addClass(statusText, 'text-success');
                statusText.textContent = 'Completed';
                break;
            case 'failed':
                DOM.addClass(statusText, 'text-danger');
                statusText.textContent = 'Failed';
                break;
        }
    }

    updateActivityPanel(agentState) {
        const activityList = DOM.$('#activityList');
        if (!activityList) return;

        // Add new activity based on agent state
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const activityIcon = this.getActivityIcon(agentState);

        const activityCard = DOM.create('div', {
            class: 'activity-card',
            'data-expandable': ''
        }, [
            DOM.create('button', {
                class: 'activity-card-header',
                'aria-expanded': 'false'
            }, [
                DOM.create('span', { class: `activity-icon ${activityIcon}` }, [
                    DOM.create('svg', {
                        width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2'
                    }, [
                        DOM.create('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
                        DOM.create('polyline', { points: '14 2 14 8 20 8' })
                    ])
                ]),
                DOM.create('span', { class: 'activity-title' }, ['Agent action']),
                DOM.create('span', { class: 'activity-target' }, [agentState]),
                DOM.create('span', { class: 'activity-duration' }, ['0.5s']),
                DOM.create('svg', {
                    class: 'activity-chevron',
                    width: '12', height: '12', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2'
                }, [
                    DOM.create('polyline', { points: '6 9 12 15 18 9' })
                ])
            ]),
            DOM.create('div', {
                class: 'activity-details',
                hidden: ''
            }, [
                DOM.create('pre', { class: 'activity-output' }, [`Simulated ${agentState} action`])
            ])
        ]);

        activityList.insertBefore(activityCard, activityList.firstChild);

        // Setup expandable functionality
        const header = activityCard.querySelector('.activity-card-header');
        const details = activityCard.querySelector('.activity-details');

        if (header && details) {
            header.addEventListener('click', () => {
                const isExpanded = details.hidden;
                details.hidden = !isExpanded;
                header.setAttribute('aria-expanded', isExpanded.toString());
            });
        }
    }

    getActivityIcon(agentState) {
        const icons = {
            'thinking': 'activity-icon-thinking',
            'using-tool': 'activity-icon-tool',
            'waiting-approval': 'activity-icon-approval',
            'completed': 'activity-icon-completed',
            'error': 'activity-icon-error'
        };
        return icons[agentState] || 'activity-icon-default';
    }

    // Helper methods

    addTerminalOutput(text, type = 'output') {
        const terminalPanel = DOM.$('#terminalPanel');
        if (!terminalPanel) return;

        const line = DOM.create('div', {
            class: `terminal-line terminal-line-${type}`
        }, [
            type === 'prompt' ? DOM.create('span', { class: 'terminal-prompt' }, ['PS D:\project>']) : null,
            type === 'prompt' ? DOM.create('span', { class: 'terminal-cmd' }, [text]) : text
        ]);

        terminalPanel.appendChild(line);
        terminalPanel.scrollTop = terminalPanel.scrollHeight;
    }

    addSystemMessage(text) {
        const messages = DOM.$('#messages');
        if (!messages) return;

        const message = DOM.create('div', {
            class: 'message message-system'
        }, [
            DOM.create('div', { class: 'message-content' }, [
                DOM.create('div', { class: 'message-meta' }, ['System']),
                DOM.create('div', { class: 'message-text' }, [text])
            ])
        ]);

        messages.appendChild(message);
        messages.scrollTop = messages.scrollHeight;
    }

    simulateAgentResponse(userMessage) {
        const messages = DOM.$('#messages');
        if (!messages) return;

        // Simulate thinking
        setTimeout(() => {
            setState('agentState', 'using-tool');

            // Simulate tool use
            setTimeout(() => {
                setState('agentState', 'waiting-approval');
                this.showApprovalCard(userMessage);
            }, 1000);
        }, 500);
    }

    showApprovalCard(userMessage) {
        const approvalCard = DOM.$('#approvalCard');
        const approvalBody = DOM.$('#approvalBody');
        const approvalResult = DOM.$('#approvalResult');

        if (!approvalCard || !approvalBody || !approvalResult) return;

        // Show approval card
        approvalCard.style.display = 'block';

        // Update approval message
        const actionText = userMessage.includes('package.json') ? 'Read file' :
                          userMessage.includes('dependencies') ? 'List dependencies' :
                          userMessage.includes('edit') ? 'Edit file' : 'Process request';

        const fileName = userMessage.includes('package.json') ? 'package.json' :
                        userMessage.includes('README') ? 'README.md' :
                        userMessage.includes('file') ? 'selected file' : 'requested action';

        approvalBody.innerHTML = `
            <div class="approval-action">Agent wants to ${actionText}: <strong>${fileName}</strong></div>
            <div class="approval-desc">Add installation instructions for new users.</div>
            <div class="approval-actions">
                <button class="btn btn-primary btn-sm" id="approveBtn">Allow</button>
                <button class="btn btn-outline btn-sm" id="denyBtn">Deny</button>
            </div>
        `;

        // Wire up buttons
        DOM.$('#approveBtn').addEventListener('click', () => {
            setState('agentState', 'completed');
            this.showApprovalResult('Approved', true);
            this.hideApprovalCard();
            this.addSystemMessage('Action approved');
        });

        DOM.$('#denyBtn').addEventListener('click', () => {
            setState('agentState', 'error');
            this.showApprovalResult('Denied', false);
            this.hideApprovalCard();
            this.addSystemMessage('Action denied');
        });
    }

    showApprovalResult(text, success) {
        const approvalResult = DOM.$('#approvalResult');
        if (!approvalResult) return;

        approvalResult.textContent = `Result: ${text}`;
        approvalResult.className = `approval-result ${success ? 'approval-success' : 'approval-error'}`;
        approvalResult.removeAttribute('hidden');
    }

    hideApprovalCard() {
        const approvalCard = DOM.$('#approvalCard');
        if (approvalCard) {
            approvalCard.style.display = 'none';
        }
    }

    // Preview reset functionality
    initResetButton() {
        const resetBtn = DOM.$('#previewReset');
        if (!resetBtn) return;

        resetBtn.addEventListener('click', () => {
            // Reset chat
            const messages = DOM.$('#messages');
            if (messages) {
                messages.innerHTML = `
                    <div class="message message-assistant">
                        <div class="message-avatar" aria-hidden="true">
                            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a1 1 0 0 1 1 1v1.06A5.5 5.5 0 0 1 13.94 8H15a1 1 0 1 1 0 2h-1.06A5.5 5.5 0 0 1 9 14.94V16a1 1 0 1 1-2 0v-1.06A5.5 5.5 0 0 1 2.06 10H1a1 1 0 1 1 0-2h1.06A5.5 5.5 0 0 1 7 3.06V2a1 1 0 0 1 1-1Zm0 3.5A4.5 4.5 0 1 0 8 13a4.5 4.5 0 0 0 0-8.5ZM6.75 6.5h2.5a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-.75.75h-2.5A.75.75 0 0 1 6 9.75v-2.5a.75.75 0 0 1 .75-.75Z"/></svg>
                        </div>
                        <div class="message-content">
                            <div class="message-meta">Verteon Agent</div>
                            <div class="message-text">Hello! I'm your AI coding assistant. I can help you analyze this project, edit files, run commands, and fix problems. How can I assist you today?</div>
                        </div>
                    </div>
                `;
            }

            // Reset agent state
            setState('agentState', 'idle');

            // Reset terminal
            const terminalPanel = DOM.$('#terminalPanel');
            if (terminalPanel) {
                terminalPanel.innerHTML = `
                    <div class="terminal-line terminal-line-prompt"><span class="terminal-prompt">PS D:\project&gt;</span> <span class="terminal-cmd">npm list --depth=0</span></div>
                    <div class="terminal-line terminal-line-output">project@0.2.0 D:\project</div>
                    <div class="terminal-line terminal-line-output">├── local-ai-agent@0.2.0</div>
                    <div class="terminal-line terminal-line-output">├── typescript@5.5.4</div>
                    <div class="terminal-line terminal-line-output">└── vscode@1.85.0</div>
                `;
            }

            // Hide approval card if visible
            this.hideApprovalCard();

            // Show toast
            if (window.showToast) {
                window.showToast('Preview reset', 'info');
            }
        });
    }

    // Initialize everything
    async init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
        }

        // Initialize app
        this.init();

        // Setup reset button
        this.initResetButton();

        // Log completion
        console.log('Verteon Interactive Preview fully initialized');
    }
}

// Global initialization
let previewApp = null;

export function initPreview() {
    if (!previewApp) {
        previewApp = new PreviewApp();
    }
    return previewApp;
}

// Auto-initialize when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initPreview();
    });
} else {
    initPreview();
}

// Export for global access
window.PreviewApp = PreviewApp;
window.initPreview = initPreview;