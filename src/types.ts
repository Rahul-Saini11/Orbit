export type TextMessage = {
  role: "system" | "user";
  content: string;
};

export type AssistantMessage = {
  role: "assistant";
  content: string | null;
  tool_calls?: ToolCall[];
};

export type ToolMessage = {
  role: "tool";
  tool_call_id: string;
  content: string;
};

export type Message = TextMessage | AssistantMessage | ToolMessage;

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
};

export type Tool = {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>): Promise<string>;
};
