import { Bot } from "lucide-react";
import type { UIMessage } from "@tanstack/ai-react";

import type { createAgentTools } from "@/agent/tools";
import { MarkdownContent } from "@/components/agent/markdown-content";
import { ToolCall } from "@/components/agent/tool-call";
import { SessionIcon } from "@/components/session-icon";
import { cn } from "@/lib/utils";

type Message = UIMessage<ReturnType<typeof createAgentTools>>;

function AgentAvatar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground",
        className,
      )}
      aria-label="Assistant"
    >
      <Bot className="size-4" />
    </span>
  );
}

export function AgentMessage({
  message,
  token,
  showAvatar = true,
}: {
  message: Message;
  token: string;
  showAvatar?: boolean;
}) {
  if (message.role === "system") return null;

  const user = message.role === "user";
  const hasText = message.parts.some(
    (part) => part.type === "text" && part.content.trim().length > 0,
  );

  return (
    <article
      className={cn(
        "flex w-full items-end gap-2.5",
        user ? "flex-row-reverse pl-10 sm:pl-24" : "pr-10 sm:pr-24",
        !showAvatar && "-mb-2",
      )}
    >
      {!showAvatar ? (
        <span className="size-8 shrink-0" aria-hidden="true" />
      ) : user ? (
        <SessionIcon token={token} className="shrink-0 border" />
      ) : (
        <AgentAvatar />
      )}

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-2",
          user ? "items-end" : "items-start",
        )}
      >
        {hasText && (
          <div
            className={cn(
              "max-w-full rounded-2xl px-4 py-2.5 text-sm leading-6",
              user
                ? "rounded-br-sm bg-primary text-primary-foreground"
                : "rounded-bl-sm border bg-card",
            )}
          >
            {message.parts.map((part, index) => {
              if (part.type !== "text") return null;
              return user ? (
                <p key={index} className="whitespace-pre-wrap">
                  {part.content}
                </p>
              ) : (
                <MarkdownContent key={index} content={part.content} />
              );
            })}
          </div>
        )}

        {message.parts.map((part) =>
          part.type === "tool-call" ? (
            <div key={part.id} className="w-full max-w-2xl">
              <ToolCall part={part} />
            </div>
          ) : null,
        )}
      </div>
    </article>
  );
}
