/**
 * @file src/stores/collectionStore.svelte.ts
 * @description Unified collection store with mode & status management
 */

import type { Schema, StatusType } from '@src/content/types';
import { StatusTypes } from '@src/content/types';
import type { ContentNode } from '@src/content/types';
import { logger } from '@utils/logger';
import { updateEntryStatus } from '@src/utils/apiClient';
import { showToast } from '@utils/toast';
import { dataChangeStore } from './store.svelte';

export type ModeType = 'view' | 'edit' | 'create' | 'delete' | 'modify' | 'media';

export interface Widget {
	permissions: Record<string, Record<string, boolean>>;
	[key: string]: unknown;
}

// --- Private State ---
class CollectionState {
	// Collections
	collections = $state<Record<string, Schema>>({});
	unAssigned = $state<Schema>({} as Schema);

	// Active collection & entry
	collection = $state<Schema | null>(null);
	collectionValue = $state<Record<string, unknown>>({});
	contentStructure = $state<ContentNode[]>([]);

	// Mode & widgets
	mode = $state<ModeType>('view');
	targetWidget = $state<Widget>({ permissions: {} });

	// Selection
	selectedEntries = $state<string[]>([]);

	// Status
	statusLoading = $state(false);
	lastToggle = $state(0);

	// --- Computed ---
	get isPublish(): boolean {
		const status = this.collectionValue.status as StatusType | undefined;
		return status ? status === StatusTypes.publish : (this.collection?.status ?? StatusTypes.unpublish) === StatusTypes.publish;
	}

	get currentStatus(): StatusType {
		const status = this.collectionValue.status as StatusType | undefined;
		return status ?? this.collection?.status ?? StatusTypes.unpublish;
	}

	get totalCollections(): number {
		return Object.keys(this.collections).length;
	}

	get hasSelectedEntries(): boolean {
		return this.selectedEntries.length > 0;
	}

	// --- Mode Transitions ---
	async transitionTo(newMode: ModeType): Promise<boolean> {
		if (this.mode === newMode) return true;

		const allowed: Record<ModeType, ModeType[]> = {
			view: ['create', 'edit', 'media'],
			create: ['view', 'edit'],
			edit: ['view', 'create'],
			media: ['view'],
			delete: [],
			modify: []
		};

		if (!allowed[this.mode]?.includes(newMode) && newMode !== 'view') {
			logger.error(`Invalid transition: ${this.mode} → ${newMode}`);
			return false;
		}

		// Block if unsaved changes
		if ((this.mode === 'create' || this.mode === 'edit') && newMode === 'view' && dataChangeStore.hasChanges) {
			return false;
		}

		this.mode = newMode;
		logger.debug(`Mode: ${this.mode} → ${newMode}`);
		return true;
	}

	// --- Status Toggle ---
	async toggleStatus(publish: boolean, _source?: string): Promise<boolean> {
		if (publish === this.isPublish) return true;
		if (this.statusLoading || Date.now() - this.lastToggle < 500) return false;

		this.statusLoading = true;
		this.lastToggle = Date.now();

		const newStatus = publish ? StatusTypes.publish : StatusTypes.unpublish;

		try {
			if (this.collectionValue._id && this.collection?._id) {
				const res = await updateEntryStatus(String(this.collection._id), String(this.collectionValue._id), newStatus);

				if (res.success) {
					this.collectionValue = {
						...this.collectionValue,
						status: newStatus,
						_scheduled: undefined
					};
					showToast(publish ? 'Published' : 'Unpublished', 'success');
					return true;
				}

				showToast(res.error ?? 'Status update failed', 'error');
				return false;
			}

			// Local-only update
			this.collectionValue = { ...this.collectionValue, status: newStatus };
			return true;
		} catch (e) {
			showToast('Status update error', 'error');
			return false;
		} finally {
			this.statusLoading = false;
		}
	}
}

const state = new CollectionState();

// --- Compatibility Layer Helpers ---
function proxy<T>(get: () => T, set: (v: T) => void) {
	return {
		get value() {
			return get();
		},
		set value(v: T) {
			set(v);
		},
		get current() {
			return get();
		}, // Support .current from user's code
		set current(v: T) {
			set(v);
		},
		set(v: T) {
			set(v);
		},
		update(fn: (v: T) => T) {
			set(fn(get()));
		},
		subscribe(fn: (v: T) => void) {
			return $effect.root(() => {
				$effect(() => fn(get()));
			});
		}
	};
}

// --- Public API ---

// Direct exports (reactive via $state)
export const collections = state.collections;
export const unAssigned = state.unAssigned;
export const selectedEntries = state.selectedEntries;

// Proxy-based store wrappers (Legacy compatibility)
export const collection = proxy(
	() => state.collection,
	(v) => (state.collection = v)
);

export const collectionValue = proxy(
	() => state.collectionValue,
	(v) => (state.collectionValue = v)
);

export const contentStructure = proxy(
	() => state.contentStructure,
	(v) => (state.contentStructure = v)
);

export const targetWidget = proxy(
	() => state.targetWidget,
	(v) => (state.targetWidget = v)
);

export const mode = proxy(
	() => state.mode,
	(v) => state.transitionTo(v)
);

// Backward compatibility functions
export const setCollection = (v: Schema | null) => (state.collection = v);
export const setCollectionValue = (v: Record<string, unknown>) => (state.collectionValue = v);
export const setTargetWidget = (v: Widget) => (state.targetWidget = v);
export const setContentStructure = (v: ContentNode[]) => (state.contentStructure = v);
export const setMode = (v: ModeType) => state.transitionTo(v);
export const setModifyEntry = (v: any) => (state.collectionValue = v);

// Status API
export const status = {
	get isPublish() {
		return state.isPublish;
	},
	get isLoading() {
		return state.statusLoading;
	},
	get current() {
		return state.currentStatus;
	},
	toggle: (v: boolean) => state.toggleStatus(v)
};

/** Alias for backward compatibility */
export const statusStore = {
	get isPublish() {
		return state.isPublish;
	},
	get isLoading() {
		return state.statusLoading;
	},
	get currentStatus() {
		return state.currentStatus;
	},
	toggleStatus: (v: boolean, source?: string) => state.toggleStatus(v, source),
	getStatusForSave: () => state.currentStatus
};
export const statusMap = statusStore;

/** Alias for backward compatibility */
export const modeStateMachine = {
	transitionTo: (m: ModeType) => state.transitionTo(m)
};

// Selection API
export const selection = {
	add: (id: string) => {
		if (!state.selectedEntries.includes(id)) state.selectedEntries.push(id);
	},
	remove: (id: string) => {
		const i = state.selectedEntries.indexOf(id);
		if (i > -1) state.selectedEntries.splice(i, 1);
	},
	clear: () => {
		state.selectedEntries = [];
	},
	get count() {
		return state.selectedEntries.length;
	},
	get hasSelection() {
		return state.selectedEntries.length > 0;
	}
};

/** Alias for backward compatibility */
export const entryActions = {
	add: (id: string) => selection.add(id),
	remove: (id: string) => selection.remove(id),
	clear: () => selection.clear()
};

// Computed
export const computed = {
	get totalCollections() {
		return state.totalCollections;
	}
};
