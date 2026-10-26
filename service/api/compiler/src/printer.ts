import { Expr, Stmt, TopLevelDecl, Program, ClassMember } from "./ast";
import { ASTType, type_to_string } from "./types";

// ─── AST Printer ─────────────────────────────────────────────────────────────

class Printer {
  private lines: string[] = [];
  private depth = 0;

  private push(label: string, ...fields: string[]): void {
    const indent = "  ".repeat(this.depth);
    const tail = fields.length ? ` ${fields.join(" ")}` : "";
    this.lines.push(`${indent}${label}${tail}`);
  }

  private indent<T>(fn: () => T): T {
    this.depth++;
    const r = fn();
    this.depth--;
    return r;
  }

  printProgram(prog: Program): string {
    this.push("Program");
    this.indent(() => {
      for (const decl of prog.declarations) this.printTopLevel(decl);
    });
    return this.lines.join("\n");
  }

  private printTopLevel(decl: TopLevelDecl): void {
    if (decl.kind === "FunctionDecl") {
      const params = decl.params
        .map((p) => `${type_to_string(p.paramType)} ${p.name}`)
        .join(", ");
      this.push(
        `FunctionDecl`,
        `${type_to_string(decl.returnType)} ${decl.name}(${params})`,
      );
      this.indent(() => this.printStmt(decl.body));
    } else {
      // ClassDecl
      const ext = decl.superClass ? ` extends ${decl.superClass}` : "";
      this.push(`ClassDecl`, `${decl.name}${ext}`);
      this.indent(() => decl.members.forEach((m) => this.printClassMember(m)));
    }
  }

  private printClassMember(m: ClassMember): void {
    if (m.kind === "MethodDecl") {
      const params = m.params
        .map((p) => `${type_to_string(p.paramType)} ${p.name}`)
        .join(", ");
      this.push(
        `MethodDecl`,
        `${type_to_string(m.returnType)} ${m.name}(${params})`,
      );
      this.indent(() => this.printStmt(m.body));
    } else {
      // FieldDecl
      this.push(`FieldDecl`, `${type_to_string(m.fieldType)} ${m.name}`);
    }
  }

  private printStmt(stmt: Stmt): void {
    switch (stmt.kind) {
      case "Block":
        this.push("Block");
        this.indent(() => {
          for (const s of stmt.body) this.printStmt(s);
        });
        break;
      case "VarDecl":
        this.push("VarDecl", `${type_to_string(stmt.varType)} ${stmt.name}`);
        if (stmt.initializer)
          this.indent(() => this.printExpr(stmt.initializer!));
        break;
      case "ExprStmt":
        this.push("ExprStmt");
        this.indent(() => this.printExpr(stmt.expr));
        break;
      case "Assign":
        this.push(`Assign`);
        this.indent(() => {
          this.printExpr(stmt.target);
          this.printExpr(stmt.value);
        });
        break;
      case "If":
        this.push("If");
        this.indent(() => {
          this.push("condition:");
          this.indent(() => this.printExpr(stmt.condition));
          this.push("then:");
          this.indent(() => this.printStmt(stmt.consequent));
          if (stmt.alternate) {
            this.push("else:");
            this.indent(() => this.printStmt(stmt.alternate!));
          }
        });
        break;
      case "While":
        this.push("While");
        this.indent(() => {
          this.push("condition:");
          this.indent(() => this.printExpr(stmt.condition));
          this.push("body:");
          this.indent(() => this.printStmt(stmt.body));
        });
        break;
      case "For":
        this.push("For");
        this.indent(() => {
          if (stmt.init) {
            this.push("init:");
            this.indent(() => this.printStmt(stmt.init!));
          }
          if (stmt.condition) {
            this.push("cond:");
            this.indent(() => this.printExpr(stmt.condition!));
          }
          if (stmt.update) {
            this.push("update:");
            this.indent(() => this.printStmt(stmt.update!));
          }
          this.push("body:");
          this.indent(() => this.printStmt(stmt.body));
        });
        break;
      case "Return":
        this.push("Return");
        if (stmt.value) this.indent(() => this.printExpr(stmt.value!));
        break;
      case "Break":
        this.push("Break");
        break;
      case "Continue":
        this.push("Continue");
        break;
    }
  }

  private printExpr(expr: Expr): void {
    switch (expr.kind) {
      case "IntLiteral":
        this.push(`IntLit(${expr.value})`);
        break;
      case "FloatLiteral":
        this.push(`FloatLit(${expr.value})`);
        break;
      case "StringLiteral":
        this.push(`StrLit("${expr.value}")`);
        break;
      case "BoolLiteral":
        this.push(`BoolLit(${expr.value})`);
        break;
      case "ArrayLiteral":
        this.push(`Array`);
        this.indent(() => expr.value.forEach((a) => this.printExpr(a)));
        break;
      case "DictLiteral":
        this.push(`Dict`);
        this.indent(() =>
          expr.value.forEach((arg) => {
            const [k, v] = arg;
            this.push(k);
            this.indent(() => this.printExpr(v));
          }),
        );
        break;
      case "Identifier":
        this.push(`Ident(${expr.name})`);
        break;
      case "This":
        this.push(`This`);
        break;
      case "Binary":
        this.push(`Binary(${expr.op})`);
        this.indent(() => {
          this.printExpr(expr.left);
          this.printExpr(expr.right);
        });
        break;
      case "Unary":
        this.push(`Unary(${expr.op})`);
        this.indent(() => this.printExpr(expr.operand));
        break;
      case "Call":
        this.push(`Call`);
        this.indent(() => {
          this.push("callee:");
          this.indent(() => this.printExpr(expr.callee));
          if (expr.args.length) {
            this.push("args:");
            this.indent(() => expr.args.forEach((a) => this.printExpr(a)));
          }
        });
        break;
      case "Index":
        this.push(`Index`);
        this.indent(() => {
          this.printExpr(expr.object);
          this.push("at:");
          this.indent(() => this.printExpr(expr.index));
        });
        break;
      case "Member":
        this.push(`Member(.${expr.property})`);
        this.indent(() => this.printExpr(expr.object));
        break;
    }
  }
}

export function printAST(prog: Program): string {
  return new Printer().printProgram(prog);
}
