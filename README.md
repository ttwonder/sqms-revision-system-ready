# SQMS 程序書修訂需求管理和統計系統

GitHub Pages + Supabase 的靜態前端系統。

## 功能

- 手機優先快速新增 / 修改需求
- 表單草稿自動保留在本機，正式資料由「手動保存」送出並顯示成功／失敗狀態
- 欄位級多人協作，不以整筆舊表單覆蓋他人修改
- Realtime 自動更新、短暫斷線自動重試、未送出草稿恢復
- 需求編號由 PostgreSQL 依台北日期原子分配
- 每筆 revision、冪等 operation id 與修改事件歷史
- 公開 Dashboard
- 統計清單、待完成清單
- PDF 列印、CSV / Excel 匯出
- 管理員登入後軟刪除
- SQMS 目錄已依 Word 文件抽取：SMM / SMP / SMI / SQMS / ISO

## 本機啟動

```bash
npm install
npm run dev
```

如需本機直接連 Supabase，複製 `.env.example` 為 `.env.local`，填入真實 Supabase Project URL 和 anon public key。

## Supabase 配置

1. 建立 Supabase 專案。
2. 打開 Supabase → SQL Editor。
3. 新專案先完整執行：`supabase/schema.sql`。
4. 接著執行：`supabase/migrations/202608080001_collaboration_core.sql`。
   - 已上線的專案只需在現有 schema 上執行這個 migration，不要清空或重建正式資料。
   - Migration 會保留既有需求，補上 revision、操作事件、人員 session、雲端需求來源與每日編號計數器。
   - 舊人員密碼會在資料庫內轉成雜湊並清除明文。
5. 若既有專案新增需求時曾顯示 `column reference "business_date" is ambiguous`，再執行：`supabase/migrations/202608110001_fix_create_request_business_date.sql`。
   - 這個 hotfix 只替換新增需求 RPC，不會清除或改寫既有需求資料。
   - 新安裝使用已修正的 collaboration migration；再次執行 hotfix 也安全。
6. 執行：`supabase/migrations/202608210001_guest_edit_admin_lifecycle.sql`。
   - 允許網站的匿名 Auth session 修改既有需求內容。
   - 完成、再次修改狀態、其他狀態轉換與刪除仍只允許 Owner／管理員／人員管理員。
   - Migration 可重複執行，不會清除或改寫既有需求。
7. 執行：`supabase/migrations/202608210002_data_management_storage.sql`。
   - 提供 Owner／管理員空間統計，以及已軟刪除需求的選擇性永久清理。
   - 安裝 migration 本身不會刪除資料；只有在管理頁人工勾選並再次確認才會清理。
   - 永久清理只刪除所選軟刪除需求及其事件歷史，正常需求與其他系統資料不受影響。
8. Supabase → Authentication → Providers → Anonymous Sign-Ins，啟用匿名登入。
   - 這讓未登入人員也能取得可追蹤的 Auth session，以新增或修改需求；完成、刪除及狀態管理仍須管理員身份。
9. Supabase → Authentication → Users → Add user，建立第一個 owner 帳號。
   - 預設 owner email 已寫入 SQL：`tuotuoworm@outlook.com`。
   - 如需更換 owner，請先修改 `supabase/schema.sql` 中 `insert into admin_users` 的 email。
10. 之後可在網站「管理」頁直接維護管理員名單。
   - Owner 可以新增/停用管理員。
   - Admin 可以進入管理界面、完成及刪除需求，但不能維護管理員名單。
   - 不在 `admin_users` 名單中的 Auth 用戶即使有帳號密碼，也會提示無權限。
11. 若要在管理頁直接設定新管理員的初始密碼，Supabase Authentication 需允許 signup；若你關閉公開註冊，請先到 Supabase Auth → Users → Add user 建立帳號，再回網站管理頁加入管理員名單。

> 部署順序必須是：先套用 migration 並啟用 Anonymous Sign-Ins，再部署新版前端。新版前端不會退回匿名直接寫表或整筆 `upsert`。

需要放入 GitHub Actions Secrets 的值：

```text
VITE_SUPABASE_URL=你的 Supabase Project URL
VITE_SUPABASE_ANON_KEY=你的 Supabase anon public key
```

未配置 Supabase 時，系統會以 localStorage 展示模式運行，只適合本機驗收 UI，不適合正式多人使用。

## GitHub Pages 部署

已包含 workflow：`.github/workflows/deploy.yml`。

部署流程：

1. 將專案推送到 GitHub 的 `main` 分支。
2. GitHub repo → Settings → Secrets and variables → Actions → New repository secret。
3. 新增：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. GitHub repo → Settings → Pages → Build and deployment → Source 選 `GitHub Actions`。
5. 到 Actions 頁面執行或等待 `Deploy to GitHub Pages` 工作流。
6. 工作流綠色完成後，使用 Pages 網址訪問。

如果使用 GitHub Pages 專案網址，例如：

```text
https://<owner>.github.io/sqms-revision-system/
```

workflow 會自動設定 Vite base path 為 `/<repo-name>/`。

如果未來改用自有域名，例如：

```text
https://sqms.company.com/
```

需要把 workflow 的 `VITE_BASE_PATH` 改為 `/`，再重新部署。

## 正式上線驗收清單

上線後請至少測試：

- 新增一筆需求
- 重新整理頁面後資料仍存在
- 另一台電腦/手機能看到同一筆資料
- 兩個瀏覽器同時修改不同欄位後，兩邊內容都保留
- 一邊修改內容、另一邊改狀態後，內容與狀態都保留
- 修改需求後清單和 Dashboard 自動更新，不必按重新整理
- 模擬離線或重新整理後，未送出的草稿可以恢復
- 同時新增需求時不會產生重複需求編號
- 統計清單 / 待完成清單篩選正常
- 列印/PDF 有標題、打印內容、打印日期、件數
- CSV / Excel 可匯出
- 管理員登入成功
- 管理員可軟刪除，一般使用者看不到刪除按鈕
