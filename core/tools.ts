/** Tools that never write files or run programs. Everything else is guarded. */
export const READ_TOOLS: ReadonlySet<string> = new Set([
  'Read',
  'Grep',
  'Glob',
  'LS',
  'NotebookRead',
  'WebFetch',
  'WebSearch',
  'ToolSearch',
  'TodoWrite',
  'TaskGet',
  'TaskList',
  'AskUserQuestion',
  'ListMcpResourcesTool',
  'ReadMcpResourceTool',
  'ReadMcpResourceDirTool',
])
