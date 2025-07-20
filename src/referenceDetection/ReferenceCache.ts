import { App } from 'obsidian';
import { ReferenceCache, ReferenceDetectionSettings } from './types';

export class ReferenceCacheManager {
	private app: App;
	private cachePath: string;
	private cache: ReferenceCache | null = null;
	private readonly CACHE_VERSION = '1.0.0';

	constructor(app: App) {
		this.app = app;
		this.cachePath = '.obsidian/plugins/obsidian-photos-bridge-plugin/references-cache.json';
	}

	/**
	 * 載入快取
	 */
	public async loadCache(): Promise<ReferenceCache | null> {
		try {
			const adapter = this.app.vault.adapter;
			
			// 檢查快取檔案是否存在
			if (!(await adapter.exists(this.cachePath))) {
				console.log('[ReferenceCache] Cache file does not exist');
				return null;
			}

			const cacheData = await adapter.read(this.cachePath);
			const cache = JSON.parse(cacheData) as ReferenceCache;

			// 檢查快取版本
			if (cache.version !== this.CACHE_VERSION) {
				console.log('[ReferenceCache] Cache version mismatch, invalidating cache');
				return null;
			}

			this.cache = cache;
			console.log(`[ReferenceCache] Loaded cache with ${Object.keys(cache.references).length} entries`);
			return cache;

		} catch (error) {
			console.error('[ReferenceCache] Failed to load cache:', error);
			return null;
		}
	}

	/**
	 * 儲存快取
	 */
	public async saveCache(cache: ReferenceCache): Promise<boolean> {
		try {
			const adapter = this.app.vault.adapter;
			
			// 確保目錄存在
			const cacheDir = this.cachePath.substring(0, this.cachePath.lastIndexOf('/'));
			if (!(await adapter.exists(cacheDir))) {
				await adapter.mkdir(cacheDir);
			}

			const cacheData = JSON.stringify(cache, null, 2);
			await adapter.write(this.cachePath, cacheData);
			
			this.cache = cache;
			console.log(`[ReferenceCache] Saved cache with ${Object.keys(cache.references).length} entries`);
			return true;

		} catch (error) {
			console.error('[ReferenceCache] Failed to save cache:', error);
			return false;
		}
	}

	/**
	 * 創建新的快取
	 */
	public createNewCache(
		settings: ReferenceDetectionSettings,
		vaultHash: string,
		references: Record<string, boolean> = {}
	): ReferenceCache {
		return {
			version: this.CACHE_VERSION,
			lastScan: new Date().toISOString(),
			settings: {
				scanFolderPath: settings.scanFolderPath,
				includeSubfolders: settings.includeSubfolders,
				domainUrl: settings.domainUrl
			},
			vaultHash,
			references
		};
	}

	/**
	 * 檢查快取是否過期
	 */
	public isCacheExpired(cache: ReferenceCache, settings: ReferenceDetectionSettings): boolean {
		if (!cache) return true;

		// 檢查快取時間
		const lastScan = new Date(cache.lastScan);
		const expireTime = new Date(lastScan.getTime() + settings.cacheExpireMinutes * 60 * 1000);
		const isTimeExpired = new Date() > expireTime;

		// 檢查設定是否改變
		const settingsChanged = 
			cache.settings.scanFolderPath !== settings.scanFolderPath ||
			cache.settings.includeSubfolders !== settings.includeSubfolders ||
			cache.settings.domainUrl !== settings.domainUrl;

		const expired = isTimeExpired || settingsChanged;
		
		if (expired) {
			console.log('[ReferenceCache] Cache expired:', {
				isTimeExpired,
				settingsChanged,
				lastScan: cache.lastScan,
				expireMinutes: settings.cacheExpireMinutes
			});
		}

		return expired;
	}

	/**
	 * 檢查 Vault 是否有變更
	 */
	public isVaultChanged(cache: ReferenceCache, currentVaultHash: string): boolean {
		const changed = cache.vaultHash !== currentVaultHash;
		if (changed) {
			console.log('[ReferenceCache] Vault changed:', {
				cached: cache.vaultHash,
				current: currentVaultHash
			});
		}
		return changed;
	}

	/**
	 * 更新快取中的引用狀態
	 */
	public async updateReferences(references: Record<string, boolean>): Promise<boolean> {
		if (!this.cache) {
			console.error('[ReferenceCache] No cache loaded, cannot update references');
			return false;
		}

		// 更新引用狀態
		this.cache.references = { ...this.cache.references, ...references };
		this.cache.lastScan = new Date().toISOString();

		// 儲存更新後的快取
		return await this.saveCache(this.cache);
	}

	/**
	 * 取得媒體的引用狀態
	 */
	public getMediaReferenceStatus(mediaId: string): boolean {
		return this.cache?.references[mediaId] ?? false;
	}

	/**
	 * 取得所有引用狀態
	 */
	public getAllReferences(): Record<string, boolean> {
		return this.cache?.references ?? {};
	}

	/**
	 * 清除快取
	 */
	public async clearCache(): Promise<boolean> {
		try {
			const adapter = this.app.vault.adapter;
			
			if (await adapter.exists(this.cachePath)) {
				await adapter.remove(this.cachePath);
				console.log('[ReferenceCache] Cache cleared');
			}
			
			this.cache = null;
			return true;

		} catch (error) {
			console.error('[ReferenceCache] Failed to clear cache:', error);
			return false;
		}
	}

	/**
	 * 取得快取統計資訊
	 */
	public getCacheStats(): { 
		totalEntries: number; 
		referencedCount: number; 
		lastScan: string | null;
		cacheSize: number;
	} {
		if (!this.cache) {
			return {
				totalEntries: 0,
				referencedCount: 0,
				lastScan: null,
				cacheSize: 0
			};
		}

		const references = this.cache.references;
		const totalEntries = Object.keys(references).length;
		const referencedCount = Object.values(references).filter(Boolean).length;
		const cacheSize = JSON.stringify(this.cache).length;

		return {
			totalEntries,
			referencedCount,
			lastScan: this.cache.lastScan,
			cacheSize
		};
	}
} 