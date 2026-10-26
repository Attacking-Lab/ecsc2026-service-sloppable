import { Program, ClassDecl, FunctionDecl, Stmt, Expr } from "./ast";
import {
  ASTType,
  ArrayType,
  ClassType,
  Types,
  type_to_string,
  unify_types,
} from "./types";

import * as crypto from "crypto";

export type Result<T, E> =
  | { success: true; value: T }
  | { success: false; error: E };

const MODULE_BOILERPLATE = `
(type $dictentry (struct (field $key (mut i32)) (field $value (mut i32))))
(type $dict (array (mut (ref $dictentry))))
(type $intarray (array (mut i32)))
(type $floatarray (array (mut f64)))
(type $array (array (mut (ref any))))

(import "host" "atob" (func $_slopfn__atob (param $s i32) (result i32)))
(import "host" "btoa" (func $_slopfn__btoa (param $s i32) (result i32)))
(import "host" "capitalize" (func $_slopfn__capitalize (param $s i32)))
(import "host" "hex" (func $_slopfn__hex (param $s i32) (result i32)))
(import "host" "lowercase" (func $_slopfn__lowercase (param $s i32)))
(import "host" "read_artifact" (func $_slopfn__read_artifact (param $f i32) (result i32)))
(import "host" "reverse" (func $_slopfn__reverse (param $s i32)))
(import "host" "spc" (func $__builtin_spc (param $f i32) (param $namespace i32) (result i32)))
(import "host" "substring" (func $_slopfn__substring (param $s i32) (param $start i32) (param $length i32) (result i32)))
(import "host" "trim" (func $_slopfn__trim (param $s i32)))
(import "host" "unhex" (func $_slopfn__unhex (param $s i32) (result i32)))
(import "host" "uppercase" (func $_slopfn__uppercase (param $s i32)))

(memory $strings 1)
(export "strings" (memory $strings))
(data (i32.const 0) %INITIAL_MEMORY%)

(global $allocated (mut i32) (i32.const %COUNT%))
(export "allocated" (global $allocated))

(global $namespace i32 (i32.const %COUNT%))

(func $__builtin_malloc (param $len i32) (result i32)
      global.get $allocated
      global.get $allocated
      local.get $len
      i32.const 1
      i32.add
      i32.add
      global.set $allocated)

(func $__builtin_f64_rem (param $a f64) (param $b f64) (result f64)
      local.get $a
      local.get $a
      local.get $b
      f64.div
      f64.trunc
      local.get $b
      f64.mul
      f64.sub)

(func $__builtin_memcpy (param $dst i32) (param $src i32) (param $len i32)
      local.get $len
      i32.eqz
      (if (then return)
          (else
           (loop $loop
                 local.get $dst
                 local.get $src
                 i32.load8_u
                 i32.store8

                 local.get $dst
                 i32.const 1
                 i32.add
                 local.set $dst

                 local.get $src
                 i32.const 1
                 i32.add
                 local.set $src

                 local.get $len
                 i32.const 1
                 i32.sub
                 local.tee $len

                 i32.const 0
                 i32.ne
                 br_if $loop))))

(func $__builtin_strlen (param $arg i32) (result i32)
      (local $ptr i32)
      (local $output i32)
      i32.const 0
      local.set $output
      local.get $arg
      local.tee $ptr
      i32.load8_u
      i32.eqz
      (if (then)
          (else
           (loop $l
                 local.get $output
                 i32.const 1
                 i32.add
                 local.set $output

                 local.get $ptr
                 i32.const 1
                 i32.add
                 local.tee $ptr

                 i32.load8_u
                 i32.const 0
                 i32.ne
                 br_if $l)))
      local.get $output)

(func $__builtin_streq (param $l i32) (param $r i32) (result i32)
      (local $a i32)
      (loop $loop
            ;; if the current bytes differ the strings are not equal
            local.get $l
            i32.load8_u
            local.tee $a

            local.get $r
            i32.load8_u
            i32.ne
            (if (then
                 i32.const 0
                 return))

            ;; bytes are equal; if this byte is the terminator we are done
            local.get $a
            i32.eqz
            (if (then
                 i32.const 1
                 return))

            ;; advance both pointers and keep comparing
            local.get $l
            i32.const 1
            i32.add
            local.set $l

            local.get $r
            i32.const 1
            i32.add
            local.set $r

            br $loop)
      i32.const 0)

(func $__builtin_strconcat (param $l i32) (param $r i32) (result i32)
      (local $ll i32)
      (local $lr i32)
      (local $ptr i32)

      local.get $l
      call $__builtin_strlen
      local.tee $ll

      local.get $r
      call $__builtin_strlen
      local.tee $lr
      i32.add

      call $__builtin_malloc
      local.tee $ptr

      local.get $l
      local.get $ll
      call $__builtin_memcpy

      local.get $ptr
      local.get $ll
      i32.add
      local.get $r
      local.get $lr
      call $__builtin_memcpy

      local.get $ptr)

(func $__builtin_dict_get (param $d (ref $dict)) (param $s i32) (result i32)
      (local $len i32)
      (local $entry (ref $dictentry))
      local.get $d
      array.len
      local.tee $len
      i32.eqz
      (if (then) (else
                  (loop $loop
                        local.get $d
                        local.get $len
                        i32.const -1
                        i32.add
                        local.tee $len
                        array.get $dict
                        local.tee $entry
                        struct.get $dictentry $key
                        local.get $s
                        call $__builtin_streq
                        (if (then
                             local.get $entry
                             struct.get $dictentry $value
                             return))
                        local.get $len
                        i32.const 0
                        i32.ne
                        br_if $loop
                        )))
      i32.const 0
      )

(type $__DynamicDispatch (sub (struct (field $vtable i32))))
(type $_slopclass__Request (sub $__DynamicDispatch (struct (field $vtable i32) (field $arguments (mut (ref $dict))))))
(type $_slopclass__Response (sub $__DynamicDispatch (struct (field $vtable i32) (field $content (mut i32)) (field $headers (mut (ref $dict))))))

(func (export "entry") (param $argcount i32) (result i32 (ref array))
      (local $response (ref $_slopclass__Response))
      (local $params (ref $dict))
      (local $ptr i32)

      i32.const 0
      i32.const 0
      struct.new $dictentry
      local.get $argcount
      array.new $dict
      local.set $params
      local.get $argcount
      i32.eqz
      (if (then) (else
                  global.get $namespace
                  local.set $ptr
                  (loop $read_args
                        local.get $params

                        local.get $argcount
                        i32.const -1
                        i32.add
                        local.tee $argcount

                        local.get $ptr
                        local.get $ptr
                        call $__builtin_strlen
                        i32.add
                        i32.const 1
                        i32.add
                        local.tee $ptr

                        local.get $ptr
                        local.get $ptr
                        call $__builtin_strlen
                        i32.add
                        i32.const 1
                        i32.add
                        local.tee $ptr

                        struct.new $dictentry
                        array.set $dict
                        local.get $argcount
                        i32.const 0
                        i32.ne
                        br_if $read_args)))

      i32.const 0
      local.get $params
      struct.new $_slopclass__Request
      call $_slopfn__main
      local.tee $response
      struct.get $_slopclass__Response $content
      local.get $response
      struct.get $_slopclass__Response $headers
      )
`;

interface Variable {
  typ: ASTType;
  index: number;
}

class CompileContext {
  private scopes: Map<string, Variable>[] = [];
  private variableIndex: number = 0;
  returnType: ASTType;
  current_class: ClassType | undefined;

  constructor(c: ClassType | undefined, t: ASTType) {
    this.current_class = c;
    this.returnType = t;
  }

  open_scope() {
    this.scopes.push(new Map());
  }

  close_scope() {
    this.scopes.pop();
  }

  get_variable(name: string): Variable | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const t = this.scopes[i].get(name);
      if (t !== undefined) {
        return t;
      }
    }

    return undefined;
  }

  declare_variable(name: string, typ: ASTType): number {
    const index = this.variableIndex++;
    this.scopes[this.scopes.length - 1].set(name, { typ, index });

    return index;
  }

  allocate_scratch_register() {
    this.variableIndex++;
  }
}

interface Class {
  parent?: string;

  variables: [string, ASTType][];
  vtable_index: number;
  functions: [string, Function, string][];
}

interface Function {
  args: ASTType[];
  returnType: ASTType;
}

export class Compiler {
  // constant for empty string is always zero
  memory: string = "\\00";
  readonly coreNamespaceOffset: number;
  output: string = "";
  errors: string[] = [];

  classes: Record<string, Class> = {};
  functions: Record<string, Function> = {};

  vtable_index: number = 0;

  loop_labels: [string, string, string][] = [];

  constructor() {
    this.coreNamespaceOffset = this.add_string("core");
  }

  register_class(
    name: string,
    parent: string | undefined,
    variables: [string, ASTType][],
    functions: [string, Function, string][],
  ) {
    this.classes[name] = {
      variables,
      functions,
      parent,
      vtable_index: this.vtable_index,
    };
    this.vtable_index += functions.length;
  }

  get_class(name: string): Class | undefined {
    return this.classes[name];
  }

  register_function(name: string, args: ASTType[], returnType: ASTType) {
    this.functions[name] = { args, returnType };
  }

  get_function(name: string): Function | undefined {
    return this.functions[name];
  }

  error(msg: string) {
    this.errors.push(msg);
  }

  write(data: string) {
    this.output += data;
  }

  add_string(value: string): number {
    const bytes = Buffer.from(value, "utf-8");
    const hexStr: string = Array.from(bytes)
      .map((byte) => "\\" + byte.toString(16).padStart(2, "0"))
      .join("");
    const offset = this.memory.length / 3;
    this.memory += hexStr + "\\00";
    return offset;
  }

  build(): Result<string, string[]> {
    if (this.errors.length !== 0) {
      return { success: false, error: this.errors };
    }

    return {
      success: true,
      value:
        "(module\n" +
        MODULE_BOILERPLATE.replace(
          "%INITIAL_MEMORY%",
          '"' + this.memory + '"',
        ).replaceAll("%COUNT%", (this.memory.length / 3).toString()) +
        this.output +
        ")",
    };
  }

  start_function(name: string, params: string[], result: string | null) {
    this.write(`(func ${name}`);
    for (const param of params) {
      this.write(` (param ${param})`);
    }
    if (result !== null) {
      this.write(` (result ${result})\n`);
    }
  }

  end_function() {
    this.write("unreachable)\n");
  }

  enter_loop(separate_continue = false): [string, string, string] {
    const block_label = "$" + crypto.randomBytes(16).toString("hex");
    const loop_label = "$" + crypto.randomBytes(16).toString("hex");
    const continue_label = separate_continue
      ? "$" + crypto.randomBytes(16).toString("hex")
      : loop_label;
    this.loop_labels.push([block_label, loop_label, continue_label]);
    return [block_label, loop_label, continue_label];
  }

  finish_loop() {
    this.loop_labels.pop();
  }

  get_loop_continue_label() {
    return this.loop_labels[this.loop_labels.length - 1][2];
  }

  get_loop_block_label() {
    return this.loop_labels[this.loop_labels.length - 1][0];
  }

  mangle_function(name: string): string {
    return "$_slopfn__" + name;
  }

  mangle_class(name: string): string {
    return "$_slopclass__" + name;
  }

  mangle_class_function(classname: string, name: string): string {
    return "$_slopclass_" + classname.replaceAll("_", "__") + "_fn__" + name;
  }

  mangle_class_function_type(classname: string, name: string): string {
    return (
      "$_slopclass_" + classname.replaceAll("_", "__") + "_fn_typ__" + name
    );
  }
}

function is_type_assignable(
  compiler: Compiler,
  value: ASTType,
  to: ASTType,
): boolean {
  if (value.kind === "ArrayType" && to.kind === "ArrayType") {
    if (value.inner === undefined) {
      return true;
    }

    if (value.inner === to.inner) {
      return true;
    }

    if (to.inner === undefined) {
      // We cannot assign to an empty array
      // this case should not occur
      return false;
    }

    return is_type_assignable(compiler, value.inner, to.inner);
  }

  if (
    value.kind === "PrimitiveType" &&
    to.kind === "PrimitiveType" &&
    value.name === to.name
  ) {
    return true;
  }

  if (value.kind === "ClassType" && to.kind === "ClassType") {
    let c = value;
    while (c !== null) {
      if (c.name === to.name) {
        return true;
      }

      const t = compiler.get_class(value.name);
      if (!t || t.parent == undefined) {
        return false;
      }

      c = {
        kind: "ClassType",
        name: t.parent,
      };
    }

    return false;
  }

  return false;
}

function compile_expression(
  compiler: Compiler,
  ctx: CompileContext,
  expr: Expr,
  debug: boolean,
) {
  switch (expr.kind) {
    case "IntLiteral": {
      compiler.write(`i32.const ${expr.value}\n`);
      return;
    }
    case "FloatLiteral": {
      compiler.write(`f64.const ${expr.value}\n`);
      return;
    }
    case "BoolLiteral": {
      if (expr.value) {
        compiler.write(`i32.const 1\n`);
      } else {
        compiler.write(`i32.const 0\n`);
      }
      return;
    }
    case "StringLiteral":
      const offset = compiler.add_string(expr.value);
      if (debug) {
        compiler.write(`;; "${expr.value}"\n`);
      }
      compiler.write(`i32.const ${offset}\n`);
      return;
    case "ArrayLiteral":
      if (debug) {
        compiler.write(`;; [ <${expr.value.length} entries> ]\n`);
      }
      let t = undefined;
      if (expr.value.length > 0) {
        t = compute_expression_type(compiler, ctx, expr.value[0]);
      }
      for (let inner of expr.value) {
        compile_expression(compiler, ctx, inner, debug);
      }
      if (
        t !== undefined &&
        (is_type_assignable(compiler, t, Types.Int) ||
          is_type_assignable(compiler, t, Types.Bool) ||
          is_type_assignable(compiler, t, Types.String))
      ) {
        compiler.write(`array.new_fixed $intarray ${expr.value.length}\n`);
      } else if (
        t !== undefined &&
        is_type_assignable(compiler, t, Types.Float)
      ) {
        compiler.write(`array.new_fixed $floatarray ${expr.value.length}\n`);
      } else {
        compiler.write(`array.new_fixed $array ${expr.value.length}\n`);
      }
      return;
    case "DictLiteral":
      if (debug) {
        compiler.write(`;; { <${expr.value.length} entries> }\n`);
      }
      for (let [key, value] of expr.value) {
        compile_expression(
          compiler,
          ctx,
          { kind: "StringLiteral", value: key },
          debug,
        );
        compile_expression(compiler, ctx, value, debug);
        compiler.write(`struct.new $dictentry\n`);
      }
      compiler.write(`array.new_fixed $dict ${expr.value.length}\n`);
      return;
    case "Identifier":
      const v = ctx.get_variable(expr.name);
      if (v === undefined) {
        compiler.error(`Variable not found ${expr.name}`);
        return;
      }
      if (debug) {
        compiler.write(`;; ${expr.name}\n`);
      }

      compiler.write(`local.get ${v.index}\n`);
      return;
    case "Call":
      if (expr.callee.kind != "Identifier" && expr.callee.kind != "Member") {
        compiler.error(`Cannot call: ${expr.callee.kind}`);
        return;
      }

      if (debug) {
        if (expr.callee.kind == "Identifier") {
          compiler.write(
            `;; ${expr.callee.name}(<${expr.args.length}> arguments)\n`,
          );
        } else {
          compiler.write(
            `;; <object>.${expr.callee.property}(<${expr.args.length}> arguments)\n`,
          );
        }
      }

      if (expr.callee.kind == "Identifier") {
        const c = compiler.get_class(expr.callee.name);
        const class_args = c?.variables;
        const function_args = compiler.get_function(expr.callee.name)?.args;
        if (c) {
          if (debug) {
            compiler.write(";; <vtable>\n");
          }

          compiler.write(`i32.const ${c.vtable_index}\n`);
        }
        for (let arg of expr.args) {
          compile_expression(compiler, ctx, arg, debug);
        }
        if (c !== undefined) {
          compiler.write(
            `struct.new ${compiler.mangle_class(expr.callee.name)}\n`,
          );
          return;
        } else if (expr.callee.name === "spc_core") {
          compiler.write(`i32.const ${compiler.coreNamespaceOffset}\n`);
          compiler.write(`call $__builtin_spc\n`);
        } else if (expr.callee.name === "spc") {
          compiler.write(`global.get $namespace\n`);
          compiler.write(`call $__builtin_spc\n`);
        } else if (function_args !== undefined) {
          compiler.write(
            `call ${compiler.mangle_function(expr.callee.name)}\n`,
          );
        }

        return;
      } else {
        const typ = compute_expression_type(compiler, ctx, expr.callee.object)!;
        if (typ === undefined) {
          return;
        }
        if (typ.kind !== "ClassType") {
          compiler.error(
            `Cannot call ${expr.callee.property} on ${type_to_string(typ)}`,
          );
          return;
        }

        const c = compiler.get_class(typ.name);
        if (c === undefined) {
          return;
        }

        const prop = expr.callee.property;
        const index = c.functions.findIndex(([name, _a, _b]) => (name == prop));
        if (index === -1) {
          compiler.error(
            `Function ${expr.callee.property} is not defined on type ${type_to_string(typ)}`,
          );
          return;
        }

        compile_expression(compiler, ctx, expr.callee.object, debug);
        compiler.write(`local.tee $__dynamic_dispatch_scratch\n`);
        for (let arg of expr.args) {
          compile_expression(compiler, ctx, arg, debug);
        }

        compiler.write(`local.get $__dynamic_dispatch_scratch\n`);
        compiler.write(`struct.get $__DynamicDispatch 0\n`);
        compiler.write(`i32.const ${index}\n`);
        compiler.write(`i32.add\n`);
        compiler.write(
          `call_indirect 0 (type ${compiler.mangle_class_function_type(typ.name, expr.callee.property)})\n`,
        );

        return;
      }
      break;
    case "Binary": {
      if (debug) {
        compiler.write(`;; _ ${expr.op} _\n`);
      }

      compile_expression(compiler, ctx, expr.left, debug);
      compile_expression(compiler, ctx, expr.right, debug);

      const left_type = compute_expression_type(compiler, ctx, expr.left)!;
      const right_type = compute_expression_type(compiler, ctx, expr.right)!;

      if (expr.op === "+") {
        if (
          is_type_assignable(compiler, left_type, Types.Int) &&
          is_type_assignable(compiler, right_type, Types.Int)
        ) {
          compiler.write("i32.add\n");
          return;
        }
        if (
          is_type_assignable(compiler, left_type, Types.Float) &&
          is_type_assignable(compiler, right_type, Types.Float)
        ) {
          compiler.write("f64.add\n");
          return;
        }
        if (
          is_type_assignable(compiler, left_type, Types.String) &&
          is_type_assignable(compiler, right_type, Types.String)
        ) {
          compiler.write("call $__builtin_strconcat\n");
          return;
        }
      } else if (expr.op === "-") {
        if (
          is_type_assignable(compiler, left_type, Types.Int) &&
          is_type_assignable(compiler, right_type, Types.Int)
        ) {
          compiler.write("i32.sub\n");
          return;
        }
        if (
          is_type_assignable(compiler, left_type, Types.Float) &&
          is_type_assignable(compiler, right_type, Types.Float)
        ) {
          compiler.write("f64.sub\n");
          return;
        }
      } else if (expr.op === "*") {
        if (
          is_type_assignable(compiler, left_type, Types.Int) &&
          is_type_assignable(compiler, right_type, Types.Int)
        ) {
          compiler.write("i32.mul\n");
          return;
        }
        if (
          is_type_assignable(compiler, left_type, Types.Float) &&
          is_type_assignable(compiler, right_type, Types.Float)
        ) {
          compiler.write("f64.mul\n");
          return;
        }
      } else if (expr.op === "/") {
        if (
          is_type_assignable(compiler, left_type, Types.Int) &&
          is_type_assignable(compiler, right_type, Types.Int)
        ) {
          compiler.write("i32.div_s\n");
          return;
        }
        if (
          is_type_assignable(compiler, left_type, Types.Float) &&
          is_type_assignable(compiler, right_type, Types.Float)
        ) {
          compiler.write("f64.div\n");
          return;
        }
      } else if (expr.op === "%") {
        if (
          is_type_assignable(compiler, left_type, Types.Int) &&
          is_type_assignable(compiler, right_type, Types.Int)
        ) {
          compiler.write("i32.rem_s\n");
          return;
        }
        if (
          is_type_assignable(compiler, left_type, Types.Float) &&
          is_type_assignable(compiler, right_type, Types.Float)
        ) {
          compiler.write("call $__builtin_f64_rem\n");
          return;
        }
      } else if (expr.op === "&&") {
        if (
          is_type_assignable(compiler, left_type, Types.Bool) &&
          is_type_assignable(compiler, right_type, Types.Bool)
        ) {
          compiler.write("i32.and\n");
          return;
        }
      } else if (expr.op === "||") {
        if (
          is_type_assignable(compiler, left_type, Types.Bool) &&
          is_type_assignable(compiler, right_type, Types.Bool)
        ) {
          compiler.write("i32.or\n");
          return;
        }
      } else if (expr.op === "!=") {
        if (
          is_type_assignable(compiler, left_type, Types.Int) &&
          is_type_assignable(compiler, right_type, Types.Int)
        ) {
          compiler.write("i32.ne\n");
          return;
        }
        if (
          is_type_assignable(compiler, left_type, Types.Float) &&
          is_type_assignable(compiler, right_type, Types.Float)
        ) {
          compiler.write("f64.ne\n");
          return;
        }
        if (
          is_type_assignable(compiler, left_type, Types.String) &&
          is_type_assignable(compiler, right_type, Types.String)
        ) {
          compiler.write("call $__builtin_streq\n");
          compiler.write("i32.const 0\n");
          compiler.write("i32.eq\n");
          return;
        }
      } else if (expr.op === "==") {
        if (
          is_type_assignable(compiler, left_type, Types.Int) &&
          is_type_assignable(compiler, right_type, Types.Int)
        ) {
          compiler.write("i32.eq\n");
          return;
        }
        if (
          is_type_assignable(compiler, left_type, Types.Float) &&
          is_type_assignable(compiler, right_type, Types.Float)
        ) {
          compiler.write("f64.eq\n");
          return;
        }
        if (
          is_type_assignable(compiler, left_type, Types.String) &&
          is_type_assignable(compiler, right_type, Types.String)
        ) {
          compiler.write("call $__builtin_streq\n");
          return;
        }
      } else if (expr.op === "<") {
        if (
          is_type_assignable(compiler, left_type, Types.Int) &&
          is_type_assignable(compiler, right_type, Types.Int)
        ) {
          compiler.write("i32.lt_s\n");
          return;
        }
        if (
          is_type_assignable(compiler, left_type, Types.Float) &&
          is_type_assignable(compiler, right_type, Types.Float)
        ) {
          compiler.write("f64.lt\n");
          return;
        }
      } else if (expr.op === ">") {
        if (
          is_type_assignable(compiler, left_type, Types.Int) &&
          is_type_assignable(compiler, right_type, Types.Int)
        ) {
          compiler.write("i32.gt_s\n");
          return;
        }
        if (
          is_type_assignable(compiler, left_type, Types.Float) &&
          is_type_assignable(compiler, right_type, Types.Float)
        ) {
          compiler.write("f64.gt\n");
          return;
        }
      } else if (expr.op === "<=") {
        if (
          is_type_assignable(compiler, left_type, Types.Int) &&
          is_type_assignable(compiler, right_type, Types.Int)
        ) {
          compiler.write("i32.le_s\n");
          return;
        }
        if (
          is_type_assignable(compiler, left_type, Types.Float) &&
          is_type_assignable(compiler, right_type, Types.Float)
        ) {
          compiler.write("f64.le\n");
          return;
        }
      } else if (expr.op === ">=") {
        if (
          is_type_assignable(compiler, left_type, Types.Int) &&
          is_type_assignable(compiler, right_type, Types.Int)
        ) {
          compiler.write("i32.ge_s\n");
          return;
        }
        if (
          is_type_assignable(compiler, left_type, Types.Float) &&
          is_type_assignable(compiler, right_type, Types.Float)
        ) {
          compiler.write("f64.ge\n");
          return;
        }
      }

      return;
    }
    case "Unary": {
      if (debug) {
        compiler.write(`;; ${expr.op}_\n`);
      }

      compile_expression(compiler, ctx, expr.operand, debug);

      const t = compute_expression_type(compiler, ctx, expr.operand)!;
      if (!t) {
        return;
      }

      if (expr.op === "!") {
        if (is_type_assignable(compiler, t, Types.Bool)) {
          compiler.write("i32.eqz\n");
        }
      } else if (expr.op === "-") {
        if (is_type_assignable(compiler, t, Types.Int)) {
          compiler.write("i32.const -1\ni32.mul\n");
        } else if (is_type_assignable(compiler, t, Types.Float)) {
          compiler.write("f64.neg\n");
        }
      }

      return;
    }
    case "Index": {
      if (debug) {
        compiler.write(";; _[_]\n");
      }
      const t = compute_expression_type(compiler, ctx, expr.object)!;
      compile_expression(compiler, ctx, expr.object, debug);
      if (t.kind === "ArrayType") {
        let array_type = "$array";
        if (
          is_type_assignable(compiler, t.inner!, Types.Int) ||
          is_type_assignable(compiler, t.inner!, Types.Bool) ||
          is_type_assignable(compiler, t.inner!, Types.String)
        ) {
          array_type = "$intarray";
        } else if (is_type_assignable(compiler, t.inner!, Types.Float)) {
          array_type = "$floatarray";
        }

        compiler.write(`ref.cast (ref ${array_type})\n`);
        compile_expression(compiler, ctx, expr.index, debug);

        compiler.write(`array.get ${array_type}\n`);
        if (array_type === "$array") {
          const wasm_type = type_to_wasm(t.inner!);
          compiler.write(`ref.cast ${wasm_type}\n`);
        }
      } else {
        compile_expression(compiler, ctx, expr.index, debug);
        compiler.write(`call $__builtin_dict_get\n`);
      }
      return;
    }
    case "Member": {
      if (debug) {
        compiler.write(`;; _.${expr.property}\n`);
      }
      let t = compute_expression_type(compiler, ctx, expr.object)!;

      if (t.kind !== "ClassType") {
        return;
      }

      const c = compiler.get_class(t.name)!;

      const index = c.variables.findIndex(
        ([name, _]) => name === expr.property,
      );

      compile_expression(compiler, ctx, expr.object, debug);
      compiler.write(
        `struct.get ${compiler.mangle_class(t.name)} ${index + 1}\n`,
      );
      return;
    }
    case "This": {
      compiler.write("local.get 0\n");
      compiler.write(
        `ref.cast (ref ${compiler.mangle_class(ctx.current_class!.name)})\n`,
      );

      return;
    }
  }

  throw expr satisfies never;
}

function type_error(expected: ASTType, got: ASTType): string {
  return `Expected '${type_to_string(expected)}', got '${type_to_string(got)}'`;
}

function collect_variables(stmt: Stmt): ASTType[] {
  switch (stmt.kind) {
    case "Return":
      return [];
    case "VarDecl": {
      return [stmt.varType];
    }
    case "ExprStmt": {
      return [];
    }
    case "Assign": {
      return [];
    }
    case "Block": {
      let variables: ASTType[] = [];
      for (const inner of stmt.body) {
        variables = variables.concat(collect_variables(inner));
      }
      return variables;
    }
    case "If":
      if (stmt.alternate) {
        return collect_variables(stmt.consequent).concat(
          collect_variables(stmt.alternate),
        );
      } else {
        return collect_variables(stmt.consequent);
      }
    case "While":
      return collect_variables(stmt.body);
    case "For": {
      let variables: ASTType[] = [];
      if (stmt.init) {
        variables = variables.concat(collect_variables(stmt.init));
      }
      variables = variables.concat(collect_variables(stmt.body));
      return variables;
    }
    case "Break":
      return [];
    case "Continue":
      return [];
  }

  throw stmt satisfies never;
}

function check_function_call(
  compiler: Compiler,
  ctx: CompileContext,
  func_args: ASTType[],
  returnType: ASTType,
  args: Expr[],
): ASTType | undefined {
  if (func_args.length !== args.length) {
    compiler.error(
      `Expected ${func_args.length} arguments, but got ${args.length}`,
    );
    return undefined;
  }

  let success = true;
  args.forEach((arg, i) => {
    const t = compute_expression_type(compiler, ctx, arg);
    if (t === undefined) {
      success = false;
      return;
    }
    const expected = func_args[i];

    if (!is_type_assignable(compiler, t, expected)) {
      compiler.error(type_error(expected, t));
      success = false;
    }
  });

  if (!success) {
    return undefined;
  }
  return returnType;
}

function compute_expression_type(
  compiler: Compiler,
  ctx: CompileContext,
  expr: Expr,
): ASTType | undefined {
  switch (expr.kind) {
    case "IntLiteral":
      return Types.Int;
    case "FloatLiteral":
      return Types.Float;
    case "StringLiteral":
      return Types.String;
    case "BoolLiteral":
      return Types.Bool;
    case "ArrayLiteral":
      let inner = undefined;
      if (expr.value.length === 0) {
        return Types.EmptyArray;
      }
      const initial = compute_expression_type(compiler, ctx, expr.value[0]);
      if (initial === undefined) {
        return undefined;
      }

      let typ: ASTType = initial;
      for (let inner of expr.value) {
        const t = compute_expression_type(compiler, ctx, inner);
        if (t === undefined) {
          return undefined;
        }

        const unified = unify_types(typ, t);

        if (unified === undefined) {
          compiler.error(type_error(typ, t));
          return undefined;
        }

        typ = unified;
      }
      return Types.Array(typ);
    case "DictLiteral": {
      let success = true;
      for (let [key, value] of expr.value) {
        const typ = compute_expression_type(compiler, ctx, value);
        if (typ === undefined) {
          success = false;
          continue;
        }
        if (!is_type_assignable(compiler, typ, Types.String)) {
          compiler.error(type_error(typ, Types.String));
          success = true;
          continue;
        }
      }
      if (success) {
        return Types.Dict;
      }

      return undefined;
    }
    case "Identifier":
      const v = ctx.get_variable(expr.name);
      if (v === undefined) {
        compiler.error(`Undefined variable ${expr.name}`);
        return undefined;
      }
      return v.typ;
    case "Call":
      if (expr.callee.kind != "Identifier" && expr.callee.kind != "Member") {
        compiler.error(`Cannot call: ${expr.callee.kind}`);
        return undefined;
      }

      if (expr.callee.kind == "Identifier") {
        const class_args = compiler.get_class(expr.callee.name)?.variables;
        const func = compiler.get_function(expr.callee.name);
        if (class_args !== undefined) {
          const expected_args = class_args.map(([_, t]) => t);
          const returnType = Types.Class(expr.callee.name);
          return check_function_call(
            compiler,
            ctx,
            expected_args,
            returnType,
            expr.args,
          );
        } else if (func !== undefined) {
          return check_function_call(
            compiler,
            ctx,
            func.args,
            func.returnType,
            expr.args,
          );
        } else {
          compiler.error(`Unknown function: ${expr.callee.name}`);
          return undefined;
        }
      } else {
        const object_type = compute_expression_type(
          compiler,
          ctx,
          expr.callee.object,
        );
        if (object_type === undefined) {
          return undefined;
        }

        switch (object_type.kind) {
          case "ClassType":
            const class_type = compiler.get_class(object_type.name)!;
            const property = expr.callee.property;
            const func = class_type.functions.find(
              ([name, _a, _b]) => name === property,
            );
            if (func) {
              return check_function_call(
                compiler,
                ctx,
                func[1].args,
                func[1].returnType,
                expr.args,
              );
            }

            break;
        }
        compiler.error(
          `Type ${type_to_string(object_type)} does not define function ${expr.callee.property}`,
        );
        return undefined;
      }
      break;
    case "Binary": {
      const left = compute_expression_type(compiler, ctx, expr.left);
      const right = compute_expression_type(compiler, ctx, expr.right);

      if (!left || !right) {
        return undefined;
      }

      if (expr.op === "+") {
        if (
          is_type_assignable(compiler, left, Types.Int) &&
          is_type_assignable(compiler, right, Types.Int)
        ) {
          return Types.Int;
        }
        if (
          is_type_assignable(compiler, left, Types.Float) &&
          is_type_assignable(compiler, right, Types.Float)
        ) {
          return Types.Float;
        }
        if (
          is_type_assignable(compiler, left, Types.String) &&
          is_type_assignable(compiler, right, Types.String)
        ) {
          return Types.String;
        }
      } else if (expr.op === "-") {
        if (
          is_type_assignable(compiler, left, Types.Int) &&
          is_type_assignable(compiler, right, Types.Int)
        ) {
          return Types.Int;
        }
        if (
          is_type_assignable(compiler, left, Types.Float) &&
          is_type_assignable(compiler, right, Types.Float)
        ) {
          return Types.Float;
        }
      } else if (expr.op === "*") {
        if (
          is_type_assignable(compiler, left, Types.Int) &&
          is_type_assignable(compiler, right, Types.Int)
        ) {
          return Types.Int;
        }
        if (
          is_type_assignable(compiler, left, Types.Float) &&
          is_type_assignable(compiler, right, Types.Float)
        ) {
          return Types.Float;
        }
      } else if (expr.op === "/") {
        if (
          is_type_assignable(compiler, left, Types.Int) &&
          is_type_assignable(compiler, right, Types.Int)
        ) {
          return Types.Int;
        }
        if (
          is_type_assignable(compiler, left, Types.Float) &&
          is_type_assignable(compiler, right, Types.Float)
        ) {
          return Types.Float;
        }
      } else if (expr.op === "%") {
        if (
          is_type_assignable(compiler, left, Types.Int) &&
          is_type_assignable(compiler, right, Types.Int)
        ) {
          return Types.Int;
        }
        if (
          is_type_assignable(compiler, left, Types.Float) &&
          is_type_assignable(compiler, right, Types.Float)
        ) {
          return Types.Float;
        }
      } else if (expr.op === "&&") {
        if (
          is_type_assignable(compiler, left, Types.Bool) &&
          is_type_assignable(compiler, right, Types.Bool)
        ) {
          return Types.Bool;
        }
      } else if (expr.op === "||") {
        if (
          is_type_assignable(compiler, left, Types.Bool) &&
          is_type_assignable(compiler, right, Types.Bool)
        ) {
          return Types.Bool;
        }
      } else if (expr.op === "!=") {
        if (
          is_type_assignable(compiler, left, Types.Int) &&
          is_type_assignable(compiler, right, Types.Int)
        ) {
          return Types.Bool;
        }
        if (
          is_type_assignable(compiler, left, Types.Float) &&
          is_type_assignable(compiler, right, Types.Float)
        ) {
          return Types.Bool;
        }
        if (
          is_type_assignable(compiler, left, Types.String) &&
          is_type_assignable(compiler, right, Types.String)
        ) {
          return Types.Bool;
        }
      } else if (expr.op === "==") {
        if (
          is_type_assignable(compiler, left, Types.Int) &&
          is_type_assignable(compiler, right, Types.Int)
        ) {
          return Types.Bool;
        }
        if (
          is_type_assignable(compiler, left, Types.Float) &&
          is_type_assignable(compiler, right, Types.Float)
        ) {
          return Types.Bool;
        }
        if (
          is_type_assignable(compiler, left, Types.String) &&
          is_type_assignable(compiler, right, Types.String)
        ) {
          return Types.Bool;
        }
      } else if (expr.op === "<") {
        if (
          is_type_assignable(compiler, left, Types.Int) &&
          is_type_assignable(compiler, right, Types.Int)
        ) {
          return Types.Bool;
        }
        if (
          is_type_assignable(compiler, left, Types.Float) &&
          is_type_assignable(compiler, right, Types.Float)
        ) {
          return Types.Bool;
        }
      } else if (expr.op === ">") {
        if (
          is_type_assignable(compiler, left, Types.Int) &&
          is_type_assignable(compiler, right, Types.Int)
        ) {
          return Types.Bool;
        }
        if (
          is_type_assignable(compiler, left, Types.Float) &&
          is_type_assignable(compiler, right, Types.Float)
        ) {
          return Types.Bool;
        }
      } else if (expr.op === "<=") {
        if (
          is_type_assignable(compiler, left, Types.Int) &&
          is_type_assignable(compiler, right, Types.Int)
        ) {
          return Types.Bool;
        }
        if (
          is_type_assignable(compiler, left, Types.Float) &&
          is_type_assignable(compiler, right, Types.Float)
        ) {
          return Types.Bool;
        }
      } else if (expr.op === ">=") {
        if (
          is_type_assignable(compiler, left, Types.Int) &&
          is_type_assignable(compiler, right, Types.Int)
        ) {
          return Types.Bool;
        }
        if (
          is_type_assignable(compiler, left, Types.Float) &&
          is_type_assignable(compiler, right, Types.Float)
        ) {
          return Types.Bool;
        }
      }

      compiler.error(
        `Operator '${expr.op} is not defined for ${type_to_string(left)} and ${type_to_string(right)}`,
      );
      return undefined;
    }
    case "Unary": {
      const operand = compute_expression_type(compiler, ctx, expr.operand);

      if (!operand) {
        return undefined;
      }

      if (expr.op === "!") {
        if (is_type_assignable(compiler, operand, Types.Bool)) {
          return Types.Bool;
        }
      } else if (expr.op === "-") {
        if (is_type_assignable(compiler, operand, Types.Int)) {
          return Types.Int;
        } else if (is_type_assignable(compiler, operand, Types.Float)) {
          return Types.Float;
        }
      }

      compiler.error(
        `Operator '${expr.op} is not defined for ${type_to_string(operand)}`,
      );
      return undefined;
    }
    case "Index": {
      const obj = compute_expression_type(compiler, ctx, expr.object);
      const index = compute_expression_type(compiler, ctx, expr.index);

      if (!obj || !index) {
        return undefined;
      }

      if (obj.kind == "ArrayType") {
        if (obj.inner === undefined) {
          compiler.error(`Cannot index empty array`);
          return undefined;
        }

        if (!is_type_assignable(compiler, index, Types.Int)) {
          compiler.error(type_error(Types.Int, index));
          return undefined;
        }

        return obj.inner;
      } else if (is_type_assignable(compiler, obj, Types.Dict)) {
        if (!is_type_assignable(compiler, index, Types.String)) {
          compiler.error(type_error(Types.String, index));
          return undefined;
        }

        return Types.String;
      } else {
        compiler.error(`Cannot index type: ${type_to_string(obj)}`);
        return undefined;
      }
    }
    case "Member": {
      const object_type = compute_expression_type(compiler, ctx, expr.object);
      if (object_type === undefined) {
        return undefined;
      }

      switch (object_type.kind) {
        case "ClassType":
          const class_type = compiler.get_class(object_type.name);
          if (class_type) {
            const prop = class_type.variables.find(
              ([name, _]) => name === expr.property,
            );
            if (prop) {
              return prop[1];
            }
          }

          break;
      }
      compiler.error(
        `Type ${type_to_string(object_type)} does not define member ${expr.property}`,
      );
      return undefined;
    }
    case "This": {
      if (!ctx.current_class) {
        compiler.error(
          `Using 'this' outside of class definition is not allowed`,
        );
        return undefined;
      }

      return ctx.current_class;
    }
  }

  throw expr satisfies never;
}

function compile_statement(
  compiler: Compiler,
  stmt: Stmt,
  ctx: CompileContext,
  debug: boolean,
): boolean {
  switch (stmt.kind) {
    case "Return":
      if (stmt.value !== null) {
        const typ = compute_expression_type(compiler, ctx, stmt.value);
        if (typ !== undefined) {
          const expected = ctx.returnType;
          if (!is_type_assignable(compiler, typ, expected)) {
            compiler.error(type_error(expected, typ));
            return true;
          }

          compile_expression(compiler, ctx, stmt.value, debug);
        }
      } else if (!is_type_assignable(compiler, ctx.returnType, Types.Void)) {
        compiler.error("Missing return value inside non-void function");
        return true;
      }
      compiler.write("return\n");
      return true;
    case "VarDecl": {
      const typ = compute_expression_type(compiler, ctx, stmt.initializer);
      if (typ !== undefined) {
        const expected = stmt.varType;
        if (!is_type_assignable(compiler, typ, expected)) {
          compiler.error(type_error(expected, typ));
          return false;
        }

        const idx = ctx.declare_variable(stmt.name, stmt.varType);
        compile_expression(compiler, ctx, stmt.initializer, debug);

        compiler.write(`local.set ${idx}\n`);
      }
      return false;
    }
    case "ExprStmt": {
      const typ = compute_expression_type(compiler, ctx, stmt.expr);
      if (typ !== undefined) {
        compile_expression(compiler, ctx, stmt.expr, debug);

        if (!is_type_assignable(compiler, typ, Types.Void)) {
          compiler.write("drop\n");
        }
      }
      return false;
    }
    case "Assign": {
      const target = compute_expression_type(compiler, ctx, stmt.target);
      const value = compute_expression_type(compiler, ctx, stmt.value);

      if (!value || !target) {
        return false;
      }

      if (!is_type_assignable(compiler, value, target)) {
        compiler.error(type_error(target, value));
        return false;
      }

      if (stmt.target.kind === "Identifier") {
        const v = ctx.get_variable(stmt.target.name);
        if (v === undefined) {
          compiler.error(`Variable not found ${stmt.target.name}`);
          return false;
        }
        if (debug) {
          compiler.write(`;; ${stmt.target.name}\n`);
        }

        compile_expression(compiler, ctx, stmt.value, debug);
        compiler.write(`local.set ${v.index}\n`);
      } else if (stmt.target.kind === "Member") {
        let t = compute_expression_type(compiler, ctx, stmt.target.object)!;

        if (t.kind !== "ClassType") {
          return false;
        }

        const c = compiler.get_class(t.name)!;

        const prop = stmt.target.property;
        const index = c.variables.findIndex(([name, _]) => name === prop);

        compile_expression(compiler, ctx, stmt.target.object, debug);
        compile_expression(compiler, ctx, stmt.value, debug);
        compiler.write(
          `struct.set ${compiler.mangle_class(t.name)} ${index + 1}\n`,
        );
      } else if (stmt.target.kind === "Index") {
        const t = compute_expression_type(compiler, ctx, stmt.target.object)!;
        if (t.kind !== "ArrayType") {
          compiler.error("Cannot assign to dict");
          return false;
        }

        compile_expression(compiler, ctx, stmt.target.object, debug);

        let array_type = "$array";
        if (
          is_type_assignable(compiler, t.inner!, Types.Int) ||
          is_type_assignable(compiler, t.inner!, Types.Bool) ||
          is_type_assignable(compiler, t.inner!, Types.String)
        ) {
          array_type = "$intarray";
        } else if (is_type_assignable(compiler, t.inner!, Types.Float)) {
          array_type = "$floatarray";
        }
        compiler.write(`ref.cast (ref ${array_type})\n`);

        compile_expression(compiler, ctx, stmt.target.index, debug);
        compile_expression(compiler, ctx, stmt.value, debug);
        compiler.write(`array.set ${array_type}\n`);
      } else {
        compiler.error("Invalid assignment");
      }

      return false;
    }
    case "Block":
      ctx.open_scope();
      let innerReturn = false;
      for (const inner of stmt.body) {
        innerReturn =
          innerReturn || compile_statement(compiler, inner, ctx, debug);
      }
      ctx.close_scope();
      return innerReturn;
    case "If": {
      let t = compute_expression_type(compiler, ctx, stmt.condition);
      if (t !== undefined) {
        if (!is_type_assignable(compiler, t, Types.Bool)) {
          compiler.error("If-Condition is not boolean");
        }

        compile_expression(compiler, ctx, stmt.condition, debug);
      }
      compiler.write("(if (then\n");
      let doesReturn = compile_statement(compiler, stmt.consequent, ctx, debug);
      if (stmt.alternate) {
        compiler.write(")\n(else\n");
        const alt = compile_statement(compiler, stmt.alternate, ctx, debug);
        doesReturn = doesReturn && alt;
      } else {
        doesReturn = false;
      }
      compiler.write("))\n");
      return doesReturn;
    }
    case "While": {
      const [block_label, loop_label] = compiler.enter_loop();
      compiler.write(`(block ${block_label}\n`);
      compiler.write(`(loop ${loop_label}\n`);
      let t = compute_expression_type(compiler, ctx, stmt.condition);
      if (t !== undefined) {
        if (!is_type_assignable(compiler, t, Types.Bool)) {
          compiler.error("If-Condition is not boolean");
        }

        compile_expression(compiler, ctx, stmt.condition, debug);
        compiler.write("i32.eqz\n");
        compiler.write(`br_if ${block_label}\n`);
      }
      compile_statement(compiler, stmt.body, ctx, debug);
      compiler.write(`br ${loop_label}))\n`);
      compiler.finish_loop();
      return false;
    }
    case "For": {
      const [block_label, loop_label, continue_label] =
        compiler.enter_loop(true);
      compiler.write(`(block ${block_label}\n`);
      if (stmt.init) {
        compile_statement(compiler, stmt.init, ctx, debug);
      }
      compiler.write(`(loop ${loop_label}\n`);
      if (stmt.condition) {
        let t = compute_expression_type(compiler, ctx, stmt.condition);
        if (t !== undefined) {
          if (!is_type_assignable(compiler, t, Types.Bool)) {
            compiler.error("If-Condition is not boolean");
          }

          compile_expression(compiler, ctx, stmt.condition, debug);
          compiler.write("i32.eqz\n");
          compiler.write(`br_if ${block_label}\n`);
        }
      }
      // continue exits this block so that the update still runs
      compiler.write(`(block ${continue_label}\n`);
      compile_statement(compiler, stmt.body, ctx, debug);
      compiler.write(")\n");
      if (stmt.update) {
        compile_statement(compiler, stmt.update, ctx, debug);
      }

      compiler.write(`br ${loop_label}))\n`);
      compiler.finish_loop();
      return false;
    }
    case "Break":
      compiler.write(`br ${compiler.get_loop_block_label()}\n`);
      return false;
    case "Continue":
      compiler.write(`br ${compiler.get_loop_continue_label()}\n`);
      return false;
  }

  throw stmt satisfies never;
}

function type_to_wasm(t: ASTType): string | null {
  switch (t.kind) {
    case "PrimitiveType":
      switch (t.name) {
        case "int":
          return "i32";
        case "float":
          return "f64";
        case "bool":
          return "i32";
        case "void":
          return null;
        case "string":
          return "i32";
        case "dict":
          return "(ref $dict)";
      }
    case "ArrayType":
      return "(ref array)";
    case "ClassType":
      return `(ref $_slopclass__${t.name})`;
  }

  throw t satisfies never;
}

function toposort(decl: ClassDecl[]): ClassDecl[] {
  const visited = decl.map((_) => false);
  const output: ClassDecl[] = [];
  const lookup = new Map<string, number>();

  decl.forEach((c, i) => lookup.set(c.name, i));

  function visit(idx: number) {
    if (visited[idx]) {
      return;
    }
    visited[idx] = true;

    if (decl[idx].superClass) {
      const parent = lookup.get(decl[idx].superClass);
      if (parent) {
        visit(parent);
      }
    }

    output.push(decl[idx]);
  }

  visited.forEach((_, i) => visit(i));
  return output;
}

function declare_function(compiler: Compiler, decl: FunctionDecl) {
  let error = false;
  if (!isKnownType(compiler, decl.returnType)) {
    compiler.error(`Unknown type ${type_to_string(decl.returnType)}`);
    error = true;
  }

  decl.params.forEach((arg) => {
    if (!isKnownType(compiler, arg.paramType)) {
      compiler.error(`Unknown type ${type_to_string(arg.paramType)}`);
      error = true;
    }
  });

  if (compiler.get_function(decl.name) !== undefined) {
    compiler.error(`Function ${decl.name} already defined`);
    error = true;
  }

  if (error) {
    return;
  }

  compiler.register_function(
    decl.name,
    decl.params.map((arg) => arg.paramType),
    decl.returnType,
  );
}

function declare_class(compiler: Compiler, decl: ClassDecl) {
  const names = new Set<string>();

  const variables: [string, ASTType][] = [];
  const functions: [string, Function, string][] = [];

  let fields = "";
  if (decl.superClass !== null) {
    const parent = compiler.get_class(decl.superClass);
    if (parent === undefined) {
      compiler.error(`Unknown class: ${decl.superClass}`);
      return;
    }

    for (const [name, t] of parent.variables) {
      fields = `${fields} (field (mut ${type_to_wasm(t)}))`;
      variables.push([name, t]);
      names.add(name);
    }

    for (const [name, t, c] of parent.functions) {
      functions.push([name, t, c]);
      names.add(name);
    }
  }

  for (const member of decl.members) {
    if (member.kind === "FieldDecl") {
      if (names.has(member.name)) {
        compiler.error(`Class member ${member.name} already defined`);
        continue;
      }

      if (!isKnownType(compiler, member.fieldType)) {
        compiler.error(`Unknown type ${type_to_string(member.fieldType)}`);
        continue;
      }

      fields = `${fields} (field (mut ${type_to_wasm(member.fieldType)}))`;
      variables.push([member.name, member.fieldType]);
    } else {
      if (names.has(member.name)) {
        const index = functions.findIndex(([name, _]) => name == member.name);
        if (index == -1) {
          compiler.error(`Class member ${member.name} already defined`);
          continue;
        }

        const assignable =
          is_type_assignable(
            compiler,
            member.returnType,
            functions[index][1].returnType,
          ) &&
          functions[index][1].args.length == member.params.length &&
          functions[index][1].args.every((t, i) =>
            is_type_assignable(compiler, t, member.params[i].paramType),
          );
        if (!assignable) {
          compiler.error(`Cannot override ${member.name}, signature differs`);
          continue;
        } else {
          functions[index][2] = decl.name;
        }
      } else {
        const fn = {
          returnType: member.returnType,
          args: member.params.map((arg) => arg.paramType),
        };
        functions.push([member.name, fn, decl.name]);
      }
    }

    names.add(member.name);
  }

  if (decl.superClass) {
    compiler.write(
      `(type ${compiler.mangle_class(decl.name)} (sub ${compiler.mangle_class(decl.superClass)} (struct (field $vtable i32)${fields})))\n`,
    );
  } else {
    compiler.write(
      `(type ${compiler.mangle_class(decl.name)} (sub $__DynamicDispatch (struct (field $vtable i32)${fields})))\n`,
    );
  }

  compiler.register_class(
    decl.name,
    decl.superClass ?? undefined,
    variables,
    functions,
  );
  return;
}

function isKnownType(compiler: Compiler, t: ASTType): boolean {
  switch (t.kind) {
    case "PrimitiveType":
      return true;
    case "ArrayType":
      if (t.inner === undefined) {
        // empty array
        return true;
      }

      return isKnownType(compiler, t.inner);
    case "ClassType":
      return compiler.get_class(t.name) !== undefined;
  }

  throw t satisfies never;
}

function compile_function(
  compiler: Compiler,
  decl: FunctionDecl,
  debug: boolean,
) {
  let error = false;
  if (!isKnownType(compiler, decl.returnType)) {
    compiler.error(`Unknown type ${type_to_string(decl.returnType)}`);
    error = true;
  }

  decl.params.forEach((arg) => {
    if (!isKnownType(compiler, arg.paramType)) {
      compiler.error(`Unknown type ${type_to_string(arg.paramType)}`);
      error = true;
    }
  });

  if (error) {
    return;
  }

  compiler.start_function(
    compiler.mangle_function(decl.name),
    decl.params
      .map((arg) => type_to_wasm(arg.paramType))
      .filter((arg) => arg !== null),
    type_to_wasm(decl.returnType),
  );

  const context = new CompileContext(undefined, decl.returnType);
  context.open_scope();
  for (const arg of decl.params) {
    context.declare_variable(arg.name, arg.paramType);
  }

  // declare all variables used in the body
  compiler.write(
    `(local $__dynamic_dispatch_scratch (ref $__DynamicDispatch))\n`,
  );
  context.allocate_scratch_register();
  for (const stmt of decl.body.body) {
    const variables = collect_variables(stmt);
    for (const typ of variables) {
      compiler.write(`(local ${type_to_wasm(typ)})\n`);
    }
  }

  let returnFound = false;
  for (let stmt of decl.body.body) {
    returnFound =
      returnFound || compile_statement(compiler, stmt, context, debug);
  }

  if (
    !returnFound &&
    !is_type_assignable(compiler, decl.returnType, Types.Void)
  ) {
    compiler.error("Reached end of non-void function without return");
  }

  compiler.end_function();
}

function compile_class(compiler: Compiler, decl: ClassDecl, debug: boolean) {
  for (const member of decl.members) {
    if (member.kind !== "MethodDecl") {
      continue;
    }

    let error = false;
    if (!isKnownType(compiler, member.returnType)) {
      compiler.error(`Unknown type ${type_to_string(member.returnType)}`);
      error = true;
    }

    member.params.forEach((arg) => {
      if (!isKnownType(compiler, arg.paramType)) {
        compiler.error(`Unknown type ${type_to_string(arg.paramType)}`);
        error = true;
      }
    });

    if (error) {
      continue;
    }

    compiler.write(
      `(type ${compiler.mangle_class_function_type(decl.name, member.name)} (func (param (ref any))`,
    );
    for (const param of member.params) {
      compiler.write(` (param ${type_to_wasm(param.paramType)})`);
    }
    if (member.returnType !== null) {
      compiler.write(` (result ${type_to_wasm(member.returnType)})`);
    }
    compiler.write("))\n");

    compiler.start_function(
      compiler.mangle_class_function(decl.name, member.name),
      [
        `(ref any)`,
        ...member.params
          .map((arg) => type_to_wasm(arg.paramType))
          .filter((arg) => arg !== null),
      ],
      type_to_wasm(member.returnType),
    );

    const context = new CompileContext(undefined, member.returnType);
    context.current_class = Types.Class(decl.name);
    context.open_scope();
    context.allocate_scratch_register(); // "this"

    for (const arg of member.params) {
      context.declare_variable(arg.name, arg.paramType);
    }

    // declare all variables used in the body
    compiler.write(
      `(local $__dynamic_dispatch_scratch (ref $__DynamicDispatch))\n`,
    );
    context.allocate_scratch_register();
    for (const stmt of member.body.body) {
      const variables = collect_variables(stmt);
      for (const typ of variables) {
        compiler.write(`(local ${type_to_wasm(typ)})\n`);
      }
    }

    let returnFound = false;
    for (let stmt of member.body.body) {
      returnFound =
        returnFound || compile_statement(compiler, stmt, context, debug);
    }

    if (
      !returnFound &&
      !is_type_assignable(compiler, member.returnType, Types.Void)
    ) {
      compiler.error("Reached end of non-void function without return");
    }

    compiler.end_function();
  }
}

function build_vtables(compiler: Compiler, debug: boolean) {
  const count = compiler.vtable_index;

  compiler.write(`(table ${count} funcref)\n`);

  for (const [name, c] of Object.entries(compiler.classes)) {
    if (debug) {
      compiler.write(`;; ${name} \n`);
    }

    compiler.write(`(elem (i32.const ${c.vtable_index})`);

    c.functions.forEach(([name, _, cname]) => {
      compiler.write(" " + compiler.mangle_class_function(cname, name));
    });
    compiler.write(")\n");
  }
}

export function compile(
  program: Program,
  debug: boolean,
): Result<string, string[]> {
  const compiler = new Compiler();

  compiler.register_class(
    "Request",
    undefined,
    [["parameters", Types.Dict]],
    [],
  );
  compiler.register_class(
    "Response",
    undefined,
    [
      ["content", Types.String],
      ["headers", Types.Dict],
    ],
    [],
  );

  compiler.register_function("atob", [Types.String], Types.String);
  compiler.register_function("btoa", [Types.String], Types.String);
  compiler.register_function("capitalize", [Types.String], Types.Void);
  compiler.register_function("hex", [Types.String], Types.String);
  compiler.register_function("lowercase", [Types.String], Types.Void);
  compiler.register_function("read_artifact", [Types.String], Types.String);
  compiler.register_function("reverse", [Types.String], Types.Void);
  compiler.register_function("spc", [Types.String], Types.String);
  compiler.register_function("spc_core", [Types.String], Types.String);
  compiler.register_function(
    "substring",
    [Types.String, Types.Int, Types.Int],
    Types.String,
  );
  compiler.register_function("trim", [Types.String], Types.Void);
  compiler.register_function("unhex", [Types.String], Types.String);
  compiler.register_function("uppercase", [Types.String], Types.Void);

  const functions: FunctionDecl[] = [];
  const classes: ClassDecl[] = [];
  for (let decl of program.declarations) {
    switch (decl.kind) {
      case "FunctionDecl":
        functions.push(decl);
        continue;
      case "ClassDecl":
        classes.push(decl);
        continue;
    }
    throw decl satisfies never;
  }

  toposort(classes).forEach((decl) => declare_class(compiler, decl));
  functions.forEach((decl) => declare_function(compiler, decl));

  const main = compiler.get_function("main");
  if (main === undefined) {
    compiler.error("Function 'main' not found");
  } else {
    let valid = is_type_assignable(
      compiler,
      main.returnType,
      Types.Class("Response"),
    );
    if (main.args.length != 1) {
      valid = false;
    } else if (main.args[0].kind != "ClassType") {
      valid = false;
    } else if (main.args[0].name != "Request") {
      valid = false;
    }

    if (!valid) {
      compiler.error(
        `Function 'main', must have signature 'Response main(Request)'`,
      );
    }
  }

  classes.forEach((decl) => compile_class(compiler, decl, debug));
  functions.forEach((decl) => compile_function(compiler, decl, debug));

  build_vtables(compiler, debug);

  return compiler.build();
}
