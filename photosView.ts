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

		// Date search section
		const dateSection = searchContainer.createEl('div', { cls: 'photos-bridge-date-section' });
		
		// Date input
		const dateInputContainer = dateSection.createEl('div', { cls: 'photos-bridge-date-input-container' });
		
		const dateInput = dateInputContainer.createEl('input', {
			type: 'text',
			placeholder: '輸入日期 (YYYY/MM/DD)...',
			cls: 'photos-bridge-date-input'
		});

		// Calendar button
		const calendarBtn = dateInputContainer.createEl('button', {
			cls: 'photos-bridge-calendar-btn',
			text: '📅'
		});

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

		// Calendar button click
		calendarBtn.addEventListener('click', () => {
			this.showDatePicker(dateInput);
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

		// Video icon overlay (bottom left - separate container)
		if (photo.mediaType === 'video') {
			const videoOverlay = photoEl.createEl('div', { cls: 'photos-bridge-video-overlay' });
			videoOverlay.createEl('span', { cls: 'photos-bridge-video-icon', text: '▶️' });
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
			
			if (this.uiState.filter.dateFilter) {
				// For now, we'll use the regular getPhotos method and filter client-side
				// In a real implementation, you might want to add a date filter to the API
				response = await this.bridgeApi.getPhotos(
					this.uiState.currentPage,
					this.plugin.settings.pageSize,
					this.uiState.filter
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

			// Apply client-side date filter if specified
			if (this.uiState.filter.dateFilter) {
				this.photos = this.photos.filter(photo => {
					if (!photo.createdDate) return false;
					
					const photoDate = new Date(photo.createdDate);
					const filterDate = new Date(this.uiState.filter.dateFilter!);
					
					// Compare dates (ignore time)
					return photoDate.toDateString() === filterDate.toDateString();
				});
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
			this.uiState.filter.dateFilter = query || undefined;
			this.loadPhotos(true);
		}, this.plugin.settings.searchDebounceMs);
	}

	private performDateSearch(dateString: string) {
		// Validate date format
		if (dateString && !this.isValidDateFormat(dateString)) {
			// Show error message or just ignore invalid format
			console.warn('Invalid date format. Please use YYYY/MM/DD format.');
			return;
		}

		// Update filter
		this.uiState.filter.dateFilter = dateString || undefined;
		
		// Load photos with date filter
		this.loadPhotos(true);
	}

	private isValidDateFormat(dateString: string): boolean {
		const dateRegex = /^\d{4}\/\d{2}\/\d{2}$/;
		if (!dateRegex.test(dateString)) {
			return false;
		}

		// Check if date is valid
		const [year, month, day] = dateString.split('/').map(Number);
		const date = new Date(year, month - 1, day);
		
		return date.getFullYear() === year && 
			   date.getMonth() === month - 1 && 
			   date.getDate() === day;
	}

	private showDatePicker(dateInput: HTMLInputElement) {
		// Create a simple date picker modal
		const modal = document.createElement('div');
		modal.className = 'photos-bridge-date-picker-modal';
		
		const overlay = document.createElement('div');
		overlay.className = 'photos-bridge-date-picker-overlay';
		
		const picker = document.createElement('input');
		picker.type = 'date';
		picker.className = 'photos-bridge-date-picker';
		
		// Set current value if exists
		if (dateInput.value) {
			const dateStr = dateInput.value.replace(/\//g, '-');
			picker.value = dateStr;
		}
		
		const buttonContainer = document.createElement('div');
		buttonContainer.className = 'photos-bridge-date-picker-buttons';
		
		const confirmBtn = document.createElement('button');
		confirmBtn.textContent = '確認';
		confirmBtn.className = 'photos-bridge-date-picker-confirm';
		
		const cancelBtn = document.createElement('button');
		cancelBtn.textContent = '取消';
		cancelBtn.className = 'photos-bridge-date-picker-cancel';
		
		buttonContainer.appendChild(confirmBtn);
		buttonContainer.appendChild(cancelBtn);
		
		modal.appendChild(picker);
		modal.appendChild(buttonContainer);
		overlay.appendChild(modal);
		document.body.appendChild(overlay);
		
		// Event handlers
		confirmBtn.addEventListener('click', () => {
			if (picker.value) {
				const formattedDate = picker.value.replace(/-/g, '/');
				dateInput.value = formattedDate;
				this.performDateSearch(formattedDate);
			}
			document.body.removeChild(overlay);
		});
		
		cancelBtn.addEventListener('click', () => {
			document.body.removeChild(overlay);
		});
		
		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) {
				document.body.removeChild(overlay);
			}
		});
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