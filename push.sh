#!/bin/bash

# Add all changes
git add .

# Commit with timestamp
git commit -m "Auto commit: $(date +'%Y-%m-%d %H:%M:%S')"

# Push to the main branch
git push origin main
