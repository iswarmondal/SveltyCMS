/**
 * @file src/stores/myToastStore.svelte.ts
 * @description Improved toast store with better type safety and security
 */

export type ToastBackground = 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error';

export interface Toast {
	id: string;
	message: string;
	background: ToastBackground;
	classes?: string;
	autohide?: boolean;
	timeout?: number;
}

export interface ToastSettings {
	message: string;
	background?: ToastBackground;
	classes?: string;
	autohide?: boolean;
	timeout?: number;
}

class MyToastStore {
	toasts = $state<Toast[]>([]);
	private timeouts = new Map<string, number>();

	/**
	 * Trigger a new toast notification
	 * @param settings - Toast configuration
	 * @returns The unique ID of the created toast
	 */
	trigger(settings: ToastSettings): string {
		// Generate unique ID
		const id = crypto.randomUUID();

		// Sanitize message to prevent XSS
		const sanitizedMessage = this.sanitizeString(settings.message);

		// Validate background value
		const validBackgrounds: ToastBackground[] = ['primary', 'secondary', 'tertiary', 'success', 'warning', 'error'];
		const background = validBackgrounds.includes(settings.background as ToastBackground) ? (settings.background as ToastBackground) : 'primary';

		// Create toast object with defaults
		const toast: Toast = {
			id,
			message: sanitizedMessage,
			background,
			classes: settings.classes || '',
			autohide: settings.autohide ?? true,
			timeout: settings.timeout ?? 4000
		};

		// Add to store
		this.toasts.push(toast);

		// Set up auto-dismiss if enabled
		if (toast.autohide && toast.timeout && toast.timeout > 0) {
			const timeoutId = window.setTimeout(() => {
				this.dismiss(id);
			}, toast.timeout);

			this.timeouts.set(id, timeoutId);
		}

		return id;
	}

	/**
	 * Dismiss a specific toast by ID
	 */
	dismiss(id: string): void {
		// Clear timeout if exists
		const timeoutId = this.timeouts.get(id);
		if (timeoutId !== undefined) {
			window.clearTimeout(timeoutId);
			this.timeouts.delete(id);
		}

		// Remove from toasts array
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}

	/**
	 * Clear all toasts
	 */
	clear(): void {
		// Clear all timeouts
		this.timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
		this.timeouts.clear();

		// Clear all toasts
		this.toasts = [];
	}

	/**
	 * Pause auto-dismiss for a specific toast (useful for hover)
	 */
	pause(id: string): void {
		const timeoutId = this.timeouts.get(id);
		if (timeoutId !== undefined) {
			window.clearTimeout(timeoutId);
			this.timeouts.delete(id);
		}
	}

	/**
	 * Resume auto-dismiss for a specific toast
	 */
	resume(id: string, timeout: number): void {
		const timeoutId = window.setTimeout(() => {
			this.dismiss(id);
		}, timeout);

		this.timeouts.set(id, timeoutId);
	}

	/**
	 * Sanitize string input to prevent XSS attacks
	 */
	private sanitizeString(str: string): string {
		// In SSR, document is not available. Return string as is or use a library.
		if (typeof document === 'undefined') return str;

		// Create a temporary element to leverage browser's HTML parsing
		const temp = document.createElement('div');
		temp.textContent = str;
		return temp.textContent || '';
	}
}

// Export singleton instance
export const myToastStore = new MyToastStore();
