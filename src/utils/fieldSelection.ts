/**
 * @file src/utils/fieldSelection.ts
 * @description Optimized field selection for database queries
 *
 * Benefits:
 * - Reduces payload by 50-80%
 * - Faster queries & serialization
 * - Better cache efficiency
 */

import type { Schema } from '@src/content/types';
import { logger } from './logger';

const ESSENTIAL = ['_id', 'status', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'] as const;

export type ViewMode = 'list' | 'edit' | 'preview';

export interface SelectionConfig {
	maxListFields?: number;
	customListFields?: string[];
	respectShowInList?: boolean;
}

/**
 * Get optimal fields for a view mode
 */
export function getDisplayFields(collection: Schema, mode: ViewMode = 'list', config: SelectionConfig = {}): string[] {
	const { maxListFields = 5, customListFields = [], respectShowInList = true } = config;

	// Edit needs everything
	if (mode === 'edit') return ['*'];

	const selected = new Set<string>(ESSENTIAL);
	customListFields.forEach((f) => selected.add(f));

	if (mode === 'list' && collection.fields?.length) {
		const candidates: string[] = [];

		for (const field of collection.fields as any[]) {
			if (typeof field !== 'object' || field === null) continue;

			const name =
				(field.db_fieldName as string | undefined) ??
				(field.name as string | undefined) ??
				(field.label
					? String(field.label)
							.toLowerCase()
							.replace(/[^a-z0-9_]/g, '_')
					: undefined);

			if (!name) continue;

			// Priority order
			if (respectShowInList && field.showInList === true) {
				candidates.unshift(name); // highest priority
			} else if (/title|name|slug/i.test(name)) {
				candidates.push(name);
			} else if (field.sortable === true) {
				candidates.push(name);
			} else if (['text', 'textarea'].includes(field.type as string)) {
				candidates.push(name);
			}
		}

		// Take top candidates
		candidates.slice(0, maxListFields).forEach((f) => selected.add(f));
	}

	const result = Array.from(selected);

	logger.debug(`Field selection [${mode}]`, {
		collection: collection._id,
		count: result.length,
		fields: result.join(', ')
	});

	return result;
}

/**
 * MongoDB projection from field list
 */
export function toProjection(fields: string[]): Record<string, 1> | {} {
	return fields.includes('*') ? {} : Object.fromEntries(fields.map((f) => [f, 1]));
}

/**
 * Filter object to selected fields
 */
export function filterFields<T extends Record<string, any>>(obj: T, fields: string[]): Partial<T> {
	if (fields.includes('*')) return obj;
	return Object.fromEntries(fields.filter((f) => f in obj).map((f) => [f, obj[f]])) as Partial<T>;
}

/**
 * Estimate payload reduction
 */
export function estimateReduction(total: number, selected: number): number {
	return total ? Math.round(((total - selected) / total) * 100) : 0;
}
