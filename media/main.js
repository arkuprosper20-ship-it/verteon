/* Verteon — Webview UI logic */
(function () {
  const vscode = acquireVsCodeApi();

  // ===== STATE =====
  const state = {
    view: 'agent',
    provider: 'ollama',
    model: '',
    connected: false,
    statusMessage: '',
    models: [],
    messages: [],
    activities: [],
    pendingApprovals: new Map(),
    agentRunning: false,
    streaming: false,
    currentStreamingEl: null,
    workspaceRoot: '',
    workspaceName: '',
    gitStatus: null,
    files: [],
    terminalHistory: [],
    tasks: [],
    history: [],
    settings: {},
    expandedTools: new Set(),
  };

  // ===== DOM REFS =====
  const $ = (id) => document.getElementById(id);
  const els = {
    providerSelector: $('provider-selector'),
    providerName: $('provider-name'),
    providerStatusDot: $('provider-status-dot'),
    sidebar: $('sidebar'),
    activityPanel: $('activity-panel'),
    agentContent: $('agent-content'),
    welcomeState: $('welcome-state'),
    composerInput: $('composer-input'),
    composerSend: $('composer-send'),
    stopBtn: $('stop-btn'),
    agentStatus: $('agent-status'),
    workspaceInfo: $('workspace-info'),
    liveActivity: $('live-activity'),
    providerPanel: $('provider-panel'),
    filesPanel: $('files-panel'),
    terminalPanel: $('terminal-panel'),
    gitPanel: $('git-panel'),
    settingsPanel: $('settings-panel'),
  };

  // ===== UTILITIES =====
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function post(msg) {
    vscode.postMessage(msg);
  }

  // ===== NAVIGATION =====
  function navigate(view) {
    state.view = view;
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.view === view);
    });
    els.filesPanel.classList.toggle('active', view === 'files');
    els.terminalPanel.classList.toggle('active', view === 'terminal');
    els.gitPanel.classList.toggle('active', view === 'git');
    els.settingsPanel.classList.toggle('active', view === 'settings');
    els.agentContent.style.display = view === 'agent' ? 'flex' : 'none';
    els.composerInput.closest('#composer').style.display = view === 'agent' ? '' : 'none';

    if (view === 'files') post({ type: 'getFiles' });
    if (view === 'terminal') post({ type: 'getTerminalHistory' });
    if (view === 'git') post({ type: 'getGitStatus' });
    if (view === 'settings') post({ type: 'getSettings' });
  }

  // ===== PROVIDER SELECTOR =====
  function updateProviderUI() {
    els.providerName.textContent = state.provider;
    const dot = els.providerStatusDot;
    dot.className = 'status-dot ' + (state.connected ? 'connected' : 'disconnected');
  }

  function renderProviderPanel() {
    if (!els.providerPanel) return;
    const providers = [
      { id: 'ollama', name: 'Ollama', desc: 'Local models' },
      { id: 'groq', name: 'Groq', desc: 'Cloud inference' },
    ];
    els.providerPanel.innerHTML = providers.map((p) => `
      <div class="provider-item ${p.id === state.provider ? 'selected' : ''}" data-provider="${p.id}">
        <div class="provider-radio"></div>
        <div class="provider-info">
          <div class="provider-name">${escapeHtml(p.name)}</div>
          <div class="provider-model">${escapeHtml(p.desc)}</div>
        </div>
        <div class="provider-status ${p.id === state.provider && state.connected ? 'connected' : 'not-configured'}">
          ${p.id === state.provider ? (state.connected ? 'Connected' : 'Offline') : ''}
        </div>
      </div>
    `).join('');
    els.providerPanel.querySelectorAll('.provider-item').forEach((el) => {
      el.addEventListener('click', () => {
        const pid = el.dataset.provider;
        if (pid !== state.provider) {
          post({ type: 'switchProvider', provider: pid });
        }
      });
    });
  }

  // ===== AGENT STATUS =====
  function updateAgentStatus(status, detail) {
    if (!els.agentStatus) return;
    const labels = {
      ready: 'Ready',
      thinking: 'Thinking',
      running: 'Running',
      waiting: 'Waiting for approval',
      completed: 'Completed',
      cancelled: 'Cancelled',
      error: 'Error',
    };
    els.agentStatus.innerHTML = `
      <div class="status-row">
        <span class="status-label">Status</span>
        <span class="status-value">
          <span class="dot ${status}"></span>
          ${labels[status] || status}
        </span>
      </div>
      ${detail ? `<div class="status-row"><span class="status-label">Detail</span><span class="status-value" style="font-weight:400;font-size:0.85em">${escapeHtml(detail)}</span></div>` : ''}
      <div class="status-row">
        <span class="status-label">Provider</span>
        <span class="status-value" style="font-weight:400;font-size:0.85em">${escapeHtml(state.provider)}</span>
      </div>
      ${state.model ? `<div class="status-row"><span class="status-label">Model</span><span class="status-value" style="font-weight:400;font-size:0.85em">${escapeHtml(state.model)}</span></div>` : ''}
    `;
  }

  // ===== WORKSPACE INFO =====
  function updateWorkspaceInfo() {
    if (!els.workspaceInfo) return;
    els.workspaceInfo.innerHTML = `
      <div class="workspace-name">&#128193; ${escapeHtml(state.workspaceName || 'No workspace')}</div>
      <div class="info-row"><span>Path</span><span class="value">${escapeHtml(state.workspaceRoot || '-')}</span></div>
      ${state.gitStatus ? `
        <div class="info-row"><span>Branch</span><span class="value">${escapeHtml(state.gitStatus.branch || '-')}</span></div>
        <div class="git-status ${state.gitStatus.clean ? 'clean' : 'dirty'}">
          ${state.gitStatus.clean ? '&#10003; Clean' : `&#9888; ${state.gitStatus.changes || 0} changes`}
        </div>
      ` : ''}
    `;
  }

  // ===== LIVE ACTIVITY =====
  function renderLiveActivity() {
    if (!els.liveActivity) return;
    if (state.activities.length === 0) {
      els.liveActivity.innerHTML = '<div class="empty-state">No activity yet</div>';
      return;
    }
    const icons = {
      completed: '&#10003;',
      running: '&#9654;',
      waiting: '&#9203;',
      failed: '&#10007;',
    };
    els.liveActivity.innerHTML = state.activities.slice(-20).reverse().map((a, i) => `
      <div class="live-activity-item" data-idx="${state.activities.length - 1 - i}">
        <div class="activity-title">
          <span class="activity-icon ${a.status}">${icons[a.status] || '&#9679;'}</span>
          ${escapeHtml(a.title)}
        </div>
        ${a.detail ? `<div class="activity-detail">${escapeHtml(a.detail)}</div>` : ''}
      </div>
    `).join('');
  }

  function addActivity(title, detail, status) {
    state.activities.push({ title, detail, status, ts: Date.now() });
    renderLiveActivity();
  }

  // ===== CHAT RENDERING =====
  function renderWelcome() {
    els.welcomeState.style.display = state.messages.length === 0 ? 'flex' : 'none';
  }

  function addUserMessage(text) {
    state.messages.push({ role: 'user', content: text });
    const el = document.createElement('div');
    el.className = 'chat-message user';
    el.innerHTML = `
      <div class="msg-label">You</div>
      <div class="msg-body">${escapeHtml(text)}</div>
    `;
    els.agentContent.appendChild(el);
    scrollToBottom();
    renderWelcome();
  }

  function addAssistantMessage(text) {
    state.messages.push({ role: 'assistant', content: text });
    const el = document.createElement('div');
    el.className = 'chat-message assistant';
    el.innerHTML = `
      <div class="msg-label">Assistant</div>
      <div class="msg-body">${escapeHtml(text)}</div>
    `;
    els.agentContent.appendChild(el);
    scrollToBottom();
    renderWelcome();
    return el;
  }

  function appendTextDelta(delta) {
    if (!state.currentStreamingEl) {
      state.currentStreamingEl = addAssistantMessage('');
    }
    const body = state.currentStreamingEl.querySelector('.msg-body');
    if (body) {
      body.textContent += delta;
      scrollToBottom();
    }
  }

  function finishStreaming() {
    state.currentStreamingEl = null;
  }

  function addToolActivity(activity) {
    const kind = activity.kind;
    if (kind === 'tool_start') {
      finishStreaming();
      const toolName = activity.toolName || 'tool';
      const el = document.createElement('div');
      el.className = 'tool-activity';
      el.dataset.toolId = activity.text;
      el.innerHTML = `
        <div class="tool-activity-header">
          <div class="tool-activity-title">
            <span class="tool-activity-status running">&#9654; Running</span>
            <span>${escapeHtml(toolName)}</span>
          </div>
          <span style="opacity:0.5;font-size:0.8em">&#9662;</span>
        </div>
        <div class="tool-activity-details">
          <div class="tool-activity-detail-row"><span class="key">Tool</span><span>${escapeHtml(toolName)}</span></div>
          <div class="tool-activity-detail-row"><span class="key">Input</span><span>${escapeHtml(activity.text)}</span></div>
        </div>
      `;
      el.querySelector('.tool-activity-header').addEventListener('click', () => {
        el.classList.toggle('expanded');
      });
      els.agentContent.appendChild(el);
      scrollToBottom();
      addActivity(toolName, activity.text, 'running');
      return el;
    }
    if (kind === 'tool_end') {
      const el = els.agentContent.querySelector(`[data-tool-id="${CSS.escape(activity.text)}"]`);
      if (el) {
        const statusEl = el.querySelector('.tool-activity-status');
        if (activity.success) {
          statusEl.className = 'tool-activity-status completed';
          statusEl.innerHTML = '&#10003; Completed';
          addActivity(activity.toolName || 'tool', 'Completed', 'completed');
        } else {
          statusEl.className = 'tool-activity-status failed';
          statusEl.innerHTML = '&#10007; Failed';
          addActivity(activity.toolName || 'tool', 'Failed', 'failed');
        }
      }
      return;
    }
    if (kind === 'command_output') {
      const el = document.createElement('div');
      el.className = 'terminal-block';
      el.innerHTML = `
        <div class="terminal-block-header">
          <span>Terminal</span>
          <span style="opacity:0.5;font-size:0.8em">${escapeHtml(activity.toolName || '')}</span>
        </div>
        <div class="terminal-block-body">${escapeHtml(activity.text)}</div>
      `;
      els.agentContent.appendChild(el);
      scrollToBottom();
      return;
    }
    if (kind === 'message') {
      addAssistantMessage(activity.text);
      return;
    }
    if (kind === 'error') {
      const el = document.createElement('div');
      el.className = 'chat-message assistant';
      el.innerHTML = `
        <div class="msg-label">Error</div>
        <div class="msg-body" style="color:var(--error)">${escapeHtml(activity.text)}</div>
      `;
      els.agentContent.appendChild(el);
      scrollToBottom();
      return;
    }
    if (kind === 'thinking') {
      // thinking events are transient; show in activity panel only
      addActivity('Thinking', activity.text, 'waiting');
      return;
    }
  }

  function addApprovalCard(approvalId, request) {
    const isBlocked = request.tier === 'blocked';
    const el = document.createElement('div');
    el.className = isBlocked ? 'dangerous-block' : 'approval-card';
    if (isBlocked) {
      el.innerHTML = `
        <div class="dangerous-title">&#9888; Dangerous Command Blocked</div>
        <div class="dangerous-command">${escapeHtml(request.whatWillRun)}</div>
        <div class="dangerous-desc">${escapeHtml(request.why)}</div>
        <div class="dangerous-buttons">
          <button class="close-btn" data-action="dismiss">Dismiss</button>
        </div>
      `;
      el.querySelector('[data-action="dismiss"]').addEventListener('click', () => el.remove());
    } else {
      el.innerHTML = `
        <div class="approval-title">&#9888; Approval Required</div>
        <div class="approval-command">${escapeHtml(request.whatWillRun)}</div>
        <div class="approval-desc">${escapeHtml(request.why)}</div>
        <div class="approval-buttons">
          <button class="approve-btn" data-action="approve">Approve</button>
          <button class="deny-btn" data-action="deny">Deny</button>
        </div>
      `;
      el.querySelector('[data-action="approve"]').addEventListener('click', () => {
        post({ type: 'approvalResponse', approvalId, approved: true });
        el.remove();
      });
      el.querySelector('[data-action="deny"]').addEventListener('click', () => {
        post({ type: 'approvalResponse', approvalId, approved: false });
        el.remove();
      });
    }
    els.agentContent.appendChild(el);
    scrollToBottom();
    addActivity(request.title, request.whatWillRun, isBlocked ? 'failed' : 'waiting');
  }

  function scrollToBottom() {
    els.agentContent.scrollTop = els.agentContent.scrollHeight;
  }

  // ===== RECENT LIST =====
  function renderRecentList(recent) {
    const list = $('recent-list');
    if (!list) return;
    if (!recent || recent.length === 0) {
      list.innerHTML = '<div style="padding:4px 14px;font-size:0.8em;color:var(--text-muted)">No recent conversations</div>';
      return;
    }
    list.innerHTML = recent.map((r) => `
      <div class="recent-item" data-id="${escapeHtml(r.id)}">
        <div class="recent-project">${escapeHtml(r.title || 'Conversation')}</div>
        <div class="recent-task">${timeAgo(r.updatedAt)}</div>
      </div>
    `).join('');
    list.querySelectorAll('.recent-item').forEach((el) => {
      el.addEventListener('click', () => {
        post({ type: 'openHistory', id: el.dataset.id });
        navigate('agent');
      });
    });
  }

  // ===== FILES PANEL =====
  function renderFiles(files) {
    if (!els.filesPanel) return;
    if (!files || files.length === 0) {
      els.filesPanel.innerHTML = '<div class="empty-state">No files found</div>';
      return;
    }
    els.filesPanel.innerHTML = files.map((f) => `
      <div class="file-item" data-path="${escapeHtml(f.path)}">
        <span class="file-icon">${f.isDirectory ? '&#128193;' : '&#128196;'}</span>
        <span class="file-name">${escapeHtml(f.name)}</span>
      </div>
    `).join('');
    els.filesPanel.querySelectorAll('.file-item').forEach((el) => {
      el.addEventListener('click', () => {
        post({ type: 'openFile', path: el.dataset.path });
      });
    });
  }

  // ===== TERMINAL PANEL =====
  function renderTerminalHistory(history) {
    if (!els.terminalPanel) return;
    if (!history || history.length === 0) {
      els.terminalPanel.innerHTML = '<div class="empty-state">No terminal commands yet</div>';
      return;
    }
    els.terminalPanel.innerHTML = history.map((h, i) => `
      <div class="terminal-history-item">
        <div class="th-header">
          <span class="th-command">${escapeHtml(h.command)}</span>
          <span style="opacity:0.5;font-size:0.8em">${timeAgo(h.ts)}</span>
        </div>
        <div class="th-body">${escapeHtml(h.output || '')}</div>
        <div class="th-actions">
          <button data-action="copy" data-idx="${i}">Copy</button>
          <button data-action="rerun" data-idx="${i}">Rerun</button>
        </div>
      </div>
    `).join('');
    els.terminalPanel.querySelectorAll('.th-actions button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const item = history[idx];
        if (!item) return;
        if (btn.dataset.action === 'copy') {
          post({ type: 'copyToClipboard', text: item.command });
        } else if (btn.dataset.action === 'rerun') {
          post({ type: 'rerunCommand', command: item.command });
        }
      });
    });
  }

  // ===== GIT PANEL =====
  function renderGitStatus(status) {
    if (!els.gitPanel) return;
    if (!status) {
      els.gitPanel.innerHTML = '<div class="empty-state">Not a git repository</div>';
      return;
    }
    const changes = status.changes || [];
    els.gitPanel.innerHTML = `
      <div class="git-section">
        <div class="git-section-title">Branch: ${escapeHtml(status.branch || 'unknown')}</div>
        <div class="git-section-title">${changes.length} change(s)</div>
        ${changes.map((c) => `
          <div class="git-file-item" data-path="${escapeHtml(c.path)}">
            <span class="git-status-badge ${c.status}">${c.status[0].toUpperCase()}</span>
            <span>${escapeHtml(c.path)}</span>
          </div>
        `).join('')}
      </div>
    `;
    els.gitPanel.querySelectorAll('.git-file-item').forEach((el) => {
      el.addEventListener('click', () => {
        post({ type: 'openFile', path: el.dataset.path });
      });
    });
  }

  // ===== SETTINGS PANEL =====
  function renderSettings(settings) {
    if (!els.settingsPanel) return;
    state.settings = settings;
    els.settingsPanel.innerHTML = `
      <div class="settings-section">
        <div class="settings-section-title">AI Provider</div>
        <div class="setting-row">
          <div class="setting-label">Provider</div>
          <div class="setting-control">
            <select id="set-provider">
              <option value="ollama" ${settings.provider === 'ollama' ? 'selected' : ''}>Ollama (local)</option>
              <option value="groq" ${settings.provider === 'groq' ? 'selected' : ''}>Groq (cloud)</option>
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-label">Model</div>
          <div class="setting-control">
            <input type="text" id="set-model" value="${escapeHtml(settings.model || '')}" placeholder="e.g. qwen2.5-coder:7b" />
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-label">Max iterations</div>
          <div class="setting-control">
            <input type="number" id="set-iterations" value="${settings.maxAgentIterations || 20}" min="1" max="100" />
          </div>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">Security</div>
        <div class="setting-row">
          <div class="setting-label">Require command approval</div>
          <div class="setting-control">
            <input type="checkbox" id="set-req-cmd" ${settings.requireCommandApproval ? 'checked' : ''} />
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-label">Require file approval</div>
          <div class="setting-control">
            <input type="checkbox" id="set-req-file" ${settings.requireFileApproval ? 'checked' : ''} />
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-label">Enable project memory</div>
          <div class="setting-control">
            <input type="checkbox" id="set-memory" ${settings.enableProjectMemory ? 'checked' : ''} />
          </div>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">API Keys</div>
        <div class="setting-row">
          <div class="setting-label">Groq API Key</div>
          <div class="setting-control">
            <input type="text" id="set-groq-key" value="${escapeHtml(settings.groqApiKey || '')}" placeholder="gsk_..." />
            <button data-action="save-groq">Save</button>
          </div>
        </div>
        <div style="font-size:0.8em;color:var(--text-muted)">Keys are stored securely in VS Code secret storage, never in the webview.</div>
      </div>
    `;
    // Wire settings controls
    const bind = (id, key, isCheckbox) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('change', () => {
        const val = isCheckbox ? el.checked : el.value;
        post({ type: 'updateSetting', key, value: val });
      });
    };
    bind('set-provider', 'provider');
    bind('set-model', 'model');
    bind('set-iterations', 'maxAgentIterations');
    bind('set-req-cmd', 'requireCommandApproval', true);
    bind('set-req-file', 'requireFileApproval', true);
    bind('set-memory', 'enableProjectMemory', true);
    const saveGroq = els.settingsPanel.querySelector('[data-action="save-groq"]');
    if (saveGroq) {
      saveGroq.addEventListener('click', () => {
        const keyEl = $('set-groq-key');
        if (keyEl && keyEl.value.trim()) {
          post({ type: 'saveGroqKey', key: keyEl.value.trim() });
          keyEl.value = '';
        }
      });
    }
  }

  // ===== MESSAGE HANDLING (from extension) =====
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'status':
        state.connected = msg.connected;
        state.statusMessage = msg.message || '';
        state.model = msg.model || state.model;
        state.provider = msg.provider || state.provider;
        updateProviderUI();
        renderProviderPanel();
        updateAgentStatus(state.agentRunning ? 'running' : (state.connected ? 'ready' : 'error'), state.statusMessage);
        const footerPs = $('footer-provider-status');
        if (footerPs) footerPs.textContent = `Provider: ${state.provider} ${state.connected ? '(connected)' : '(offline)'}`;
        break;
      case 'models':
        state.models = msg.models || [];
        break;
      case 'userMessage':
        addUserMessage(msg.text);
        renderWelcome();
        break;
      case 'agentStart':
        state.agentRunning = true;
        finishStreaming();
        updateAgentStatus('running', 'Processing...');
        els.composerSend.disabled = true;
        els.stopBtn.classList.remove('hidden');
        break;
      case 'activity':
        addToolActivity(msg.activity);
        break;
      case 'textDelta':
        appendTextDelta(msg.delta);
        break;
      case 'agentDone':
        state.agentRunning = false;
        finishStreaming();
        updateAgentStatus('completed');
        els.composerSend.disabled = false;
        els.stopBtn.classList.add('hidden');
        break;
      case 'agentStopped':
        state.agentRunning = false;
        finishStreaming();
        updateAgentStatus('cancelled', msg.reason);
        els.composerSend.disabled = false;
        els.stopBtn.classList.add('hidden');
        break;
      case 'approvalRequest':
        addApprovalCard(msg.approvalId, msg.request);
        updateAgentStatus('waiting', msg.request.title);
        break;
      case 'error':
        const errEl = document.createElement('div');
        errEl.className = 'chat-message assistant';
        errEl.innerHTML = `
          <div class="msg-label">Error</div>
          <div class="msg-body" style="color:var(--error)">${escapeHtml(msg.text)}</div>
        `;
        els.agentContent.appendChild(errEl);
        scrollToBottom();
        break;
      case 'cleared':
        state.messages = [];
        state.activities = [];
        els.agentContent.innerHTML = '';
        els.agentContent.appendChild(els.welcomeState);
        renderWelcome();
        renderLiveActivity();
        updateAgentStatus('ready');
        break;
      case 'filesList':
        renderFiles(msg.files);
        break;
      case 'terminalHistory':
        renderTerminalHistory(msg.history);
        break;
      case 'gitStatus':
        state.gitStatus = msg.status;
        renderGitStatus(msg.status);
        updateWorkspaceInfo();
        break;
      case 'settingsData':
        renderSettings(msg.settings);
        break;
      case 'workspaceInfo':
        state.workspaceRoot = msg.root || '';
        state.workspaceName = msg.name || '';
        updateWorkspaceInfo();
        const footerWs = $('footer-workspace');
        if (footerWs) footerWs.textContent = state.workspaceName || 'No workspace';
        break;
      case 'tasksList':
        state.tasks = msg.tasks || [];
        break;
      case 'historyList':
        state.history = msg.history || [];
        break;
      case 'recentList':
        renderRecentList(msg.recent);
        break;
    }
  });

  // ===== EVENT WIRING =====
  function init() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.addEventListener('click', () => navigate(el.dataset.view));
    });

    // Provider selector
    els.providerSelector.addEventListener('click', () => {
      post({ type: 'toggleProviderPanel' });
    });

    // New task
    const newTaskBtn = $('new-task-btn');
    if (newTaskBtn) {
      newTaskBtn.addEventListener('click', () => {
        post({ type: 'newChat' });
        navigate('agent');
      });
    }

    // Composer
    els.composerSend.addEventListener('click', sendMessage);
    els.composerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Stop button
    els.stopBtn.addEventListener('click', () => {
      post({ type: 'stopAgent' });
    });

    // Welcome suggestions
    document.querySelectorAll('.suggestion-btn').forEach((el) => {
      el.addEventListener('click', () => {
        els.composerInput.value = el.dataset.prompt || '';
        els.composerInput.focus();
      });
    });

    // Initial state
    updateProviderUI();
    renderWelcome();
    renderLiveActivity();
    updateAgentStatus('ready', 'Initializing...');
    updateWorkspaceInfo();
    renderProviderPanel();

    post({ type: 'ready' });
    post({ type: 'getWorkspaceInfo' });
  }

  function sendMessage() {
    const text = els.composerInput.value.trim();
    if (!text) return;
    if (state.agentRunning) return;
    els.composerInput.value = '';
    post({ type: 'sendMessage', text });
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
