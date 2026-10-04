#!/usr/bin/env bash
# Optional: ask Codex (ChatGPT login) to rank clips for each telop independently,
# as a second opinion on Claude's candidates.json.
# Usage: scripts/codex-second-opinion.sh <project id>
# Writes data/<id>/codex-opinion.md. Requires `codex login --device-auth` first.
# CODEX_TIMEOUT (seconds, default 900) limits how long to wait for Codex.
set -euo pipefail

ID=${1:?usage: $0 <project id>}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DATA="$ROOT/data/$ID"
SHEETS="$ROOT/work/$ID/sheets"
TIMEOUT=${CODEX_TIMEOUT:-900}

command -v codex >/dev/null || { echo "codex is not installed: npm install -g @openai/codex" >&2; exit 1; }
# Never fall back to the API key; this should run on the ChatGPT login.
env -u OPENAI_API_KEY codex login status >/dev/null 2>&1 || {
  echo "codex is not logged in: env -u OPENAI_API_KEY codex login --device-auth" >&2; exit 1; }

images=()
for sheet in "$SHEETS"/*.jpg; do images+=(-i "$sheet"); done
[ ${#images[@]} -gt 0 ] || { echo "no contact sheets in $SHEETS; run npm run analyze first" >&2; exit 1; }

# Send a compact summary instead of the raw JSON files so Codex answers quickly.
summary=$(node -e '
const [assetsFile, candidatesFile] = process.argv.slice(1);
const { assets } = require(assetsFile);
const { telops } = require(candidatesFile);
const lines = ["素材区間:"];
for (const [id, a] of Object.entries(assets)) {
  for (const s of a.segments) {
    const range = a.type === "image" ? "画像" : `${s.start}-${s.end}s`;
    lines.push(`- ${s.id}: ${id} ${range} ${s.description}`);
  }
}
lines.push("", "テロップ (Claudeの1位):");
for (const t of telops) lines.push(`- ${t.id} 「${t.text}」 (${t.candidates[0].segment})`);
console.log(lines.join("\n"));
' "$DATA/assets.json" "$DATA/candidates.json")

prompt="TikTok動画のテロップごとに合う素材区間を選ぶセカンドオピニオンをください。
添付画像は素材ごとのコンタクトシート(動画は1秒ごと、各コマ左上に経過時間)です。
ファイルの読み込み、コマンド実行、Web検索は不要です。以下の情報と画像だけで答えてください。

$summary

各テロップについて上位3区間を0〜100のスコアと短い理由付きで選び、
Claudeの1位と違う場合はその理由も書いてください。見えないことは推測しない。
出力はMarkdown表(列: テロップ, 順位, 区間, スコア, 理由)と、最後に注意点を3行以内。"

cd "$ROOT"
timeout "$TIMEOUT" env -u OPENAI_API_KEY codex exec --skip-git-repo-check -s read-only \
  -c model_reasoning_effort=low "${images[@]}" \
  -o "$DATA/codex-opinion.md" "$prompt" >/dev/null || {
  status=$?
  [ $status -eq 124 ] && echo "codex did not answer within ${TIMEOUT}s" >&2
  exit $status
}
echo "wrote $DATA/codex-opinion.md"
