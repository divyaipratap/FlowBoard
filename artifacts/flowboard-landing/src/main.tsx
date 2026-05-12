import { createRoot } from "react-dom/client";
import "./styles.css";

const downloadUrl = "https://github.com/your-username/flowboard/releases/latest";

const agentSteps = [
  "Codex, Cursor, or another MCP client reads the exact ticket you want handled.",
  "The agent works against a visible scope instead of a loose chat prompt.",
  "Suggestions land in Agent Inbox with approve, reject, and merge decisions.",
  "Every worklog keeps changed files, commands, validation, blockers, and follow-ups."
];

const operatingLoops = [
  {
    title: "Capture before context disappears",
    text: "Turn ideas, bugs, polish notes, and agent output into structured tickets the moment they appear."
  },
  {
    title: "Plan the next coding block",
    text: "Pulse ranks what deserves attention now, so every session starts with a practical sequence."
  },
  {
    title: "Let agents work from your plan",
    text: "Agent Bridge gives AI tools a controlled way to inspect tickets, propose changes, and record progress."
  },
  {
    title: "Resume without archaeology",
    text: "Each issue keeps comments, attachments, decisions, tests, and agent work in one local history."
  }
];

const usefulness = [
  {
    title: "Protect your mental stack",
    text: "Stop remembering what the agent changed, what still needs testing, and why a decision was made."
  },
  {
    title: "Make vibe coding inspectable",
    text: "Every fast-moving idea becomes a ticket, status, owner, worklog, and review trail."
  },
  {
    title: "Control agent autonomy",
    text: "Agents can contribute inside your workflow while approvals and trusted actions stay explicit."
  },
  {
    title: "Keep momentum visible",
    text: "Today, Pulse, Kanban, Inbox, and history show what matters now and what is already done."
  }
];

const beforeAfter = [
  {
    before: "Prompt history becomes the project memory.",
    after: "Tickets and worklogs become the project memory."
  },
  {
    before: "Agents finish work with unclear scope.",
    after: "Agents execute against a visible plan."
  },
  {
    before: "Daily priorities reset every morning.",
    after: "Pulse turns open work into a ranked focus list."
  }
];

const supportedAgents = [
  {
    name: "Codex",
    icon: "/agents/codex-color.svg"
  },
  {
    name: "Cursor",
    icon: "/agents/cursor.svg"
  },
  {
    name: "Claude",
    icon: "/agents/claude-color.svg"
  },
  {
    name: "OpenAI",
    icon: "/agents/openai.svg"
  },
  {
    name: "Ollama",
    icon: "/agents/ollama.svg"
  },
  {
    name: "Google Antigravity",
    icon: "/agents/antigravity-color.svg"
  }
];

function AppShot({ variant }: { variant: "board" | "pulse" | "agents" }) {
  if (variant === "pulse") {
    return (
      <div className="app-shot pulse-shot">
        <div className="shot-sidebar">
          <div className="shot-logo" />
          <span />
          <span />
          <span />
        </div>
        <div className="shot-main">
          <div className="shot-header">
            <div>
              <strong>Pulse Focus Plan</strong>
              <small>Ranked by urgency, blockers, and momentum</small>
            </div>
            <button>Recompute</button>
          </div>
          <div className="flow-list">
            {["Ship the landing page", "Validate download flow", "Review agent bridge ticket"].map((item, index) => (
              <article key={item}>
                <span>#{index + 1}</span>
                <div>
                  <strong>{item}</strong>
                  <small>{index === 0 ? "Highest leverage now" : "Ready for focus"}</small>
                </div>
                <em>{index + 1} block</em>
              </article>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "agents") {
    return (
      <div className="app-shot agent-shot">
        <div className="shot-sidebar">
          <div className="shot-logo" />
          <span />
          <span />
          <span />
        </div>
        <div className="shot-main">
          <div className="shot-header">
            <div>
              <strong>Agent Bridge</strong>
              <small>Connected agents, controlled actions</small>
            </div>
            <button>Copy config</button>
          </div>
          <div className="agent-console">
            {agentSteps.map((step, index) => (
              <div key={step} className="agent-row">
                <b>{String(index + 1).padStart(2, "0")}</b>
                <p>{step}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shot board-shot">
      <div className="shot-sidebar">
        <div className="shot-logo" />
        <span />
        <span />
        <span />
      </div>
      <div className="shot-main">
        <div className="shot-header">
          <div>
            <strong>FlowBoard Product Build</strong>
            <small>12 issues - 7 done - 3 in focus</small>
          </div>
          <button>New issue</button>
        </div>
        <div className="kanban">
          {["Todo", "In progress", "In review", "Done"].map((column, columnIndex) => (
            <section key={column}>
              <header>
                <i />
                {column}
                <span>{columnIndex === 3 ? 8 : columnIndex === 0 ? 2 : 1}</span>
              </header>
              {Array.from({ length: columnIndex === 3 ? 3 : 2 }).map((_, cardIndex) => (
                <article key={cardIndex}>
                  <small>FAB-{columnIndex * 2 + cardIndex + 1}</small>
                  <strong>{["Landing page story", "Agent Inbox proposals", "Worklog history", "MCP validation"][cardIndex % 4]}</strong>
                  <div>
                    <span />
                    <em>{columnIndex === 3 ? "done" : "medium"}</em>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#top" aria-label="FlowBoard home">
          <img src="/brand/flowboard-icon-transparent.png" alt="" />
          <span>FlowBoard</span>
        </a>
        <div>
          <a href="#useful">Useful</a>
          <a href="#agents">Agents</a>
          <a href="#workflow">Workflow</a>
          <a href="#download">Download</a>
        </div>
      </nav>

      <section id="top" className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Execution cockpit for AI-assisted builders</p>
          <h1>The missing project memory for vibe coders.</h1>
          <p className="lede">
            FlowBoard turns scattered prompts, agent output, half-finished fixes, and daily priorities into a
            visible operating system. Plan the work, connect agents, approve proposals, and always know what
            changed, why it changed, and what to do next.
          </p>
          <div className="hero-actions">
            <a className="button primary" href={downloadUrl}>
              Download FlowBoard
            </a>
            <a className="button secondary" href="#workflow">
              See the workflow
            </a>
          </div>
          <div className="signal-row" aria-label="FlowBoard core value">
            <span>Plan</span>
            <span>Execute</span>
            <span>Approve</span>
            <span>Resume</span>
          </div>
          <dl className="metrics" aria-label="FlowBoard product highlights">
            <div>
              <dt>Local</dt>
              <dd>your project data stays on your machine</dd>
            </div>
            <div>
              <dt>Agent</dt>
              <dd>MCP bridge for Codex, Cursor, and tools</dd>
            </div>
            <div>
              <dt>Pulse</dt>
              <dd>daily priority and focus planning</dd>
            </div>
          </dl>
        </div>
        <div className="hero-visual" aria-label="Animated FlowBoard app screens">
          <div className="screen-stack">
            <AppShot variant="board" />
            <AppShot variant="pulse" />
            <AppShot variant="agents" />
          </div>
        </div>
      </section>

      <section id="useful" className="value">
        <div className="section-heading">
          <p className="eyebrow">Why FlowBoard becomes important fast</p>
          <h2>AI speed is only useful when the work stays organized.</h2>
          <p>
            AI tools can produce code, plans, and fixes quickly. The real bottleneck is keeping the project
            coherent while that work is happening. FlowBoard gives the speed a system.
          </p>
        </div>
        <div className="value-grid">
          {usefulness.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="problem">
        <div>
          <p className="eyebrow">Why this matters</p>
          <h2>Without a board, AI-assisted work becomes invisible work.</h2>
        </div>
        <p>
          Vibe coding becomes fragile when plans live in prompts, bug fixes live in memory, and agents finish
          tasks without a trace. FlowBoard keeps the product, the plan, and the agents aligned so progress
          remains visible even when the work is moving quickly.
        </p>
      </section>

      <section className="comparison">
        <div className="section-heading">
          <p className="eyebrow">Before and after</p>
          <h2>The difference is not more notes. It is operational clarity.</h2>
        </div>
        <div className="comparison-grid">
          {beforeAfter.map((item) => (
            <article key={item.before}>
              <div>
                <span>Without FlowBoard</span>
                <p>{item.before}</p>
              </div>
              <div>
                <span>With FlowBoard</span>
                <p>{item.after}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="workflow" className="workflow">
        <div className="section-heading">
          <p className="eyebrow">The operating loop</p>
          <h2>A workflow built for fast builders and AI teammates.</h2>
        </div>
        <div className="loop-grid">
          {operatingLoops.map((item, index) => (
            <article key={item.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="agents" className="agents">
        <div className="agent-copy">
          <p className="eyebrow">Agent Bridge</p>
          <h2>Connect agents to the plan, not just the codebase.</h2>
          <p>
            FlowBoard exposes a controlled MCP bridge for tools like Codex and Cursor. Agents can read the
            work you selected, start a focused session, propose follow-ups, attach implementation summaries,
            and request status changes. You decide what applies automatically and what waits for approval.
          </p>
          <ul>
            <li>Suggest-only mode for safe proposals.</li>
            <li>Trusted mode with granular action rules.</li>
            <li>Agent Inbox for approval, rejection, and merge flows.</li>
            <li>Structured worklogs with files, commands, tests, and follow-ups.</li>
          </ul>
        </div>
        <div className="agent-panel">
          <AppShot variant="agents" />
        </div>
        <div className="agent-icons" aria-label="Supported agent integrations">
          <div className="agent-icons-track">
            {[0, 1].map((group) => (
              <div className="agent-icons-set" key={group} aria-hidden={group === 1}>
                {supportedAgents.map((agent) => (
                  <article key={`${group}-${agent.name}`}>
                    <img src={agent.icon} alt={group === 0 ? agent.name : ""} />
                  </article>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="showcase">
        <div className="section-heading">
          <p className="eyebrow">Built for builders in motion</p>
          <h2>The app keeps the next useful action obvious.</h2>
        </div>
        <div className="showcase-grid">
          <AppShot variant="board" />
          <AppShot variant="pulse" />
        </div>
      </section>

      <section id="download" className="download">
        <img src="/brand/flowboard-primary-lockup-transparent.png" alt="FlowBoard" />
        <h2>Give your AI coding workflow a real control room.</h2>
        <p>
          Download FlowBoard for Windows and start turning scattered prompts, half-finished tasks, agent
          proposals, and daily priorities into one clear execution system.
        </p>
        <a className="button primary" href={downloadUrl}>
          Download FlowBoard for Windows
        </a>
        <small>Publish installers through GitHub Releases for clean open-source distribution.</small>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
