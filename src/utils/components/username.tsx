import { Tools as ClientTools } from 'ps-client';

import type { ReactElement } from 'react';

export function Username({
	name,
	useOriginalColor,
	children,
	clickable,
}: {
	name: string;
	useOriginalColor?: boolean;
	clickable?: boolean;
	children?: string;
}): ReactElement {
	const namecolour = ClientTools.HSL(name);
	const [h, s, l] = useOriginalColor ? (namecolour.base?.hsl ?? namecolour.hsl) : namecolour.hsl;
	const nameEl = <strong style={{ color: `hsl(${h},${s}%,${l}%)` }}>{children ?? name}</strong>;
	if (clickable) return <span className="username">{nameEl}</span>;
	else return nameEl;
}
