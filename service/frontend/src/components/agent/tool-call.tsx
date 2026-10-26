import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FileCode2,
  LoaderCircle,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ToolCallPart {
  name: string;
  state: string;
  arguments: string;
  input?: unknown;
  output?: unknown;
}

function humanize(value: string): string {
  const label = value.replaceAll("_", " ").replaceAll("-", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function parseArguments(value: string): unknown {
  if (!value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarize(value: unknown): string | undefined {
  if (typeof value === "string") {
    const firstLine = value.trim().split("\n", 1)[0];
    return firstLine.length > 64 ? firstLine.slice(0, 61) + "…" : firstLine;
  }

  if (!isRecord(value)) return undefined;
  if (Array.isArray(value.files)) {
    return value.files.length === 1 ? "1 file" : value.files.length + " files";
  }
  for (const key of ["path", "name", "title", "artifact_id"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate.length > 64 ? candidate.slice(0, 61) + "…" : candidate;
    }
  }

  if (typeof value.found === "boolean") {
    return value.found ? "File found" : "File not found";
  }

  return undefined;
}

function formatBytes(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(value < 10_240 ? 1 : 0)} KB`;
}

function hasSpecializedOutput(name: string, value: unknown): boolean {
  if (!isRecord(value)) return false;
  return name === "list_files" && Array.isArray(value.files);
}

function lambdaResult(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.result !== "string") return undefined;
  return value.result;
}

function LambdaOutputPreview({ output }: { output: unknown }) {
  const result = lambdaResult(output);
  if (result === undefined) return null;

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
      <iframe
        className="h-64 w-full border-0 bg-white"
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={result}
        title="Lambda output preview"
      />
    </section>
  );
}

function SpecializedToolOutput({
  name,
  value,
}: {
  name: string;
  value: unknown;
}) {
  if (!isRecord(value)) return null;

  if (name === "list_files" && Array.isArray(value.files)) {
    return (
      <div className="divide-y border-t bg-muted/10">
        {value.files.length === 0 ? (
          <p className="px-3 py-5 text-center text-muted-foreground">
            No files in this workspace.
          </p>
        ) : (
          value.files.map((item, index) => {
            if (!isRecord(item)) return null;
            const path =
              typeof item.path === "string" ? item.path : "Unknown file";
            return (
              <div
                key={path + index}
                className="flex min-w-0 items-center gap-3 px-3 py-2.5"
              >
                <FileCode2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-[0.72rem]">
                  {path}
                </span>
                <Badge
                  variant="outline"
                  className="normal-case tracking-normal"
                >
                  {formatBytes(item.bytes)}
                </Badge>
              </div>
            );
          })
        )}
      </div>
    );
  }

  return null;
}

function ToolPayload({
  label,
  value,
  error = false,
}: {
  label: string;
  value: unknown;
  error?: boolean;
}) {
  const formatted = formatValue(value);

  return (
    <section
      className={cn("min-w-0 overflow-hidden", error && "bg-destructive/5")}
    >
      <header className="border-b px-3 py-2">
        <span className="font-mono text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </header>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[0.72rem] leading-5">
        {formatted || "—"}
      </pre>
    </section>
  );
}

export function ToolCall({ part }: { part: ToolCallPart }) {
  const active = !["complete", "error"].includes(part.state);
  const failed = part.state === "error";
  const input = part.input ?? parseArguments(part.arguments);
  const summary = summarize(part.output) ?? summarize(input);
  const specialized = hasSpecializedOutput(part.name, part.output);
  const showLambdaPreview =
    part.name === "call_lambda" && lambdaResult(part.output) !== undefined;

  return (
    <div className="space-y-2">
      <details
        className={cn(
          "group/tool overflow-hidden rounded-xl border bg-card/70 text-xs shadow-sm",
          failed && "border-destructive/30",
        )}
        open={failed || undefined}
      >
        <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 marker:hidden hover:bg-muted/50">
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <Wrench className="size-3 shrink-0" />
              {humanize(part.name)}
            </span>
            {summary && (
              <span className="mt-0.5 block truncate text-[0.68rem] text-muted-foreground">
                {summary}
              </span>
            )}
          </span>
          <span
            className="shrink-0"
            aria-label={active ? "Running" : failed ? "Failed" : "Complete"}
          >
            {active ? (
              <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
            ) : failed ? (
              <CircleAlert className="size-3.5 text-destructive" />
            ) : (
              <CheckCircle2 className="size-3.5 text-emerald-600" />
            )}
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open/tool:rotate-180"
            aria-hidden="true"
          />
        </summary>

        {specialized ? (
          <SpecializedToolOutput name={part.name} value={part.output} />
        ) : (
          <div
            className={cn(
              "grid divide-y border-t bg-muted/20",
              part.output !== undefined &&
                "md:grid-cols-2 md:divide-x md:divide-y-0",
            )}
          >
            <ToolPayload label="Input" value={input} />
            {part.output !== undefined && (
              <ToolPayload
                label={failed ? "Error" : "Output"}
                value={part.output}
                error={failed}
              />
            )}
          </div>
        )}
      </details>

      {showLambdaPreview && <LambdaOutputPreview output={part.output} />}
    </div>
  );
}
