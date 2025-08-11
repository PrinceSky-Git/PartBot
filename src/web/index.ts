import express, { json, urlencoded } from 'express';

import { port } from '@/config/web';
import connection from '@/database';
import { IS_ENABLED } from '@/enabled';
import { Logger } from '@/utils/logger';
import loadAPI from '@/web/loaders/api';
import loadBundles from '@/web/loaders/bundles';
import loadStatic from '@/web/loaders/static';
import loadUI from '@/web/loaders/ui';

const app = express();

app.use(urlencoded({ extended: true }));
app.use(json());

if (IS_ENABLED.WEB) {
	Promise.resolve(connection)
		.then(() => loadStatic(app))
		.then(() => loadAPI(app))
		.then(() => loadBundles(app))
		.then(() => loadUI(app))
		.then(() => app.listen(port, () => Logger.log(`Web is running!`)));
}

export default app;
