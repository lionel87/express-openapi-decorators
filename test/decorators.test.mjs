import test from 'node:test';
import assert from 'node:assert/strict';
import { applyClassDecorator, applyMethodDecorator, createRegistrar, packageApi } from '../.test-helpers.mjs';

const {
	method,
	path,
	middleware,
	tag,
	summary,
	description,
	operationId,
	parameter,
	requestBody,
	header,
	query,
	cookie,
	response,
	registerControllers,
	getOpenAPISchema,
	nameToSchemaRef,
} = packageApi;

test('nameToSchemaRef returns component refs for objects and arrays', () => {
	assert.deepEqual(nameToSchemaRef('User'), { $ref: '#/components/schemas/User' });
	assert.deepEqual(nameToSchemaRef('User[]'), {
		type: 'array',
		items: { $ref: '#/components/schemas/User' },
	});
});

test('registerControllers resolves class and method metadata', async () => {
	const classMw = (_req, _res, next) => next();
	const methodMw = (_req, _res, next) => next();

	class DemoController {
		list() {
			return 'ok';
		}

		create() {
			return 'created';
		}
	}

	applyClassDecorator(DemoController, path('/api'));
	applyClassDecorator(DemoController, method('GET'));
	applyClassDecorator(DemoController, middleware(classMw));
	applyMethodDecorator(DemoController, 'list', path('/:id([0-9]+)'));
	applyMethodDecorator(DemoController, 'list', middleware(methodMw));
	applyMethodDecorator(DemoController, 'create', path('/items'));
	applyMethodDecorator(DemoController, 'create', method('POST'));

	const controllerInstance = new DemoController();
	const registrar = createRegistrar();
	const info = registerControllers(registrar, controllerInstance);

	assert.equal(info.length, 2);
	assert.deepEqual(info.map((item) => ({ method: item.method, path: item.path })), [
		{ method: 'GET', path: '/api/:id([0-9]+)' },
		{ method: 'POST', path: '/api/items' },
	]);
	assert.deepEqual(info[0].middlewares, [classMw, methodMw]);
	assert.equal(registrar.calls.length, 2);
	assert.equal(registrar.calls[0].verb, 'get');
	assert.equal(registrar.calls[0].routePath, '/api/:id([0-9]+)');
	assert.deepEqual(registrar.calls[0].handlers.slice(0, 2), [classMw, methodMw]);
	assert.equal(await registrar.calls[0].handlers[2](), 'ok');
	assert.equal(registrar.calls[1].verb, 'post');
	assert.equal(await registrar.calls[1].handlers[1](), 'created');
});

test('getOpenAPISchema generates operations, parameters, bodies and responses', () => {
	class PetController {
		create() {}
	}

	applyClassDecorator(PetController, path('/pets'));
	applyClassDecorator(PetController, method('POST'));
	applyClassDecorator(PetController, tag('pets', 'animals'));
	applyClassDecorator(PetController, parameter({
		name: 'traceId',
		in: 'header',
		required: false,
		description: 'Trace identifier',
		schema: { type: 'string' },
	}));
	applyClassDecorator(PetController, query('locale', { type: 'string', enum: ['en', 'hu'] }, 'Response locale'));
	applyClassDecorator(PetController, query('limit', { type: 'integer', minimum: 1 }, 'Default page size'));
	applyClassDecorator(PetController, header('x-client-version', { type: 'string' }, 'Client version'));
	applyClassDecorator(PetController, cookie('session', { type: 'string' }, 'Session cookie'));
	applyClassDecorator(PetController, response(404));
	applyMethodDecorator(PetController, 'create', path('/:kind(cat|dog)/:id([0-9]+)'));
	applyMethodDecorator(PetController, 'create', tag('animals', 'create'));
	applyMethodDecorator(PetController, 'create', summary('Create pet'));
	applyMethodDecorator(PetController, 'create', description('Creates a pet.'));
	applyMethodDecorator(PetController, 'create', operationId('createPet'));
	applyMethodDecorator(PetController, 'create', parameter({
		name: 'traceId',
		in: 'header',
		required: true,
		description: 'Request trace identifier',
		schema: { type: 'string', minLength: 8 },
	}));
	applyMethodDecorator(PetController, 'create', query('limit', { type: 'integer', minimum: 1, maximum: 100 }, 'Overridden page size', true));
	applyMethodDecorator(PetController, 'create', query('filter', 'PetFilter', 'Optional filter'));
	applyMethodDecorator(PetController, 'create', header('x-request-id', { type: 'string' }, 'Request identifier', true));
	applyMethodDecorator(PetController, 'create', cookie('mode', { type: 'string', enum: ['preview', 'live'] }, 'Rendering mode'));
	applyMethodDecorator(PetController, 'create', requestBody('CreatePetRequest'));
	applyMethodDecorator(PetController, 'create', response(201, 'Pet', 'Created'));

	const openapi = getOpenAPISchema({
		openapi: '3.1.0',
		info: { title: 'Test', version: '1.0.0' },
		paths: {},
	}, [new PetController()]);

	const operation = openapi.paths['/pets/{kind}/{id}'].post;
	assert.deepEqual(operation.tags, ['pets', 'animals', 'create']);
	assert.equal(operation.summary, 'Create pet');
	assert.equal(operation.description, 'Creates a pet.');
	assert.equal(operation.operationId, 'createPet');
	assert.deepEqual(operation.parameters, [
		{ name: 'traceId', in: 'header', required: true, description: 'Request trace identifier', schema: { type: 'string', minLength: 8 } },
		{ name: 'locale', in: 'query', required: false, description: 'Response locale', schema: { type: 'string', enum: ['en', 'hu'] } },
		{ name: 'limit', in: 'query', required: true, description: 'Overridden page size', schema: { type: 'integer', minimum: 1, maximum: 100 } },
		{ name: 'x-client-version', in: 'header', required: false, description: 'Client version', schema: { type: 'string' } },
		{ name: 'session', in: 'cookie', required: false, description: 'Session cookie', schema: { type: 'string' } },
		{ name: 'filter', in: 'query', required: false, description: 'Optional filter', schema: { $ref: '#/components/schemas/PetFilter' } },
		{ name: 'x-request-id', in: 'header', required: true, description: 'Request identifier', schema: { type: 'string' } },
		{ name: 'mode', in: 'cookie', required: false, description: 'Rendering mode', schema: { type: 'string', enum: ['preview', 'live'] } },
	]);
	assert.deepEqual(operation.requestBody, {
		content: {
			'application/json': { schema: { $ref: '#/components/schemas/CreatePetRequest' } },
		},
		required: true,
	});
	assert.deepEqual(openapi.paths['/pets/{kind}/{id}'].parameters, [
		{ name: 'kind', in: 'path', required: true, schema: { type: 'string', enum: ['cat', 'dog'] } },
		{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '[0-9]+' } },
	]);
	assert.deepEqual(operation.responses['201'], {
		description: 'Created',
		content: {
			'application/json': { schema: { $ref: '#/components/schemas/Pet' } },
		},
		headers: undefined,
	});
	assert.equal(operation.responses['404'].description, 'Not found');
});

test('getOpenAPISchema throws on duplicate method/path combinations', () => {
	class FirstController {
		read() {}
	}
	class SecondController {
		read() {}
	}

	for (const Cls of [FirstController, SecondController]) {
		applyClassDecorator(Cls, path('/items'));
		applyClassDecorator(Cls, method('GET'));
		applyMethodDecorator(Cls, 'read', path('/:id'));
	}

	assert.throws(() => getOpenAPISchema({
		openapi: '3.1.0',
		info: { title: 'Test', version: '1.0.0' },
		paths: {},
	}, [new FirstController(), new SecondController()]), /Duplicate path definition/);
});
