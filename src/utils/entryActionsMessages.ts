/**
 * @file src/utils/entryActionsMessages.ts
 * @description Centralized, localized messages for entry actions
 *
 * Features:
 * - Paraglide integration with fallbacks
 * - Plural-aware messages
 * - Consistent naming & structure
 */

import * as m from '@src/paraglide/messages';

export const entryMessages = {
	// Bulk success
	archived: (count: number) => m.entries_archived?.({ count }) ?? `${count} ${count === 1 ? 'entry' : 'entries'} archived`,
	published: (count: number) => m.entries_published?.({ count }) ?? `${count} ${count === 1 ? 'entry' : 'entries'} published`,
	unpublished: (count: number) => m.entries_unpublished?.({ count }) ?? `${count} ${count === 1 ? 'entry' : 'entries'} unpublished`,
	tested: (count: number) => m.entries_set_to_test?.({ count }) ?? `${count} ${count === 1 ? 'entry' : 'entries'} set to test`,
	deleted: (count: number) => m.entries_deleted?.({ count }) ?? `${count} ${count === 1 ? 'entry' : 'entries'} deleted`,
	scheduled: (count: number) => m.entries_scheduled?.({ count }) ?? `${count} ${count === 1 ? 'entry' : 'entries'} scheduled`,
	cloned: (count: number) => m.entries_cloned?.({ count }) ?? `${count} ${count === 1 ? 'entry' : 'entries'} cloned`,
	updated: (count: number, status: string) =>
		m.entries_updated?.({ count, status }) ?? `${count} ${count === 1 ? 'entry' : 'entries'} updated to ${status}`,

	// Errors
	updateFailed: (op: string) => m.update_failed?.({ operation: op }) ?? `Failed to ${op} entries`,
	deleteFailed: (op: string) => m.delete_failed?.({ operation: op }) ?? `Failed to ${op} entries`,
	noSelection: () => m.no_entries_selected?.() ?? 'No entries selected',
	noCollection: () => m.no_collection_found?.() ?? 'Collection not found',

	// Single entry
	singleArchived: () => m.entry_archived?.() ?? 'Entry archived',
	singleDeleted: () => m.entry_deleted_success?.() ?? 'Entry deleted',
	singleSaved: () => m.entry_saved?.() ?? 'Entry saved',
	statusUpdated: (status: string) => m.entry_status_updated?.({ status }) ?? `Status updated to ${status}`,
	scheduledAt: (date: string) => m.entry_scheduled?.({ date }) ?? `Scheduled for ${date}`,
	singleCloned: () => m.entry_cloned_success?.() ?? 'Entry cloned',

	// Permissions
	adminOnlyDelete: () => m.only_admins_can_delete?.() ?? 'Only admins can delete archived entries',
	reservedStatus: (status: string) => m.status_reserved_for_system?.({ status }) ?? `${status} status is system-reserved`,

	// Unsaved changes
	unsavedTitle: () => m.unsaved_changes_title?.() ?? 'Unsaved Changes',
	unsavedBody: () => m.unsaved_changes_body?.() ?? 'You have unsaved changes. Save as draft before leaving?',
	saveDraftLeave: () => m.save_as_draft_and_leave?.() ?? 'Save Draft & Leave',
	stayEditing: () => m.stay_and_continue_editing?.() ?? 'Stay & Continue',
	draftSaved: () => m.changes_saved_as_draft?.() ?? 'Changes saved as draft',
	draftError: (err: string) => m.error_saving_draft?.({ error: err }) ?? `Draft save error: ${err}`,

	// Scheduling
	noSchedulingTarget: () => m.no_entry_for_scheduling?.() ?? 'No entry selected for scheduling',
	schedulingSuccess: () => m.entry_scheduled_status?.() ?? 'Status set to scheduled',
	schedulingError: (err: string) => m.error_scheduling?.({ error: err }) ?? `Scheduling error: ${err}`,

	// Buttons
	confirm: () => m.button_confirm?.() ?? 'Confirm',
	cancel: () => m.button_cancel?.() ?? 'Cancel',
	delete: () => m.button_delete?.() ?? 'Delete',
	archive: () => m.button_archive?.() ?? 'Archive',
	publish: () => m.entrylist_multibutton_publish?.() ?? 'Publish',
	unpublish: () => m.entrylist_multibutton_unpublish?.() ?? 'Unpublish',
	schedule: () => m.entrylist_multibutton_schedule?.() ?? 'Schedule',
	clone: () => m.entrylist_multibutton_clone?.() ?? 'Clone',
	test: () => m.button_test?.() ?? 'Test'
};
