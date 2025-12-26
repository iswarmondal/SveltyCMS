/**
 * @file src/utils/Form.svelte.ts
 * @description Reactive form handler with Valibot validation & SvelteKit enhance support
 */

import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import { safeParse, flatten } from 'valibot';

interface EnhanceCallbacks {
	onSubmit?: (input: Parameters<SubmitFunction>[0]) => void;
	onResult?: (input: { result: ActionResult; update: () => Promise<void> }) => void | Promise<void>;
}

export class Form<T extends Record<string, any>> {
	/** Form data */
	data = $state<T>({} as T);
	/** Validation errors */
	errors = $state<Record<string, string[]>>({});
	/** Submission state */
	submitting = $state(false);
	/** Server message */
	message = $state<string | undefined>(undefined);

	constructor(
		initial: T,
		private schema?: any
	) {
		this.data = { ...initial };
	}

	/** Reset form state */
	reset(to?: Partial<T>) {
		if (to) Object.assign(this.data, to);
		this.errors = {} as any;
		this.message = undefined;
		this.submitting = false;
	}

	/** Client-side validation */
	validate(): boolean {
		this.errors = {} as any;
		this.message = undefined;

		if (!this.schema) return true;

		const result = safeParse(this.schema, this.data);
		if (!result.success) {
			const flat = flatten(result.issues);
			this.errors = flat.nested as Record<string, string[]>;
			return false;
		}
		return true;
	}

	/** SvelteKit form enhance */
	enhance(callbacks?: EnhanceCallbacks): SubmitFunction {
		return (input) => {
			const { formData, cancel } = input;
			this.submitting = true;
			this.errors = {} as any;
			this.message = undefined;

			// Update data from FormData
			for (const [k, v] of formData.entries()) {
				(this.data as any)[k] = v;
			}

			callbacks?.onSubmit?.(input);

			// Client validation
			if (!this.validate()) {
				cancel();
				this.submitting = false;
				return;
			}

			return async ({ result, update }) => {
				this.submitting = false;

				if (result.type === 'success' && result.data?.message) {
					this.message = result.data.message as string;
				} else if (result.type === 'failure') {
					if (result.data?.errors) this.errors = result.data.errors;
					if (result.data?.message) this.message = result.data.message as string;
				}

				if (callbacks?.onResult) {
					await callbacks.onResult({ result, update });
				} else {
					await update();
				}
			};
		};
	}

	/** Manual fetch submit */
	async submit(url: string, opts: RequestInit = {}): Promise<{ success: boolean; data?: any; error?: any }> {
		this.submitting = true;
		this.errors = {};
		this.message = undefined;

		if (!this.validate()) {
			this.submitting = false;
			return { success: false };
		}

		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(this.data),
				...opts
			});

			const json = await res.json();

			if (!res.ok) {
				this.errors = json.errors ?? {};
				this.message = json.message ?? 'Request failed';
				return { success: false, data: json };
			}

			this.message = json.message;
			return { success: true, data: json };
		} catch (err) {
			this.message = err instanceof Error ? err.message : 'Network error';
			return { success: false, error: err };
		} finally {
			this.submitting = false;
		}
	}
}
