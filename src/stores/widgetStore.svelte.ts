/**
 * @file src/stores/widgetStore.svelte.ts
 * @description Centralized widget state management using Svelte 5 runes.
 *
 * This store handles:
 * - Scanning and loading both core and custom widgets.
 * - Initializing widgets with tenant-specific and database-driven status.
 * - Providing a unified registry for widget functions.
 * - Tracking active widgets and their dependencies.
 */

import { logger } from '@utils/logger';
import type { DatabaseAdapter, WidgetStatus } from '@src/databases/dbInterface';
import type { WidgetFactory, WidgetDefinition } from '@src/widgets/types';
import { coreModules, customModules } from '@src/widgets/scanner';

/**
 * Registry for all available widget functions
 */
export type WidgetRegistry = Record<string, WidgetFactory | WidgetDefinition>;

class WidgetState {
	widgetFunctions = $state<WidgetRegistry>({});
	coreWidgets = $state<string[]>([]);
	customWidgets = $state<string[]>([]);
	activeWidgets = $state<string[]>([]);
	tenantId = $state<string>('default');
	initialized = $state(false);

	async initialize(tenantId = 'default', dbAdapter?: DatabaseAdapter | null) {
		if (this.initialized && this.tenantId === tenantId) return;

		this.tenantId = tenantId;
		logger.info(`[WidgetStore] Initializing for tenant: ${tenantId}`);

		try {
			// 1. Load modules from scanner
			this.coreWidgets = [];
			this.customWidgets = [];

			for (const [path, module] of Object.entries(coreModules)) {
				const name = path.split('/').at(-2);
				if (!name || typeof (module as any).default !== 'function') continue;

				const fn = (module as any).default as WidgetFactory;
				this.widgetFunctions[name] = fn;
				this.coreWidgets.push(name);
			}

			for (const [path, module] of Object.entries(customModules)) {
				const name = path.split('/').at(-2);
				if (!name || typeof (module as any).default !== 'function') continue;

				const fn = (module as any).default as WidgetFactory;
				this.widgetFunctions[name] = fn;
				this.customWidgets.push(name);
			}

			// 2. Load active status from DB if available
			if (dbAdapter) {
				const activeRes = await dbAdapter.widgets.getActiveWidgets();
				if (activeRes.success) {
					this.activeWidgets = (activeRes.data ?? []).map((w) => w.name);
				}
			} else if (typeof window !== 'undefined') {
				// Fallback to API if adapter not passed (client-side)
				const res = await fetch('/api/widgets/status');
				if (res.ok) {
					const data = await res.json();
					this.activeWidgets = data.activeWidgets || [];
				}
			}

			this.initialized = true;
			logger.info(`[WidgetStore] Initialized: ${this.coreWidgets.length} core, ${this.customWidgets.length} custom widgets.`);
		} catch (e) {
			logger.error('[WidgetStore] Initialization failed:', e);
		}
	}

	async updateStatus(name: string, status: WidgetStatus, tenantId?: string) {
		const active = status === ('active' as WidgetStatus);
		if (active && !this.activeWidgets.includes(name)) {
			this.activeWidgets.push(name);
		} else if (!active) {
			this.activeWidgets = this.activeWidgets.filter((w) => w !== name);
		}

		// Sync to DB
		try {
			await this.updateInDatabase(name, active, tenantId || this.tenantId);
		} catch (e) {
			logger.error(`[WidgetStore] Failed to sync status for ${name}:`, e);
		}
	}

	async reload(tenantId?: string) {
		this.initialized = false;
		await this.initialize(tenantId || this.tenantId);
	}

	getWidgetDependencies(name: string): string[] {
		const widget = this.widgetFunctions[name];
		if (!widget || typeof (widget as any).getDependencies !== 'function') return [];
		return (widget as any).getDependencies();
	}

	getWidgetFunction(name: string): WidgetFactory | WidgetDefinition | null {
		return this.widgetFunctions[name] || null;
	}

	isWidgetCore(name: string): boolean {
		return this.coreWidgets.includes(name);
	}

	private async updateInDatabase(name: string, active: boolean, tenantId: string) {
		// Implementation for DB sync (typically via API on client)
		if (typeof window !== 'undefined') {
			await fetch('/api/widgets/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': tenantId },
				body: JSON.stringify({ name, active })
			});
		}
	}
}

export const widgets = new WidgetState();

// --- Backward Compatibility Layer ---

function createArrayProxy(getArray: () => string[]) {
	return new Proxy([], {
		get(_, prop) {
			const arr = getArray();
			if (prop === 'value') return arr;
			if (prop === 'subscribe') {
				return (fn: (v: string[]) => void) => {
					return $effect.root(() => {
						$effect(() => fn(getArray()));
					});
				};
			}
			const val = (arr as any)[prop];
			return typeof val === 'function' ? val.bind(arr) : val;
		}
	}) as any;
}

export const widgetStoreActions = {
	get activeWidgets() {
		return widgets.activeWidgets;
	},
	get coreWidgets() {
		return widgets.coreWidgets;
	},
	get customWidgets() {
		return widgets.customWidgets;
	},
	initializeWidgets: (tenantId?: string, dbAdapter?: DatabaseAdapter | null) => widgets.initialize(tenantId, dbAdapter),
	updateWidgetStatus: (name: string, status: WidgetStatus, tenantId?: string) => widgets.updateStatus(name, status, tenantId),
	getWidgetDependencies: (name: string) => widgets.getWidgetDependencies(name),
	getWidgetFunction: (name: string) => widgets.getWidgetFunction(name)
};

export const widgetFunctions = new Proxy(widgets.widgetFunctions, {
	get(_, p) {
		if (p === 'value') return widgets.widgetFunctions;
		return (widgets.widgetFunctions as any)[p];
	},
	set(_, p, v) {
		if (p === 'value') {
			widgets.widgetFunctions = v;
			return true;
		}
		(widgets.widgetFunctions as any)[p] = v;
		return true;
	}
}) as any;

export const activeWidgets = createArrayProxy(() => widgets.activeWidgets);
export const coreWidgets = createArrayProxy(() => widgets.coreWidgets);
export const customWidgets = createArrayProxy(() => widgets.customWidgets);

export const initializeWidgets = widgetStoreActions.initializeWidgets;
export const updateWidgetStatus = widgetStoreActions.updateWidgetStatus;
export const getWidgetDependencies = widgetStoreActions.getWidgetDependencies;
export const getWidgetFunction = widgetStoreActions.getWidgetFunction;
export const isWidgetCore = (name: string) => widgets.isWidgetCore(name);

// HMR
if (import.meta.hot) {
	import.meta.hot.accept(() => {
		widgets.reload();
	});
}
