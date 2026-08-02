# Run 1 v4 — Evidence Report

## 1. Task overview
Capture BEFORE/AFTER visual diffs of the Anatome application (home, playground, docs pages) using Playwright with Chromium, falling back to HTTP-only capture if Chromium is not available.

## 2. Chromium/Playwright discovery
- **Result**: No Chromium browser binary is pre-installed on this system.
- `which chromium` → command not found
- `which google-chrome` → command not found
- `find / -name chrome -type f` → no results
- `ls ~/.cache/ms-playwright/` → directory does not exist
- `npx playwright --version` → 1.60.0 (tool available, but no browsers installed)
- Python playwright (1.39.0) reports executable_path of `/home/openhands/.cache/ms-playwright/chromium-1084/chrome-linux/chrome` but the file does not exist on disk.
- Full details in `discovery.txt`.

## 3. Fallback: HTTP-only capture
Since no Chromium binary was available, the capture script fell back to HTTP-only mode:
- A Python SPA server (`capture.py`) was used to serve the static build.
- All three pages (home, playground, docs) were captured via `curl` and saved as `.html` files.
- The server correctly handled SPA client-side routing.
- Before and after files were captured at separate build timestamps, showing different asset hashes.

### BEFORE captures:
- `experiments/run1v4/before/home.html` — 1604 bytes
- `experiments/run1v4/before/playground.html` — 1604 bytes
- `experiments/run1v4/before/docs.html` — 1604 bytes

### AFTER captures:
- `experiments/run1v4/after/home.html` — 1604 bytes
- `experiments/run1v4/after/playground.html` — 1604 bytes
- `experiments/run1v4/after/docs.html` — 1604 bytes

## 4. Negative finding documentation
**Finding**: Chromium is NOT bundled or pre-installed in the runtime image despite PR #3's evidence suggesting otherwise.
- The Python playwright package lists a Chromium executable path, but the binary is missing.
- No Playwright browser cache directories exist under `/home/openhands/.cache/` or `/ms-playwright/`.
- The `npx playwright install` command would download Chromium but this is explicitly forbidden by the task spec (and would cause memory pressure on this 4GB system with no swap).
- **Workaround**: HTTP-only fallback was successful. All pages were captured as static HTML. For true visual diffs, a future run should use a pre-baked Docker image with Chromium installed (e.g., `mcr.microsoft.com/playwright`).

## 5. Files produced
```
experiments/run1v4/
├── before/
│   ├── home.html
│   ├── playground.html
│   └── docs.html
├── after/
│   ├── home.html
│   ├── playground.html
│   └── docs.html
├── capture.py          # Helper script for SPA-aware HTTP capture
├── discovery.txt       # Browser binary search results
└── EVIDENCE.md         # This file
```
