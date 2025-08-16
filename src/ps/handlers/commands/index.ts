import { PSRoomConfigs } from '@/cache';
import { prefix } from '@/config/ps';
import { LanguageMap, i18n } from '@/i18n';
import { getLanguage } from '@/i18n/language';
import { LivePSStuff } from '@/sentinel/live';
import { ChatError } from '@/utils/chatError';
import { Logger } from '@/utils/logger';

import type { PSCommandContext } from '@/types/chat';
import type { PSMessage } from '@/types/ps';

type IndirectCtx =
	| {
			type: 'run';
			command: string;
			ctx: Partial<PSCommandContext>;
			bypassPerms?: boolean;
			calledFrom: {
				command: string[];
				message: PSMessage;
			};
	  }
	| {
			type: 'spoof';
			message: PSMessage;
	  };

export async function commandHandler(message: PSMessage, indirect: IndirectCtx | null = null): Promise<unknown> {
	if (message.isIntro || !message.author?.userid || !message.target) return;
	if (message.author.userid === message.parent.status.userid) return; // Botception!

	const messageContent = indirect?.type === 'run' ? indirect.command : message.content;

	if (!messageContent.startsWith(prefix)) return;

	const { parse, permissions, spoof } = LivePSStuff.commands;

	try {
		const usePermissions: typeof permissions = (...args) => {
			const [perm] = args;
			if (perm === 'admin') return permissions(...args); // Don't bypass for admin stuff. Just in case.
			if (indirect?.type === 'run' && indirect.bypassPerms) return true;
			return permissions(...args);
		};

		const argData = messageContent.substring(prefix.length);
		let language = getLanguage(message.target);
		if (language && !LanguageMap[language]) {
			language = undefined;
			message.privateReply(`Could not find translations for ${language}.`);
		}
		const $T = i18n(language); // TODO: Allow overriding translations
		// Check if this is a spoof message. If so, spoof and pass to the room.
		// Will only trigger commands with `flags.routePMs` enabled.
		if (!indirect && argData.startsWith('@')) {
			const mockMessage = spoof(argData.slice(1), message, $T);
			return commandHandler(mockMessage, { type: 'spoof', message: message });
		}

		let commandObj, sourceCommand, cascade, parsedCtx;
		const baseArgs = argData.split(/ +/);
		const baseSpacedArgs = argData.split(/( +)/);
		try {
			({ command: commandObj, sourceCommand, cascade, context: parsedCtx } = parse(baseArgs, baseSpacedArgs, $T));
		} catch (originalError) {
			try {
				// Custom 'commands' with `,add*`. Try parsing `,addpoints abc def` as `,add points, abc, def`.
				if (!argData.startsWith('add')) throw new ChatError($T('CMD_NOT_FOUND'));
				const pointsType = baseSpacedArgs.shift()!.toLowerCase().replace(/^add/, '');
				const newArgData = `add ${pointsType}, ${baseSpacedArgs.join('')}`;
				const args = newArgData.split(/ +/);
				const spacedArgs = newArgData.split(/( +)/);
				({ command: commandObj, sourceCommand, cascade, context: parsedCtx } = parse(args, spacedArgs, $T));
			} catch (err) {
				if (err instanceof ChatError) throw originalError;
				throw err;
			}
		}

		const context = {
			...parsedCtx,
			...(indirect?.type === 'run'
				? { calledFrom: indirect.calledFrom.command, calledFromMsg: indirect.calledFrom.message, ...indirect.ctx }
				: {}),
		};

		const conceal = sourceCommand.flags?.conceal ? $T('CMD_NOT_FOUND') : null;
		if (!usePermissions(cascade.perms, context.command, message)) {
			throw new ChatError(conceal ?? $T('ACCESS_DENIED'));
		}
		if (message.type === 'chat') {
			const roomConfig = PSRoomConfigs[message.target.id];
			const lookup = context.command.join('.');
			const isWhitelisted =
				roomConfig?.whitelist &&
				(roomConfig.whitelist?.includes(lookup) ||
					sourceCommand.categories.some(category => roomConfig.whitelist!.includes(`cat:${category}`)));
			if (roomConfig?.blacklist?.includes(lookup) && !isWhitelisted) {
				throw new ChatError($T('BLACKLISTED_COMMAND', { room: message.target.title }));
			}
			const blacklistedCategories = roomConfig?.blacklist
				? sourceCommand.categories.filter(category => roomConfig.blacklist!.includes(`cat:${category}`))
				: [];
			if (blacklistedCategories.length > 0 && !isWhitelisted) {
				throw new ChatError($T('BLACKLISTED_CATEGORIES', { room: message.target.title, categories: blacklistedCategories.list($T) }));
			}
		}
		if (!cascade.flags.routePMs && indirect?.type === 'spoof') {
			throw new ChatError(conceal ?? $T('NO_DMS_COMMAND'));
		}
		if (!cascade.flags.allowPMs && !cascade.flags.pmOnly && message.type !== 'chat') {
			throw new ChatError(conceal ?? $T('ROOM_ONLY_COMMAND'));
		}
		if (cascade.flags.pmOnly && message.type !== 'pm') {
			throw new ChatError(conceal ?? $T('PM_ONLY_COMMAND'));
		}

		context.checkPermissions = function (perm) {
			return usePermissions(perm, context.command, message);
		};

		context.broadcast = function (msg, perm = 'whitelist') {
			if (usePermissions(perm, null, message)) return message.reply(msg);
			else return message.privateReply(msg);
		};
		context.broadcastHTML = function (html, opts = {}) {
			const { perm = 'whitelist' } = opts;
			if (message.type === 'pm') return message.replyHTML(html, opts);
			if (usePermissions(perm, null, message)) return message.sendHTML(html, opts);
			else return message.target.privateHTML(message.author, html, opts);
		};

		const calledFrom = { command: context.command, message };
		// TODO: Support overriding messages
		context.run = function (command: string, ctx: Partial<PSCommandContext> = {}) {
			return commandHandler(message, { type: 'run', command: `${prefix}${command}`, calledFrom, ctx });
		};
		context.unsafeRun = function (command: string, ctx: Partial<PSCommandContext> = {}) {
			return commandHandler(message, { type: 'run', command: `${prefix}${command}`, bypassPerms: true, calledFrom, ctx });
		};

		return await commandObj.run({ ...context, message });
	} catch (err) {
		if (err instanceof Error) {
			// TODO: Ping the user in case they're in another room! (Eg: for spoof messages)
			message.privateReply(err.message as string);
			if (err.name !== 'ChatError') {
				Logger.errorLog(new Error(message.raw, { cause: err }));
				Logger.errorLog(err);
			}
		} else {
			Logger.log('A command threw a non-error value.', err);
			Logger.errorLog(new Error('A command threw a non-error value.'));
		}
		return null;
	}
}
