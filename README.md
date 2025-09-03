# Cosense Gmail Integration

Gmailの「cosense」ラベルが付いたメールを自動的にCosense（Scrapbox）にインポートするSvelteKitアプリケーションです。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/qaynam/cosense-gmail-integration&env=GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,UPSTASH_REDIS_URL,UPSTASH_REDIS_TOKEN,TOKEN_ENCRYPTION_KEY,CRON_SECRET&envDescription=Required%20environment%20variables%20for%20Gmail%20and%20Cosense%20integration)

## 🚀 機能

- **Gmail連携**: Google OAuth2でGmailアカウントに安全に接続
- **自動インポート**: 「cosense」ラベルのメールを自動検出・インポート
- **リッチメタデータ**: 送信者、受信者、日時、件名などの詳細情報を含める
- **重複防止**: 既にインポート済みのメールはスキップ
- **直接リンク**: Gmail内の元メールへの直接リンクを追加
- **安全な保存**: リフレッシュトークンはAES-256-CBCで暗号化
- **Cron対応**: 定期的な自動同期をサポート

## 🛠️ セットアップ

### 1. Google Cloud Platform (GCP) プロジェクト作成

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成するか、既存のプロジェクトを選択
3. **Gmail API** を有効化:
   - ナビゲーション → **APIs & Services** → **Library**
   - "Gmail API" を検索して有効化

### 2. OAuth2 認証情報の作成

1. **APIs & Services** → **Credentials** に移動
2. **+ CREATE CREDENTIALS** → **OAuth client ID** を選択
3. アプリケーションタイプ: **Web application**
4. **Authorized redirect URIs** に以下を追加:
   ```
   http://localhost:5173/auth/callback
   https://yourdomain.vercel.app/auth/callback
   ```
5. **Client ID** と **Client Secret** をメモ

### 3. Upstash Redis データベース作成

1. [Upstash Console](https://console.upstash.com/) でアカウント作成
2. **Create Database** をクリック
3. リージョンを選択（推奨: 最寄りのリージョン）
4. **Database URL** と **Database Token** をメモ

### 4. 環境変数設定

`.env.local` ファイルを作成:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Upstash Redis
UPSTASH_REDIS_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_TOKEN=your_redis_token

# Token Encryption (32文字のランダム文字列)
TOKEN_ENCRYPTION_KEY=your_32_character_encryption_key

# Cron認証 (任意のランダム文字列)
CRON_SECRET=your_random_cron_secret
```

### 5. Cosense (Scrapbox) セッション取得

1. [Cosense](https://scrapbox.io/) にログイン
2. ブラウザの開発者ツールを開く
3. **Application** → **Cookies** で `connect.sid` の値をコピー
4. アプリの設定画面で入力

## 🚀 デプロイ

### Vercel でデプロイ

1. 上記の **Deploy with Vercel** ボタンをクリック
2. GitHub リポジトリを接続
3. 環境変数を設定
4. デプロイを実行

### 手動デプロイ

```bash
# 依存関係のインストール
bun install

# 本番ビルド
bun run build

# プレビュー
bun run preview
```

## 📖 使い方

### 1. Gmail セットアップ

1. Gmail でメールに「cosense」ラベルを作成
2. インポートしたいメールに「cosense」ラベルを付与

### 2. アプリケーション設定

1. デプロイしたアプリにアクセス
2. Google アカウントでログイン
3. Cosense プロジェクト名とセッションIDを設定

### 4. 自動インポート (Cron)

Vercel の Cron Jobs を使用して定期実行:

## 🔧 技術スタック

- **フレームワーク**: SvelteKit + TypeScript
- **認証**: Google OAuth2 (Arctic)
- **データベース**: Upstash Redis (JSON)
- **Gmail API**: Google APIs Node.js Client
- **暗号化**: Node.js Crypto (AES-256-CBC)
- **デプロイ**: Vercel
- **スタイリング**: Tailwind CSS

## 🏗️ プロジェクト構造

```
src/
├── lib/server/           # サーバーサイドライブラリ
│   ├── gmail.ts         # Gmail API 操作
│   ├── cosense.ts       # Cosense API 操作
│   ├── user.ts          # ユーザー管理
│   ├── session.ts       # セッション管理
│   ├── crypto.ts        # 暗号化ユーティリティ
│   └── oauth.ts         # OAuth設定
├── routes/
│   ├── auth/            # 認証関連ルート
│   ├── cron/            # Cron エンドポイント
│   └── +page.svelte     # メインページ
└── hooks.server.ts      # サーバーフック
```

## 🤝 コントリビューション

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. コミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📝 ライセンス

MIT License - 詳細は [LICENSE](LICENSE) ファイルを参照

---

**作成者**: [Qaynam](https://github.com/qaynam)

**記事**:
