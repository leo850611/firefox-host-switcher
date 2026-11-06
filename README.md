# Host Switcher

版本 0.4.0。只修改 HTTP Host 標頭，直接在 Firefox 工具列檢視及編輯規則。只需桌面版 Firefox 140 以上，不需要 Python、代理伺服器或本機輔助程式。

安裝：[Firefox 附加元件頁面](https://addons.mozilla.org/addon/host-switcher-header-tools/)

## 使用方式

1. 點擊 Host Switcher 圖示開啟快速編輯視窗。
2. 新增「請求網域或 IP」與「Host 標頭值」。例如來源 `127.0.0.1`、Host `app.example.test:8080`。
3. 開啟總開關與「修改 Host 標頭」。每條規則也有獨立開關。
4. 編輯後按「儲存」或 Enter，下一個符合規則的新請求就會套用。
5. 「帶入此網站」會填入目前頁面的主機名稱；「詳細設定」另開完整管理頁面。

例如造訪 `http://127.0.0.1:8000/`，設定上述規則後會送出 `Host: app.example.test:8080`。網址、連線目的地與連線埠號仍為原網址設定。

## 安裝與發布

開發測試：Firefox 開啟 `about:debugging#/runtime/this-firefox`，按「載入暫時附加元件」，選擇 `extension/manifest.json`。暫時載入的版本關閉瀏覽器後需重新載入。

正式安裝：將 `extension/` 裡面的檔案打包為 ZIP，確保 `manifest.json` 位於最外層，送至 Mozilla 取得簽章。可在 `extension/` 目錄執行以下指令產生未簽章的上傳包；產生的 ZIP 已由 `.gitignore` 排除，不需提交至 GitHub。不要把完整原始碼包當作上傳包。

```sh
cd extension
zip -r ../extension.zip . -x "*.DS_Store" "*/.DS_Store" "._*" "*/._*"
```

若已安裝正式版本，請從原附加元件的版本管理頁上傳 0.4.0 作為更新。擴充套件 ID 保持相同。頁面摘要與敘述請改用 `AMO-LISTING.md`，移除舊版的網域 IP 對應介紹。

## 規則與限制

- 依原網址主機名稱精確比對，忽略大小寫及末尾的點；不包含子網域或萬用字元。
- 來源欄不含埠號，同一來源的所有埠號都會套用。Host 值可含埠號；IPv6 請使用 `[::1]:8080`。
- 最多 200 條規則，重複來源與包含換行、控制字元的 Host 值會被拒絕。
- 開關與儲存只影響後續新請求，不會改寫已送出的請求或既有 WebSocket 連線。
- 重新載入頁面可以重新發出請求；快取與 Service Worker 可能直接提供內容。
- 修改 Host 不會改變網址列、DNS 或連線目的 IP。HTTPS 的 TLS SNI 與憑證驗證仍依原網址處理。
- 僅處理 Firefox WebExtensions 可攔截的 HTTP(S)／WS(S) 請求，不涵蓋瀏覽器內部服務與受保護頁面。私密視窗目前不支援。
- 未提供匯入／匯出、規則群組或不同容器的獨立設定。

## 從舊版升級

0.4.0 保留既有 Host 標頭規則、總開關及標頭開關，並刪除已移除功能的 IP 對應設定。舊版的代理與原生通訊權限已移除，不會再啟動本機輔助程式，也不會攔截或阻擋原本套用 IP 對應的請求。

曾安裝的舊版輔助程式檔案不會被本次更新自動移除，但本版本不會再使用它們；瀏覽器與作業系統的代理或 hosts 設定不需調整。

## 資料處理

規則使用 `storage.local` 儲存在使用者的瀏覽器設定檔。請求網址與標頭只在瀏覽器內用來比對、修改 Host，不記錄瀏覽歷程、Cookie 或回應內容，沒有分析服務、帳號、雲端同步或外部規則服務。詳見 `PRIVACY.md`。

## 開發驗證

執行 `node tests/test_extension.cjs`。測試涵蓋舊設定升級、移除舊功能設定、Host 改寫、獨立開關、來源比對、保留其他標頭、拒絕標頭注入與儲存失敗處理。Node.js 僅用於開發測試，使用擴充套件不需要安裝它。
