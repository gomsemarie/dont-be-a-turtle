#!/usr/bin/env node
/**
 * 거북이 키우기 Full Build Script
 * 1. Build Python backend with PyInstaller
 * 2. Build React UI with Vite
 * 3. Build Electron app with electron-builder
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(ROOT, "apps", "backend");
const UI_DIR = path.join(ROOT, "packages", "ui");
const DESKTOP_DIR = path.join(ROOT, "apps", "desktop");

function run(cmd, cwd = ROOT) {
  console.log(`\n▶ ${cmd}`);
  console.log(`  in: ${cwd}\n`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

function step(name) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${"═".repeat(60)}`);
}

async function main() {
  const platform = process.platform;
  const isWin = platform === "win32";
  const pythonCmd = isWin ? "python" : "python3";
  const pipCmd = isWin ? "pip" : "pip3";

  // ─── Step 1: Build Python Backend ───
  step("1/4 · Python 백엔드 빌드 (PyInstaller)");

  // Install dependencies
  run(`${pipCmd} install -r requirements.txt`, BACKEND_DIR);
  run(`${pipCmd} install pyinstaller`, BACKEND_DIR);

  // Build with PyInstaller
  run(
    `${pythonCmd} -m PyInstaller faceguard-backend.spec --clean --noconfirm`,
    BACKEND_DIR
  );

  // ─── Step 2: Build React UI ───
  step("2/4 · React UI 빌드 (Vite)");
  run("pnpm install", ROOT);
  run("pnpm --filter @faceguard/ui build", ROOT);

  // Copy UI build to desktop
  const uiDist = path.join(UI_DIR, "dist");
  const uiTarget = path.join(DESKTOP_DIR, "ui");
  if (fs.existsSync(uiTarget)) {
    fs.rmSync(uiTarget, { recursive: true });
  }
  fs.cpSync(uiDist, uiTarget, { recursive: true });

  // ─── Step 3: Build Electron ───
  step("3/4 · Electron TypeScript 빌드");
  run("pnpm --filter @faceguard/desktop build", ROOT);

  // ─── Step 4: Package with electron-builder ───
  step("4/4 · 최종 패키징 (electron-builder)");
  const buildCmd = isWin
    ? "pnpm --filter @faceguard/desktop dist:win"
    : "pnpm --filter @faceguard/desktop dist:mac";
  run(buildCmd, ROOT);

  step("빌드 완료!");
  console.log(`\n  결과물: ${path.join(ROOT, "release")}\n`);
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
