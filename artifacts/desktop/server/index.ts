import express from "express";
import path from "path";
import net from "net";
import { initDb } from "./db";
import projectsRouter from "./routes/projects";
import issuesRouter from "./routes/issues";

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
  initDb(dbPath);

  const app = express();
  const resolvedPort = await getAvailablePort(port);

  app.use(express.json());

  app.use("/api", projectsRouter);
  app.use("/api", issuesRouter);

  app.get("/api/healthz", (_req, res) => res.json({ status: "ok" }));

  app.use(express.static(rendererPath));

  app.get("*", (_req, res) => {
    res.sendFile(path.join(rendererPath, "index.html"));
  });

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(resolvedPort, "127.0.0.1", resolve);
    server.on("error", reject);
  });

  console.log(`FlowBoard server running at http://localhost:${resolvedPort}`);
  return resolvedPort;
}
