/**
 * @file src/utils/dateUtils.ts
 * @description Date utilities for consistent ISO handling & formatting
 *
 * Features:
 * - Type-safe ISODateString conversion
 * - Safe unknown → Date parsing
 * - Locale-aware display & relative formatting
 * - ISO duration parsing
 */

import type { ISODateString } from '@src/content/types';
import { logger } from '@utils/logger';

/** Type guard for ISODateString */
export function isISODateString(v: unknown): v is ISODateString {
	return typeof v === 'string' && !isNaN(new Date(v).getTime()) && new Date(v).toISOString() === v;
}

/** Date → ISODateString */
export function dateToISO(date: Date): ISODateString {
	const iso = date.toISOString();
	if (!isISODateString(iso)) throw new Error('Invalid date');
	return iso;
}

/** Safe unknown → ISODateString (fallback to now) */
export function toISO(v: unknown): ISODateString {
	try {
		if (v instanceof Date) return dateToISO(v);
		if (typeof v === 'string' && isISODateString(v)) return v;
		if (typeof v === 'number') return dateToISO(new Date(v > 1e12 ? v : v * 1000));
		return dateToISO(new Date(v as any));
	} catch (e) {
		logger.warn('Date conversion failed, using now', { input: v });
		return dateToISO(new Date());
	}
}

/** Normalize various inputs to ISODateString */
export function normalizeISO(input: Date | string | number | null | undefined): ISODateString {
	if (!input) return dateToISO(new Date());
	if (input instanceof Date) return dateToISO(input);
	if (typeof input === 'number') return dateToISO(new Date(input > 1e12 ? input : input * 1000));
	return toISO(input);
}

/** Current time as ISODateString */
export const nowISO = () => dateToISO(new Date());

/** ISODateString → Date */
export function fromISO(iso: ISODateString): Date {
	return new Date(iso);
}

/** Simple pattern formatting (yyyy-MM-dd HH:mm:ss) */
export function formatDate(input: Date | string | number, pattern = 'yyyy-MM-dd HH:mm:ss', fallback = 'Invalid Date'): string {
	try {
		const d = input instanceof Date ? input : new Date(typeof input === 'number' ? input * (input > 1e12 ? 1 : 1000) : input);
		if (isNaN(d.getTime())) return fallback;

		const pad = (n: number) => n.toString().padStart(2, '0');
		return pattern
			.replace('yyyy', d.getFullYear().toString())
			.replace('MM', pad(d.getMonth() + 1))
			.replace('dd', pad(d.getDate()))
			.replace('HH', pad(d.getHours()))
			.replace('mm', pad(d.getMinutes()))
			.replace('ss', pad(d.getSeconds()));
	} catch (e) {
		logger.warn('Date formatting failed', e);
		return fallback;
	}
}

/** Locale-aware display */
export function formatDisplay(
	input: Date | string | number,
	locale = 'en',
	opts: Intl.DateTimeFormatOptions = {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	}
): string {
	try {
		const d = input instanceof Date ? input : new Date(typeof input === 'number' ? input * (input > 1e12 ? 1 : 1000) : input);
		if (isNaN(d.getTime())) return 'Invalid Date';
		return new Intl.DateTimeFormat(locale, opts).format(d);
	} catch (e) {
		logger.warn('Display formatting failed', e);
		return 'Invalid Date';
	}
}

/** Relative time ("2 hours ago") */
export function formatRelative(input: Date | string | number, locale = 'en'): string {
	try {
		const d = input instanceof Date ? input : new Date(typeof input === 'number' ? input * (input > 1e12 ? 1 : 1000) : input);
		if (isNaN(d.getTime())) return 'Invalid Date';

		const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
		const sec = Math.floor((Date.now() - d.getTime()) / 1000);

		if (Math.abs(sec) < 60) return rtf.format(-sec, 'second');
		if (Math.abs(sec) < 3600) return rtf.format(-Math.floor(sec / 60), 'minute');
		if (Math.abs(sec) < 86400) return rtf.format(-Math.floor(sec / 3600), 'hour');
		if (Math.abs(sec) < 2592000) return rtf.format(-Math.floor(sec / 86400), 'day');
		if (Math.abs(sec) < 31536000) return rtf.format(-Math.floor(sec / 2592000), 'month');
		return rtf.format(-Math.floor(sec / 31536000), 'year');
	} catch (e) {
		logger.warn('Relative formatting failed', e);
		return 'Invalid Date';
	}
}

/** ISO duration → HH:MM:SS */
export function formatDuration(iso?: string): string | undefined {
	if (!iso) return undefined;
	const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
	if (!m) return undefined;

	const h = parseInt(m[1] || '0', 10);
	const min = parseInt(m[2] || '0', 10);
	const sec = parseInt(m[3] || '0', 10);

	const parts = [];
	if (h) parts.push(String(h).padStart(2, '0'));
	parts.push(String(min).padStart(2, '0'));
	parts.push(String(sec).padStart(2, '0'));

	return parts.join(':');
}

/** Simple date string for filenames (YYYY-MM-DD) */
export function dateToISODateString(date: Date): string {
	return formatDate(date, 'yyyy-MM-dd', '');
}

/** Aliases for backward compatibility */
export const formatDisplayDate = formatDisplay;
export const isoDateStringToDate = fromISO;
export const formatDateString = formatDisplay;
export const formatIsoDuration = formatDuration;
export const nowISODateString = nowISO;
