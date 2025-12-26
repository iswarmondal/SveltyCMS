/**
 * @file src/stores/activeInputStore.svelte.ts
 * @description Global rune-based store for the currently active token input
 *
 * Features:
 * - Reactive tracking of focused input (element + metadata)
 * - Simple get/set interface
 * - Optional custom insert handler (e.g., for rich editors)
 */

export interface ActiveTokenInput {
	/** The DOM input/textarea element */
	element: HTMLInputElement | HTMLTextAreaElement | null;
	/** Field metadata for context (e.g., token picker UI) */
	field: {
		name: string;
		label?: string;
		collection?: string;
	};
	/** Optional custom insertion handler (e.g., for rich text editors) */
	onInsert?: (token: string) => void;
}

/** Private mutable state */
let active = $state<ActiveTokenInput | null>(null);

/** Primary store interface – mutable via .set() */
export const activeInputStore = {
	get value() {
		return active;
	},
	set value(v: ActiveTokenInput | null) {
		active = v;
	},
	/** Legacy/direct set method */
	set(v: ActiveTokenInput | null) {
		active = v;
	},
	/** Clear the active input */
	clear() {
		active = null;
	}
};

/** Alternative direct access (preferred in runes context) */
export const activeInput = {
	get current() {
		return active;
	},
	set current(v: ActiveTokenInput | null) {
		active = v;
	},
	clear() {
		active = null;
	}
};
