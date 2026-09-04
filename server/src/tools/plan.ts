import type { ToolDefinition, ToolExecutionContext } from '../types.js';

interface TaskItem {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export let currentPlan: TaskItem[] = [];

async function managePlanHandler(args: Record<string, unknown>, context?: ToolExecutionContext): Promise<string> {
  const rawTasks = args['tasks'] as Array<Record<string, unknown>> | undefined;

  if (!rawTasks || !Array.isArray(rawTasks) || rawTasks.length === 0) {
    return '❌ Error: "tasks" array with { id, title, status } is required.';
  }

  const tasks: TaskItem[] = rawTasks.map((t, index) => ({
    id: String(t['id'] || `task_${index + 1}`),
    title: String(t['title'] || 'Untitled Task'),
    status: (['pending', 'in_progress', 'completed'].includes(String(t['status']))
      ? String(t['status'])
      : 'pending') as 'pending' | 'in_progress' | 'completed',
  }));

  currentPlan = tasks;

  const completed = tasks.filter(t => t.status === 'completed').length;
  const progressPct = Math.round((completed / tasks.length) * 100);

  // Notify UI live via SSE
  context?.emitTaskPlan?.({ tasks, progressPct });

  const icons = {
    completed: '✅',
    in_progress: '🔄',
    pending: '⏳',
  };

  const lines = tasks.map((t, idx) => `${idx + 1}. ${icons[t.status]} **${t.title}** [${t.status.toUpperCase()}]`);

  return `📋 **Mission Plan Updated (${progressPct}% Complete)**:\n\n${lines.join('\n')}`;
}

export const planTools: ToolDefinition[] = [
  {
    name: 'manage_plan',
    description: 'Create, update, or track a multi-step structured task plan for complex features. Renders an interactive live checklist on the HUD sidebar with real-time progress percentages.',
    parameters: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: 'Array of task items with status ("pending", "in_progress", "completed")',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Short task identifier' },
              title: { type: 'string', description: 'Clear action title of the step' },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed'],
                description: 'Current status of the step',
              },
            },
            required: ['title', 'status'],
          },
        },
      },
      required: ['tasks'],
    },
    execute: managePlanHandler,
  },
];
