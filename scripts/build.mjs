import { execSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { normalize } from 'node:path';

try {
	rmSync('package', { force: true, recursive: true });
	execSync(normalize('./node_modules/.bin/tsc'), { stdio: 'inherit' });

	for (const f of [
		'README.md',
		'LICENSE',
	]) cpSync(f, 'package/' + f);

	const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
	delete pkg.private;
	delete pkg.scripts;
	delete pkg.devDependencies;
	writeFileSync('package/package.json', JSON.stringify(pkg, undefined, 2));

} catch (error) {
	console.error(error);
	console.error('Build failed.');
}
