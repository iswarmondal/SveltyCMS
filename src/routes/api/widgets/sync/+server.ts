/**
 * @file src/routes/api/widgets/sync/+server.ts
 * @description API endpoint to sync filesystem widgets with database (admin only)
 *
 * Features:
 * - Tenant-aware sync
 * - Core widgets auto-activated
 * - Custom widgets registered if missing
 * - Detailed sync report
 * - Permission enforcement (api:widgets + admin role)
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { logger } from '@utils/logger.server';
import { hasPermissionWithRoles } from '@src/databases/auth/permissions';

import { widgetStoreActions, widgetFunctions, coreWidgets } from '@stores/widgetStore.svelte';

export const POST: RequestHandler = async ({ locals, request }) => {
	const start = performance.now();

	try {
		const { user, roles = [], dbAdapter, tenantId: contextTenantId } = locals;

		if (!user) throw error(401, 'Unauthorized');
		if (!dbAdapter?.widgets) throw error(500, 'Widget adapter unavailable');

		// Strict permission: api:widgets + admin role
		const hasApiPerm = hasPermissionWithRoles(user, 'api:widgets', roles);
		const isAdmin = ['admin', 'super-admin'].includes(user.role ?? '');
		if (!hasApiPerm || !isAdmin) {
			logger.warn(`User ${user._id} denied widget sync (missing admin or permission)`);
			throw error(403, 'Admin access required');
		}

		// Tenant resolution
		const tenantId = request.headers.get('X-Tenant-ID') ?? contextTenantId ?? 'default';

		// Load all widgets from filesystem
		await widgetStoreActions.initializeWidgets(tenantId);

		// Fetch current DB state
		const dbRes = await dbAdapter.widgets.findAll();
		if (!dbRes.success) throw error(500, 'Failed to read widget DB');
		const dbWidgets = dbRes.data ?? [];
		const dbNames = new Set(dbWidgets.map((w) => w.name as string));

		const results = {
			created: [] as string[],
			activated: [] as string[],
			skipped: [] as string[],
			errors: [] as { widget: string; error: string }[]
		};

		// Sync each filesystem widget
		for (const [name, fn] of Object.entries(widgetFunctions)) {
			try {
				const isCore = coreWidgets.includes(name);
				const exists = dbNames.has(name);
				const deps = ((fn as any).__dependencies as string[] | undefined) ?? [];

				if (exists) {
					const dbWidget = dbWidgets.find((w) => w.name === name);
					if (isCore && !(dbWidget?.isActive as boolean)) {
						await dbAdapter.widgets.update(dbWidget!._id, { isActive: true });
						results.activated.push(name);
					} else {
						results.skipped.push(name);
					}
				} else {
					const createRes = await dbAdapter.widgets.register({
						name,
						isActive: isCore,
						instances: {},
						dependencies: deps
					});
					if (createRes.success) {
						results.created.push(name);
					} else {
						results.errors.push({ widget: name, error: createRes.error?.message ?? 'Unknown' });
					}
				}
			} catch (err) {
				results.errors.push({
					widget: name,
					error: err instanceof Error ? err.message : String(err)
				});
				logger.error(`Sync failed for widget ${name}`, err);
			}
		}

		const duration = performance.now() - start;

		logger.info('Widget sync completed', {
			tenantId,
			created: results.created.length,
			activated: results.activated.length,
			skipped: results.skipped.length,
			errors: results.errors.length,
			duration: `${duration.toFixed(2)}ms`
		});

		return json({
			success: true,
			message: 'Widget sync completed',
			results: {
				total: Object.keys(widgetFunctions).length,
				created: results.created.length,
				activated: results.activated.length,
				skipped: results.skipped.length,
				errors: results.errors.length
			},
			details: results,
			duration: `${duration.toFixed(2)}ms`,
			tenantId
		});
	} catch (err) {
		const duration = performance.now() - start;
		const msg = err instanceof Error ? err.message : String(err);
		logger.error('Widget sync failed', { error: msg, duration: `${duration.toFixed(2)}ms` });
		throw error(500, 'Widget sync failed');
	}
};
