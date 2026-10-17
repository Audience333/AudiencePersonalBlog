import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const AUDIO_TYPES = new Map([
  ['mp3', 'audio/mpeg'],
  ['m4a', 'audio/mp4'],
  ['aac', 'audio/aac'],
  ['flac', 'audio/flac'],
  ['ogg', 'audio/ogg'],
  ['opus', 'audio/ogg'],
  ['wav', 'audio/wav'],
]);

export interface MusicTrack {
  title: string;
  url: string;
}

export function musicDirectory(): string {
  const directory = resolve(process.env.BLOG_MUSIC_DIR || './music');
  mkdirSync(directory, { recursive: true });
  return directory;
}

function audioType(filename: string): string | undefined {
  return AUDIO_TYPES.get(filename.split('.').pop()?.toLowerCase() || '');
}

export function listMusicTracks(): MusicTrack[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(musicDirectory());
  } catch {
    return [];
  }
  return entries
    .filter((name) => audioType(name))
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
    .map((file) => ({
      title: file.replace(/\.[^.]+$/, ''),
      url: `/api/music/${encodeURIComponent(file)}`,
    }));
}

export function readMusicFile(name: string): { bytes: Buffer; type: string } | undefined {
  if (!name || name.includes('\0') || name.includes('..')) return undefined;
  const type = audioType(name);
  if (!type) return undefined;
  const directory = musicDirectory();
  const filePath = resolve(directory, name);
  if (!filePath.startsWith(directory + sep)) return undefined;
  try {
    return { bytes: readFileSync(filePath), type };
  } catch {
    return undefined;
  }
}
