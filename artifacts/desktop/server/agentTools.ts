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
    description: "Attach an implementation summary with changed files, commands, tests, and follow-ups. Optionally include a verifiable WorkProof: git diff hashes, per-command exit codes, environment fingerprint. A WorkProof with all command exit codes == 0 produces a green 'Verified by FlowBoard' badge and can satisfy the requireGreenWorkProofToMarkDone rule.",
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
        workProof: {
          type: "object",
          description: "Optional verifiable evidence record. Captures auditable execution context so FlowBoard can stamp a Verified badge and gate auto-completion.",
          properties: {
            agentModel: { type: "string", description: "Model identifier, e.g. claude-opus-4-7." },
            gitCommitSha: { type: "string", description: "HEAD commit SHA at the time the proof was captured." },
            gitDiffHashBefore: { type: "string", description: "Hash of the working-tree diff before the agent's changes." },
            gitDiffHashAfter: { type: "string", description: "Hash of the working-tree diff after the agent's changes." },
            filesChanged: { type: "array", items: { type: "string" } },
            commands: {
              type: "array",
              description: "Commands the agent ran. Use canonical names ('tests', 'lint', 'typecheck', 'build') to populate the verified-checks rollup.",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  command: { type: "string" },
                  exitCode: { type: "number" },
                  durationMs: { type: "number" },
                  stdoutTail: { type: "string" },
                  stderrTail: { type: "string" },
                },
                required: ["command", "exitCode"],
              },
            },
            environment: {
              type: "object",
              description: "Environment fingerprint, e.g. { os, node, pnpm }.",
              additionalProperties: { type: "string" },
            },
            startedAt: { type: "string", description: "ISO-8601 timestamp." },
            finishedAt: { type: "string", description: "ISO-8601 timestamp." },
            runtimeMs: { type: "number" },
          },
        },
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
