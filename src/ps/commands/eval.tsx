import { MAX_CHAT_HTML_LENGTH } from '@/ps/constants';
import { evaluate } from '@/utils/eval';

import type { PSCommand } from '@/types/chat';

export const command: PSCommand = {
	name: 'eval',
	help: 'Evaluates code',
	syntax: 'CMD [code]',
	flags: { allowPMs: true },
	perms: 'admin',
	aliases: ['exec', 'run'],
	categories: ['utility'],
	async run(context) {
		const {
			message,
			arg,
			originalCommand: [originalCommand],
			$T,
		} = context;
		const res = await evaluate(arg, originalCommand === 'exec' ? 'ABBR_OUTPUT' : 'COLOR_OUTPUT_HTML', { message, context });
		if (originalCommand !== 'exec') {
			let outputHTML = res.output;
			if (outputHTML.length > MAX_CHAT_HTML_LENGTH) {
				const trimmedOutput = res.output.split(/(?<=<\/span>)|(?=<span)/);
				let currentLength = outputHTML.length;
				while (currentLength > MAX_CHAT_HTML_LENGTH) {
					currentLength -= trimmedOutput.at(-1)!.length;
					trimmedOutput.pop();
				}
				outputHTML = `${trimmedOutput.join('')} ...`;
			}
			const WrappedHTML = (
				<div
					style={{ overflow: 'auto', maxHeight: '40vh', marginTop: originalCommand === 'eval' ? 20 : undefined }}
					dangerouslySetInnerHTML={{ __html: outputHTML }}
				/>
			);
			if (originalCommand === 'eval') message.replyHTML(WrappedHTML);
			else if (originalCommand === 'run') message.sendHTML(WrappedHTML);
		} else return message.reply(res.success ? $T('COMMANDS.EVAL.SUCCESS') : $T('COMMANDS.EVAL.ERROR', { error: res.output }));
	},
};
