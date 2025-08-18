import { SHIP_DATA, Ships } from '@/ps/games/battleship/constants';
import { render, renderMove, renderSelection, renderSummary } from '@/ps/games/battleship/render';
import { type BaseContext, BaseGame } from '@/ps/games/game';
import { createGrid } from '@/ps/games/utils';
import { ChatError } from '@/utils/chatError';
import { type Point, parsePointA1, pointToA1, rangePoints, sameRowOrCol, taxicab } from '@/utils/grid';

import type { ToTranslate, TranslatedText } from '@/i18n/types';
import type { ShipType } from '@/ps/games/battleship/constants';
import type { Log } from '@/ps/games/battleship/logs';
import type { RenderCtx, SelectionInProgressState, ShipBoard, State, Turn, WinCtx } from '@/ps/games/battleship/types';
import type { ActionResponse, EndType, Player } from '@/ps/games/types';
import type { User } from 'ps-client';
import type { ReactElement } from 'react';

export { meta } from '@/ps/games/battleship/meta';

const HITS_TO_WIN = Ships.map(ship => ship.size).sum();

export class Battleship extends BaseGame<State> {
	declare winCtx?: WinCtx | { type: EndType };
	constructor(ctx: BaseContext) {
		super(ctx);
		super.persist(ctx);

		if (ctx.backup) return;
		this.state.ready = { A: false, B: false };
		this.state.allReady = false;
		this.state.board = {
			ships: { A: createGrid(10, 10, () => null), B: createGrid(10, 10, () => null) },
			attacks: { A: createGrid(10, 10, () => null), B: createGrid(10, 10, () => null) },
		};
	}

	onAfterAddPlayer(player: Player): void {
		this.update(player.id);
	}
	onAfterReplacePlayer(newPlayer: Player): ActionResponse {
		this.update(newPlayer.id);
		return { success: true, data: null };
	}

	onStart(): ActionResponse {
		this.turns.shuffle(this.prng);
		return { success: true, data: null };
	}
	onAfterStart() {
		this.clearTimer();
	}

	action(user: User, input: string) {
		const [action, ctx] = input.lazySplit(' ', 1);
		const player = this.getPlayer(user)! as Player & { turn: Turn };
		switch (action) {
			case 'set': {
				if (this.state.ready[player.turn] === true) throw new ChatError("Hi you've already set your ships!" as ToTranslate);
				const set = ctx.split('|').map(coords => coords.split('-').map(parsePointA1));
				const input = set.flatMap(row => row.map(point => (point ? pointToA1(point) : '')));
				try {
					this.state.ready[player.turn] = { ...this.validateShipPositions(set), input };
				} catch (err) {
					if (err instanceof ChatError) {
						this.state.ready[player.turn] = { type: 'invalid', input, message: err.message };
						this.update(player.id);
					} else throw err;
				}
				this.update(player.id);
				this.backup();
				break;
			}
			case 'confirm-set': {
				const currentSet = this.state.ready[player.turn];
				if (currentSet === true) throw new ChatError("Hi you've already set your ships!" as ToTranslate);
				if (!currentSet || currentSet?.type === 'invalid') throw new ChatError('Set your ships first -_-' as ToTranslate);
				this.state.board.ships[player.turn] = currentSet.board;
				this.state.ready[player.turn] = true;
				const logEntry: Log = { action: 'set', ctx: currentSet.input, time: new Date(), turn: player.turn };
				this.log.push(logEntry);
				this.room.sendHTML(...renderMove(logEntry, this));
				if (this.state.ready.A === true && this.state.ready.B === true) {
					this.state.allReady = true;
					this.endTurn();
				} else {
					this.update(player.id);
				}
				this.backup();
				break;
			}
			case 'hit': {
				if (!this.state.allReady) this.throw('GAME.NOT_STARTED');
				const targeted = parsePointA1(ctx);
				if (!targeted) this.throw();
				const [x, y] = targeted;
				if (player.turn !== this.turn) this.throw();
				const opponent = this.getNext();
				let hit: ShipType | false | null;
				try {
					hit = this.state.board.ships[opponent].access([x, y]) ?? false;
				} catch {
					throw new ChatError('Invalid range given.' as ToTranslate);
				}
				this.state.board.attacks[player.turn][x][y] = hit;

				const point = pointToA1([x, y]);
				const logEntry: Log = {
					...(hit
						? {
								action: 'hit',
								ctx: { ship: SHIP_DATA[hit].name, point },
							}
						: {
								action: 'miss',
								ctx: { point },
							}),
					time: new Date(),
					turn: player.turn,
				};
				this.log.push(logEntry);
				this.room.sendHTML(...renderMove(logEntry, this));
				if (this.state.board.attacks[player.turn].flat().filter(hit => hit).length >= HITS_TO_WIN) {
					// Game ends
					this.winCtx = { type: 'win', winner: player, loser: this.players[opponent] };
					return this.end();
				}
				this.endTurn();
				this.update();
				break;
			}
			default:
				this.throw();
		}
	}

	onEnd(type?: EndType): TranslatedText {
		if (type) {
			this.winCtx = { type };
			if (type === 'dq') return this.$T('GAME.ENDED_AUTOMATICALLY', { game: this.meta.name, id: this.id });
			return this.$T('GAME.ENDED', { game: this.meta.name, id: this.id });
		}
		if (this.winCtx && this.winCtx.type === 'win')
			return this.$T('GAME.WON_AGAINST', {
				winner: this.winCtx.winner.name,
				game: this.meta.name,
				loser: this.winCtx.loser.name,
				ctx: '',
			});
		throw new Error(`winCtx not defined for BS - ${JSON.stringify(this.winCtx)}`);
	}

	render(side: Turn | null): ReactElement {
		if (side) {
			const readyState = this.state.ready[side];
			if (readyState === false) return renderSelection.bind(this.renderCtx)();
			if (readyState && typeof readyState !== 'boolean') return renderSelection.bind(this.renderCtx)(readyState);
			if (!this.state.allReady)
				return renderSelection.bind(this.renderCtx)({ type: 'valid', board: this.state.board.ships[side], input: [] }, true);
		}

		let ctx: RenderCtx;
		if (side) {
			ctx = {
				type: 'player',
				id: this.id,
				attack: this.state.board.attacks[side],
				defense: this.state.board.attacks[this.getNext(side)],
				actual: this.state.board.ships[side],
				active: side === this.turn,
			};
		} else {
			ctx = {
				type: 'spectator',
				id: this.id,
				boards: this.state.board.attacks,
				players: this.players,
			};
		}

		if (this.winCtx) {
			return renderSummary.bind(this.renderCtx)({
				boards: this.state.board,
				players: this.players,
				winCtx: this.winCtx,
			});
		} else if (side === this.turn) {
			ctx.header = this.$T('GAME.YOUR_TURN');
		} else if (side) {
			ctx.header = this.$T('GAME.WAITING_FOR_OPPONENT');
			ctx.dimHeader = true;
		} else if (this.turn) {
			const current = this.players[this.turn];
			ctx.header = this.$T('GAME.WAITING_FOR_PLAYER', { player: current.name });
		}

		return render.bind(this.renderCtx)(ctx as RenderCtx);
	}

	update(user?: string): void {
		if (!this.started) {
			if (user) {
				const asPlayer = this.getPlayer(user);
				if (!asPlayer) this.throw('GAME.IMPOSTOR_ALERT');
				return this.sendHTML(asPlayer.id, this.render(asPlayer.turn as Turn));
			}
			// TODO: Add ping to ps-client HTML opts
			Object.entries(this.players).forEach(([side, player]) => {
				if (!player.out) this.sendHTML(player.id, this.render(side as Turn));
			});
			return;
		}
		super.update(user);
	}

	validateShipPositions(input: (Point | null)[][]): Omit<SelectionInProgressState, 'input'> {
		if (input.length !== Ships.length) this.throw();
		if (!input.every(points => points.length === 2 && !points.some(point => point === null))) this.throw();
		const positions = Ships.map((ship, index) => ({ ship, from: input[index][0]!, to: input[index][1]! }));

		const occupied: Record<string, string> = {};
		const shipBoard: ShipBoard = createGrid(10, 10, () => null);

		positions.forEach(({ ship, from, to }) => {
			if (!sameRowOrCol(from, to)) {
				throw new ChatError(
					`Cannot place ${ship.name} between given points ${pointToA1(from)} and ${pointToA1(to)} (not in line)` as ToTranslate
				);
			}
			const givenSize = taxicab(from, to) + 1;
			if (givenSize !== ship.size)
				throw new ChatError(`${ship.name} has size ${ship.size} but you put it in ${givenSize} cells!` as ToTranslate);
			if ([from, to].some(([x, y]) => x < 0 || x >= 10 || y < 0 || y >= 10))
				throw new ChatError(`Points given for ${ship.name} out of range!` as ToTranslate);
			rangePoints(from, to).forEach(pointInRange => {
				const point = pointToA1(pointInRange);
				if (occupied[point]) {
					throw new ChatError(`${point} would be occupied by both ${ship.name} and ${occupied[point]}` as ToTranslate);
				} else {
					occupied[point] = ship.name;
					shipBoard[pointInRange[0]][pointInRange[1]] = ship.id;
				}
			});
		});

		// Ship positions should be valid now
		return { type: 'valid', board: shipBoard };
	}
}
