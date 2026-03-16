# RAGE File Viewer — 開発ガイド

## プロジェクト概要

GTA V / FiveM の RAGE エンジンバイナリファイルをブラウザ上で解析・プレビューする Web アプリ。

## 技術スタック

- React + TypeScript + Vite
- Tailwind CSS v4 (`@tailwindcss/vite`)
- pako (deflate 展開)
- fflate (ZIP 生成)
- pnpm (NixOS: `nix-shell` で利用可能)

## 開発コマンド

```bash
nix-shell              # 開発環境(nodejs + pnpm)
pnpm dev               # 開発サーバー起動
pnpm build             # プロダクションビルド (tsc + vite build)
npx tsc --noEmit       # 型チェックのみ
```

## 対応フォーマット

| 拡張子 | 形式 | パーサー |
|--------|------|----------|
| .ytd | RSC7 (version 13) | テクスチャ辞書。BCn デコード → Canvas 描画 |
| .ydr | RSC7 (version 165) | 3Dモデル。ジオメトリ抽出 → WebGL ワイヤーフレーム |
| .ybn | RSC7 (version 43) | コリジョン境界。AABB ビジュアライゼーション |
| .ymap | RSC7 (version 2, PSO) / XML | マップエンティティ配置。テーブル + 2D マップ |
| .ytyp | RSC7 (version 2, PSO) / XML | アーキタイプ定義。テーブル表示 |
| .ymt | RSC7 (version 2, PSO) / XML | メタデータ。フィールドテーブル / XML 表示 |
| .rpf | RPF7 (OPEN/暗号なし) | アーカイブ。ツリー表示・ファイル抽出・ネスト RPF・ZIP DL |

## アーキテクチャ

```
src/lib/        バイナリ解析
  rsc7.ts         RSC7 ヘッダー + deflate 展開（全 RSC7 形式で共有）
  pointer.ts      RAGE ポインタ解決 (0x5X=system, 0x6X=graphics) + BinaryReader
  texture-dict.ts TextureDictionary パーサー (YTD)
  dds-decode.ts   BCn テクスチャデコーダー (BC1-BC7 + 非圧縮)
  rpf-parser.ts   RPF7 パーサー（24-bit フィールド解析、リソース/バイナリ判別）
  ymap-parser.ts  YMAP パーサー (XML + PSO パターンスキャン)
  ytyp-parser.ts  YTYP パーサー (XML)
  ydr-parser.ts   YDR Drawable パーサー
  ybn-parser.ts   YBN Bounds パーサー
  ymt-parser.ts   YMT Meta パーサー (XML + PSO)
  ytd-parser.ts   YTD オーケストレーター
  types.ts        共通型定義・フォーマット enum

src/components/ UI コンポーネント
  DropZone.tsx    ファイル D&D + クリック選択
  TextureGrid.tsx サムネイルグリッド (YTD)
  TextureDetail.tsx テクスチャ詳細 + PNG DL (YTD)
  TextureCanvas.tsx Canvas レンダリング (YTD)
  YMAPViewer.tsx  エンティティテーブル + 2D マップ
  YTYPViewer.tsx  アーキタイプテーブル
  YDRViewer.tsx   WebGL 3D ビューア
  YBNViewer.tsx   Bounds ビジュアライザー
  YMTViewer.tsx   メタデータテーブル / XML ビューア
  RPFViewer.tsx   ツリー + プレビュー + ZIP DL
```

## RPF7 エントリフォーマット (実装で確認済み)

エントリ 16 bytes:
- **ディレクトリ**: `v1 === 0x7FFFFF00` で判定。`v2`=childStart, `v3`=childCount
- **バイナリファイル**: `bytes[7] bit7 = 0`。`bytes[2:4]`=圧縮サイズ(24bit)、`bytes[5:7]`=ブロックオフセット(24bit, *512)、`bytes[8:11]`=非圧縮サイズ。圧縮データは `pako.inflateRaw`
- **リソースファイル**: `bytes[7] bit7 = 1`。`bytes[5:7] & 0x7FFFFF`=ブロックオフセット(*512)、`bytes[8:11]`=systemFlags、`bytes[12:15]`=graphicsFlags

## 重要な実装ノート

- RSC7 version=2 (ymap/ytyp/ymt) は PSO フォーマット。RAGE ポインタベースではない
- PSO 内の CEntityDef は position+rotation+scale のパターンマッチで検出
- YTD の Texture 構造体: Width=0x50, Height=0x52, Format=0x58, DataPointer=0x70
- RPF の OPEN 暗号化タグ: `0x4E45504F` ("OPEN" LE)
