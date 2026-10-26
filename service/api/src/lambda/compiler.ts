import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ValidationError } from "../types.js";
import { assertValidToken } from "../utils/security.js";

const COMPILED_ROOT = path.resolve(
  process.env.SLOPPABLE_COMPILED_DIR?.trim() || "/compiled",
);

const COMPILER_MEMORY_BYTES = 512 * 1024 * 1024;
const COMPILER_CPU_SECONDS = 5;

const SEGMENT_RE = /^[A-Za-z0-9._-]{1,128}$/;

export function compileSlop(source: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "/usr/bin/prlimit",
      [
        `--as=${COMPILER_MEMORY_BYTES}`,
        `--cpu=${COMPILER_CPU_SECONDS}`,
        "--",
        process.execPath,
        "/app/compiler/dist/index.js",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    child.on("error", (err) =>
      reject(new Error(`failed to launch Slopscript compiler: ${err.message}`)),
    );

    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        const detail = [stdout.trim(), stderr.trim()]
          .filter(Boolean)
          .join("\n");
        reject(
          new ValidationError(
            [
              `Slopscript compilation failed${signal ? ` (${signal})` : ""}:`,
              detail,
            ]
              .filter(Boolean)
              .join("\n"),
          ),
        );
      }
    });

    child.stdin.on("error", () => {});
    child.stdin.end(source);
  });
}

function compiledPath(namespace: string, name: string): string {
  assertValidToken(namespace, "namespace");
  if (!SEGMENT_RE.test(name)) {
    throw new ValidationError("invalid compiled module name");
  }
  const full = path.resolve(COMPILED_ROOT, namespace, name);
  const nsDir = path.resolve(COMPILED_ROOT, namespace);
  if (
    full !== path.join(nsDir, name) ||
    !full.startsWith(COMPILED_ROOT + path.sep)
  ) {
    throw new ValidationError(
      "resolved compiled path escapes the compiled root",
    );
  }
  return full;
}

export async function compileAndStore(
  namespace: string,
  name: string,
  source: string,
): Promise<void> {
  const dest = compiledPath(namespace, name);
  const wat = await compileSlop(source);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, wat);
}
