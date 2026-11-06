# Capture a running coding agent

This serves a live Python PTY to an xterm.js terminal over loopback. Playwright records the terminal while Codex is running. It does not reconstruct an agent session from logs.

1. Prepare a disposable Git project with the VGI skill, `BRIEF.md`, and sample inventory. Do not include credentials or private project data.
2. Run `python3 scripts/vgi-live-capture/server.py --project /tmp/vgi-live-demo --output .cache/vgi-live-capture`.
3. In another shell, run `node scripts/vgi-live-capture/record.mjs`. The capture starts before Codex launches.
4. The recorder is the terminal viewer. Forward any setup input (such as an Enter byte for the initial folder trust prompt) to `POST http://127.0.0.1:4348/input`. Do not open a second viewer while filming: terminal device replies are forwarded to the PTY.
5. After the agent finishes and the results remain visible, create `.cache/vgi-live-capture/stop`. The recorder prints the WebM path. Retain that full-speed capture; label cuts and speed changes in exported edits.
6. Stop the recorder/server and their Codex process when finished. Review footage before sharing.

The fixture prompt selects Python for this recording. The website's builder continues to ask the developer to choose a language. The project must have `@xterm/xterm` and Playwright installed. The loopback server is a local capture tool, not a deployable service.

For the committed edit, `render-labels.mjs` makes the speed labels and `edit.py` lists exact source time ranges and playback rates. The full capture is retained; the export manifest records every cut.
