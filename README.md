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

## Supabase 配置

1. 在 Supabase SQL Editor 執行：`supabase/schema.sql`
2. 建立管理員帳號：Authentication → Users → Add user
3. 在 GitHub Pages 部署環境設定環境變數：

```text
VITE_SUPABASE_URL=你的 Supabase Project URL
VITE_SUPABASE_ANON_KEY=你的 Supabase anon public key
```

未配置 Supabase 時，系統會以 localStorage 展示模式運行，方便先驗收 UI。

## GitHub Pages 部署

已包含 workflow：`.github/workflows/deploy.yml`。
推送到 `main` 後，GitHub Actions 會 build 並部署到 Pages。
