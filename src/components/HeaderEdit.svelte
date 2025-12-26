<!--
@file src/components/HeaderEdit.svelte
@component HeaderEdit – Top header for collection entry (view/edit/create modes)

@features
- Responsive actions (mobile/desktop)
- Save with validation guard
- Status toggle (publish/draft)
- Schedule, clone, delete actions
- Cancel/edit mode handling
- Translation status display
- Permission-aware buttons
-->

<script lang="ts">
	import { logger } from '@utils/logger';
	import { untrack } from 'svelte';

	import { deleteCurrentEntry, saveEntry } from '@utils/entryActions.svelte';
	import { StatusTypes } from '@src/content/types';
	import { createEntry, invalidateCollectionCache } from '@src/utils/apiClient';
	import { showCloneModal, showScheduleModal } from '@utils/modalUtils';
	import { showToast } from '@utils/toast';

	import TranslationStatus from './collectionDisplay/TranslationStatus.svelte';
	import Toggles from './system/inputs/Toggles.svelte';
	import * as m from '@src/paraglide/messages';

	import { page } from '$app/state';
	import { navigationManager } from '@utils/navigationManager.svelte';
	import { collection, collectionValue, mode, setCollectionValue, setMode } from '@src/stores/collectionStore.svelte';
	import { screenSizeStore } from '@src/stores/screenSizeStore.svelte';
	import { toggleUIElement, uiStore, uiVisibility } from '@src/stores/UIStore.svelte';
	import { appStore, validationStore, dataChangeStore } from '@stores/store.svelte';
	import { statusStore } from '@stores/collectionStore.svelte';

	// --- Derived from page & stores ---
	let user = $derived(page.data.user);
	let isAdmin = $derived(page.data.isAdmin === true);

	let currentMode = $derived(mode.value);
	let currentCollection = $derived(collection.value);
	let currentEntry = $derived(collectionValue.value as Record<string, any> | null);

	let isDesktop = $derived(screenSizeStore.isDesktop);
	let isMobile = $derived(['SM', 'XS', 'MD'].includes(screenSizeStore.screenSize));

	let isFormValid = $derived(validationStore.isValid);
	let hasChanges = $derived(dataChangeStore.hasChanges);

	let canWrite = $derived(currentCollection?.permissions?.[user?.role]?.write !== false);
	let canCreate = $derived(currentCollection?.permissions?.[user?.role]?.create !== false);
	let canDelete = $derived(currentCollection?.permissions?.[user?.role]?.delete !== false);

	// --- Local mutable state ---
	let showMore = $state(false);
	let previousLanguage = $state(appStore.contentLanguage);
	let previousTabSet = $state(appStore.tabSetState);
	let tempData = $state<Partial<Record<string, Record<string, any>>>>({});

	// Schedule (not used in current logic – kept if needed later)
	let scheduleTimestamp = $derived(currentEntry?._scheduled ? Number(currentEntry._scheduled) : null);

	// Status toggle state & disable logic
	let publishToggle = $derived(statusStore.isPublish);
	let disableStatusToggle = $derived(
		(currentMode === 'create' && uiStore.isRightSidebarVisible) ||
			(currentMode === 'edit' && uiStore.isRightSidebarVisible && isDesktop) ||
			statusStore.isLoading
	);

	// Next button visibility (menu wizard)
	let showNextButton = $derived(
		appStore.shouldShowNextButton && currentMode === 'create' && (currentCollection?.name === 'Menu' || currentCollection?.slug === 'menu')
	);

	// --- Effects ---
	$effect(() => {
		if (appStore.tabSetState !== previousTabSet) {
			untrack(() => {
				tempData[previousLanguage] = { ...currentEntry };
				previousTabSet = appStore.tabSetState;
			});
		}
	});

	$effect(() => {
		if (currentMode === 'view') {
			untrack(() => (tempData = {}));
		}
	});

	$effect(() => {
		if (['edit', 'create'].includes(currentMode)) {
			untrack(() => (showMore = false));
		}
	});

	// --- Helpers ---
	function isUUID(str: string): boolean {
		return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
	}

	function getDisplayName(value?: string | null): string {
		if (!value || isUUID(value)) {
			if (user?.username && !isUUID(user.username)) return user.username;
			if (user?.firstName || user?.lastName) return [user.firstName, user.lastName].filter(Boolean).join(' ');
			if (user?.email) return user.email.split('@')[0];
			return 'system';
		}
		return value;
	}

	// --- Actions ---
	async function toggleStatus(newValue: boolean): Promise<void> {
		await statusStore.toggleStatus(newValue, 'HeaderEdit');
	}

	function openSchedule(): void {
		showScheduleModal({
			onSchedule: (date: Date) => {
				setCollectionValue({
					...currentEntry!,
					status: StatusTypes.schedule,
					_scheduled: date.getTime()
				});
			}
		});
	}

	async function save(): Promise<void> {
		if (!isFormValid) {
			showToast(m.validation_fix_before_save(), 'warning');
			return;
		}

		if (currentMode === 'edit' && !hasChanges) {
			logger.debug('[HeaderEdit] No changes – returning to list');
			await navigationManager.navigateToList();
			return;
		}

		const dataToSave = { ...currentEntry! };

		// Use status from store
		dataToSave.status = statusStore.getStatusForSave();
		if (scheduleTimestamp) {
			dataToSave._scheduled = scheduleTimestamp;
		} else {
			delete dataToSave._scheduled;
		}

		// Metadata
		if (currentMode === 'create') {
			dataToSave.createdBy = getDisplayName(user?.username);
		}
		dataToSave.updatedBy = getDisplayName(user?.username);

		const success = await saveEntry(dataToSave);
		if (!success) return;

		await navigationManager.navigateToList();
	}

	function cancel(): void {
		document.dispatchEvent(new CustomEvent('cancelEdit', { bubbles: true }));
		if (currentMode === 'create') setCollectionValue({});
		toggleUIElement('rightSidebar', 'hidden');
		toggleUIElement('leftSidebar', isDesktop ? 'full' : 'collapsed');
		navigationManager.navigateToList();
	}

	function openDelete(): void {
		deleteCurrentEntry(isAdmin);
	}

	function openClone(): void {
		showCloneModal({
			count: 1,
			onConfirm: async () => {
				if (!currentEntry || !currentCollection?._id) {
					showToast('No entry or collection selected.', 'warning');
					return;
				}
				const payload = { ...currentEntry };
				delete payload._id;
				delete payload.createdAt;
				delete payload.updatedAt;
				payload.status = StatusTypes.draft;
				payload.clonedFrom = currentEntry._id;

				const result = await createEntry(currentCollection._id, payload);
				if (result.success) {
					showToast('Entry cloned successfully.', 'success');
					invalidateCollectionCache(currentCollection._id);
					setMode('view');
				} else {
					showToast(result.error || 'Failed to clone', 'error');
				}
			}
		});
	}

	// Placeholder for menu wizard next
	function next(): void {
		logger.debug('[HeaderEdit] Next clicked – implement wizard step');
	}
</script>

<header
	class="border-secondary-600-300-token sticky top-0 z-20 flex w-full items-center justify-between border-b bg-white p-2 shadow-sm dark:bg-surface-700"
	class:border-b-0={showMore}
>
	<div class="flex items-center gap-2">
		{#if uiVisibility.current.leftSidebar === 'hidden'}
			<button
				onclick={() => toggleUIElement('leftSidebar', isDesktop ? 'full' : 'collapsed')}
				aria-label="Toggle sidebar"
				class="btn-icon variant-ghost-surface"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
			</button>
		{/if}

		<button
			onclick={save}
			disabled={!isFormValid || !canWrite}
			class="btn-icon"
			class:variant-ghost-surface={!(!isFormValid || !canWrite)}
			class:variant-filled-surface={!isFormValid || !canWrite}
			class:cursor-not-allowed={!isFormValid || !canWrite}
			class:opacity-50={!isFormValid || !canWrite}
			aria-label="Save"
		>
			<iconify-icon icon={currentCollection?.icon ?? 'mdi:file-document'} width="24"></iconify-icon>
		</button>

		{#if currentCollection?.name && currentMode !== 'view'}
			<div class="ml-2 hidden sm:block">
				<div class="text-sm uppercase opacity-70">{currentMode}</div>
				<div class="text-sm font-bold capitalize">
					<span class="text-tertiary-500 dark:text-primary-500">{currentCollection.name}</span>
				</div>
			</div>
		{/if}
	</div>

	<div class="flex items-center gap-2">
		<!-- Mobile: Translation + Save/Next + More -->
		{#if isMobile}
			{#if showMore}
				{#if ['edit', 'create'].includes(currentMode)}
					<button
						onclick={save}
						disabled={!isFormValid || !canWrite}
						class="btn-icon variant-filled-tertiary dark:variant-filled-primary"
						class:opacity-50={!isFormValid || !canWrite}
						aria-label="Save"
					>
						<iconify-icon icon="material-symbols:save" width="24"></iconify-icon>
					</button>
				{/if}
				<button onclick={() => (showMore = false)} class="btn-icon variant-filled-tertiary" aria-label="Show less">
					<iconify-icon icon="material-symbols:filter-list-rounded" width="30"></iconify-icon>
				</button>
			{:else}
				<TranslationStatus />

				{#if ['edit', 'create'].includes(currentMode)}
					{#if showNextButton}
						<button onclick={next} class="btn-icon variant-filled-primary lg:hidden" aria-label="Next">
							<iconify-icon icon="carbon:next-filled" width="24"></iconify-icon>
						</button>
					{:else}
						<button
							onclick={save}
							disabled={!isFormValid || !canWrite}
							class="btn-icon variant-filled-tertiary dark:variant-filled-primary lg:hidden"
							class:opacity-50={!isFormValid || !canWrite}
							aria-label="Save"
						>
							<iconify-icon icon="material-symbols:save" width="24"></iconify-icon>
						</button>
					{/if}
				{/if}

				<button onclick={() => (showMore = true)} class="btn-icon variant-ghost-surface" aria-label="Show more">
					<iconify-icon icon="material-symbols:filter-list-rounded" width="30"></iconify-icon>
				</button>
			{/if}
		{:else}
			<!-- Desktop: Translation status visible by default -->
			<div class="hidden md:block">
				<TranslationStatus />
			</div>
		{/if}

		{#if !appStore.headerActionButton}
			<button onclick={cancel} class="btn-icon variant-ghost-surface" aria-label="Cancel">
				<iconify-icon icon="material-symbols:close" width="24"></iconify-icon>
			</button>
		{/if}
	</div>
</header>

{#if showMore}
	<div class="-mx-2 mb-2 flex flex-col gap-4 border-b px-4 pt-3">
		<div class="flex justify-center gap-6">
			<!-- Status Toggle -->
			<div class="flex flex-col items-center">
				<Toggles value={publishToggle} disabled={disableStatusToggle} onChange={toggleStatus} />
				<span class="mt-1 text-xs" class:text-primary-500={publishToggle} class:text-error-500={!publishToggle}>
					{publishToggle ? m.status_publish() : m.status_unpublish()}
				</span>
			</div>

			<!-- Delete -->
			<div class="flex flex-col items-center">
				<button onclick={openDelete} disabled={!canDelete} class="btn-icon gradient-error" aria-label="Delete">
					<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon>
				</button>
			</div>

			{#if ['edit', 'create'].includes(currentMode)}
				<!-- Schedule -->
				<div class="flex flex-col items-center">
					<button onclick={openSchedule} disabled={!canWrite} class="btn-icon gradient-pink" aria-label="Schedule">
						<iconify-icon icon="bi:clock" width="24"></iconify-icon>
					</button>
				</div>

				<!-- Clone -->
				<div class="flex flex-col items-center">
					<button onclick={openClone} disabled={!canWrite || !canCreate} class="btn-icon gradient-secondary" aria-label="Clone">
						<iconify-icon icon="bi:clipboard-data-fill" width="24"></iconify-icon>
					</button>
				</div>
			{/if}
		</div>

		<div class="space-y-1 text-sm">
			<p>Created by: {getDisplayName(currentEntry?.createdBy as string)}</p>
			{#if currentEntry?.updatedBy}
				<p class="text-tertiary-500 dark:text-primary-400">
					Last updated by: {getDisplayName(currentEntry?.updatedBy as string)}
				</p>
			{/if}
			{#if scheduleTimestamp}
				<p class="text-tertiary-500 dark:text-primary-400">
					Will publish on: {new Date(scheduleTimestamp).toLocaleString()}
				</p>
			{/if}
		</div>
	</div>
{/if}
