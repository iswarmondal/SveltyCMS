/**
 * @file src/stores/store.svelte.ts
 * @description Global state management
 */

import type { Locale } from '@src/paraglide/runtime';
import { publicEnv } from '@src/stores/globalSettings.svelte';

// --- Helper Functions & Interfaces ---

// Helper function for avatar URL normalization
function normalizeAvatarUrl(url: string | null | undefined): string {
	const DEFAULT_AVATAR = '/Default_User.svg';

	// Guard: empty or null
	if (!url) return DEFAULT_AVATAR;

	// Pass-through: data URIs and absolute URLs
	if (url.startsWith('data:') || /^https?:\/\//i.test(url)) {
		return url;
	}

	// Pass-through: default avatar
	if (/^\/?Default_User\.svg$/i.test(url)) {
		return DEFAULT_AVATAR;
	}

	// Normalize: remove leading origin and slashes
	let normalized = url.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '/');

	// Guard: bare /files or /files/
	if (normalized === '/files' || normalized === '/files/') {
		return DEFAULT_AVATAR;
	}

	// Pass-through: already /files/
	if (normalized.startsWith('/files/')) {
		return normalized;
	}

	const trimmed = normalized.startsWith('/') ? normalized.slice(1) : normalized;

	// Guard: bare "files"
	if (trimmed === 'files') return DEFAULT_AVATAR;

	// Pass-through: static paths
	if (trimmed.startsWith('static/')) {
		return `/${trimmed}`;
	}

	const MEDIA_FOLDER = publicEnv.MEDIA_FOLDER;

	// Transform: mediaFiles/... → /files/...
	if (trimmed.startsWith(`${MEDIA_FOLDER}/`)) {
		const rest = trimmed.slice(MEDIA_FOLDER.length + 1);
		return `/files/${rest}`;
	}

	// Transform: avatars/... → /files/avatars/...
	if (trimmed.startsWith('avatars/')) {
		return `/files/${trimmed}`;
	}

	// Fallback: .svg → root, else → /files/
	return trimmed ? (trimmed.endsWith('.svg') ? `/${trimmed}` : `/files/${trimmed}`) : DEFAULT_AVATAR;
}

interface ValidationErrors {
	[fieldName: string]: string | null;
}

interface SaveFunction {
	fn: (args?: unknown) => unknown;
	reset: () => void;
}

export interface TranslationSet {
	total: Set<string>;
	translated: Set<string>;
}

export type TranslationProgress = {
	[key in Locale]?: TranslationSet;
} & {
	show: boolean;
};

// Helper function to get cookie value
function getCookie(name: string): string | null {
	if (typeof document === 'undefined') return null;
	const value = `; ${document.cookie}`;
	const parts = value.split(`; ${name}=`);
	if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
	return null;
}

// --- App Store (Rune-based Global State) ---

// Initialize translationProgress with a guaranteed structure
const initialTranslationProgress: TranslationProgress = { show: false };

// Safely handle the languages array to prevent server-side initialization errors
let availableLanguages: Locale[] = [];
try {
	availableLanguages = (publicEnv.AVAILABLE_CONTENT_LANGUAGES as Locale[]) || [];
} catch {
	// If not available (e.g., during server initialization), use empty array
	console.warn('publicEnv not available during store initialization, using empty languages array');
	availableLanguages = [];
}

for (const lang of availableLanguages) {
	initialTranslationProgress[lang] = {
		total: new Set<string>(),
		translated: new Set<string>()
	};
}

// Get initial values from cookies or use defaults (with error handling for server-side)
let initialSystemLanguage: Locale;
let initialContentLanguage: Locale;

try {
	initialSystemLanguage = (getCookie('systemLanguage') as Locale | null) ?? (publicEnv.BASE_LOCALE as Locale) ?? 'en';
	initialContentLanguage = (getCookie('contentLanguage') as Locale | null) ?? (publicEnv.DEFAULT_CONTENT_LANGUAGE as Locale) ?? 'en';
} catch {
	// Fallback values for server-side initialization
	initialSystemLanguage = 'en' as Locale;
	initialContentLanguage = 'en' as Locale;
}

export class AppStore {
	// Core State
	translationProgress = $state<TranslationProgress>(initialTranslationProgress);
	tabSetState = $state<number>(0);
	drawerExpandedState = $state<boolean>(true);
	listboxValueState = $state<string>('create');
	avatarSrc = $state('/Default_User.svg');
	translationStatus = $state<Record<string, unknown>>({});
	completionStatus = $state(0);
	translationStatusOpen = $state(false);

	// Context / Config (Side Effects via Getters/Setters)
	_systemLanguage = $state<Locale>(initialSystemLanguage);
	_contentLanguage = $state<Locale>(initialContentLanguage);

	// UI State
	headerActionButton = $state<ConstructorOfATypedSvelteComponent | string | undefined>(undefined);
	headerActionButton2 = $state<ConstructorOfATypedSvelteComponent | string | undefined>(undefined);
	pkgBgColor = $state('variant-filled-primary');
	file = $state<File | null>(null);
	saveEditedImage = $state(false);
	saveFunction = $state<SaveFunction>({
		fn: () => {},
		reset: () => {}
	});
	validationErrors = $state<ValidationErrors>({});

	// Other Stores
	saveLayerStore = $state<() => Promise<void>>(async () => {});
	shouldShowNextButton = $state(false);

	// Implement Getters/Setters for logic
	get systemLanguage() {
		return this._systemLanguage;
	}
	set systemLanguage(v: Locale) {
		this._systemLanguage = v;
		if (typeof document !== 'undefined' && v) {
			document.cookie = `systemLanguage=${v}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
		}
	}

	get contentLanguage() {
		return this._contentLanguage;
	}
	set contentLanguage(v: Locale) {
		this._contentLanguage = v;
		if (typeof document !== 'undefined' && v) {
			document.cookie = `contentLanguage=${v}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
		}
	}

	setAvatarSrc(v: string) {
		try {
			this.avatarSrc = normalizeAvatarUrl(v);
		} catch (error) {
			console.error('[Store] Avatar normalization failed:', error);
			this.avatarSrc = '/Default_User.svg';
		}
	}
}

export const appStore = new AppStore();

// --- Export Getters (Backward Compat) ---

export function getTranslationProgress() {
	return appStore.translationProgress;
}
export function getTabSetState() {
	return appStore.tabSetState;
}
export function getDrawerExpandedState() {
	return appStore.drawerExpandedState;
}
export function getListboxValueState() {
	return appStore.listboxValueState;
}
export function getAvatarSrc() {
	return appStore.avatarSrc;
}
export function getTranslationStatus() {
	return appStore.translationStatus;
}
export function getCompletionStatus() {
	return appStore.completionStatus;
}
export function getTranslationStatusOpen() {
	return appStore.translationStatusOpen;
}

// Function-style exports for backward compatibility
export const translationStatus = () => appStore.translationStatus;
export const completionStatus = () => appStore.completionStatus;
export const translationStatusOpen = () => appStore.translationStatusOpen;

// Export helper functions for backward compatibility
export function setTranslationStatusOpen(value: boolean) {
	appStore.translationStatusOpen = value;
}
export function updateTranslationStatus(value: Record<string, unknown>) {
	Object.assign(appStore.translationStatus, value);
}
export function updateCompletionStatus(value: number) {
	appStore.completionStatus = value;
}
export function updateTranslationStatusOpen(value: boolean) {
	appStore.translationStatusOpen = value;
}

// --- Export Proxies (Legacy Support) ---

// Helper for store-like proxy
function createProxy<T>(getter: () => T, setter: (v: T) => void) {
	return {
		get value() {
			return getter();
		},
		set value(v: T) {
			setter(v);
		},
		set(v: T) {
			setter(v);
		},
		update(fn: (v: T) => T) {
			setter(fn(getter()));
		},
		subscribe(fn: (v: T) => void) {
			return $effect.root(() => {
				$effect(() => fn(getter()));
				return () => {};
			});
		}
	};
}

export const translationProgress = createProxy(
	() => appStore.translationProgress,
	(v) => (appStore.translationProgress = v)
);

export const tabSetState = createProxy(
	() => appStore.tabSetState,
	(v) => (appStore.tabSetState = v)
);

export const drawerExpandedState = createProxy(
	() => appStore.drawerExpandedState,
	(v) => (appStore.drawerExpandedState = v)
);

export const listboxValueState = createProxy(
	() => appStore.listboxValueState,
	(v) => (appStore.listboxValueState = v)
);

export const avatarSrc = {
	get value() {
		return appStore.avatarSrc;
	},
	set value(v: string) {
		appStore.setAvatarSrc(v);
	},
	set(v: string) {
		appStore.setAvatarSrc(v);
	},
	update(fn: (v: string) => string) {
		appStore.setAvatarSrc(fn(appStore.avatarSrc));
	},
	subscribe(fn: (v: string) => void) {
		return $effect.root(() => {
			$effect(() => fn(appStore.avatarSrc));
			return () => {};
		});
	}
};

export const translationStatusStore = createProxy(
	() => appStore.translationStatus,
	(v) => (appStore.translationStatus = v as {})
);

export const completionStatusStore = createProxy(
	() => appStore.completionStatus,
	(v) => (appStore.completionStatus = v)
);

export const translationStatusOpenStore = createProxy(
	() => appStore.translationStatusOpen,
	(v) => (appStore.translationStatusOpen = v)
);

export const systemLanguage = createProxy(
	() => appStore.systemLanguage,
	(v) => (appStore.systemLanguage = v)
);

export const contentLanguage = createProxy(
	() => appStore.contentLanguage,
	(v) => (appStore.contentLanguage = v)
);

export const headerActionButton = createProxy(
	() => appStore.headerActionButton,
	(v) => (appStore.headerActionButton = v)
);

export const headerActionButton2 = createProxy(
	() => appStore.headerActionButton2,
	(v) => (appStore.headerActionButton2 = v)
);

export const pkgBgColor = createProxy(
	() => appStore.pkgBgColor,
	(v) => (appStore.pkgBgColor = v)
);

export const file = createProxy(
	() => appStore.file,
	(v) => (appStore.file = v)
);

export const saveEditedImage = createProxy(
	() => appStore.saveEditedImage,
	(v) => (appStore.saveEditedImage = v)
);

export const saveFunction = createProxy(
	() => appStore.saveFunction,
	(v) => (appStore.saveFunction = v)
);

export const validationErrors = createProxy(
	() => appStore.validationErrors,
	(v) => (appStore.validationErrors = v)
);

// Aliases for components still using old names
export const saveLayerStore = createProxy(
	() => appStore.saveLayerStore,
	(v) => (appStore.saveLayerStore = v)
);

export const shouldShowNextButton = createProxy(
	() => appStore.shouldShowNextButton,
	(v) => (appStore.shouldShowNextButton = v)
);

export const tabSet = tabSetState; // Alias
export const drawerExpanded = drawerExpandedState; // Alias
export const storeListboxValue = listboxValueState; // Alias

// Export table headers constant
export const tableHeaders = ['id', 'email', 'username', 'role', 'createdAt'] as const;

// Export indexer
export const indexer = undefined;

// --- Validation Store ---
const isDev = process.env.NODE_ENV !== 'production';
const validationLogger = isDev ? (msg: string, ...args: any[]) => console.log(msg, ...args) : () => {};

export const validationStore = {
	get errors() {
		return appStore.validationErrors;
	},
	get isValid() {
		return Object.values(appStore.validationErrors).every((error) => !error);
	},
	setError: (fieldName: string, errorMessage: string | null) => {
		appStore.validationErrors[fieldName] = errorMessage;
		validationLogger('[ValidationStore] setError:', fieldName, errorMessage);
	},
	clearError: (fieldName: string) => {
		if (fieldName in appStore.validationErrors) {
			delete appStore.validationErrors[fieldName];
			validationLogger('[ValidationStore] clearError:', fieldName);
		}
	},
	clearAllErrors: () => {
		appStore.validationErrors = {};
	},
	getError: (fieldName: string): string | null => {
		return appStore.validationErrors[fieldName] || null;
	},
	hasError: (fieldName: string): boolean => {
		return !!appStore.validationErrors[fieldName];
	},
	subscribe: (run: (value: { errors: ValidationErrors; isValid: boolean }) => void) => {
		return $effect.root(() => {
			$effect(() => {
				const errors = { ...appStore.validationErrors };
				const isValid = Object.values(errors).every((error) => !error);
				run({ errors, isValid });
			});
			return () => {};
		});
	}
};

// --- Data Change Tracking Store ---
function createDataChangeStore() {
	let hasChanges = $state<boolean>(false);
	let initialDataSnapshot = $state<string>('');

	return {
		get value() {
			return hasChanges;
		},
		get hasChanges() {
			return hasChanges;
		},
		get initialSnapshot() {
			return initialDataSnapshot;
		},
		setHasChanges: (value: boolean) => {
			hasChanges = value;
		},
		setInitialSnapshot: (data: Record<string, unknown>) => {
			initialDataSnapshot = JSON.stringify(data);
			hasChanges = false;
		},
		compareWithCurrent: (currentData: Record<string, unknown>): boolean => {
			if (!initialDataSnapshot) return false;
			const currentSnapshot = JSON.stringify(currentData);
			const changed = currentSnapshot !== initialDataSnapshot;
			hasChanges = changed;
			return changed;
		},
		reset: () => {
			hasChanges = false;
			initialDataSnapshot = '';
		},
		subscribe: (run: (value: boolean) => void) => {
			return $effect.root(() => {
				$effect(() => run(hasChanges));
				return () => {};
			});
		}
	};
}

export const dataChangeStore = createDataChangeStore();
