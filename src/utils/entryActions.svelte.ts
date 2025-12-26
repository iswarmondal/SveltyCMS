/**
 * @file src/utils/entryActions.ts
 * @description Centralized entry actions (status, delete, clone, schedule, draft)
 *
 * Features:
 * - Bulk & single operations
 * - Archive vs permanent delete logic
 * - Scheduling with modal
 * - Clone with modal
 * - Unsaved changes draft handling
 * - Consistent toast messaging
 */

import type { StatusType } from '@src/content/types';
import { StatusTypes } from '@src/content/types';
import { publicEnv } from '@src/stores/globalSettings.svelte';

import * as m from '@src/paraglide/messages';

import { collection, collectionValue, setCollectionValue, modeStateMachine } from '@stores/collectionStore.svelte';

import { showToast } from '@utils/toast';
import { logger } from '@utils/logger';
import { entryMessages } from './entryActionsMessages';
import { showCloneModal, showConfirm, showScheduleModal } from './modalUtils';

import {
	batchDeleteEntries,
	batchUpdateEntries,
	createClones,
	createEntry,
	deleteEntry,
	invalidateCollectionCache,
	updateEntry,
	updateEntryStatus
} from './apiClient';

// Bulk status update
export async function setEntriesStatus(entryIds: string[], status: StatusType, onSuccess: () => void, payload: Record<string, unknown> = {}) {
	if (!entryIds.length) return;

	const collId = collection.value?._id;
	if (!collId) return;

	const res = await batchUpdateEntries(collId, { ids: entryIds, status, ...payload });
	if (res.success) {
		const msg =
			status === StatusTypes.archive
				? entryMessages.archived(entryIds.length)
				: status === StatusTypes.publish
					? entryMessages.published(entryIds.length)
					: status === StatusTypes.unpublish
						? entryMessages.unpublished(entryIds.length)
						: entryMessages.updated(entryIds.length, status);

		showToast(msg, 'success');
		onSuccess();
	} else {
		showToast(res.error ?? entryMessages.updateFailed(status), 'error');
	}
}

// Bulk delete/archive
export async function deleteEntries(entryIds: string[], permanent = false, onSuccess: () => void) {
	if (!entryIds.length) return;

	const collId = collection.value?._id;
	if (!collId) return;

	const archiving = publicEnv.USE_ARCHIVE_ON_DELETE && !permanent;

	try {
		if (archiving) {
			await setEntriesStatus(entryIds, StatusTypes.archive, onSuccess);
		} else {
			const res = await batchDeleteEntries(collId, entryIds);
			if (res.success) {
				showToast(entryMessages.deleted(entryIds.length), 'success');
				onSuccess();
			} else {
				throw new Error(res.error ?? 'Batch delete failed');
			}
		}
	} catch (e) {
		// Fallback individual delete
		logger.warn('Batch delete failed, falling back to individual', e);
		await Promise.all(entryIds.map((id) => deleteEntry(collId, id)));
		showToast(entryMessages.deleted(entryIds.length), 'success');
		onSuccess();
	}
}

// Clone entries
export async function cloneEntries(entries: Record<string, unknown>[], onSuccess: () => void) {
	if (!entries.length) return;

	const collId = collection.value?._id;
	if (!collId) return;

	const cleaned = entries.map((e) => {
		const { _id, createdAt, updatedAt, ...rest } = e;
		return { ...rest, clonedFrom: _id };
	});

	const res = await createClones(collId, cleaned);
	if (res.success) {
		showToast(entryMessages.cloned(entries.length), 'success');
		onSuccess();
	} else {
		showToast(res.error ?? 'Clone failed', 'error');
	}
}

// Save entry (create/update)
export async function saveEntry(data: Record<string, unknown>, publish = false): Promise<boolean> {
	const collId = collection.value?._id;
	if (!collId) {
		showToast('Collection not found', 'warning');
		return false;
	}

	const id = data._id as string | undefined;
	const payload = { ...data };

	if (publish) payload.status = StatusTypes.publish;
	else if (!payload.status) payload.status = collection.value?.status ?? StatusTypes.draft;

	const res = id ? await updateEntry(collId, id, payload) : await createEntry(collId, payload);

	if (res.success) {
		showToast(entryMessages.singleSaved(), 'success');
		if (res.data) setCollectionValue(res.data as Record<string, unknown>);
		invalidateCollectionCache(collId);
		document.dispatchEvent(new CustomEvent('clearEntryListCache', { detail: { collectionId: collId } }));
		return true;
	}

	showToast(res.error ?? 'Save failed', 'error');
	return false;
}

// Delete current entry (with archive/delete logic)
export async function deleteCurrentEntry(isAdmin = false) {
	const entry = collectionValue.value;
	const coll = collection.value;
	if (!entry?._id || !coll?._id) {
		showToast(m.delete_entry_no_selection_error(), 'warning');
		return;
	}

	const collId = coll._id as string;
	const entryId = entry._id as string;
	const isArchived = (entry.status as StatusType) === StatusTypes.archive;
	const useArchive = publicEnv.USE_ARCHIVE_ON_DELETE;

	if (!useArchive || (isArchived && !isAdmin)) {
		// Direct delete
		showConfirm({
			title: 'Confirm Deletion',
			body: isArchived ? 'Permanently delete this archived entry? This cannot be undone.' : 'Delete this entry?',
			confirmText: 'Delete',
			confirmClasses: 'bg-error-500 hover:bg-error-600 text-white',
			onConfirm: async () => {
				try {
					await deleteEntry(collId, entryId);
					showToast(entryMessages.singleDeleted(), 'success');
					modeStateMachine.transitionTo('view');
					setCollectionValue({});
					invalidateCollectionCache(collId);
				} catch (e) {
					showToast((e as Error).message, 'error');
				}
			}
		});
	} else if (isArchived) {
		// Admin on archived: permanent delete
		showConfirm({
			title: 'Permanent Delete',
			body: 'Permanently delete this archived entry?',
			confirmText: 'Delete Permanently',
			confirmClasses: 'bg-error-500 hover:bg-error-600 text-white',
			onConfirm: async () => {
				try {
					await deleteEntry(collId, entryId);
					showToast(entryMessages.singleDeleted(), 'success');
					modeStateMachine.transitionTo('view');
					setCollectionValue({});
					invalidateCollectionCache(collId);
				} catch (e) {
					showToast((e as Error).message, 'error');
				}
			}
		});
	} else if (isAdmin) {
		// Admin choice: archive or delete
		showConfirm({
			title: 'Archive Entry?',
			body: 'Archive this entry (can be restored later)?',
			confirmText: 'Archive',
			cancelText: 'Permanent Delete',
			confirmClasses: 'bg-warning-500 hover:bg-warning-600 text-white',
			onConfirm: () => performArchive(collId, entryId),
			onCancel: () => performPermanentDelete(collId, entryId)
		});
	} else {
		// Non-admin: archive only
		performArchive(collId, entryId);
	}
}

async function performArchive(collId: string, entryId: string) {
	try {
		await updateEntryStatus(collId, entryId, StatusTypes.archive);
		setCollectionValue({ ...collectionValue.value, status: StatusTypes.archive });
		showToast(entryMessages.singleArchived(), 'success');
		modeStateMachine.transitionTo('view');
	} catch (e) {
		showToast((e as Error).message, 'error');
	}
}

async function performPermanentDelete(collId: string, entryId: string) {
	showConfirm({
		title: 'Permanent Delete',
		body: 'Permanently delete this entry? This cannot be undone.',
		confirmText: 'Delete Permanently',
		confirmClasses: 'bg-error-500 hover:bg-error-600 text-white',
		onConfirm: async () => {
			try {
				await deleteEntry(collId, entryId);
				showToast(entryMessages.singleDeleted(), 'success');
				modeStateMachine.transitionTo('view');
				setCollectionValue({});
				invalidateCollectionCache(collId);
			} catch (e) {
				showToast((e as Error).message, 'error');
			}
		}
	});
}

// Schedule current entry
export async function scheduleCurrentEntry(scheduledDate?: Date) {
	const entry = collectionValue.value;
	const coll = collection.value;
	if (!entry?._id || !coll?._id) {
		showToast(entryMessages.noSchedulingTarget(), 'warning');
		return;
	}

	const collId = coll._id as string;
	const entryId = entry._id as string;

	if (scheduledDate) {
		await updateEntryStatus(collId, entryId, StatusTypes.publish);
		setCollectionValue({
			...collectionValue.value,
			status: StatusTypes.publish,
			scheduledDate: scheduledDate.toISOString()
		});
		showToast(entryMessages.scheduledAt(scheduledDate.toLocaleDateString()), 'success');
	} else {
		showScheduleModal({
			onSchedule: async (date: Date) => {
				await updateEntryStatus(collId, entryId, StatusTypes.publish);
				setCollectionValue({
					...collectionValue.value,
					status: StatusTypes.publish,
					scheduledDate: date.toISOString()
				});
				showToast(entryMessages.scheduledAt(date.toLocaleDateString()), 'success');
			}
		});
	}
}

// Clone current entry
export async function cloneCurrentEntry() {
	const entry = collectionValue.value;
	const coll = collection.value;
	if (!entry || !coll?._id) {
		showToast(m.clone_entry_no_selection_error(), 'warning');
		return;
	}

	showCloneModal({
		count: 1,
		onConfirm: async () => {
			const payload = JSON.parse(JSON.stringify(entry));
			delete payload._id;
			delete payload.createdAt;
			delete payload.updatedAt;
			payload.status = StatusTypes.draft;
			payload.clonedFrom = entry._id;

			const res = await createEntry(coll._id as string, payload);
			if (res.success) {
				showToast(entryMessages.singleCloned(), 'success');
				invalidateCollectionCache(coll._id as string);
				modeStateMachine.transitionTo('view');
			} else {
				showToast(res.error ?? 'Clone failed', 'error');
			}
		}
	});
}

// Unsaved changes tracking
let hasUnsaved = $state(false);

export const unsavedChanges = {
	get has() {
		return hasUnsaved;
	},
	mark() {
		hasUnsaved = true;
	},
	reset() {
		hasUnsaved = false;
	}
};
