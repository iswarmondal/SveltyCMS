/**
 * @file src/utils/fileUploading.ts
 * @description Server-side file upload utilities (safe paths, size limits, progress)
 */

import * as fs from 'node:fs/promises';
import path from 'node:path';

import { logger } from '@utils/logger.server';
import { publicEnv } from '@stores/globalSettings.svelte';

const ROOT = process.cwd();
const MEDIA_ROOT = path.join(ROOT, publicEnv.MEDIA_FOLDER ?? 'media');

/**
 * Upload a file with safety checks & optional progress
 */
export async function uploadFile(file: File, folder?: string, onProgress?: (progress: number) => void) {
	if (!file?.size) throw new Error('Invalid or empty file');

	const MAX_SIZE = 50 * 1024 * 1024; // 50MB
	if (file.size > MAX_SIZE) throw new Error('File exceeds 50MB limit');

	// Sanitize folder (prevent traversal)
	const safeFolder = folder ? path.normalize(folder).replace(/^(\.\.(\/|\\|$))+/, '') : '';
	const dir = path.join(MEDIA_ROOT, safeFolder);

	// Ensure directory
	await fs.mkdir(dir, { recursive: true });

	// Sanitize filename
	const safeName = file.name.replace(/[^a-zA-Z0-9\-_.]/g, '_');
	const filePath = path.join(dir, safeName);

	// Prevent overwrite
	try {
		await fs.access(filePath);
		throw new Error(`File "${safeName}" already exists`);
	} catch (e: any) {
		if (e.code !== 'ENOENT') throw e;
	}

	// Write file
	const buffer = await file.arrayBuffer();
	if (onProgress) onProgress(0);
	await fs.writeFile(filePath, Buffer.from(buffer));
	if (onProgress) onProgress(100);

	logger.info('File uploaded', { path: filePath, size: file.size });

	return {
		success: true,
		path: path.relative(ROOT, filePath),
		filename: safeName,
		size: file.size
	};
}

/**
 * Create directory (idempotent)
 */
export async function createDirectory(relativePath: string) {
	if (typeof relativePath !== 'string' || !relativePath.trim()) {
		throw new Error('Invalid directory path');
	}

	const safePath = path.normalize(relativePath.trim()).replace(/^(\.\.(\/|\\|$))+/, '');
	const fullPath = path.join(MEDIA_ROOT, safePath);

	await fs.mkdir(fullPath, { recursive: true });

	logger.info('Directory created/ensured', { path: fullPath });

	return { success: true, path: path.relative(ROOT, fullPath) };
}

/**
 * Delete directory
 */
export async function deleteDirectory(relativePath: string, recursive = false) {
	if (typeof relativePath !== 'string' || !relativePath.trim()) {
		throw new Error('Invalid directory path');
	}

	const safePath = path.normalize(relativePath.trim()).replace(/^(\.\.(\/|\\|$))+/, '');
	const fullPath = path.join(MEDIA_ROOT, safePath);

	await fs.rm(fullPath, { recursive, force: true });

	logger.info('Directory deleted', { path: fullPath, recursive });

	return { success: true, path: path.relative(ROOT, fullPath) };
}
