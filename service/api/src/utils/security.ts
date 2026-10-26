import path from "node:path";
import { ValidationError } from "../types.js";

export const LAMBDA_NAME_PATTERN = "^[A-Za-z0-9_-]{1,64}$";
export const TOKEN_PATTERN = "^[A-Za-z0-9._-]{8,128}$";
export const ARTIFACT_ID_PATTERN =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

const TOKEN_RE = new RegExp(TOKEN_PATTERN);
const ARTIFACT_ID_RE = new RegExp(ARTIFACT_ID_PATTERN);

export function assertValidArtifactId(id: string): string {
  if (typeof id !== "string" || !ARTIFACT_ID_RE.test(id)) {
    throw new ValidationError("invalid artifact id");
  }
  return id;
}

export function assertValidToken(
  token: string,
  field = "session_token",
): string {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) {
    throw new ValidationError(
      `invalid ${field}: must be 8-128 chars of [A-Za-z0-9._-]`,
    );
  }
  return token;
}

export function normalizeWorkspacePath(rawPath: string): string {
  if (typeof rawPath !== "string" || rawPath.length === 0) {
    throw new ValidationError("path must be a non-empty string");
  }
  if (rawPath.length > 512) {
    throw new ValidationError("path too long");
  }
  if (rawPath.includes("\0")) {
    throw new ValidationError("path contains a null byte");
  }

  const posixish = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const normalized = path.posix.normalize(posixish);

  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.startsWith("/")
  ) {
    throw new ValidationError("path traversal is not allowed");
  }

  return normalized;
}
