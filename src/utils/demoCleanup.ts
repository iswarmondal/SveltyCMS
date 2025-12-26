/**
 * @file src/utils/demoCleanup.ts
 * @description Periodic cleanup for expired demo tenants (DEMO mode only)
 *
 * Features:
 * - Runs only when DEMO=true
 * - Deletes tenants >60 minutes old
 * - Removes users, sessions, settings, themes, content structure, tokens
 * - Cleans dynamic collection data (tenant-scoped)
 * - Safe & logged
 */

import { logger } from '@utils/logger.server';
import mongoose from 'mongoose';

import { SystemSettingModel } from '@src/databases/mongodb/models/systemSetting';
import { ThemeModel } from '@src/databases/mongodb/models/theme';
import { ContentStructureModel } from '@src/databases/mongodb/models/contentStructure';
import { WebsiteTokenModel } from '@src/databases/mongodb/models/websiteToken';

import { getPrivateEnv } from '@src/databases/db';

const EXPIRATION_MINUTES = 60;
const EXPIRATION_MS = EXPIRATION_MINUTES * 60 * 1000;

export async function cleanupExpiredDemoTenants(): Promise<void> {
	const env = getPrivateEnv();
	const isDemo = process.env.SVELTYCMS_DEMO === 'true' || env?.DEMO === true;
	if (!isDemo) return;

	const cutoff = new Date(Date.now() - EXPIRATION_MS);

	try {
		const User = mongoose.model('auth_users');
		const Session = mongoose.model('auth_sessions');

		// Find expired demo admin users (indicator of tenant age)
		const expiredAdmins = await User.find({
			tenantId: { $exists: true, $ne: null },
			role: 'admin',
			createdAt: { $lt: cutoff }
		}).select('tenantId');

		const tenantIds = [...new Set(expiredAdmins.map((u) => u.tenantId).filter(Boolean))];
		if (tenantIds.length === 0) return;

		logger.info(`[Demo Cleanup] Removing ${tenantIds.length} expired tenants`);

		for (const tenantId of tenantIds) {
			logger.debug(`[Demo Cleanup] Cleaning tenant: ${tenantId}`);

			// Dynamic collections data
			const collections = await ContentStructureModel.find({
				tenantId,
				nodeType: 'collection'
			});

			await Promise.all(
				collections.map(async (col) => {
					try {
						const collName = `collection_${(col as any)._id}`;
						if (mongoose.connection.db) {
							await mongoose.connection.db.collection(collName).deleteMany({ tenantId });
						}
					} catch (e) {
						// Collection may not exist yet
					}
				})
			);

			// System data
			await Promise.all([
				User.deleteMany({ tenantId }),
				Session.deleteMany({ tenantId }),
				SystemSettingModel.deleteMany({ tenantId }),
				ThemeModel.deleteMany({ tenantId }),
				ContentStructureModel.deleteMany({ tenantId }),
				WebsiteTokenModel.deleteMany({ tenantId }),
				mongoose.connection.db ? mongoose.connection.db.collection('auth_roles').deleteMany({ tenantId }) : Promise.resolve()
			]);
		}

		logger.info(`[Demo Cleanup] Completed – removed ${tenantIds.length} tenants`);
	} catch (err) {
		logger.error('[Demo Cleanup] Failed', err);
	}
}
