#!/usr/bin/env bash
# Optional: ask Codex (ChatGPT login) to rank clips for each telop independently,
# as a second opinion on Claude's candidates.json.
# Usage: scripts/codex-second-opinion.sh <project id>
# Writes data/<id>/codex-opinion.md. Requires `codex login --device-auth` first.
set -euo pipefail

ID=${1:?usage: $0 <project id>}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DATA="$ROOT/data/$ID"
SHEETS="$ROOT/work/$ID/sheets"

command -v codex >/dev/null || { echo "codex is not installed: npm install -g @openai/codex" >&2; exit 1; }
# Never fall back to the API key; this should run on the ChatGPT login.
env -u OPENAI_API_KEY codex login status >/dev/null 2>&1 || {
  echo "codex is not logged in: env -u OPENAI_API_KEY codex login --device-auth" >&2; exit 1; }

images=()
for sheet in "$SHEETS"/*.jpg; do images+=(-i "$sheet"); done

prompt="TikTok動画のテロップごとに最適な素材区間を選ぶセカンドオピニオンをください。
添付画像は素材ごとのコンタクトシート(動画は1秒ごと、各コマ左上に経過時間)です。
素材区間の一覧(assets.json):
$(cat "$DATA/assets.json")

テロップと、Claudeが出した候補(candidates.json):
$(cat "$DATA/candidates.json")

各テロップについて、あなた自身の上位3区間を0〜100のスコアと理由付きで選び、
Claudeの1位と違う場合はその理由を書いてください。見えないことは推測しない。
出力はMarkdown表(列: テロップ, 順位, 区間, スコア, 理由)と、最後に注意点を3行以内。"

cd "$ROOT"
env -u OPENAI_API_KEY codex exec --skip-git-repo-check -s read-only "${images[@]}" \
  -o "$DATA/codex-opinion.md" "$prompt" >/dev/null
echo "wrote $DATA/codex-opinion.md"
