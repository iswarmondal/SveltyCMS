/**
 * @file src/routes/api/graphql/+server.ts
 * @description GraphQL API handler with dynamic schema, tenant support & subscriptions
 *
 * Features:
 * - Dynamic collection schema/resolver generation (tenant-aware)
 * - Integrated user/media/system resolvers
 * - Redis caching (via CacheService)
 * - WebSocket subscriptions (standalone server)
 * - Proper auth & permission checks
 */

import { building } from '$app/environment';
import { getPrivateSettingSync } from '@src/services/settingsService';
import type { RequestEvent } from '@sveltejs/kit';

import { createSchema, createYoga, createPubSub } from 'graphql-yoga';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/use/ws';

import { registerCollections, collectionsResolvers, createCleanTypeName } from './resolvers/collections';
import { mediaResolvers, mediaTypeDefs } from './resolvers/media';
import { userResolvers, userTypeDefs } from './resolvers/users';
import { systemResolvers, systemTypeDefs } from './resolvers/system';

import { widgetStoreActions } from '@stores/widgetStore.svelte';
import { cacheService } from '@src/databases/CacheService';
import { hasPermissionWithRoles, registerPermission } from '@src/databases/auth/permissions';
import { PermissionAction, PermissionType } from '@src/databases/auth/types';

import { logger } from '@utils/logger.server';

const pubSub = createPubSub();

// Access management permission
const accessMgmtPerm = {
	_id: 'config:accessManagement' as const,
	contextId: 'config/accessManagement',
	name: 'Access Management',
	action: PermissionAction.MANAGE,
	contextType: PermissionType.CONFIGURATION,
	type: PermissionType.CONFIGURATION,
	description: 'Allows management of user access and permissions'
};

if (!building) registerPermission(accessMgmtPerm);

// Cache adapter
const cacheClient = getPrivateSettingSync('USE_REDIS')
	? {
			get: async (key: string, tenantId?: string) => cacheService.get<string>(`gql:${key}`, tenantId).catch(() => null),
			set: async (key: string, value: string, _ex: string, duration: number, tenantId?: string) =>
				cacheService.set(`gql:${key}`, value, duration, tenantId).catch(() => {})
		}
	: null;

// Schema creation
async function buildSchema(dbAdapter: any, tenantId?: string) {
	await widgetStoreActions.initializeWidgets(tenantId);

	const { typeDefs: colTypeDefs, collections } = await registerCollections(tenantId);

	const queryFields = collections
		.filter((c) => c._id && typeof c.name === 'string')
		.map((c) => `  ${createCleanTypeName(c)}(pagination: PaginationInput): [${createCleanTypeName(c)}]`)
		.join('\n');

	const typeDefs = `
		input PaginationInput {
			page: Int = 1
			limit: Int = 50
		}

		${colTypeDefs}
		${userTypeDefs()}
		${mediaTypeDefs()}
		${systemTypeDefs}

		type Subscription {
			contentStructureUpdated: ContentUpdateEvent!
		}

		type ContentUpdateEvent {
			version: Int!
			timestamp: String!
			affectedCollections: [String!]!
			changeType: String!
		}

		type AccessManagementPermission {
			contextId: String!
			name: String!
			action: String!
			contextType: String!
			description: String
		}

		type Query {
${queryFields}
			users(pagination: PaginationInput): [User]
			me: User
			mediaImages(pagination: PaginationInput): [MediaImage]
			mediaDocuments(pagination: PaginationInput): [MediaDocument]
			mediaAudio(pagination: PaginationInput): [MediaAudio]
			mediaVideos(pagination: PaginationInput): [MediaVideo]
			mediaRemote(pagination: PaginationInput): [MediaRemote]
			accessManagementPermission: AccessManagementPermission
		}
	`;

	const colQueryResolvers = await collectionsResolvers(dbAdapter, cacheClient, tenantId);

	const resolvers = {
		...colQueryResolvers,
		Query: {
			...colQueryResolvers.Query,
			...userResolvers(dbAdapter),
			...mediaResolvers(dbAdapter),
			...systemResolvers.Query,
			accessManagementPermission: (_: any, __: any, ctx: { user?: any; locals?: { roles?: any[] } }) => {
				if (!ctx.user) throw new Error('Unauthorized');
				if (!hasPermissionWithRoles(ctx.user, 'config:accessManagement', ctx.locals?.roles ?? [])) {
					throw new Error('Forbidden');
				}
				return accessMgmtPerm;
			}
		},
		Subscription: {
			contentStructureUpdated: {
				subscribe: () => pubSub.subscribe('contentStructureUpdated'),
				resolve: (payload: any) => payload
			}
		}
	};

	return createSchema({ typeDefs, resolvers });
}

// Yoga app cache
let yogaPromise: Promise<any> | null = null;
let wsInitialized = false;

async function initYoga(dbAdapter: any, tenantId?: string) {
	const schema = await buildSchema(dbAdapter, tenantId);
	return createYoga({
		graphqlEndpoint: '/api/graphql',
		landingPage: false,
		graphiql: { subscriptionsProtocol: 'WS' },
		schema,
		context: ({ request }: any) => {
			const ctx = (request as any).contextData ?? {};
			return {
				user: ctx.user,
				tenantId: ctx.tenantId,
				locale: request.headers.get('accept-language')?.split(',')[0]?.slice(0, 2) ?? 'en',
				pubSub
			};
		}
	});
}

async function initWebSocket(dbAdapter: any, tenantId?: string) {
	if (wsInitialized || building) return;
	const schema = await buildSchema(dbAdapter, tenantId);

	const ws = new WebSocketServer({ port: 3001, path: '/api/graphql' });
	useServer(
		{
			schema,
			context: async (ctx: any) => {
				const params = ctx.connectionParams as { authorization?: string } | undefined;
				let user = null;
				if (params?.authorization) {
					const token = params.authorization.replace(/^Bearer\s+/i, '');
					const validation = await dbAdapter.auth.validateToken(token, undefined, 'access', tenantId);
					if (validation?.success) {
						const tokenData = await dbAdapter.auth.getTokenByValue(token, tenantId);
						if (tokenData?.success) {
							const userRes = await dbAdapter.auth.getUserById(tokenData.data.user_id, tenantId);
							if (userRes?.success) user = userRes.data;
						}
					}
				}
				return { user, pubSub, tenantId };
			}
		},
		ws
	);
	wsInitialized = true;
	logger.info('GraphQL WS server on port 3001');
}

// Request handler
async function handler(event: RequestEvent) {
	const { locals, request } = event;
	if (!locals.user || !locals.dbAdapter) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	if (!yogaPromise) {
		yogaPromise = initYoga(locals.dbAdapter, locals.tenantId);
		void initWebSocket(locals.dbAdapter, locals.tenantId);
	}

	const yoga = await yogaPromise;
	const req = new Request(request.url.toString(), {
		method: request.method,
		headers: request.headers,
		body: request.method !== 'GET' ? request.body : undefined,
		...(request.method !== 'GET' ? { duplex: 'half' as any } : {})
	});
	(req as any).contextData = { user: locals.user, tenantId: locals.tenantId };

	const res = await yoga.handleRequest(req, {});
	const body = await res.text();
	const headers = new Headers();
	res.headers.forEach((v: string, k: string) => headers.set(k, v));

	return new Response(body, { status: res.status, headers });
}

export { handler as GET, handler as POST };
