export interface ReferenceDetectionSettings {
	scanFolderPath: string;
	includeSubfolders: boolean;
	domainUrl?: string;
	enableDetection: boolean;
	cacheExpireMinutes: number;
}

export interface ReferenceCache {
	version: string;
	lastScan: string;
	settings: {
		scanFolderPath: string;
		includeSubfolders: boolean;
		domainUrl?: string;
	};
	vaultHash: string;
	references: Record<string, boolean>; // mediaId -> isReferenced
}

export interface MediaReference {
	mediaId: string;
	mediaType: 'photo' | 'video';
	isReferenced: boolean;
	referencedInFiles?: string[]; // 可選：記錄在哪些檔案中被引用
}

export interface ScanProgress {
	totalFiles: number;
	scannedFiles: number;
	foundReferences: number;
}

export interface DetectionPattern {
	type: 'local' | 'external';
	pattern: RegExp;
	mediaType: 'photo' | 'video';
} 