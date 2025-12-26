<!--
@file src/components/VirtualFolder.svelte
@component VirtualFolder – Manage virtual folders in media gallery sidebar

@props
- currentFolder?: SystemVirtualFolder | null – Currently active folder (null = root)

@events
- Dispatches standard Svelte events via actions (navigate, etc.)

@features
- Reactive folder list with proper filtering
- Create/update/delete folders
- Responsive sidebar support (full/narrow)
- Proper loading/error states
- Prevents root folder modifications
-->

<script lang="ts">
	import { showToast } from '@utils/toast';
	import { logger } from '@utils/logger';
	import { onMount } from 'svelte';

	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { toggleUIElement, uiVisibility } from '@stores/UIStore.svelte';
	import { setMode } from '@stores/collectionStore.svelte';
	import { screenSizeStore } from '@stores/screenSizeStore.svelte';

	import type { SystemVirtualFolder } from '@src/databases/dbInterface';

	interface Props {
		currentFolder?: SystemVirtualFolder | null;
	}

	let { currentFolder = null }: Props = $props();

	// Reactive state
	let folders = $state<SystemVirtualFolder[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let newFolderName = $state('');

	// Derived values for efficiency
	let isSidebarFull = $derived(uiVisibility.current.leftSidebar === 'full');
	let isMobile = $derived(screenSizeStore.screenSize === 'SM');

	let rootFolderName = $derived(publicEnv.MEDIA_FOLDER);

	// Derived: folders in current level
	let childFolders = $derived(folders.filter((f) => (!currentFolder && f.parentId === null) || (currentFolder && f.parentId === currentFolder._id)));

	// Helper: is root folder (cannot be edited/deleted)
	function isRoot(folder: SystemVirtualFolder): boolean {
		return folder.name === rootFolderName && folder.parentId === null;
	}

	// API: Fetch all folders
	async function loadFolders(): Promise<void> {
		isLoading = true;
		error = null;
		try {
			const res = await fetch('/api/systemVirtualFolder');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);

			const data = await res.json();
			if (!data.success) throw new Error(data.error || 'Failed to load folders');

			folders = data.folders.map((f: SystemVirtualFolder) => ({
				...f,
				path: Array.isArray(f.path) ? f.path : (f.path as unknown as string).split('/')
			}));
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			showToast(`Error loading folders: ${error}`, 'error');
			folders = [];
		} finally {
			isLoading = false;
		}
	}

	// API: Create folder
	async function createFolder(): Promise<void> {
		const name = newFolderName.trim();
		if (!name) return;

		isLoading = true;
		try {
			const res = await fetch('/api/systemVirtualFolder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, parent: currentFolder?._id ?? null })
			});

			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			if (!data.success) throw new Error(data.error);

			showToast('Folder created', 'success');
			newFolderName = '';
			await loadFolders();
		} catch (err) {
			showToast(`Create failed: ${err instanceof Error ? err.message : err}`, 'error');
		} finally {
			isLoading = false;
		}
	}

	// API: Update folder name
	async function renameFolder(folder: SystemVirtualFolder, newName: string): Promise<void> {
		if (isRoot(folder)) {
			showToast('Cannot rename root folder', 'warning');
			return;
		}
		if (!newName.trim()) return;

		try {
			const res = await fetch('/api/systemVirtualFolder', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ folderId: folder._id, name: newName.trim() })
			});

			const data = await res.json();
			if (!data.success) throw new Error(data.error);

			showToast('Folder renamed', 'success');
			await loadFolders();
		} catch (err) {
			logger.error('Rename folder failed:', err);
			showToast('Rename failed', 'error');
		}
	}

	// API: Delete folder
	async function removeFolder(folder: SystemVirtualFolder): Promise<void> {
		if (isRoot(folder)) {
			showToast('Cannot delete root folder', 'warning');
			return;
		}

		try {
			const res = await fetch('/api/systemVirtualFolder', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ folderId: folder._id })
			});

			const data = await res.json();
			if (!data.success) throw new Error(data.error);

			showToast('Folder deleted', 'success');
			await loadFolders();
		} catch (err) {
			logger.error('Delete folder failed:', err);
			showToast('Delete failed', 'error');
		}
	}

	function closeMobileSidebar(): void {
		if (isMobile) {
			toggleUIElement('leftSidebar', 'hidden');
		}
	}

	function returnToCollections(e: MouseEvent): void {
		e.preventDefault();
		setMode('view');
		closeMobileSidebar();
	}

	// Load on mount
	onMount(() => {
		loadFolders();
	});
</script>

<div class="mt-2 overflow-y-auto">
	<!-- Return to Collections -->
	<a
		href="/"
		onclick={returnToCollections}
		aria-label="Return to Collections"
		class="btn mt-1 flex w-full items-center justify-start bg-surface-400 py-2 pl-2 text-white dark:bg-surface-500 data-[sveltekit-preload-data]:hover"
		class:flex-col={!isSidebarFull}
	>
		<iconify-icon
			icon={isSidebarFull ? 'mdi:folder-multiple-outline' : 'bi:collection'}
			width="24"
			class={isSidebarFull ? 'px-2 py-1 text-primary-600' : 'text-error-500'}
		/>
		<span class="text-xs uppercase {isSidebarFull ? 'mr-auto' : ''}">Collections</span>
	</a>

	<!-- Loading / Error / Empty -->
	{#if isLoading}
		<div class="flex justify-center py-6">
			<iconify-icon icon="svg-spinners:bars-scale" width="28" class="text-primary-500" />
		</div>
	{:else if error}
		<div class="px-4 pt-4 text-center">
			<p class="btn variant-outline-error w-full text-sm">{error}</p>
		</div>
	{:else if childFolders.length === 0}
		<div class="px-4 pt-4 text-center">
			<p class="btn variant-outline-secondary w-full text-sm text-warning-500">No folders</p>
		</div>
	{:else}
		<!-- Folder List -->
		<div class="mt-2 space-y-2">
			{#each childFolders as folder (folder._id)}
				<div class="group relative flex w-full items-center">
					<a
						href={`/mediagallery?folderId=${folder._id}`}
						onclick={closeMobileSidebar}
						aria-label="Open folder {folder.name}"
						class="btn flex w-full items-center gap-3 p-3"
						class:flex-col={!isSidebarFull}
						data-sveltekit-preload-data="hover"
					>
						<iconify-icon icon="mdi:folder" width="28" class="text-yellow-500" />
						<span class="truncate text-sm" class:hidden={!isSidebarFull}>
							{folder.name}
						</span>
					</a>

					<!-- Edit/Delete buttons (visible on hover in full mode) -->
					{#if isSidebarFull && !isRoot(folder)}
						<div class="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
							<button
								onclick={(e: MouseEvent) => {
									e.stopPropagation();
									const name = prompt('New folder name:', folder.name);
									if (name && name !== folder.name) renameFolder(folder, name);
								}}
								aria-label="Rename {folder.name}"
								class="btn btn-sm variant-soft p-1"
							>
								<iconify-icon icon="mdi:pencil" width="16" />
							</button>
							<button
								onclick={(e: MouseEvent) => {
									e.stopPropagation();
									removeFolder(folder);
								}}
								aria-label="Delete {folder.name}"
								class="btn btn-sm variant-soft-error p-1"
							>
								<iconify-icon icon="mdi:trash-can-outline" width="16" />
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Create New Folder (only in full sidebar) -->
	{#if isSidebarFull}
		<div class="mt-4 border-t border-surface-600 pt-4">
			<form
				onsubmit={(e: SubmitEvent) => {
					e.preventDefault();
					createFolder();
				}}
				class="flex gap-2"
			>
				<input
					type="text"
					bind:value={newFolderName}
					placeholder="New folder name"
					disabled={isLoading}
					class="input flex-1 text-sm"
					aria-label="New folder name"
				/>
				<button type="submit" disabled={!newFolderName.trim() || isLoading} class="btn variant-filled-primary" aria-label="Create folder">
					<iconify-icon icon="mdi:plus" width="20" />
				</button>
			</form>
		</div>
	{/if}
</div>
