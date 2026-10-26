#!/usr/bin/env bun
import { randomUUID } from "node:crypto";
import { Elysia, status, t } from "elysia";
import { startCleanup } from "./cleanup.js";
import { renderViaRuntime } from "./lambda/runtimeClient.js";
import { backendMode, handleLlm } from "./llm/handler.js";
import * as artifactStore from "./store/artifactStore.js";
import * as workspaceStore from "./store/workspaceStore.js";
import { SLOPSCRIPT_REFERENCE } from "./slopscriptReference.js";
import {
  AccessDeniedError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "./types.js";
import {
  ARTIFACT_ID_PATTERN,
  LAMBDA_NAME_PATTERN,
  TOKEN_PATTERN,
  assertValidToken,
} from "./utils/security.js";

const PORT = Number.parseInt(process.env.SERVICE_PORT ?? "9000", 10);

function bearerToken(authorization?: string): string {
  if (!authorization?.startsWith("Bearer ")) {
    throw new UnauthorizedError("missing bearer token");
  }
  try {
    return assertValidToken(authorization.slice(7), "bearer token");
  } catch {
    throw new UnauthorizedError("invalid bearer token");
  }
}

const authHeaders = t.Object({
  authorization: t.Optional(t.String()),
});
const artifactId = t.String({ pattern: ARTIFACT_ID_PATTERN });
const lambdaName = t.String({ pattern: LAMBDA_NAME_PATTERN });
const sessionToken = t.String({ pattern: TOKEN_PATTERN });

export function createApp() {
  return new Elysia()
    .onError(({ code, error }) => {
      switch (true) {
        case code === "VALIDATION":
          return status(400, { error: "invalid request" });
        case code === "NOT_FOUND":
          return status(404, { error: "not found" });
        case error instanceof UnauthorizedError:
          return status(401, { error: error.message });
        case error instanceof AccessDeniedError:
        case error instanceof NotFoundError:
          return status(404, { error: "artifact not found" });
        case error instanceof ValidationError:
          return status(400, { error: error.message });
        default:
          console.error(error);
          return status(500, { error: "internal server error" });
      }
    })
    .get("/", () => ({ status: "ok" }))
    .get("/health", () => ({ status: "ok", llm_backend: backendMode() }))
    .post("/api/sessions", () => {
      const token = assertValidToken(randomUUID());
      workspaceStore.getOrCreateWorkspace(token);
      return status(201, { session_token: token, namespace: token });
    })
    .get(
      "/api/workspace/files",
      ({ headers }) => {
        const token = bearerToken(headers.authorization);
        const files = workspaceStore.listFiles(token).map((file) => ({
          path: file.path,
          bytes: file.content.length,
          mtime_ms: file.mtimeMs,
        }));
        return { files };
      },
      { headers: authHeaders },
    )
    .get(
      "/api/workspace/file",
      ({ headers, query }) => {
        const token = bearerToken(headers.authorization);
        const file = workspaceStore.readFile(token, query.path);
        return file
          ? {
              found: true as const,
              path: file.path,
              content: file.content,
              mtime_ms: file.mtimeMs,
            }
          : { found: false as const, path: query.path };
      },
      {
        headers: authHeaders,
        query: t.Object({ path: t.String() }),
      },
    )
    .put(
      "/api/workspace/file",
      ({ headers, body }) => {
        const token = bearerToken(headers.authorization);
        const result = workspaceStore.writeFile(token, body.path, body.content);
        return {
          path: result.path,
          bytes: result.bytes,
          ...(result.lambdaSource
            ? { lambda_source: result.lambdaSource }
            : {}),
        };
      },
      {
        headers: authHeaders,
        body: t.Object({ path: t.String(), content: t.String() }),
      },
    )
    .post(
      "/api/artifacts",
      async ({ headers, body }) => {
        const token = bearerToken(headers.authorization);
        const manifest = await artifactStore.createArtifact(
          token,
          workspaceStore.getOrCreateWorkspace(token),
          body.title,
        );
        return status(201, {
          artifact_id: manifest.id,
          title: manifest.title,
          file_count: manifest.files.length,
          created_at: manifest.createdAt,
        });
      },
      {
        headers: authHeaders,
        body: t.Object({ title: t.Optional(t.String({ maxLength: 200 })) }),
      },
    )
    .get(
      "/api/artifacts/:artifactId",
      ({ headers, params }) => {
        const token = bearerToken(headers.authorization);
        const manifest = artifactStore.readArtifact(params.artifactId, token);
        return {
          artifact_id: manifest.id,
          title: manifest.title,
          created_at: manifest.createdAt,
          is_owner: manifest.ownerToken === token,
          files: manifest.files,
        };
      },
      { headers: authHeaders, params: t.Object({ artifactId }) },
    )
    .post(
      "/api/artifacts/:artifactId/shares",
      ({ headers, params, body }) => {
        const token = bearerToken(headers.authorization);
        const manifest = artifactStore.shareArtifact(
          params.artifactId,
          token,
          body.target_token,
        );
        return { artifact_id: manifest.id, shared_with: manifest.sharedWith };
      },
      {
        headers: authHeaders,
        params: t.Object({ artifactId }),
        body: t.Object({ target_token: sessionToken }),
      },
    )
    .post(
      "/api/artifacts/:artifactId/lambdas/:name/invoke",
      async ({ headers, params, body }) => {
        const token = bearerToken(headers.authorization);
        artifactStore.readArtifact(params.artifactId, token);
        return {
          name: params.name,
          result: (
            await renderViaRuntime(
              token,
              params.artifactId,
              params.name,
              body.args,
            )
          ).body,
        };
      },
      {
        headers: authHeaders,
        params: t.Object({ artifactId, name: lambdaName }),
        body: t.Object({ args: t.Optional(t.Record(t.String(), t.String())) }),
      },
    )
    .get("/api/slopscript/reference", ({ set }) => {
      set.headers["content-type"] = "text/markdown; charset=utf-8";
      return SLOPSCRIPT_REFERENCE;
    })
    .post("/llm", ({ request }) => handleLlm(request));
}

export type App = ReturnType<typeof createApp>;

if (import.meta.main) {
  startCleanup();
  const app = createApp().listen({ hostname: "0.0.0.0", port: PORT });
  console.log(
    `sloppable api listening on http://${app.server?.hostname}:${app.server?.port}`,
  );
}
