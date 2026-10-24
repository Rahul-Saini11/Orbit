# Terminal Coding Agent

A small, terminal-based coding agent inspired by Pi. It sends a conversation to an OpenAI-compatible model and lets the model inspect files, make targeted edits, search the workspace, and run approved shell commands.

## Requirements

- Node.js 20 or newer
- An OpenAI-compatible API key

## Setup

```sh
npm install
cp .env.example .env
export OPENAI_API_KEY="your-api-key"
npm run dev
```

To work in another directory:

```sh
npm run dev -- ../another-project
```

Build and run the compiled CLI:

```sh
npm run build
OPENAI_API_KEY="your-api-key" npm start
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | required | Provider API key |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Chat-completions model with tool support |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible API base URL |

## Project Layout

```text
src/
  index.ts    CLI and interactive terminal loop
  agent.ts    Conversation and tool-call loop
  client.ts   OpenAI-compatible chat-completions client
  tools.ts    Workspace file, search, edit, and shell tools
  prompt.ts   Coding-agent system prompt
  types.ts    Shared protocol types
```

Shell commands require confirmation. File tools reject paths outside the selected workspace, including paths that escape through existing symbolic links.
