import { Plugin, WorkspaceLeaf, TFile, MarkdownView, Notice } from 'obsidian';
import { PhotosBridgeSettings, DEFAULT_SETTINGS } from './types';
import { PhotosBridgeSettingTab } from './settingsTab';
import { PhotosView, PHOTOS_VIEW_TYPE } from './photosView';
import { BridgeAPI } from './bridgeApi';

export default class PhotosBridgePlugin extends Plugin {
	settings: PhotosBridgeSettings;
	bridgeApi: BridgeAPI;

	async onload() {
		console.log('Loading Photos Bridge plugin');

		// Load settings
		await this.loadSettings();

		// Initialize Bridge API
		this.bridgeApi = new BridgeAPI(this.settings.bridgeUrl);

		// Register view
		this.registerView(
			PHOTOS_VIEW_TYPE,
			(leaf) => new PhotosView(leaf, this)
		);

		// Add ribbon icon
		this.addRibbonIcon('image', 'Open Photos Bridge', () => {
			this.activatePhotosView();
		});

		// Add command
		this.addCommand({
			id: 'open-photos-bridge',
			name: 'Open Photos Bridge',
			callback: () => {
				this.activatePhotosView();
			}
		});

		// Add settings tab
		this.addSettingTab(new PhotosBridgeSettingTab(this.app, this));

		// Apply CSS custom properties
		this.updateCSSVariables();

		// Set up drag and drop handlers
		this.setupDragAndDropHandlers();

		// Test connection on startup (optional)
		this.testConnectionOnStartup();
	}

	onunload() {
		console.log('Unloading Photos Bridge plugin');
		this.app.workspace.detachLeavesOfType(PHOTOS_VIEW_TYPE);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		
		// Update Bridge API URL if changed
		if (this.bridgeApi) {
			this.bridgeApi.updateBaseUrl(this.settings.bridgeUrl);
		}

		// Update CSS variables
		this.updateCSSVariables();
	}

	private updateCSSVariables() {
		document.documentElement.style.setProperty(
			'--photos-bridge-thumbnail-size', 
			`${this.settings.thumbnailSize}px`
		);
	}

	async activatePhotosView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(PHOTOS_VIEW_TYPE);

		if (leaves.length > 0) {
			// Use existing leaf
			leaf = leaves[0];
		} else {
			// Create new leaf in right sidebar
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: PHOTOS_VIEW_TYPE, active: true });
		}

		// Reveal the leaf
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	private async testConnectionOnStartup() {
		try {
			const isConnected = await this.bridgeApi.testConnection();
			if (!isConnected) {
				console.warn('Photos Bridge: Could not connect to Bridge App on startup');
				// Could show a notice to user about bridge app not running
			} else {
				console.log('Photos Bridge: Successfully connected to Bridge App');
			}
		} catch (error) {
			console.error('Photos Bridge: Error testing connection on startup:', error);
		}
	}

	// Helper method to insert photo into current editor
	async insertPhotoIntoEditor(photoId: string, filename?: string): Promise<boolean> {
		// Try to get the active markdown view first
		let targetLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
		
		// If no active view (e.g., sidebar is focused), find the most recent markdown view
		if (!targetLeaf) {
			const leaves = this.app.workspace.getLeavesOfType('markdown');
			if (leaves.length > 0) {
				// Get the most recently active markdown leaf
				targetLeaf = leaves[0].view as MarkdownView;
			}
		}
		
		if (!targetLeaf) {
			this.showNotice('請先打開一個筆記');
			return false;
		}

		try {
			// Generate a unique filename if needed
			const finalFilename = await this.generateUniqueFilename(filename, photoId);
			
			// Get the destination path (relative to vault)
			const destinationPath = this.getMediaFolderPath();

			// Ensure media folder exists
			await this.ensureMediaFolderExists();

			// Export the photo via Bridge API
			const exportResult = await this.bridgeApi.exportPhoto(
				photoId,
				destinationPath,
				finalFilename,
				this.settings.defaultFilenameFormat === 'original'
			);

			if (!exportResult.success) {
				throw new Error(exportResult.error || 'Export failed');
			}

			// Create markdown link using just the filename (Obsidian will find it in attachments folder)
			const justFilename = exportResult.originalFilename || finalFilename;
			const markdownLink = `![[${justFilename}]]`;

			// Insert into editor
			const editor = targetLeaf.editor;
			const cursor = editor.getCursor();
			
			// Add a new line if we're not at the beginning of a line
			const currentLine = editor.getLine(cursor.line);
			const prefix = currentLine.trim() === '' ? '' : '\n';
			
			editor.replaceRange(prefix + markdownLink, cursor);

			// Show success message
			this.showNotice(`✅ 照片已插入: ${justFilename}`);

			return true;
		} catch (error) {
			console.error('Error inserting photo:', error);
			this.showNotice(`❌ 插入照片失敗: ${error.message}`);
			return false;
		}
	}

	private getMediaFolderPath(): string {
		// Get absolute path to media folder
		const vaultPath = (this.app.vault.adapter as any).basePath;
		return `${vaultPath}/${this.settings.mediaFolder}`;
	}

	private async ensureMediaFolderExists() {
		if (this.settings.autoCreateMediaFolder) {
			try {
				const folderExists = await this.app.vault.adapter.exists(this.settings.mediaFolder);
				if (!folderExists) {
					await this.app.vault.adapter.mkdir(this.settings.mediaFolder);
				}
			} catch (error) {
				console.error('Error creating media folder:', error);
				throw new Error(`無法建立媒體資料夾: ${error}`);
			}
		}
	}

	private getRelativePathForInsert(absolutePath: string): string {
		// Convert absolute path to relative path for Obsidian
		const vaultPath = (this.app.vault.adapter as any).basePath;
		return absolutePath.replace(vaultPath + '/', '');
	}

	// Utility method to get current vault path
	getVaultPath(): string {
		return (this.app.vault.adapter as any).basePath;
	}

	// Utility method to check if a file exists
	async fileExists(path: string): Promise<boolean> {
		try {
			return await this.app.vault.adapter.exists(path);
		} catch {
			return false;
		}
	}



	// Helper method to show notices
	private showNotice(message: string) {
		new Notice(message);
	}

	// Generate a unique filename for the photo
	private async generateUniqueFilename(originalFilename?: string, photoId?: string): Promise<string> {
		// If no filename provided, create one from photoId
		if (!originalFilename) {
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
			originalFilename = `photo-${timestamp}.jpg`;
		}

		// Ensure the filename has an extension
		if (!originalFilename.includes('.')) {
			originalFilename += '.jpg';
		}

		// Check if file already exists in media folder
		const mediaFolder = this.settings.mediaFolder;
		const fullPath = `${mediaFolder}/${originalFilename}`;
		
		if (!(await this.fileExists(fullPath))) {
			return originalFilename;
		}

		// File exists, generate unique name
		const lastDotIndex = originalFilename.lastIndexOf('.');
		const nameWithoutExt = lastDotIndex > 0 ? originalFilename.substring(0, lastDotIndex) : originalFilename;
		const extension = lastDotIndex > 0 ? originalFilename.substring(lastDotIndex) : '.jpg';

		let counter = 1;
		let uniqueFilename: string;
		
		do {
			uniqueFilename = `${nameWithoutExt}-${counter}${extension}`;
			counter++;
		} while (await this.fileExists(`${mediaFolder}/${uniqueFilename}`));

		return uniqueFilename;
	}

	// Set up drag and drop handlers for editors
	private setupDragAndDropHandlers() {
		// Register dragenter handler to prevent defaults
		this.registerDomEvent(document, 'dragenter', (e) => {
			const hasJson = e.dataTransfer?.types.includes('application/json');
			if (hasJson) {
				e.preventDefault();
				e.stopPropagation();
			}
		});

		// Register dragover handler
		this.registerDomEvent(document, 'dragover', (e) => {
			// Check if we're dragging from our plugin
			const hasJson = e.dataTransfer?.types.includes('application/json');
			if (hasJson && e.dataTransfer?.types.length === 1) { // Only our JSON data
				// Find the target editor
				const target = e.target as HTMLElement;
				const editorEl = target.closest('.cm-editor');
				if (editorEl) {
					e.preventDefault();
					e.stopPropagation();
					e.dataTransfer!.dropEffect = 'copy';
				}
			}
		});

		// Register drop handler
		this.registerDomEvent(document, 'drop', async (e) => {
			// Always prevent default drop behavior first
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();

			try {
				const jsonData = e.dataTransfer?.getData('application/json');
				if (!jsonData) return;

				const dragData = JSON.parse(jsonData);
				if (dragData.type !== 'obsidian-photos-bridge-photo') return;

				// Find the target editor
				const target = e.target as HTMLElement;
				const editorEl = target.closest('.cm-editor');
				if (!editorEl) return;

				// Get the editor instance from the DOM element
				const view = this.findMarkdownViewFromElement(target);
				if (!view) {
					this.showNotice('無法找到目標編輯器');
					return;
				}

				// Insert the photo
				await this.insertPhotoDirectly(view, dragData.photoId, dragData.filename);

			} catch (error) {
				console.error('Error handling photo drop:', error);
				this.showNotice('拖拉插入照片時發生錯誤');
			}
		});
	}

	// Helper method to find MarkdownView from DOM element
	private findMarkdownViewFromElement(element: HTMLElement): MarkdownView | null {
		// Find the leaf container
		const leafContainer = element.closest('.workspace-leaf');
		if (!leafContainer) return null;

		// Find the corresponding leaf using getAllLeaves
		const leaves = this.app.workspace.getLeavesOfType('markdown');
		for (const leaf of leaves) {
			if ((leaf as any).containerEl === leafContainer && leaf.view instanceof MarkdownView) {
				return leaf.view as MarkdownView;
			}
		}
		return null;
	}

	// Direct photo insertion method that bypasses the problematic editor finding
	private async insertPhotoDirectly(view: MarkdownView, photoId: string, filename?: string): Promise<void> {
		try {
			// Generate a unique filename if needed
			const finalFilename = await this.generateUniqueFilename(filename, photoId);
			
			// Get the destination path (relative to vault)
			const destinationPath = this.getMediaFolderPath();

			// Ensure media folder exists
			await this.ensureMediaFolderExists();

			// Export the photo via Bridge API
			const exportResult = await this.bridgeApi.exportPhoto(
				photoId,
				destinationPath,
				finalFilename,
				this.settings.defaultFilenameFormat === 'original'
			);

			if (!exportResult.success) {
				throw new Error(exportResult.error || 'Export failed');
			}

			// Use the filename returned by Bridge App (now consistently .jpg)
			const actualFilename = exportResult.originalFilename || finalFilename;
			const markdownLink = `![[${actualFilename}]]`;

			// Insert into editor
			const editor = view.editor;
			const cursor = editor.getCursor();
			
			// Add a new line if we're not at the beginning of a line
			const currentLine = editor.getLine(cursor.line);
			const prefix = currentLine.trim() === '' ? '' : '\n';
			
			editor.replaceRange(prefix + markdownLink, cursor);

			// Show success message
			this.showNotice(`✅ 照片已插入: ${actualFilename}`);

		} catch (error) {
			console.error('Error inserting photo directly:', error);
			this.showNotice(`❌ 插入照片失敗: ${error.message}`);
			throw error;
		}
	}
} 