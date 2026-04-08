import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

Symbol.metadata ??= Symbol('metadata');

export const packageIndexUrl = pathToFileURL(resolve('package/index.mjs')).href;
export const packageControllersUrl = pathToFileURL(resolve('package/controllers.mjs')).href;

export const packageApi = await import(packageIndexUrl);
export const controllersApi = await import(packageControllersUrl);

export function ensureMetadata(Cls) {
	Cls[Symbol.metadata] ??= {};
	return Cls[Symbol.metadata];
}

export function applyClassDecorator(Cls, decorator) {
	decorator(Cls, {
		kind: 'class',
		name: Cls.name,
		metadata: ensureMetadata(Cls),
	});
	return Cls;
}

export function applyMethodDecorator(Cls, methodName, decorator) {
	decorator(Cls.prototype[methodName], {
		kind: 'method',
		name: methodName,
		metadata: ensureMetadata(Cls),
	});
	return Cls;
}

export function createRegistrar() {
	const calls = [];
	const registrar = { calls };
	for (const verb of ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace']) {
		registrar[verb] = (routePath, ...handlers) => {
			calls.push({ verb, routePath, handlers });
		};
	}
	return registrar;
}

export function createTempSchemaDir(files) {
	const dir = mkdtempSync(join(tmpdir(), 'express-openapi-decorators-test-'));
	for (const [filename, contents] of Object.entries(files)) {
		writeFileSync(join(dir, filename), contents);
	}
	return dir;
}
