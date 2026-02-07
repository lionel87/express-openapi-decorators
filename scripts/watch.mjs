import { execSync } from 'node:child_process';
import { watch } from 'chokidar';

watch('src', { ignoreInitial: false })
	.addListener('all', () => execSync('node scripts/build.mjs', { stdio: 'inherit' }));
