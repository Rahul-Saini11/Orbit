import { OpenAIClient } from "./client.js";
import type { Message, Tool } from "./types.js";

export class Agent {
  private readonly messages: Message[];
  private readonly toolsByName: Map<string, Tool>;

  constructor(
    private readonly client: OpenAIClient,
    systemPrompt: string,
    tools: Tool[],
  ) {
    this.messages = [{ role: "system", content: systemPrompt }];
    this.toolsByName = new Map(tools.map((tool) => [tool.definition.function.name, tool]));
  }

  clear(): void {
    this.messages.splice(1);
  }

  async run(input: string, onToolCall: (name: string) => void): Promise<string> {
    this.messages.push({ role: "user", content: input });

    for (let step = 0; step < 30; step += 1) {
      const reply = await this.client.complete(
        this.messages,
        [...this.toolsByName.values()].map((tool) => tool.definition),
      );

      this.messages.push({
        role: "assistant",
        content: reply.content,
        ...(reply.toolCalls.length > 0 ? { tool_calls: reply.toolCalls } : {}),
      });

      if (reply.toolCalls.length === 0) return reply.content ?? "";

      for (const call of reply.toolCalls) {
        const name = call.function.name;
        onToolCall(name);
        let result: string;

        try {
          const tool = this.toolsByName.get(name);
          if (!tool) throw new Error(`Unknown tool: ${name}`);
          const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
          result = await tool.execute(args);
        } catch (error) {
          result = `Error: ${error instanceof Error ? error.message : String(error)}`;
        }

        this.messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
    }

    throw new Error("Agent stopped after reaching the 30-step limit");
  }
}
