# Testing & Automation Rules

## Never Run Browser Subagent Without Explicit Permission
- **Do not run browser automation (`browser_subagent`)**: The user tests the browser interface directly themselves.
- The agent does not have access to private manager credentials and sessions, so running browser automation on authenticated pages or test flows is forbidden unless explicitly commanded by the user.
- **Verification Strategy**: Always verify changes statically using:
  1. Node.js syntax/AST validation (`node -c`, `node --eval`).
  2. Static Jekyll build (`bundle exec jekyll build`).
  3. Grep and code inspection for contract integrity and edge cases.
