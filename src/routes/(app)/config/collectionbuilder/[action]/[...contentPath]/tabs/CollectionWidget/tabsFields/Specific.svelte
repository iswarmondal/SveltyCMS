<!--
@file src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionWidget/tabsFields/Specific.svelte
@component Specific – Widget-specific configuration fields

@features
- Dynamically renders extra GuiSchema fields beyond defaults
- Reactive to open modal & selected widget
- Uses InputSwitch for each specific property
-->

<script lang="ts">
	import InputSwitch from '@components/system/builder/InputSwitch.svelte';
	import { getModalStore } from '@skeletonlabs/skeleton';
	import { targetWidget } from '@src/stores/collectionStore.svelte';
	import { widgetFunctions } from '@stores/widgetStore.svelte';

	const modalStore = getModalStore();

	const DEFAULT_FIELDS = ['label', 'display', 'db_fieldName', 'required', 'translated', 'icon', 'helper', 'width', 'permissions'] as const;

	// Derived: current modal & widget data
	let modalData = $derived($modalStore[0]?.value);
	let currentWidget = $derived(modalData?.widget);
	let widgetName = $derived(currentWidget?.Name);
	let guiSchema = $derived(widgetName ? ((widgetFunctions as Record<string, any>)[widgetName]?.GuiSchema ?? null) : null);

	// Derived: specific (non-default) field keys
	let specificFields = $derived(guiSchema ? Object.keys(guiSchema).filter((key) => !DEFAULT_FIELDS.includes(key as any)) : []);

	// Update handler – mutable targetWidget store
	function updateProperty(property: string, value: any): void {
		targetWidget.value = {
			...targetWidget.value,
			[property]: value
		};
	}
</script>

{#if modalData && guiSchema}
	{#if specificFields.length > 0}
		{#each specificFields as property (property)}
			<InputSwitch
				value={targetWidget.value[property]}
				onupdate={(e: any) => updateProperty(property, e.value)}
				widget={(guiSchema as any)?.[property]?.widget}
				key={property}
			/>
		{/each}
	{:else}
		<div class="py-4 text-center text-sm text-surface-500">No specific options for this widget type</div>
	{/if}
{/if}
