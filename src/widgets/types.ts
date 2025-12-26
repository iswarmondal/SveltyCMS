/**
 * @file src/widgets/types.ts
 * @description Type definitions for widget system (3-pillar architecture, factory pattern)
 *
 * Key features:
 * - Strong typing with generics for widget props
 * - Clear separation: definition, factory, runtime
 * - Support for input/display components (3-pillar)
 * - Type guards for runtime checks
 */

import type { FieldInstance, Schema } from '@src/content/types';
import type { User } from '@src/databases/auth/types';
import type { GuiFieldConfig } from '@utils/utils';

export interface WidgetFunction {
	(field: any): any;
	Name?: string;
	Icon?: string;
	Description?: string;
	GuiSchema?: Record<string, unknown>;
	GraphqlSchema?: WidgetDefinition['GraphqlSchema'];
	aggregations?: WidgetDefinition['aggregations'];
	__inputComponentPath?: string;
	__displayComponentPath?: string;
	__widgetType?: WidgetType;
	__dependencies?: string[];
	componentPath?: string;
}

// ============================================================================
// Widget Classification
// ============================================================================

export type WidgetType = 'core' | 'custom' | 'marketplace';

export interface WidgetMetadata {
	type: WidgetType;
	version?: string;
	author?: string;
	dependencies?: string[];
	tags?: string[];
}

// ============================================================================
// Widget Definition (Immutable blueprint)
// ============================================================================

export interface WidgetDefinition<TProps extends Record<string, unknown> = Record<string, unknown>> {
	/** Unique identifier */
	widgetId: string;
	/** Display name */
	Name: string;
	Icon?: string;
	Description?: string;

	// 3-Pillar paths
	inputComponentPath?: string;
	displayComponentPath?: string;

	// Validation
	validationSchema: unknown | ((field: FieldInstance) => unknown);

	// Translation support
	getTranslatablePaths?: (basePath: string) => string[];

	// Defaults for widget-specific props
	defaults?: Partial<TProps>;

	// Builder UI schema
	GuiFields?: Record<string, unknown>;

	// GraphQL integration
	GraphqlSchema?: (params: { field: FieldInstance; label: string; collection: Schema; collectionNameMapping?: Map<string, string> }) => {
		typeID: string | null;
		graphql: string;
		resolver?: Record<string, unknown>;
	};

	// Aggregations (filters/sorts)
	aggregations?: {
		filters?: (params: { field: FieldInstance; filter: string; contentLanguage: string }) => Promise<unknown[]>;
		sorts?: (params: { field: FieldInstance; sortDirection: number; contentLanguage: string }) => Promise<Record<string, number>>;
	};

	metadata?: WidgetMetadata;
}

// ============================================================================
// Widget Factory (Callable creator)
// ============================================================================

export interface WidgetFactory<TProps extends Record<string, unknown> = Record<string, unknown>> {
	(config: FieldConfig<TProps>): FieldInstance;

	// Attached metadata (function properties)
	Name: string;
	Icon?: string;
	Description?: string;
	GuiSchema?: Record<string, unknown>;
	GraphqlSchema?: WidgetDefinition['GraphqlSchema'];
	aggregations?: WidgetDefinition['aggregations'];
	__inputComponentPath?: string;
	__displayComponentPath?: string;
	__widgetType?: WidgetType;
	__dependencies?: string[];
	componentPath?: string;

	toString(): string;
}

// ============================================================================
// Field Configuration
// ============================================================================

export type FieldConfig<TProps extends Record<string, unknown> = Record<string, unknown>> = {
	label: string;
	db_fieldName?: string;
	required?: boolean;
	translated?: boolean;
	width?: number;
	helper?: string;
	icon?: string;
	disabled?: boolean;
	readonly?: boolean;
	permissions?: Record<string, Record<string, boolean>>;
} & Partial<TProps>;

// ============================================================================
// Runtime Parameters
// ============================================================================

export interface WidgetRuntimeParams {
	field: FieldInstance;
	schema: Schema;
	user: User;
	value: unknown;
	values: Record<string, unknown>;
	onValueChange: (value: unknown) => void;
	config: GuiFieldConfig;
}

// Placeholder for lazy loading
export interface WidgetModule {
	default: WidgetFactory | WidgetDefinition;
}

export interface WidgetPlaceholder {
	__widgetId: string;
	__widgetName: string;
	__widgetConfig: Record<string, unknown>;
}

// ============================================================================
// Registry
// ============================================================================

export interface WidgetRegistryEntry {
	definition: WidgetDefinition;
	factory: WidgetFactory;
	status: 'active' | 'inactive' | 'error';
	metadata: WidgetMetadata;
	loadedAt?: Date;
	error?: string;
}

export interface WidgetRegistry {
	get(id: string): WidgetFactory | undefined;
	register(id: string, entry: WidgetRegistryEntry): void;
	unregister(id: string): void;
	list(): string[];
	getByType(type: WidgetType): WidgetRegistryEntry[];
	has(id: string): boolean;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isWidgetFactory(value: unknown): value is WidgetFactory {
	return typeof value === 'function' && 'Name' in value && typeof (value as any).Name === 'string';
}

export function isWidgetDefinition(value: unknown): value is WidgetDefinition {
	return typeof value === 'object' && value !== null && 'widgetId' in value && 'Name' in value && 'validationSchema' in value;
}

export function isFieldInstance(value: unknown): value is FieldInstance {
	return typeof value === 'object' && value !== null && 'widget' in value && 'label' in value && 'db_fieldName' in value;
}
