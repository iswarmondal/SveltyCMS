/**
 * @file src/utils/globalSearchIndex.ts
 * @description Global search index with rune-based reactivity
 */

import { getModalStore } from '@skeletonlabs/skeleton';
import { logger } from '@utils/logger';

export interface SearchTrigger {
	path?: string;
	action?: (() => void | Promise<void>)[];
}

export interface SearchItem {
	title: string;
	description: string;
	keywords: string[];
	triggers: Record<string, SearchTrigger>;
}

export type SearchData = SearchItem;

// Reactive visibility state
let _isSearchVisible = $state(false);

export const isSearchVisible = {
	get value() {
		return _isSearchVisible;
	},
	set value(v: boolean) {
		_isSearchVisible = v;
	},
	set(v: boolean) {
		_isSearchVisible = v;
	},
	update(fn: (v: boolean) => boolean) {
		_isSearchVisible = fn(_isSearchVisible);
	},
	toggle() {
		_isSearchVisible = !_isSearchVisible;
	},
	subscribe(run: (v: boolean) => void) {
		run(_isSearchVisible);
		const cleanup = $effect.root(() => {
			$effect(() => run(_isSearchVisible));
		});
		return () => cleanup();
	}
};

// Global search index
let index = $state<SearchItem[]>([
	{
		title: 'Home',
		description: 'The home page of the blog.',
		keywords: ['home', 'dashboard'],
		triggers: { 'Go to Home Page': { path: '/' } }
	},
	{
		title: 'Marketplace',
		description: 'SveltCMS Widget Marketplace.',
		keywords: ['widget', 'marketplace', 'plugins', 'extensions'],
		triggers: { 'Go to Marketplace': { path: 'https://www.sveltycms.com' } }
	},
	{
		title: 'GraphQL Yoga',
		description: 'GraphQL Explorer',
		keywords: ['graphql', 'explorer', 'yoga', 'api', 'query'],
		triggers: { 'Go to GraphQL Explorer': { path: '/api/graphql' } }
	},
	{
		title: 'User Profile',
		description: 'View and edit your user profile.',
		keywords: ['user', 'avatar', 'profile', 'settings', 'account', 'password', 'delete'],
		triggers: {
			'Show User Profile': { path: '/user' },
			'Edit Avatar Image': {
				action: [
					() =>
						getModalStore().trigger({
							type: 'component',
							component: 'ModalEditAvatar',
							title: 'Edit Avatar',
							body: 'Upload or change your avatar image'
						})
				]
			},
			'Edit User Profile': {
				action: [
					() =>
						getModalStore().trigger({
							type: 'component',
							component: 'modalUserForm',
							title: 'Edit Profile',
							body: 'Modify your data and then press Save.'
						})
				]
			}
		}
	},
	{
		title: 'Media Gallery',
		description: 'View and edit your media gallery.',
		keywords: ['media', 'gallery', 'images', 'videos', 'documents', 'files'],
		triggers: { 'Go to Media Gallery': { path: '/mediagallery' } }
	},
	{
		title: 'Add Media',
		description: 'Add new media to gallery.',
		keywords: ['add', 'media', 'gallery', 'images', 'videos', 'documents', 'upload'],
		triggers: { 'Go to Add Media': { path: '/mediagallery/uploadMedia' } }
	},
	{
		title: 'Image Editor',
		description: 'Edit and manage images with the image editor.',
		keywords: ['image', 'editor', 'edit', 'photos', 'media', 'crop', 'resize'],
		triggers: { 'Go to Image Editor': { path: '/imageEditor' } }
	},
	{
		title: 'System Dashboard',
		description: 'View and manage your dashboard.',
		keywords: ['dashboard', 'profile', 'settings', 'load', 'system', 'overview'],
		triggers: { 'Go to Dashboard': { path: '/dashboard' } }
	},
	{
		title: 'Configuration',
		description: 'Configure the system settings.',
		keywords: ['configuration', 'settings', 'system', 'setup'],
		triggers: { 'Go to Configuration': { path: '/config' } }
	},
	{
		title: 'System Builder',
		description: 'Build and customize your collections.',
		keywords: ['builder', 'category', 'collection', 'configuration', 'settings', 'system', 'permissions'],
		triggers: { 'Go to System Builder': { path: '/config/collectionbuilder' } }
	},
	{
		title: 'Access Management',
		description: 'Manage user access and permissions.',
		keywords: ['access', 'management', 'permissions', 'roles', 'users', 'security'],
		triggers: { 'Go to Access Management': { path: '/config/accessManagement' } }
	},
	{
		title: 'Roles',
		description: 'Manage user roles in the system.',
		keywords: ['roles', 'user roles', 'permissions', 'access', 'security'],
		triggers: { 'Manage Roles': { path: '/config/accessManagement/roles' } }
	},
	{
		title: 'Permissions',
		description: 'Configure and manage system permissions.',
		keywords: ['permissions', 'access control', 'security', 'roles'],
		triggers: { 'Manage Permissions': { path: '/config/accessManagement/permissions' } }
	},
	{
		title: 'Theme Management',
		description: 'Customize the look and feel of your site.',
		keywords: ['theme', 'appearance', 'design', 'colors', 'layout', 'customize'],
		triggers: { 'Customize Theme': { path: '/config/themeManagement' } }
	},
	{
		title: 'Theme Settings',
		description: 'Configure global theme settings.',
		keywords: ['theme', 'settings', 'appearance', 'design', 'colors'],
		triggers: { 'Theme Settings': { path: '/config/themeManagement/settings' } }
	}
]);

// Add new item
export function addSearchItem(item: SearchItem): void {
	index = [...index, item];
	logger.info(`Added search item: ${item.title}`);
}

// Search index
export function searchIndex(query: string): SearchItem[] {
	if (!query.trim()) return [];
	const q = query.toLowerCase();
	return index.filter(
		(item) =>
			item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || item.keywords.some((k) => k.toLowerCase().includes(q))
	);
}

// Global search index store
export const globalSearchIndex = {
	get items() {
		return index;
	},
	add: addSearchItem,
	search: searchIndex,
	subscribe(run: (v: SearchItem[]) => void) {
		run(index);
		const cleanup = $effect.root(() => {
			$effect(() => run(index));
		});
		return () => cleanup();
	}
};

/** Legacy alias for backward compatibility */
export const triggerActionStore = {
	subscribe: (fn: (v: any) => void) => {
		fn(false);
		return () => {};
	},
	set: (_v: any) => {},
	update: (_fn: (v: any) => any) => {}
};
