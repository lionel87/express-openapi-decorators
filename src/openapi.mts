import fs from 'node:fs';
import express from 'express';
import { getOpenAPISchema, registerControllers, path, response, summary } from './decorators.mjs';
import { getControllerClasses, scanControllerClasses } from './controllers.mjs';
import type { oas31 } from 'openapi3-ts';

export class OpenAPI {
	constructor() {}

	async initialize({
		autoscanControllersGlob,
		autoloadControllers,
		controllers,
		controllerClasses,
		controllerFactoryMap,
		schemaComponentsGlob,
		registrar,
		autoregGetOpenApiSpecOp = true,
		baseOpenAPISchema,
		silent = false,
	}: {
		/**
		 * Glob pattern(s) to load controller modules (side-effect import).
		 *
		 * Implies `autoloadControllers: true`.
		 *
		 * Use this only when you rely on `@controller()` auto-registration.
		 */
		autoscanControllersGlob?: string | string[];
		/**
		 * Captures `@controller()` decorated classes.
		 *
		 * Does NOT import any module, just collects already loaded and decorated ones.
		 * If you want auto-importing, use `autoscanControllersGlob` option.
		 */
		autoloadControllers?: boolean;
		/**
		 * Explicit list of controller instances to register.
		 *
		 * Provide this if you want full control over which controllers are loaded/registered
		 * (i.e. do not rely on `@controller()` auto-registration / scanning).
		 *
		 * Note: providing this typically implies controller modules are already imported,
		 * so autoscan is usually unnecessary.
		 */
		controllers?: object[];
		/**
		 * Explicit list of controller classes to register.
		 *
		 * Provide this if you want full control over which controllers are loaded/registered
		 * (i.e. do not rely on `@controller()` auto-registration / scanning).
		 *
		 * Note: providing this typically implies controller modules are already imported,
		 * so autoscan is usually unnecessary.
		 */
		controllerClasses?: (new (...args: any[]) => any)[];
		/**
		 * Optional factory map for controller instantiation.
		 *
		 * If a controller class exists in this map, the factory will be used to create the instance.
		 * Otherwise the controller will be instantiated with `new ControllerClass()`.
		 *
		 * Note: providing this typically implies controller modules are already imported,
		 * so autoscan is usually unnecessary.
		 */
		controllerFactoryMap?: Map<(new (...args: any[]) => any), (Cls: new (...args: any[]) => any) => any>;
		/**
		 * Glob pattern(s) for schema component modules used during OpenAPI generation.
		 *
		 * Convention: one schema definition per file. The filename indicates which symbol
		 * should be exported from that module (e.g. `User.d.mts` exports `User`).
		 */
		schemaComponentsGlob?: string | string[];
		/**
		 * Express router/app where annotated controllers will be registered.
		 *
		 * If omitted, an internal `express.Router()` will be created and returned.
		 */
		registrar?: express.Application | express.Router;
		/**
		 * Whether to automatically expose `GET /openapi.json`.
		 *
		 * When enabled, an endpoint is registered that serves the generated OpenAPI document.
		 */
		autoregGetOpenApiSpecOp?: boolean;
		/**
		 * Base OpenAPI document to extend during generation.
		 *
		 * Minimal required fields typically include `openapi`, `info.title`, and `info.version`.
		 * Paths/components discovered from controllers and schema components are merged into this object.
		 */
		baseOpenAPISchema: oas31.OpenAPIObject;
		/**
		 * Do not print log messages.
		 */
		silent?: boolean;
	}) {
		if (!registrar) {
			registrar = express.Router();
		}

		controllerClasses = [...(controllerClasses ?? [])];

		if (autoscanControllersGlob) {
			controllerClasses.push(...await scanControllerClasses(autoscanControllersGlob));
		} else if (autoloadControllers) {
			controllerClasses.push(...getControllerClasses());
		}

		controllers = [
			...(controllers ?? []),
			controllerClasses.map(Cls => {
				const factory = controllerFactoryMap?.get(Cls);
				return factory ? factory(Cls) : new Cls();
			}),
		];

		if (autoregGetOpenApiSpecOp) controllers.unshift(this);

		registerControllers(registrar, controllers).forEach(x => !silent && console.log(`Registered ${x.method} ${x.path}`));

		if (process.argv[2] === '--generate-openapi') {
			!silent && console.log('Generating OpenAPI documentation...');
			try {
				const openapi = getOpenAPISchema(baseOpenAPISchema, controllers, schemaComponentsGlob);
				!silent && console.log('Writing openapi.json...');
				fs.writeFileSync('openapi.json', JSON.stringify(openapi));
			} catch (error) {
				console.error(error);
			} finally {
				process.exit(0);
			}
		}

		return registrar;
	}

	/**
	 * Handler to serve the OpenAPI response.
	 */
	@path('/openapi.json')
	@summary('Get OpenAPI schema')
	@response(200, {
		'application/json': { schema: { type: 'object' } }
	}, 'Successful with an OpenAPI document response')
	@response(500)
	getOpenApiSpec(req: express.Request, res: express.Response) {
		try {
			res.type('application/json').send(fs.readFileSync('openapi.json'));
		} catch (error) {
			res.sendStatus(500);
		}
	}
}
