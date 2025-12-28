import path from "node:path";
import { spawn } from "node:child_process";
import { loadConfig } from "@framecreate/shared";
import { generateMockImage } from "./mock.js";

const config = loadConfig(process.cwd());

export type RuntimeInput = {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  seed: number;
  outputPath: string;
  modelPath: string;
  sampler?: string | null;
  scheduler?: string | null;
  loras?: { path: string; weight: number }[];
  previewEnabled?: boolean;
  previewInterval?: number;
  previewPath?: string | null;
  cancelPath?: string | null;
};

export async function generateImage(input: RuntimeInput) {
  const runtime = process.env.FRAMECREATE_RUNTIME ?? "mock";
  if (runtime === "python") {
    const mode = process.env.FRAMECREATE_PYTHON_MODE ?? "server";
    if (mode === "spawn") {
    return generateWithPythonSpawn(input);
  }
  return generateWithPythonServer(input);
  }
  return generateMockImage({
    width: input.width,
    height: input.height,
    outputPath: input.outputPath,
    seed: input.seed
  });
}

export async function reloadRuntime() {
  if (pythonServer) {
    await pythonServer.reload();
  }
}

async function generateWithPythonServer(input: RuntimeInput) {
  const server = getPythonServer();
  await server.generate({
    prompt: input.prompt,
    negative_prompt: input.negativePrompt,
    width: input.width,
    height: input.height,
    steps: input.steps,
    cfg: input.cfgScale,
    seed: input.seed,
    sampler: input.sampler ?? "",
    scheduler: input.scheduler ?? "",
    output: input.outputPath,
    model_path: input.modelPath,
    loras: input.loras ?? [],
    preview_enabled: input.previewEnabled ?? false,
    preview_interval: input.previewInterval ?? 0,
    preview_path: input.previewPath ?? "",
    cancel_path: input.cancelPath ?? ""
  });
}

async function generateWithPythonSpawn(input: RuntimeInput) {
  const rawPythonBin = process.env.FRAMECREATE_PYTHON_BIN;
  const pythonBin = rawPythonBin
    ? (path.isAbsolute(rawPythonBin) ? rawPythonBin : path.resolve(config.rootDir, rawPythonBin))
    : path.resolve(config.rootDir, "services/worker/runtime/.venv/bin/python");
  const script = path.resolve(config.rootDir, "services/worker/src/runtime/python/generate.py");

  return new Promise<void>((resolve, reject) => {
    const args = [
      script,
      "--model",
      input.modelPath,
      "--prompt",
      input.prompt,
      "--negative",
      input.negativePrompt,
      "--width",
      String(input.width),
      "--height",
      String(input.height),
      "--steps",
      String(input.steps),
      "--cfg",
      String(input.cfgScale),
      "--seed",
      String(input.seed),
      "--sampler",
      input.sampler ?? "",
      "--scheduler",
      input.scheduler ?? "",
      "--output",
      input.outputPath
    ];

    if (input.loras && input.loras.length > 0) {
      input.loras.forEach((lora) => {
        args.push("--lora", `${lora.path}|${lora.weight}`);
      });
    }
    if (input.cancelPath) {
      args.push("--cancel-path", input.cancelPath);
    }

    const child = spawn(pythonBin, args);

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      reject(new Error(message));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const output = stdout.trim();
        let message = stderr.trim() || output || "python runtime failed";
        if (output) {
          const lastLine = output.split("\n").pop() ?? "";
          try {
            const parsed = JSON.parse(lastLine) as { error?: string };
            if (parsed.error) {
              message = parsed.error;
            }
          } catch {
            // ignore non-json output
          }
        }
        reject(new Error(message));
      }
    });
  });
}

type PythonGenerateRequest = {
  action?: string;
  prompt: string;
  negative_prompt: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  seed: number;
  sampler: string;
  scheduler: string;
  output: string;
  model_path: string;
  loras: { path: string; weight: number }[];
  preview_enabled?: boolean;
  preview_interval?: number;
  preview_path?: string;
  cancel_path?: string;
};

type PythonResponse = {
  status: "ok" | "error";
  output?: string;
  error?: string;
};

class PythonServer {
  private process: ReturnType<typeof spawn> | null = null;
  private buffer = "";
  private pending: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];

  private start() {
    if (this.process) {
      return;
    }
    const rawPythonBin = process.env.FRAMECREATE_PYTHON_BIN;
    const pythonBin = rawPythonBin
      ? (path.isAbsolute(rawPythonBin) ? rawPythonBin : path.resolve(config.rootDir, rawPythonBin))
      : path.resolve(config.rootDir, "services/worker/runtime/.venv/bin/python");
    const script = path.resolve(config.rootDir, "services/worker/src/runtime/python/server.py");
    const child = spawn(pythonBin, [script], { stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => this.handleData(chunk.toString()));
    child.stderr.on("data", (chunk) => {
      const message = chunk.toString().trim();
      if (message) {
        console.warn(`[python] ${message}`);
      }
    });
    child.on("error", (error) => this.handleError(error));
    child.on("close", () => this.handleError(new Error("python server exited")));
    this.process = child;
  }

  private handleData(data: string) {
    this.buffer += data;
    let index = this.buffer.indexOf("\n");
    while (index !== -1) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line) {
        this.handleResponse(line);
      }
      index = this.buffer.indexOf("\n");
    }
  }

  private handleResponse(line: string) {
    const pending = this.pending.shift();
    if (!pending) {
      return;
    }
    try {
      const payload = JSON.parse(line) as PythonResponse;
      if (payload.status === "ok") {
        pending.resolve();
      } else {
        pending.reject(new Error(payload.error ?? "python runtime failed"));
      }
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private handleError(error: Error) {
    while (this.pending.length > 0) {
      const pending = this.pending.shift();
      if (pending) {
        pending.reject(error);
      }
    }
    if (this.process) {
      this.process.removeAllListeners();
      this.process.kill();
    }
    this.process = null;
  }

  private send(payload: PythonGenerateRequest) {
    this.start();
    if (!this.process || !this.process.stdin) {
      throw new Error("python runtime not available");
    }
    this.process.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  generate(payload: PythonGenerateRequest) {
    return new Promise<void>((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.send({ ...payload, action: "generate" });
    });
  }

  reload() {
    return new Promise<void>((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.send({
        action: "reload",
        prompt: "",
        negative_prompt: "",
        width: 0,
        height: 0,
        steps: 0,
        cfg: 0,
        seed: 0,
        sampler: "",
        scheduler: "",
        output: "",
        model_path: "",
        loras: [],
        preview_enabled: false,
        preview_interval: 0,
        preview_path: "",
        cancel_path: ""
      });
    });
  }
}

let pythonServer: PythonServer | null = null;

function getPythonServer() {
  if (!pythonServer) {
    pythonServer = new PythonServer();
  }
  return pythonServer;
}
