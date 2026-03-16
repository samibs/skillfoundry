# STORY-002: Homebrew Formula + curl|bash Installer

**Phase:** A — Distribution
**PRD:** phase1-make-it-reachable
**Priority:** MUST
**Effort:** M
**Dependencies:** STORY-001 (release workflow must exist so published versions are available)
**Affects:** FR-002, FR-003, US-001, US-002

---

## Description

Create a Homebrew tap formula for macOS installation and a curl-pipe-bash installer script for Linux/macOS. Both install the `skillfoundry` CLI globally via npm under the hood.

---

## Scope

### Files to create:
- `homebrew/skillfoundry.rb` — Homebrew formula (to be copied to the `samibs/homebrew-tap` repo)
- `scripts/install-global.sh` — The curl-pipe-bash script, also hosted at a raw GitHub URL

### Files to modify:
- `README.md` — add Homebrew and curl install instructions to the Quick Start section

### External prerequisites:
- GitHub repo `samibs/homebrew-tap` must exist (create if missing)

---

## Technical Approach

### Homebrew Formula: `homebrew/skillfoundry.rb`

```ruby
class Skillfoundry < Formula
  desc "AI engineering framework — quality gates your AI can't skip"
  homepage "https://github.com/samibs/skillfoundry"
  url "https://registry.npmjs.org/skillfoundry/-/skillfoundry-2.0.51.tgz"
  sha256 "REPLACE_WITH_ACTUAL_SHA256"
  license "MIT"

  depends_on "node@20"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/skillfoundry --version")
  end
end
```

**Key decisions:**
1. **`depends_on "node@20"`**: Ensures Node.js 20+ is available. Homebrew handles the dependency.
2. **`std_npm_args`**: Uses Homebrew's standard npm install pattern which installs to libexec.
3. **`test do` block**: Required by `brew audit --strict`. Verifies the CLI starts and prints the correct version.
4. **sha256**: Computed from the npm tarball. Must be updated on each release (automate in release workflow later).

### Formula update automation:

Add a step to the release workflow (`.github/workflows/release.yml`) that updates the formula version and SHA after npm publish:

```yaml
- name: Update Homebrew formula
  if: "!contains(github.ref_name, '-')"  # Skip prereleases
  run: |
    TAG_VERSION="${GITHUB_REF_NAME#v}"
    SHA=$(curl -sL "https://registry.npmjs.org/skillfoundry/-/skillfoundry-${TAG_VERSION}.tgz" | shasum -a 256 | cut -d' ' -f1)
    # Clone tap repo, update formula, push
    git clone https://x-access-token:${{ secrets.TAP_TOKEN }}@github.com/samibs/homebrew-tap.git /tmp/tap
    sed -i "s|url \".*\"|url \"https://registry.npmjs.org/skillfoundry/-/skillfoundry-${TAG_VERSION}.tgz\"|" /tmp/tap/Formula/skillfoundry.rb
    sed -i "s|sha256 \".*\"|sha256 \"${SHA}\"|" /tmp/tap/Formula/skillfoundry.rb
    cd /tmp/tap
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add Formula/skillfoundry.rb
    git commit -m "Update skillfoundry to ${TAG_VERSION}"
    git push
```

### curl|bash installer: `scripts/install-global.sh`

```bash
#!/bin/bash
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BOLD}SkillFoundry Installer${NC}"
echo "======================"

# Check for Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}Error: Node.js is not installed.${NC}"
  echo "SkillFoundry requires Node.js 20 or later."
  echo "Install from: https://nodejs.org/"
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo -e "${RED}Error: Node.js $NODE_MAJOR detected. Version 20+ required.${NC}"
  exit 1
fi

# Check for npm
if ! command -v npm &> /dev/null; then
  echo -e "${RED}Error: npm is not installed.${NC}"
  exit 1
fi

echo "Node.js $(node --version) detected"
echo "Installing skillfoundry globally..."

npm install -g skillfoundry

echo ""
echo -e "${GREEN}SkillFoundry installed successfully.${NC}"
echo "Run 'skillfoundry --version' to verify."
```

**Key decisions:**
1. **No root/sudo**: `npm install -g` should work without sudo if npm prefix is configured correctly. Script does not add `sudo` — if permissions fail, the user gets a clear npm error.
2. **Version check**: Hard-fails on Node.js < 20 with a human-readable message.
3. **No pipe detection tricks**: Keeps it simple — the script does not try to detect if it is piped or not.
4. **HTTPS only**: The raw GitHub URL uses HTTPS by default.

### README additions:

```markdown
## Install

### npm (recommended)
```bash
npm install -g skillfoundry
```

### Homebrew (macOS)
```bash
brew install samibs/tap/skillfoundry
```

### One-liner (Linux/macOS)
```bash
curl -fsSL https://raw.githubusercontent.com/samibs/skillfoundry/main/scripts/install-global.sh | bash
```

---

## Acceptance Criteria

```gherkin
Scenario: Install via Homebrew on macOS
  Given a macOS machine with Homebrew installed
  When the user runs "brew install samibs/tap/skillfoundry"
  Then the installation completes without errors
  And "skillfoundry --version" prints the current version

Scenario: Homebrew formula passes audit
  Given the formula is in the tap repository
  When "brew audit --strict samibs/tap/skillfoundry" is run
  Then no errors or warnings are reported

Scenario: Install via curl one-liner on Linux
  Given an Ubuntu 22.04+ machine with Node.js 20+ and npm
  When the user runs the curl|bash one-liner
  Then npm installs skillfoundry globally
  And "skillfoundry --version" prints the current version

Scenario: curl installer fails gracefully without Node.js
  Given a machine without Node.js installed
  When the curl|bash one-liner is run
  Then the script prints "Node.js is not installed" and exits with code 1

Scenario: curl installer fails gracefully with old Node.js
  Given a machine with Node.js 18
  When the curl|bash one-liner is run
  Then the script prints "Version 20+ required" and exits with code 1

Scenario: Formula auto-updates on release
  Given a new semver tag is pushed (non-prerelease)
  When the release workflow completes
  Then the homebrew-tap formula is updated with the new version and SHA
```

---

## Security Checklist

- [ ] curl installer uses HTTPS URL only
- [ ] Installer does not run with `sudo`
- [ ] Installer does not write outside of npm's global prefix
- [ ] `TAP_TOKEN` secret stored in GitHub repo settings for formula auto-update
- [ ] Formula SHA256 computed from the actual npm tarball (not guessed)

---

## Testing

- Test Homebrew formula locally with `brew install --build-from-source ./skillfoundry.rb`
- Test curl installer in a Docker container: `docker run -it node:20-slim bash` then run the script
- Test curl installer failure mode with `docker run -it ubuntu:22.04 bash` (no Node.js)
