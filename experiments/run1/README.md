# Run 1 — Foundation

## Overview
This experiment captures baseline screenshots of the Anatome application and sets up the environment for ns-coder bridge integration.

## Files
- `capture-screenshots.mjs` — Playwright script to capture 3 screenshots (homepage, playground, docs)
- `set-env.sh` — Cursor-pasteable script to persist OPENROUTER_API_KEY into ns-coder bridge env

## Usage

### 1. Build and preview
```bash
npm install
npm run build
npm run preview -- --port 4173 &
```

### 2. Capture screenshots
```bash
TARGET_URL=http://localhost:4173 node experiments/run1/capture-screenshots.mjs
```

### 3. Set environment
```bash
source experiments/run1/set-env.sh
```

## Output
Screenshots are saved to `screenshots/run1/`.