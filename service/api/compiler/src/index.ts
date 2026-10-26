export { Lexer } from "./lexer";
export { Parser, ParseError } from "./parser";
export { printAST } from "./printer";
export type * from "./ast";
export type { Token, TokenType } from "./lexer";

import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { printAST } from "./printer";
import { compile } from "./codegen";

import * as fs from "node:fs";
import * as process from "node:process";

export interface ParseResult {
  tokens: import("./lexer").Token[];
  ast: import("./ast").Program;
  astText: string;
  lexErrors: string[];
  parseErrors: string[];
  ok: boolean;
}

/**
 * Convenience function: lex + parse a C-like source string.
 * Returns tokens, AST, a pretty-printed AST, and any errors.
 */
export function parseSource(source: string): ParseResult {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();

  const parser = new Parser(tokens);
  const ast = parser.parse();

  const astText = printAST(ast);
  const ok = lexer.errors.length === 0 && parser.errors.length === 0;

  return {
    tokens,
    ast,
    astText,
    lexErrors: lexer.errors,
    parseErrors: parser.errors.map((e) => e.message),
    ok,
  };
}

// ─── CLI ─────────────────────────────────────────────────────────────────

if (require.main === module) {
  const result = parseSource(fs.readFileSync(0, "utf-8"));

  let debug = process.argv.includes("--debug");
  if (debug) {
    console.log("═══════════════════════════════════");
    console.log("         SLOP Compiler");
    console.log("═══════════════════════════════════\n");

    console.log(`Tokens: ${result.tokens.length}`);
    console.log(`Lex errors: ${result.lexErrors.length}`);
    console.log(`Parse errors: ${result.parseErrors.length}`);
    console.log(`Status: ${result.ok ? "✓ OK" : "✗ ERRORS"}\n`);

    console.log("AST:");
    console.log(result.astText);
  }

  if (result.parseErrors.length) {
    result.parseErrors.forEach((e) => console.error(e));
    process.exit(1);
  } else {
    const output = compile(result.ast, debug);
    if (output.success) {
      console.log(output.value);
    } else {
      for (const err of output.error) {
        console.error(err);
      }
      process.exit(1);
    }
  }
}
