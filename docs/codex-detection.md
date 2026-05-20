# Codex Detection

The app uses local Codex only. It does not call a cloud Codex or GPT API.

Detection order:

1. `CODEX_BIN` from `.env.local`
2. macOS: `/Applications/Codex.app/Contents/Resources/codex`
3. Windows:
   - `%LOCALAPPDATA%\Programs\Codex\codex.exe`
   - `%PROGRAMFILES%\Codex\codex.exe`
   - `%PROGRAMFILES(X86)%\Codex\codex.exe`
4. `codex` from the system path

The health check runs:

```bash
codex --version
```

If Codex is detected, the dashboard shows the binary path. If not, it shows:

```text
Codex was not found. Please install Codex or set CODEX_BIN in your .env.local file.
```

## Background Operator

Chat requests run local Codex from the project root with a read-only sandbox:

```bash
codex --search --ask-for-approval never exec \
  -C <projectRoot> \
  --sandbox read-only \
  --skip-git-repo-check \
  --output-last-message <outputFile> \
  -
```

If `--search` is unsupported or fails, the app retries without `--search`.

Prompts are written to `artifacts/codex-operators`, and completed responses are cached in `artifacts/cache`. These generated files are ignored by Git.
