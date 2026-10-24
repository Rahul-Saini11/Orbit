import { execFile } from "node:child_process";
import { access, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Tool } from "./types.js";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 50_000;

type Confirm = (command: string) => Promise<boolean>;

function stringArg(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected a non-empty string for ${name}`);
  }
  return value;
}

function truncate(value: string): string {
  return value.length <= MAX_OUTPUT
    ? value
    : `${value.slice(0, MAX_OUTPUT)}\n... output truncated`;
}

async function safePath(workspace: string, requested: string): Promise<string> {
  const workspaceReal = await realpath(workspace);
  const resolved = path.resolve(workspaceReal, requested);
  const relative = path.relative(workspaceReal, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path is outside the workspace");
  }

  let existing = resolved;
  while (true) {
    try {
      await access(existing);
      break;
    } catch {
      const parent = path.dirname(existing);
      if (parent === existing) throw new Error("Could not resolve path");
      existing = parent;
    }
  }

  const existingReal = await realpath(existing);
  const realRelative = path.relative(workspaceReal, existingReal);
  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
    throw new Error("Path resolves outside the workspace");
  }
  return resolved;
}

async function walk(root: string, current: string, output: string[]): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist") continue;
    if (entry.isSymbolicLink()) continue;
    const fullPath = path.join(current, entry.name);
    const relative = path.relative(root, fullPath);
    output.push(entry.isDirectory() ? `${relative}/` : relative);
    if (entry.isDirectory()) await walk(root, fullPath, output);
  }
}

export function createTools(workspace: string, confirm: Confirm): Tool[] {
  return [
    {
      definition: {
        type: "function",
        function: {
          name: "read_file",
          description: "Read a UTF-8 text file in the workspace.",
          parameters: {
            type: "object",
            properties: { path: { type: "string", description: "Workspace-relative path" } },
            required: ["path"],
            additionalProperties: false,
          },
        },
      },
      async execute(args) {
        return truncate(await readFile(await safePath(workspace, stringArg(args, "path")), "utf8"));
      },
    },
    {
      definition: {
        type: "function",
        function: {
          name: "list_files",
          description: "Recursively list files and directories, excluding common generated directories.",
          parameters: {
            type: "object",
            properties: { path: { type: "string", description: "Directory, defaults to workspace root" } },
            additionalProperties: false,
          },
        },
      },
      async execute(args) {
        const root = await safePath(workspace, typeof args.path === "string" ? args.path : ".");
        const info = await stat(root);
        if (!info.isDirectory()) throw new Error("Path is not a directory");
        const output: string[] = [];
        await walk(root, root, output);
        return truncate(output.join("\n") || "(empty directory)");
      },
    },
    {
      definition: {
        type: "function",
        function: {
          name: "write_file",
          description: "Create or overwrite a UTF-8 text file in the workspace.",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string", description: "Workspace-relative path" },
              content: { type: "string" },
            },
            required: ["path", "content"],
            additionalProperties: false,
          },
        },
      },
      async execute(args) {
        const target = await safePath(workspace, stringArg(args, "path"));
        const content = args.content;
        if (typeof content !== "string") throw new Error("Expected a string for content");
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, content, "utf8");
        return `Wrote ${Buffer.byteLength(content)} bytes to ${path.relative(workspace, target)}`;
      },
    },
    {
      definition: {
        type: "function",
        function: {
          name: "edit_file",
          description: "Replace one exact text occurrence in a workspace file.",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string", description: "Workspace-relative path" },
              old_text: { type: "string", description: "Exact text to replace" },
              new_text: { type: "string", description: "Replacement text" },
            },
            required: ["path", "old_text", "new_text"],
            additionalProperties: false,
          },
        },
      },
      async execute(args) {
        const target = await safePath(workspace, stringArg(args, "path"));
        const oldText = stringArg(args, "old_text");
        const newText = args.new_text;
        if (typeof newText !== "string") throw new Error("Expected a string for new_text");
        const content = await readFile(target, "utf8");
        const first = content.indexOf(oldText);
        if (first === -1) throw new Error("old_text was not found");
        if (content.indexOf(oldText, first + oldText.length) !== -1) {
          throw new Error("old_text is not unique; include more context");
        }
        await writeFile(target, content.slice(0, first) + newText + content.slice(first + oldText.length));
        return `Updated ${path.relative(workspace, target)}`;
      },
    },
    {
      definition: {
        type: "function",
        function: {
          name: "search_files",
          description: "Search text files in the workspace with a regular expression.",
          parameters: {
            type: "object",
            properties: { pattern: { type: "string", description: "JavaScript regular expression" } },
            required: ["pattern"],
            additionalProperties: false,
          },
        },
      },
      async execute(args) {
        const pattern = new RegExp(stringArg(args, "pattern"));
        const files: string[] = [];
        await walk(workspace, workspace, files);
        const matches: string[] = [];
        for (const relative of files.filter((item) => !item.endsWith("/"))) {
          let content: string;
          try {
            content = await readFile(path.join(workspace, relative), "utf8");
          } catch {
            continue;
          }
          for (const [index, line] of content.split("\n").entries()) {
            if (pattern.test(line)) matches.push(`${relative}:${index + 1}: ${line}`);
            pattern.lastIndex = 0;
          }
        }
        return truncate(matches.join("\n") || "No matches found");
      },
    },
    {
      definition: {
        type: "function",
        function: {
          name: "run_command",
          description: "Run a shell command in the workspace after user confirmation.",
          parameters: {
            type: "object",
            properties: { command: { type: "string" } },
            required: ["command"],
            additionalProperties: false,
          },
        },
      },
      async execute(args) {
        const command = stringArg(args, "command");
        if (!(await confirm(command))) return "Command rejected by user";
        try {
          const { stdout, stderr } = await execFileAsync("/bin/sh", ["-c", command], {
            cwd: workspace,
            timeout: 120_000,
            maxBuffer: MAX_OUTPUT,
          });
          return truncate([stdout, stderr].filter(Boolean).join("\n") || "Command completed successfully");
        } catch (error) {
          const result = error as Error & { stdout?: string; stderr?: string; code?: number };
          return truncate(
            [`Exit code: ${result.code ?? "unknown"}`, result.stdout, result.stderr, result.message]
              .filter(Boolean)
              .join("\n"),
          );
        }
      },
    },
  ];
}
