#!/usr/bin/env bash
# WW-159 本地冒烟：squash-bumps（须在含 git 的环境运行）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm run build -s

WS="$(mktemp -d)"
trap 'rm -rf "$WS"' EXIT

mkdir -p "$WS/fixture-a" "$WS/fixture-b"
echo '# marker' > "$WS/bulk-pull-repos.sh"
chmod +x "$WS/bulk-pull-repos.sh"

init_repo() {
  local d="$1"
  git -C "$d" init -b main -q
  git -C "$d" config user.email smoke@test
  git -C "$d" config user.name smoke
  echo 1 > "$d/f.txt"
  git -C "$d" add f.txt
  git -C "$d" commit -qm init
}

init_repo "$WS/fixture-a"
init_repo "$WS/fixture-b"

bump_twice() {
  local d="$1"
  echo 2 > "$d/f.txt"
  git -C "$d" add f.txt
  git -C "$d" commit -qm 'chore(deps): bump framework_sdk_worker to 0.1.0'
  echo 3 > "$d/f.txt"
  git -C "$d" add f.txt
  git -C "$d" commit -qm 'chore(deps): bump framework_sdk_worker to 0.1.1'
}

bump_twice "$WS/fixture-a"
export WW_WORKSPACE_ROOT="$WS"

portal() {
  node --input-type=module -e "
import { registerWorkspaceTools, runPortal } from './dist/index.js';
registerWorkspaceTools();
const argv = JSON.parse(process.env.PORTAL_ARGV);
const chunks = [];
const stdout = { write: (c) => { chunks.push(String(c)); return true; } };
const r = await runPortal({ argv, noExit: true, stdout, stderr: process.stderr });
process.stdout.write(chunks.join(''));
process.exit(r.meta.exit_code);
" 
}

run_portal() {
  export PORTAL_ARGV="$(node -e "console.log(JSON.stringify(process.argv.slice(1)))" -- "$@")"
  export PORTAL_PRINT=1
  portal
}

run_portal_json() {
  export PORTAL_ARGV="$(node -e "console.log(JSON.stringify(process.argv.slice(1)))" -- "$@")"
  unset PORTAL_PRINT
  portal
}

echo "== 1) dry-run lists 2 bumps =="
out="$(run_portal_json wt squash-bumps --json)"
echo "$out" | grep -q fixture-a
echo "$out" | grep -q 'chore(deps): bump framework_sdk_worker to 0.1.1'

echo "== 2) apply squashes to 1 =="
run_portal wt squash-bumps --apply --json >/dev/null
count="$(git -C "$WS/fixture-a" rev-list --count HEAD)"
[[ "$count" -eq 2 ]]
subj="$(git -C "$WS/fixture-a" log -1 --format=%s)"
[[ "$subj" == chore\(deps\):* ]]

echo "== 3) business commit / single bump skip =="
bump_twice "$WS/fixture-b"
echo biz > "$WS/fixture-b/f.txt"
git -C "$WS/fixture-b" add f.txt
git -C "$WS/fixture-b" commit -qm 'feat: business'
echo 4 > "$WS/fixture-b/f.txt"
git -C "$WS/fixture-b" add f.txt
git -C "$WS/fixture-b" commit -qm 'chore(deps): bump framework_sdk_worker to 0.2.0'
out="$(run_portal_json wt squash-bumps --json)"
echo "$out" | grep -q 'only one unpushed bump'

echo "== 4) dirty worktree skip =="
bump_twice "$WS/fixture-a"
echo dirty > "$WS/fixture-a/untracked.txt"
out="$(run_portal_json wt squash-bumps --json)"
echo "$out" | grep -q 'dirty worktree'

echo "== 5) pull unchanged =="
run_portal_json wt run pull --json | grep -q '"exitCode":0'

echo "SMOKE OK"
