# RAGE File Viewer

GTA V / FiveM の RAGE エンジンバイナリファイルをブラウザ上で解析・プレビューする Web アプリケーション。

ファイルをドラッグ&ドロップするだけで中身を確認できます。サーバーへのアップロードは一切行わず、すべてブラウザ内で処理します。

## 対応フォーマット

| 形式 | 説明 | 機能 |
|------|------|------|
| `.ytd` | Texture Dictionary | テクスチャサムネイル一覧、フル解像度プレビュー、PNG ダウンロード |
| `.ydr` | Drawable (3D Model) | WebGL ワイヤーフレームビューア、メッシュメタデータ表示 |
| `.ybn` | Bounds (Collision) | バウンディングボックス可視化、子 Bound テーブル |
| `.ymap` | Map Data | エンティティ一覧テーブル、2D ミニマップ、検索・ソート |
| `.ytyp` | Type Data | アーキタイプ定義テーブル、詳細メタデータ |
| `.ymt` | Meta Data | フィールドテーブル、XML ビュー |
| `.rpf` | RPF Archive | ディレクトリツリー、ネスト RPF 展開、ファイルプレビュー、ZIP 一括ダウンロード |

## テクスチャデコード対応

BC1 (DXT1) / BC2 (DXT3) / BC3 (DXT5) / BC4 (ATI1) / BC5 (ATI2) / BC7 / A8R8G8B8 / A8B8G8R8 / A1R5G5B5 / L8 / A8

## セットアップ

```bash
# NixOS
nix-shell
pnpm install
pnpm dev

# その他
pnpm install
pnpm dev
```

## ビルド

```bash
pnpm build    # dist/ に出力
pnpm preview  # ビルド結果をプレビュー
```

## 技術スタック

- React + TypeScript + Vite
- Tailwind CSS v4
- pako (deflate)
- fflate (ZIP)
- WebGL (3D ビューア)
- Canvas 2D (テクスチャレンダリング)

## 制限事項

- 暗号化された RPF ファイル (AES/NG) は非対応
- YDR のジオメトリ抽出は一部のモデルで正しく動作しない可能性あり
- YMAP/YTYP のバイナリ (PSO) 形式はヒューリスティック解析のため、一部データが欠落する場合あり
- FiveM で一般的な XML 形式の YMAP/YTYP は完全サポート

## ライセンス

MIT
