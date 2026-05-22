import express from "express";
import path from "path";
import net from "net";
import { initDb } from "./db";
import projectsRouter from "./routes/projects";
import issuesRouter from "./routes/issues";
import aiRouter from "./routes/ai";
import pulseRouter from "./routes/pulse";
import dataRouter from "./routes/data";
import agentBridgeRouter from "./routes/agentBridge";
import syncRouter from "./routes/sync";
import { eventsRouter } from "./events";
import { seedDefaultRecipeIfMissing, startPulseRunner } from "./pulse/recipes";

interface ServerOptions {
  dbPath: string;
  rendererPath: string;
  port: number;
}

function getAvailablePort(preferred: number): Promise<number> {
  return new Promise((resolve, reject) => {
    if (preferred !== 0) {
      resolve(preferred);
      return;
    }
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") { reject(new Error("Failed to get port")); return; }
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

export async function startServer({ dbPath, rendererPath, port }: ServerOptions): Promise<number> {
  process.env.FLOWBOARD_DB_PATH = dbPath;
  initDb(dbPath);

  const app = express();
  const resolvedPort = await getAvailablePort(port);
  process.env.FLOWBOARD_SERVER_PORT = String(resolvedPort);

  app.use(express.json({ limit: "12mb" }));

  app.use("/api", projectsRouter);
  app.use("/api", issuesRouter);
  app.use("/api", aiRouter);
  app.use("/api", pulseRouter);
  app.use("/api", dataRouter);
  app.use("/api", agentBridgeRouter);
  app.use("/api", syncRouter);
  app.use("/api", eventsRouter);

  app.get("/api/healthz", (_req, res) => res.json({ status: "ok" }));

  app.use(express.static(rendererPath));

  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(rendererPath, "index.html"));
  });

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(resolvedPort, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });

  console.log(`FlowBoard server running at http://localhost:${resolvedPort}`);

  try {
    await seedDefaultRecipeIfMissing();
    startPulseRunner();
  } catch (error) {
    console.error("[pulse] failed to start runner:", error);
  }

  return resolvedPort;
}
