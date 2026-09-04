/**
 * JARVIS Chat Client — handles SSE streaming from the server.
 */

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface StreamCallbacks {
  onText: (content: string) => void;
  onToolStart: (name: string, args: Record<string, unknown>) => void;
  onToolResult: (name: string, result: string) => void;
  onCommandApproval?: (data: { approvalId: string; command: string; dir: string }) => void;
  onTaskPlan?: (data: { tasks: Array<{ id: string; title: string; status: 'pending' | 'in_progress' | 'completed' }>; progressPct: number }) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

/**
 * Sends a message to JARVIS and streams back the response via SSE.
 * Uses fetch + ReadableStream since EventSource only supports GET.
 */
export async function sendMessage(
  message: string,
  history: ChatMessage[],
  callbacks: StreamCallbacks,
): Promise<void> {
  let response: Response;

  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    });
  } catch {
    callbacks.onError('Cannot reach JARVIS server. Is it running on port 3000?');
    callbacks.onDone();
    return;
  }

  if (!response.ok || !response.body) {
    callbacks.onError(`Server error: ${response.status} ${response.statusText}`);
    callbacks.onDone();
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from the buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      let eventType = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);
            handleEvent(eventType, parsed, callbacks);
          } catch {
            // Ignore malformed JSON lines
          }
        }
      }
    }
  } catch (err) {
    callbacks.onError(`Stream interrupted: ${(err as Error).message}`);
  }

  callbacks.onDone();
}

/**
 * Routes a parsed SSE event to the correct callback.
 */
function handleEvent(
  type: string,
  data: Record<string, unknown>,
  callbacks: StreamCallbacks,
): void {
  switch (type) {
    case 'text':
      callbacks.onText(data['content'] as string);
      break;
    case 'tool_start':
      callbacks.onToolStart(
        data['name'] as string,
        (data['args'] as Record<string, unknown>) || {},
      );
      break;
    case 'tool_result':
      callbacks.onToolResult(
        data['name'] as string,
        data['result'] as string,
      );
      break;
    case 'command_approval':
      if (callbacks.onCommandApproval) {
        callbacks.onCommandApproval(data as any);
      }
      break;
    case 'task_plan':
      if (callbacks.onTaskPlan) {
        callbacks.onTaskPlan(data as any);
      }
      break;
    case 'error':
      callbacks.onError(data['message'] as string);
      break;
    case 'done':
      // Handled by the main loop
      break;
  }
}

/**
 * Checks if the JARVIS server is reachable.
 */
export async function checkHealth(): Promise<{
  online: boolean;
  model?: string;
}> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return { online: false };
    const data = await res.json();
    return { online: true, model: data.model };
  } catch {
    return { online: false };
  }
}
