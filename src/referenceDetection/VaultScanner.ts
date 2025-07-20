import { App, TFile, TFolder, Vault } from 'obsidian';
import { ReferenceDetectionSettings, ScanProgress } from './types';

export class VaultScanner {
	private app: App;
	private settings: ReferenceDetectionSettings;

	constructor(app: App, settings: ReferenceDetectionSettings) {
		this.app = app;
		this.settings = settings;
	}

	/**
	 * 取得需要掃描的檔案清單
	 */
	public async getFilesToScan(): Promise<TFile[]> {
		const { scanFolderPath, includeSubfolders } = this.settings;
		
		// 取得指定資料夾
		const targetFolder = this.app.vault.getAbstractFileByPath(scanFolderPath);
		if (!targetFolder || !(targetFolder instanceof TFolder)) {
			console.warn(`[VaultScanner] Folder not found: ${scanFolderPath}`);
			return [];
		}

		const filesToScan: TFile[] = [];

		if (includeSubfolders) {
			// 遞迴掃描所有子目錄
			Vault.recurseChildren(targetFolder, (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					filesToScan.push(file);
				}
			});
		} else {
			// 只掃描直接子檔案
			targetFolder.children.forEach(child => {
				if (child instanceof TFile && child.extension === 'md') {
					filesToScan.push(child);
				}
			});
		}

		console.log(`[VaultScanner] Found ${filesToScan.length} markdown files to scan in ${scanFolderPath}`);
		return filesToScan;
	}

	/**
	 * 讀取檔案內容
	 */
	public async readFileContent(file: TFile): Promise<string> {
		try {
			return await this.app.vault.read(file);
		} catch (error) {
			console.error(`[VaultScanner] Failed to read file ${file.path}:`, error);
			return '';
		}
	}

	/**
	 * 批次讀取多個檔案的內容
	 */
	public async readFilesContent(
		files: TFile[],
		onProgress?: (progress: ScanProgress) => void
	): Promise<Array<{ path: string; content: string }>> {
		const results: Array<{ path: string; content: string }> = [];
		let scannedCount = 0;

		for (const file of files) {
			try {
				const content = await this.readFileContent(file);
				results.push({
					path: file.path,
					content
				});
				
				scannedCount++;
				
				// 回報進度
				if (onProgress) {
					onProgress({
						totalFiles: files.length,
						scannedFiles: scannedCount,
						foundReferences: 0 // 這裡還不知道引用數量
					});
				}
				
				// 避免阻塞 UI，每 10 個檔案後暫停一下
				if (scannedCount % 10 === 0) {
					await new Promise(resolve => setTimeout(resolve, 1));
				}
				
			} catch (error) {
				console.error(`[VaultScanner] Failed to read file ${file.path}:`, error);
				scannedCount++;
			}
		}

		return results;
	}

	/**
	 * 計算 Vault 的雜湊值（用於快取驗證）
	 */
	public async calculateVaultHash(): Promise<string> {
		try {
			const files = await this.getFilesToScan();
			
			// 使用檔案路徑和修改時間來計算雜湊
			const fileInfo = files.map(file => ({
				path: file.path,
				mtime: file.stat.mtime
			}));
			
			// 簡單的雜湊計算（實際應用中可能需要更強的雜湊）
			const hashInput = JSON.stringify(fileInfo) + JSON.stringify(this.settings);
			return this.simpleHash(hashInput);
			
		} catch (error) {
			console.error('[VaultScanner] Failed to calculate vault hash:', error);
			return Date.now().toString(); // 回退到時間戳
		}
	}

	/**
	 * 簡單雜湊函數
	 */
	private simpleHash(str: string): string {
		let hash = 0;
		if (str.length === 0) return hash.toString();
		
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // 轉換為 32bit 整數
		}
		
		return Math.abs(hash).toString(16);
	}

	/**
	 * 更新設定
	 */
	public updateSettings(settings: ReferenceDetectionSettings): void {
		this.settings = settings;
	}

	/**
	 * 檢查指定的資料夾是否存在
	 */
	public async validateScanPath(): Promise<boolean> {
		const targetFolder = this.app.vault.getAbstractFileByPath(this.settings.scanFolderPath);
		return targetFolder instanceof TFolder;
	}
} 