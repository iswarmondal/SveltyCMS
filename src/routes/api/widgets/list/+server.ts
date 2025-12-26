/**
 * @file src/routes/api/widgets/list/+server.ts
 * @description API endpoint for listing all widgets with 3-pillar metadata
 *
 * Features:
 * - Tenant-aware widget initialization
 * - Permission check (api:widgets)
 * - Active status from database
 * - Core/custom distinction
 * - 3-pillar architecture metadata
 * - Performance timing & summary stats
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { logger } from '@utils/logger.server';
import { hasPermissionWithRoles } from '@src/databases/auth/permissions';

import { widgetStoreActions, widgetFunctions, coreWidgets, getWidgetDependencies } from '@stores/widgetStore.svelte';

export const GET: RequestHandler = async ({ url, locals }) => {
	const start = performance.now();

	try {
		const { user, roles = [], dbAdapter, tenantId: contextTenantId } = locals;

		if (!user) throw error(401, 'Unauthorized');
		if (!dbAdapter?.widgets?.getActiveWidgets) throw error(500, 'Widget adapter unavailable');

		// Permission check
		if (!hasPermissionWithRoles(user, 'api:widgets', roles)) {
			logger.warn(`User ${user._id} denied widget list access`);
			throw error(403, 'Forbidden');
		}

		// Tenant resolution
		const tenantId = url.searchParams.get('tenantId') ?? contextTenantId ?? 'default';

		// Ensure widgets loaded
		await widgetStoreActions.initializeWidgets(tenantId);

		// Active widgets from DB
		const activeRes = await dbAdapter.widgets.getActiveWidgets();
		if (!activeRes.success) throw error(500, activeRes.error?.message ?? 'DB error');
		const activeNames = (activeRes.data ?? []).map((w: any) => w.name);

		// Build enriched widget list
		const widgets = Object.entries(widgetFunctions)
			.map(([name, fn]) => {
				const isCore = coreWidgets.includes(name);
				const isActive = activeNames.includes(name);
				const deps = getWidgetDependencies(name);

				const f = fn as any;
				return {
					name,
					icon: f.Icon ?? (isCore ? 'mdi:puzzle' : 'mdi:puzzle-plus'),
					description: f.Description ?? '',
					isCore,
					isActive,
					dependencies: deps,
					pillar: {
						definition: {
							name: f.Name ?? name,
							description: f.Description ?? '',
							icon: f.Icon ?? '',
							guiSchemaFields: f.GuiSchema ? Object.keys(f.GuiSchema).length : 0,
							hasAggregations: !!f.aggregations
						},
						input: {
							componentPath: f.__inputComponentPath ?? '',
							exists: !!f.__inputComponentPath
						},
						display: {
							componentPath: f.__displayComponentPath ?? '',
							exists: !!f.__displayComponentPath
						}
					},
					canDisable: !isCore && deps.length === 0,
					hasValidation: !!f.GuiSchema
				};
			})
			.sort((a, b) => {
				if (a.isCore && !b.isCore) return -1;
				if (!a.isCore && b.isCore) return 1;
				return a.name.localeCompare(b.name);
			});

		const duration = performance.now() - start;

		logger.debug('Widget list generated', {
			tenantId,
			total: widgets.length,
			core: widgets.filter((w) => w.isCore).length,
			active: widgets.filter((w) => w.isActive).length,
			duration: `${duration.toFixed(2)}ms`
		});

		return json({
			widgets,
			summary: {
				total: widgets.length,
				core: widgets.filter((w) => w.isCore).length,
				custom: widgets.filter((w) => !w.isCore).length,
				active: widgets.filter((w) => w.isActive).length
			},
			tenantId,
			performance: { duration: `${duration.toFixed(2)}ms` }
		});
	} catch (err) {
		const duration = performance.now() - start;
		const msg = err instanceof Error ? err.message : String(err);
		logger.error('Widget list fetch failed', { error: msg, duration: `${duration.toFixed(2)}ms` });
		throw error(500, 'Failed to retrieve widget list');
	}
};
