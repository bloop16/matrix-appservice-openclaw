import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dump, load } from 'js-yaml';
import { loadConfig } from './config.js';

const CONFIG_PATH = process.env['CONFIG_PATH'] ?? 'config.yaml';
const REG_PATH = process.env['REG_PATH'] ?? 'registration.yaml';

const cfg = loadConfig(CONFIG_PATH);

interface Registration {
  id: string;
  hs_token: string;
  as_token: string;
  sender_localpart: string;
  url: string;
  namespaces: {
    users: { exclusive: boolean; regex: string }[];
    rooms: never[];
    aliases: never[];
  };
}

let existing: Partial<Registration> = {};
if (existsSync(REG_PATH)) {
  existing = load(readFileSync(REG_PATH, 'utf8')) as Partial<Registration>;
  console.log('Preserving existing tokens from', REG_PATH);
}

const reg: Registration = {
  id: 'matrix-appservice-openclaw',
  hs_token: existing.hs_token ?? randomBytes(32).toString('hex'),
  as_token: existing.as_token ?? randomBytes(32).toString('hex'),
  sender_localpart: 'openclaw-bot',
  url: `http://${cfg.appservice.bindAddress}:${cfg.appservice.port}`,
  namespaces: {
    users: [
      {
        exclusive: true,
        regex: `^@openclaw-[^:]+:${cfg.homeserver.domain.replace(/\./g, '\\.')}$`,
      },
    ],
    rooms: [],
    aliases: [],
  },
};

writeFileSync(REG_PATH, dump(reg), 'utf8');
console.log('Written:', REG_PATH);
