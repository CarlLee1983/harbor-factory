# 港灣工場

1 到 4 位玩家共用裝置的繁體中文地產桌遊。選角、擲骰、購地與收租，玩家自行決定何時結算。遊戲進度儲存在目前瀏覽器。

[開啟遊戲](https://carllee1983.github.io/harbor-factory/)

## 本機執行

使用 Node.js 22.12 以上版本。

```sh
npm ci
npm exec -- vite --config factory/vite.config.js
```

## 測試和部署

```sh
npm test
npm exec -- vite build --config factory/vite.config.js --outDir ../docs
```

GitHub Pages 使用 `main` 分支的 `docs/`。更新遊戲後，將重新建置的檔案和原始碼一起提交並推送。保留 `docs/.nojekyll` 與素材授權檔。

工場地景使用 Kenney 的 Tiny Factory 素材，角色為專案繪製。[素材來源與授權](factory/art/README.md)
