import { promises as fs } from 'fs';

import { IS_ENABLED } from '@/enabled';
import { Games } from '@/ps/games';
import { reloadCommands } from '@/ps/loaders/commands';
import { LivePSHandlers, LivePSStuff } from '@/sentinel/live';
import { cachebust } from '@/utils/cachebust';
import { fsPath } from '@/utils/fsPath';

import type { GamesList, Meta } from '@/ps/games/types';
import type { Register } from '@/sentinel/types';

const PS_EVENT_HANDLERS = {
	autoreshandler: { imports: ['autoResHandler'], importPath: '@/ps/handlers/autores', fileName: 'autores' },
	interfacehandler: { imports: ['interfaceHandler'], importPath: '@/ps/handlers/interface', fileName: 'interface' },
	joinshandler: { imports: ['joinHandler', 'leaveHandler', 'nickHandler'], importPath: '@/ps/handlers/joins', fileName: 'joins' },
	rawhandler: { imports: ['rawHandler'], importPath: '@/ps/handlers/raw', fileName: 'raw' },
	notifyhandler: { imports: ['notifyHandler'], importPath: '@/ps/handlers/notifications', fileName: 'notifications' },
	tourhandler: { imports: ['tourHandler'], importPath: '@/ps/handlers/tours', fileName: 'tours' },
} satisfies Record<
	string,
	{ imports: (keyof typeof LivePSHandlers)[]; importPath: string; fileName: string /* TODO: remove fileName */ }
>;

export const PS_REGISTERS: Register[] = IS_ENABLED.PS
	? [
			{
				label: 'commands',
				pattern: /\/ps\/commands\//,
				reload: async filepaths => {
					filepaths.forEach(cachebust);
					return reloadCommands();
				},
			},

			{
				label: 'games',
				pattern: /\/ps\/games\//,
				reload: async () => {
					['types', 'game', 'index', 'render'].forEach(file => cachebust(`@/ps/games/${file}`));
					const games = await fs.readdir(fsPath('ps', 'games'), { withFileTypes: true });
					await Promise.all(
						games
							.filter(game => game.isDirectory())
							.map(async game => {
								const gameDir = game.name as GamesList;
								const files = await fs.readdir(fsPath('ps', 'games', gameDir));
								files.forEach(file => cachebust(fsPath('ps', 'games', gameDir, file)));

								const gameImport = await import(`@/ps/games/${gameDir}`);
								const { meta }: { meta: Meta } = gameImport;
								const { [meta.name.replaceAll(' ', '')]: instance } = gameImport;

								Games[gameDir] = { meta, instance };
							})
					);

					const gameCommands = await fs.readdir(fsPath('ps', 'commands', 'games'));
					gameCommands.forEach(commandFile => cachebust(fsPath('ps', 'commands', 'games', commandFile)));
					await reloadCommands();
				},
			},

			{
				label: 'commands-handler',
				pattern: /\/ps\/handlers\/commands/,
				reload: async () => {
					await Promise.all(
						(<const>['parse', 'permissions', 'spoof']).map(async file => {
							const importPath = `@/ps/handlers/commands/${file}`;
							cachebust(importPath);
							const hotHandler = await import(importPath);
							LivePSStuff.commands[file] = hotHandler[file];
						})
					);

					cachebust('@/ps/handlers/commands/customPerms');
					const { GROUPED_PERMS: newGroupedPerms } = await import('@/ps/handlers/commands/customPerms');
					LivePSStuff.commands.GROUPED_PERMS = newGroupedPerms;

					cachebust('@/ps/handlers/commands');
					const { commandHandler } = await import('@/ps/handlers/commands');
					LivePSHandlers.commandHandler = commandHandler;
				},
			},

			// other, generic event handlers
			...Object.entries(PS_EVENT_HANDLERS).map(([label, handlerData]) => ({
				label,
				pattern: new RegExp(`\\/ps\\/handlers\\/${handlerData.fileName}`),
				reload: async () => {
					cachebust(handlerData.importPath);
					const hotHandler = await import(handlerData.importPath);
					handlerData.imports.forEach(namedImport => (LivePSHandlers[namedImport] = hotHandler[namedImport]));
				},
			})),
		]
	: [];
