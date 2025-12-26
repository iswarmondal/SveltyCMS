/**
 * @file src/utils/errorHandling.ts
 * @description Robust, type-safe error handling utilities for Svelte 5 apps
 *
 * Features:
 * - Custom AppError with status & details
 * - Type guards for AppError & HttpError
 * - Safe message extraction
 * - Error wrapping with fallbacks
 */

export class AppError extends Error {
	status: number;
	original?: unknown;
	details?: Record<string, unknown>;

	constructor(message: string, status = 500, original?: unknown, details?: Record<string, unknown>) {
		super(message);
		this.name = 'AppError';
		this.status = status;
		this.original = original;
		this.details = details;

		if (original instanceof Error) this.stack = original.stack;
	}
}

export function isAppError(err: unknown): err is AppError {
	return err instanceof AppError;
}

export interface HttpError {
	status: number;
	body?: { message?: string };
}

export function isHttpError(err: unknown): err is HttpError {
	return typeof err === 'object' && err !== null && 'status' in err && typeof (err as any).status === 'number';
}

/** Safe error message extraction */
export function getErrorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (typeof err === 'string') return err;
	if (isHttpError(err) && err.body?.message) return err.body.message;
	if (err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
		return (err as any).message;
	}
	try {
		const str = JSON.stringify(err);
		return str !== '{}' ? str : String(err);
	} catch {
		return String(err);
	}
}

/** Normalize any error to AppError */
export function wrapError(err: unknown, defaultMessage = 'Unexpected error', defaultStatus = 500): AppError {
	if (err instanceof AppError) return err;

	const message = getErrorMessage(err) || defaultMessage;
	const status = isHttpError(err) ? err.status : defaultStatus;

	return new AppError(message, status, err);
}
