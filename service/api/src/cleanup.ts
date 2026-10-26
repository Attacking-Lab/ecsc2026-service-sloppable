import fs from "node:fs";
import path from "node:path";
import { cleanupWorkspaceFiles } from "./store/workspaceStore.js";
import { ARTIFACT_ID_PATTERN } from "./utils/security.js";

const MAX_AGE_MS = 30 * 60 * 1000;
const ARTIFACT_ID_RE = new RegExp(ARTIFACT_ID_PATTERN);
const ARTIFACTS_ROOT = path.resolve(
  process.env.SLOPPABLE_ARTIFACTS_DIR?.trim() || "artifacts",
);
const COMPILED_ROOT = path.resolve(
  process.env.SLOPPABLE_COMPILED_DIR?.trim() || "/compiled",
);

function listArtifactIds(root: string): string[] {
  return fs.existsSync(root)
    ? fs
        .readdirSync(root, { withFileTypes: true })
        .filter(
          (entry) => entry.isDirectory() && ARTIFACT_ID_RE.test(entry.name),
        )
        .map((entry) => entry.name)
    : [];
}

function removeDirectory(directory: string): void {
  fs.rmSync(directory, { recursive: true, force: true });
}

function artifactDirectories(id: string): string[] {
  return [path.join(ARTIFACTS_ROOT, id), path.join(COMPILED_ROOT, id)];
}

function lastModified(id: string): number {
  return Math.max(
    ...artifactDirectories(id)
      .filter(fs.existsSync)
      .map((directory) => fs.statSync(directory).mtimeMs),
  );
}

export function cleanupExpiredData(): void {
  const cutoff = Date.now() - MAX_AGE_MS;
  cleanupWorkspaceFiles(cutoff);

  const artifactIds = new Set([
    ...listArtifactIds(ARTIFACTS_ROOT),
    ...listArtifactIds(COMPILED_ROOT),
  ]);

  for (const id of artifactIds) {
    if (lastModified(id) >= cutoff) continue;
    artifactDirectories(id).forEach(removeDirectory);
  }
}

export function startCleanup(): void {
  const run = () => {
    try {
      cleanupExpiredData();
    } catch (error) {
      console.error("cleanup failed", error);
    }
  };
  run();
  setInterval(run, 60 * 1000);
}
