/**
 * @file src/routes/api/telemetry/report/+server.ts
 * @description Telemetry Report Proxy
 *
 * Features:
 * - Admin/Guest Access
 * - Forward to telemetry.sveltycms.com
 *
 * Security:
 * - Valibot schema validation
 * - Payload size limits (10KB max)
 * - Request timeout (5s)
 * - Server-side enrichment
 * - Fail silently
 *
 * Performance:
 * - Response caching (12h TTL per version)
 * - LRU eviction (max 100 entries)
 */

import { json, error } from '@sveltejs/kit';
import { getPrivateSettingSync } from '@src/services/settingsService';
import { object, string, optional, safeParse, maxLength, pipe, boolean, number, union, array } from 'valibot';
import { createHash, createHmac } from 'node:crypto';
import { logger } from '@utils/logger.server';
import type { RequestEvent } from './$types';

// Validation schema
const schema = object({
	current_version: pipe(string(), maxLength(20)),
	node_version: optional(pipe(string(), maxLength(20))),
	os: optional(pipe(string(), maxLength(20))),
	environment: optional(pipe(string(), maxLength(20))),
	is_ephemeral: optional(boolean()),
	installation_id: optional(pipe(string(), maxLength(64))),
	stable_id: optional(pipe(string(), maxLength(64))),
	db_type: optional(pipe(string(), maxLength(20))),
	location: optional(
		object({
			country: optional(pipe(string(), maxLength(128))),
			country_code: optional(pipe(string(), maxLength(2))),
			region: optional(pipe(string(), maxLength(128))),
			city: optional(pipe(string(), maxLength(128))),
			latitude: optional(number()),
			longitude: optional(number()),
			isp: optional(pipe(string(), maxLength(128))),
			org: optional(pipe(string(), maxLength(128)))
		})
	),
	usage_metrics: optional(
		object({
			users: optional(number()),
			collections: optional(number()),
			roles: optional(number())
		})
	),
	system_info: optional(
		object({
			cpu_count: optional(number()),
			cpu_model: optional(string()),
			total_memory_gb: optional(number()),
			os_type: optional(string()),
			os_release: optional(string()),
			os_arch: optional(string())
		})
	),
	widgets: optional(union([pipe(string(), maxLength(5000)), array(string())])),
	timestamp: optional(number()),
	signature: optional(string())
});

// Cache (aligned with cache-system.mdx)
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12h
const MAX_ENTRIES = 100;
const MAX_PAYLOAD = 10000; // 10KB
const TIMEOUT = 5000; // 5s

export async function POST({ request }: RequestEvent) {
	const enabled = await getPrivateSettingSync('SVELTYCMS_TELEMETRY');
	if (enabled === false) return json({ status: 'disabled' });

	try {
		// Size check
		const len = request.headers.get('content-length');
		if (len && parseInt(len) > MAX_PAYLOAD) throw error(413, 'Payload too large');

		// Validate
		const body = await request.json();
		const parsed = safeParse(schema, body);
		if (!parsed.success) throw error(400, 'Invalid payload');
		const data = parsed.output;

		const ver = data.current_version;
		const key = `v${ver}`;

		// Cache hit
		const cached = cache.get(key);
		if (cached && Date.now() - cached.ts < CACHE_TTL) {
			return json(cached.data, { headers: { 'X-Cache': 'HIT' } });
		}

		// Enrich & sign
		const secret = (await getPrivateSettingSync('JWT_SECRET_KEY')) || 'fallback';
		const id = data.installation_id || createHash('sha256').update(secret).digest('hex');
		const ts = data.timestamp || Date.now();
		const sig = createHmac('sha256', 'sveltycms-telemetry').update(`${id}:${ver}:${ts}`).digest('hex');

		const payload = { ...data, installation_id: id, timestamp: ts, signature: sig };

		// Forward with timeout
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
		const res = await fetch(process.env.TELEMETRY_ENDPOINT || 'https://telemetry.sveltycms.com/api/check-update', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'User-Agent': 'SveltyCMS-Telemetry/1.0' },
			body: JSON.stringify(payload),
			signal: ctrl.signal
		});
		clearTimeout(timer);

		if (!res.ok) throw new Error(`Upstream error: ${res.status}`);

		const result = await res.json();
		if (typeof result !== 'object' || result === null) throw new Error('Invalid response');

		// Cache
		cache.set(key, { data: result, ts: Date.now() });
		if (cache.size > MAX_ENTRIES) {
			const oldest = cache.keys().next().value as string;
			cache.delete(oldest);
		}

		return json(result, { headers: { 'X-Cache': 'MISS' } });
	} catch (err) {
		// Silent fail
		if (err instanceof Error) {
			if (err.name === 'AbortError') logger.warn('Telemetry timeout');
			else logger.error('Telemetry error:', err.message);
		}
		return json({ status: 'error' }, { status: 200 });
	}
}
