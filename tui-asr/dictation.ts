import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import {
  ALL_ASR_MODELS,
  createAsrProvider,
  ensureCustomProviders,
  type AsrModelDefinition,
  type StreamingAsrProvider,
} from "../custom-providers/index.ts";
import { insertTranscript } from "./input.ts";
import { createStatusDisplay } from "./status.ts";

export { ALL_ASR_MODELS, createAsrProvider, ensureCustomProviders, type AsrModelDefinition, type StreamingAsrProvider };

export async function resolveProviderApiKey(provider: string, ctx?: ExtensionContext | null): Promise<string> {
  if (ctx?.modelRegistry) {
    const candidates = provider === "dashscope" ? ["dashscope", "aliyun"] : [provider];
    for (const id of candidates) {
      try {
        const key = await ctx.modelRegistry.getApiKeyForProvider(id);
        if (key?.trim()) return key.trim();
      } catch {}
      try {
        const auth = await ctx.modelRegistry.getProviderAuth(id);
        if (auth?.auth?.apiKey?.trim()) return auth.auth.apiKey.trim();
      } catch {}
    }
  }
  const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
  if (envKey?.trim()) return envKey.trim();
  if (provider === "dashscope") {
    return process.env.ALIYUN_API_KEY?.trim() || "";
  }
  return "";
}

export function rmsFromPcm16(buf: Buffer): number {
  if (buf.length < 2) return 0;
  const sampleCount = Math.floor(buf.length / 2);
  let sumSquares = 0;
  for (let i = 0; i < sampleCount; i++) {
    const sample = buf.readInt16LE(i * 2);
    sumSquares += sample * sample;
  }
  const meanSquare = sumSquares / sampleCount;
  return Math.sqrt(meanSquare);
}

/** Spawn the existing 16 kHz mono PCM recorder for the current platform. */
export function spawnRecorder(): ChildProcessByStdio<null, Readable, Readable> {
  const commonAudioArgs = [
    "-q",
    "--buffer", "512",
    "-r", "16000",
    "-c", "1",
    "-b", "16",
    "-e", "signed-integer",
    "-t", "raw",
    "-",
  ];

  let proc: ChildProcessByStdio<null, Readable, Readable>;
  if (process.platform === "win32") {
    proc = spawn("sox", ["-t", "waveaudio", "default", ...commonAudioArgs], { stdio: ["ignore", "pipe", "pipe"] });
  } else {
    try {
      proc = spawn("rec", commonAudioArgs, { stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      proc = spawn("sox", ["-d", ...commonAudioArgs], { stdio: ["ignore", "pipe", "pipe"] });
    }
  }
  return proc;
}

type State = "idle" | "recording" | "stopping";

/** Keep recording state, cancellation guards, and cleanup in one session-local controller. */
export function createDictationController(getActiveModel: () => string, getTuiHandle: () => any) {
  let state: State = "idle";
  let rec: ChildProcessByStdio<null, Readable, Readable> | null = null;
  let activeProvider: StreamingAsrProvider | null = null;
  let finals: string[] = [];
  let activeCtx: ExtensionContext | null = null;
  let flushed = false;
  let cancelled = false;
  let stopTimeout: NodeJS.Timeout | null = null;
  let generation = 0;

  const status = createStatusDisplay(() => activeCtx);
  const { setStatus, startMeter, stopMeter, startSpinner, stopSpinner } = status;

  /** Flush transcribed text into the focused component once per recording. */
  const flush = () => {
    if (flushed || !activeCtx) return;
    flushed = true;
    if (cancelled) return;

    const text = finals.join(" ").replace(/\s+/g, " ").trim();
    if (!text) return;
    insertTranscript(activeCtx, getTuiHandle(), text);
  };

  const cleanup = () => {
    generation++;
    flush();
    stopSpinner();
    stopMeter();
    if (stopTimeout) {
      clearTimeout(stopTimeout);
      stopTimeout = null;
    }
    if (rec) {
      try {
        rec.kill("SIGTERM");
      } catch {}
      rec = null;
    }
    if (activeProvider) {
      try {
        activeProvider.cancel();
      } catch {}
      activeProvider = null;
    }
    finals = [];
    state = "idle";
    setStatus(undefined);
    activeCtx = null;
    flushed = false;
    cancelled = false;
  };

  const startDictation = async (ctx: ExtensionContext) => {
    const modelDef = ALL_ASR_MODELS.find((m) => m.id === getActiveModel()) ?? ALL_ASR_MODELS[0];
    const apiKey = await resolveProviderApiKey(modelDef.provider, ctx);
    if (!apiKey) {
      ctx.ui.notify(
        `API Key not found for ${modelDef.provider}.\nPlease run /login ${modelDef.provider} in terminal or set ${modelDef.provider.toUpperCase()}_API_KEY.`,
        "error",
      );
      return;
    }

    activeCtx = ctx;
    finals = [];
    flushed = false;
    cancelled = false;
    state = "recording";

    const provider = createAsrProvider(modelDef.provider, modelDef.id, apiKey);
    activeProvider = provider;
    const myGeneration = ++generation;
    startMeter();

    // Spawn cross-platform audio recorder (sox / rec)
    let proc: ChildProcessByStdio<null, Readable, Readable>;
    let recorderStderr = "";
    try {
      proc = spawnRecorder();
    } catch {
      ctx.ui.notify("Failed to spawn audio recorder. Please ensure sox or rec is installed (e.g. sudo pacman -S sox).", "error");
      cleanup();
      return;
    }
    rec = proc;

    proc.stderr?.on("data", (chunk: Buffer) => {
      recorderStderr += chunk.toString();
    });

    proc.on("error", (err) => {
      if (myGeneration !== generation) return;
      ctx.ui.notify(`Audio recording error: ${err.message}`, "error");
      cleanup();
    });

    proc.on("exit", (code) => {
      if (myGeneration !== generation) return;
      if (state === "recording" && code !== null && code !== 0) {
        if (activeCtx) {
          const detail = recorderStderr.trim() ? `: ${recorderStderr.trim()}` : "";
          activeCtx.ui.notify(`Audio recorder exited unexpectedly (code ${code})${detail}`, "warning");
        }
        cleanup();
      }
    });

    // Start provider streaming connection
    try {
      await provider.start({
        onFinal: (t) => {
          if (myGeneration !== generation || cancelled) return;
          if (t) finals.push(t);
        },
        onError: (err) => {
          if (myGeneration !== generation || cancelled) return;
          if (activeCtx) activeCtx.ui.notify(`DashScope ASR error: ${err.message}`, "error");
          cleanup();
        },
        onClose: () => {
          if (myGeneration !== generation || cancelled) return;
          if (state === "recording" || state === "stopping") {
            cleanup();
          }
        },
      });
    } catch (err: any) {
      if (myGeneration !== generation || cancelled) return;
      ctx.ui.notify(`Failed to connect to DashScope: ${err.message}`, "error");
      cleanup();
      return;
    }

    if (myGeneration !== generation || !rec) return;

    rec.stdout.on("data", (chunk: Buffer) => {
      status.setLevel(rmsFromPcm16(chunk));
      if (provider && state === "recording") {
        provider.sendAudio(chunk);
      }
    });
  };

  const stopDictation = async () => {
    if (state !== "recording") return;
    state = "stopping";
    stopMeter();
    startSpinner("finalizing…");

    if (rec) {
      try {
        rec.kill("SIGTERM");
      } catch {}
    }

    if (activeProvider) {
      try {
        await activeProvider.stop();
      } catch {
        cleanup();
        return;
      }

      stopTimeout = setTimeout(() => {
        if (state === "stopping") cleanup();
      }, 3000);
    } else {
      cleanup();
    }
  };

  const cancelDictation = () => {
    if (state !== "recording" && state !== "stopping") return;
    cancelled = true;
    finals = [];
    cleanup();
    if (activeCtx) activeCtx.ui.notify("Voice dictation cancelled", "info");
  };

  const toggleDictation = async (ctx: ExtensionContext) => {
    if (state === "idle") {
      await startDictation(ctx);
    } else if (state === "recording") {
      await stopDictation();
    }
  };

  return {
    get state() { return state; },
    startDictation, stopDictation, cancelDictation, toggleDictation, cleanup,
  };
}
