import type { Language } from '@/i18n';
import type { Perms } from '@/types/perms';
import type { Message } from 'ps-client';

export type PSMessage = Message;

export type AuthKey = Perms & string;

export type PSPointsType = {
	// Used for referring from anywhere in the code
	id: string;
	// Shown when adding/removing exactly one point
	singular: string;
	// Shown as the 'human' name for points
	plural: string;
	// Used for the abbreviation in the leaderboard table
	symbol: string;
	// Only helps when adding points, for end users
	aliases?: string[];
};

export type PSRoomConfig = {
	roomId: string;
	roomName?: string;
	auth?: { [key in AuthKey]?: string[] } | null;
	tour?: {
		timer?: [autoStart: number, autoDQ: number] | null;
	} | null;
	whitelist?: string[] | null;
	blacklist?: string[] | null;
	aliases?: string[] | null;
	private?: true | null;
	ignore?: true | null;
	// You can put both commands (eg: `quote.add`) or group perms (eg: `games.create`) here.
	permissions?: {
		[key: string]: Perms;
	} | null;
	language?: Language;
	points?: {
		types: Record<string, PSPointsType>;
		priority: string[];
		format: string;
	} | null;
	_assign?: {
		[key: string]: unknown;
	} | null;
};
