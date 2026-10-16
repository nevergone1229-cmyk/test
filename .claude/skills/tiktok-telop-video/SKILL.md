---
name: tiktok-telop-video
description: TikTok用の縦型テロップ動画を作るワークフロー。ユーザーがチャットに動画・画像素材(mov/mp4/jpg/png)と台本を添付したとき、素材解析→テロップごとの素材選定→順番調整→1080×1920レンダリングを進める。「台本修正」「素材を入れ替え」「レンダリングして」などの続きの依頼にも使う。
---

# TikTokテロップ動画ワークフロー

素材と台本から、テロップ付きの縦型動画を作る。流れは
**解析 → 候補提示 → ユーザー確認 → レンダリング** で、確認なしにレンダリングしない。
`data/test01/` が完成済みの見本(承認済みの設定)。

## 0. 新しいセッションの準備

```bash
npm ci   # node_modules が無いとき
```

- 素材はチャットの添付として `/root/.claude/uploads/<セッションID>/` に
  `<8桁hex>-<元のファイル名>` の名前で届く。このディレクトリを「素材ディレクトリ」として使う。
- Codex は任意(セカンドオピニオン用)。使うときだけ:
  `npm install -g @openai/codex` → `env -u OPENAI_API_KEY codex login --device-auth`
  (ユーザーにURLとコードを伝えてブラウザで承認してもらう。コードは15分で切れる)。
  **OPENAI_API_KEY は使わない**(Codexコマンドは必ず `env -u OPENAI_API_KEY` を付ける)。

## 1. プロジェクトを作る

- ID は `test02` のように、`data/` に無い次の番号にする(ユーザー指定があればそれ)。
- 台本を `data/<id>/script.txt` に保存する。1行1テロップ。読点などで分けるか迷うときはユーザーに確認する。

## 2. 素材を解析する(Claudeが担当)

```bash
npm run analyze -- <id> <素材ディレクトリ>
```

- `data/<id>/assets.json` と、素材ごとのコンタクトシート `work/<id>/sheets/<素材ID>.jpg`
  (動画は1秒ごと・経過時間入り、HDRは色補正済み、画像はEXIFの回転を反映)ができる。
- シートを Read で見て、各素材の `segments` を埋める。内容が変わるところで区切る。
  `sceneChanges`(カットの秒数)も参考にする。
  - 動画: `{ "id": "A", "start": 0, "end": 5, "description": "...", "tags": [...] }`
  - 画像: `{ "id": "P", "description": "...", "tags": [...] }`(start/end なし)
  - 区間IDはプロジェクト内で重複させない(A, B, C… を素材をまたいで通し番号に)。
  - 見えないことは推測しない。油か水かなど判断できないものはユーザーに聞く。
- 区間ごとの表(区間・素材・秒数・内容)をユーザーに見せ、解釈が合っているか確認する。
- 再実行しても、既に書いた `segments` は消えない。

## 3. テロップごとの候補を出す

- `data/<id>/candidates.json` を書く(形式は `data/test01/candidates.json` を参照):
  テロップごとに上位3区間、0〜100のスコア、短い理由。
  同じ区間を複数テロップの1位にしない。合う素材が無いテロップは無理に当てず「要確認」と伝える。
- 1位以外を使う・複数区間をつなぐ・範囲を指定するときは `pick` を使う:
  `"pick": ["B", { "segment": "E", "start": 0, "end": 3 }]`
- 下書きを作る:

```bash
npm run draft -- <id>
```

  `data/<id>/candidates.md`(候補表と下書きの並び)と `data/<id>/timeline.json`(status: draft)ができる。
  動画クリップは初期値で最大4秒、画像は3秒。
- `candidates.md` の内容をユーザーに見せる。
- ユーザーが望む場合や判断が割れる場合だけ、Codex のセカンドオピニオンを取る:

```bash
scripts/codex-second-opinion.sh <id>   # → data/<id>/codex-opinion.md
```

  Claude と Codex の1位が違うテロップは、両方の理由を並べてユーザーに選んでもらう。

## 4. ユーザーの指示で調整する

`data/<id>/timeline.json` を直接編集する。例:

| 指示 | 編集内容 |
|---|---|
| 「T1はB→Eの順で」 | T1 の `clips` を B, E の順に |
| 「3番目と4番目を入れ替え」 | 見た目の順番で数える(1本の動画に動きが2つあれば2ショットと数えることがある)。テロップをクリップに付けたままにするか、時間を固定するか迷うときは確認する |
| 「Bのテロップを〇〇に」 | そのクリップを含むテロップの `text` を変更(他のテロップは変えない) |
| 「Eは3秒だけ」 | クリップの `start` / `end` を変更 |

- 調整後の並び(時間・クリップ・テロップ)を表で見せる。
- 確定したら `timeline.json` の `status` を `"confirmed"` にする。
  `npm run draft` は確定済みの timeline を `--force` なしでは上書きしない。

## 4b. ナレーションを作る(ユーザーが頼んだときだけ)

timeline を確定してから行う。

```bash
npm run narrate -- <id>   # GEMINI_API_KEY が必要
```

- `timeline.json` のテロップごとに、その `text` を標準ナレーション音声(下の「固定の設定」)で読み上げる。
  音声の前後の無音は切り詰める(TTSが数十秒の無音を付けて返すことがあるため)。
- 出力: `work/<id>/narration/<テロップID>.wav` と、テロップ・秒数・使った声の一覧 `data/<id>/narration.json`。
  実行のたびに全テロップを作り直す。テロップの文言を変えたら必ず再実行する
  (古いナレーションのままだと render が止まる)。
- 最後に、ナレーションに合わせて render が延ばすテロップを表示する。これをユーザーに見せる。
- 別の声を使うのはユーザーが指定したときだけ。APIキーは出力しない。

## 5. レンダリングする(ユーザーが頼んだときだけ)

```bash
npm run render -- <id> <素材ディレクトリ>
```

- status が confirmed でないと止まる(意図どおり)。
- `data/<id>/narration.json` があれば、ナレーションを自動で合成する:
  - 各テロップのナレーションは、テロップが出てから0.2秒後に始まる。
  - ナレーションが流れている間は、元動画の音量を0.25倍(約−12dB)に下げる(0.2秒かけて上げ下げ)。消音はしない。
  - 前後の余白(0.2秒＋0.4秒)を含めてナレーションがテロップの尺に収まらないときは、そのテロップの最後のクリップを延ばす。
    画像は表示を延ばし、動画は素材の続きを使い、素材の終わりまで来たら最後のコマで止める(`hold`、その間の元音声は無音)。
    クリップを短くすることはない。
  - `timeline.json` 自体は書き換えない。実際に使った並びは `work/<id>/timeline.fitted.json`。
- ナレーションを入れたくないときは `data/<id>/narration.json` を消してから render する。
- 出力: `out/<id>.mp4` と、各クリップ中央のコマを並べた `out/<id>-check.jpg`。
- `out/<id>-check.jpg` を Read で見て、順番・テロップ・色を確認してから、
  `out/<id>.mp4` を SendUserFile(display: render)で渡す。
- Remotion が出す「Memory reported by CGroup…」の警告は無害。

## 6. 保存する

- `data/<id>/`(script.txt, assets.json, candidates.json, candidates.md, timeline.json,
  あれば codex-opinion.md, narration.json)をコミットして、指定ブランチに push する。
- 素材・`public/<id>/`・`work/`・`out/` は Git に入れない(.gitignore 済み)。

## 固定の設定(ユーザーが変更を頼まない限り変えない)

test01 で承認された設定。変更するときは下の「回帰チェック」を必ず行う。

| 項目 | 値 | 場所 |
|---|---|---|
| 画面 | 1080×1920、30fps | `scripts/lib/project.mjs` の `DEFAULT_VIDEO` |
| テロップ | 画面中央、白文字＋黒縁(14px)、IPAゴシック太字76pxで全テロップ同じ大きさ。入らない行は文節の切れ目で折り返す。句読点は表示しない(空白にする) | `src/TelopVideo.tsx` |
| 音声 | 元動画の音声を残す。BGMなし。音声の無いクリップには無音トラック | `scripts/prepare.mjs` |
| ナレーションの合成 | テロップ表示の0.2秒後に開始、後ろに0.4秒の余白。ナレーション中は元音声を0.25倍(0.2秒で上げ下げ) | `DEFAULT_NARRATION`, `src/TelopVideo.tsx`, `scripts/lib/narration.mjs` |
| ナレーション音声 | `voice_7vk8m4sbxbks`(ユーザー本人の複製音声、ja-JP)、`gemini-3.8-flash-tts`、1.2倍速 | `scripts/lib/project.mjs` の `DEFAULT_NARRATION` |
| 色 | HDR(HLG/PQ)素材は SDR BT.709 にトーンマッピング | `scripts/lib/project.mjs` の `TONEMAP` |
| 画像 | 3秒表示、画面いっぱいに切り抜き、EXIFの回転を反映 | `DEFAULT_IMAGE_SECONDS`, `prepare.mjs` |
| 動画クリップの初期長さ | 最大4秒 | `DEFAULT_MAX_CLIP_SECONDS` |
| ブラウザ | 同梱の headless shell(Remotion の Chrome ダウンロードはこの環境で遮断) | `scripts/render.mjs` |

## 回帰チェック(描画・下準備のコードを変えたとき)

test01 の素材が手元にあるときに行う。変更前の `out/test01.mp4` を `work/test01-baseline.mp4` に
コピーしてから、変更後に再レンダリングして比較する:

```bash
npm test   # 型チェック + 単体テスト + 全 timeline.json の検証
npm run render -- test01 <test01の素材ディレクトリ>
ffmpeg -i out/test01.mp4 -i work/test01-baseline.mp4 -lavfi "[0:v][1:v]ssim" -f null - 2>&1 | grep SSIM
```

意図した変更でないのに SSIM が 1.000 から下がったら、承認済みの見た目が変わっている。
