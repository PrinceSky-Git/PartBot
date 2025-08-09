import { toId } from '@/tools';

export const ranks = ['locked', 'muted', 'regular', 'whitelist', 'voice', 'driver', 'mod', 'bot', 'owner', 'admin'] as const;

export const owner = process.env.PS_OWNER || 'PartMan';
const _admins = process.env.PS_ADMINS?.split(/ *, */) || [];
export const admins = _admins.map(toId);
export const username = process.env.PS_USERNAME || 'PartBot';
export const password = process.env.PS_PASSWORD || 'password';
export const rooms = process.env.PS_ROOMS?.split(',') || ['botdevelopment'];
export const prefix = process.env.PREFIX || ',';
export const avatar = process.env.PS_AVATAR || 'supernerd';

export const isGlobalBot = process.env.PS_GLOBAL_BOT === 'true';
