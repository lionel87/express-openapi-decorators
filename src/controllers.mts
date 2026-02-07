import { pathToFileURL } from 'node:url';
import { globSync } from 'glob';

const CONTROLLER_REGISTRY = new Set<(new (...args: any[]) => any)>();

export function controller() {
	return function (target: new (...args: any[]) => any, context: ClassDecoratorContext) {
		if (context.kind !== 'class') throw new Error('This decorator can only be used on classes.');
		CONTROLLER_REGISTRY.add(target);
	};
}

export function getControllerClasses(): (new (...args: any[]) => any)[] {
	return Array.from(CONTROLLER_REGISTRY);
}

export async function scanControllerClasses(patterns: string | string[]): Promise<(new (...args: any[]) => any)[]> {
	const files = globSync(patterns, { absolute: true });

	for (const file of files) {
		const url = pathToFileURL(file).href;
		await import(url);
	}

	return getControllerClasses();
}
