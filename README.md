# Obsidian Photos Bridge Plugin

Obsidian 插件，讓您能夠直接從 macOS Photos.app 中瀏覽和插入照片/影片到您的筆記。

## 功能特色

- ✅ 在側邊欄瀏覽所有 Photos.app 中的照片和影片
- ✅ 支援縮圖預覽和搜尋功能
- ✅ 一鍵插入照片/影片到當前筆記
- ✅ 自動複製媒體檔案到 Vault
- ✅ 支援多種檔案格式（JPEG、PNG、HEIC、MOV、MP4 等）
- ✅ 保護隱私，所有操作僅限本機

## 系統需求

- macOS 12.0 或更新版本
- Obsidian 1.0.0 或更新版本
- **必須先安裝並執行 Obsidian Photos Bridge App**

## 安裝說明

### 1. 安裝 Bridge App
1. 下載並安裝 `Obsidian Photos Bridge App`
2. 啟動應用程式並授予照片存取權限
3. 確保應用程式在背景執行（會在系統選單欄顯示圖示）

### 2. 安裝 Obsidian Plugin
1. 開啟 Obsidian 設定
2. 前往「社群插件」
3. 搜尋「Photos Bridge」並安裝
4. 啟用插件

## 使用說明

### 基本操作
1. 確保 Bridge App 正在執行
2. 點擊左側邊欄的「📸 照片」圖示
3. 瀏覽您的照片庫
4. 點擊任何照片即可插入到當前筆記

### 搜尋功能
- 在搜尋框中輸入關鍵字搜尋照片
- 支援檔案名稱和日期搜尋
- 使用篩選器按媒體類型篩選（照片/影片）

### 插入選項
- **複製到 Vault**：自動複製原始檔案到 `attachments/` 資料夾
- **自訂檔名**：可選擇自訂檔案名稱
- **保留原始檔名**：使用原始檔案名稱

## 插件設定

在 Obsidian 設定中找到「Photos Bridge」選項：

- **Bridge App URL**：Bridge App 的 API 地址（預設：`http://localhost:44556`）
- **媒體資料夾**：儲存匯入媒體的資料夾（預設：`attachments`）
- **自動建立資料夾**：自動建立媒體資料夾
- **預設檔案名稱格式**：匯入檔案的命名格式
- **縮圖大小**：側邊欄縮圖的顯示大小

## 故障排除

### Bridge App 連線問題
1. 確認 Bridge App 正在執行
2. 檢查防火牆設定是否阻擋本機連線
3. 嘗試重新啟動 Bridge App

### 照片無法載入
1. 確認已授予 Bridge App 照片存取權限
2. 重新啟動 Bridge App 並重新授權
3. 檢查 Photos.app 中是否有照片

### 匯入失敗
1. 確認 Vault 中的目標資料夾有寫入權限
2. 檢查儲存空間是否足夠
3. 嘗試使用不同的檔案名稱

## 隱私聲明

- 此插件僅與本機的 Bridge App 通訊
- 不會上傳或傳送任何照片到外部服務
- 所有照片處理均在您的設備上進行
- 不收集或儲存任何個人資料

## 開發資訊

基於 Obsidian Plugin API 開發，使用 TypeScript 和現代 Web 技術。

主要技術：
- TypeScript
- Obsidian Plugin API
- Fetch API for HTTP 通訊
- CSS Grid for UI 佈局

## 支援

如有問題或建議，請透過以下方式聯繫：
- GitHub Issues
- Obsidian 社群論壇

## 版本歷史

### v1.0.0
- 初始發布
- 基本照片瀏覽和插入功能
- 支援搜尋和篩選
- 完整的設定介面 