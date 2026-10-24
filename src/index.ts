#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { stdin, stdout } from 'node:process';
import { Agent } from './agent.js';
import { OpenAIClient } from './client.js';
import { systemPrompt } from './prompt.js';
import { createTools } from './tools.js';

const cyan = (value: string) => `\x1b[36m${value}\x1b[0m`;
const dim = (value: string) => `\x1b[2m${value}\x1b[0m`;
const red = (value: string) => `\x1b[31m${value}\x1b[0m`;

function printHelp(): void {
  console.log(`Commands:
  /help   Show this help
  /clear  Clear conversation history
  /exit   Exit the agent`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(
      `Usage: code-agent [workspace]\n\nEnvironment: OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL`,
    );
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required');

  const workspace = path.resolve(process.argv[2] ?? process.cwd());
  const model = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
  const readline = createInterface({ input: stdin, output: stdout });

  const confirm = async (command: string): Promise<boolean> => {
    const answer = await readline.question(
      `${dim('Run command:')} ${command}\n${cyan('Allow? [y/N]')} `,
    );
    return answer.trim().toLowerCase() === 'y';
  };

  const client = new OpenAIClient(apiKey, model, process.env.OPENAI_BASE_URL);
  const agent = new Agent(
    client,
    systemPrompt(workspace),
    createTools(workspace, confirm),
  );

  console.log(
    `${cyan('code-agent')} ${dim(`model=${model} workspace=${workspace}`)}`,
  );
  console.log(dim('Type /help for commands.'));

  while (true) {
    const input = (await readline.question(`\n${cyan('>')} `)).trim();
    if (!input) continue;
    if (input === '/exit') break;
    if (input === '/help') {
      printHelp();
      continue;
    }
    if (input === '/clear') {
      agent.clear();
      console.log(dim('Conversation cleared.'));
      continue;
    }

    try {
      const result = await agent.run(input, (name) =>
        console.log(dim(`using ${name}`)),
      );
      console.log(`\n${result}`);
    } catch (error) {
      console.error(
        red(error instanceof Error ? error.message : String(error)),
      );
    }
  }

  readline.close();
}

main().catch((error: unknown) => {
  console.error(red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
