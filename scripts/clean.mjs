import { rmSync } from 'node:fs';

const rm = (dir) => rmSync(dir, { force: true, recursive: true });

rm('package');
