# express-openapi-decorators

Decorator-based Express controllers with OpenAPI specification generation.

This library is **experimental**.

It targets modern Node.js + TypeScript setups (ESM) and relies on decorator metadata (`Symbol.metadata`). Some OpenAPI features are not covered yet. If there is interest in the package, I’ll extend it.

## Features

- Class/method decorators to define Express routes:  
  `@path()`, `@method()`, `@middleware()`
- OpenAPI decorators:  
  `@tag()`, `@summary()`, `@description()`,
  `@operationId()`, `@requestBody()`, `@response()`
- Register controllers on an Express `app` or `router` via metadata
- Generate OpenAPI document (`openapi.json`) from the same metadata
- Optional schema generation for `components.schemas` using `ts-json-schema-generator`
- Express-style `/:param` to OpenAPI `/{param}` path conversion
  - Supports `/:id(<pattern>)` patterns

## Non-goals (for now)

- Automatic inference of request/response types from handler signatures
- Full OpenAPI surface area (security schemes, callbacks, links, deep parameter modeling, etc.)
- Advanced param sources (query/header/cookie) beyond basic path-parameter emission
- Runtime validation (this is routing + docs generation, not a validator)

## Requirements

- TypeScript 5.3+
- Decorator metadata support (`Symbol.metadata`)
  - If your runtime doesn’t provide it, you can use the included polyfill.

## Install

```bash
npm i express-openapi-decorators
```

## Quick start

### 1) Add the metadata polyfill (if needed)

Import it once, before loading any decorated classes.

```ts
import 'express-openapi-decorators/symbol-metadata-polyfill.mjs';
```

### 2) Create a controller

A method becomes a route handler only if it has at least one method-level `@path()`.

```ts
import type express from 'express';
import { controller, path, method, middleware, tag, summary, description, requestBody, response } from 'express-openapi-decorators';

@controller()
@path('/users')
@tag('users')
@middleware((req, _res, next) => {
  req.headers['x-example'] = '1';
  next();
})
export class UserController {
  @method('GET')
  @path('/:id([0-9]+)')
  @summary('Get user by id')
  @description('Returns a user by id.')
  @response(200, 'User')
  @response(404)
  async getUserById(req: express.Request, res: express.Response) {
    res.json({ id: req.params.id });
  }

  @method('POST')
  @path('/')
  @summary('Create a new user')
  @requestBody('CreateUserRequest')
  @response(200, 'CreateUserResponse')
  @response(400)
  @response(500)
  async createUser(req: express.Request, res: express.Response) {
    // ...
  }
}
```

### 3) Register controllers on Express

```ts
import express from 'express';
import 'express-openapi-decorators/symbol-metadata-polyfill.mjs';
import { OpenAPI } from 'express-openapi-decorators';
import { UserController } from './UserController.mjs';

const app = express();

const router = await new OpenAPI().initialize({
	controllersGlob: 'build/**/*Controller.mjs',
	schemaComponentsGlob: 'src/**/http-dto/*.d.mts',
	baseOpenAPISchema: {
		openapi: '3.0.0',
		info: {
			title: 'REST API DEMO',
			version: '1.0.0',
			description: 'REST API documentation example app.',
		},
		servers: [
			{ url: 'http://localhost/api' },
			{ url: 'https://test.example.com/api' },
			{ url: 'https://example.com/api' },
		],
	},
});

app.use('/api', router);

app.listen(80, () => {
  console.log(`HTTP Server running on port 80`);
});
```

## OpenAPI generation

The generator builds an OpenAPI document by walking decorator metadata on controller instances.

### Base schema

You provide a base OpenAPI document (the generator clones it and merges `paths` and optional `components.schemas`).

```ts
import { getOpenAPISchema } from 'express-openapi-decorators';
import type { oas31 } from 'openapi3-ts';

const baseOpenAPISchema: oas31.OpenAPIObject = {
  openapi: '3.1.0',
  info: {
    title: 'My API',
    version: '1.0.0',
  },
  servers: [
    { url: 'http://localhost:3000' },
  ],
};
```

### Generate `openapi.json`

Using the high-level `OpenAPI.initialize()` method, an `openapi.json` is automatically
generated when you start your server with `--generate-openapi` command-line argument:

```sh
node server.mjs --generate-openapi
```

When the file is generated the server exits. This step usually required only once per build/deploy.

* `openapi.json` will be written to the current working directory
* if you enabled auto-serving, `GET /openapi.json` can serve it

## Decorators

### `@path(path: string)`

* Class-level: base path prefix(es)
* Method-level: route path(s) relative to the class base path
* Can be applied multiple times (registers multiple endpoints)

```ts
@path('/v1')
@path('/v2')
class UserController {
  @path('/login')
  @path('/auth')
  login(req: express.Request, res: express.Response) {}
}
```

### `@method(method: 'GET' | 'POST' | ...)`

* Class-level: default method for handlers without method-level `@method`
* Method-level: per-handler verb

### `@middleware(...handlers: express.RequestHandler[])`

* Class-level middleware runs before method-level middleware
* Effective chain: `[...classMiddlewares, ...methodMiddlewares]`

### `@tag(...tags: string[])`

* Class-level tags are applied to all operations
* Method-level tags are appended
* Deduped with `Set`

### `@summary(text: string)`

* Method only
* Sets OpenAPI `summary`

### `@description(text: string)`

* Method only
* Sets OpenAPI `description`

### `@operationId(id: string)`

* Method only
* Sets OpenAPI `operationId`
* If omitted, the method name is used (when available)

### `@requestBody(body: RequestBodyObject | string)`

* Method only
* `string` shorthand resolves to `#/components/schemas/<name>`
* Supports `Name[]` for array bodies

```ts
@requestBody('CreateNotebookRequest')
@requestBody('Notebook[]')
```

### `@response(code: number, content?, description?, headers?)`

* Method or class
* Method-level responses are combined with class-level defaults
* `content` forms:

  * `string` → shorthand for `application/json` schema ref
  * `Record<contentType, schemaName>` → shorthand map
  * `ContentObject` → full OpenAPI content

Examples:

```ts
@response(200, 'Notebook')
@response(200, { 'application/json': 'Notebook' })
@response(201, {
  'application/json': { schema: { $ref: '#/components/schemas/Notebook' } },
}, 'Created')
@response(204)
@response(404)
```

Default descriptions/content exist for some common codes (200/204/400/401/403/404/500) when you omit `content`.

## Schema components generation (`components.schemas`)

If you provide `schemaComponentsGlob`, the generator will attempt to build schemas using `ts-json-schema-generator`.

Convention used by the included implementation:

* one schema per declaration file
* filename (without extension) is the exported symbol name used as the root type

Example layout:

```
src/user/http-dto/User.d.mts
src/user/http-dto/CreateUserRequest.d.mts
```

Then:

```ts
getOpenAPISchema(baseOpenAPISchema, controllers, 'src/**/http-dto/*.d.mts');
```

This will merge into:

* `openapi.components.schemas.User`
* `openapi.components.schemas.CreateUserRequest`

Notes:

* The current implementation rewrites `const` to `enum` and inlines internal `#/definitions/*` refs.
* This is best-effort; complex TS types may need tweaks.

## How routing is discovered

A class method is registered as a route handler only if:

* it has at least one method-level `@path(...)`

Resolution rules:

* `path` = `<each class @path>` + `<each method @path>`
* `method` = `<method @method>` else `<class @method>` else `GET`
* `middlewares` = `[...class @middleware, ...method @middleware]`

## Express param pattern support

Express route params like:

* `/:id` → `/{id}`
* `/:name(a|b|c)` → `enum: ['a','b','c']` (when pattern looks like a pipe-delimited list)
* `/:id([0-9]+)` → `pattern: '[0-9]+'`

## License
MIT
