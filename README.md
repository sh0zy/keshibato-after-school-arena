# 消しバト！｜放課後カスタムアリーナ

消しゴムと文房具で、机の上が対戦アリーナに。2つのパーツで自分だけの機体をつくる、時間制限のない3D消しピンゲーム。

## 遊ぶ

**https://sh0zy.github.io/keshibato-after-school-arena/**

`main` ブランチへ push すると GitHub Actions が自動でビルドし、GitHub Pages へ公開します。

## 特徴

- **機体カスタマイズ** — ボディ6種＋パーツ20種を組み合わせて自分だけの機体をつくる
- **3D物理演算** — Rapier による剛体シミュレーションで、はじき合いのリアルな挙動を再現
- **ステージエディタ** — 机の上の小物（本・定規・シーソーなど）を配置して自作ステージをつくる
- **コレクション** — バトルで解放されるパーツを集める
- **効果音・BGM** — スクリプト生成した WAV アセットを同梱

## 技術スタック

| 領域 | 使用技術 |
| --- | --- |
| UI | React 19 / TypeScript |
| 3D描画 | three.js |
| 物理 | @dimforge/rapier3d-compat |
| ビルド | Vite 7 |
| テスト | Vitest（単体）/ Playwright（ブラウザ） |

## セットアップ

```bash
npm install
npm run dev      # 開発サーバー起動
npm run build    # 型チェック + 本番ビルド
npm run preview  # ビルド結果のプレビュー
npm test         # 物理演算の単体テスト
```

## ディレクトリ構成

```
src/
  components/    画面コンポーネント（バトル / 工房 / セットアップ / ステージエディタ / コレクション）
  game/          ゲームロジック（物理・シーン・AI・オーディオ・カタログ・セーブ）
public/
  models/        機体・パーツ・小物の glTF モデル
  icons/         カタログ用アイコン画像
  audio/         効果音・BGM
  textures/      テクスチャ
assets/source/   Blender ソースファイル・アセット一覧
scripts/         モデル / オーディオの生成スクリプト（Python）
tests/           Playwright によるブラウザテスト
docs/            設計メモ・実装プラン
```

## アセット生成

3Dモデルとオーディオはスクリプトから生成しています。

```bash
python scripts/generate_assets.py   # Blender 経由で glTF を出力
python scripts/generate_audio.py    # 効果音・BGM の WAV を生成
```
