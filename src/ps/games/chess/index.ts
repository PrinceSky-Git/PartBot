import { Chess as ChessLib } from 'chess.js';
import { EmbedBuilder } from 'discord.js';

import { render } from '@/ps/games/chess/render';
import { BaseGame } from '@/ps/games/game';
import { pick } from '@/utils/pick';

import type { TranslatedText } from '@/i18n/types';
import type { Log } from '@/ps/games/chess/logs';
import type { RenderCtx, State, ThemeColours, Turn, WinCtx } from '@/ps/games/chess/types';
import type { BaseContext } from '@/ps/games/game';
import type { ActionResponse, EndType, Meta, Theme } from '@/ps/games/types';
import type { Move, Square } from 'chess.js';
import type { User } from 'ps-client';

export { meta } from '@/ps/games/chess/meta';

function isValidSquare(input: string): input is Square {
	return /^[a-h][1-9]$/.test(input);
}

export class Chess extends BaseGame<State> {
	selected: Square | null = null;
	showMoves: Move[] = [];
	drawOffered: null | string = null;

	lib: ChessLib;

	log: Log[] = [];
	declare winCtx?: WinCtx | { type: EndType };
	cache: Record<string, Record<Turn, number>> = {};
	lichessURL: string | null = null;

	declare meta: Omit<Meta, 'themes'> & { themes: Record<string, Theme<ThemeColours>>; defaultTheme: string };

	constructor(ctx: BaseContext) {
		super(ctx);
		super.persist(ctx);

		this.lib = new ChessLib();
		if (ctx.backup) {
			this.lib.loadPgn(this.state.pgn);
		}

		this.lib.setHeader('Event', `Room Match ${this.id}`);
		this.lib.setHeader('Site', `https://play.pokemonshowdown.com/${this.roomid}`);
	}

	onStart(): ActionResponse {
		this.lib.setHeader('Date', new Date().toDateString());
		this.lib.setHeader('White', this.players.W.name);
		this.lib.setHeader('Black', this.players.B.name);

		return { success: true, data: null };
	}

	action(user: User, ctx: string): void {
		if (!this.started) this.throw('GAME.NOT_STARTED');
		if (user.id !== this.players[this.turn!].id) this.throw('GAME.IMPOSTOR_ALERT');
		const [actionType, action] = ctx.lazySplit(' ', 1);
		// TODO: Support offering draws
		switch (actionType) {
			case 'select': {
				this.getMoves(action);
				break;
			}
			case 'move': {
				let move: string | { from: string; to: string; promotion?: string } = action;
				try {
					if (action.includes(',')) {
						const [from, to, promotion] = action.split(',');
						move = { from, to, promotion };
					}
				} catch {
					this.throw();
				}
				this.play(move);
				break;
			}
			default:
				this.throw();
		}
	}

	getMoves(spot: string) {
		if (!isValidSquare(spot)) this.throw();
		if (this.selected === spot) {
			this.selected = null;
			this.showMoves = [];
		} else {
			this.selected = spot;
			this.showMoves = this.lib.moves({ square: spot, verbose: true });
		}
		this.update(this.players[this.turn!].id);
	}

	play(move: string | { from: string; to: string; promotion?: string }): void {
		try {
			const res = this.lib.move(move);
			this.log.push({
				action: 'play',
				time: new Date(),
				ctx: pick(res, 'from', 'to', 'promotion', 'san') as Log['ctx'],
				turn: this.turn!,
			});
		} catch {
			this.throw();
		}

		if (this.lib.isGameOver()) return this.end();

		this.cleanup();
		this.state.pgn = this.lib.pgn();

		this.endTurn();
	}

	// Cleans up stuff like selections and draw offers
	cleanup() {
		this.selected = null;
		this.showMoves = [];
		this.drawOffered = null;
	}

	onReplacePlayer(turn: Turn, withPlayer: User): ActionResponse<null> {
		this.cleanup();
		this.lib.setHeader(turn === 'W' ? 'White' : 'Black', withPlayer.name);
		return { success: true, data: null };
	}

	onEnd(type?: EndType): TranslatedText {
		if (type) {
			this.winCtx = { type };
			if (type === 'dq') return this.$T('GAME.ENDED_AUTOMATICALLY', { game: this.meta.name, id: this.id });
			return this.$T('GAME.ENDED', { game: this.meta.name, id: this.id });
		}
		if (this.lib.isDraw()) {
			this.winCtx = { type: 'draw' };
			return this.$T('GAME.DRAW', { players: [this.players.W.name, this.players.B.name].list(this.$T) });
		}
		if (this.lib.isCheckmate()) {
			const winner = this.players[this.turn!];
			const loser = this.players[this.getNext(this.turn)];
			this.winCtx = { type: 'win', winner, loser };

			return this.$T('GAME.WON_AGAINST', { winner: winner.name, game: this.meta.name, loser: loser.name, ctx: '' });
		}
		this.throw();
	}

	async getURL(): Promise<string | null> {
		if (this.lichessURL) return this.lichessURL;

		this.lichessURL = await fetch('https://lichess.org/api/import', {
			method: 'POST',
			body: JSON.stringify({ pgn: this.state.pgn }),
			headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		})
			.then(res => res.json())
			.then(res => (res as { url: string }).url);

		return this.lichessURL;
	}

	async renderEmbed(): Promise<EmbedBuilder> {
		return new EmbedBuilder()
			.setColor('#9c5624')
			.setAuthor({
				name: 'Chess - Room Match',
				iconURL: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Chess_tile_kl.svg/1200px-Chess_tile_kl.svg.png',
			})
			.setTitle(`${this.players.W.name} vs ${this.players.B.name}`)
			.setURL(await this.getURL());
	}

	render(side: Turn | null) {
		const ctx: RenderCtx = {
			board: this.lib.board(),
			showMoves: side === this.turn ? this.showMoves : [],
			selected: side === this.turn ? this.selected : null,
			isActive: side === this.turn,
			lastMove: this.lib.history({ verbose: true }).at(-1) ?? null,
			side,
			id: this.id,
			turn: this.turn!,
			theme: this.meta.themes[this.theme!].colors,
			small: false,
		};
		if (this.winCtx) {
			ctx.header = this.$T('GAME.GAME_ENDED');
			if (side === null) ctx.small = true; // chatroom
		} else if (side === this.turn) {
			ctx.header = this.$T('GAME.YOUR_TURN');
			if (this.selected) {
				const selectedPiece = this.lib.get(this.selected);
				const seventhRanks = { w: 7, b: 2 };
				if (selectedPiece?.type === 'p' && seventhRanks[selectedPiece.color] === +this.selected.charAt(1)) ctx.promotion = true;
			}
		} else if (side) {
			ctx.header = this.$T('GAME.WAITING_FOR_OPPONENT');
			ctx.dimHeader = true;
		} else if (this.turn) {
			const current = this.players[this.turn];
			ctx.header = this.$T('GAME.WAITING_FOR_PLAYER', { player: `${current.name}${this.sides ? ` (${this.turn})` : ''}` });
		}
		return render.bind(this.renderCtx)(ctx);
	}
}
