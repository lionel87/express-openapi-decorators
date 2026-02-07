import { basename } from 'node:path';
import { createGenerator } from 'ts-json-schema-generator';
import { globSync } from 'glob';
import type express from 'express';
import type { oas31 } from 'openapi3-ts';

// key for class level metadata maps
const CLASS_METADATA = Symbol('class-metadata');

/* ---------------- decorators ---------------- */

type MethodMetadata =
	| 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD'
	| 'OPTIONS' | 'PATCH' | 'TRACE' /* | 'CONNECT' */;
const METHOD = Symbol('method');
/**
 * Sets the HTTP method metadata for routing.
 *
 * - When applied to a method: defines the HTTP verb for that route handler.
 * - When applied to a class: defines the default HTTP verb for handlers that don't specify one explicitly.
 */
export function method(method: MethodMetadata) {
	return function (
		target: (new (...args: any[]) => any) | ((req: express.Request, res: express.Response) => void),
		context: ClassDecoratorContext | ClassMethodDecoratorContext
	) {
		if (context.kind !== 'class' && context.kind !== 'method') throw new Error('This decorator can only be used on classes and class methods.');
		if (!context.metadata) throw new Error('This decorator does not work without decorator metadata support.');

		context.metadata[METHOD] ??= new Map<string | symbol, unknown>();
		const map = context.metadata[METHOD] as Map<string | symbol, unknown>;
		const key = context.kind === 'class' ? CLASS_METADATA : context.name;

		if (map.has(key)) throw new Error('This decorator may be applied at most once per method.');

		map.set(key, method);
	};
}

type PathMetadata = string;
const PATH = Symbol('path');
/**
 * Sets the route path metadata.
 * Usually it is a good idea to start your path with a `/` character or the path may not work correctly.
 *
 * - When applied to a method: defines the route path relative to the controller/base path.
 * - When applied to a class: defines the controller/base path prefix for all handlers in the class.
 *
 * Note: multiple `@path(...)` decorators may be used to register the same handler on multiple URLs.
 *
 * Example:
 * ```ts
 * \@path('/v1')
 * \@path('/v2')
 * class User {
 *   \@path('/login')
 *   \@path('/auth')
 *   loginFn(...) { ... }
 * }
 * ```
 *
 * The `loginFn` handler will be available at 4 endpoints:
 * - `/v1/login`
 * - `/v1/auth`
 * - `/v2/login`
 * - `/v2/auth`
 */
export function path(path: PathMetadata) {
	return function (
		target: (new (...args: any[]) => any) | ((req: express.Request, res: express.Response) => void),
		context: ClassDecoratorContext | ClassMethodDecoratorContext
	) {
		if (context.kind !== 'class' && context.kind !== 'method') throw new Error('This decorator can only be used on classes and class methods.');
		if (!context.metadata) throw new Error('This decorator does not work without decorator metadata support.');

		context.metadata[PATH] ??= new Map<string | symbol, unknown>();
		const map = context.metadata[PATH] as Map<string | symbol, unknown>;
		const key = context.kind === 'class' ? CLASS_METADATA : context.name;

		let list = map.get(key) as PathMetadata[] | undefined;
		if (!list) map.set(key, list = []);
		list.push(path);
	};
}

type MiddlewareMetadata = express.RequestHandler;
const MIDDLEWARE = Symbol('middleware');
/**
 * Registers middleware for the decorated target.
 *
 * - When applied to a method: middleware runs for that specific handler.
 * - When applied to a class: middleware runs for every handler in the class (in addition to any method-level middleware).
 *
 * Class middlewares precedes the middlewares on methods.
 */
export function middleware(...middlewares: MiddlewareMetadata[]) {
	return function (
		target: (new (...args: any[]) => any) | ((req: express.Request, res: express.Response) => void),
		context: ClassDecoratorContext | ClassMethodDecoratorContext
	) {
		if (context.kind !== 'class' && context.kind !== 'method') throw new Error('This decorator can only be used on classes and class methods.');
		if (!context.metadata) throw new Error('This decorator does not work without decorator metadata support.');

		context.metadata[MIDDLEWARE] ??= new Map<string | symbol, unknown>();
		const map = context.metadata[MIDDLEWARE] as Map<string | symbol, unknown>;
		const key = context.kind === 'class' ? CLASS_METADATA : context.name;

		let list = map.get(key) as MiddlewareMetadata[] | undefined;
		if (!list) map.set(key, list = []);
		list.push(...middlewares);
	};
}

type TagMetadata = string;
const TAG = Symbol('tag');
/**
 * Adds an OpenAPI tag to the operation.
 *
 * - When applied to a method: appends the tag to that operation.
 * - When applied to a class: applies the tag to all operations in the class.
 */
export function tag(...tags: TagMetadata[]) {
	return function (
		target: (new (...args: any[]) => any) | ((req: express.Request, res: express.Response) => void),
		context: ClassDecoratorContext | ClassMethodDecoratorContext
	) {
		if (context.kind !== 'class' && context.kind !== 'method') throw new Error('This decorator can only be used on classes and class methods.');
		if (!context.metadata) throw new Error('This decorator does not work without decorator metadata support.');

		context.metadata[TAG] ??= new Map<string | symbol, unknown>();
		const map = context.metadata[TAG] as Map<string | symbol, unknown>;
		const key = context.kind === 'class' ? CLASS_METADATA : context.name;

		let list = map.get(key) as TagMetadata[] | undefined;
		if (!list) map.set(key, list = []);
		list.push(...tags);
	};
}

type SummaryMetadata = string;
const SUMMARY = Symbol('summary');
/**
 * Sets the OpenAPI `summary` for the decorated route handler.
 *
 * This decorator is valid on class methods only. Use it for a short, one-line description
 * of what the operation does.
 */
export function summary(summary: SummaryMetadata) {
	return function (
		target: (req: express.Request, res: express.Response) => void,
		context: ClassMethodDecoratorContext
	) {
		if (context.kind !== 'method') throw new Error('This decorator can only be used on class methods.');
		if (!context.metadata) throw new Error('This decorator does not work without decorator metadata support.');

		context.metadata[SUMMARY] ??= new Map<string | symbol, unknown>();
		const map = context.metadata[SUMMARY] as Map<string | symbol, unknown>;

		if (map.has(context.name)) throw new Error('This decorator may be applied at most once per method.');

		map.set(context.name, summary);
	};
}

type DescriptionMetadata = string;
const DESCRIPTION = Symbol('description');
/**
 * Sets the OpenAPI `description` for the decorated route handler.
 *
 * This decorator is valid on class methods only. Use it for a detailed explanation of the
 * operation's behavior, constraints, and edge cases.
 */
export function description(description: DescriptionMetadata) {
	return function (
		target: (req: express.Request, res: express.Response) => void,
		context: ClassMethodDecoratorContext
	) {
		if (context.kind !== 'method') throw new Error('This decorator can only be used on class methods.');
		if (!context.metadata) throw new Error('This decorator does not work without decorator metadata support.');

		context.metadata[DESCRIPTION] ??= new Map<string | symbol, unknown>();
		const map = context.metadata[DESCRIPTION] as Map<string | symbol, unknown>;

		if (map.has(context.name)) throw new Error('This decorator may be applied at most once per method.');

		map.set(context.name, description);
	};
}

type OperationIdMetadata = string;
const OPERATION_ID = Symbol('operationId');
/**
 * Sets the OpenAPI `operationId` for the decorated route handler.
 *
 * This decorator is valid on class methods only. Use it to assign a stable, unique identifier
 * for the operation (e.g. for SDK generation, client method names, and tooling references).
 */
export function operationId(operationId: OperationIdMetadata) {
	return function (
		target: (req: express.Request, res: express.Response) => void,
		context: ClassMethodDecoratorContext
	) {
		if (context.kind !== 'method') throw new Error('This decorator can only be used on class methods.');
		if (!context.metadata) throw new Error('This decorator does not work without decorator metadata support.');

		context.metadata[OPERATION_ID] ??= new Map<string | symbol, unknown>();
		const map = context.metadata[OPERATION_ID] as Map<string | symbol, unknown>;

		if (map.has(context.name)) throw new Error('This decorator may be applied at most once per method.');

		map.set(context.name, operationId);
	};
}

type RequestBodyMetadata = oas31.RequestBodyObject | string;
const REQUEST_BODY = Symbol('requestBody');
/**
 * Defines the OpenAPI request body for the decorated route handler.
 *
 * This decorator is valid on class methods only.
 *
 * Accepts either:
 * - an inline OpenAPI 3.1 `RequestBodyObject`, or
 * - a schema name as `string`, which is resolved to a `$ref` under `#/components/schemas/<name>`.
 *
 * If the schema name ends with `[]`, it is interpreted as an array of that schema
 * (i.e. `#/components/schemas/<name-without-brackets>`).
 */
export function requestBody(requestBody: RequestBodyMetadata) {
	return function (
		target: (req: express.Request, res: express.Response) => void,
		context: ClassMethodDecoratorContext
	) {
		if (context.kind !== 'method') throw new Error('This decorator can only be used on class methods.');
		if (!context.metadata) throw new Error('This decorator does not work without decorator metadata support.');

		context.metadata[REQUEST_BODY] ??= new Map<string | symbol, unknown>();
		const map = context.metadata[REQUEST_BODY] as Map<string | symbol, unknown>;

		if (map.has(context.name)) throw new Error('This decorator may be applied at most once per method.');

		map.set(context.name, requestBody);
	};
}

type ResponseCodeMetadata = number;
type ResponseContentMetadata = oas31.ContentObject | Record<string, string> | string;
type ResponseDescriptionMetadata = string;
type ResponseHeadersMetadata = oas31.HeadersObject;
type ResponseMetadata = {
	code: ResponseCodeMetadata;
	content?: ResponseContentMetadata;
	description?: ResponseDescriptionMetadata;
	headers?: ResponseHeadersMetadata;
};
const RESPONSE = Symbol('response');
/**
 * Defines an OpenAPI response for the decorated route handler.
 *
 * - When applied to a method: registers a response entry (status code + schema/content/description).
 * - When applied to a class: registers default responses applied to operations that don't specify them explicitly.
 *
 * Parameters:
 * - `code` is the HTTP status code.
 * - `description` is the human-readable response description (optional).
 * - `headers` defines OpenAPI response headers (optional).
 *
 * `content` can be provided in multiple forms:
 * - `oas31.ContentObject`: full, explicit OpenAPI content definition.
 * - `Record<string, string>`: a map where the key is the content type (e.g. `application/json`)
 *   and the value is a schema reference shorthand resolved under `#/components/schemas/<name>`.
 *   If the schema name ends with `[]`, it is interpreted as an array of that schema.
 * - `string`: shorthand for an `application/json` response whose schema is resolved under
 *   `#/components/schemas/<name>` (with the same `[]` array rule).
 *
 * Note: multiple `@response(...)` decorators may be used to describe multiple status codes/content types.
 */
export function response(
	code: ResponseCodeMetadata,
	content?: ResponseContentMetadata,
	description?: ResponseDescriptionMetadata,
	headers?: ResponseHeadersMetadata
) {
	return function (
		target: (new (...args: any[]) => any) | ((req: express.Request, res: express.Response) => void),
		context: ClassDecoratorContext | ClassMethodDecoratorContext
	) {
		if (context.kind !== 'class' && context.kind !== 'method') throw new Error('This decorator can only be used on classes and class methods.');
		if (!context.metadata) throw new Error('This decorator does not work without decorator metadata support.');

		context.metadata[RESPONSE] ??= new Map<string | symbol, unknown>();
		const map = context.metadata[RESPONSE] as Map<string | symbol, unknown>;
		const key = context.kind === 'class' ? CLASS_METADATA : context.name;

		let list = map.get(key) as ResponseMetadata[] | undefined;
		if (!list) map.set(key, list = []);
		list.push({ code, content, description, headers });
	};
}

/* ---------------- registration and schema generation ---------------- */

export type RegisteredControllerInfo = {
	method: MethodMetadata;
	path: PathMetadata;
	middlewares: MiddlewareMetadata[];
	handler: express.RequestHandler;
};

/**
 * Registers one or more controller instances on an Express `Application` or `Router` using decorator metadata.
 *
 * Route discovery:
 * - A class method is considered a route handler only if it has at least one method-level `@path(...)` decorator.
 *
 * Route configuration:
 * - Class-level `@path(...)` values act as base path prefixes. Each method-level path is combined with each class-level path.
 * - HTTP method is resolved from method-level `@method(...)`, otherwise falls back to class-level `@method(...)`,
 *   otherwise defaults to `GET`.
 * - Middlewares are resolved as: `[...classMiddlewares, ...methodMiddlewares]`, preserving that order.
 *
 * Requirements:
 * - Requires decorator metadata support (`Symbol.metadata`). If not available, an error is thrown.
 * - The function expects `controllers` to be class instances (not constructors).
 *
 * @param registrar Express `Application` or `Router` to register the resolved routes on.
 * @param controllers A controller instance or an array of controller instances.
 * @returns A list of resolved route registrations (method, path, middlewares, handler) in the order they were registered.
 */
export function registerControllers(
	registrar: express.Application | express.Router,
	controllers: Object | Object[],
) {
	if (!('metadata' in Symbol) || typeof Symbol.metadata !== 'symbol') throw new Error('Decorator metadata is not available: Symbol.metadata is missing.');

	const info: RegisteredControllerInfo[] = [];

	for (const controller of Array.isArray(controllers) ? controllers : [controllers]) {
		const md = (controller.constructor as any)?.[Symbol.metadata] as DecoratorMetadataObject | undefined;
		if (!md) continue;

		const pathMap = md[PATH] as Map<string | symbol, PathMetadata[]> | undefined;
		if (!pathMap?.size) continue; // no @path anywhere => nothing to register
		const methodMap = md[METHOD] as Map<string | symbol, MethodMetadata> | undefined;
		const middlewareMap = md[MIDDLEWARE] as Map<string | symbol, MiddlewareMetadata[]> | undefined;

		const classPaths = pathMap?.get(CLASS_METADATA) ?? [''] as PathMetadata[];
		const classMethod = methodMap?.get(CLASS_METADATA) ?? 'GET' as MethodMetadata;
		const classMiddlewares = middlewareMap?.get(CLASS_METADATA) ?? [] as MiddlewareMetadata[];

		for (const [handlerName, methodPaths] of pathMap?.entries() ?? []) {
			if (handlerName === CLASS_METADATA) continue;
			for (const classPath of classPaths) {
				for (const methodPath of methodPaths) {
					const path = classPath + methodPath;
					const method = methodMap?.get(handlerName) ?? classMethod ?? 'GET';
					const handler = ((controller as any)[handlerName] as Function).bind(controller);
					const middlewares = [
						...classMiddlewares,
						...(middlewareMap?.get(handlerName) ?? [])
					];

					info.push({ method, path, middlewares, handler });

					const verb = method.toLowerCase() as Lowercase<typeof method>;
					(registrar as express.Application)?.[verb](path, ...middlewares, handler);
				}
			}
		}
	}
	return info;
}

/**
 * Generates an OpenAPI document for the given controllers using decorator metadata.
 *
 * Paths and operations:
 * - A class method is considered an operation only if it has at least one method-level `@path(...)` decorator.
 * - Class-level `@path(...)` values act as base path prefixes. Each method-level path is combined with each class-level path.
 * - HTTP method is resolved from method-level `@method(...)`, otherwise falls back to class-level `@method(...)`,
 *   otherwise defaults to `GET`.
 *
 * Express-style path conversion:
 * - Express parameters like `/:id` or `/:id(<pattern>)` are converted to OpenAPI templated paths: `/{id}`.
 *   - `/:name(<a|b|c>)` is emitted as an enum when the pattern looks like a pipe-delimited value list.
 *   - Otherwise the pattern is emitted as a string `pattern` (with escapes normalized).
 *
 * Components generation:
 * - The returned document is a clone of `baseOpenAPI` with generated `paths` merged in.
 * - If `componentsPattern` is provided, schema definitions are generated and merged into `components.schemas`.
 * - If generation fails, an error is thrown.
 *
 * Requirements:
 * - Requires decorator metadata support (`Symbol.metadata`). If not available, an error is thrown.
 *
 * @param baseOpenAPISchema Base OpenAPI 3.1 document to clone and extend.
 * @param controllers A controller instance or an array of controller instances.
 * @param componentsPattern Optional glob/pattern(s) pointing to type definitions used to generate `components.schemas`.
 * @returns A fully formed OpenAPI 3.1 document containing generated `paths` and optional `components.schemas`.
 */
export function getOpenAPISchema(
	baseOpenAPISchema: oas31.OpenAPIObject,
	controllers: Object | Object[],
	componentsPattern?: string | string[]
) {
	if (!('metadata' in Symbol) || typeof Symbol.metadata !== 'symbol') throw new Error('Decorator metadata is not available: Symbol.metadata is missing.');

	const openapi: oas31.OpenAPIObject = structuredClone(baseOpenAPISchema);
	if (!openapi.paths) {
		openapi.paths = {};
	}

	for (const controller of Array.isArray(controllers) ? controllers : [controllers]) {
		const md = (controller.constructor as any)?.[Symbol.metadata] as DecoratorMetadataObject | undefined;
		if (!md) continue;

		const pathMap = md[PATH] as Map<string | symbol, PathMetadata[]> | undefined;
		if (!pathMap?.size) continue; // no @path anywhere => nothing to register
		const methodMap = md[METHOD] as Map<string | symbol, MethodMetadata> | undefined;
		const tagMap = md[TAG] as Map<string | symbol, TagMetadata[]> | undefined;
		const operationIdMap = md[OPERATION_ID] as Map<string | symbol, OperationIdMetadata> | undefined;
		const summaryMap = md[SUMMARY] as Map<string | symbol, SummaryMetadata> | undefined;
		const descriptionMap = md[DESCRIPTION] as Map<string | symbol, DescriptionMetadata> | undefined;
		const requestBodyMap = md[REQUEST_BODY] as Map<string | symbol, RequestBodyMetadata> | undefined;
		const responseMap = md[RESPONSE] as Map<string | symbol, ResponseMetadata[]> | undefined;

		const classPaths = pathMap?.get(CLASS_METADATA) ?? [''] as PathMetadata[];
		const classMethod = methodMap?.get(CLASS_METADATA) ?? 'GET' as MethodMetadata;
		const classTags = tagMap?.get(CLASS_METADATA) ?? [] as TagMetadata[];
		const classRequestBody = requestBodyMap?.get(CLASS_METADATA) as RequestBodyMetadata | undefined;
		const classReponses = responseMap?.get(CLASS_METADATA) ?? [] as ResponseMetadata[];

		for (const [handlerName, methodPaths] of pathMap?.entries() ?? []) {
			if (handlerName === CLASS_METADATA) continue;
			for (const classPath of classPaths) {
				for (const methodPath of methodPaths) {
					const path = (classPath + methodPath)
					const method = (methodMap?.get(handlerName) ?? classMethod ?? 'GET').toLowerCase() as Lowercase<typeof classMethod>;

					// replace /some/:path/:segments(regex) to /some/{path}/{segments}
					const oaPath = path.replace(/:([a-zA-Z0-9_]+)(?:\((?:\\\)|[^)])+\))?/g, '{$1}');

					let oaPathItem = openapi.paths[oaPath];
					if (!oaPathItem) {
						openapi.paths[oaPath] = oaPathItem = {};

						const parameters: oas31.ParameterObject[] = [];
						const paramRegex = /:([a-zA-Z0-9_]+)(?:\(((?:\\\)|[^)])+)\))?/g;
						const enumRegex = /^[a-zA-Z0-9_|]+$/;
						let match;
						while ((match = paramRegex.exec(path)) !== null) {
							const [, name, pattern] = match;
							parameters.push({
								name,
								in: 'path',
								required: true,
								schema: pattern
									? (pattern.match(enumRegex)
										? { type: 'string', enum: pattern.split('|') }
										: { type: 'string', pattern: pattern }
									)
									: { type: 'string' },
							});
						}
						if (parameters.length) {
							oaPathItem.parameters = parameters;
						}
					}

					if (oaPathItem[method]) throw new Error(`Duplicate path definition found for '${method} ${oaPath}'`);

					oaPathItem[method] = {};
					const oaOperation = oaPathItem[method];

					const tags = [...new Set([...classTags, ...(tagMap?.get(handlerName) ?? [])])];
					if (tags.length) oaOperation.tags = tags;

					const summary = summaryMap?.get(handlerName);
					if (summary) oaOperation.summary = summary;

					const description = descriptionMap?.get(handlerName);
					if (description) oaOperation.description = description;

					const methodOperationId = operationIdMap?.get(handlerName);
					if (methodOperationId) oaOperation.operationId = methodOperationId;
					else if (typeof handlerName === 'string') oaOperation.operationId = handlerName;

					const requestBody = requestBodyMap?.get(handlerName) ?? classRequestBody;
					if (typeof requestBody === 'string') {
						oaOperation.requestBody = {
							content: {
								'application/json': { schema: nameToSchemaRef(requestBody) },
							},
							required: true,
						};
					} else if (requestBody) {
						oaOperation.requestBody = requestBody;
					}

					const responses = [...classReponses, ...(responseMap?.get(handlerName) ?? [])];
					if (responses.length) {
						const oaResponses: oas31.ResponsesObject = {};
						for (const { code, content, description, headers } of responses) {

							const codeStr = String(code) as keyof typeof defaultResponses;
							let userContent: any = content
								?? ('content' in defaultResponses[codeStr]
									? defaultResponses[codeStr].content
									: undefined
								);

							if (typeof userContent === 'string') {
								userContent = {
									'application/json': { schema: nameToSchemaRef(userContent) },
								};
							} else if (userContent) {
								userContent = structuredClone(userContent);
								for (const mediaType of Object.keys(userContent)) {
									if (typeof userContent[mediaType] === 'string') {
										userContent[mediaType] = { schema: nameToSchemaRef(userContent[mediaType]) };
									}
								}
							}
							oaResponses[codeStr] = {
								description: description ?? defaultResponses[codeStr]?.description ?? 'Response',
								content: userContent,
								headers: headers,
								// TODO: links
							};

						}
						oaOperation.responses = oaResponses;
					}
				}
			}
		}
	}
	if (componentsPattern) {
		try {
			const componentSchemas = generateSchemaDefinitions(componentsPattern);
			if (Object.keys(componentSchemas).length) {
				if (!openapi.components) {
					openapi.components = {};
				}
				if (!openapi.components.schemas) {
					openapi.components.schemas = {};
				}
				Object.assign(openapi.components.schemas, componentSchemas);
			}
		} catch (error) {
			throw new Error('Could not generate components.schemas from the given type definitions.\n' + String(error));
		}
	}
	return openapi;
}

/* ---------------- helpers ---------------- */

export function nameToSchemaRef(name: string): oas31.SchemaObject | oas31.ReferenceObject {
	if (name.endsWith('[]')) {
		return {
			type: 'array',
			'items': {
				'$ref': '#/components/schemas/' + name.substring(0, name.length - 2)
			}
		};
	}
	return {
		'$ref': '#/components/schemas/' + name
	};
}

function generateSchemaDefinitions(pattern: string | string[]): oas31.SchemasObject {
	const fixSchema = (obj: object, defs: any) => {
		if (Array.isArray(obj)) {
			for (let i = 0; i < obj.length; i++) {
				const target = obj[i];
				if (typeof target === 'object' && target !== null) {
					if (target.$ref?.startsWith?.('#/definitions/')) {
						const ref = defs[target.$ref.replace('#/definitions/', '')];
						obj.splice(i, 1, ref);
					} else {
						if ('const' in target) {
							target.enum = [target.const];
							delete target.const;
						}
						fixSchema(target, defs);
					}
				}
			}
		} else {
			for (const key of Object.keys(obj)) {
				const target = (obj as any)[key];
				if (typeof target === 'object' && target !== null) {
					if (target.$ref?.startsWith?.('#/definitions/')) {
						const ref = defs[target.$ref.replace('#/definitions/', '')];
						(obj as any)[key] = ref;
					} else {
						if ('const' in target) {
							target.enum = [target.const];
							delete target.const;
						}
						fixSchema(target, defs);
					}
				}
			}
		}
	};

	const combinedSchemas: any = {};

	const declarationFiles = globSync(pattern, { absolute: true });
	for (const file of declarationFiles) {
		const filename = basename(file);
		const dotPos = filename.indexOf('.');
		const filenameWithoutExt = dotPos < 0 ? filename : filename.substring(0, dotPos);

		const schema = createGenerator({
			path: file,
			type: filenameWithoutExt,
			topRef: false,
		}).createSchema(filenameWithoutExt);

		if (schema) {
			if (schema.definitions) {
				fixSchema(schema, schema.definitions);
				delete schema.definitions;
			}
			delete schema.$schema;
			combinedSchemas[filenameWithoutExt] = schema;
		}
	}
	return combinedSchemas;
}

const defaultResponses = {
	'200': {
		description: 'Successful request',
		content: {
			'text/plain': {
				schema: {
					type: 'string'
				}
			}
		}
	},
	'204': {
		description: 'Successful request, no content to return',
	},
	'400': {
		description: 'Bad request',
		content: {
			'text/plain': {
				schema: {
					type: 'string',
					example: 'Bad Request',
				},
			},
		},
	},
	'401': {
		description: 'Unauthorized',
		content: {
			'text/plain': {
				schema: {
					type: 'string',
					example: 'Unauthorized',
				},
			},
		},
	},
	'403': {
		description: 'Forbidden',
		content: {
			'text/plain': {
				schema: {
					type: 'string',
					example: 'Forbidden',
				},
			},
		},
	},
	'404': {
		description: 'Not found',
		content: {
			'text/plain': {
				schema: {
					type: 'string',
					example: 'Not Found',
				}
			},
		},
	},
	'500': {
		description: 'Internal server error',
		content: {
			'text/plain': {
				schema: {
					type: 'string',
					example: 'Internal Server Error',
				}
			},
		},
	},
};
