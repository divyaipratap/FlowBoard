import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("flowboard", {
  platform: process.platform,
});
