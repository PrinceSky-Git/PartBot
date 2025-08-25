import { toHumanTime } from '@/utils/humanTime';

import type { PSCommand } from '@/types/chat';

export const command: PSCommand = {
	name: 'uptime',
	help: 'Displays the current uptime.',
	syntax: 'CMD',
	flags: { allowPMs: true },
	categories: ['utility'],
	async run({ broadcast, $T }) {
		return broadcast($T('COMMANDS.UPTIME', { time: toHumanTime(process.uptime() * 1000, undefined, $T) }));
	},
};
