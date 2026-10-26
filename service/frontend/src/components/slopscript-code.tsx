type TokenKind =
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "type"
  | "literal"
  | "builtin"
  | "function";

interface Token {
  kind?: TokenKind;
  text: string;
}

const KEYWORDS = new Set([
  "if",
  "else",
  "while",
  "for",
  "return",
  "break",
  "continue",
  "class",
  "extends",
  "this",
]);
const TYPES = new Set(["int", "float", "bool", "string", "void", "dict"]);
const LITERALS = new Set(["true", "false"]);
const BUILTINS = new Set([
  "atob",
  "btoa",
  "capitalize",
  "hex",
  "lowercase",
  "read_artifact",
  "reverse",
  "spc",
  "spc_core",
  "substring",
  "trim",
  "unhex",
  "uppercase",
]);

const TOKEN_PATTERN =
  /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"?)|(\d+(?:\.\d+)?)|([A-Za-z_]\w*)/g;

function identifierKind(name: string, isCall: boolean): TokenKind | undefined {
  if (KEYWORDS.has(name)) return "keyword";
  if (TYPES.has(name)) return "type";
  if (LITERALS.has(name)) return "literal";
  if (BUILTINS.has(name)) return isCall ? "builtin" : undefined;
  // Class names are capitalized by convention (Request, Response, user classes).
  if (/^[A-Z]/.test(name)) return "type";
  return isCall ? "function" : undefined;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const match of source.matchAll(TOKEN_PATTERN)) {
    if (match.index > last) {
      tokens.push({ text: source.slice(last, match.index) });
    }
    const text = match[0];
    last = match.index + text.length;

    let kind: TokenKind | undefined;
    if (match[1]) kind = "comment";
    else if (match[2]) kind = "string";
    else if (match[3]) kind = "number";
    else kind = identifierKind(text, /^\s*\(/.test(source.slice(last)));
    tokens.push({ kind, text });
  }
  if (last < source.length) tokens.push({ text: source.slice(last) });
  return tokens;
}

export function isSlopscriptPath(path: string): boolean {
  return path.endsWith(".slop");
}

export function SlopscriptCode({ source }: { source: string }) {
  return (
    <>
      {tokenize(source).map((token, index) =>
        token.kind ? (
          <span key={index} className={"slop-" + token.kind}>
            {token.text}
          </span>
        ) : (
          token.text
        ),
      )}
    </>
  );
}
