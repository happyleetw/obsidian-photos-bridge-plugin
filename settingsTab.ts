import { App, PluginSettingTab, Setting } from 'obsidian';
import PhotosBridgePlugin from './main';
import { PhotosBridgeSettings } from './types';
import { BridgeAPI } from './bridgeApi';

export class PhotosBridgeSettingTab extends PluginSettingTab {
	plugin: PhotosBridgePlugin;
	private bridgeApi: BridgeAPI;

	constructor(app: App, plugin: PhotosBridgePlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.bridgeApi = new BridgeAPI(plugin.settings.bridgeUrl);
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: '照片橋接器設定' });

		// Connection section
		containerEl.createEl('h3', { text: '連線設定' });

		new Setting(containerEl)
			.setName('Bridge App URL')
			.setDesc('macOS Bridge App 的 API 地址')
			.addText(text => text
				.setPlaceholder('http://localhost:44556')
				.setValue(this.plugin.settings.bridgeUrl)
				.onChange(async (value) => {
					this.plugin.settings.bridgeUrl = value;
					this.bridgeApi.updateBaseUrl(value);
					await this.plugin.saveSettings();
				}));

		// Test connection button
		new Setting(containerEl)
			.setName('測試連線')
			.setDesc('檢查與 Bridge App 的連線狀態')
			.addButton(button => button
				.setButtonText('測試連線')
				.setCta()
				.onClick(async () => {
					const originalText = button.buttonEl.textContent;
					button.setButtonText('測試中...');
					button.setDisabled(true);

					try {
						const info = await this.bridgeApi.getConnectionInfo();
						if (info.connected) {
							button.setButtonText('✅ 連線成功');
							// Show version info
							const versionEl = containerEl.createEl('p', { 
								text: `Bridge App 版本: ${info.version}`,
								cls: 'setting-item-description'
							});
							setTimeout(() => versionEl.remove(), 3000);
						} else {
							button.setButtonText('❌ 連線失敗');
							console.error('Connection failed:', info.error);
						}
					} catch (error) {
						button.setButtonText('❌ 連線失敗');
						console.error('Connection test error:', error);
					}

					setTimeout(() => {
						button.setButtonText(originalText);
						button.setDisabled(false);
					}, 2000);
				}));

		// Media folder section
		containerEl.createEl('h3', { text: '媒體檔案設定' });

		new Setting(containerEl)
			.setName('媒體資料夾')
			.setDesc('儲存匯入照片和影片的資料夾名稱')
			.addText(text => text
				.setPlaceholder('Media')
				.setValue(this.plugin.settings.mediaFolder)
				.onChange(async (value) => {
					this.plugin.settings.mediaFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('掃描資料夾')
			.setDesc('掃描日記筆記的資料夾路徑，用於檢查照片使用情況')
			.addText(text => text
				.setPlaceholder('Me/Diary')
				.setValue(this.plugin.settings.scanFolder)
				.onChange(async (value) => {
					this.plugin.settings.scanFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('自動建立媒體資料夾')
			.setDesc('如果媒體資料夾不存在，是否自動建立')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoCreateMediaFolder)
				.onChange(async (value) => {
					this.plugin.settings.autoCreateMediaFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('預設檔案名稱格式')
			.setDesc('匯入檔案的命名方式')
			.addDropdown(dropdown => dropdown
				.addOptions({
					'original': '使用原始檔名',
					'timestamp': '使用時間戳記',
					'custom': '自訂格式'
				})
				.setValue(this.plugin.settings.defaultFilenameFormat)
				.onChange(async (value) => {
					this.plugin.settings.defaultFilenameFormat = value;
					await this.plugin.saveSettings();
				}));

		// Display settings section
		containerEl.createEl('h3', { text: '顯示設定' });

		new Setting(containerEl)
			.setName('縮圖大小')
			.setDesc('側邊欄中縮圖的顯示大小（像素）')
			.addSlider(slider => slider
				.setLimits(100, 300, 10)
				.setValue(this.plugin.settings.thumbnailSize)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.thumbnailSize = value;
					await this.plugin.saveSettings();
					// Update CSS custom property
					document.documentElement.style.setProperty('--photos-bridge-thumbnail-size', `${value}px`);
				}));

		new Setting(containerEl)
			.setName('每頁照片數量')
			.setDesc('每次載入的照片數量（10-200）')
			.addSlider(slider => slider
				.setLimits(10, 200, 10)
				.setValue(this.plugin.settings.pageSize)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.pageSize = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('啟用影片支援')
			.setDesc('是否顯示和匯入影片檔案')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableVideos)
				.onChange(async (value) => {
					this.plugin.settings.enableVideos = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('顯示隱藏照片')
			.setDesc('是否顯示在 Photos.app 中被隱藏的照片')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showHiddenPhotos)
				.onChange(async (value) => {
					this.plugin.settings.showHiddenPhotos = value;
					await this.plugin.saveSettings();
				}));

		// Performance settings
		containerEl.createEl('h3', { text: '效能設定' });

		new Setting(containerEl)
			.setName('搜尋去抖動延遲 (毫秒)')
			.setDesc('搜尋輸入的去抖動延遲時間，避免頻繁請求')
			.addSlider(slider => slider
				.setLimits(100, 2000, 100)
				.setValue(this.plugin.settings.searchDebounceMs)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.searchDebounceMs = value;
					await this.plugin.saveSettings();
				}));



		// Usage instructions
		containerEl.createEl('h3', { text: '使用說明' });

		containerEl.createEl('div', { cls: 'setting-item-description' }, (el) => {
			el.innerHTML = `
				<p><strong>使用說明：</strong></p>
				<ol>
					<li>確保 macOS Bridge App 正在執行</li>
					<li>在上方測試連線，確認通訊正常</li>
					<li>點擊左側邊欄的照片圖示開始使用</li>
				</ol>
				<p><strong>故障排除：</strong></p>
				<ul>
					<li>連線失敗：請檢查 Bridge App 是否執行，並確認 URL 正確</li>
					<li>照片無法載入：請確認已授予 Bridge App 照片存取權限</li>
					<li>匯入失敗：請檢查媒體資料夾的寫入權限</li>
				</ul>
			`;
		});
	}
} 