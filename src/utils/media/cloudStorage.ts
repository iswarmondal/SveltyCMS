/**
 * @file src/utils/media/cloudStorage.ts
 * @description Unified cloud storage layer (local, S3/R2, Cloudinary)
 *
 * Features:
 * - MEDIA_FOLDER as prefix (bucket or folder)
 * - Explicit bucket support
 * - Safe path handling
 * - Public URL generation
 */

import { getPublicSettingSync } from '@src/services/settingsService';
import { logger } from '@utils/logger.server';
import { error } from '@sveltejs/kit';
import type { StorageType } from './mediaModels';

export interface CloudConfig {
	storageType: StorageType;
	bucket?: string;
	prefix: string;
	region?: string;
	endpoint?: string;
	publicUrl?: string;
	cloudName?: string;
}

export function getConfig(): CloudConfig {
	const type = getPublicSettingSync('MEDIA_STORAGE_TYPE') as StorageType;
	const prefix = (getPublicSettingSync('MEDIA_FOLDER') ?? '').replace(/^\.\//, '').replace(/^\/+|\/+$/g, '');

	return {
		storageType: type,
		bucket: getPublicSettingSync('MEDIA_BUCKET_NAME') as string | undefined,
		prefix,
		region: getPublicSettingSync('MEDIA_CLOUD_REGION'),
		endpoint: getPublicSettingSync('MEDIA_CLOUD_ENDPOINT'),
		publicUrl: getPublicSettingSync('MEDIA_CLOUD_PUBLIC_URL') || getPublicSettingSync('MEDIASERVER_URL'),
		cloudName: process.env.CLOUDINARY_CLOUD_NAME
	};
}

export const isCloud = () => getConfig().storageType !== 'local';

/** Full key/path with prefix */
function fullKey(rel: string): string {
	const { prefix } = getConfig();
	const clean = rel.replace(/^\/+/, '');
	return prefix ? `${prefix}/${clean}` : clean;
}

/** Public URL for file */
export function getUrl(rel: string): string {
	const cfg = getConfig();

	if (cfg.storageType === 'local') return `/files/${rel.replace(/^\/+/, '')}`;

	if (!cfg.publicUrl) throw error(500, 'Cloud public URL missing');

	const base = cfg.publicUrl.replace(/\/+$/, '');
	return `${base}/${fullKey(rel)}`;
}

/** Upload buffer to cloud */
export async function upload(buffer: Buffer, rel: string): Promise<string> {
	const cfg = getConfig();
	if (cfg.storageType === 'local') throw error(500, 'upload called for local storage');

	const key = fullKey(rel);

	switch (cfg.storageType) {
		case 's3':
		case 'r2':
			await uploadS3(buffer, key, cfg);
			break;
		case 'cloudinary':
			return await uploadCloudinary(buffer, rel, cfg);
		default:
			throw error(500, `Unsupported storage: ${cfg.storageType}`);
	}

	return getUrl(rel);
}

/** Delete from cloud */
export async function remove(rel: string): Promise<void> {
	const cfg = getConfig();
	if (cfg.storageType === 'local') throw error(500, 'remove called for local storage');

	const key = fullKey(rel);

	switch (cfg.storageType) {
		case 's3':
		case 'r2':
			await deleteS3(key, cfg);
			break;
		case 'cloudinary':
			await deleteCloudinary(rel, cfg);
			break;
	}
}

/** Check existence */
export async function exists(rel: string): Promise<boolean> {
	const cfg = getConfig();
	if (cfg.storageType === 'local') return false;

	const key = fullKey(rel);

	switch (cfg.storageType) {
		case 's3':
		case 'r2':
			return await s3Exists(key, cfg);
		case 'cloudinary':
			return await cloudinaryExists(rel, cfg);
		default:
			return false;
	}
}

// S3/R2
async function uploadS3(buf: Buffer, key: string, cfg: CloudConfig) {
	const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

	if (!cfg.bucket) throw error(500, 'Bucket name required for S3/R2');
	if (!process.env.MEDIA_ACCESS_KEY_ID || !process.env.MEDIA_SECRET_ACCESS_KEY) {
		throw error(500, 'S3 credentials missing');
	}

	const client = new S3Client({
		region: cfg.region || 'auto',
		endpoint: cfg.endpoint,
		credentials: {
			accessKeyId: process.env.MEDIA_ACCESS_KEY_ID,
			secretAccessKey: process.env.MEDIA_SECRET_ACCESS_KEY
		}
	});

	await client.send(
		new PutObjectCommand({
			Bucket: cfg.bucket,
			Key: key,
			Body: buf,
			ContentType: mime(key)
		})
	);

	logger.info('Uploaded to S3/R2', { key, size: buf.length });
}

async function deleteS3(key: string, cfg: CloudConfig) {
	const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');

	if (!cfg.bucket) throw error(500, 'Bucket required');
	if (!process.env.MEDIA_ACCESS_KEY_ID || !process.env.MEDIA_SECRET_ACCESS_KEY) throw error(500, 'Credentials missing');

	const client = new S3Client({
		region: cfg.region || 'auto',
		endpoint: cfg.endpoint,
		credentials: {
			accessKeyId: process.env.MEDIA_ACCESS_KEY_ID,
			secretAccessKey: process.env.MEDIA_SECRET_ACCESS_KEY
		}
	});

	await client.send(
		new DeleteObjectCommand({
			Bucket: cfg.bucket,
			Key: key
		})
	);

	logger.info('Deleted from S3/R2', { key });
}

async function s3Exists(key: string, cfg: CloudConfig): Promise<boolean> {
	const { S3Client, HeadObjectCommand } = await import('@aws-sdk/client-s3');

	if (!cfg.bucket || !process.env.MEDIA_ACCESS_KEY_ID || !process.env.MEDIA_SECRET_ACCESS_KEY) return false;

	const client = new S3Client({
		region: cfg.region || 'auto',
		endpoint: cfg.endpoint,
		credentials: {
			accessKeyId: process.env.MEDIA_ACCESS_KEY_ID,
			secretAccessKey: process.env.MEDIA_SECRET_ACCESS_KEY
		}
	});

	try {
		await client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
		return true;
	} catch {
		return false;
	}
}

// Cloudinary
async function uploadCloudinary(buf: Buffer, rel: string, cfg: CloudConfig): Promise<string> {
	const { v2: cloudinary } = await import('cloudinary');

	if (!cfg.cloudName || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
		throw error(500, 'Cloudinary config missing');
	}

	cloudinary.config({
		cloud_name: cfg.cloudName,
		api_key: process.env.CLOUDINARY_API_KEY,
		api_secret: process.env.CLOUDINARY_API_SECRET
	});

	const publicId = rel.replace(/\.[^.]+$/, '');

	return new Promise((res, rej) => {
		const stream = cloudinary.uploader.upload_stream({ public_id: publicId, folder: cfg.prefix, resource_type: 'auto' }, (err, result) => {
			if (err || !result) rej(err ?? new Error('No result'));
			else res(result.secure_url);
		});
		stream.end(buf);
	});
}

async function deleteCloudinary(rel: string, cfg: CloudConfig) {
	const { v2: cloudinary } = await import('cloudinary');

	if (!cfg.cloudName || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) throw error(500, 'Cloudinary config missing');

	cloudinary.config({
		cloud_name: cfg.cloudName,
		api_key: process.env.CLOUDINARY_API_KEY,
		api_secret: process.env.CLOUDINARY_API_SECRET
	});

	const publicId = `${cfg.prefix}/${rel.replace(/\.[^.]+$/, '')}`;

	await cloudinary.uploader.destroy(publicId);
	logger.info('Deleted from Cloudinary', { publicId });
}

async function cloudinaryExists(rel: string, cfg: CloudConfig): Promise<boolean> {
	const { v2: cloudinary } = await import('cloudinary');

	if (!cfg.cloudName || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return false;

	cloudinary.config({
		cloud_name: cfg.cloudName,
		api_key: process.env.CLOUDINARY_API_KEY,
		api_secret: process.env.CLOUDINARY_API_SECRET
	});

	const publicId = `${cfg.prefix}/${rel.replace(/\.[^.]+$/, '')}`;

	try {
		await cloudinary.api.resource(publicId);
		return true;
	} catch {
		return false;
	}
}

// MIME
function mime(file: string): string {
	const ext = file.split('.').pop()?.toLowerCase() ?? '';
	const map: Record<string, string> = {
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		gif: 'image/gif',
		webp: 'image/webp',
		avif: 'image/avif',
		svg: 'image/svg+xml',
		mp4: 'video/mp4',
		webm: 'video/webm',
		pdf: 'application/pdf'
	};
	return map[ext] ?? 'application/octet-stream';
}
