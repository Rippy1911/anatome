#!/usr/bin/env bash
# Cursor-pasteable script to persist OPENROUTER_API_KEY into ns-coder bridge env
# Usage: source ./experiments/run1/set-env.sh
# Or paste the export line into your terminal.

# Export the key for the current shell session
export OPENROUTER_API_KEY="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"

# Persist into ns-coder bridge environment config
NS_CODER_DIR="${HOME}/.ns-coder"
mkdir -p "${NS_CODER_DIR}"

# Write to bridge env file (sourced by ns-coder on startup)
cat > "${NS_CODER_DIR}/bridge.env" << 'EOF'
# ns-coder bridge environment
# Persisted by experiments/run1/set-env.sh
OPENROUTER_API_KEY=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
EOF

echo "OPENROUTER_API_KEY persisted to ${NS_CODER_DIR}/bridge.env"
echo "To activate in current shell: export OPENROUTER_API_KEY=\"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\""