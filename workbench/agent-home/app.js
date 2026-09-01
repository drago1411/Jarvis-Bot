const $ = (id) => document.getElementById(id);

const messages = [];
let count = 0;

function setStatus(ok, text) {
  $('status-dot').classList.toggle('on', ok);
  $('status-text').textContent = text;
}

function tickClock() {
  $('widget-clock').textContent = new Date().toLocaleTimeString();
}

function addActivity(role, text) {
  const list = $('activity-list');
  if (list.querySelector('.empty')) list.innerHTML = '';

  const li = document.createElement('li');
  li.innerHTML = `<span>${role === 'user' ? 'You' : 'JARVIS'} · ${new Date().toLocaleTimeString()}</span>${text}`;
  list.prepend(li);

  while (list.children.length > 20) list.removeChild(list.lastChild);
}

async function init() {
  tickClock();
  setInterval(tickClock, 1000);

  try {
    const r = await fetch('/api/health');
    const d = await r.json();
    setStatus(d.ollama, d.ollama ? `Ollama online · ${d.model}` : 'Ollama offline');
    $('widget-ollama').textContent = d.ollama ? 'Online' : 'Offline';
    $('widget-model').textContent = d.model || '–';
  } catch {
    setStatus(false, 'Server unreachable');
    $('widget-ollama').textContent = 'Error';
  }
}

async function sendMessage(text) {
  messages.push({ role: 'user', content: text });
  addActivity('user', text);
  $('widget-count').textContent = ++count;

  $('send-btn').disabled = true;
  $('chat-input').disabled = true;
  $('typing').classList.remove('hidden');

  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    messages.push({ role: 'assistant', content: d.reply });
    addActivity('assistant', d.reply);
  } catch (err) {
    addActivity('assistant', '⚠️ ' + err.message);
  } finally {
    $('send-btn').disabled = false;
    $('chat-input').disabled = false;
    $('typing').classList.add('hidden');
    $('chat-input').focus();
  }
}

$('chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('chat-input').value.trim();
  if (!v) return;
  $('chat-input').value = '';
  sendMessage(v);
});

init();
