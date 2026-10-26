import { randomUUID } from "node:crypto";
import { EventType } from "@tanstack/ai";
import type {
  AdapterYieldChunk,
  ModelMessage,
  TextOptions,
} from "@tanstack/ai";

export interface ParsedFallbackCommand {
  toolName: string;
  input: Record<string, unknown>;
}

const HELP = `## Workspace assistant

I can help you manage files, publish artifacts, and work with lambdas. Send one of these commands:

### Files

- \`Write file <path> with content "<content>"\`
- \`Read file <path>\`
- \`List files\`

### Artifacts

- \`Publish workspace\`
- \`Publish workspace as "<title>"\`
- \`Read artifact <uuid>\`
- \`Share artifact <uuid> with <session-token>\`

### Lambdas

- \`Call lambda <name> from artifact <uuid> with args {"key":"value"}\`

### Reference

- \`Show Slopscript reference\`

> Replace values in \`<angle brackets>\` with your own values.`;

const SUCCESS_OPENERS = [
  "Certainly!",
  "Absolutely!",
  "Great question!",
  "Let's delve into this.",
  "I'd be happy to help with that!",
];

const FAILURE_OPENERS = [
  "You were right to push back.",
  "You're absolutely right!",
  "Good catch!",
  "I apologize for the confusion.",
];

const HELP_OPENERS = [
  "Great question! Let's delve into this.",
  "That's a fascinating request, and it's important to note that I didn't understand it.",
  "As a large language model, I can only do the following.",
];

const CLOSERS = [
  "I hope this helps!",
  "Let me know if you'd like me to elaborate!",
  "Is there anything else I can help you with?",
];

function pick(options: Array<string>): string {
  return options[Math.floor(Math.random() * options.length)];
}

function chatty(opener: string, body: string): string {
  return `${opener}\n\n${body}\n\n${pick(CLOSERS)}`;
}

function parseJsonString(value: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function parseFallbackCommand(
  input: string,
): ParsedFallbackCommand | undefined {
  const text = input.trim();
  let match: RegExpMatchArray | null;

  match = text.match(
    /^write file\s+(\S+)\s+with content\s+("(?:[^"\\]|\\.)*")$/i,
  );
  if (match) {
    const content = parseJsonString(match[2]);
    if (content !== undefined)
      return { toolName: "write_file", input: { path: match[1], content } };
    return undefined;
  }
  match = text.match(/^read file\s+(\S+)$/i);
  if (match) return { toolName: "read_file", input: { path: match[1] } };
  if (/^list files$/i.test(text)) return { toolName: "list_files", input: {} };
  if (/^publish workspace$/i.test(text))
    return { toolName: "publish_workspace", input: {} };
  match = text.match(/^publish workspace as\s+("(?:[^"\\]|\\.)*")$/i);
  if (match) {
    const title = parseJsonString(match[1]);
    if (title !== undefined)
      return { toolName: "publish_workspace", input: { title } };
    return undefined;
  }
  match = text.match(/^read artifact\s+([0-9a-f-]+)$/i);
  if (match)
    return { toolName: "read_artifact", input: { artifact_id: match[1] } };
  match = text.match(/^share artifact\s+([0-9a-f-]+)\s+with\s+(\S+)$/i);
  if (match)
    return {
      toolName: "share_artifact",
      input: { artifact_id: match[1], target_token: match[2] },
    };
  match = text.match(
    /^call lambda\s+([A-Za-z0-9_-]+)\s+from artifact\s+([0-9a-f-]+)\s+with args\s+(.+)$/i,
  );
  if (match) {
    try {
      const args: unknown = JSON.parse(match[3]);
      if (args && typeof args === "object" && !Array.isArray(args)) {
        return {
          toolName: "call_lambda",
          input: { name: match[1], artifact_id: match[2], args },
        };
      }
    } catch {
      return undefined;
    }
    return undefined;
  }
  if (/^show slopscript reference$/i.test(text))
    return { toolName: "slopscript_reference", input: {} };
  return undefined;
}

function messageText(message: ModelMessage | undefined): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .filter((part) => part.type === "text")
    .map((part) =>
      "content" in part && typeof part.content === "string" ? part.content : "",
    )
    .join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseToolResult(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function inlineCode(value: string): string {
  return `\`${value.replaceAll("\`", "\\\`")}\``;
}

function toolLabel(value: string): string {
  const label = value.replaceAll("_", " ").replaceAll("-", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function plural(count: number, singular: string, pluralForm = singular + "s") {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function resultPreview(value: unknown): string {
  const language = typeof value === "string" ? "text" : "json";
  const formatted =
    typeof value === "string"
      ? value
      : (JSON.stringify(value, null, 2) ?? String(value));
  const compact =
    formatted.length > 1_000 ? formatted.slice(0, 997) + "..." : formatted;
  if (!compact.includes("\n") && compact.length <= 100) {
    return inlineCode(compact);
  }

  const longestRun = Math.max(
    2,
    ...[...compact.matchAll(/`+/g)].map((match) => match[0].length),
  );
  const fence = "`".repeat(longestRun + 1);
  return `${fence}${language}\n${compact}\n${fence}`;
}

function formatFileList(files: Array<unknown>): string {
  return files
    .map((item, index) => {
      if (!isRecord(item) || typeof item.path !== "string") {
        return `- File ${index + 1}`;
      }
      const bytes =
        typeof item.bytes === "number"
          ? item.bytes
          : typeof item.content === "string"
            ? item.content.length
            : undefined;
      const size = bytes === undefined ? "" : ` — ${plural(bytes, "byte")}`;
      return `- ${inlineCode(item.path)}${size}`;
    })
    .join("\n");
}

function formatToolResult(toolName: string, result: unknown): string {
  const record = isRecord(result) ? result : undefined;

  switch (toolName) {
    case "list_files": {
      const files = record?.files;
      if (!Array.isArray(files)) break;
      if (files.length === 0) return "The workspace has no files yet.";
      return `### Workspace files\n\n${formatFileList(files)}`;
    }
    case "write_file": {
      if (!record || typeof record.path !== "string") break;
      const path = record.path;
      const size =
        typeof record.bytes === "number"
          ? ` (**${plural(record.bytes, "byte")}**)`
          : "";
      const registered =
        typeof record.lambda_source === "string"
          ? ` Recognized Lambda source ${inlineCode(record.lambda_source)}.`
          : "";
      return `Saved ${inlineCode(path)}${size}.${registered}`;
    }
    case "read_file": {
      if (!record || typeof record.path !== "string") break;
      const path = record.path;
      return record.found === false
        ? `I couldn't find ${inlineCode(path)}.`
        : `Opened ${inlineCode(path)}.`;
    }
    case "publish_workspace": {
      const id = record?.artifact_id;
      const title =
        typeof record?.title === "string" ? record.title : "Untitled Artifact";
      const count =
        typeof record?.file_count === "number"
          ? ` with **${plural(record.file_count, "file")}**`
          : "";
      const artifact =
        typeof id === "string" ? `\n\nArtifact ID: ${inlineCode(id)}` : "";
      return `Published ${inlineCode(title)}${count}.${artifact}`;
    }
    case "read_artifact": {
      const id = record?.artifact_id;
      const title =
        typeof record?.title === "string" ? record.title : "Untitled Artifact";
      const files = record?.files;
      const artifact =
        typeof id === "string" ? `\n\nArtifact ID: ${inlineCode(id)}` : "";
      const contents = Array.isArray(files)
        ? files.length === 0
          ? "\n\nThis artifact has no files."
          : `\n\n### Files\n\n${formatFileList(files)}`
        : "";
      return `Loaded ${inlineCode(title)}.${artifact}${contents}`;
    }
    case "share_artifact": {
      const id = record?.artifact_id;
      return typeof id === "string"
        ? `Shared artifact ${inlineCode(id)} successfully.`
        : "Shared the artifact successfully.";
    }
    case "call_lambda": {
      const name =
        typeof record?.name === "string"
          ? inlineCode(record.name)
          : "The lambda";
      if (record && "result" in record) {
        return `${name} returned:\n\n${resultPreview(record.result)}`;
      }
      break;
    }
    case "slopscript_reference": {
      const reference = record?.reference;
      return typeof reference === "string" && reference.trim()
        ? reference
        : "The Slopscript reference is unavailable.";
    }
  }

  return `**${toolLabel(toolName)} completed successfully.**`;
}

function summarizeToolResult(
  messages: Array<ModelMessage>,
): string | undefined {
  const last = messages.at(-1);
  if (last?.role !== "tool") return undefined;
  let toolName = "tool";
  for (let index = messages.length - 2; index >= 0; index -= 1) {
    const call = messages[index].toolCalls?.find(
      (candidate) => candidate.id === last.toolCallId,
    );
    if (call) {
      toolName = call.function.name;
      break;
    }
  }

  if (last.error) {
    return chatty(
      pick(FAILURE_OPENERS),
      `**${toolLabel(toolName)} failed.**\n\n${resultPreview(last.error)}`,
    );
  }

  const rawResult = messageText(last).trim();
  if (!rawResult) {
    return chatty(
      pick(SUCCESS_OPENERS),
      `**${toolLabel(toolName)} completed.**`,
    );
  }

  const result = parseToolResult(rawResult);
  if (isRecord(result) && typeof result.error === "string") {
    return chatty(
      pick(FAILURE_OPENERS),
      `**${toolLabel(toolName)} failed.**\n\n${resultPreview(result.error)}`,
    );
  }
  return chatty(pick(SUCCESS_OPENERS), formatToolResult(toolName, result));
}

export class FallbackTextAdapter {
  readonly kind = "text" as const;
  readonly name = "fallback" as const;
  readonly model = "deterministic-command-parser" as const;
  declare "~types": {
    providerOptions: Record<string, never>;
    inputModalities: readonly ["text"];
    messageMetadataByModality: Record<string, never>;
    toolCapabilities: readonly ["function"];
    toolCallMetadata: unknown;
    systemPromptMetadata: never;
  };

  async *chatStream(
    options: TextOptions<Record<string, never>>,
  ): AsyncIterable<AdapterYieldChunk> {
    const runId = options.runId ?? randomUUID();
    const threadId = options.threadId ?? randomUUID();
    const messageId = randomUUID();
    options.logger.request(
      `activity=chat provider=fallback model=${this.model}`,
      {
        provider: this.name,
        model: this.model,
      },
    );
    yield {
      type: EventType.RUN_STARTED,
      runId,
      threadId,
      model: this.model,
      timestamp: Date.now(),
    };

    const summary = summarizeToolResult(options.messages);
    const latestUser = [...options.messages]
      .reverse()
      .find((message) => message.role === "user");
    const parsed = summary
      ? undefined
      : parseFallbackCommand(messageText(latestUser));
    const advertised = new Set((options.tools ?? []).map((tool) => tool.name));

    if (parsed && advertised.has(parsed.toolName)) {
      const toolCallId = randomUUID();
      const args = JSON.stringify(parsed.input);
      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: parsed.toolName,
        toolName: parsed.toolName,
        parentMessageId: messageId,
        model: this.model,
        timestamp: Date.now(),
      };
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        delta: args,
        model: this.model,
        timestamp: Date.now(),
      };
      yield {
        type: EventType.TOOL_CALL_END,
        toolCallId,
        toolCallName: parsed.toolName,
        toolName: parsed.toolName,
        input: parsed.input,
        model: this.model,
        timestamp: Date.now(),
      };
      yield {
        type: EventType.RUN_FINISHED,
        runId,
        threadId,
        model: this.model,
        timestamp: Date.now(),
        finishReason: "tool_calls",
      };
      return;
    }

    const response = summary ?? chatty(pick(HELP_OPENERS), HELP);
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: "assistant",
      model: this.model,
      timestamp: Date.now(),
    };
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: response,
      content: response,
      model: this.model,
      timestamp: Date.now(),
    };
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId,
      model: this.model,
      timestamp: Date.now(),
    };
    yield {
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      model: this.model,
      timestamp: Date.now(),
      finishReason: "stop",
    };
  }

  async structuredOutput(): Promise<never> {
    throw new Error(
      "Structured output is not supported by the deterministic fallback",
    );
  }
}

export const FALLBACK_HELP = HELP;
