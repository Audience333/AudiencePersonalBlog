import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const imageTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

function uploadDirectory(): string {
  const directory = resolve(process.env.BLOG_UPLOAD_DIR || './data/uploads');
  mkdirSync(directory, { recursive: true });
  return directory;
}

function isRecognizedImage(bytes: Uint8Array, type: string): boolean {
  if (type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  if (type === 'image/gif') return bytes.length >= 6 && (new TextDecoder().decode(bytes.slice(0, 6)) === 'GIF87a' || new TextDecoder().decode(bytes.slice(0, 6)) === 'GIF89a');
  if (type === 'image/webp') return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  return false;
}

export async function saveProjectCover(file: File): Promise<string> {
  const extension = imageTypes.get(file.type);
  if (!extension || file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new Error('invalid-image');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isRecognizedImage(bytes, file.type)) throw new Error('invalid-image');
  const filename = `${randomUUID()}.${extension}`;
  writeFileSync(resolve(uploadDirectory(), filename), bytes, { flag: 'wx' });
  return `/api/uploads/${filename}`;
}

export const saveContentImage = saveProjectCover;

export function coverFilename(url: string): string | undefined {
  const match = url.match(/^\/api\/uploads\/([a-f0-9-]{36}\.(?:jpg|png|webp|gif))$/);
  return match?.[1];
}

export const contentImageFilename = coverFilename;

export function readProjectCover(filename: string): { bytes: Buffer; type: string } | undefined {
  if (!/^[a-f0-9-]{36}\.(?:jpg|png|webp|gif)$/.test(filename)) return undefined;
  const extension = filename.split('.').pop();
  const type = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
  try {
    return { bytes: readFileSync(resolve(uploadDirectory(), filename)), type };
  } catch {
    return undefined;
  }
}

export const MAX_PROJECT_IMAGE_BYTES = MAX_IMAGE_BYTES;
