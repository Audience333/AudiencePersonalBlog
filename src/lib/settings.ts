import type Database from 'better-sqlite3';
import { getDb } from './db.ts';

export interface RuntimeSettings {
  registrationOpen: boolean;
  blockedCommentKeywords: string[];
  defaultCommentsEnabled: boolean;
}

type RuntimeSettingsInput = Partial<RuntimeSettings>;

const defaults: RuntimeSettings = {
  registrationOpen: true,
  blockedCommentKeywords: [],
  defaultCommentsEnabled: true,
};

function settingsDatabase(db?: Database.Database) {
  return db ?? getDb();
}

function readJson(db: Database.Database, key: string): unknown {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return undefined;
  try {
    return JSON.parse(row.value);
  } catch {
    return undefined;
  }
}

function validKeywords(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > 100) return undefined;
  const keywords = value
    .filter((keyword): keyword is string => typeof keyword === 'string')
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0 && keyword.length <= 40);
  if (keywords.length !== value.length) return undefined;
  return [...new Set(keywords)];
}

export function getRuntimeSettings(db?: Database.Database): RuntimeSettings {
  const connection = settingsDatabase(db);
  const registrationOpen = readJson(connection, 'runtime.registration_open');
  const blockedCommentKeywords = validKeywords(readJson(connection, 'runtime.blocked_comment_keywords'));
  const defaultCommentsEnabled = readJson(connection, 'runtime.default_comments_enabled');

  return {
    registrationOpen: typeof registrationOpen === 'boolean' ? registrationOpen : defaults.registrationOpen,
    blockedCommentKeywords: blockedCommentKeywords ?? defaults.blockedCommentKeywords,
    defaultCommentsEnabled: typeof defaultCommentsEnabled === 'boolean'
      ? defaultCommentsEnabled
      : defaults.defaultCommentsEnabled,
  };
}

export function updateRuntimeSettings(input: RuntimeSettingsInput, db?: Database.Database): RuntimeSettings {
  const connection = settingsDatabase(db);
  const next = { ...getRuntimeSettings(connection), ...input };
  if (typeof next.registrationOpen !== 'boolean' || typeof next.defaultCommentsEnabled !== 'boolean') {
    throw new TypeError('布尔设置无效。');
  }
  const keywords = validKeywords(next.blockedCommentKeywords);
  if (!keywords) throw new TypeError('评论关键词设置无效。');

  const write = connection.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  connection.transaction(() => {
    write.run('runtime.registration_open', JSON.stringify(next.registrationOpen));
    write.run('runtime.blocked_comment_keywords', JSON.stringify(keywords));
    write.run('runtime.default_comments_enabled', JSON.stringify(next.defaultCommentsEnabled));
  })();

  return { ...next, blockedCommentKeywords: keywords };
}
