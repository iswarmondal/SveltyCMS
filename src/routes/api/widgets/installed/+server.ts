/**
 * @file src/routes/api/widgets/installed/+server.ts
 * @description API endpoint for listing installed (custom) widgets per tenant
 *
 * Features:
 * - Tenant-aware widget initialization
 * - Permission check (api:widgets)
 * - Returns enriched metadata including 3-pillar paths
 * - Core vs custom distinction
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { logger } from '@utils/logger.server';
import { hasPermissionWithRoles } from '@src/databases/auth/permissions';

import { widgetStoreActions, customWidgets, getWidgetFunction } from '@stores/widgetStore.svelte';

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		const { user, roles = [], tenantId: contextTenantId } = locals;

		if (!user) throw error(401, 'Unauthorized');

		// Permission check
		if (!hasPermissionWithRoles(user, 'api:widgets', roles)) {
			logger.warn(`User ${user._id} denied widget API access`);
			throw error(403, 'Forbidden');
		}

		// Tenant resolution
		const tenantId = url.searchParams.get('tenantId') ?? contextTenantId ?? 'default';

		// Ensure widgets loaded for this tenant
		await widgetStoreActions.initializeWidgets(tenantId);

		// Installed = custom widgets from filesystem
		const installedNames = customWidgets ?? [];

		const installedWidgets = installedNames.map((name: string) => {
			const fn = getWidgetFunction(name) as any;
			return {
				name,
				icon: fn?.Icon ?? 'mdi:puzzle-plus',
				description: fn?.Description ?? '',
				inputComponentPath: fn?.__inputComponentPath ?? '',
				displayComponentPath: fn?.__displayComponentPath ?? '',
				dependencies: fn?.__dependencies ?? [],
				isCore: false
			};
		});

		logger.debug(`Returned ${installedWidgets.length} installed widgets for tenant ${tenantId}`);

		return json(installedWidgets);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		logger.error('Failed to fetch installed widgets:', msg);
		throw error(500, 'Internal server error');
	}
};
