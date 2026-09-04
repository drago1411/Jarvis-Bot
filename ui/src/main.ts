/**
 * JARVIS UI — Main entry point
 * Wires up chat interface, persistent memory, active agent badge,
 * live project previews, telemetry, voice, and markdown rendering.
 */

import { sendMessage, checkHealth } from './chat.js';
import { marked } from 'marked';
import { voice } from './voice.js';
import { showToast } from './toast.js';
import { initTheme, setTheme, getCurrentTheme, Theme } from './themes.js';
import { startTickerPolling } from './ticker.js';

// Configure marked for secure rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

// ─── State ───────────────────────────────────────
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Project {
  name: string;
  path: string;
  description: string;
  status: string;
  tech_stack: string;
}

const state = {
  history: [] as Message[],
  projects: [] as Project[],
  isProcessing: false,
};

// ─── DOM Elements ────────────────────────────────
const $ = (id: string) => document.getElementById(id)!;
const chatMessages      = $('chat-messages');
const chatForm          = $('chat-form') as HTMLFormElement;
const chatInput         = $('chat-input') as HTMLInputElement;
const sendBtn           = $('send-btn') as HTMLButtonElement;
const thinkingEl        = $('thinking-indicator');
const statusDot         = $('status-dot');
const statusText        = $('status-text');
const hudModel          = $('hud-model');
const activityList      = $('activity-list');
const sysModel          = $('sys-model');
const activeAgentName   = $('active-agent-name');
const projectsList      = $('projects-list');
const projectCount      = $('project-count');
const arcReactor        = $('arc-reactor');
const themeSelect       = $('theme-select') as HTMLSelectElement | null;
const planList          = $('plan-list');
const planProgressBadge = $('plan-progress-badge');
const meterPlan         = $('meter-plan');

// Ticker DOM Elements
const tickBtc           = $('tick-btc');
const tickEth           = $('tick-eth');
const tickSol           = $('tick-sol');
const tickGold          = $('tick-gold');
const tickUsdinr        = $('tick-usdinr');

// Preview Modal elements
const previewModal      = $('preview-modal');
const previewIframe     = $('preview-iframe') as HTMLIFrameElement;
const previewTitle      = $('preview-project-name');
const previewExternal   = $('preview-external-btn') as HTMLAnchorElement;
const previewCloseBtn   = $('preview-close-btn');

// Approval Modal elements
const approvalModal     = $('approval-modal');
const approvalCmd       = $('approval-cmd');
const approvalDir       = $('approval-dir');
const approvalApproveBtn = $('approval-approve-btn');
const approvalDenyBtn   = $('approval-deny-btn');

// Telemetry elements
const telemetryCpu      = $('telemetry-cpu');
const telemetryRam      = $('telemetry-ram');
const telemetryDisk     = $('telemetry-disk');
const telemetryUptime   = $('telemetry-uptime');
const meterCpu          = $('meter-cpu');
const meterRam          = $('meter-ram');
const meterDisk         = $('meter-disk');

// Mobile sidebar toggle
const sidebarToggle     = $('sidebar-toggle');
const activityPanel     = $('activity-panel');

// Mic button
const micBtn            = $('mic-btn');

// ─── Init & Boot ─────────────────────────────────
async function init(): Promise<void> {
  setGreeting();

  // 0. Initialize theme
  initTheme();
  if (themeSelect) {
    themeSelect.value = getCurrentTheme();
    themeSelect.addEventListener('change', (e) => {
      const selected = (e.target as HTMLSelectElement).value as Theme;
      setTheme(selected);
      showToast(`Switched theme to ${selected}`, 'info');
    });
  }

  // 1. Health check
  const health = await checkHealth();
  if (health.online) {
    statusDot.classList.add('online');
    statusText.textContent = 'Online';
    hudModel.textContent = health.model || '';
    sysModel.textContent = health.model || '—';
    showToast('JARVIS Systems Online', 'success');
  } else {
    statusDot.classList.add('error');
    statusText.textContent = 'Server offline';
    showToast('Server connection offline', 'error');
  }

  // 2. Load SQLite history & projects
  await loadHistoryAndProjects();

  // 3. Start Live Telemetry Polling (every 3 seconds)
  updateTelemetry();
  setInterval(updateTelemetry, 3000);

  // 4. Start Live Market Ticker Polling (every 60 seconds)
  startTickerPolling((data) => {
    if (tickBtc) tickBtc.textContent = data.btc;
    if (tickEth) tickEth.textContent = data.eth;
    if (tickSol) tickSol.textContent = data.sol;
    if (tickGold) tickGold.textContent = data.gold;
    if (tickUsdinr) tickUsdinr.textContent = data.usdinr;
  });

  // 5. Setup modal close handlers
  previewCloseBtn.addEventListener('click', () => {
    previewModal.classList.add('hidden');
    previewIframe.src = 'about:blank';
  });

  // 6. Mobile sidebar toggle
  sidebarToggle.addEventListener('click', () => {
    activityPanel.classList.toggle('panel-open');
  });

  // 7. Voice: Mic button
  micBtn.addEventListener('mousedown', startVoiceInput);
  micBtn.addEventListener('mouseup', stopVoiceInput);
  micBtn.addEventListener('mouseleave', stopVoiceInput);
  micBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startVoiceInput(); });
  micBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopVoiceInput(); });

  // 8. Spacebar hold-to-talk (only when input not focused)
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.activeElement !== chatInput && !state.isProcessing) {
      e.preventDefault();
      startVoiceInput();
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && document.activeElement !== chatInput) {
      stopVoiceInput();
    }
  });

  // 9. Arc Reactor voice animation listeners
  window.addEventListener('jarvis-speech-start', () => {
    arcReactor.classList.add('arc-speaking');
  });
  window.addEventListener('jarvis-speech-end', () => {
    arcReactor.classList.remove('arc-speaking');
  });

  // 10. Voice Barge-In: interrupt speech immediately when typing or clicking input
  chatInput.addEventListener('focus', () => voice.bargeIn());
  chatInput.addEventListener('keydown', () => voice.bargeIn());

  chatInput.focus();
}

// ─── Voice Input ─────────────────────────────────
function startVoiceInput(): void {
  if (voice.isListening() || state.isProcessing) return;
  micBtn.classList.add('mic-active');
  arcReactor.classList.add('arc-listening');

  voice.startListening((transcript: string) => {
    micBtn.classList.remove('mic-active');
    arcReactor.classList.remove('arc-listening');
    chatInput.value = transcript;
    // Auto-submit after recognition
    handleUserMessage(transcript);
  });
}

function stopVoiceInput(): void {
  if (!voice.isListening()) return;
  voice.stopListening();
  micBtn.classList.remove('mic-active');
  arcReactor.classList.remove('arc-listening');
}

// ─── Telemetry ───────────────────────────────────
async function updateTelemetry(): Promise<void> {
  try {
    const res = await fetch('/api/system');
    if (!res.ok) return;
    const data = await res.json() as {
      cpu: string; cpuPct: number;
      ram: string; ramPct: number;
      disk: string; diskPct: number;
      uptime: string;
    };

    telemetryCpu.textContent = data.cpu;
    meterCpu.style.width = `${data.cpuPct}%`;
    meterCpu.style.background = data.cpuPct > 80 ? 'var(--color-error)' : 'var(--color-accent)';

    telemetryRam.textContent = data.ram;
    meterRam.style.width = `${data.ramPct}%`;
    meterRam.style.background = data.ramPct > 85 ? 'var(--color-warning, var(--color-accent))' : 'var(--color-accent)';

    telemetryDisk.textContent = data.disk;
    meterDisk.style.width = `${data.diskPct}%`;
    meterDisk.style.background = data.diskPct > 90 ? 'var(--color-error)' : 'var(--color-accent)';

    telemetryUptime.textContent = data.uptime;
  } catch {
    // Silent fail if server is reloading
  }
}

// ─── History & Projects ──────────────────────────
async function loadHistoryAndProjects(): Promise<void> {
  try {
    const res = await fetch('/api/history');
    if (!res.ok) return;
    const data = await res.json() as { history: Message[]; projects: Project[] };

    state.projects = data.projects || [];
    renderProjectsSidebar();

    if (data.history && data.history.length > 0) {
      state.history = data.history;
      const welcome = document.getElementById('welcome-msg');
      if (welcome) welcome.remove();

      for (const msg of data.history) {
        appendMessage(msg.role, msg.content);
      }
    }
  } catch (err) {
    console.warn('Could not load history from server:', err);
  }
}

function renderProjectsSidebar(): void {
  projectCount.textContent = String(state.projects.length);
  if (state.projects.length === 0) {
    projectsList.innerHTML = '<div class="activity-empty">No projects built yet</div>';
    return;
  }

  projectsList.innerHTML = state.projects.map(p => `
    <div class="project-item">
      <span class="project-item-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
      <button class="project-preview-btn" onclick="window.openPreview('${escapeHtml(p.path)}', '${escapeHtml(p.name)}')">View</button>
    </div>
  `).join('');
}

(window as any).openPreview = (path: string, name: string) => {
  const cleanPath = path.replace(/\\/g, '/').replace(/^\/+/, '');
  const url = `/projects/${cleanPath}/index.html`;
  previewTitle.textContent = name;
  previewExternal.href = url;
  previewIframe.src = url;
  previewModal.classList.remove('hidden');
};

function setGreeting(): void {
  const welcomeMsg = $('welcome-msg');
  if (!welcomeMsg) return;
  const hour = new Date().getHours();
  let greeting = 'Good evening';
  if (hour >= 5 && hour < 12) greeting = 'Good morning';
  else if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
  else if (hour >= 21 || hour < 5) greeting = 'Working late';

  const content = welcomeMsg.querySelector('.message-content');
  if (content) {
    content.innerHTML = `
      <p>${greeting}, sir. All systems operational.</p>
      <p>I'm connected to persistent memory and ready to plan, code, debug, test, and deploy.</p>
    `;
  }
}

// ─── Chat Submission ─────────────────────────────
chatForm.addEventListener('submit', (e: Event) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || state.isProcessing) return;
  chatInput.value = '';
  handleUserMessage(text);
});

async function handleUserMessage(text: string): Promise<void> {
  state.isProcessing = true;
  sendBtn.disabled = true;
  chatInput.disabled = true;
  thinkingEl.classList.remove('hidden');

  appendMessage('user', text);
  state.history.push({ role: 'user', content: text });

  clearActivity();
  setAgentRole('ORCHESTRATOR');

  const assistantEl = createAssistantContainer();
  let assistantContent = '';

  await sendMessage(text, state.history, {
    onText: (content: string) => {
      assistantContent += content;
      renderAssistantContent(assistantEl, assistantContent);
      scrollToBottom();
    },

    onToolStart: (name: string, args: Record<string, unknown>) => {
      updateAgentRoleForTool(name, args);
      const card = document.createElement('div');
      card.className = 'tool-card tool-card-start';
      card.innerHTML = `⚡ <span class="tool-name">${escapeHtml(name)}</span> — ${escapeHtml(formatArgs(args))}`;
      assistantEl.querySelector('.message-content')!.appendChild(card);
      scrollToBottom();
      addActivity(name, 'running');
    },

    onToolResult: (name: string, result: string) => {
      const card = document.createElement('div');
      card.className = 'tool-card tool-card-result';
      card.textContent = result.slice(0, 500) + (result.length > 500 ? '\n...(truncated)' : '');
      assistantEl.querySelector('.message-content')!.appendChild(card);
      scrollToBottom();
      updateActivity(name, 'done');

      if (name === 'patch_file') {
        renderPatchDiffCard(result, assistantEl);
      } else if (name === 'write_file' && result.includes('Δ')) {
        renderWriteDiffCard(result, assistantEl);
      }

      if (name === 'register_project' || (name === 'write_file' && String(result).includes('index.html'))) {
        checkForProjectCreation(result, assistantEl);
      }
    },

    onTaskPlan: (data: { tasks: Array<{ id: string; title: string; status: string }>; progressPct: number }) => {
      renderMissionPlan(data.tasks, data.progressPct);
    },

    onCommandApproval: (data: { approvalId: string; command: string; dir: string }) => {
      approvalCmd.textContent = data.command;
      approvalDir.textContent = `Target directory: ${data.dir || 'workspace root'}`;
      approvalModal.classList.remove('hidden');

      const respond = async (approved: boolean) => {
        approvalModal.classList.add('hidden');
        await fetch('/api/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approvalId: data.approvalId, approved }),
        });
      };

      approvalApproveBtn.onclick = () => respond(true);
      approvalDenyBtn.onclick = () => respond(false);
    },

    onError: (message: string) => {
      const card = document.createElement('div');
      card.className = 'tool-card tool-card-error';
      card.textContent = `❌ ${message}`;
      assistantEl.querySelector('.message-content')!.appendChild(card);
      scrollToBottom();
    },

    onDone: () => {
      if (assistantContent) {
        state.history.push({ role: 'assistant', content: assistantContent });
        // Speak the response aloud (British voice)
        voice.speak(assistantContent);
      }
      setAgentRole('STANDBY');
      loadHistoryAndProjects();
    },
  });

  state.isProcessing = false;
  sendBtn.disabled = false;
  chatInput.disabled = false;
  thinkingEl.classList.add('hidden');
  chatInput.focus();
}

// ─── Agent Role ──────────────────────────────────
function setAgentRole(role: string): void {
  activeAgentName.textContent = role;
}

function updateAgentRoleForTool(toolName: string, args: Record<string, unknown>): void {
  if (toolName === 'write_file' || toolName === 'delete_file') {
    setAgentRole('CODER');
  } else if (toolName === 'run_shell') {
    const cmd = String(args['command'] || '');
    if (cmd.includes('test') || cmd.includes('vitest')) setAgentRole('TESTER');
    else if (cmd.includes('tsc') || cmd.includes('lint') || cmd.includes('build')) setAgentRole('DEBUGGER');
    else setAgentRole('CODER');
  } else if (toolName === 'run_tests') {
    setAgentRole('TESTER');
  } else if (toolName === 'web_search' || toolName === 'fetch_page') {
    setAgentRole('INTELLIGENCE');
  } else if (toolName.includes('memory') || toolName.includes('project') || toolName.includes('fact')) {
    setAgentRole('MEMORY');
  } else if (toolName.startsWith('git_') || toolName.startsWith('npm_')) {
    setAgentRole('DEVOPS');
  } else {
    setAgentRole('PLANNER');
  }
}

// ─── Project Preview ─────────────────────────────
function checkForProjectCreation(result: string, assistantEl: HTMLElement): void {
  const match = result.match(/workbench[\\/]projects[\\/]([^\\/\s]+)/i);
  const projectName = match && match[1] ? match[1] : 'web-project';

  if (assistantEl.querySelector('.project-card-launch')) return;

  const launchCard = document.createElement('div');
  launchCard.className = 'project-card-launch';
  launchCard.innerHTML = `
    <div>
      <strong>✨ Web Application Ready</strong>
      <div style="font-size: 0.75rem; color: var(--color-text-dim);">Project: ${escapeHtml(projectName)}</div>
    </div>
    <button class="launch-btn" onclick="window.openPreview('${escapeHtml(projectName)}', '${escapeHtml(projectName)}')">
      👁️ Preview Live Project
    </button>
  `;

  assistantEl.querySelector('.message-content')!.appendChild(launchCard);
  scrollToBottom();
}

// ─── Mission Plan & Diff Card Helpers ───────────
function renderMissionPlan(tasks: Array<{ id: string; title: string; status: string }>, progressPct: number): void {
  if (planProgressBadge) planProgressBadge.textContent = `${progressPct}%`;
  if (meterPlan) meterPlan.style.width = `${progressPct}%`;

  if (!tasks || tasks.length === 0) {
    if (planList) planList.innerHTML = '<div class="activity-empty">No active mission plan</div>';
    return;
  }

  const icons: Record<string, string> = {
    completed: '✓',
    in_progress: '⟳',
    pending: '○',
  };

  if (planList) {
    planList.innerHTML = tasks.map(t => `
      <div class="plan-item ${t.status}">
        <span class="plan-status-icon">${icons[t.status] || '○'}</span>
        <span class="plan-title">${escapeHtml(t.title)}</span>
      </div>
    `).join('');
  }
}

function renderPatchDiffCard(result: string, assistantEl: HTMLElement): void {
  const card = document.createElement('div');
  card.className = 'diff-card';
  card.innerHTML = `
    <div class="diff-header">
      <span>📝 Code Patch Applied</span>
      <span style="color: var(--color-success)">Clean Diff</span>
    </div>
    <div class="diff-body">
      <div class="diff-line diff-line-info">@@ Modification Summary @@</div>
      <div class="diff-line diff-line-add">+ ${escapeHtml(result.replace(/^✅\s*/, ''))}</div>
    </div>
  `;
  assistantEl.querySelector('.message-content')!.appendChild(card);
  scrollToBottom();
}

function renderWriteDiffCard(result: string, assistantEl: HTMLElement): void {
  const match = result.match(/Δ\s*([+\d\s\-]+lines)/i);
  if (!match) return;

  const card = document.createElement('div');
  card.className = 'diff-card';
  card.innerHTML = `
    <div class="diff-header">
      <span>📄 File Write Delta</span>
      <span style="color: var(--color-accent)">${escapeHtml(match[1])}</span>
    </div>
  `;
  assistantEl.querySelector('.message-content')!.appendChild(card);
  scrollToBottom();
}

// ─── UI Helpers ──────────────────────────────────
function appendMessage(role: 'user' | 'assistant', content: string): void {
  const div = document.createElement('div');
  div.className = `message message-${role}`;

  const avatar = role === 'user'
    ? '<div class="avatar-user">H</div>'
    : '<div class="avatar-jarvis">⬡</div>';

  const name = role === 'user' ? 'You' : 'JARVIS';
  const rendered = role === 'assistant' ? renderMarkdown(content) : escapeHtml(content);

  div.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-body">
      <span class="message-name">${name}</span>
      <div class="message-content">${rendered}</div>
    </div>
  `;

  chatMessages.appendChild(div);
  scrollToBottom();
}

function createAssistantContainer(): HTMLElement {
  const div = document.createElement('div');
  div.className = 'message message-assistant';
  div.innerHTML = `
    <div class="message-avatar"><div class="avatar-jarvis">⬡</div></div>
    <div class="message-body">
      <span class="message-name">JARVIS</span>
      <div class="message-content"></div>
    </div>
  `;
  chatMessages.appendChild(div);
  return div;
}

function renderAssistantContent(el: HTMLElement, content: string): void {
  const container = el.querySelector('.message-content')!;
  let textEl = container.querySelector('.jarvis-text') as HTMLElement | null;
  if (!textEl) {
    textEl = document.createElement('div');
    textEl.className = 'jarvis-text';
    container.insertBefore(textEl, container.firstChild);
  }
  textEl.innerHTML = renderMarkdown(content);
}

/**
 * Render markdown to HTML using marked.js
 */
function renderMarkdown(text: string): string {
  try {
    return marked.parse(text) as string;
  } catch {
    return escapeHtml(text);
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  return entries
    .map(([k, v]) => {
      const val = typeof v === 'string' ? (v.length > 50 ? v.slice(0, 50) + '...' : v) : String(v);
      return `${k}: ${val}`;
    })
    .join(', ');
}

function scrollToBottom(): void {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function clearActivity(): void {
  activityList.innerHTML = '';
}

function addActivity(name: string, status: string): void {
  const empty = activityList.querySelector('.activity-empty');
  if (empty) empty.remove();

  const item = document.createElement('div');
  item.className = `activity-item ${status === 'running' ? 'running' : ''}`;
  item.id = `activity-${name}`;
  item.innerHTML = `
    <span class="tool-label">${escapeHtml(name)}</span>
    <span class="tool-status">${status === 'running' ? '⟳ Running' : '✅ Done'}</span>
  `;
  activityList.prepend(item);
}

function updateActivity(name: string, status: string): void {
  const item = document.getElementById(`activity-${name}`);
  if (item) {
    item.classList.remove('running');
    const statusEl = item.querySelector('.tool-status');
    if (statusEl) statusEl.textContent = '✅ Done';
  }
}

// ─── Boot ────────────────────────────────────────
init();
