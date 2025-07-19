# Obsidian Photos Bridge Plugin - 構建說明

## 開發環境需求

- **Node.js**: 16.0 或更新版本
- **npm** 或 **yarn**: 用於依賴管理
- **TypeScript**: 4.7 或更新版本
- **Obsidian**: 1.0.0 或更新版本 (用於測試)

## 快速開始

### 1. 克隆專案並安裝依賴
```bash
git clone <repository-url>
cd obsidian-photos-bridge-plugin
npm install
```

### 2. 開發模式
```bash
# 啟動開發伺服器 (自動編譯)
npm run dev
```

### 3. 建構發佈版本
```bash
# 建構生產版本
npm run build
```

## 專案結構

```
obsidian-photos-bridge-plugin/
├── main.ts                 # 插件主檔案
├── types.ts                # 型別定義
├── bridgeApi.ts           # Bridge API 通訊
├── photosView.ts          # 側欄視圖
├── settingsTab.ts         # 設定介面
├── styles.css             # 樣式檔案
├── manifest.json          # 插件清單
├── package.json           # NPM 配置
├── tsconfig.json          # TypeScript 配置
├── esbuild.config.mjs     # 建構配置
└── version-bump.mjs       # 版本管理腳本
```

## 主要依賴

### 生產依賴
- **Obsidian API**: 插件核心 API
- **TypeScript**: 靜態型別檢查

### 開發依賴
- **esbuild**: 快速建構工具
- **@types/node**: Node.js 型別定義
- **typescript-eslint**: 程式碼品質檢查

## 開發工作流程

### 1. 設定 Obsidian 開發環境
```bash
# 在您的 Obsidian vault 中創建插件目錄
mkdir -p /path/to/your/vault/.obsidian/plugins/photos-bridge

# 將建構輸出連結到 Obsidian 插件目錄
ln -s $(pwd)/main.js /path/to/your/vault/.obsidian/plugins/photos-bridge/
ln -s $(pwd)/manifest.json /path/to/your/vault/.obsidian/plugins/photos-bridge/
ln -s $(pwd)/styles.css /path/to/your/vault/.obsidian/plugins/photos-bridge/
```

### 2. 啟用開發模式
1. 在 Obsidian 中開啟設定
2. 前往「社群插件」
3. 啟用「開發者模式」
4. 啟用「Photos Bridge」插件

### 3. 即時開發
```bash
# 監聽檔案變更並自動重建
npm run dev
```
每次修改程式碼後，在 Obsidian 中使用 `Ctrl+Shift+I` 重新載入插件。

## 建構配置

### 開發建構
- 包含 source maps
- 未壓縮程式碼
- 監聽檔案變更

### 生產建構
- 最佳化程式碼
- 移除 source maps
- 樹搖優化

## 測試

### 1. 單元測試 (待實作)
```bash
npm run test
```

### 2. 手動測試清單
- [ ] Bridge App 連線測試
- [ ] 照片載入測試
- [ ] 搜尋功能測試
- [ ] 照片插入測試
- [ ] 設定頁面測試
- [ ] 各種檔案格式測試 (JPEG, PNG, HEIC, MOV, MP4)

### 3. 相容性測試
- [ ] macOS 12+
- [ ] Obsidian 1.0+
- [ ] 明暗主題模式
- [ ] 不同螢幕尺寸

## 發佈流程

### 1. 準備發佈
```bash
# 更新版本號碼
npm version patch  # 或 minor, major

# 建構發佈版本
npm run build

# 驗證輸出檔案
ls -la main.js manifest.json styles.css
```

### 2. 創建發佈包
```bash
# 創建發佈目錄
mkdir release
cp main.js manifest.json styles.css release/

# 創建 zip 檔案
cd release
zip -r ../photos-bridge-plugin-v1.0.0.zip .
```

### 3. 發佈到社群插件 (如需)
1. Fork [obsidian-releases](https://github.com/obsidianmd/obsidian-releases) 倉庫
2. 添加插件資訊到 `community-plugins.json`
3. 提交 Pull Request

## 除錯

### 1. 在 Obsidian 中開啟開發者工具
- 按 `Ctrl+Shift+I` (Windows/Linux) 或 `Cmd+Option+I` (macOS)
- 查看 Console 面板中的錯誤訊息

### 2. 常見問題

#### Bridge App 連線失敗
```javascript
// 檢查 Bridge App 狀態
console.log('Bridge API URL:', this.settings.bridgeUrl);
```

#### 型別錯誤
```bash
# 執行型別檢查
npx tsc --noEmit
```

#### 建構失敗
```bash
# 清理並重新安裝依賴
rm -rf node_modules package-lock.json
npm install
```

## 程式碼品質

### 1. ESLint 配置
```bash
# 執行程式碼檢查
npx eslint src/
```

### 2. Prettier 格式化 (建議)
```bash
npm install --save-dev prettier
```

### 3. 程式碼規範
- 使用 TypeScript 嚴格模式
- 遵循 Obsidian 插件開發最佳實踐
- 註解重要功能和 API 呼叫

## 效能優化

### 1. 建構優化
- 使用 esbuild 的快速編譯
- 啟用樹搖以移除未使用程式碼
- 最小化最終輸出檔案

### 2. 執行時優化
- 實施搜尋防抖動 (debouncing)
- 照片縮圖快取
- 分頁載入大量照片
- 使用 Web Workers (如需要)

## 安全性考量

- 所有 API 呼叫僅限本機 localhost
- 不儲存或傳輸敏感資料
- 使用 HTTPS (如果 Bridge App 支援)
- 驗證使用者輸入

## 部署檢查清單

- [ ] 所有功能測試通過
- [ ] 無 TypeScript 編譯錯誤
- [ ] 無 ESLint 警告
- [ ] 在多個 Obsidian vault 中測試
- [ ] 驗證與 Bridge App 的整合
- [ ] 檢查不同作業系統的相容性
- [ ] 更新版本號碼和變更日誌
- [ ] 準備發佈說明 