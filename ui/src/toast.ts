/**
 * JARVIS UI — Toast Notification Engine
 */

export type ToastType = 'info' | 'success' | 'warn' | 'error';

export function showToast(message: string, type: ToastType = 'info', durationMs: number = 3500): void {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = type === 'success' ? '✅' : type === 'warn' ? '⚠️' : type === 'error' ? '❌' : '⚡';
  
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
    <button class="toast-close" aria-label="Dismiss">✕</button>
  `;

  const closeBtn = toast.querySelector('.toast-close') as HTMLButtonElement;
  closeBtn?.addEventListener('click', () => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 250);
  });

  container.appendChild(toast);

  // Trigger enter animation
  requestAnimationFrame(() => {
    toast.classList.add('toast-enter');
  });

  // Auto dismiss
  setTimeout(() => {
    if (toast.parentElement) {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 250);
    }
  }, durationMs);
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
