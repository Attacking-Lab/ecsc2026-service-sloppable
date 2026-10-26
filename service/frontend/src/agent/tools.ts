import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { api, type WorkspaceFile, type WorkspaceFileContent } from "@/lib/api";

export interface AgentToolCallbacks {
  onFilesListed?: (files: WorkspaceFile[]) => void;
  onFileRead?: (file: WorkspaceFileContent) => void;
  onWorkspaceChanged?: (path: string) => void | Promise<void>;
}

export function createAgentTools(
  sessionToken: string,
  callbacks: AgentToolCallbacks = {},
) {
  const writeFile = toolDefinition({
    name: "write_file",
    description:
      "Create or overwrite a file in the current workspace. A path matching lambdas/<name>.slop becomes a Lambda when the workspace is published.",
    inputSchema: z.object({
      path: z.string().describe("Workspace-relative path"),
      content: z.string().describe("Complete file contents"),
    }),
  }).client(async ({ path, content }) => {
    const result = await api.writeFile(sessionToken, path, content);
    await callbacks.onWorkspaceChanged?.(result.path);
    return result;
  });

  const readFile = toolDefinition({
    name: "read_file",
    description: "Read one file from the current workspace.",
    inputSchema: z.object({
      path: z.string().describe("Workspace-relative path"),
    }),
  }).client(async ({ path }) => {
    const result = await api.readFile(sessionToken, path);
    callbacks.onFileRead?.(result);
    return result;
  });

  const listFiles = toolDefinition({
    name: "list_files",
    description:
      "List the files in the current workspace, including size and modification time.",
    inputSchema: z.object({}),
  }).client(async () => {
    const result = await api.listFiles(sessionToken);
    callbacks.onFilesListed?.(result.files);
    return result;
  });

  const publishWorkspace = toolDefinition({
    name: "publish_workspace",
    description:
      "Publish the current workspace as a private immutable artifact.",
    inputSchema: z.object({ title: z.string().max(200).optional() }),
  }).client(({ title }) => api.publishWorkspace(sessionToken, title));

  const readArtifact = toolDefinition({
    name: "read_artifact",
    description:
      "Read a published artifact that this session owns or has been granted access to.",
    inputSchema: z.object({ artifact_id: z.string().uuid() }),
  }).client(({ artifact_id }) => api.readArtifact(sessionToken, artifact_id));

  const shareArtifact = toolDefinition({
    name: "share_artifact",
    description:
      "Grant another session token read access to an artifact owned by this session.",
    inputSchema: z.object({
      artifact_id: z.string().uuid(),
      target_token: z.string().min(8).max(128),
    }),
  }).client(({ artifact_id, target_token }) =>
    api.shareArtifact(sessionToken, artifact_id, target_token),
  );

  const callLambda = toolDefinition({
    name: "call_lambda",
    description: "Invoke a named lambda compiled in an accessible artifact.",
    inputSchema: z.object({
      artifact_id: z.string().uuid(),
      name: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
      args: z.record(z.string(), z.string()).optional(),
    }),
  }).client(({ artifact_id, name, args }) =>
    api.callLambda(sessionToken, artifact_id, name, args),
  );

  const slopscriptReference = toolDefinition({
    name: "slopscript_reference",
    description:
      "Read the authoritative Slopscript language reference before writing a .slop lambda.",
    inputSchema: z.object({}),
  }).client(() => api.slopscriptReference());

  return [
    writeFile,
    readFile,
    listFiles,
    publishWorkspace,
    readArtifact,
    shareArtifact,
    callLambda,
    slopscriptReference,
  ] as const;
}
