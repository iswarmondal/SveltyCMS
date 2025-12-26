<!--
@file src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionWidget/ModalSelectWidget.svelte
@component ModalSelectWidget – Modal for selecting a field widget type

@features
- Searchable grid of available/active widgets
- Icon + description tooltip on hover
- Immediate selection (click to confirm)
- Responsive grid layout
-->

<script lang="ts">
	import { logger } from '@utils/logger';
	import { widgetFunctions, widgetStoreActions, activeWidgets } from '@stores/widgetStore.svelte';
	import { getModalStore, popup, type PopupSettings } from '@skeletonlabs/skeleton';

	import * as m from '@src/paraglide/messages';

	const modalStore = getModalStore();

	interface Props {
		parent: any;
		existingCategory?: { name: string; icon: string };
	}

	let { parent, existingCategory = { name: '', icon: '' } }: Props = $props();

	// Local state
	let searchTerm = $state('');

	// Derived data
	let modal = $derived($modalStore[0]);
	let availableWidgets = $derived(widgetFunctions ?? {});
	let activeWidgetKeys = $derived(activeWidgets ?? []);

	let filteredWidgets = $derived(activeWidgetKeys.filter((key: string) => key.toLowerCase().includes(searchTerm.toLowerCase())));

	// Initialize widgets on mount
	$effect(() => {
		widgetStoreActions.initializeWidgets();
	});

	// Submit selected widget & close modal
	function selectWidget(key: string): void {
		if (!modal?.response) {
			logger.error('No modal response handler');
			return;
		}
		modal.response({ selectedWidget: key });
		modalStore.close();
	}

	// Tooltip factory
	function tooltipFor(key: string): PopupSettings {
		return { event: 'hover', target: key, placement: 'top' };
	}
</script>

{#if modal}
	<div class="card h-screen w-screen space-y-4 overflow-y-auto p-4 shadow-xl">
		<header class="text-center text-2xl font-bold text-tertiary-500 dark:text-primary-500">
			{modal.title ?? '(title missing)'}
		</header>

		<article class="hidden text-center sm:block">{modal.body ?? ''}</article>

		<form class="space-y-4 rounded-container-token border border-surface-500 p-4">
			<div class="border-b pb-2 text-center text-primary-500">Choose your Widget</div>

			<input type="text" bind:value={searchTerm} placeholder="Search..." class="input w-full" />

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
				{#each filteredWidgets as key (key)}
					{@const widget = availableWidgets[key]}
					{#if widget?.GuiSchema}
						<button
							onclick={() => selectWidget(key)}
							aria-label={key}
							class="btn variant-outline-warning hover:variant-ghost-warning relative flex items-center justify-start gap-2"
						>
							<iconify-icon icon={widget.Icon} width="22" class="text-tertiary-500"></iconify-icon>
							<span class="text-surface-700 dark:text-white">{key}</span>

							<iconify-icon icon="material-symbols:info" width="20" use:popup={tooltipFor(key)} class="absolute -right-1.5 -top-1.5 text-primary-500"
							></iconify-icon>
						</button>

						<div class="card variant-filled-secondary p-4 shadow-xl" data-popup={key}>
							<p>{widget.Description ?? 'No description'}</p>
							<div class="arrow variant-filled-secondary"></div>
						</div>
					{/if}
				{/each}
			</div>
		</form>

		<footer class="flex {existingCategory.name ? 'justify-between' : 'justify-end'}">
			<button class="btn variant-outline-secondary" onclick={parent.onClose}>
				{m.button_cancel()}
			</button>
		</footer>
	</div>
{/if}
