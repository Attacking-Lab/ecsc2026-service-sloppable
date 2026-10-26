// ─── Token Types ────────────────────────────────────────────────────────────

export enum TokenType {
  // Literals
  INT_LITERAL = "INT_LITERAL",
  FLOAT_LITERAL = "FLOAT_LITERAL",
  STRING_LITERAL = "STRING_LITERAL",
  BOOL_LITERAL = "BOOL_LITERAL",

  // Identifiers & Keywords
  IDENTIFIER = "IDENTIFIER",
  INT = "int",
  FLOAT = "float",
  BOOL = "bool",
  VOID = "void",
  STRING = "string",
  DICT = "dict",
  IF = "if",
  ELSE = "else",
  WHILE = "while",
  FOR = "for",
  RETURN = "return",
  BREAK = "break",
  CONTINUE = "continue",
  TRUE = "true",
  FALSE = "false",
  CLASS = "class",
  EXTENDS = "extends",
  THIS = "this",

  // Operators
  PLUS = "+",
  MINUS = "-",
  STAR = "*",
  SLASH = "/",
  PERCENT = "%",
  AMP_AMP = "&&",
  PIPE_PIPE = "||",
  BANG = "!",
  EQ_EQ = "==",
  BANG_EQ = "!=",
  LT = "<",
  GT = ">",
  LT_EQ = "<=",
  GT_EQ = ">=",
  EQ = "=",

  // Delimiters
  LPAREN = "(",
  RPAREN = ")",
  LBRACE = "{",
  RBRACE = "}",
  LBRACKET = "[",
  RBRACKET = "]",
  SEMICOLON = ";",
  COMMA = ",",
  COLON = ":",
  DOT = ".",

  // Special
  EOF = "EOF",
  UNKNOWN = "UNKNOWN",
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

const KEYWORDS: Record<string, TokenType> = {
  int: TokenType.INT,
  float: TokenType.FLOAT,
  bool: TokenType.BOOL,
  void: TokenType.VOID,
  string: TokenType.STRING,
  dict: TokenType.DICT,
  if: TokenType.IF,
  else: TokenType.ELSE,
  while: TokenType.WHILE,
  for: TokenType.FOR,
  return: TokenType.RETURN,
  break: TokenType.BREAK,
  continue: TokenType.CONTINUE,
  true: TokenType.TRUE,
  false: TokenType.FALSE,
  class: TokenType.CLASS,
  extends: TokenType.EXTENDS,
  this: TokenType.THIS,
};

// ─── Lexer ───────────────────────────────────────────────────────────────────

export class Lexer {
  private pos = 0;
  private line = 1;
  private col = 1;
  public errors: string[] = [];

  constructor(private source: string) {}

  private peek(offset = 0): string {
    return this.source[this.pos + offset] ?? "\0";
  }

  private advance(): string {
    const ch = this.source[this.pos++];
    if (ch === "\n") {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return ch;
  }

  private makeToken(
    type: TokenType,
    value: string,
    line: number,
    col: number,
  ): Token {
    return { type, value, line, col };
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
        this.advance();
      } else if (ch === "/" && this.peek(1) === "/") {
        while (this.pos < this.source.length && this.peek() !== "\n")
          this.advance();
      } else if (ch === "/" && this.peek(1) === "*") {
        this.advance();
        this.advance();
        while (this.pos < this.source.length) {
          if (this.peek() === "*" && this.peek(1) === "/") {
            this.advance();
            this.advance();
            break;
          }
          this.advance();
        }
      } else break;
    }
  }

  private readNumber(line: number, col: number): Token {
    let num = "";
    let isFloat = false;
    while (/\d/.test(this.peek())) num += this.advance();
    if (this.peek() === "." && /\d/.test(this.peek(1))) {
      isFloat = true;
      num += this.advance();
      while (/\d/.test(this.peek())) num += this.advance();
    }
    return this.makeToken(
      isFloat ? TokenType.FLOAT_LITERAL : TokenType.INT_LITERAL,
      num,
      line,
      col,
    );
  }

  private readString(line: number, col: number): Token {
    this.advance(); // consume opening "
    let str = "";
    while (this.pos < this.source.length && this.peek() !== '"') {
      if (this.peek() === "\\") {
        this.advance();
        const esc = this.advance();
        str +=
          esc === "n" ? "\n" : esc === "t" ? "\t" : esc === "r" ? "\r" : esc;
      } else str += this.advance();
    }
    if (this.peek() === '"') this.advance();
    else this.errors.push(`Unterminated string at line ${line}:${col}`);
    return this.makeToken(TokenType.STRING_LITERAL, str, line, col);
  }

  private readIdentOrKeyword(line: number, col: number): Token {
    let ident = "";
    while (/[a-zA-Z0-9_]/.test(this.peek())) ident += this.advance();
    const type = KEYWORDS[ident] ?? TokenType.IDENTIFIER;
    return this.makeToken(type, ident, line, col);
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (true) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.source.length) {
        tokens.push(this.makeToken(TokenType.EOF, "", this.line, this.col));
        break;
      }
      const line = this.line,
        col = this.col;
      const ch = this.peek();

      if (/\d/.test(ch)) {
        tokens.push(this.readNumber(line, col));
        continue;
      }
      if (ch === '"') {
        tokens.push(this.readString(line, col));
        continue;
      }
      if (/[a-zA-Z_]/.test(ch)) {
        tokens.push(this.readIdentOrKeyword(line, col));
        continue;
      }

      // Operators & symbols
      this.advance();
      switch (ch) {
        case "+":
          tokens.push(this.makeToken(TokenType.PLUS, "+", line, col));
          break;
        case "-":
          tokens.push(this.makeToken(TokenType.MINUS, "-", line, col));
          break;
        case "*":
          tokens.push(this.makeToken(TokenType.STAR, "*", line, col));
          break;
        case "/":
          tokens.push(this.makeToken(TokenType.SLASH, "/", line, col));
          break;
        case "%":
          tokens.push(this.makeToken(TokenType.PERCENT, "%", line, col));
          break;
        case "&":
          if (this.peek() === "&") {
            this.advance();
            tokens.push(this.makeToken(TokenType.AMP_AMP, "&&", line, col));
          }
          break;
        case "|":
          if (this.peek() === "|") {
            this.advance();
            tokens.push(this.makeToken(TokenType.PIPE_PIPE, "||", line, col));
          }
          break;
        case "!":
          if (this.peek() === "=") {
            this.advance();
            tokens.push(this.makeToken(TokenType.BANG_EQ, "!=", line, col));
          } else tokens.push(this.makeToken(TokenType.BANG, "!", line, col));
          break;
        case "=":
          if (this.peek() === "=") {
            this.advance();
            tokens.push(this.makeToken(TokenType.EQ_EQ, "==", line, col));
          } else tokens.push(this.makeToken(TokenType.EQ, "=", line, col));
          break;
        case "<":
          if (this.peek() === "=") {
            this.advance();
            tokens.push(this.makeToken(TokenType.LT_EQ, "<=", line, col));
          } else tokens.push(this.makeToken(TokenType.LT, "<", line, col));
          break;
        case ">":
          if (this.peek() === "=") {
            this.advance();
            tokens.push(this.makeToken(TokenType.GT_EQ, ">=", line, col));
          } else tokens.push(this.makeToken(TokenType.GT, ">", line, col));
          break;
        case "(":
          tokens.push(this.makeToken(TokenType.LPAREN, "(", line, col));
          break;
        case ")":
          tokens.push(this.makeToken(TokenType.RPAREN, ")", line, col));
          break;
        case "{":
          tokens.push(this.makeToken(TokenType.LBRACE, "{", line, col));
          break;
        case "}":
          tokens.push(this.makeToken(TokenType.RBRACE, "}", line, col));
          break;
        case "[":
          tokens.push(this.makeToken(TokenType.LBRACKET, "[", line, col));
          break;
        case "]":
          tokens.push(this.makeToken(TokenType.RBRACKET, "]", line, col));
          break;
        case ";":
          tokens.push(this.makeToken(TokenType.SEMICOLON, ";", line, col));
          break;
        case ",":
          tokens.push(this.makeToken(TokenType.COMMA, ",", line, col));
          break;
        case ":":
          tokens.push(this.makeToken(TokenType.COLON, ":", line, col));
          break;
        case ".":
          tokens.push(this.makeToken(TokenType.DOT, ".", line, col));
          break;
        default:
          this.errors.push(`Unknown character '${ch}' at ${line}:${col}`);
          tokens.push(this.makeToken(TokenType.UNKNOWN, ch, line, col));
      }
    }
    return tokens;
  }
}
