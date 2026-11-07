# 宇宙尺度 Universe Scale

從地球與月球一路縮放到可觀測宇宙，用 3D 體會宇宙有多大。

九個尺度層級：地月系統 → 行星系 → 日球層 → 歐特雲 → 鄰近恆星 → 銀河系 → 本星系群 → 拉尼亞凱亞超星系團 → 可觀測宇宙。用語定義見 [GLOSSARY.md](GLOSSARY.md)，縮放架構見 [docs/adr/0001-hybrid-continuous-zoom.md](docs/adr/0001-hybrid-continuous-zoom.md)。

## 操作

- 滾輪／雙指捏合：縮放（跨越層級）
- 拖曳：旋轉
- 點標記：飛過去並顯示資訊
- 左側尺度階梯：直接跳到某一層；每層有自己的網址，例如 `#milky-way`
- 「放大天體」：放大行星與星系的大小（距離不變）

## 開發

```bash
npm install
npm run dev      # http://localhost:5173/universe/
npm test         # 座標轉換、尺度權重、單位、天文曆表等測試
npm run build    # 輸出到 dist/
```

推到 `main` 後，`.github/workflows/deploy.yml` 會自動測試、建置並部署到 GitHub Pages
（repo 設定 → Pages → Source 選 **GitHub Actions**）。

### 資料處理腳本

- `scripts/build-stars.mjs`：把 [HYG 星表](https://github.com/astronexus/HYG-Database) 轉成 `public/data/*.bin`
- `scripts/mollweide-to-equirect.py`：把 Planck 的 Mollweide 全天圖轉成可貼在球面上的等距圓柱投影

## 授權

程式碼：MIT。圖片與資料依各自原始授權使用，完整清單在 `src/content/credits.json` 與網站上的「資料來源」。
