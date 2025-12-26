/**
 * @file src/utils/toast.ts
 * Centralized toast utility for consistent notifications across modals/components.
 */

// No longer need global store setting since we perform direct import of the singleton
// but we keep the function to avoid breaking imports, just make it no-op
// import { getToastStore, type ToastStore } from '@skeletonlabs/skeleton';
import { logger } from '@utils/logger';
import { myToastStore } from '@stores/myToastStore.svelte';

export function setGlobalToastStore(store?: any): void {
	// No-op
}

export type ToastType = 'success' | 'info' | 'warning' | 'error';

/**
 * Displays a toast notification.
 * @param message The message to display. Can include HTML (e.g., iconify-icon).
 * @param type The type of toast (success, info, warning, error). Defaults to 'info'.
 * @param timeout Custom timeout in milliseconds. Defaults to 3000ms.
 */
export function showToast(message: string, type: ToastType = 'info', timeout?: number): void {
	// Map old types to new store background types
	const typeMap: Record<ToastType, 'success' | 'tertiary' | 'warning' | 'error'> = {
		success: 'success',
		info: 'tertiary',
		warning: 'warning',
		error: 'error'
	};

	// Use the custom store
	myToastStore.trigger({
		message,
		background: typeMap[type] || 'primary',
		timeout: timeout || 4000,
		classes: 'shadow-black/30'
	});
}
