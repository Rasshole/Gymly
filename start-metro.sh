#!/bin/bash
export PATH="$HOME/.local/bin:$HOME/.gem/ruby/2.6.0/bin:$PATH"
export RUBYOPT="-r/usr/lib/ruby/2.6.0/logger"
cd /Volumes/Kozy/BUSINESS/GYMLY/GITHUB_REPO/Gymly
npm start 2>&1

