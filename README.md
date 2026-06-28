# SQMS 程序書修訂需求管理和統計系統

GitHub Pages + Supabase 的靜態前端系統。

## 功能

- 手機優先快速新增 / 修改需求
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
3. 完整執行：`supabase/schema.sql`。
4. Supabase → Authentication → Users → Add user，建立管理員帳號。
5. 建議在 Supabase Authentication 設定中關閉公開註冊；此系統不提供一般使用者登入，一般人直接新增/修改需求即可。

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
- 修改需求後清單和 Dashboard 更新
- 統計清單 / 待完成清單篩選正常
- 列印/PDF 有標題、打印內容、打印日期、件數
- CSV / Excel 可匯出
- 管理員登入成功
- 管理員可軟刪除，一般使用者看不到刪除按鈕
