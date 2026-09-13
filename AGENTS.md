# Agent Guidelines for ZeoSpec

## Core Behavioral Constraints
1. **No Browser Automation**: Never run `browser_subagent` or autonomous browser tools without the user's explicit request. The user performs browser testing themselves.
2. **No Em Dashes**: Never use long em dashes (`—` or `&mdash;`) in any code, copywriting, commit messages, documentation, or responses. Use hyphens, commas, or colons instead.
3. **Identity Sequencing**: Always format identity as **Ecosystem Builder, Rotaractor & Entrepreneur** (in this exact sequence).
4. **Verification via Static Analysis**: Validate all JavaScript and Apps Script code using `node -c` and `bundle exec jekyll build`.
