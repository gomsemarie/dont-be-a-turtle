#!/usr/bin/env node
/**
 * Build only the Python backend with PyInstaller.
 */

const { execSync } = require("child_process");
const path = require("path");

const BACKEND_DIR = path.resolve(__dirname, "..", "apps", "backend");
const isWin = process.platform === "win32";
const pythonCmd = isWin ? "python" : "python3";
const pipCmd = isWin ? "pip" : "pip3";

function run(cmd) {
  console.log(`▶ ${cmd}`);
  execSync(cmd, { cwd: BACKEND_DIR, stdio: "inherit" });
}

console.log("Building Python backend...\n");

run(`${pipCmd} install -r requirements.txt`);
run(`${pipCmd} install pyinstaller`);
run(`${pythonCmd} -m PyInstaller faceguard-backend.spec --clean --noconfirm`);

console.log("\nBackend build complete!");
console.log(`Output: ${path.join(BACKEND_DIR, "dist")}`);
