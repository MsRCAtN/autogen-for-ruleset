#!/bin/bash

# Navigate to the script's directory (and thus the project root)
cd "$(dirname "$0")"

echo "Updating repository from GitHub..."
# Attempt to pull latest changes. If there are local changes, this might fail.
# Consider adding 'git stash' and 'git stash pop' if local modifications are common and should be preserved.
git pull origin main # Or your default branch

if [ $? -ne 0 ]; then
  echo "Error: Failed to pull from GitHub. Please check for conflicts or local changes."
  exit 1
fi

echo "Generating full config.yaml..."
node server/generateConfig.js \
  --base_file ./templates/base.yaml \
  --servers_file ./config/servers.json \
  --processed_rules_file ./output/generated_rules.txt \
  --output_file ./output/config.yaml

if [ $? -eq 0 ]; then
  echo "config.yaml generated successfully at ./output/config.yaml"
else
  echo "Error: Failed to generate config.yaml"
  exit 1
fi

exit 0
