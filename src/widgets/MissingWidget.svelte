<!--
@file src/widgets/MissingWidget.svelte
@component MissingWidget – Graceful fallback for unavailable widgets

@props
- config: FieldInstance – The field referencing the missing widget
- showDebugInfo?: boolean – Show extra debug info (default: true in dev)

@features
- Clear, actionable error message
- Environment-aware display (dev vs prod)
- Links to widget management
- Accessibility (alert role, live region)
- Warning logging
-->

<script lang="ts">
	import type { FieldInstance } from '@src/content/types';
	import { logger } from '@utils/logger';

	interface Props {
		config: FieldInstance;
		showDebugInfo?: boolean;
	}

	let { config, showDebugInfo = import.meta.env.DEV }: Props = $props();

	// Derived info
	let widgetName = $derived(config.widget?.Name ?? config.__missingWidgetName ?? 'Unknown');
	let fieldLabel = $derived(config.label ?? 'Unnamed Field');
	let fieldName = $derived(config.db_fieldName ?? 'unknown_field');

	// Log once on mount
	$effect(() => {
		logger.warn(`[MissingWidget] Widget "${widgetName}" not available for field "${fieldLabel}" (${fieldName})`);
	});

	let isDev = $derived(import.meta.env.DEV);
</script>

<div
	class="missing-widget rounded-lg border-2 border-warning-400 bg-warning-50 p-4 dark:border-warning-600 dark:bg-warning-950/50"
	role="alert"
	aria-live="polite"
>
	<div class="flex items-start gap-3">
		<svg
			class="h-6 w-6 flex-shrink-0 text-warning-600 dark:text-warning-400"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			aria-hidden="true"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
			></path>
		</svg>

		<div class="flex-1">
			<h3 class="text-lg font-semibold text-warning-800 dark:text-warning-200">Missing Widget</h3>
			<p class="mt-1 text-sm text-warning-700 dark:text-warning-300">
				The widget <strong>{widgetName}</strong> is not available for field <strong>{fieldLabel}</strong>.
			</p>
		</div>
	</div>

	{#if showDebugInfo && isDev}
		<div class="mt-3 rounded border border-warning-300 bg-warning-100 p-3 text-xs font-mono dark:border-warning-700 dark:bg-warning-900/50">
			<div><span class="font-semibold">Widget:</span> {widgetName}</div>
			<div><span class="font-semibold">Field:</span> {fieldName}</div>
			<div><span class="font-semibold">Label:</span> {fieldLabel}</div>
		</div>
	{/if}

	<div class="mt-4">
		<p class="text-sm font-semibold text-warning-800 dark:text-warning-200">Possible solutions:</p>
		<ul class="mt-2 space-y-1 text-sm text-warning-700 dark:text-warning-300">
			<li class="flex items-start gap-2">
				<span class="mt-0.5">•</span>
				<span>
					Check widget status in
					<a href="/config/widgetManagement" class="underline hover:text-warning-900 dark:hover:text-warning-100"> Widget Management </a>
				</span>
			</li>
			<li class="flex items-start gap-2">
				<span class="mt-0.5">•</span>
				<span>Verify widget name spelling in collection schema</span>
			</li>
			{#if isDev}
				<li class="flex items-start gap-2">
					<span class="mt-0.5">•</span>
					<span>Ensure widget module has proper default export</span>
				</li>
			{/if}
		</ul>
	</div>

	{#if !isDev}
		<div class="mt-4 rounded border border-error-300 bg-error-50 p-2 text-xs text-error-700 dark:border-error-700 dark:bg-error-950/50">
			<strong>Note:</strong> This field is not editable until the widget is available.
		</div>
	{/if}
</div>

<style>
	.missing-widget {
		animation: fadeIn 0.3s ease-out;
	}
	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
