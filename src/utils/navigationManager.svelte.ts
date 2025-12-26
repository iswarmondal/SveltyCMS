/**
 * @file src/utils/navigationManager.ts
 * @description Centralized navigation manager for consistent state transitions
 *
 * Features:
 * - Prevents concurrent navigation
 * - Coordinated mode transitions
 * - Loading state management
 * - Clean URL handling
 * - Event dispatch for save coordination
 */

import { goto } from '$app/navigation';
import { page } from '$app/state';

import { setCollectionValue } from '@src/stores/collectionStore.svelte';
import { dataChangeStore } from '@stores/store.svelte';
import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';
import { modeStateMachine } from '@src/stores/collectionStore.svelte';

import { logger } from '@utils/logger';

export class NavigationManager {
	private navigating = $state(false);

	get isNavigating(): boolean {
		return this.navigating;
	}

	// Navigate to list view (clean state)
	async toList(options?: { invalidate?: boolean }): Promise<void> {
		if (this.navigating) {
			logger.warn('[NavigationManager] Navigation already in progress');
			return;
		}

		this.navigating = true;
		globalLoadingStore.startLoading(loadingOperations.navigation, 'toList');

		try {
			// Signal save completion (prevents auto-draft)
			document.dispatchEvent(
				new CustomEvent('entrySaved', {
					bubbles: true,
					detail: { timestamp: Date.now() }
				})
			);

			// Reset changes & clear entry
			dataChangeStore.reset();
			setCollectionValue({});

			// Transition mode
			const ok = await modeStateMachine.transitionTo('view');
			if (!ok) {
				logger.error('[NavigationManager] Failed to transition to view');
				return;
			}

			const cleanUrl = page.url.pathname;
			await goto(cleanUrl, { invalidateAll: options?.invalidate ?? true });

			logger.debug('[NavigationManager] Navigated to list');
		} catch (err) {
			logger.error('[NavigationManager] List navigation failed', err);
			throw err;
		} finally {
			globalLoadingStore.stopLoading(loadingOperations.navigation);
			this.navigating = false;
		}
	}

	// Alias for backward compatibility
	async navigateToList(options?: { invalidate?: boolean }): Promise<void> {
		return this.toList(options);
	}

	// Navigate to edit entry
	async toEdit(entryId: string): Promise<void> {
		if (this.navigating || !entryId?.trim()) {
			logger.warn('[NavigationManager] Edit navigation blocked', { navigating: this.navigating, entryId });
			return;
		}

		this.navigating = true;
		globalLoadingStore.startLoading(loadingOperations.navigation, 'toEdit');

		try {
			const ok = await modeStateMachine.transitionTo('edit');
			if (!ok) {
				logger.error('[NavigationManager] Failed to transition to edit');
				return;
			}

			await goto(`${page.url.pathname}?edit=${entryId}`);
			logger.debug(`[NavigationManager] Navigated to edit ${entryId}`);
		} catch (err) {
			logger.error('[NavigationManager] Edit navigation failed', err);
			throw err;
		} finally {
			globalLoadingStore.stopLoading(loadingOperations.navigation);
			this.navigating = false;
		}
	}

	// Navigate to create view
	async toCreate(): Promise<void> {
		if (this.navigating) {
			logger.warn('[NavigationManager] Create navigation blocked');
			return;
		}

		this.navigating = true;
		globalLoadingStore.startLoading(loadingOperations.navigation, 'toCreate');

		try {
			const ok = await modeStateMachine.transitionTo('create');
			if (!ok) {
				logger.error('[NavigationManager] Failed to transition to create');
				return;
			}

			await goto(`${page.url.pathname}?create=true`);
			logger.debug('[NavigationManager] Navigated to create');
		} catch (err) {
			logger.error('[NavigationManager] Create navigation failed', err);
			throw err;
		} finally {
			globalLoadingStore.stopLoading(loadingOperations.navigation);
			this.navigating = false;
		}
	}

	// Force unlock (error recovery)
	forceUnlock(): void {
		logger.warn('[NavigationManager] Force unlock');
		this.navigating = false;
		globalLoadingStore.stopLoading(loadingOperations.navigation);
	}
}

export const navigationManager = new NavigationManager();
