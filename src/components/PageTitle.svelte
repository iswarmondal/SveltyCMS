<!--
@file src/components/PageTitle.svelte
@component PageTitle – Dynamic, accessible page header with optional icon, highlight, back button

@props
- name: string — Main page title (required)
- highlight?: string — Substring to highlight in title
- icon?: string — Iconify icon name
- iconColor?: string — Icon color classes (default: tertiary/dark primary)
- iconSize?: string — Icon width/height (default: 32)
- showBackButton?: boolean — Show back navigation button
- backUrl?: string — Optional href for back button (uses history.back if omitted)
- truncate?: boolean — Truncate long titles (default: true)
- onBackClick?: (defaultBehavior: () => void) => void — Custom back handler

@features
- Fluid responsive typography
- Highlight support
- Full accessibility (ARIA live, SR-only fallback, keyboard nav)
- Optional sidebar toggle when hidden
- CMS-friendly data attributes
-->

<script lang="ts">
	import { toggleUIElement, uiVisibility } from '@stores/UIStore.svelte';
	import { screenSizeStore } from '@stores/screenSizeStore.svelte';

	interface Props {
		name: string;
		highlight?: string;
		icon?: string;
		iconColor?: string;
		iconSize?: string;
		showBackButton?: boolean;
		backUrl?: string;
		truncate?: boolean;
		onBackClick?: (defaultBehavior: () => void) => void;
	}

	let {
		name,
		highlight = '',
		icon = '',
		iconColor = 'text-tertiary-500 dark:text-primary-500',
		iconSize = '32',
		showBackButton = false,
		backUrl = '',
		truncate = true,
		onBackClick
	}: Props = $props();

	// Derived: split title for highlighting
	let titleParts = $derived.by(() => {
		if (!highlight || !name.toLowerCase().includes(highlight.toLowerCase())) {
			return [name];
		}
		const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const regex = new RegExp(`(${escaped})`, 'gi');
		return name.split(regex);
	});

	// Derived UI state
	let isSidebarHidden = $derived(uiVisibility.current.leftSidebar === 'hidden');
	let isDesktop = $derived(screenSizeStore.isDesktop);

	// Back button handler
	function handleBack(e: MouseEvent) {
		const defaultBehavior = () => {
			if (!backUrl) {
				e.preventDefault();
				window.history.back();
			}
		};

		if (onBackClick) {
			e.preventDefault();
			onBackClick(defaultBehavior);
		} else if (!backUrl) {
			e.preventDefault();
			window.history.back();
		}
	}
</script>

<div class="my-1 flex w-full min-w-0 items-center justify-between gap-4">
	<div class="flex min-w-0 items-center gap-2">
		{#if isSidebarHidden}
			<button
				type="button"
				onclick={() => toggleUIElement('leftSidebar', isDesktop ? 'full' : 'collapsed')}
				aria-label="Open sidebar"
				class="btn-icon variant-ghost-surface"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
			</button>
		{/if}

		<h1
			class="h1 relative ml-2 flex items-center gap-1 font-bold transition-all"
			style="font-size: clamp(1.5rem, 3vw + 1rem, 2.25rem);"
			aria-live="polite"
			data-cms-field="pageTitle"
			data-cms-type="text"
		>
			{#if icon}
				<iconify-icon {icon} width={iconSize} class="mr-1 shrink-0 sm:mr-2 {iconColor}" aria-hidden="true"></iconify-icon>
			{/if}

			<span class="block min-w-0" class:overflow-hidden={truncate} class:text-ellipsis={truncate} class:whitespace-nowrap={truncate}>
				{#each titleParts as part, i (i)}
					<span class={i % 2 === 1 ? 'font-semibold text-tertiary-500 dark:text-primary-500' : ''}>
						{part}
					</span>
				{/each}
			</span>

			<!-- Screen-reader fallback with full non-truncated title -->
			<span class="sr-only">{name}</span>
		</h1>
	</div>

	{#if showBackButton}
		{#if backUrl}
			<a
				href={backUrl}
				onclick={handleBack}
				aria-label="Go back"
				class="btn-icon variant-outline-tertiary dark:variant-outline-primary shrink-0"
				style="min-width: 48px; min-height: 48px;"
				data-cms-action="back"
				data-sveltekit-preload-data="hover"
			>
				<iconify-icon icon="ri:arrow-left-line" width="24"></iconify-icon>
			</a>
		{:else}
			<button
				onclick={handleBack}
				aria-label="Go back"
				class="btn-icon variant-outline-tertiary dark:variant-outline-primary shrink-0"
				style="min-width: 48px; min-height: 48px;"
				data-cms-action="back"
			>
				<iconify-icon icon="ri:arrow-left-line" width="24"></iconify-icon>
			</button>
		{/if}
	{/if}
</div>
