import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const BRAILLE_FRAMES = ["⠀", "⣀", "⣄", "⣤", "⣦", "⣶", "⣷", "⣿"];
const METER_CELLS = 4;
const METER_TICK_MS = 80;

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

function rmsToBlock(rms: number): string {
  const norm = Math.min(1, Math.max(0, rms / 8000));
  const idx = Math.min(BRAILLE_FRAMES.length - 1, Math.floor(norm * BRAILLE_FRAMES.length));
  return BRAILLE_FRAMES[idx];
}

/** Own animation timers for one dictation controller. */
export function createStatusDisplay(getActiveContext: () => ExtensionContext | null) {
  // Meter animation
  let meter: number[] = new Array(METER_CELLS).fill(0);
  let currentLevel = 0;
  let meterTimer: NodeJS.Timeout | null = null;

  // Spinner animation
  let spinnerFrame = 0;
  let spinnerTimer: NodeJS.Timeout | null = null;

  const setStatus = (msg: string | undefined) => {
    const activeCtx = getActiveContext();
    if (!activeCtx) return;
    activeCtx.ui.setStatus("tui-asr", msg);
  };

  const stopSpinner = () => {
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }
  };

  const stopMeter = () => {
    if (meterTimer) {
      clearInterval(meterTimer);
      meterTimer = null;
    }
  };

  /** Start braille audio level meter animation */
  const startMeter = () => {
    stopMeter();
    meter = new Array(METER_CELLS).fill(0);
    currentLevel = 0;
    const render = () => {
      const dot = getActiveContext()?.ui.theme.fg("error", "●") ?? "●";
      setStatus(`${dot} ${meter.map(rmsToBlock).join("")} listening…`);
    };
    render();
    meterTimer = setInterval(() => {
      meter.shift();
      meter.push(currentLevel);
      render();
    }, METER_TICK_MS);
  };

  /** Start finalizing spinner */
  const startSpinner = (suffix: string) => {
    stopSpinner();
    spinnerFrame = 0;
    setStatus(`${SPINNER_FRAMES[0]} ${suffix}`);
    spinnerTimer = setInterval(() => {
      spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length;
      setStatus(`${SPINNER_FRAMES[spinnerFrame]} ${suffix}`);
    }, SPINNER_INTERVAL_MS);
  };

  return {
    setStatus, startMeter, stopMeter, startSpinner, stopSpinner,
    setLevel(level: number) { currentLevel = level; },
  };
}
