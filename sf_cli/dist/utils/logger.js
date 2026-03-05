import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
const TIMELINE_FILE = join('.skillfoundry', 'timeline.log');
export function logTimeline(workDir, status, stage, message) {
    const path = join(workDir, TIMELINE_FILE);
    const dir = dirname(path);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    const ts = new Date().toISOString().replace('T', ' ').slice(11, 19);
    appendFileSync(path, `${ts}\t${status}\t${stage}\t${message}\n`);
}
//# sourceMappingURL=logger.js.map