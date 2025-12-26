/**
 * @file src/widgets/proxy.ts
 * @description Widget proxy with factory pattern, fallback handling & type safety
 *
 * Features:
 * - Dynamic loading of core/custom widgets
 * - Alias registration (folder name → widget.Name)
 * - Graceful missing widget fallback (production)
 * - Proxy-based access with autocomplete
 * - Registry utilities
 */

import { coreModules, customModules } from '@src/widgets/scanner';
import type { WidgetFactory, WidgetType } from './types';
import { logger } from '@utils/logger';

interface WidgetInfo {
	name: string;
	factory: WidgetFactory;
	type: WidgetType;
	path: string;
}

// Process single widget module
function processModule(path: string, mod: any, type: WidgetType): WidgetInfo | null {
	try {
		if (!mod?.default || typeof mod.default !== 'function') {
			logger.warn(`[Widget Proxy] Invalid export: ${path}`);
			return null;
		}

		const factory = mod.default as WidgetFactory;
		if (!factory.Name) {
			logger.warn(`[Widget Proxy] Missing Name: ${path}`);
			return null;
		}

		// Folder name for alias
		const folder = path.split('/').at(-2);
		const name = factory.Name;

		factory.__widgetType = type;

		return { name, factory, type, path: folder ?? '' };
	} catch (err) {
		logger.error(`[Widget Proxy] Failed to process ${path}`, err);
		return null;
	}
}

// Registry implementation
class Registry {
	private map = new Map<string, WidgetFactory>();
	private meta = new Map<string, { type: WidgetType; path: string }>();

	register(name: string, factory: WidgetFactory, type: WidgetType, path: string): void {
		this.map.set(name, factory);
		this.meta.set(name, { type, path });
	}

	get(name: string): WidgetFactory | undefined {
		return this.map.get(name);
	}

	has(name: string): boolean {
		return this.map.has(name);
	}

	list(): string[] {
		return Array.from(this.map.keys());
	}

	byType(type: WidgetType): string[] {
		return Array.from(this.meta.entries())
			.filter(([, m]) => m.type === type)
			.map(([n]) => n);
	}

	metadata(name: string) {
		return this.meta.get(name);
	}
}

const registry = new Registry();

// Load core widgets
for (const [path, mod] of Object.entries(coreModules)) {
	const info = processModule(path, mod, 'core');
	if (info) {
		registry.register(info.name, info.factory, info.type, info.path);
		if (info.path && info.path !== info.name) {
			registry.register(info.path, info.factory, info.type, info.path);
		}
	}
}

// Load custom widgets
for (const [path, mod] of Object.entries(customModules)) {
	const info = processModule(path, mod, 'custom');
	if (info) {
		registry.register(info.name, info.factory, info.type, info.path);
		if (info.path && info.path !== info.name) {
			registry.register(info.path, info.factory, info.type, info.path);
		}
	}
}

logger.info(`[Widget Proxy] Loaded ${registry.byType('core').length} core + ${registry.byType('custom').length} custom widgets`);

// Missing widget fallback (production only)
function missingFactory(name: string): WidgetFactory {
	const fn = ((cfg: any) => ({
		widget: { Name: 'MissingWidget', Description: `Widget "${name}" missing` },
		label: cfg.label ?? 'Missing',
		db_fieldName: cfg.db_fieldName ?? 'missing',
		required: false,
		translated: false,
		__isMissing: true,
		__missingName: name
	})) as any;

	fn.Name = 'MissingWidget';
	fn.Icon = 'mdi:alert-circle';
	fn.Description = `Widget "${name}" not available`;
	fn.__widgetType = 'custom';
	fn.toString = () => '';

	return fn;
}

// Proxy with fallback
export const widgetProxy = new Proxy(registry, {
	get(target, prop) {
		if (typeof prop !== 'string') return undefined;
		if (prop in target && typeof (target as any)[prop] === 'function') {
			return (target as any)[prop].bind(target);
		}

		const factory = target.get(prop);
		if (factory) return factory;

		logger.warn(`[Widget Proxy] Missing widget: ${prop}`);
		return process.env.NODE_ENV === 'production' ? missingFactory(prop) : undefined;
	},
	has(target, prop) {
		return typeof prop === 'string' && target.has(prop);
	},
	ownKeys(target) {
		return target.list();
	},
	getOwnPropertyDescriptor(target, prop) {
		if (typeof prop !== 'string' || !target.has(prop)) return undefined;
		return { enumerable: true, configurable: true };
	}
}) as unknown as {
	[K: string]: WidgetFactory;
} & Registry;

// Public exports
export const widgets = widgetProxy;
export const widgetRegistry = registry;

export const isWidgetAvailable = (name: string) => registry.has(name);
export const getAvailableWidgets = () => registry.list();
export const getWidgetsByType = (type: WidgetType) => registry.byType(type);
export const getWidgetMetadata = (name: string) => registry.metadata(name);
