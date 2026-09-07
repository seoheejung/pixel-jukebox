import type { DesignSettings } from '../shared/settings';
import type { PlayerSnapshot } from '../shared/track';

const WIDTH = 320;
const HEIGHT = 400;

function loadArtwork(url: string): Promise<HTMLImageElement | undefined> {
  if (!url) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(undefined);
    image.src = url;
  });
}

function drawText(context: CanvasRenderingContext2D, value: string, x: number, y: number, max: number) {
  const text = value.length > max ? `${value.slice(0, max - 1)}…` : value;
  context.fillText(text, x, y);
}

export async function renderPlayerCanvas(snapshot: PlayerSnapshot, settings: DesignSettings, angle = 0, artworkOverride?: HTMLImageElement): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('CANVAS_UNAVAILABLE');
  const track = snapshot.track;
  const artwork = artworkOverride ?? (settings.artwork && track ? await loadArtwork(track.thumbnail) : undefined);

  context.fillStyle = settings.background;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = settings.panel;
  context.fillRect(16, 16, WIDTH - 32, HEIGHT - 32);
  context.strokeStyle = settings.text;
  context.lineWidth = 4;
  context.strokeRect(16, 16, WIDTH - 32, HEIGHT - 32);

  context.save();
  context.translate(WIDTH / 2, 135);
  context.rotate(angle);
  context.fillStyle = settings.discStyle === 'cd' ? '#d8d6e5' : '#28172f';
  context.beginPath();
  context.arc(0, 0, 92, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#4b3b50';
  context.lineWidth = 4;
  for (const radius of [76, 61, 46]) {
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.stroke();
  }
  context.fillStyle = settings.accent;
  context.beginPath();
  context.arc(0, 0, 32, 0, Math.PI * 2);
  context.fill();
  if (artwork) {
    context.save();
    context.beginPath();
    context.arc(0, 0, 30, 0, Math.PI * 2);
    context.clip();
    context.drawImage(artwork, -30, -30, 60, 60);
    context.restore();
  }
  context.fillStyle = settings.panel;
  context.beginPath();
  context.arc(0, 0, 5, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.fillStyle = settings.text;
  context.font = '700 12px monospace';
  drawText(context, 'NOW PLAYING', 32, 255, 28);
  context.font = '700 18px monospace';
  drawText(context, track?.videoTitle ?? 'No YouTube track', 32, 286, 25);
  context.font = '12px monospace';
  drawText(context, track?.channelTitle ?? 'Connect a YouTube tab', 32, 315, 35);
  context.fillStyle = settings.accent;
  context.fillRect(32, 342, 256, 4);
  return canvas;
}

export function canvasBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/gif'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('EXPORT_FAILED')), type);
  });
}

function paletteIndex(red: number, green: number, blue: number): number {
  return Math.round(red / 255 * 5) * 36 + Math.round(green / 255 * 5) * 6 + Math.round(blue / 255 * 5);
}

function framePixels(canvas: HTMLCanvasElement): Uint8Array {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('CANVAS_UNAVAILABLE');
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixels = new Uint8Array(canvas.width * canvas.height);
  for (let index = 0, pixel = 0; pixel < pixels.length; pixel++, index += 4) {
    pixels[pixel] = paletteIndex(data[index]!, data[index + 1]!, data[index + 2]!);
  }
  return pixels;
}

function bytes(values: number[]): Uint8Array { return Uint8Array.from(values); }

function littleEndian(value: number): number[] { return [value & 0xff, (value >> 8) & 0xff]; }

function lzwLiteralStream(pixels: Uint8Array): Uint8Array {
  const codes: number[] = [];
  for (const pixel of pixels) codes.push(256, pixel);
  codes.push(257);
  const output: number[] = [];
  let current = 0;
  let bits = 0;
  for (const code of codes) {
    current |= code << bits;
    bits += 9;
    while (bits >= 8) {
      output.push(current & 0xff);
      current >>>= 8;
      bits -= 8;
    }
  }
  if (bits > 0) output.push(current & 0xff);
  return Uint8Array.from(output);
}

function subBlocks(data: Uint8Array): number[] {
  const result: number[] = [];
  for (let offset = 0; offset < data.length; offset += 255) {
    const part = data.subarray(offset, Math.min(offset + 255, data.length));
    result.push(part.length, ...part);
  }
  result.push(0);
  return result;
}

function append(output: number[], values: Iterable<number>) {
  for (const value of values) output.push(value);
}

function gifPalette(): number[] {
  const palette: number[] = [];
  for (let red = 0; red < 6; red++) for (let green = 0; green < 6; green++) for (let blue = 0; blue < 6; blue++) {
    palette.push(Math.round(red * 255 / 5), Math.round(green * 255 / 5), Math.round(blue * 255 / 5));
  }
  while (palette.length < 768) palette.push(0);
  return palette;
}

export function createGifBlob(frames: HTMLCanvasElement[], delay = 8): Blob {
  if (frames.length === 0) throw new Error('EXPORT_FAILED');
  const width = frames[0]!.width;
  const height = frames[0]!.height;
  const output: number[] = [...new TextEncoder().encode('GIF89a'), ...littleEndian(width), ...littleEndian(height), 0xf7, 0, 0, ...gifPalette()];
  output.push(0x21, 0xff, 0x0b, ...new TextEncoder().encode('NETSCAPE2.0'), 0x03, 0x01, 0, 0, 0);
  for (const frame of frames) {
    output.push(0x21, 0xf9, 0x04, 0x00, delay & 0xff, (delay >> 8) & 0xff, 0x00, 0x00);
    output.push(0x2c, 0, 0, 0, 0, ...littleEndian(width), ...littleEndian(height), 0x00, 0x08);
    append(output, subBlocks(lzwLiteralStream(framePixels(frame))));
  }
  output.push(0x3b);
  const data = bytes(output);
  return new Blob([data.buffer as ArrayBuffer], { type: 'image/gif' });
}

export async function exportGif(snapshot: PlayerSnapshot, settings: DesignSettings): Promise<Blob> {
  const artwork = settings.artwork && snapshot.track ? await loadArtwork(snapshot.track.thumbnail) : undefined;
  const frame = await renderPlayerCanvas(snapshot, settings, 0, artwork);
  return createGifBlob([frame]);
}

export function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}
