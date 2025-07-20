import { ItemView, WorkspaceLeaf, Menu } from 'obsidian';
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
		
		this.renderView();
		await this.checkConnection();
	}

	async onClose() {
		// Clean up
		if (this.searchTimeout) {
			clearTimeout(this.searchTimeout);
		}
	}

	private renderView() {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('photos-bridge-view');

		// Header
		this.renderHeader(container);

		// Search and filters
		this.renderSearchAndFilters(container);

		// Connection status
		this.renderConnectionStatus(container);

		// Photos grid
		this.renderPhotosGrid(container);

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
		
		refreshBtn.addEventListener('click', () => {
			this.refreshPhotos();
		});
	}

	private renderSearchAndFilters(container: Element) {
		const searchContainer = container.createEl('div', { cls: 'photos-bridge-search' });

		// Search input
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: '搜尋照片...',
			cls: 'photos-bridge-search-input'
		});

		searchInput.addEventListener('input', (e) => {
			const query = (e.target as HTMLInputElement).value;
			this.debounceSearch(query);
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

	private renderPhotosGrid(container: Element) {
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

		// Photo info overlay
		const overlay = photoEl.createEl('div', { cls: 'photos-bridge-overlay' });

		// Date badge (only show if date changed)
		if (shouldShowDate && dateText) {
			const dateBadge = overlay.createEl('div', { 
				cls: 'photos-bridge-date-badge',
				text: dateText
			});
		}

		// Media type indicator
		if (photo.mediaType === 'video') {
			overlay.createEl('span', { cls: 'photos-bridge-video-icon', text: '▶️' });
		}

		// Favorite indicator
		if (photo.isFavorite) {
			overlay.createEl('span', { cls: 'photos-bridge-favorite-icon', text: '❤️' });
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

		// Click handler - also keep click functionality as backup
		photoEl.addEventListener('click', async (e) => {
			e.preventDefault();
			
			// Add visual feedback
			photoEl.classList.add('photos-bridge-clicking');
			
			try {
				await this.insertPhoto(photo);
			} finally {
				// Remove visual feedback after a short delay
				setTimeout(() => {
					photoEl.classList.remove('photos-bridge-clicking');
				}, 200);
			}
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
		this.renderView();

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

		this.renderView();
	}

	private async loadPhotos(reset = false) {
		if (this.uiState.isLoading) return;

		if (reset) {
			this.photos = [];
			this.uiState.currentPage = 1;
		}

		this.uiState.isLoading = true;
		this.renderView();

		try {
			let response;
			
			if (this.uiState.filter.searchQuery) {
				response = await this.bridgeApi.searchPhotos(
					this.uiState.filter.searchQuery,
					this.uiState.currentPage,
					this.plugin.settings.pageSize
				);
			} else {
				response = await this.bridgeApi.getPhotos(
					this.uiState.currentPage,
					this.plugin.settings.pageSize,
					this.uiState.filter
				);
			}

			if (reset) {
				this.photos = response.photos;
			} else {
				this.photos.push(...response.photos);
			}

			this.uiState.hasMore = response.hasMore;
			this.uiState.currentPage++;
		} catch (error) {
			console.error('Failed to load photos:', error);
			// Show error to user
		}

		this.uiState.isLoading = false;
		this.renderView();
	}

	private async loadMorePhotos() {
		await this.loadPhotos(false);
	}

	private refreshPhotos() {
		this.loadPhotos(true);
	}

	private debounceSearch(query: string) {
		if (this.searchTimeout) {
			clearTimeout(this.searchTimeout);
		}

		this.searchTimeout = setTimeout(() => {
			this.uiState.filter.searchQuery = query || undefined;
			this.loadPhotos(true);
		}, this.plugin.settings.searchDebounceMs);
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