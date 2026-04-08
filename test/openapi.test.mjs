import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	applyClassDecorator,
	applyMethodDecorator,
	createRegistrar,
	controllersApi,
	packageApi,
	packageControllersUrl,
} from '../.test-helpers.mjs';

const { path, method, OpenAPI } = packageApi;
const { getControllerClasses, scanControllerClasses } = controllersApi;

test('scanControllerClasses imports modules and registers controller classes', async () => {
	const before = new Set(getControllerClasses());
	const dir = mkdtempSync(join(tmpdir(), 'express-openapi-decorators-scan-'));
	const file = join(dir, 'scanned-controller.mjs');
	writeFileSync(file, [
		`import { controller } from ${JSON.stringify(packageControllersUrl)};`,
		'export class ScannedController {}',
		"controller()(ScannedController, { kind: 'class', name: 'ScannedController' });",
	].join('\n'));

	try {
		const classes = await scanControllerClasses(file);
		const additions = classes.filter((Cls) => !before.has(Cls));
		assert.ok(additions.some((Cls) => Cls.name === 'ScannedController'));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('OpenAPI.initialize instantiates controller classes and auto-registers openapi route', async () => {
	class HealthController {
		constructor() {
			this.createdByFactory = false;
		}

		health() {}
	}

	applyClassDecorator(HealthController, path('/health'));
	applyClassDecorator(HealthController, method('GET'));
	applyMethodDecorator(HealthController, 'health', path('/'));

	const instance = { createdByFactory: true, health() {} };
	Object.setPrototypeOf(instance, HealthController.prototype);

	const registrar = createRegistrar();
	const openapi = new OpenAPI();
	await openapi.initialize({
		controllerClasses: [HealthController],
		controllerFactoryMap: new Map([[HealthController, () => instance]]),
		registrar,
		baseOpenAPISchema: {
			openapi: '3.1.0',
			info: { title: 'Test', version: '1.0.0' },
			paths: {},
		},
		silent: true,
	});

	assert.equal(registrar.calls.length, 2);
	assert.deepEqual(registrar.calls.map((call) => [call.verb, call.routePath]), [
		['get', '/openapi.json'],
		['get', '/health/'],
	]);
	assert.equal(instance.createdByFactory, true);
	assert.equal(typeof registrar.calls[0].handlers.at(-1), 'function');
	assert.equal(typeof registrar.calls[1].handlers.at(-1), 'function');
	assert.notEqual(registrar.calls[1].handlers.at(-1), instance.health);
	assert.notEqual(registrar.calls[1].handlers.at(-1), HealthController.prototype.health);
	assert.equal(registrar.calls[1].handlers.at(-1).name, 'bound health');
});
