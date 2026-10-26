import {
  chat,
  chatParamsFromRequest,
  mergeAgentTools,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { FallbackTextAdapter } from "./fallback.js";

export function backendMode(): "openai" | "fallback" {
  return process.env.OPENAI_API_KEY?.trim() ? "openai" : "fallback";
}

export async function handleLlm(request: Request): Promise<Response> {
  const params = await chatParamsFromRequest(request);
  const tools = mergeAgentTools([], params.tools);
  const common = {
    messages: params.messages,
    tools,
    systemPrompts: [
      `You are the Sloppable workspace agent. Use the client tools to inspect and change the user's workspace, publish artifacts, share them, invoke artifact lambdas, and read the Slopscript reference. Never invent tool results.`,
    ],
    threadId: params.threadId,
    runId: params.runId,
    ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
    ...(params.resume ? { resume: params.resume } : {}),
    state: params.state,
  };

  const stream =
    backendMode() === "openai"
      ? chat({ adapter: openaiText("gpt-5.6-luna"), ...common })
      : chat({ adapter: new FallbackTextAdapter(), ...common });

  return toServerSentEventsResponse(stream);
}
