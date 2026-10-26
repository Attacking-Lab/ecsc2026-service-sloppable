export const SLOPSCRIPT_REFERENCE = `# Slopscript language reference

Slopscript is a small, statically-typed, C-like language compiled to WebAssembly.

## Entry point

Every program must define exactly one entry function. Its parameter must be
\`Request\`; its return type must be \`Response\`:

    Response main(Request r) { ... }

- \`Request\` — the incoming request. Field: \`dict parameters\`, the query parameters passed in the request.
- \`Response\` — construct with \`Response(string content, dict headers)\`. The
  entry returns the response's \`content\` and \`headers\`.

    Response main(Request r) { return Response("hello", {}); }

## Types

- \`int\`    — 32-bit signed integer (\`42\`, \`-7\`)
- \`float\`  — 64-bit float; a decimal point with digits on both sides is
  required (\`1.0\`, \`3.14\`; not \`1.\` or \`.5\`)
- \`bool\`   — \`true\` / \`false\`
- \`string\` — double-quoted, escapes \`\\n \\t \\r \\" \\\\\`
- \`void\`   — no value (function return type only)
- \`dict\`   — string-keyed, string-valued map, e.g. \`{"a": "x", "b": "y"}\`
- \`T[]\`    — array of \`T\`, e.g. \`int[]\`, \`string[]\`, \`T[][]\`
- class types — any \`class\` you declare, plus \`Request\`/\`Response\`

## Declarations

Only **functions** and **classes** may appear at the top level — there are no
global variables.

Functions:

    int add(int a, int b) { return a + b; }

Local variables (inside function/method bodies only; an initializer is
required, there is no type inference):

    int x = 10;
    string[] names = ["a", "b"];
    dict d = {"k": "v"};

Classes — fields and methods, single inheritance via \`extends\`, \`this\` for
member access. Construct by calling the class name with every field value in
declaration order (inherited fields first):

    class Animal {
        string name;
        string speak(string s) { return this.name + ": " + s; }
    }
    class Dog extends Animal {
        string speak(string s) { return this.name + " barks " + s; }
    }
    // Animal a = Dog("rex");  a.speak("!")  -> dynamic dispatch on speak

## Statements

\`if\` / \`else\`, \`while\`, \`for\`, \`return\`, loop-only \`break\` and
\`continue\`, assignment, and expression statements. Variable declarations,
assignments, expression statements, \`return\`, \`break\`, and \`continue\` end
with \`;\`; control-flow bodies may be a single statement or a \`{ }\` block.

    for (int i = 0; i < n; i = i + 1) { ... }
    while (cond) { ... }
    if (x > 0) { ... } else { ... }

There is no compound assignment (\`+=\`) and no \`++\`; write \`i = i + 1\`.

## Operators

- Arithmetic: \`+ - * / %\` on two \`int\` or two \`float\` values; \`+\` also
  concatenates two strings, and \`/\` on ints is integer division
- Equality: \`== !=\` on two ints, two floats, or two strings
- Ordering: \`< > <= >=\` on two ints or two floats
- Logical: \`&& || !\` on bools (\`&&\` and \`||\` evaluate both operands)
- Indexing: arrays with an int or dictionaries with a string; member
  \`obj.field\`; call \`f(...)\`

There is no built-in int→string conversion; write a helper (see the example).

## Built-in functions

- \`string atob(string s)\` — decode a Base64-encoded string; returns "" if the
  input is invalid.
- \`string btoa(string s)\` — Base64-encode the string \`s\`.
- \`void capitalize(string s)\` — uppercase the first character of \`s\`.
- \`string hex(string s)\` — encode the string \`s\` as lowercase hex.
- \`void lowercase(string s)\` — lowercase \`s\`.
- \`string read_artifact(string ref)\` — read a single file out of a published
  artifact. Use \`"<artifact_id>:<path>"\` to identify the file. Returns its
  content, or "" when it cannot be read.
- \`void reverse(string s)\` — reverse the characters in \`s\`.
- \`string spc(string name)\` — invoke the lambda named \`name\` in the
  current artifact's namespace and return its response body. \`name\` must not
  contain "/"; returns "" on failure.
- \`string substring(string value, int start, int length)\` — return at most
  \`length\` characters from the string \`value\`, beginning at the zero-based
  character index \`start\`. The length is clamped at the end of the string.
  Returns "" if \`start\` or \`length\` is negative, \`length\` is zero, or
  \`start\` is past the end of the string.
- \`void trim(string s)\` — remove leading and trailing whitespace from \`s\`.
- \`string unhex(string s)\` — decode a hexadecimal string; accepts either letter
  case and returns "" if the input is invalid.
- \`void uppercase(string s)\` — uppercase \`s\`.

## Comments

\`// line\` and \`/* block */\`.

## Complete example

    string int2str(int n) {
        int d = n % 10;
        int r = n / 10;
        string[] digits = ["0","1","2","3","4","5","6","7","8","9"];
        string c = digits[d];
        if (r > 0) { return int2str(r) + c; }
        return c;
    }

    int fib(int n) {
        if (n == 0 || n == 1) { return 1; }
        return fib(n - 1) + fib(n - 2);
    }

    Response main(Request r) {
        return Response(int2str(fib(6)), {"computed": "ok"});
    }
`;
