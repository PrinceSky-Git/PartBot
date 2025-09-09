import { CronJob } from 'cron';

import { PSCronJobs } from '@/cache';
import { register as registerGeneral } from '@/ps/handlers/cron/general';
import { register as registerHindi } from '@/ps/handlers/cron/hindi';
import { register as registerUGO } from '@/ps/handlers/cron/ugo';

import type { TimeZone } from '@/ps/handlers/cron/constants';
import type { Client } from 'ps-client';

export class PSCronJobManager {
	jobs: Record<string, CronJob> = {};

	register(id: string, cronTime: string, timeZone: TimeZone, callback: () => void): void {
		this.jobs[id] = CronJob.from({ name: id, cronTime, start: true, onTick: callback, timeZone });
	}
	kill(): void {
		for (const jobId in this.jobs) {
			this.jobs[jobId].stop();
		}
	}
}

export function startPSCron(this: Client): PSCronJobManager {
	const Jobs = new PSCronJobManager();
	registerGeneral.call(this, Jobs);
	registerHindi.call(this, Jobs);
	registerUGO.call(this, Jobs);

	// Kill existing cron jobs
	PSCronJobs.manager?.kill();
	PSCronJobs.manager = Jobs;

	return Jobs;
}
