import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  Clipboard,
  FileCode2,
  FolderOpen,
  LoaderCircle,
  Plus,
  RefreshCw,
  Send,
  Square,
  WifiOff,
} from "lucide-react";
import {
  fetchServerSentEvents,
  localStoragePersistence,
  useChat,
} from "@tanstack/ai-react";

import { createAgentTools } from "@/agent/tools";
import logoUrl from "@/assets/logo.svg";
import { AgentMessage } from "@/components/agent/agent-message";
import { SessionIcon } from "@/components/session-icon";
import { SlopscriptCode, isSlopscriptPath } from "@/components/slopscript-code";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  api,
  type Health,
  type WorkspaceFile,
  type WorkspaceFileContent,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const SESSION_KEY = "sloppable:session-token";
const CHAT_CONNECTION = fetchServerSentEvents("/llm");
const CHAT_PERSISTENCE = localStoragePersistence({
  keyPrefix: "sloppable-chat:",
});
const TOKEN_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

type SessionState =
  | { status: "loading" }
  | { status: "ready"; token: string }
  | { status: "error"; message: string };

function WorkspaceAgent({
  token,
  onNewSession,
}: {
  token: string;
  onNewSession: () => Promise<void>;
}) {
  const [health, setHealth] = useState<Health | null>(null);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selected, setSelected] = useState<WorkspaceFileContent | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string>();
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const refreshFiles = useCallback(async () => {
    try {
      const result = await api.listFiles(token);
      setFiles(result.files);
      setWorkspaceError(undefined);
    } catch (error) {
      setWorkspaceError(
        error instanceof Error ? error.message : "Could not load workspace",
      );
    }
  }, [token]);

  const openFile = useCallback(
    async (path: string) => {
      try {
        const file = await api.readFile(token, path);
        setSelected(file);
        setWorkspaceError(undefined);
      } catch (error) {
        setWorkspaceError(
          error instanceof Error ? error.message : "Could not read file",
        );
      }
    },
    [token],
  );

  const tools = useMemo(
    () =>
      createAgentTools(token, {
        onFilesListed: setFiles,
        onFileRead: setSelected,
        onWorkspaceChanged: async (path) => {
          await refreshFiles();
          await openFile(path);
        },
      }),
    [openFile, refreshFiles, token],
  );

  const chat = useChat({
    connection: CHAT_CONNECTION,
    tools,
    threadId: `workspace-${token}`,
    persistence: CHAT_PERSISTENCE,
    onFinish: () => void refreshFiles(),
  });

  const lastUserMessage = useMemo(() => {
    for (let index = chat.messages.length - 1; index >= 0; index -= 1) {
      const message = chat.messages[index];
      if (message.role !== "user") continue;

      const content = message.parts
        .map((part) => (part.type === "text" ? part.content : ""))
        .join("\n");
      if (content.trim()) return content;
    }

    return "";
  }, [chat.messages]);

  useEffect(() => {
    void refreshFiles();
    void api
      .health()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, [refreshFiles]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.messages, chat.status]);

  const submit = async () => {
    const message = input.trim();
    if (!message || chat.isLoading) return;
    setInput("");
    await chat.sendMessage(message);
  };

  const newSession = async () => {
    try {
      await onNewSession();
    } catch (error) {
      setWorkspaceError(
        error instanceof Error ? error.message : "Could not create a session",
      );
    }
  };

  const copyToken = async () => {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main className="app-grid h-svh w-screen overflow-hidden">
      <Tabs
        defaultValue="agent"
        className="flex h-full w-full flex-col overflow-hidden bg-background/80 backdrop-blur"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="" className="h-8 w-auto" />
            <div>
              <h1 className="font-semibold tracking-tight">Sloppable</h1>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="rounded-full outline-none ring-offset-background transition-shadow hover:ring-2 hover:ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:ring-2 data-[state=open]:ring-ring"
              aria-label="Session"
            >
              <SessionIcon token={token} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel className="flex items-center gap-3">
                <SessionIcon token={token} className="size-9 shrink-0" />
                <span className="min-w-0 break-all font-mono text-[0.68rem] font-normal text-muted-foreground select-all">
                  {token}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  void copyToken();
                }}
              >
                {copied ? (
                  <Check className="text-emerald-600" />
                ) : (
                  <Clipboard />
                )}
                {copied ? "Copied" : "Copy token"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void newSession()}>
                <Plus />
                New session
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <div className="shrink-0 border-b px-4 py-3 sm:px-5">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="files">
              <FolderOpen className="mr-1.5 size-3.5" />
              Files
            </TabsTrigger>
            <TabsTrigger value="agent">
              <Bot className="mr-1.5 size-3.5" />
              Agent
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="files"
          forceMount
          className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
        >
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(130px,0.42fr)_minmax(0,1fr)] overflow-hidden">
            <aside className="min-h-0 overflow-y-auto border-r p-2">
              {files.length === 0 ? (
                <div className="px-2 py-8 text-center text-xs text-muted-foreground">
                  No files yet.
                </div>
              ) : (
                files.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => void openFile(file.path)}
                    className={cn(
                      "mb-1 flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-muted",
                      selected?.path === file.path && "bg-muted font-medium",
                    )}
                  >
                    <FileCode2 className="mt-0.5 size-3.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate">{file.path}</span>
                      <span className="font-mono text-[0.6rem] text-muted-foreground">
                        {file.bytes} B
                      </span>
                    </span>
                  </button>
                ))
              )}
            </aside>
            <div className="min-h-0 min-w-0 overflow-auto">
              {selected?.found ? (
                <>
                  <div className="sticky top-0 border-b bg-background/95 px-4 py-2 font-mono text-xs backdrop-blur">
                    {selected.path}
                  </div>
                  <pre className="min-h-full overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-6">
                    {isSlopscriptPath(selected.path) ? (
                      <SlopscriptCode source={selected.content} />
                    ) : (
                      selected.content
                    )}
                  </pre>
                </>
              ) : (
                <div className="grid h-full min-h-48 place-items-center p-6 text-center text-sm text-muted-foreground">
                  <div>
                    <FileCode2 className="mx-auto mb-3 size-7 opacity-50" />
                    Select a file to inspect it.
                  </div>
                </div>
              )}
            </div>
          </div>
          {workspaceError && (
            <p className="border-t px-4 py-2 text-xs text-destructive">
              {workspaceError}
            </p>
          )}
        </TabsContent>

        <TabsContent
          value="agent"
          forceMount
          className="mt-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
            <div className="grid w-full grid-cols-1 gap-4">
              {chat.messages.length === 0 && (
                <Card className="gap-4 border-dashed bg-card/60 p-5">
                  <div className="flex items-start gap-3">
                    <Bot className="mt-0.5 size-5" />
                    <div>
                      <h3 className="text-sm font-semibold">
                        Welcome to sloppable, what do you want to slop today?
                      </h3>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "List files",
                      'Write file hello.txt with content "Hello from Sloppable"',
                      "Show Slopscript reference",
                    ].map((example) => (
                      <Button
                        key={example}
                        variant="outline"
                        size="sm"
                        onClick={() => setInput(example)}
                      >
                        {example}
                      </Button>
                    ))}
                  </div>
                </Card>
              )}
              {chat.messages.map((message, index) => (
                <AgentMessage
                  key={message.id}
                  message={message}
                  token={token}
                  showAvatar={chat.messages[index + 1]?.role !== message.role}
                />
              ))}
              {chat.error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  <WifiOff className="mt-0.5 size-4 shrink-0" />
                  {chat.error.message}
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <div className="shrink-0 border-t bg-background/90 p-3 backdrop-blur sm:p-4">
            <div className="flex w-full items-end gap-2">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "ArrowUp" &&
                    input.length === 0 &&
                    lastUserMessage &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    setInput(lastUserMessage);
                    return;
                  }

                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                placeholder="Ask Sloppable to inspect or change the workspace…"
                className="min-h-24 flex-1 bg-card"
                disabled={chat.isLoading}
              />
              {chat.isLoading ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-auto min-w-20 self-stretch"
                  onClick={chat.stop}
                >
                  <Square className="size-3 fill-current" />
                  Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-auto min-w-20 self-stretch"
                  onClick={() => void submit()}
                  disabled={!input.trim()}
                >
                  <Send className="size-3.5" />
                  Send
                </Button>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}

export function App() {
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored && TOKEN_PATTERN.test(stored)) {
        if (!cancelled) setSession({ status: "ready", token: stored });
        return;
      }
      try {
        const created = await api.createSession();
        localStorage.setItem(SESSION_KEY, created.session_token);
        if (!cancelled)
          setSession({ status: "ready", token: created.session_token });
      } catch (error) {
        if (!cancelled) {
          setSession({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Could not create a session",
          });
        }
      }
    };
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const newSession = useCallback(async () => {
    const created = await api.createSession();
    localStorage.setItem(SESSION_KEY, created.session_token);
    window.location.reload();
  }, []);

  if (session.status === "ready")
    return <WorkspaceAgent token={session.token} onNewSession={newSession} />;

  return (
    <main className="app-grid grid h-svh place-items-center overflow-hidden p-6">
      <Card className="w-full max-w-sm items-center px-6 text-center">
        {session.status === "loading" ? (
          <>
            <LoaderCircle className="size-7 animate-spin" />
            <div>
              <h1 className="font-semibold">Opening workspace</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Creating or restoring your local session…
              </p>
            </div>
          </>
        ) : (
          <>
            <WifiOff className="size-7 text-destructive" />
            <div>
              <h1 className="font-semibold">API unavailable</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {session.message}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setSession({ status: "loading" });
                setAttempt((value) => value + 1);
              }}
            >
              <RefreshCw className="size-4" />
              Retry
            </Button>
          </>
        )}
      </Card>
    </main>
  );
}
