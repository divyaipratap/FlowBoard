export const FLOWBOARD_MCP_TOOLS = [
  {
    name: "flowboard_get_today_tasks",
    description: "Read the current actionable FlowBoard tasks.",
    inputSchema: { type: "object", properties: { limit: { type: "number" }, agentName: { type: "string" } } },
  },
  {
    name: "flowboard_get_issue",
    description: "Fetch a FlowBoard issue by id or key such as PROJ-12.",
    inputSchema: { type: "object", properties: { issueId: { type: "string" }, issueKey: { type: "string" }, agentName: { type: "string" } } },
  },
  {
    name: "flowboard_search_issues",
    description: "Search FlowBoard issues by title, description, and optional status.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, status: { type: "string" }, limit: { type: "number" }, agentName: { type: "string" } } },
  },
  {
    name: "flowboard_start_issue",
    description: "Claim an issue and move it to in_progress when trusted mode allows writes; otherwise create a proposal.",
    inputSchema: { type: "object", properties: { issueId: { type: "string" }, issueKey: { type: "string" }, agentName: { type: "string" } } },
  },
  {
    name: "flowboard_add_issue_note",
    description: "Add a progress note to an issue unless writes are disabled.",
    inputSchema: { type: "object", properties: { issueId: { type: "string" }, issueKey: { type: "string" }, note: { type: "string" }, agentName: { type: "string" } }, required: ["note"] },
  },
  {
    name: "flowboard_update_issue_status",
    description: "Suggest or apply a status update depending on Agent Bridge permission mode.",
    inputSchema: { type: "object", properties: { issueId: { type: "string" }, issueKey: { type: "string" }, status: { type: "string" }, agentName: { type: "string" } }, required: ["status"] },
  },
  {
    name: "flowboard_attach_work_summary",
    description: "Attach an implementation summary with changed files, commands, tests, and follow-ups.",
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string" },
        issueKey: { type: "string" },
        summary: { type: "string" },
        changedFiles: { type: "array", items: { type: "string" } },
        commandsRun: { type: "array", items: { type: "string" } },
        testsRun: { type: "array", items: { type: "string" } },
        followUps: { type: "array", items: { type: "string" } },
        agentName: { type: "string" },
      },
      required: ["summary"],
    },
  },
  {
    name: "flowboard_create_followup_issue",
    description: "Suggest or create a follow-up issue depending on Agent Bridge permission mode.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string" },
        type: { type: "string" },
        labels: { type: "array", items: { type: "string" } },
        agentName: { type: "string" },
      },
      required: ["projectId", "title"],
    },
  },
];
