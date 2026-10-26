import { Token, TokenType } from "./lexer";
import type {
  Expr,
  Stmt,
  TopLevelDecl,
  Program,
  ParamDecl,
  BlockStmt,
  AssignStmt,
  FunctionDecl,
  ClassDecl,
  ClassMember,
  FieldDecl,
  MethodDecl,
  VarDeclStmt,
  ExprStmt,
  IfStmt,
  WhileStmt,
  ForStmt,
  ReturnStmt,
  BinaryExpr,
  UnaryExpr,
  CallExpr,
  IndexExpr,
  MemberExpr,
  ThisExpr,
} from "./ast";
import type {
  ASTType,
  Primitive,
  PrimitiveType,
  ArrayType,
  ClassType,
} from "./types";

// ─── Parse Error ─────────────────────────────────────────────────────────────

export class ParseError extends Error {
  constructor(
    message: string,
    public token: Token,
  ) {
    super(
      `[${token.line}:${token.col}] ${message} (got '${token.value || token.type}')`,
    );
  }
}

// ─── Parser ──────────────────────────────────────────────────────────────────

export class Parser {
  private pos = 0;
  public errors: ParseError[] = [];

  constructor(private tokens: Token[]) {}

  // ── Token Utilities ────────────────────────────────────────────────────────

  private peek(offset = 0): Token {
    const idx = this.pos + offset;
    return this.tokens[idx < this.tokens.length ? idx : this.tokens.length - 1];
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    if (t.type !== TokenType.EOF) this.pos++;
    return t;
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private match(...types: TokenType[]): boolean {
    for (const t of types) {
      if (this.check(t)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private expect(type: TokenType, msg?: string): Token {
    if (this.check(type)) return this.advance();
    const err = new ParseError(msg ?? `Expected '${type}'`, this.peek());
    this.errors.push(err);
    // Return a synthetic token to allow recovery
    return { type, value: "", line: this.peek().line, col: this.peek().col };
  }

  private isTypeKeyword(): boolean {
    const t = this.peek().type;
    return (
      t === TokenType.INT ||
      t === TokenType.FLOAT ||
      t === TokenType.BOOL ||
      t === TokenType.VOID ||
      t === TokenType.STRING ||
      t === TokenType.DICT
    );
  }

  // Returns true if the current position looks like a type followed by an identifier:
  // covers both built-in types and class-name types (Identifier Identifier).
  private isVarOrFuncStart(): boolean {
    if (this.isTypeKeyword()) return true;
    // class-typed: IDENTIFIER IDENTIFIER (e.g. `Animal dog`)
    if (this.peek().type !== TokenType.IDENTIFIER) {
      return false;
    }

    let i = 1;
    while (
      this.peek(i).type === TokenType.LBRACKET &&
      this.peek(i + 1).type === TokenType.RBRACKET
    ) {
      i += 2;
    }

    return this.peek(i).type === TokenType.IDENTIFIER;
  }

  // ── Type Parsing ───────────────────────────────────────────────────────────

  private parseType(): ASTType {
    const baseToken = this.advance();
    // Class type name (an identifier used as a type)
    let base: ASTType = {
      kind: "PrimitiveType",
      name: baseToken.value as Primitive,
    };
    if (baseToken.type === TokenType.IDENTIFIER) {
      base = { kind: "ClassType", name: baseToken.value };
    }
    while (this.check(TokenType.LBRACKET)) {
      this.advance();
      this.expect(TokenType.RBRACKET, "Expected ']' after '['");
      base = { kind: "ArrayType", inner: base };
    }
    return base;
  }

  // ── Program ────────────────────────────────────────────────────────────────

  parse(): Program {
    const declarations: TopLevelDecl[] = [];
    while (!this.check(TokenType.EOF)) {
      try {
        declarations.push(this.parseTopLevel());
      } catch (e) {
        if (e instanceof ParseError) {
          this.errors.push(e);
          this.synchronize();
        } else throw e;
      }
    }
    return { kind: "Program", declarations };
  }

  private synchronize(): void {
    while (!this.check(TokenType.EOF)) {
      if (this.peek(-1 + this.pos > 0 ? -1 : 0).type === TokenType.SEMICOLON)
        return;
      const t = this.peek().type;
      if (
        t === TokenType.INT ||
        t === TokenType.FLOAT ||
        t === TokenType.BOOL ||
        t === TokenType.VOID ||
        t === TokenType.STRING ||
        t === TokenType.CLASS ||
        t === TokenType.IF ||
        t === TokenType.WHILE ||
        t === TokenType.FOR ||
        t === TokenType.RETURN
      )
        return;
      this.advance();
    }
  }

  // ── Top-level ─────────────────────────────────────────────────────────────

  private parseTopLevel(): TopLevelDecl {
    // class declaration
    if (this.peek().type === TokenType.CLASS) {
      return this.parseClassDecl();
    }

    if (!this.isVarOrFuncStart()) {
      throw new ParseError(
        "Expected type keyword or class declaration",
        this.peek(),
      );
    }
    const savedPos = this.pos;
    const returnType = this.parseType();
    const name = this.expect(TokenType.IDENTIFIER, "Expected name").value;

    return this.parseFunctionRest(returnType, name);
  }

  // ── Class Declaration ──────────────────────────────────────────────────────

  private parseClassDecl(): ClassDecl {
    this.advance(); // consume 'class'
    const name = this.expect(TokenType.IDENTIFIER, "Expected class name").value;

    let superClass: string | null = null;
    if (this.peek().type === TokenType.EXTENDS) {
      this.advance();
      superClass = this.expect(
        TokenType.IDENTIFIER,
        "Expected superclass name",
      ).value;
    }

    this.expect(TokenType.LBRACE);
    const members: ClassMember[] = [];

    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      try {
        members.push(this.parseClassMember(name));
      } catch (e) {
        if (e instanceof ParseError) {
          this.errors.push(e);
          this.synchronize();
        } else throw e;
      }
    }

    this.expect(TokenType.RBRACE);
    return { kind: "ClassDecl", name, superClass, members };
  }

  private parseClassMember(className: string): ClassMember {
    // Must be a type keyword or class-name type
    if (!this.isVarOrFuncStart()) {
      throw new ParseError("Expected field or method declaration", this.peek());
    }

    const memberType = this.parseType();
    const memberName = this.expect(
      TokenType.IDENTIFIER,
      "Expected member name",
    ).value;

    if (this.check(TokenType.LPAREN)) {
      // Method
      this.advance();
      const params = this.parseParamList();
      this.expect(TokenType.RPAREN);
      const body = this.parseBlock();
      return {
        kind: "MethodDecl",
        returnType: memberType,
        name: memberName,
        params,
        body,
      } as MethodDecl;
    } else {
      // Field
      this.expect(TokenType.SEMICOLON);
      return {
        kind: "FieldDecl",
        fieldType: memberType,
        name: memberName,
      } as FieldDecl;
    }
  }

  private parseFunctionRest(returnType: ASTType, name: string): FunctionDecl {
    this.expect(TokenType.LPAREN);
    const params = this.parseParamList();
    this.expect(TokenType.RPAREN);
    const body = this.parseBlock();
    return { kind: "FunctionDecl", returnType, name, params, body };
  }

  private parseParamList(): ParamDecl[] {
    const params: ParamDecl[] = [];
    if (this.check(TokenType.RPAREN)) return params;
    do {
      const paramType = this.parseType();
      const name = this.expect(
        TokenType.IDENTIFIER,
        "Expected parameter name",
      ).value;
      params.push({ paramType, name });
    } while (this.match(TokenType.COMMA));
    return params;
  }

  // ── Statements ─────────────────────────────────────────────────────────────

  private parseBlock(): BlockStmt {
    this.expect(TokenType.LBRACE);
    const body: Stmt[] = [];
    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      try {
        body.push(this.parseStatement());
      } catch (e) {
        if (e instanceof ParseError) {
          this.errors.push(e);
          this.synchronize();
        } else throw e;
      }
    }
    this.expect(TokenType.RBRACE);
    return { kind: "Block", body };
  }

  private parseStatement(): Stmt {
    const t = this.peek().type;

    if (t === TokenType.LBRACE) return this.parseBlock();
    if (t === TokenType.IF) return this.parseIf();
    if (t === TokenType.WHILE) return this.parseWhile();
    if (t === TokenType.FOR) return this.parseFor();
    if (t === TokenType.RETURN) return this.parseReturn();
    if (t === TokenType.BREAK) {
      this.advance();
      this.expect(TokenType.SEMICOLON);
      return { kind: "Break" };
    }
    if (t === TokenType.CONTINUE) {
      this.advance();
      this.expect(TokenType.SEMICOLON);
      return { kind: "Continue" };
    }
    if (this.isVarOrFuncStart()) return this.parseVarDecl();

    const stmt = this.parseAssignmentOrExpr();
    this.expect(TokenType.SEMICOLON);
    return stmt;
  }

  private parseVarDecl(): VarDeclStmt {
    const varType = this.parseType();
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.EQ);
    let initializer = this.parseExpr();
    this.expect(TokenType.SEMICOLON);
    return { kind: "VarDecl", varType, name, initializer };
  }

  private parseIf(): IfStmt {
    this.advance(); // consume 'if'
    this.expect(TokenType.LPAREN);
    const condition = this.parseExpr();
    this.expect(TokenType.RPAREN);
    const consequent = this.parseStatement();
    let alternate: Stmt | null = null;
    if (this.match(TokenType.ELSE)) alternate = this.parseStatement();
    return { kind: "If", condition, consequent, alternate };
  }

  private parseWhile(): WhileStmt {
    this.advance();
    this.expect(TokenType.LPAREN);
    const condition = this.parseExpr();
    this.expect(TokenType.RPAREN);
    const body = this.parseStatement();
    return { kind: "While", condition, body };
  }

  private parseFor(): ForStmt {
    this.advance();
    this.expect(TokenType.LPAREN);

    let init: Stmt | null = null;
    if (!this.check(TokenType.SEMICOLON)) {
      if (this.isVarOrFuncStart()) init = this.parseVarDecl();
      else {
        init = { kind: "ExprStmt", expr: this.parseExpr() };
        this.expect(TokenType.SEMICOLON);
      }
    } else this.advance();

    const condition = this.check(TokenType.SEMICOLON) ? null : this.parseExpr();
    this.expect(TokenType.SEMICOLON);

    const update = this.check(TokenType.RPAREN)
      ? null
      : this.parseAssignmentOrExpr();
    this.expect(TokenType.RPAREN);

    const body = this.parseStatement();
    return { kind: "For", init, condition, update, body };
  }

  private parseReturn(): ReturnStmt {
    this.advance();
    const value = this.check(TokenType.SEMICOLON) ? null : this.parseExpr();
    this.expect(TokenType.SEMICOLON);
    return { kind: "Return", value };
  }

  private parseAssignmentOrExpr(): Stmt {
    const left = this.parseExpr();
    if (this.check(TokenType.EQ)) {
      const opStr = this.advance().value;
      const value = this.parseExpr();
      return { kind: "Assign", target: left, value };
    }

    return { kind: "ExprStmt", expr: left };
  }

  // ── Expressions (Pratt/recursive descent) ─────────────────────────────────

  private parseExpr(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.check(TokenType.PIPE_PIPE)) {
      const op = this.advance().value;
      const right = this.parseAnd();
      left = { kind: "Binary", op, left, right } as BinaryExpr;
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseEquality();
    while (this.check(TokenType.AMP_AMP)) {
      const op = this.advance().value;
      const right = this.parseEquality();
      left = { kind: "Binary", op, left, right } as BinaryExpr;
    }
    return left;
  }

  private parseEquality(): Expr {
    let left = this.parseRelational();
    while (this.check(TokenType.EQ_EQ) || this.check(TokenType.BANG_EQ)) {
      const op = this.advance().value;
      const right = this.parseRelational();
      left = { kind: "Binary", op, left, right } as BinaryExpr;
    }
    return left;
  }

  private parseRelational(): Expr {
    let left = this.parseAdditive();
    while (
      [TokenType.LT, TokenType.GT, TokenType.LT_EQ, TokenType.GT_EQ].some((t) =>
        this.check(t),
      )
    ) {
      const op = this.advance().value;
      const right = this.parseAdditive();
      left = { kind: "Binary", op, left, right } as BinaryExpr;
    }
    return left;
  }

  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    while (this.check(TokenType.PLUS) || this.check(TokenType.MINUS)) {
      const op = this.advance().value;
      const right = this.parseMultiplicative();
      left = { kind: "Binary", op, left, right } as BinaryExpr;
    }
    return left;
  }

  private parseMultiplicative(): Expr {
    let left = this.parseUnary();
    while (
      this.check(TokenType.STAR) ||
      this.check(TokenType.SLASH) ||
      this.check(TokenType.PERCENT)
    ) {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = { kind: "Binary", op, left, right } as BinaryExpr;
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.check(TokenType.BANG) || this.check(TokenType.MINUS)) {
      const op = this.advance().value;
      const operand = this.parseUnary();
      return { kind: "Unary", op, operand } as UnaryExpr;
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary();
    while (true) {
      if (this.check(TokenType.LPAREN)) {
        this.advance();
        const args: Expr[] = [];
        if (!this.check(TokenType.RPAREN)) {
          do {
            args.push(this.parseExpr());
          } while (this.match(TokenType.COMMA));
        }
        this.expect(TokenType.RPAREN);
        expr = { kind: "Call", callee: expr, args } as CallExpr;
      } else if (this.check(TokenType.LBRACKET)) {
        this.advance();
        const index = this.parseExpr();
        this.expect(TokenType.RBRACKET);
        expr = { kind: "Index", object: expr, index } as IndexExpr;
      } else if (this.check(TokenType.DOT)) {
        this.advance();
        const property = this.expect(TokenType.IDENTIFIER).value;
        expr = { kind: "Member", object: expr, property } as MemberExpr;
      } else break;
    }
    return expr;
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    switch (t.type) {
      case TokenType.INT_LITERAL:
        this.advance();
        return { kind: "IntLiteral", value: parseInt(t.value, 10) };
      case TokenType.FLOAT_LITERAL:
        this.advance();
        return { kind: "FloatLiteral", value: parseFloat(t.value) };
      case TokenType.STRING_LITERAL:
        this.advance();
        return { kind: "StringLiteral", value: t.value };
      case TokenType.TRUE:
        this.advance();
        return { kind: "BoolLiteral", value: true };
      case TokenType.LBRACKET: {
        this.advance();
        const value = [];
        while (this.peek().type !== TokenType.RBRACKET) {
          value.push(this.parseExpr());

          if (this.peek().type === TokenType.COMMA) {
            this.advance();
          }
        }
        this.advance();
        return { kind: "ArrayLiteral", value };
      }
      case TokenType.LBRACE: {
        this.advance();
        const value: [string, Expr][] = [];
        while (this.peek().type !== TokenType.RBRACE) {
          const key = this.expect(TokenType.STRING_LITERAL).value;
          this.expect(TokenType.COLON);
          value.push([key, this.parseExpr()]);

          if (this.peek().type === TokenType.COMMA) {
            this.advance();
          }
        }
        this.advance();
        return { kind: "DictLiteral", value };
      }
      case TokenType.FALSE:
        this.advance();
        return { kind: "BoolLiteral", value: false };
      case TokenType.IDENTIFIER:
        this.advance();
        return { kind: "Identifier", name: t.value };
      case TokenType.THIS:
        this.advance();
        return { kind: "This" } as ThisExpr;
      case TokenType.LPAREN: {
        this.advance();
        const expr = this.parseExpr();
        this.expect(TokenType.RPAREN);
        return expr;
      }
      default:
        throw new ParseError("Unexpected token in expression", t);
    }
  }
}
