import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { createTempSchemaDir, packageApi } from '../.test-helpers.mjs';

const { getOpenAPISchema } = packageApi;

test('getOpenAPISchema inlines simple definitions but keeps self references', () => {
	const dir = createTempSchemaDir({
		'User.d.mts': [
			'interface Address {',
			'\tcity: string;',
			'}',
			'export interface User {',
			'\taddress?: Address;',
			'}',
		].join('\n'),
		'Node.d.mts': [
			'export interface Node {',
			'\tchildren?: Node[];',
			'}',
		].join('\n'),
	});

	try {
		const openapi = getOpenAPISchema({
			openapi: '3.1.0',
			info: { title: 'Test', version: '1.0.0' },
			paths: {},
		}, [], join(dir, '*.d.mts'));

		assert.equal(openapi.components.schemas.User.properties.address.properties.city.type, 'string');
		assert.equal(openapi.components.schemas.Node.properties.children.items.$ref, '#/components/schemas/Node');
		assert.equal(openapi.components.schemas.User_Address, undefined);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('getOpenAPISchema hoists indirectly recursive definitions into separate components', () => {
	const dir = createTempSchemaDir({
		'Tree.d.mts': [
			'interface Branch {',
			'\tnext?: Leaf;',
			'}',
			'interface Leaf {',
			'\tparent?: Branch;',
			'}',
			'export interface Tree {',
			'\troot?: Branch;',
			'}',
		].join('\n'),
	});

	try {
		const openapi = getOpenAPISchema({
			openapi: '3.1.0',
			info: { title: 'Test', version: '1.0.0' },
			paths: {},
		}, [], join(dir, '*.d.mts'));

		assert.equal(openapi.components.schemas.Tree.properties.root.$ref, '#/components/schemas/Tree_Branch');
		assert.equal(openapi.components.schemas.Tree_Branch.properties.next.$ref, '#/components/schemas/Tree_Leaf');
		assert.equal(openapi.components.schemas.Tree_Leaf.properties.parent.$ref, '#/components/schemas/Tree_Branch');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('getOpenAPISchema reuses matching top-level schemas instead of hoisting duplicates', () => {
	const dir = createTempSchemaDir({
		'WorkspaceEntry.d.mts': [
			'export interface WorkspaceEntry {',
			'\tchildren?: WorkspaceEntry[];',
			'}',
		].join('\n'),
		'WorkspaceTreeResponse.d.mts': [
			'interface WorkspaceEntry {',
			'\tchildren?: WorkspaceEntry[];',
			'}',
			'export interface WorkspaceTreeResponse {',
			'\tentries: WorkspaceEntry[];',
			'}',
		].join('\n'),
	});

	try {
		const openapi = getOpenAPISchema({
			openapi: '3.1.0',
			info: { title: 'Test', version: '1.0.0' },
			paths: {},
		}, [], join(dir, '*.d.mts'));

		assert.deepEqual(Object.keys(openapi.components.schemas).sort(), [
			'WorkspaceEntry',
			'WorkspaceTreeResponse',
		]);
		assert.equal(openapi.components.schemas.WorkspaceEntry.properties.children.items.$ref, '#/components/schemas/WorkspaceEntry');
		assert.equal(openapi.components.schemas.WorkspaceTreeResponse.properties.entries.items.$ref, '#/components/schemas/WorkspaceEntry');
		assert.equal(openapi.components.schemas.WorkspaceEntry_WorkspaceEntry, undefined);
		assert.equal(openapi.components.schemas.WorkspaceTreeResponse_WorkspaceEntry, undefined);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
