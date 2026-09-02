/**
 * JARVIS UI — Main entry point
 * Wires up the chat interface, activity panel, and system status.
 */

import { sendMessage, checkHealth } from './chat.js';

// ─── State ───────────────────────────────────────
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const state = {
  history: [] as Message[],
  isProcessing: false,
  messageCount: 0,
};

// ─── DOM Elements ────────────────────────────────
const $ = (id: string) => document.getElementById(id)!;
const chatMessages   = $('chat-messages');
const chatForm       = $('chat-form') as HTMLFormElement;
const chatInput      = $('chat-input') as HTMLInputElement;
const sendBtn        = $('send-btn') as HTMLButtonElement;
const thinkingEl     = $('thinking-indicator');
const statusDot      = $('status-dot');
const statusText     = $('status-text');
const hudModel       = $('hud-model');
const activityList   = $('activity-list');
const sysStatus      = $('sys-status');
const sysModel       = $('sys-model');
const sysMessages    = $('sys-messages');

// ─── Init ────────────────────────────────────────
async function init(): Promise<void> {
  // Set time-based greeting
  setGreeting();

  // Check server health
  const health = await checkHealth();
  if (health.online) {
    statusDot.classList.add('online');
    statusText.textContent = 'Online';
    hudModel.textContent = health.model || '';
    sysStatus.textContent = 'Online';
    sysModel.textContent = health.model || '—';
  } else {
    statusDot.classList.add('error');
    statusText.textContent = 'Server offline';
    sysStatus.textContent = 'Offline';
  }

  // Focus input
  chatInput.focus();
}

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
      <p>I'm ready to build, debug, test, and deploy — just tell me what you need.</p>
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

  // Add user message to UI
  appendMessage('user', text);
  state.history.push({ role: 'user', content: text });
  state.messageCount++;
  sysMessages.textContent = String(state.messageCount);

  // Clear activity panel
  clearActivity();

  // Create assistant message container (will be filled by stream)
  const assistantEl = createAssistantContainer();
  let assistantContent = '';

  await sendMessage(text, state.history, {
    onText: (content: string) => {
      assistantContent += content;
      renderAssistantContent(assistantEl, assistantContent);
      scrollToBottom();
    },

    onToolStart: (name: string, args: Record<string, unknown>) => {
      // Show in chat
      const card = document.createElement('div');
      card.className = 'tool-card tool-card-start';
      card.innerHTML = `⚡ <span class="tool-name">${escapeHtml(name)}</span> — ${escapeHtml(formatArgs(args))}`;
      assistantEl.querySelector('.message-content')!.appendChild(card);
      scrollToBottom();

      // Show in activity panel
      addActivity(name, 'running');
    },

    onToolResult: (name: string, result: string) => {
      const card = document.createElement('div');
      card.className = 'tool-card tool-card-result';
      card.textContent = result.slice(0, 500) + (result.length > 500 ? '\n...(truncated)' : '');
      assistantEl.querySelector('.message-content')!.appendChild(card);
      scrollToBottom();

      // Update activity panel
      updateActivity(name, 'done');
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
      }
      state.messageCount++;
      sysMessages.textContent = String(state.messageCount);
    },
  });

  // Re-enable input
  state.isProcessing = false;
  sendBtn.disabled = false;
  chatInput.disabled = false;
  thinkingEl.classList.add('hidden');
  chatInput.focus();
}

// ─── UI Helpers ──────────────────────────────────
function appendMessage(role: 'user' | 'assistant', content: string): void {
  const div = document.createElement('div');
  div.className = `message message-${role}`;

  const avatar = role === 'user'
    ? '<div class="avatar-user">H</div>'
    : '<div class="avatar-jarvis">⬡</div>';

  const name = role === 'user' ? 'You' : 'JARVIS';

  div.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-body">
      <span class="message-name">${name}</span>
      <div class="message-content"><p>${escapeHtml(content)}</p></div>
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

  // Find or create the text paragraph (separate from tool cards)
  let textEl = container.querySelector('.jarvis-text') as HTMLElement | null;
  if (!textEl) {
    textEl = document.createElement('div');
    textEl.className = 'jarvis-text';
    // Insert before any tool cards
    container.insertBefore(textEl, container.firstChild);
  }

  // Simple markdown-ish rendering
  textEl.innerHTML = simpleMarkdown(content);
}

function simpleMarkdown(text: string): string {
  return escapeHtml(text)
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Line breaks → paragraphs
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    // Wrap in paragraph
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
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
      const val = typeof v === 'string' ? (v.length > 60 ? v.slice(0, 60) + '...' : v) : String(v);
      return `${k}: ${val}`;
    })
    .join(', ');
}

function scrollToBottom(): void {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ─── Activity Panel ──────────────────────────────
function clearActivity(): void {
  activityList.innerHTML = '';
}

function addActivity(name: string, status: string): void {
  // Remove empty state
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
