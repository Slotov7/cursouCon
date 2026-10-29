import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const isWindows = process.platform === "win32";
const command = isWindows ? process.execPath : "bash";
const commandArgs = isWindows
  ? [resolve(root, "node_modules", "@tauri-apps", "cli", "tauri.js"), ...args]
  : [resolve(root, "scripts", "tauri-dev.sh"), ...args];

const child = spawn(command, commandArgs, { cwd: root, stdio: "inherit" });
child.on("error", (error) => {
  console.error(`Não foi possível iniciar o Tauri: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
