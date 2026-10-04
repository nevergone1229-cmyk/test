# TikTok telop videos

Remotion project that turns uploaded clips/images and a script into 1080×1920
vertical videos with telops.

```bash
npm ci
npm run analyze -- <id> <materials dir>   # probe + contact sheets → data/<id>/assets.json
npm run draft -- <id>                     # candidates.json → candidates.md + draft timeline.json
npm run render -- <id> <materials dir>    # confirmed timeline.json → out/<id>.mp4
npm run narrate -- <id>                   # script.txt → narration WAVs (voice_7vk8m4sbxbks)
npm test                                  # typecheck + validate every data/*/timeline.json
```

The full workflow, including review checkpoints and the fixed settings, is in
`.claude/skills/tiktok-telop-video/SKILL.md`. `data/test01/` is a finished example.
