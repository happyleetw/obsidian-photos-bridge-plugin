import { App } from 'obsidian';
import { ReferenceDetectionSettings, ScanProgress } from './types';
import { ReferenceDetector } from './ReferenceDetector';
import { VaultScanner } from './VaultScanner';
import { ReferenceCacheManager } from './ReferenceCache';
import { PhotoModel } from '../../types';

export class ReferenceManager {
	private app: App;
	private settings: ReferenceDetectionSettings;
	private detector: ReferenceDetector;
	private scanner: VaultScanner;
	private cacheManager: ReferenceCacheManager;
	private isScanning: boolean = false;
	private scanPromise: Promise<void> | null = null;

	constructor(app: App, settings: ReferenceDetectionSettings) {
		this.app = app;
		this.settings = settings;
		this.detector = new ReferenceDetector(settings);
		this.scanner = new VaultScanner(app, settings);
		this.cacheManager = new ReferenceCacheManager(app);
	}

	/**
	 * 初始化引用管理器
	 */
	public async initialize(): Promise<void> {
		if (!this.settings.enableDetection) {
			console.log('[ReferenceManager] Reference detection is disabled');
			return;
		}

		console.log('[ReferenceManager] Initializing reference manager');
		await this.cacheManager.loadCache();
	}

	/**
	 * 取得媒體的引用狀態
	 */
	public async getMediaReferenceStatus(photos: PhotoModel[]): Promise<Record<string, boolean>> {
		if (!this.settings.enableDetection) {
			// 如果停用檢測，返回所有為 false 的狀態
			const result: Record<string, boolean> = {};
			photos.forEach(photo => {
				result[photo.id] = false;
			});
			return result;
		}

		// 嘗試從快取取得狀態
		const cachedResults = await this.getCachedReferences(photos);
		if (cachedResults) {
			return cachedResults;
		}

		// 如果沒有有效快取，觸發背景掃描並傳入當前的照片
		this.triggerBackgroundScan(photos);

		// 返回預設狀態（全為 false）
		const result: Record<string, boolean> = {};
		photos.forEach(photo => {
			result[photo.id] = false;
		});
		return result;
	}

	/**
	 * 從快取取得引用狀態
	 */
	private async getCachedReferences(photos: PhotoModel[]): Promise<Record<string, boolean> | null> {
		const cache = await this.cacheManager.loadCache();
		if (!cache) {
			console.log('[ReferenceManager] No cache available');
			return null;
		}

		// 檢查快取是否過期
		if (this.cacheManager.isCacheExpired(cache, this.settings)) {
			console.log('[ReferenceManager] Cache expired');
			return null;
		}

		// 檢查 Vault 是否有變更
		const currentVaultHash = await this.scanner.calculateVaultHash();
		if (this.cacheManager.isVaultChanged(cache, currentVaultHash)) {
			console.log('[ReferenceManager] Vault changed');
			return null;
		}

		// 從快取取得狀態
		const result: Record<string, boolean> = {};
		photos.forEach(photo => {
			result[photo.id] = this.cacheManager.getMediaReferenceStatus(photo.id);
		});

		console.log(`[ReferenceManager] Using cached references for ${photos.length} photos`);
		return result;
	}

	/**
	 * 觸發背景掃描
	 */
	private triggerBackgroundScan(photos: PhotoModel[]): void {
		if (this.isScanning) {
			console.log('[ReferenceManager] Scan already in progress');
			return;
		}

		console.log('[ReferenceManager] Starting background scan');
		this.scanPromise = this.performFullScan(photos);
	}

	/**
	 * 執行完整掃描
	 */
	private async performFullScan(photos: PhotoModel[]): Promise<void> {
		this.isScanning = true;

		try {
			// 驗證掃描路徑
			const isValidPath = await this.scanner.validateScanPath();
			if (!isValidPath) {
				console.error(`[ReferenceManager] Invalid scan path: ${this.settings.scanFolderPath}`);
				return;
			}

			// 取得要掃描的檔案
			const filesToScan = await this.scanner.getFilesToScan();
			if (filesToScan.length === 0) {
				console.log('[ReferenceManager] No files to scan');
				return;
			}

			// 讀取檔案內容
			const fileContents = await this.scanner.readFilesContent(filesToScan);

			// 執行引用檢測
			const references = this.detector.detectReferencesInFiles(fileContents, photos);

			// 更新快取
			const vaultHash = await this.scanner.calculateVaultHash();
			const newCache = this.cacheManager.createNewCache(this.settings, vaultHash, references);
			await this.cacheManager.saveCache(newCache);

			console.log(`[ReferenceManager] Scan completed, found ${Object.values(references).filter(Boolean).length} referenced media`);

		} catch (error) {
			console.error('[ReferenceManager] Scan failed:', error);
		} finally {
			this.isScanning = false;
			this.scanPromise = null;
		}
	}

	/**
	 * 手動觸發掃描
	 */
	public async forceScan(photos: PhotoModel[]): Promise<Record<string, boolean>> {
		if (this.isScanning) {
			console.log('[ReferenceManager] Waiting for existing scan to complete');
			await this.scanPromise;
		}

		console.log(`[ReferenceManager] Force scanning for ${photos.length} media items`);

		try {
			const filesToScan = await this.scanner.getFilesToScan();
			const fileContents = await this.scanner.readFilesContent(filesToScan);
			const references = this.detector.detectReferencesInFiles(fileContents, photos);

			// 更新快取
			const vaultHash = await this.scanner.calculateVaultHash();
			const newCache = this.cacheManager.createNewCache(this.settings, vaultHash, references);
			await this.cacheManager.saveCache(newCache);

			return references;

		} catch (error) {
			console.error('[ReferenceManager] Force scan failed:', error);
			// 返回預設狀態
			const result: Record<string, boolean> = {};
			photos.forEach(photo => {
				result[photo.id] = false;
			});
			return result;
		}
	}

	/**
	 * 清除快取
	 */
	public async clearCache(): Promise<boolean> {
		console.log('[ReferenceManager] Clearing cache');
		return await this.cacheManager.clearCache();
	}

	/**
	 * 更新設定
	 */
	public updateSettings(settings: ReferenceDetectionSettings): void {
		this.settings = settings;
		this.detector.updateSettings(settings);
		this.scanner.updateSettings(settings);
	}

	/**
	 * 取得快取統計資訊
	 */
	public getCacheStats() {
		return this.cacheManager.getCacheStats();
	}

	/**
	 * 檢查是否啟用
	 */
	public isEnabled(): boolean {
		return this.settings.enableDetection;
	}
} 