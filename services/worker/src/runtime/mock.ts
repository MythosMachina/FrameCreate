import fs from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";

export async function generateMockImage({
  width,
  height,
  outputPath,
  seed
}: {
  width: number;
  height: number;
  outputPath: string;
  seed: number;
}) {
  const png = new PNG({ width, height });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (width * y + x) << 2;
      const r = Math.round((x / width) * 213);
      const g = Math.round((y / height) * 140);
      const b = 24 + (seed % 128);
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }

  const buffer = PNG.sync.write(png);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buffer);
  return outputPath;
}
