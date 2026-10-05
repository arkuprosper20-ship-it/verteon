import { ToolDefinition } from '../types';
import { AgentConfig } from '../config/configuration';
import { filesystemTools } from './filesystemTools';
import { editorTools } from './editorTools';
import { terminalTools } from './terminalTools';
import { projectTools } from './projectTools';
import { planningTools } from './planningTools';
import { testingTools, gitTools } from './testingAndGitTools';

export function buildToolRegistry(config: AgentConfig): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    ...planningTools,
    ...filesystemTools,
    ...editorTools,
    ...terminalTools,
    ...projectTools,
    ...testingTools,
  ];
  if (config.enableGitTools) {
    tools.push(...gitTools);
  }
  return tools;
}

export function findTool(tools: ToolDefinition[], name: string): ToolDefinition | undefined {
  return tools.find((t) => t.name === name);
}
