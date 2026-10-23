import { existsSync } from "node:fs";
import { mkdir, open, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const DEFAULT_OUTPUT_DIR = ".pi/generated-images";

function detectExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/bmp":
      return ".bmp";
    default:
      return ".png";
  }
}

export async function saveImageAtomically(cwd: string, buffer: Buffer, mimeType: string): Promise<string> {
  const outputDir = resolve(cwd, DEFAULT_OUTPUT_DIR);
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  const date = new Date().toISOString().replace(/T/, "-").replace(/:/g, "").slice(0, 15);
  const ext = detectExtension(mimeType);

  for (let i = 1; i <= 999; i++) {
    const filename = `${date}-${String(i).padStart(3, "0")}${ext}`;
    const targetPath = join(outputDir, filename);
    try {
      const handle = await open(targetPath, "wx");
      await handle.writeFile(buffer);
      await handle.close();
      return targetPath;
    } catch (err: any) {
      if (err?.code === "EEXIST") continue;
      throw err;
    }
  }

  const fallback = join(outputDir, `${date}-${Date.now()}${ext}`);
  await writeFile(fallback, buffer);
  return fallback;
}
