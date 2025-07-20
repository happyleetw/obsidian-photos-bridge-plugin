

export interface PhotoModel {
	id: string;
	filename?: string;
	createdDate?: string;
	modifiedDate?: string;
	mediaType: string;
	mediaSubtype?: string;
	width: number;
	height: number;
	duration?: number;
	location?: LocationModel;
	isFavorite: boolean;
	thumbnailUrl: string;
	isHidden: boolean;
}

export interface LocationModel {
	latitude: number;
	longitude: number;
	altitude?: number;
}

export interface PhotosResponse {
	photos: PhotoModel[];
	total: number;
	page: number;
	pageSize: number;
	hasMore: boolean;
}

export interface ExportRequest {
	destination: string;
	filename?: string;
	keepOriginalName?: boolean;
}

export interface ExportResponse {
	success: boolean;
	filePath?: string;
	originalFilename?: string;
	error?: string;
}

export interface BridgeHealthResponse {
	status: string;
	version: string;
	timestamp: string;
}

export interface PhotosBridgeSettings {
	bridgeUrl: string;
	mediaFolder: string;
	scanFolder: string; // 掃描資料夾路徑
	autoCreateMediaFolder: boolean;
	defaultFilenameFormat: string;
	thumbnailSize: number;
	pageSize: number;
	enableVideos: boolean;
	showHiddenPhotos: boolean;
	searchDebounceMs: number;
}

export const DEFAULT_SETTINGS: PhotosBridgeSettings = {
	bridgeUrl: 'http://localhost:44556',
	mediaFolder: 'Media',
	scanFolder: 'Me/Diary',
	autoCreateMediaFolder: true,
	defaultFilenameFormat: 'original', // 'original', 'timestamp', 'custom'
	thumbnailSize: 150,
	pageSize: 50,
	enableVideos: true,
	showHiddenPhotos: false,
	searchDebounceMs: 500
};

export interface MediaFilter {
	mediaType?: 'image' | 'video' | 'all';
	dateFilter?: string; // Format: YYYY/MM/DD
	showFavorites?: boolean;
}

export enum ConnectionStatus {
	DISCONNECTED = 'disconnected',
	CONNECTING = 'connecting',
	CONNECTED = 'connected',
	ERROR = 'error'
}

export interface UIState {
	connectionStatus: ConnectionStatus;
	currentPage: number;
	isLoading: boolean;
	hasMore: boolean;
	selectedPhotos: Set<string>;
	usedPhotos: Set<string>; // 儲存已在筆記中使用的照片檔名
	filter: MediaFilter;
} 