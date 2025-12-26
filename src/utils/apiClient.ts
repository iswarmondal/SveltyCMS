/**
 * @file src/utils/apiClient.ts
 * @description REST client with caching, error handling & type safety
 */

import { publicEnv } from '@src/stores/globalSettings.svelte';
import { logger } from '@utils/logger';

export interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

export interface Paginated<T> {
	items: T[];
	total: number;
	totalPages: number;
	page?: number;
	pageSize?: number;
}

export interface Collection {
	_id: string;
	name: string;
	fields: Record<string, unknown>[];
}

// Cache
const CACHE_TTL = 30_000; // 30s
const cache = new Map<string, { data: Paginated<any>; ts: number }>();

function cacheKey(query: Record<string, any>): string {
	return JSON.stringify({
		collectionId: query.collectionId,
		page: query.page ?? 1,
		pageSize: query.pageSize ?? query.limit ?? 25,
		language: query.contentLanguage ?? publicEnv.DEFAULT_CONTENT_LANGUAGE,
		filter: query.filter ?? '{}',
		sort: query.sort ?? `${query.sortField ?? 'createdAt'}:${query.sortDirection ?? 'desc'}`,
		langChange: query._langChange ?? 0
	});
}

// Core fetch
async function api<T>(endpoint: string, opts: RequestInit = {}): Promise<ApiResponse<T>> {
	try {
		const res = await fetch(endpoint, {
			credentials: 'include',
			headers: { 'Content-Type': 'application/json', ...opts.headers },
			...opts
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
			return { success: false, error: err.error ?? 'Request failed' };
		}

		return await res.json();
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Network error';
		logger.error('API request failed', { endpoint, error: msg });
		return { success: false, error: msg };
	}
}

// Entry actions
export const createEntry = (collId: string, data: object) => api(`/api/collections/${collId}`, { method: 'POST', body: JSON.stringify(data) });

export const updateEntry = (collId: string, id: string, data: object) =>
	api(`/api/collections/${collId}/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

export const updateEntryStatus = (collId: string, id: string, status: string) =>
	api(`/api/collections/${collId}/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });

export const deleteEntry = (collId: string, id: string) => api(`/api/collections/${collId}/${id}`, { method: 'DELETE' });

export const batchDeleteEntries = (collId: string, ids: string[]) =>
	api(`/api/collections/${collId}/batch`, { method: 'POST', body: JSON.stringify({ action: 'delete', entryIds: ids }) });

export const batchUpdateEntries = (collId: string, payload: { ids: string[]; status?: string; [key: string]: unknown }) =>
	api(`/api/collections/${collId}/batch`, { method: 'POST', body: JSON.stringify({ action: 'update', ...payload }) });

export const createClones = (collId: string, entries: object[]) =>
	api(`/api/collections/${collId}/batch-clone`, { method: 'POST', body: JSON.stringify({ entries }) });

// Paginated data
export async function getData(query: {
	collectionId: string;
	page?: number;
	pageSize?: number;
	limit?: number;
	contentLanguage?: string;
	filter?: string;
	sortField?: string;
	sortDirection?: 'asc' | 'desc';
	_langChange?: number;
}): Promise<ApiResponse<Paginated<object>>> {
	const key = cacheKey(query);
	const cached = cache.get(key);
	if (cached && Date.now() - cached.ts < CACHE_TTL) {
		logger.debug('Cache hit', { key });
		return { success: true, data: cached.data };
	}

	const params = new URLSearchParams(query as any);
	const res = await api<Paginated<object>>(`/api/collections/${query.collectionId}?${params}`);

	if (res.success && res.data) {
		cache.set(key, { data: res.data, ts: Date.now() });
		logger.debug('Cache set', { key, count: res.data.items.length });
	}

	return res;
}

// Collections list
export const getCollections = (opts: { includeFields?: boolean; includeStats?: boolean } = {}) => {
	const params = new URLSearchParams(opts as any);
	return api<Collection[]>(`/api/collections?${params}`);
};

// Cache invalidation
export function invalidateCollectionCache(collId: string): void {
	const id = collId.toLowerCase();
	for (const key of cache.keys()) {
		if (key.includes(`"collectionId":"${id}"`)) cache.delete(key);
	}
	logger.info('Collection cache invalidated', { collectionId: collId });
}
