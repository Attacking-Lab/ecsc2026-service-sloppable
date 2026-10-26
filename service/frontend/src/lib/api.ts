import { treaty } from "@elysia/eden";
import type { App } from "../../../api/src/index";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type EdenError = {
  status: number;
  value: unknown;
};

type EdenResult<Data> = {
  data: Data | null;
  error: EdenError | null;
  status: number;
};

function errorMessage(value: unknown, status: number): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error;
  }
  return `Request failed (${status})`;
}

function unwrap<Data>(result: EdenResult<Data>): NonNullable<Data> {
  if (result.error) {
    throw new ApiError(
      result.error.status,
      errorMessage(result.error.value, result.error.status),
    );
  }
  if (result.data === null) {
    throw new ApiError(result.status, `Request failed (${result.status})`);
  }
  return result.data as NonNullable<Data>;
}

const client = treaty<App>(
  typeof window === "undefined" ? "http://localhost" : window.location.origin,
);

function authenticated(token: string) {
  return { headers: { authorization: `Bearer ${token}` } };
}

export const api = {
  health: async () => unwrap(await client.health.get()),
  createSession: async () => unwrap(await client.api.sessions.post()),
  listFiles: async (token: string) =>
    unwrap(await client.api.workspace.files.get(authenticated(token))),
  readFile: async (token: string, path: string) =>
    unwrap(
      await client.api.workspace.file.get({
        ...authenticated(token),
        query: { path },
      }),
    ),
  writeFile: async (token: string, path: string, content: string) =>
    unwrap(
      await client.api.workspace.file.put(
        { path, content },
        authenticated(token),
      ),
    ),
  publishWorkspace: async (token: string, title?: string) =>
    unwrap(
      await client.api.artifacts.post(
        title ? { title } : {},
        authenticated(token),
      ),
    ),
  readArtifact: async (token: string, artifactId: string) =>
    unwrap(
      await client.api.artifacts({ artifactId }).get(authenticated(token)),
    ),
  shareArtifact: async (
    token: string,
    artifactId: string,
    targetToken: string,
  ) =>
    unwrap(
      await client.api
        .artifacts({ artifactId })
        .shares.post({ target_token: targetToken }, authenticated(token)),
    ),
  callLambda: async (
    token: string,
    artifactId: string,
    name: string,
    args?: Record<string, string>,
  ) =>
    unwrap(
      await client.api
        .artifacts({ artifactId })
        .lambdas({ name })
        .invoke.post(args ? { args } : {}, authenticated(token)),
    ),
  slopscriptReference: async () => ({
    reference: unwrap(await client.api.slopscript.reference.get()),
  }),
};

export type Session = Awaited<ReturnType<typeof api.createSession>>;
export type Health = Awaited<ReturnType<typeof api.health>>;
export type WorkspaceFile = Awaited<
  ReturnType<typeof api.listFiles>
>["files"][number];
export type WorkspaceFileContent = Awaited<ReturnType<typeof api.readFile>>;
