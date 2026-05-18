# 🏗 現場 & 給与 管理アプリ

大工・請負業向け 現場損益・出勤・給与管理アプリ（PWA対応）

---

## 📱 Vercelに公開する手順（無料・5分）

### 事前準備
- GitHubアカウント（無料・1分で作成可能）→ https://github.com
- Vercelアカウント（無料・GitHubで連携可能）→ https://vercel.com

---

### ステップ1: このフォルダ全体をZIPで保存

このフォルダ `daiku-app` をそのまま保管してください。

---

### ステップ2: GitHubにアップロード

1. https://github.com にログイン
2. 右上の「+」→ **「New repository」** をクリック
3. Repository name: `daiku-app`（任意）
4. **Public** を選択（無料プランで公開する場合）
5. **「Create repository」** をクリック
6. 表示されたページの一番下で **「uploading an existing file」** をクリック
7. このフォルダの中身を全部ドラッグ＆ドロップ
   - ⚠️ `node_modules` フォルダがあれば**除外**してください
8. 下の **「Commit changes」** をクリック

---

### ステップ3: Vercelで公開

1. https://vercel.com にアクセス
2. **「Sign Up」** → GitHubアカウントで連携
3. ダッシュボードで **「Add New」→「Project」** をクリック
4. 先ほど作った `daiku-app` リポジトリの右にある **「Import」** をクリック
5. 設定はそのままで **「Deploy」** をクリック
6. **1分待つ**…
7. 🎉 完成！ `https://daiku-app-xxx.vercel.app` のようなURLが発行されます

---

### ステップ4: iPhoneのホーム画面に追加

1. **Safariで** 発行されたURLを開く（Chromeはダメ）
2. 画面下の **共有ボタン ⬆️** をタップ
3. メニューを下にスクロール
4. **「ホーム画面に追加」** をタップ
5. 名前を確認して **「追加」**

✅ ホーム画面にアプリアイコンが追加され、タップで全画面起動します！

---

## 💾 データについて

- 入力したデータは **端末のSafari内に保存** されます
- ⚙ボタン → **「バックアップ書き出し」** で定期的にJSONファイル保存推奨
- 別端末への移行や復元はJSONファイルから可能

---

## 🔄 アプリの更新方法

コードを変更したら、GitHub上で編集して保存すると、Vercelが自動で再公開してくれます。
（最初の公開後は何もしなくて大丈夫）

---

## 📂 ファイル構成

```
daiku-app/
├── public/
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── apple-touch-icon.png
│   └── favicon.svg
├── src/
│   ├── App.jsx       ← メインのアプリコード
│   └── main.jsx
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

---

## 困ったら

- ビルドエラー：Vercelダッシュボードの「Logs」を確認
- 表示崩れ：Safariのキャッシュをクリア
- データ消失：バックアップJSONから復元

---

Built with React + Vite + PWA
