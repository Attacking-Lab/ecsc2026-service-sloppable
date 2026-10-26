from __future__ import annotations

import random
import string
import base64

from typing import List, Dict, Iterable, Callable, Any, cast


class Slopfile:
    content: str
    output: str

    def __init__(self, content, output):
        self.content = content
        self.output = output


class Workspace:
    files: Dict[str, str]
    lambdas: Dict[str, Slopfile]

    def __init__(self):
        self.files = {}
        self.lambdas = {}


class Artifact(Workspace):
    id: str

    def __init__(self, id: str):
        self.id = id


T = str


class Function:
    args: List[T]
    ret: T


class Class:
    members: List[tuple[str, T]]
    functions: Dict[str, Function]

    def __init__(self):
        self.members = []
        self.functions = {}


class Scope:
    variables: Dict[str, tuple[T, Value | None]]
    def __init__(self):
        self.variables = {}


class ScopeManager:
    def __init__(self, context):
        self.context = context

    def __enter__(self):
        self.context.scopes.append(Scope())

    def __exit__(self, exc_type, exc_value, traceback):
        self.context.scopes.pop()


class Context:
    scopes: List[Scope]
    functions: Dict[str, Function]
    classes: Dict[str, Class]
    workspace: Workspace
    artifacts: List[Artifact]

    def __init__(self, workspace: Workspace, artifacts: List[Artifact]):
        self.scopes = []
        self.functions = {}
        self.classes = {}
        self.workspace = workspace
        self.artifacts = artifacts

    def new_scope(self) -> ScopeManager:
        return ScopeManager(self)

    def define(self, name: str, t: T, val: Value | None = None):
        if name in self.scopes[-1].variables:
            raise 1337
        self.scopes[-1].variables[name] = (t, val)

    def variables(self) -> Iterable[tuple[str, T, Value | None]]:
        seen: set = set()
        for scope in self.scopes[::-1]:
            for name, (t, v) in scope.variables.items():
                if name in seen:
                    continue
                seen.add(name)
                yield (name, t, v)

class Value:
    typ: T

    # Prevent accidental formatting
    def __repr__(self):
        raise 42

    @staticmethod
    def string(s: str) -> Value:
        v = PrimitiveValue()
        v.typ = "string"
        v.payload = s
        return v

    @staticmethod
    def true() -> Value:
        v = PrimitiveValue()
        v.typ = "bool"
        v.payload = True
        return v

    @staticmethod
    def false() -> Value:
        v = PrimitiveValue()
        v.typ = "bool"
        v.payload = False
        return v

    @staticmethod
    def int(i: int) -> Value:
        v = PrimitiveValue()
        v.typ = "int"
        v.payload = i
        return v

    @staticmethod
    def float(f: float) -> Value:
        v = PrimitiveValue()
        v.typ = "float"
        v.payload = f
        return v

    @staticmethod
    def dict(d: dict) -> Value:
        v = PrimitiveValue()
        v.typ = "dict"
        v.payload = d
        return v

    @staticmethod
    def clazz(name: str, properties: Dict[str, Value]) -> Value:
        v = ClassValue()
        v.typ = name
        v.properties = properties
        return v


class PrimitiveValue(Value):
    payload: Any


class ClassValue(Value):
    properties: Dict[str, Value] = {}


class ArrayValue(Value):
    inner: T
    indices: List[Value] = []


def random_variable() -> str:
    n = random.randint(8, 16)
    return ''.join(random.choice(string.ascii_letters) for _ in range(n))


def indent(s: str, n: int) -> str:
    return ' ' * n + s.replace("\n", f"\n{' ' * n}")


def escape_string(s: str) -> str:
    return s.replace("\\", "\\\\") \
            .replace('"', '\\"') \
            .replace("\n", "\\n") \
            .replace("\t", "\\t") \
            .replace("\r", "\\r")


string_alphabet = [x for x in string.printable if x not in ('\f', '\v')] + list("äöüáóúàòùçÄÖÜÁÓÚÀÒÙÇ")
def random_string_literal(context: Context, alphabet=string_alphabet) -> tuple[str, Value]:
    n = random.randint(4, 16)
    output = ''.join(random.choice(alphabet) for _ 
in range(n))
    content = f'"{escape_string(output)}"'

    return content, Value.string(output)


def random_string(context: Context) -> tuple[str, Value]:
    if random.randint(1, 4) == 1:
        n = random.randint(1, 3)
        inner = [random_string_literal(context) for _ in range(n)]
        output = ''.join(cast(str, cast(PrimitiveValue, val).payload) for _, val in inner)
        return '+'.join(i[0] for i in inner), Value.string(output)
    else:
        return random_string_literal(context)

    return "", Value.string("")


def construct_type(context: Context, t: T) -> tuple[str, Value]:
    match t:
        case "string":
            return random_string(context)
        case "int":
            i = random.randint(-2**10, 2**10)
            return f"{i}", Value.int(i)
        case "float":
            f = random.randint(-2**10, 2**10) / 1000
            return f"{f}", Value.float(f)
        case "dict":
            val = {
                random_string_literal(context, string.ascii_letters): random_string_literal(context, string.ascii_letters)
                for _ in range(random.randint(0, 3))
            }
            return f"{{{','.join(f'{a}:{b}' for (a, _), (b, _) in val.items())}}}", Value.dict({
                cast(str, cast(PrimitiveValue, a).payload): cast(str, cast(PrimitiveValue, b).payload)
                for (_, a), (_, b) in val.items()
            })
        case "bool":
            return random.choice([("true", Value.true()), ("false", Value.false())])
        case name:
            # unknown type names are classes
            members = context.classes[name].members
            args = [
                random_expr(context, t)
                for _, t in members
            ]
            return f"{name}({','.join([content for content, _ in args])})", Value.clazz(name, {
                member: val for (content, val), (member, _) in zip(args, members)
            })


def random_expr(context: Context, t: T, depth: int = 3) -> tuple[str, Value]:
    if random.choice([True, False]) and depth > 0:
        if random.choice([True, False]):
            vals = [(name, v) for name, vart, v in context.variables() if vart == t and v]
            if len(vals) > 0:
                return random.choice(vals)
        # TODO: allow function calling
        # Maybe need to implement symbolic values
        # if random.choice([True, False]):
        #     vals = [(name, <value>) for name, f in context.functions.items() if f.ret == t]
        #     if len(vals) > 0:
        #         return random.choice(vals)

        match t:
            case "int" | "float":
                a, aout = random_expr(context, t, depth - 1)
                b, bout = random_expr(context, t, depth - 1)
                ainner = cast(PrimitiveValue, aout).payload
                binner = cast(PrimitiveValue, bout).payload
                if isinstance(binner, float) and abs(binner) > 0.1:
                    op = random.choice("+*/-")
                else:
                    op = random.choice("+*-")

                out = PrimitiveValue()
                out.typ = t
                out.payload = eval(f"({ainner}) {op} ({binner})")
                return f"({a}) {op} ({b})", out
            case "bool":
                match random.randint(1, 3):
                    case 1:
                        a, aout = random_expr(context, t, depth - 1)
                        b, bout = random_expr(context, t, depth - 1)
                        ainner = cast(PrimitiveValue, aout).payload
                        binner = cast(PrimitiveValue, bout).payload
                        op = random.choice(["&&", "||"])
                        if op == "&&":
                            py_op = "and"
                        else:
                            py_op = "or"
                    case 2:
                        inner, innerout = random_expr(context, t, depth - 1)
                        out = PrimitiveValue()
                        out.typ = "bool"
                        out.payload = not cast(PrimitiveValue, innerout).payload
                        return f"!({inner})", out
                    case 3:
                        t_inner = random.choice(["string", "int", "float"])
                        a, aout = random_expr(context, t_inner, depth - 1)
                        b, bout = random_expr(context, t_inner, depth - 1)
                        ainner = cast(PrimitiveValue, aout).payload
                        binner = cast(PrimitiveValue, bout).payload
                        if t_inner == "string":
                            ainner = f'"{escape_string(cast(str, ainner))}"'
                            binner = f'"{escape_string(cast(str, binner))}"'

                        op = random.choice(["==", "!="])
                        py_op = op

                out = PrimitiveValue()
                out.typ = t
                out.payload = eval(f"({ainner}) {py_op} ({binner})")
                return f"({a}) {op} ({b})", out
            case "string" if random.randint(1, 8) == 1:
                inner, val = construct_type(context, "dict")
                d = cast(dict, cast(PrimitiveValue, val).payload)
                if len(d) > 0:
                    k, v = cast(tuple[str, str], random.choice(list(d.items())))
                    return f'{inner}["{escape_string(k)}"]', Value.string(v)
            case "string" if random.randint(1, 4) == 1:
                if random.choice([True, False]) and len(context.workspace.lambdas) > 0:
                    target, f = random.choice(list(context.workspace.lambdas.items()))
                    return f'spc("{escape_string(target)}")', Value.string(f.output)
                elif len(context.artifacts) > 0:
                    artifact = random.choice(context.artifacts)
                    if len(artifact.files) > 0:
                        target, content = random.choice(list(artifact.files.items()))
                        return f'read_artifact("{artifact.id}:{escape_string(target)}")', Value.string(content)

    return construct_type(context, t)


def random_type(context: Context) -> T:
    if random.randint(1, 4) == 1:
        return random.choice(list(context.classes.keys()))
    return random.choice(['string', 'bool', 'int', 'float', 'dict'])


def random_block(context: Context, depth: int = 2) -> str:
    statements = []
    for _ in range(random.randint(0, 6)):
        if random.randint(1, 16) == 1 and depth > 0:
            match random.choice(["if", "while", "for"]):
                case "if":
                    cond, condval = random_expr(context, "bool")
                    with context.new_scope():
                        inner_t = random_block(context, depth - 1)
                    if random.choice([True, False]):
                        with context.new_scope():
                            inner_f = random_block(context, depth - 1)
                        statements.append(f"if ({cond}) {{\n{indent(inner_t, 4)}\n}} else {{\n{indent(inner_f, 4)}\n}}")
                    else:
                        statements.append(f"if ({cond}) {{\n{indent(inner_t, 4)}\n}}")
                case "while":
                    pass
                case "for":
                    with context.new_scope():
                        var = random_variable()
                        start = random.randint(-10, 10)
                        end = random.randint(start, start+10)
                        context.define(var, "int")
                        inner = random_block(context, depth - 1)
                        statements.append(f"for (int {var} = {start}; {var} < {end}; {var} = {var} + 1) {{\n{indent(inner, 4)}\n}}");

        match random.randint(1, 4):
            case 1:
                global_f = context.functions.items()
                if len(global_f) > 0:
                    target, func = cast(tuple[str, Function], random.choice(list(global_f)))
                    args = [random_expr(context, t)[0] for t in func.args]
                    statements.append(f"{target}({','.join(args)});")
            case 2:
                t = random_type(context)
                var = random_variable()
                expr, v = random_expr(context, t)
                statements.append(f"{t} {var} = {expr};")
                context.define(var, t, v)
            case 3:
                var = random_variable()
                b, f, inplace = cast(tuple[str, Callable[[str], str], bool], random.choice([
                    ("uppercase", lambda s: s.upper(), True),
                    ("lowercase", lambda s: s.lower(), True),
                    ("capitalize", lambda s: s[0].upper() + s[1:], True),
                    ("reverse", lambda s: s[::-1], True),
                    ("trim", lambda s: s.strip(), True),
                    ("btoa", lambda s: base64.b64encode(s.encode()).decode(), False),
                    ("atob", lambda s: base64.b64decode(s.encode()).decode(), False),
                    ("hex", lambda s: s.encode().hex(), False),
                    ("unhex", lambda s: bytes.fromhex(s).decode(), False)
                ]))
                expr, v = random_string_literal(context)
                v = cast(PrimitiveValue, v)
                if b == "atob":
                    v.payload = base64.b64encode(v.payload.encode()).decode()
                    expr = f'"{v.payload}"'
                elif b == "unhex":
                    v.payload = v.payload.encode().hex()
                    expr = f'"{v.payload}"'
                v.payload = f(cast(str, v.payload))
                if inplace:
                    statements.append(f"string {var} = {expr};")
                    statements.append(f"{b}({var});")
                else:
                    statements.append(f"string {var} = {b}({expr});")
                context.define(var, "string", v)

    return "\n".join(statements)


def random_func(context: Context, name: str, args: List[T], output: T) -> tuple[str, Value]:
    varnames = [random_variable() for i in range(len(args))]
    with context.new_scope():
        for var, t in zip(varnames, args):
            context.define(var, t)
        content = random_block(context)

        if output != "void":
            ret_content, out = random_expr(context, output)
            if content:
                content += "\n"
            if random.randint(1, 8) == 1:
                cond, condval = random_expr(context, "bool")
                discard_content, discard_out = random_expr(context, output)
                content += f"if ({cond}) {{\n    return {ret_content};\n}} else {{\n    return {discard_content};\n}}"
                if not cast(bool, cast(PrimitiveValue, condval).payload):
                    # swap the cases
                    ret_content, discard_content = discard_content, ret_content
                    out, discard_out = discard_out, out
            else:
                content += f"return {ret_content};"

    argdef = ', '.join([f"{arg} {name}" for name, arg in zip(varnames, args)])
    return f"""{output} {name}({argdef}) {{
{indent(content, 4)}
}}""", out


def random_script(workspace: Workspace, artifacts: List[Artifact]) -> Slopfile:
    context = Context(workspace, artifacts)
    request = Class()
    request.members = [
        ("params", "dict")
    ]
    context.classes["Request"] = request
    response = Class()
    response.members = [
        ("content", "string"),
        ("headers", "dict")
    ]
    context.classes["Response"] = response

    content = ""
    for i in range(random.randint(0, 8)):
        c = Class()
        c.members = []
        name = random_variable()
        variables = [(random_variable(), random_type(context)) for j in range(random.randint(0, 8))]
        for (v, t) in variables:
            c.members.append((v, t))
        context.classes[name] = c
        content += f"class {name} {{ {''.join(f'{t} {v};' for v, t in variables) } }}\n"

    for i in range(random.randint(0, 8)):
        name = random_variable()
        func = Function()
        func.args = [random_type(context) for i in range(random.randint(0, 4))]
        func.ret = random_type(context)
        func_content, _ = random_func(context, name, func.args, func.ret)
        context.functions[name] = func

        content += func_content
        content += "\n"

    main, output = random_func(context, "main", ["Request"], "Response")

    content += main

    return Slopfile(content=content, output=cast(str, cast(PrimitiveValue, cast(ClassValue, output).properties["content"]).payload))

def build_workspace(artifacts: List[Artifact]) -> Workspace:
    w = Workspace()

    num_files = random.randint(0, 16)
    num_lambdas = random.randint(1, 3)

    for i in range(num_files):
        name = '/'.join([''.join(random.choice(string.ascii_letters + string.digits) for i in range(random.randint(4, 16))) for i in range(random.randint(1, 3))])
        content = ''.join(random.choice(string.ascii_letters + string.digits) for i in range(random.randint(32, 64)))

        w.files[name] = content

    for i in range(num_lambdas):
        name = ''.join(random.choice(string.ascii_letters + string.digits) for i in range(random.randint(8, 16)))
        w.lambdas[name] = random_script(w, artifacts)

    return w
