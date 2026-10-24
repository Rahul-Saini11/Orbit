import type { Message, ToolCall, ToolDefinition } from "./types.js";

type CompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: ToolCall[];
    };
  }>;
  error?: { message?: string };
};

export type ModelReply = {
  content: string | null;
  toolCalls: ToolCall[];
};

export class OpenAIClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl = "https://api.openai.com/v1",
  ) {}

  async complete(messages: Message[], tools: ToolDefinition[]): Promise<ModelReply> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: this.model, messages, tools, tool_choice: "auto" }),
    });

    const body = (await response.json()) as CompletionResponse;
    if (!response.ok) {
      throw new Error(body.error?.message ?? `Model request failed with status ${response.status}`);
    }

    const message = body.choices?.[0]?.message;
    if (!message) throw new Error("Model returned no response");

    return {
      content: message.content ?? null,
      toolCalls: message.tool_calls ?? [],
    };
  }
}
