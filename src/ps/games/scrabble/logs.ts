import type { DIRECTION } from '@/ps/games/scrabble/constants';
import type { BoardTile, Points } from '@/ps/games/scrabble/types';
import type { BaseLog, BaseLogAction } from '@/ps/games/types';
import type { Satisfies, SerializedInstance } from '@/types/common';
import type { Point } from '@/utils/grid';

export type Log =
	| Satisfies<
			BaseLog,
			{
				time: Date;
				turn: string;
			} & (
				| {
						action: 'play';
						ctx: {
							points: Points;
							tiles: BoardTile[];
							dir: DIRECTION;
							point: Point;
							newTiles: string[];
							rack: string[];
							words: Record<string, number>;
						};
				  }
				| { action: 'exchange'; ctx: { tiles: string[]; newTiles: string[]; rack: string[] } }
				| { action: 'pass'; ctx: { rack: string[] } }
			)
	  >
	| BaseLogAction;

export type APILog = SerializedInstance<Log>;
