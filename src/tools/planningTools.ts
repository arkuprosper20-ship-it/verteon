import { ToolDefinition, ToolExecutionContext, ToolResult } from '../types';

/**
 * updatePlan — the agent calls this tool to declare or update its working plan.
 * The plan is rendered as a checklist in the UI and updated live as the agent
 * progresses. The tool result carries the full plan in `data.plan` so the agent
 * loop can forward it to the webview.
 */
export const updatePlanTool: ToolDefinition = {
  name: 'updatePlan',
  description:
    'Declare or update your working plan as a checklist of steps. Call this early in a multi-step task so the user can see your progress. Mark steps in_progress as you start them and completed when done. Keep steps small and actionable.',
  riskTier: 'safe',
  inputSchema: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        description: 'The full list of plan steps. Replace the entire plan on each call.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Stable step identifier (e.g. "inspect", "fix-tests").' },
            title: { type: 'string', description: 'Short human-readable title of the step.' },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed', 'blocked', 'failed'],
              description: 'Current status of the step.',
            },
            detail: { type: 'string', description: 'Optional detail or note about the step.' },
          },
          required: ['id', 'title', 'status'],
        },
      },
    },
    required: ['steps'],
  },
  async execute(input, _ctx): Promise<ToolResult> {
    const steps = input.steps;
    if (!Array.isArray(steps) || steps.length === 0) {
      return { ok: false, output: '', error: 'updatePlan requires a non-empty "steps" array.' };
    }
    const now = Date.now();
    const plan = {
      steps: steps.map((s: any) => ({
        id: String(s.id ?? `step_${Math.random().toString(36).slice(2, 8)}`),
        title: String(s.title ?? 'Untitled step'),
        status: s.status ?? 'pending',
        detail: s.detail ? String(s.detail) : undefined,
        createdAt: now,
        updatedAt: now,
      })),
      createdAt: now,
    };
    return {
      ok: true,
      output: `Plan updated with ${plan.steps.length} step(s).`,
      data: { plan },
    };
  },
};

/**
 * summarizeTask — the agent calls this tool at the end of a task to produce a
 * structured summary. The result is forwarded to the webview as a summary panel.
 */
export const summarizeTaskTool: ToolDefinition = {
  name: 'summarizeTask',
  description:
    'Produce a structured summary of the completed (or partially completed) task. Call this once at the end of a task, before giving your final answer, so the user has a clear record of what changed, what was validated, and what remains.',
  riskTier: 'safe',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short title for the task.' },
      status: {
        type: 'string',
        enum: ['completed', 'partial', 'blocked', 'failed', 'cancelled'],
        description: 'Overall outcome of the task.',
      },
      result: { type: 'string', description: 'A concise natural-language result / final answer.' },
      changes: {
        type: 'array',
        description: 'List of notable changes made.',
        items: { type: 'string' },
      },
      filesChanged: {
        type: 'array',
        description: 'List of files that were modified.',
        items: { type: 'string' },
      },
      validation: {
        type: 'array',
        description: 'Validation checks that were run and their outcomes.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Name of the check.' },
            passed: { type: 'boolean', description: 'Whether the check passed.' },
          },
          required: ['label', 'passed'],
        },
      },
      commandsRun: {
        type: 'array',
        description: 'Commands that were run during the task.',
        items: { type: 'string' },
      },
      issues: {
        type: 'array',
        description: 'Issues encountered or still present.',
        items: { type: 'string' },
      },
      remainingWork: {
        type: 'array',
        description: 'Work that still needs to be done, if any.',
        items: { type: 'string' },
      },
      securityNotes: {
        type: 'array',
        description: 'Security-relevant notes (approvals requested, blocked commands, etc.).',
        items: { type: 'string' },
      },
    },
    required: ['title', 'status', 'result'],
  },
  async execute(input, _ctx): Promise<ToolResult> {
    const summary = {
      id: `summary_${Date.now()}`,
      title: String(input.title ?? 'Task'),
      status: String(input.status ?? 'completed'),
      result: String(input.result ?? ''),
      changes: Array.isArray(input.changes) ? input.changes.map(String) : [],
      filesChanged: Array.isArray(input.filesChanged) ? input.filesChanged.map(String) : [],
      validation: Array.isArray(input.validation)
        ? input.validation.map((v: any) => ({ label: String(v.label), passed: Boolean(v.passed) }))
        : [],
      commandsRun: Array.isArray(input.commandsRun) ? input.commandsRun.map(String) : [],
      issues: Array.isArray(input.issues) ? input.issues.map(String) : [],
      remainingWork: Array.isArray(input.remainingWork) ? input.remainingWork.map(String) : [],
      securityNotes: Array.isArray(input.securityNotes) ? input.securityNotes.map(String) : [],
      createdAt: Date.now(),
    };
    return {
      ok: true,
      output: `Task summary recorded (${summary.status}).`,
      data: { summary },
    };
  },
};

export const planningTools: ToolDefinition[] = [updatePlanTool, summarizeTaskTool];