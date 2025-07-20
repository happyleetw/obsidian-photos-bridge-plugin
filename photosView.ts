import { ItemView, WorkspaceLeaf, Menu, TFolder, TFile } from 'obsidian';
import PhotosBridgePlugin from './main';
import { PhotoModel, MediaFilter, ConnectionStatus, UIState } from './types';
import { BridgeAPI } from './bridgeApi';

export const PHOTOS_VIEW_TYPE = 'photos-bridge-view';

export class PhotosView extends ItemView {
	plugin: PhotosBridgePlugin;
	private bridgeApi: BridgeAPI;
	private uiState: UIState;
	private photos: PhotoModel[] = [];
	private searchTimeout: NodeJS.Timeout | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: PhotosBridgePlugin) {
		super(leaf);
		this.plugin = plugin;
		this.bridgeApi = plugin.bridgeApi;
		this.uiState = {
			connectionStatus: ConnectionStatus.DISCONNECTED,
			currentPage: 1,
			isLoading: false,
			hasMore: true,
			selectedPhotos: new Set(),
			usedPhotos: new Set(),
			filter: { mediaType: 'all' }
		};
	}

	getViewType() {
		return PHOTOS_VIEW_TYPE;
	}

	getDisplayText() {
		return '照片';
	}

	getIcon() {
		return 'camera';
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		
		await this.renderView();
		
		await this.checkConnection();
	}

	async onClose() {
		// Clean up
		if (this.searchTimeout) {
			clearTimeout(this.searchTimeout);
		}
	}

	private async renderView() {
		const container = this.containerEl.children[1];
		container.empty();

		// Header
		this.renderHeader(container);

		// Search and filters
		this.renderSearchAndFilters(container);

		// Connection status
		this.renderConnectionStatus(container);

		// Photos grid
		await this.renderPhotosGrid(container);

		// Load more button
		this.renderLoadMoreButton(container);
	}

	private renderHeader(container: Element) {
		const header = container.createEl('div', { cls: 'photos-bridge-header' });
		
		const title = header.createEl('h3', { text: '照片庫' });
		
		const refreshBtn = header.createEl('button', {
			cls: 'photos-bridge-refresh-btn',
			text: '重新整理'
		});
		
		refreshBtn.addEventListener('click', async () => {
			await this.refreshPhotos();
		});
	}

	private renderSearchAndFilters(container: Element) {
		const searchContainer = container.createEl('div', { cls: 'photos-bridge-search' });

		// Date search section
		const dateSection = searchContainer.createEl('div', { cls: 'photos-bridge-date-section' });
		
		// Date input
		const dateInputContainer = dateSection.createEl('div', { cls: 'photos-bridge-date-input-container' });
		
		const dateInput = dateInputContainer.createEl('input', {
			type: 'text',
			placeholder: '輸入日期 (YYYY/MM/DD)...',
			cls: 'photos-bridge-date-input'
		});

		// Restore previous date value if exists
		if (this.uiState.filter.dateFilter) {
			dateInput.value = this.uiState.filter.dateFilter;
		}

		// Search button
		const searchBtn = dateInputContainer.createEl('button', {
			cls: 'photos-bridge-search-btn',
			text: '搜尋'
		});

		// Date input validation and formatting
		dateInput.addEventListener('input', (e) => {
			const input = e.target as HTMLInputElement;
			let value = input.value.replace(/[^\d]/g, ''); // Remove non-digits
			
			// Format as YYYY/MM/DD
			if (value.length >= 4) {
				value = value.substring(0, 4) + '/' + value.substring(4);
			}
			if (value.length >= 7) {
				value = value.substring(0, 7) + '/' + value.substring(7, 9);
			}
			
			input.value = value;
		});

		// Enter key to search
		dateInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				this.performDateSearch(dateInput.value);
			}
		});

		// Search button click
		searchBtn.addEventListener('click', () => {
			this.performDateSearch(dateInput.value);
		});

		// Filter buttons
		const filterContainer = searchContainer.createEl('div', { cls: 'photos-bridge-filters' });

		const filters = [
			{ key: 'all', label: '全部' },
			{ key: 'image', label: '照片' },
			{ key: 'video', label: '影片' }
		];

		filters.forEach(filter => {
			const btn = filterContainer.createEl('button', {
				text: filter.label,
				cls: 'photos-bridge-filter-btn'
			});

			if (filter.key === this.uiState.filter.mediaType) {
				btn.addClass('active');
			}

			btn.addEventListener('click', () => {
				// Update filter
				this.uiState.filter.mediaType = filter.key as any;
				
				// Update UI
				filterContainer.querySelectorAll('.photos-bridge-filter-btn').forEach(b => b.removeClass('active'));
				btn.addClass('active');

				// Reload photos
				this.loadPhotos(true);
			});
		});
	}

	private renderConnectionStatus(container: Element) {
		const statusContainer = container.createEl('div', { cls: 'photos-bridge-status' });

		let statusText = '';
		let statusClass = '';

		switch (this.uiState.connectionStatus) {
			case ConnectionStatus.CONNECTED:
				statusText = '✅ 已連線';
				statusClass = 'connected';
				break;
			case ConnectionStatus.CONNECTING:
				statusText = '🔄 連線中...';
				statusClass = 'connecting';
				break;
			case ConnectionStatus.ERROR:
				statusText = '❌ 連線失敗';
				statusClass = 'error';
				break;
			default:
				statusText = '⚪ 未連線';
				statusClass = 'disconnected';
		}

		statusContainer.createEl('span', {
			text: statusText,
			cls: `photos-bridge-status-text ${statusClass}`
		});

		if (this.uiState.connectionStatus === ConnectionStatus.ERROR) {
			const retryBtn = statusContainer.createEl('button', {
				text: '重試',
				cls: 'photos-bridge-retry-btn'
			});

			retryBtn.addEventListener('click', () => {
				this.checkConnection();
			});
		}
	}

	private async renderPhotosGrid(container: Element) {
		const gridContainer = container.createEl('div', { cls: 'photos-bridge-grid-container' });

		if (this.uiState.isLoading && this.photos.length === 0) {
			gridContainer.createEl('div', { cls: 'photos-bridge-loading', text: '載入中...' });
			return;
		}

		if (this.photos.length === 0) {
			gridContainer.createEl('div', { cls: 'photos-bridge-empty', text: '沒有找到照片' });
			return;
		}



		const grid = gridContainer.createEl('div', { cls: 'photos-bridge-grid' });

		// Track previous date for comparison
		let previousDate: string | null = null;

		this.photos.forEach((photo, index) => {
			const currentDate = photo.createdDate ? this.formatDateForComparison(photo.createdDate) : null;
			const shouldShowDate = currentDate && currentDate !== previousDate;
			
			this.renderPhotoThumbnail(grid, photo, shouldShowDate, currentDate);
			
			previousDate = currentDate;
		});
	}

	private formatDateForComparison(dateString: string): string {
		const date = new Date(dateString);
		return `${date.getMonth() + 1}/${date.getDate()}`;
	}

	private renderPhotoThumbnail(container: Element, photo: PhotoModel, shouldShowDate: boolean = false, dateText: string | null = null) {
		const photoEl = container.createEl('div', { cls: 'photos-bridge-photo' });

		// Thumbnail image
		const img = photoEl.createEl('img', {
			cls: 'photos-bridge-thumbnail'
		});

		img.src = this.bridgeApi.getThumbnailUrl(photo.id);
		img.alt = photo.filename || 'Photo';



		// Photo info overlay (top right - for date and favorite)
		const overlay = photoEl.createEl('div', { cls: 'photos-bridge-overlay' });

		// Date badge (only show if date changed)
		if (shouldShowDate && dateText) {
			const dateBadge = overlay.createEl('div', { 
				cls: 'photos-bridge-date-badge',
				text: dateText
			});
		}

		// Favorite indicator (stays in top right)
		if (photo.isFavorite) {
			overlay.createEl('span', { cls: 'photos-bridge-favorite-icon', text: '❤️' });
		}

		// Video icon overlay (bottom right - moved from bottom left)
		if (photo.mediaType === 'video') {
			const videoOverlay = photoEl.createEl('div', { cls: 'photos-bridge-video-overlay' });
			videoOverlay.createEl('span', { cls: 'photos-bridge-video-icon', text: '▶️' });
		}

		// Used in diary indicator (center overlay - checkmark)
		// 比對時去除副檔名，這樣 photo.heic 就能匹配到筆記中的 photo.jpg
		const photoNameWithoutExt = this.removeFileExtension(photo.filename);
		if (this.uiState.usedPhotos.has(photoNameWithoutExt)) {
			const usedOverlay = photoEl.createEl('div', { cls: 'photos-bridge-used-overlay' });
			usedOverlay.createEl('span', { cls: 'photos-bridge-used-icon', text: '✓' });
		}

		// Make photo draggable
		photoEl.draggable = true;
		
		// Drag event handlers
		photoEl.addEventListener('dragstart', (e) => {
			if (!e.dataTransfer) return;
			
			// Clear all existing data to prevent browser defaults
			e.dataTransfer.clearData();
			
			// ONLY set our custom JSON data, no other formats
			e.dataTransfer.setData('application/json', JSON.stringify({
				type: 'obsidian-photos-bridge-photo',
				photoId: photo.id,
				filename: photo.filename,
				mediaType: photo.mediaType
			}));
			
			// Set drag effect
			e.dataTransfer.effectAllowed = 'copy';
			
			// Add visual feedback
			photoEl.classList.add('photos-bridge-dragging');
		});

		photoEl.addEventListener('dragend', () => {
			// Remove visual feedback
			photoEl.classList.remove('photos-bridge-dragging');
		});



		// Context menu
		photoEl.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			this.showPhotoContextMenu(photo, e.clientX, e.clientY);
		});

		// Tooltip with photo info
		photoEl.title = this.getPhotoTooltip(photo);
	}

	private renderLoadMoreButton(container: Element) {
		if (!this.uiState.hasMore || this.uiState.isLoading) {
			return;
		}

		const loadMoreBtn = container.createEl('button', {
			text: '載入更多',
			cls: 'photos-bridge-load-more'
		});

		loadMoreBtn.addEventListener('click', () => {
			this.loadMorePhotos();
		});
	}

	private getPhotoTooltip(photo: PhotoModel): string {
		const parts = [];
		
		if (photo.filename) {
			parts.push(`檔名: ${photo.filename}`);
		}
		
		if (photo.createdDate) {
			const date = new Date(photo.createdDate);
			parts.push(`拍攝日期: ${date.toLocaleDateString('zh-TW')}`);
		}
		
		parts.push(`尺寸: ${photo.width} × ${photo.height}`);
		
		if (photo.duration) {
			const duration = Math.round(photo.duration);
			parts.push(`時長: ${duration}秒`);
		}

		return parts.join('\n');
	}

	private showPhotoContextMenu(photo: PhotoModel, x: number, y: number) {
		const menu = new Menu();

		menu.addItem((item) =>
			item
				.setTitle('插入照片')
				.setIcon('image')
				.onClick(() => this.insertPhoto(photo))
		);

		menu.addItem((item) =>
			item
				.setTitle('複製到剪貼板')
				.setIcon('copy')
				.onClick(() => this.copyPhotoToClipboard(photo))
		);

		menu.addItem((item) =>
			item
				.setTitle('顯示詳細資訊')
				.setIcon('info')
				.onClick(() => this.showPhotoDetails(photo))
		);

		menu.showAtPosition({ x, y });
	}

	// API Methods
	private async checkConnection() {
		this.uiState.connectionStatus = ConnectionStatus.CONNECTING;
		await this.renderView();

		try {
			const isConnected = await this.bridgeApi.testConnection();
			this.uiState.connectionStatus = isConnected ? ConnectionStatus.CONNECTED : ConnectionStatus.ERROR;
			
			if (isConnected) {
				await this.loadPhotos(true);
			}
		} catch (error) {
			this.uiState.connectionStatus = ConnectionStatus.ERROR;
			console.error('Connection check failed:', error);
		}

		await this.renderView();
	}

	private async loadPhotos(reset = false, forceRefresh = false) {
		if (this.uiState.isLoading) return;

		if (reset) {
			this.photos = [];
			this.uiState.currentPage = 1;
		}

		this.uiState.isLoading = true;
		await this.renderView();

		try {
			let response;
			
			if (this.uiState.filter.dateFilter) {
				// Use the new date API for date-based search
				console.log('Using date API for:', this.uiState.filter.dateFilter);
				response = await this.bridgeApi.getPhotosByDate(
					this.uiState.filter.dateFilter,
					this.uiState.currentPage,
					this.plugin.settings.pageSize
				);
			} else {
				// Use regular photos API with optional force refresh
				response = await this.bridgeApi.getPhotos(
					this.uiState.currentPage,
					this.plugin.settings.pageSize,
					this.uiState.filter,
					forceRefresh
				);
			}

			if (reset) {
				this.photos = response.photos;
			} else {
				this.photos.push(...response.photos);
			}

			console.log('Total photos loaded:', this.photos.length);
			console.log('Sample photo dates:', this.photos.slice(0, 3).map(p => ({ 
				filename: p.filename, 
				createdDate: p.createdDate 
			})));

			this.uiState.hasMore = response.hasMore;
			this.uiState.currentPage++;
		} catch (error) {
			console.error('Failed to load photos:', error);
			// Show error to user
		}

		this.uiState.isLoading = false;
		await this.renderView();
	}

	private async loadMorePhotos() {
		await this.loadPhotos(false);
	}

	private async refreshPhotos() {
		// 檢查當前開啟的筆記標題是否包含日期格式
		const currentNote = this.app.workspace.getActiveFile();
		if (currentNote && currentNote.name) {
			const noteTitle = currentNote.name.replace('.md', ''); // 移除 .md 副檔名
			const dateFromTitle = this.extractDateFromTitle(noteTitle);
			
			if (dateFromTitle) {
				console.log(`從筆記標題 "${noteTitle}" 提取到日期: ${dateFromTitle}`);
				// 掃描對應的日記目錄
				await this.scanDiaryNotesForMediaUsage(dateFromTitle);
				// 設定日期篩選器並執行搜尋（日期搜尋不需要強制重新整理，因為它總是即時查詢）
				this.uiState.filter.dateFilter = dateFromTitle;
				await this.loadPhotos(true);
				return;
			}
		}
		
		// 如果沒有找到日期格式，清除日期篩選器並強制重新載入最新照片
		console.log('筆記標題沒有包含日期格式，強制重新載入最新照片');
		this.uiState.filter.dateFilter = undefined;
		this.uiState.usedPhotos.clear(); // 清空使用標記
		await this.loadPhotos(true, true); // reset = true, forceRefresh = true
	}

	// 從標題中提取日期格式 (YYYY-MM-DD) 並轉換為 YYYY/MM/DD
	private extractDateFromTitle(title: string): string | null {
		// 匹配 YYYY-MM-DD 格式的日期
		const dateRegex = /(\d{4})-(\d{1,2})-(\d{1,2})/;
		const match = title.match(dateRegex);
		
		if (match) {
			const [, year, month, day] = match;
			// 轉換為 YYYY/MM/DD 格式
			return `${year}/${month.padStart(2, '0')}/${day.padStart(2, '0')}`;
		}
		
		return null;
	}

	// 掃描 Me/Diary 目錄下對應日期的筆記，檢查媒體使用情況
	private async scanDiaryNotesForMediaUsage(dateStr: string): Promise<void> {
		// 清空之前的掃描結果
		this.uiState.usedPhotos.clear();
		
		try {
			// 解析日期格式 YYYY/MM/DD
			const dateParts = dateStr.split('/');
			if (dateParts.length !== 3) return;
			
			const [year, month] = dateParts;
			const diaryPath = `Me/Diary/${year}/${year}-${month}`;
			
			console.log(`掃描目錄: ${diaryPath}`);
			
			// 檢查目錄是否存在
			const diaryFolder = this.app.vault.getAbstractFileByPath(diaryPath);
			if (!diaryFolder) {
				console.log(`目錄不存在: ${diaryPath}`);
				return;
			}
			
			// 確保是資料夾類型
			if (!(diaryFolder instanceof TFolder)) {
				console.log(`${diaryPath} 不是資料夾`);
				return;
			}
			
			// 掃描該目錄下的所有 markdown 檔案
			for (const file of diaryFolder.children) {
				if (file instanceof TFile && file.path.endsWith('.md')) {
					try {
						const content = await this.app.vault.read(file);
						const usedMedia = this.extractMediaReferencesFromContent(content);
						
						// 將找到的媒體檔名加入 usedPhotos
						usedMedia.forEach(filename => {
							this.uiState.usedPhotos.add(filename);
							console.log(`找到使用的媒體: ${filename} (去除副檔名後，在 ${file.path})`);
						});
					} catch (error) {
						console.error(`讀取檔案失敗: ${file.path}`, error);
					}
				}
			}
			
			console.log(`掃描完成，找到 ${this.uiState.usedPhotos.size} 個已使用的媒體檔案`);
			
		} catch (error) {
			console.error('掃描日記目錄失敗:', error);
		}
	}
	
	// 從筆記內容中提取媒體引用
	private extractMediaReferencesFromContent(content: string): string[] {
		const mediaFiles: string[] = [];
		
		// 匹配格式：![[檔名.jpg]] 或 ![[檔名.mov]]
		const wikiLinkRegex = /!\[\[([^[\]]+\.(jpg|jpeg|png|gif|bmp|webp|svg|mov|mp4|avi|mkv|webm|m4v))\]\]/gi;
		let match;
		while ((match = wikiLinkRegex.exec(content)) !== null) {
			// 提取檔名，去除副檔名
			const fullFilename = match[1];
			const filenameWithoutExt = this.removeFileExtension(fullFilename);
			mediaFiles.push(filenameWithoutExt);
		}
		
		// 匹配格式：![檔名](https://domain/path/檔名.jpg) 或 ![檔名](https://domain/path/檔名.mov)
		const markdownLinkRegex = /!\[[^\]]*\]\(([^)]*\/([^/)]+\.(jpg|jpeg|png|gif|bmp|webp|svg|mov|mp4|avi|mkv|webm|m4v)))\)/gi;
		while ((match = markdownLinkRegex.exec(content)) !== null) {
			// 提取檔名部分 (group 2 是檔名)，然後去除副檔名
			const fullFilename = match[2];
			const filenameWithoutExt = this.removeFileExtension(fullFilename);
			mediaFiles.push(filenameWithoutExt);
		}
		
		return mediaFiles;
	}
	
	// 輔助方法：去除檔名的副檔名
	private removeFileExtension(filename: string): string {
		const lastDotIndex = filename.lastIndexOf('.');
		if (lastDotIndex === -1) {
			return filename; // 沒有副檔名
		}
		return filename.substring(0, lastDotIndex);
	}

	private debounceSearch(query: string) {
		if (this.searchTimeout) {
			clearTimeout(this.searchTimeout);
		}

		this.searchTimeout = setTimeout(async () => {
			this.uiState.filter.dateFilter = query || undefined;
			
			// 如果是日期格式的查詢，掃描對應的日記目錄
			if (query && query.match(/\d{4}\/\d{2}\/\d{2}/)) {
				await this.scanDiaryNotesForMediaUsage(query);
			} else {
				this.uiState.usedPhotos.clear(); // 清空使用標記
			}
			
			await this.loadPhotos(true);
		}, this.plugin.settings.searchDebounceMs);
	}

	private performDateSearch(dateString: string) {
		console.log('performDateSearch called with:', dateString);
		
		// If empty string, clear filter
		if (!dateString || dateString.trim() === '') {
			console.log('Clearing date filter');
			this.uiState.filter.dateFilter = undefined;
			this.loadPhotos(true);
			return;
		}
		
		// Validate date format - allow more flexible formats
		if (!this.isValidDateFormat(dateString)) {
			console.warn('Invalid date format:', dateString, 'Please use YYYY/MM/DD format.');
			// Don't return, let's try anyway for debugging
		}

		console.log('Setting date filter to:', dateString);
		// Update filter
		this.uiState.filter.dateFilter = dateString;
		
		// Load photos with date filter
		this.loadPhotos(true);
	}

	private isValidDateFormat(dateString: string): boolean {
		// More flexible regex - allow M/D or MM/DD
		const dateRegex = /^\d{4}\/\d{1,2}\/\d{1,2}$/;
		if (!dateRegex.test(dateString)) {
			console.log('Date regex failed for:', dateString);
			return false;
		}

		// Check if date is valid
		const [year, month, day] = dateString.split('/').map(Number);
		const date = new Date(year, month - 1, day);
		
		const isValid = date.getFullYear() === year && 
			   date.getMonth() === month - 1 && 
			   date.getDate() === day;
		
		console.log('Date validation for', dateString, ':', isValid);
		return isValid;
	}

	private async insertPhoto(photo: PhotoModel) {
		try {
			const success = await this.plugin.insertPhotoIntoEditor(photo.id, photo.filename);
			if (success) {
				// Show success message
				console.log('Photo inserted successfully');
			} else {
				// Show error message
				console.error('Failed to insert photo');
			}
		} catch (error) {
			console.error('Error inserting photo:', error);
		}
	}

	private async copyPhotoToClipboard(photo: PhotoModel) {
		try {
			const blob = await this.bridgeApi.getThumbnail(photo.id);
			const item = new ClipboardItem({ [blob.type]: blob });
			await navigator.clipboard.write([item]);
			// Show success message
		} catch (error) {
			console.error('Failed to copy photo to clipboard:', error);
		}
	}

	private showPhotoDetails(photo: PhotoModel) {
		// Could implement a modal with detailed photo information
		console.log('Photo details:', photo);
	}
} 