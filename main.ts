import { Plugin, WorkspaceLeaf, TFile, MarkdownView } from 'obsidian';
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
		this.addRibbonIcon('camera', '照片', () => {
			this.activatePhotosView();
		});

		// Add command to open photos view
		this.addCommand({
			id: 'open-photos-view',
			name: '開啟照片面板',
			callback: () => {
				this.activatePhotosView();
			}
		});

		// Add command to insert photo from bridge
		this.addCommand({
			id: 'insert-photo-from-bridge',
			name: '從 Bridge App 插入照片',
			editorCallback: async (editor, view) => {
				// This could open a quick picker modal
				await this.activatePhotosView();
			}
		});

		// Add settings tab
		this.addSettingTab(new PhotosBridgeSettingTab(this.app, this));

		// Apply CSS custom properties
		this.updateCSSVariables();

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
		const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeLeaf) {
			return false;
		}

		try {
			// Get the destination path
			const destinationPath = this.getMediaFolderPath();

			// Ensure media folder exists
			await this.ensureMediaFolderExists();

			// Export the photo via Bridge API
			const exportResult = await this.bridgeApi.exportPhoto(
				photoId,
				destinationPath,
				filename,
				this.settings.defaultFilenameFormat === 'original'
			);

			if (!exportResult.success) {
				throw new Error(exportResult.error || 'Export failed');
			}

			// Create markdown link
			const relativePath = this.getRelativePathForInsert(exportResult.filePath!);
			const markdownLink = `![[${relativePath}]]`;

			// Insert into editor
			const editor = activeLeaf.editor;
			const cursor = editor.getCursor();
			editor.replaceRange(markdownLink, cursor);

			return true;
		} catch (error) {
			console.error('Error inserting photo:', error);
			// Could show error notice to user
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
} 