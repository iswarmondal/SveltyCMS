/**
 * @file src/routes/api/graphql/resolvers/collections.ts
 * @description Dynamic GraphQL schema & resolver generation for collections
 *
 * Features:
 * - Tenant-aware dynamic schema generation
 * - Widget-driven field types with nested support
 * - Localized field resolution
 * - Redis caching (tenant-aware, locale-aware)
 * - Token replacement in string fields
 * - Robust widget lookup with fallbacks
 * - Clean type names for uniqueness
 */

import { getPrivateSettingSync } from '@src/services/settingsService';
import type { DatabaseAdapter } from '@src/databases/dbInterface';
import { getFieldName } from '@utils/utils';
import { widgetFunctions } from '@stores/widgetStore.svelte';
import type { GraphQLFieldResolver } from 'graphql';

import { modifyRequest } from '@api/collections/modifyRequest';
import { contentManager } from '@src/content/ContentManager';
import { replaceTokens } from '@src/services/token/engine';

import { logger } from '@utils/logger.server';

import type { FieldInstance } from '@src/content/types';

// Helper: Localized value extraction
function getLocalizedValue(value: unknown, locale = 'en'): unknown {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const obj = value as Record<string, unknown>;
		return obj[locale] ?? obj.en ?? Object.values(obj)[0] ?? value;
	}
	return value;
}

// Clean GraphQL type name
export function createCleanTypeName(collection: { _id?: string; name?: string | unknown }): string {
	const raw = typeof collection.name === 'string' ? collection.name : '';
	const base = raw.split('/').pop() || raw;
	const clean = base
		.replace(/[^a-zA-Z0-9]/g, '')
		.replace(/^[0-9]/, 'C$&')
		.replace(/^[a-z]/, (c) => c.toUpperCase());
	const shortId = (collection._id ?? '').slice(0, 8);
	return `${clean}_${shortId}`;
}

interface WidgetSchema {
	graphql: string;
	typeID: string;
	typeName: string;
	resolver?: Record<string, GraphQLFieldResolver<unknown, unknown>>;
}

interface ResolverContext {
	Query: Record<string, GraphQLFieldResolver<unknown, unknown>>;
	[typeName: string]: Record<string, GraphQLFieldResolver<unknown, unknown>>;
}

interface CacheClient {
	get(key: string, tenantId?: string): Promise<string | null>;
	set(key: string, value: string, ex: string, duration: number, tenantId?: string): Promise<unknown>;
}

// Register collections & generate schema/resolvers
export async function registerCollections(tenantId?: string) {
	await contentManager.initialize(tenantId);
	const collections = await contentManager.getCollections(tenantId);

	const typeDefsSet = new Set<string>();
	const typeIDs = new Set<string>();
	const resolvers: ResolverContext = { Query: {} };
	const collectionSchemas: string[] = [];

	for (const col of collections) {
		const cleanTypeName = createCleanTypeName(col);
		resolvers[cleanTypeName] = {};

		let schema = `type ${cleanTypeName} {\n`;

		for (const field of col.fields as FieldInstance[]) {
			const widgetName = field.widget?.Name;
			if (!widgetName || typeof widgetName !== 'string') continue;

			// Widget lookup with fallbacks
			let widget =
				widgetFunctions[widgetName] ??
				widgetFunctions[widgetName.charAt(0).toLowerCase() + widgetName.slice(1)] ??
				widgetFunctions[widgetName.toLowerCase()];

			if (!widget?.GraphqlSchema) continue;

			const widgetSchema = widget.GraphqlSchema({
				field,
				label: `${cleanTypeName}_${getFieldName(field)}`,
				collection: col
			}) as WidgetSchema | undefined;

			if (!widgetSchema) continue;

			// Merge resolvers
			if (widgetSchema.resolver) {
				Object.assign(resolvers[cleanTypeName], widgetSchema.resolver);
			}

			// Add custom type def if needed
			if (widgetSchema.graphql?.trim() && !typeIDs.has(widgetSchema.typeID)) {
				typeIDs.add(widgetSchema.typeID);
				typeDefsSet.add(widgetSchema.graphql);
			} else {
				typeIDs.add(widgetSchema.typeID);
			}

			schema += `  ${getFieldName(field)}: ${widgetSchema.typeID}\n`;

			// Localization resolver
			if (field.translated) {
				resolvers[cleanTypeName][getFieldName(field)] = ((parent: any, _args: any, ctx: any) =>
					getLocalizedValue(parent[getFieldName(field)], ctx?.locale)) as GraphQLFieldResolver<unknown, unknown>;
			}
		}

		// Standard fields
		schema += `
  _id: String
  status: String
  createdAt: String
  updatedAt: String
  createdBy: String
  updatedBy: String
}`;

		collectionSchemas.push(schema);
	}

	const finalTypeDefs = Array.from(typeDefsSet).join('\n') + collectionSchemas.join('\n');

	return { typeDefs: finalTypeDefs, resolvers, collections };
}

// Collection query resolvers
export async function collectionsResolvers(dbAdapter: DatabaseAdapter, cacheClient: CacheClient | null, tenantId?: string) {
	if (!dbAdapter) throw new Error('Database adapter required');

	const { resolvers, collections } = await registerCollections(tenantId);

	for (const col of collections) {
		const cleanTypeName = createCleanTypeName(col);
		resolvers.Query[cleanTypeName] = (async (_parent, args, ctx: any) => {
			if (!ctx.user) throw new Error('Authentication required');
			if (getPrivateSettingSync('MULTI_TENANT') && ctx.tenantId !== tenantId) throw new Error('Tenant mismatch');

			const { page = 1, limit = 50 } = args.pagination ?? {};
			const locale = ctx.locale ?? 'en';

			const cacheKey = `col:${col._id}:${page}:${limit}:${locale}:${contentManager.getContentVersion()}`;
			if (getPrivateSettingSync('USE_REDIS') && cacheClient) {
				const cached = await cacheClient.get(cacheKey, ctx.tenantId);
				if (cached) return JSON.parse(cached);
			}

			const query: Record<string, any> = getPrivateSettingSync('MULTI_TENANT') ? { tenantId: ctx.tenantId } : {};
			const result = await dbAdapter
				.queryBuilder(`collection_${col._id}`)
				.where(Object.keys(query).length ? query : {})
				.paginate({ page, pageSize: limit })
				.execute();

			if (!result.success) throw new Error(result.error?.message ?? 'Query failed');

			let docs = (result.data ?? []) as any[];

			// Modify request (permissions, computed fields)
			if (docs.length) {
				try {
					await modifyRequest({
						data: docs,
						fields: col.fields as FieldInstance[],
						collection: col as any,
						user: ctx.user,
						type: 'GET'
					});
				} catch (e) {
					logger.warn('modifyRequest failed', e);
				}
			}

			// Token replacement
			docs = await Promise.all(
				docs.map(async (doc) => {
					const processed = { ...doc };
					for (const key in processed) {
						if (typeof processed[key] === 'string' && processed[key].includes('{{')) {
							try {
								processed[key] = await replaceTokens(processed[key], { entry: doc, user: ctx.user });
							} catch (e) {
								logger.warn(`Token error in ${key}`, e);
							}
						}
					}
					return processed;
				})
			);

			// ISO dates
			docs.forEach((doc) => {
				doc.createdAt = new Date(doc.createdAt ?? Date.now()).toISOString();
				doc.updatedAt = new Date(doc.updatedAt ?? doc.createdAt).toISOString();
			});

			// Cache
			if (getPrivateSettingSync('USE_REDIS') && cacheClient) {
				await cacheClient.set(cacheKey, JSON.stringify(docs), 'EX', 3600, ctx.tenantId);
			}

			return docs;
		}) as GraphQLFieldResolver<unknown, unknown>;
	}

	return resolvers;
}
