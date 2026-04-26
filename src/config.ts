import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import { z } from 'zod';

const ConfigSchema = z.object({
  homeserver: z.object({
    url: z.string().url(),
    domain: z.string().min(1),
  }),
  openclaw: z.object({
    url: z.string().url(),
    token: z.string().min(1),
    agentSyncIntervalMinutes: z.number().int().positive().default(10),
    streamTimeoutSeconds: z.number().int().positive().default(60),
    maxHistoryMessages: z.number().int().positive().default(50),
  }),
  appservice: z.object({
    port: z.number().int().positive().default(9993),
    bindAddress: z.string().default('127.0.0.1'),
    controlRoomAlias: z.string().default('openclaw-control'),
  }),
  database: z.object({
    url: z.string().min(1),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(path: string): Config {
  let raw: unknown;
  try {
    raw = load(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(
      `Failed to read config file "${path}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid config at "${path}": ${result.error.message}`);
  }
  return result.data;
}
