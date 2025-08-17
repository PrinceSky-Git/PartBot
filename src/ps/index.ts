import { Client } from 'ps-client';

import { avatar, password, rooms, username } from '@/config/ps';
import { IS_ENABLED } from '@/enabled';
import { registerEvent } from '@/ps/handlers';
import { startPSCron } from '@/ps/handlers/cron';
import { transformHTML } from '@/ps/handlers/html';
import loadPS from '@/ps/loaders';
import { Logger } from '@/utils/logger';

const PS = new Client({ username, password, rooms, transformHTML, avatar });
PS.on('login', () => Logger.log(`Connected to PS! [${username}]`));

if (IS_ENABLED.PS) loadPS().then(() => PS.connect());

PS.on('message', msg => registerEvent(PS, 'commandHandler')(msg));
PS.on('message', msg => registerEvent(PS, 'interfaceHandler')(msg));
PS.on('message', msg => registerEvent(PS, 'autoResHandler')(msg));

PS.on('join', registerEvent(PS, 'joinHandler'));
PS.on('joinRoom', registerEvent(PS, 'joinRoomHandler'));
PS.on('name', registerEvent(PS, 'nickHandler'));
PS.on('leave', registerEvent(PS, 'leaveHandler'));
PS.on('notify', registerEvent(PS, 'notifyHandler'));
PS.on('raw', registerEvent(PS, 'rawHandler'));
PS.on('tournament', registerEvent(PS, 'tourHandler'));

if (IS_ENABLED.PS) startPSCron.bind(PS)();

export default PS;
