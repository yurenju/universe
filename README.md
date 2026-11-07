# 宇宙尺度 Universe Scale

從地球與月球一路縮放到可觀測宇宙，用 3D 體會宇宙有多大。

九個尺度層級：地月系統 → 行星系 → 日球層 → 歐特雲 → 鄰近恆星 → 銀河系 → 本星系群 → 拉尼亞凱亞超星系團 → 可觀測宇宙。用語定義見 [GLOSSARY.md](GLOSSARY.md)，縮放架構見 [docs/adr/0001-hybrid-continuous-zoom.md](docs/adr/0001-hybrid-continuous-zoom.md)。

另有兩個天體特寫，從銀河系層點標記進入：天鵝座 X-1（恆星質量黑洞與伴星）和人馬座 A*（銀河中心的超大質量黑洞與 S 星群）。特寫裡的重力透鏡是逐像素追蹤光線算出來的，架構見 [docs/adr/0002-close-ups-outside-the-scale-axis.md](docs/adr/0002-close-ups-outside-the-scale-axis.md)。

## 操作

- 滾輪／雙指捏合：縮放（跨越層級）
- 拖曳：旋轉
- 點標記：飛過去並顯示資訊
- 左側尺度階梯：直接跳到某一層；每層有自己的網址，例如 `#milky-way`
- 「放大天體」（預設開啟）：放大行星、星系與黑洞的大小，距離不變；取消勾選就是真實比例，按旁邊的「?」看這一層放大了什麼
- 天體特寫：網址 `#cygnus-x1`、`#sgr-a`；左側「← 回到銀河系」或按 Esc 離開，往外縮到底也會自動回去
- 重力透鏡在跑不動的裝置上會自動關掉；網址加 `?lensing=on` 或 `?lensing=off` 可以強制開關

## 開發

```bash
npm install
npm run dev      # http://localhost:5173/universe/
npm test         # 座標轉換、尺度權重、單位、天文曆表、軌道、光線偏折等測試
npm run build    # 輸出到 dist/
```

推到 `main` 後，`.github/workflows/deploy.yml` 會自動測試、建置並部署到 GitHub Pages
（repo 設定 → Pages → Source 選 **GitHub Actions**）。

### 資料處理腳本

- `scripts/build-stars.mjs`：把 [HYG 星表](https://github.com/astronexus/HYG-Database) 轉成 `public/data/*.bin`
- `scripts/mollweide-to-equirect.py`：把 Planck 的 Mollweide 全天圖轉成可貼在球面上的等距圓柱投影

## 授權

程式碼：MIT。圖片與資料依各自原始授權使用，完整清單在 `src/content/credits.json` 與網站上的「資料來源」。
