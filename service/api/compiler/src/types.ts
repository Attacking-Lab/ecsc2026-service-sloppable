// ─── AST Node Types ──────────────────────────────────────────────────────────

export type Primitive = "int" | "float" | "bool" | "void" | "string" | "dict";

export interface PrimitiveType {
  kind: "PrimitiveType";
  name: Primitive;
}

export interface ArrayType {
  kind: "ArrayType";
  inner: ASTType | undefined;
}

// A user-defined class name used as a type (e.g. `Animal x`)
export interface ClassType {
  kind: "ClassType";
  name: string;
}

export type ASTType = PrimitiveType | ArrayType | ClassType;

export class Types {
  static readonly Int: PrimitiveType = { kind: "PrimitiveType", name: "int" };
  static readonly Float: PrimitiveType = {
    kind: "PrimitiveType",
    name: "float",
  };
  static readonly Bool: PrimitiveType = { kind: "PrimitiveType", name: "bool" };
  static readonly Void: PrimitiveType = { kind: "PrimitiveType", name: "void" };
  static readonly String: PrimitiveType = {
    kind: "PrimitiveType",
    name: "string",
  };
  static readonly Dict: PrimitiveType = { kind: "PrimitiveType", name: "dict" };

  static readonly EmptyArray: ArrayType = {
    kind: "ArrayType",
    inner: undefined,
  };
  static readonly Array = (inner: ASTType): ArrayType => ({
    kind: "ArrayType",
    inner,
  });
  static readonly Class = (name: string): ClassType => ({
    kind: "ClassType",
    name,
  });
}

export function unify_types(
  left: ASTType,
  right: ASTType,
): ASTType | undefined {
  if (left.kind === "ArrayType" && right.kind === "ArrayType") {
    if (left.inner === undefined) {
      return right;
    }

    if (right.inner === undefined) {
      return left;
    }

    const inner = unify_types(left.inner, right.inner);

    if (inner === undefined) {
      return undefined;
    }

    return Types.Array(inner);
  }

  if (
    left.kind === "PrimitiveType" &&
    right.kind === "PrimitiveType" &&
    left.name === right.name
  ) {
    return left;
  }

  if (
    left.kind === "ClassType" &&
    right.kind === "ClassType" &&
    left.name === right.name
  ) {
    return left;
  }

  return undefined;
}

export function type_to_string(t: ASTType): string {
  switch (t.kind) {
    case "PrimitiveType":
      return t.name;
    case "ArrayType":
      if (t.inner === undefined) {
        return "<unknown>[]";
      }
      return type_to_string(t.inner) + "[]";
    case "ClassType":
      return t.name;
  }

  throw t satisfies never;
}
