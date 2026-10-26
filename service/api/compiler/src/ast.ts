import { ASTType } from "./types";

// ── Expressions ──────────────────────────────────────────────────────────────

export interface IntLiteralExpr {
  kind: "IntLiteral";
  value: number;
}
export interface FloatLiteralExpr {
  kind: "FloatLiteral";
  value: number;
}
export interface StringLiteralExpr {
  kind: "StringLiteral";
  value: string;
}
export interface BoolLiteralExpr {
  kind: "BoolLiteral";
  value: boolean;
}
export interface ArrayLiteralExpr {
  kind: "ArrayLiteral";
  value: Expr[];
}
export interface DictLiteralExpr {
  kind: "DictLiteral";
  value: [string, Expr][];
}
export interface IdentifierExpr {
  kind: "Identifier";
  name: string;
}

export interface BinaryExpr {
  kind: "Binary";
  op: string;
  left: Expr;
  right: Expr;
}

export interface UnaryExpr {
  kind: "Unary";
  op: string;
  operand: Expr;
}

export interface CallExpr {
  kind: "Call";
  callee: Expr;
  args: Expr[];
}

export interface IndexExpr {
  kind: "Index";
  object: Expr;
  index: Expr;
}

export interface MemberExpr {
  kind: "Member";
  object: Expr;
  property: string;
}

export interface ThisExpr {
  kind: "This";
}

export type Expr =
  | IntLiteralExpr
  | FloatLiteralExpr
  | StringLiteralExpr
  | BoolLiteralExpr
  | ArrayLiteralExpr
  | DictLiteralExpr
  | IdentifierExpr
  | BinaryExpr
  | UnaryExpr
  | CallExpr
  | IndexExpr
  | MemberExpr
  | ThisExpr;

// ── Statements ───────────────────────────────────────────────────────────────

export interface VarDeclStmt {
  kind: "VarDecl";
  varType: ASTType;
  name: string;
  initializer: Expr;
}

export interface ExprStmt {
  kind: "ExprStmt";
  expr: Expr;
}

export interface AssignStmt {
  kind: "Assign";
  target: Expr;
  value: Expr;
}

export interface BlockStmt {
  kind: "Block";
  body: Stmt[];
}

export interface IfStmt {
  kind: "If";
  condition: Expr;
  consequent: Stmt;
  alternate: Stmt | null;
}

export interface WhileStmt {
  kind: "While";
  condition: Expr;
  body: Stmt;
}

export interface ForStmt {
  kind: "For";
  init: Stmt | null;
  condition: Expr | null;
  update: Stmt | null;
  body: Stmt;
}

export interface ReturnStmt {
  kind: "Return";
  value: Expr | null;
}

export interface BreakStmt {
  kind: "Break";
}
export interface ContinueStmt {
  kind: "Continue";
}

export type Stmt =
  | VarDeclStmt
  | ExprStmt
  | AssignStmt
  | BlockStmt
  | IfStmt
  | WhileStmt
  | ForStmt
  | ReturnStmt
  | BreakStmt
  | ContinueStmt;

// ── Top-level Declarations ───────────────────────────────────────────────────

export interface ParamDecl {
  paramType: ASTType;
  name: string;
}

export interface FunctionDecl {
  kind: "FunctionDecl";
  returnType: ASTType;
  name: string;
  params: ParamDecl[];
  body: BlockStmt;
}

// ── Class Declarations ────────────────────────────────────────────────────────

export interface FieldDecl {
  kind: "FieldDecl";
  fieldType: ASTType;
  name: string;
}

export interface MethodDecl {
  kind: "MethodDecl";
  returnType: ASTType;
  name: string;
  params: ParamDecl[];
  body: BlockStmt;
}

export type ClassMember = FieldDecl | MethodDecl;

export interface ClassDecl {
  kind: "ClassDecl";
  name: string;
  superClass: string | null;
  members: ClassMember[];
}

export type TopLevelDecl = FunctionDecl | ClassDecl;

export interface Program {
  kind: "Program";
  declarations: TopLevelDecl[];
}
