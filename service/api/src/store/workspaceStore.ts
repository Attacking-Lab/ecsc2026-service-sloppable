import { Workspace, WorkspaceFile } from "../types.js";
import { normalizeWorkspacePath } from "../utils/security.js";

const workspaces = new Map<string, Workspace>();

const LAMBDA_PATH_RE = /^lambdas\/([A-Za-z0-9_-]{1,64})\.slop$/;

export function lambdaNameFromWorkspacePath(
  filePath: string,
): string | undefined {
  return LAMBDA_PATH_RE.exec(filePath)?.[1];
}

export function getOrCreateWorkspace(sessionToken: string): Workspace {
  let ws = workspaces.get(sessionToken);
  if (!ws) {
    ws = {
      sessionToken,
      files: new Map(),
      createdAt: Date.now(),
    };
    workspaces.set(sessionToken, ws);
  }
  return ws;
}

export interface WriteFileResult {
  path: string;
  bytes: number;
  lambdaSource?: string;
}

export function writeFile(
  sessionToken: string,
  rawPath: string,
  content: string,
): WriteFileResult {
  const ws = getOrCreateWorkspace(sessionToken);
  const filePath = normalizeWorkspacePath(rawPath);

  const file: WorkspaceFile = {
    path: filePath,
    content,
    mtimeMs: Date.now(),
  };
  ws.files.set(filePath, file);

  const result: WriteFileResult = { path: filePath, bytes: content.length };

  const lambdaName = lambdaNameFromWorkspacePath(filePath);
  if (lambdaName) {
    result.lambdaSource = lambdaName;
  }

  return result;
}

export function readFile(
  sessionToken: string,
  rawPath: string,
): WorkspaceFile | undefined {
  const ws = getOrCreateWorkspace(sessionToken);
  const filePath = normalizeWorkspacePath(rawPath);
  return ws.files.get(filePath);
}

export function listFiles(sessionToken: string): WorkspaceFile[] {
  const ws = getOrCreateWorkspace(sessionToken);
  return [...ws.files.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function cleanupWorkspaceFiles(cutoffMs: number): void {
  for (const [sessionToken, workspace] of workspaces) {
    for (const [filePath, file] of workspace.files) {
      if (file.mtimeMs < cutoffMs) workspace.files.delete(filePath);
    }

    if (workspace.files.size === 0 && workspace.createdAt < cutoffMs) {
      workspaces.delete(sessionToken);
    }
  }
}
