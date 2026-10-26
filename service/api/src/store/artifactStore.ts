import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import {
  AccessDeniedError,
  ArtifactManifest,
  NotFoundError,
  ValidationError,
  Workspace,
} from "../types.js";
import { assertValidArtifactId } from "../utils/security.js";
import { compileAndStore } from "../lambda/compiler.js";
import { lambdaNameFromWorkspacePath } from "./workspaceStore.js";

const ARTIFACTS_ROOT = path.resolve(
  process.env.SLOPPABLE_ARTIFACTS_DIR?.trim() ||
    path.join(process.cwd(), "artifacts"),
);

function artifactDir(id: string): string {
  assertValidArtifactId(id);
  return path.join(ARTIFACTS_ROOT, id);
}

function manifestPath(id: string): string {
  return path.join(artifactDir(id), "manifest.json");
}

function ensureArtifactsRoot(): void {
  fs.mkdirSync(ARTIFACTS_ROOT, { recursive: true });
}

export async function createArtifact(
  ownerToken: string,
  workspace: Workspace,
  title?: string,
): Promise<ArtifactManifest> {
  const files = [...workspace.files.values()];
  if (files.length === 0) {
    throw new ValidationError("cannot publish an empty workspace");
  }

  const id = uuidv4();

  for (const file of files) {
    const lambdaName = lambdaNameFromWorkspacePath(file.path);
    if (lambdaName) {
      await compileAndStore(id, lambdaName, file.content);
    }
  }

  const manifest: ArtifactManifest = {
    id,
    ownerToken,
    title: title?.trim() || "Untitled Artifact",
    createdAt: Date.now(),
    sharedWith: [],
    files: files.filter((f) => !lambdaNameFromWorkspacePath(f.path)).map((f) => ({ path: f.path, content: f.content })),
  };

  ensureArtifactsRoot();
  const dir = artifactDir(manifest.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    manifestPath(manifest.id),
    JSON.stringify(manifest, null, 2),
    {
      mode: 0o600,
    },
  );

  return manifest;
}

function loadManifest(id: string): ArtifactManifest {
  const file = manifestPath(id);
  if (!fs.existsSync(file)) {
    throw new NotFoundError("artifact not found");
  }
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw) as ArtifactManifest;
}

function saveManifest(manifest: ArtifactManifest): void {
  fs.writeFileSync(
    manifestPath(manifest.id),
    JSON.stringify(manifest, null, 2),
    {
      mode: 0o600,
    },
  );
}

function canRead(manifest: ArtifactManifest, requesterToken: string): boolean {
  return (
    manifest.ownerToken === requesterToken ||
    manifest.sharedWith.includes(requesterToken)
  );
}

export function readArtifact(
  id: string,
  requesterToken: string,
): ArtifactManifest {
  let manifest: ArtifactManifest;
  try {
    manifest = loadManifest(id);
  } catch {
    throw new AccessDeniedError();
  }
  if (!canRead(manifest, requesterToken)) {
    throw new AccessDeniedError();
  }
  return manifest;
}

export function shareArtifact(
  id: string,
  ownerToken: string,
  targetToken: string,
): ArtifactManifest {
  let manifest: ArtifactManifest;
  try {
    manifest = loadManifest(id);
  } catch {
    throw new AccessDeniedError();
  }
  if (manifest.ownerToken !== ownerToken) {
    throw new AccessDeniedError();
  }
  if (targetToken === manifest.ownerToken) {
    throw new ValidationError(
      "owner already has access; cannot share with self",
    );
  }
  if (!manifest.sharedWith.includes(targetToken)) {
    manifest.sharedWith.push(targetToken);
    saveManifest(manifest);
  }
  return manifest;
}
