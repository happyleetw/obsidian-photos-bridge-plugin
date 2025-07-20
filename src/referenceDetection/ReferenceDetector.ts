import { DetectionPattern, MediaReference, ReferenceDetectionSettings } from './types';
import { PhotoModel } from '../../types';

export class ReferenceDetector {
	private settings: ReferenceDetectionSettings;

	constructor(settings: ReferenceDetectionSettings) {
		this.settings = settings;
	}

	/**
	 * 為指定的照片生成所有可能的檢測模式
	 */
	private generatePatternsForPhoto(photo: PhotoModel): DetectionPattern[] {
		const patterns: DetectionPattern[] = [];
		const mediaType = photo.mediaType === 'video' ? 'video' : 'photo';
		const extension = mediaType === 'video' ? 'mov' : 'jpg';

		// 1. 如果有原始檔名，檢測原始檔名
		if (photo.filename) {
			const baseFilename = this.getBaseFilename(photo.filename);
			patterns.push({
				type: 'local',
				pattern: new RegExp(`!\\[\\[${this.escapeRegex(baseFilename)}\\]\\]`, 'g'),
				mediaType
			});
			
			// 也檢測帶副檔名的版本
			patterns.push({
				type: 'local',
				pattern: new RegExp(`!\\[\\[${this.escapeRegex(photo.filename)}\\]\\]`, 'g'),
				mediaType
			});
		}

		// 2. 檢測可能的時間戳格式檔名（插件生成的格式）
		// 格式：photo-YYYY-MM-DD-HH-mm-ss.jpg 或類似
		const timestampPattern = `photo-\\d{4}-\\d{2}-\\d{2}-\\d{2}-\\d{2}-\\d{2}\\.${extension}`;
		patterns.push({
			type: 'local',
			pattern: new RegExp(`!\\[\\[${timestampPattern}\\]\\]`, 'g'),
			mediaType
		});

		// 3. 檢測可能的自訂檔名（以照片 ID 的一部分為基礎）
		const photoIdParts = photo.id.split('/');
		if (photoIdParts.length > 0) {
			const shortId = photoIdParts[0].substring(0, 8); // 取前8個字符
			patterns.push({
				type: 'local',
				pattern: new RegExp(`!\\[\\[.*${this.escapeRegex(shortId)}.*\\.${extension}\\]\\]`, 'g'),
				mediaType
			});
		}

		// 4. 外部引用格式（如果有設定網域）
		if (this.settings.domainUrl && this.settings.domainUrl.trim()) {
			const escapedDomain = this.escapeRegex(this.settings.domainUrl.trim());
			
			if (photo.filename) {
				patterns.push({
					type: 'external',
					pattern: new RegExp(`!\\[.*?\\]\\(${escapedDomain}/.*?/${this.escapeRegex(photo.filename)}\\)`, 'g'),
					mediaType
				});
			}

			// 也檢測可能的網域 + 照片 ID 格式
			patterns.push({
				type: 'external',
				pattern: new RegExp(`!\\[.*?\\]\\(${escapedDomain}/.*?/${this.escapeRegex(photo.id)}\\.${extension}\\)`, 'g'),
				mediaType
			});
		}

		return patterns;
	}

	/**
	 * 取得檔案的基礎名稱（去除副檔名）
	 */
	private getBaseFilename(filename: string): string {
		const lastDotIndex = filename.lastIndexOf('.');
		return lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;
	}

	/**
	 * 轉義正則表達式特殊字符
	 */
	private escapeRegex(text: string): string {
		return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	/**
	 * 在筆記內容中檢測媒體引用
	 */
	public detectReferencesInContent(content: string, photos: PhotoModel[]): Record<string, boolean> {
		const results: Record<string, boolean> = {};

		// 初始化所有照片 ID 為未引用
		photos.forEach(photo => {
			results[photo.id] = false;
		});

		// 檢查每個照片
		for (const photo of photos) {
			const patterns = this.generatePatternsForPhoto(photo);
			
			// 檢查是否有任何模式匹配
			for (const patternInfo of patterns) {
				if (patternInfo.pattern.test(content)) {
					results[photo.id] = true;
					console.log(`[ReferenceDetector] Found reference for photo ${photo.id} (${photo.filename}) using pattern: ${patternInfo.pattern.source}`);
					break; // 找到一個匹配就足夠了
				}
			}
		}

		return results;
	}

	/**
	 * 批次檢測多個檔案內容中的媒體引用
	 */
	public detectReferencesInFiles(
		fileContents: Array<{ path: string; content: string }>,
		photos: PhotoModel[]
	): Record<string, boolean> {
		const aggregatedResults: Record<string, boolean> = {};

		// 初始化所有照片 ID 為未引用
		photos.forEach(photo => {
			aggregatedResults[photo.id] = false;
		});

		// 檢查每個檔案
		for (const file of fileContents) {
			const fileResults = this.detectReferencesInContent(file.content, photos);
			
			// 合併結果（只要在任何檔案中被引用就算被引用）
			Object.keys(fileResults).forEach(photoId => {
				if (fileResults[photoId]) {
					aggregatedResults[photoId] = true;
				}
			});
		}

		const referencedCount = Object.values(aggregatedResults).filter(Boolean).length;
		console.log(`[ReferenceDetector] Scan completed: ${referencedCount}/${photos.length} photos are referenced`);

		return aggregatedResults;
	}

	/**
	 * 更新設定
	 */
	public updateSettings(settings: ReferenceDetectionSettings): void {
		this.settings = settings;
	}

	/**
	 * 檢查是否啟用檢測
	 */
	public isEnabled(): boolean {
		return this.settings.enableDetection;
	}
} 