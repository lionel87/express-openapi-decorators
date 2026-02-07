import fs from 'node:fs';
import express from 'express';
import { getOpenAPISchema, registerControllers, path, response, summary } from './decorators.mjs';
import { getControllerClasses, scanControllerClasses } from './controllers.mjs';
import type { oas31 } from 'openapi3-ts';

export class OpenAPI {
	constructor() {}

	async initialize({
		autoscanControllersGlob,
		controllerFactoryMap,
		controllerClasses,
		schemaComponentsGlob,
		registrar,
		autoregGetOpenApiSpecOp = true,
		baseOpenAPISchema,
	}: {
		/**
		 * Glob pattern(s) to load controller modules (side-effect import).
		 *
		 * Use this only when you rely on `@controller()` auto-registration.
		 * If you provide `controllerFactoryMap`, controller modules are already imported
		 * and autoscan is unnecessary.
		 */
		autoscanControllersGlob?: string | string[];
		/**
		 * Explicit list of controller classes to register.
		 *
		 * Provide this if you want full control over which controllers are loaded/registered
		 * (i.e. do not rely on `@controller()` auto-registration / scanning).
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
	}) {
		if (!registrar) {
			registrar = express.Router();
		}

		if (!controllerClasses) {
			controllerClasses = autoscanControllersGlob
				? await scanControllerClasses(autoscanControllersGlob)
				: getControllerClasses();
		}

		const controllers = controllerClasses.map(Cls => {
			const factory = controllerFactoryMap?.get(Cls);
			return factory ? factory(Cls) : new Cls();
		});

		if (autoregGetOpenApiSpecOp) controllers.unshift(this);

		registerControllers(registrar, controllers).forEach(x => console.log(`Registered ${x.method} ${x.path}`));

		if (process.argv[2] === '--generate-openapi') {
			console.log('Generating OpenAPI documentation...');
			try {
				const openapi = getOpenAPISchema(baseOpenAPISchema, controllers, schemaComponentsGlob);
				console.log('Writing openapi.json...');
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
