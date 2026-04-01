/**
 * Manages the Python backend process lifecycle.
 * Handles spawning PyInstaller-bundled executables or raw Python.
 */

import { ChildProcess, spawn } from "child_process";
import path from "path";
import fs from "fs";
import { app } from "electron";
import http from "http";

const BACKEND_PORT = 18765;
const HEALTH_CHECK_URL = `http://127.0.0.1:${BACKEND_PORT}/api/health`;
const MAX_RETRIES = 120;
const RETRY_INTERVAL_MS = 1000;

let backendProcess: ChildProcess | null = null;

/**
 * Find the Python backend executable path.
 * In development: runs `python main.py`
 * In production: runs the PyInstaller-bundled binary
 */
function getBackendCommand(): { command: string; args: string[]; cwd: string } {
  const isPackaged = app.isPackaged;

  if (isPackaged) {
    // Production: PyInstaller binary is in resources/backend/
    const resourcesPath = process.resourcesPath;
    const isWin = process.platform === "win32";
    const binaryName = isWin ? "faceguard-backend.exe" : "faceguard-backend";
    const binaryPath = path.join(resourcesPath, "backend", binaryName);

    return {
      command: binaryPath,
      args: [String(BACKEND_PORT)],
      cwd: path.join(resourcesPath, "backend"),
    };
  } else {
    // Development: Run Python directly
    const backendDir = path.join(__dirname, "..", "..", "backend");
    const pythonCmd = process.platform === "win32" ? "python" : "python3";

    return {
      command: pythonCmd,
      args: [path.join(backendDir, "main.py"), String(BACKEND_PORT)],
      cwd: backendDir,
    };
  }
}

/**
 * Check if the backend is healthy.
 */
function checkHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    http
      .get(HEALTH_CHECK_URL, (res) => {
        resolve(res.statusCode === 200);
      })
      .on("error", () => {
        resolve(false);
      });
  });
}

/**
 * Wait for the backend to become ready.
 */
async function waitForBackend(): Promise<boolean> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    const healthy = await checkHealth();
    if (healthy) return true;
    await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
  }
  return false;
}

/**
 * Start the Python backend process.
 */
export async function startBackend(): Promise<boolean> {
  // Check if already running
  const alreadyRunning = await checkHealth();
  if (alreadyRunning) {
    console.log("[PythonManager] Backend already running");
    return true;
  }

  const { command, args, cwd } = getBackendCommand();
  console.log(`[PythonManager] Starting: ${command} ${args.join(" ")}`);
  console.log(`[PythonManager] CWD: ${cwd}`);

  try {
    backendProcess = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      detached: false,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });

    backendProcess.stdout?.on("data", (data) => {
      console.log(`[Backend] ${data.toString().trim()}`);
    });

    backendProcess.stderr?.on("data", (data) => {
      console.error(`[Backend Error] ${data.toString().trim()}`);
    });

    backendProcess.on("exit", (code) => {
      console.log(`[PythonManager] Backend exited with code ${code}`);
      backendProcess = null;
    });

    backendProcess.on("error", (err) => {
      console.error(`[PythonManager] Failed to start backend:`, err);
      backendProcess = null;
    });

    // Wait for backend to be ready
    const ready = await waitForBackend();
    if (!ready) {
      console.error("[PythonManager] Backend failed to start in time");
      stopBackend();
      return false;
    }

    console.log("[PythonManager] Backend is ready");
    return true;
  } catch (err) {
    console.error("[PythonManager] Error starting backend:", err);
    return false;
  }
}

/**
 * Stop the Python backend process.
 */
export function stopBackend(): void {
  if (backendProcess) {
    console.log("[PythonManager] Stopping backend...");
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(backendProcess.pid), "/f", "/t"]);
    } else {
      backendProcess.kill("SIGTERM");
    }
    backendProcess = null;
  }
}

export { BACKEND_PORT };
