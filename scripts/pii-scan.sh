#!/usr/bin/env bash
# Blocks personal data (emails, phone numbers, dates of birth) from being
# committed or published. Matches are reported by file:line and category only;
# the matched value is never printed.
#
# Usage:
#   scripts/pii-scan.sh --staged   # files staged for commit (pre-commit hook)
#   scripts/pii-scan.sh --all      # every tracked or committable file (CI)
#   scripts/pii-scan.sh --dir DIR  # every file under DIR (e.g. build output)
set -euo pipefail

mode="${1:---all}"
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$root"

EMAIL_RE='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
# Allowed addresses: GitHub noreply, reserved example domains, SSH remotes,
# and commit co-author trailers.
EMAIL_ALLOW_RE='(@users\.noreply\.github\.com|@example\.(com|org|net)|^git@github\.com|^noreply@anthropic\.com)$'
PHONE_RE='(\+?[0-9]{1,3}[ .-]?)?\(?[0-9]{3}\)?[ .-][0-9]{3}[ .-][0-9]{4}'
DOB_RE='(date of birth|d\.?o\.?b\.?|born( on)?)[^A-Za-z0-9]{0,5}([0-9]{1,4}[-/. ][0-9]{1,2}|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[ .,]+[0-9])'

# Exact values from the local private file, when present (never in CI).
private_file="resume/private/contact.tex"
private_emails=""
private_digits=""
if [[ -f "$private_file" ]]; then
  private_emails="$(grep -oE "$EMAIL_RE" "$private_file" | sort -u || true)"
  private_digits="$(grep -oE '\+?[0-9][0-9 ().-]{8,}[0-9]' "$private_file" | tr -cd '0-9\n' | sed -E 's/.*([0-9]{10})$/\1/' | sort -u || true)"
fi

list_files() {
  case "$mode" in
    --staged) git diff --cached --name-only --diff-filter=ACMR -z ;;
    --all)    git ls-files -z --cached --others --exclude-standard ;;
    --dir)    find "${2:?--dir needs a path}" -type f -print0 ;;
    *) echo "unknown mode: $mode" >&2; exit 2 ;;
  esac
}

read_file() {
  if [[ "$mode" == "--staged" ]]; then git show ":$1"; else cat -- "$1"; fi
}

# The scanner's own patterns would match themselves.
SELF="scripts/pii-scan.sh"

findings=0
report() { echo "  PII [$2] $1:$3"; findings=$((findings + 1)); }

while IFS= read -r -d '' f; do
  [[ "$f" == "$SELF" ]] && continue
  content="$(read_file "$f" 2>/dev/null)" || continue
  # Skip binary files.
  printf '%s' "$content" | grep -qI . || continue

  while IFS=: read -r line match; do
    [[ -z "$line" ]] && continue
    printf '%s' "$match" | grep -qiE "$EMAIL_ALLOW_RE" && continue
    report "$f" email "$line"
  done < <(printf '%s\n' "$content" | grep -noE "$EMAIL_RE" || true)

  while IFS=: read -r line _; do
    [[ -n "$line" ]] && report "$f" phone "$line"
  done < <(printf '%s\n' "$content" | grep -noE "$PHONE_RE" || true)

  while IFS=: read -r line _; do
    [[ -n "$line" ]] && report "$f" date-of-birth "$line"
  done < <(printf '%s\n' "$content" | grep -noiE "$DOB_RE" || true)

  for e in $private_emails; do
    while IFS=: read -r line _; do
      [[ -n "$line" ]] && report "$f" private-email "$line"
    done < <(printf '%s\n' "$content" | grep -noiF "$e" || true)
  done

  # Catch the private phone number even when written with other separators.
  for d in $private_digits; do
    printf '%s' "$content" | tr -cd '0-9' | grep -qF "$d" && report "$f" private-phone "?"
  done
done < <(list_files "$@")

if (( findings > 0 )); then
  echo "pii-scan: $findings finding(s). Move personal data to resume/private/ or remove it." >&2
  exit 1
fi
echo "pii-scan: clean ($mode)"
