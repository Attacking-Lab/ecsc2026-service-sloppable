export interface WorkspaceFile {
  path: string;
  content: string;
  mtimeMs: number;
}

export interface Workspace {
  sessionToken: string;
  files: Map<string, WorkspaceFile>;
  createdAt: number;
}

export interface ArtifactFileSnapshot {
  path: string;
  content: string;
}

export interface ArtifactManifest {
  id: string;
  ownerToken: string;
  title: string;
  createdAt: number;
  sharedWith: string[];
  files: ArtifactFileSnapshot[];
}

export class AccessDeniedError extends Error {
  constructor(message = "not found or access denied") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}
