import { app, BrowserWindow, shell } from "electron";
import * as fs from "fs";
import path from "path";
import { startServer } from "../server/index";

const DEV_PORT = 3099;
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function getDbPath(): string {
  return path.join(app.getPath("userData"), "flowboard.db");
}

function getRendererPath(): string {
  if (isDev) {
    return path.join(__dirname, "../../dist/renderer");
  }
  return path.join(process.resourcesPath, "renderer");
}

function getWindowIconPath(): string {
  if (isDev) {
    return path.join(__dirname, "../../build/icon.png");
  }
  return path.join(process.resourcesPath, "icon.png");
}

function getApiPortFilePath(): string {
  return path.join(app.getPath("userData"), "flowboard-api-port.json");
}

function getMcpPath(): string {
  if (isDev) return path.join(__dirname, "mcp.js");

  const unpackedPath = path.join(process.resourcesPath, "app.asar.unpacked", "dist", "main", "mcp.js");
  if (fs.existsSync(unpackedPath)) return unpackedPath;

  return path.join(__dirname, "mcp.js");
}

async function createWindow() {
  const dbPath = getDbPath();
  const rendererPath = getRendererPath();
  const apiPortFile = getApiPortFilePath();
  process.env.FLOWBOARD_API_PORT_FILE = apiPortFile;
  process.env.FLOWBOARD_MCP_PATH = getMcpPath();
  const serverPort = await startServer({ dbPath, rendererPath, port: isDev ? DEV_PORT : 0 });
  fs.writeFileSync(apiPortFile, JSON.stringify({
    port: serverPort,
    apiBase: `http://127.0.0.1:${serverPort}/api`,
    updatedAt: new Date().toISOString(),
  }, null, 2));

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#0a0a0a",
    show: false,
    title: "FlowBoard",
    icon: getWindowIconPath(),
  });

  const url = isDev
    ? `http://localhost:5174`
    : `http://localhost:${serverPort}/`;

  mainWindow.loadURL(url);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (isDev) mainWindow?.webContents.openDevTools({ mode: "detach" });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
