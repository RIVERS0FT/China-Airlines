#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

read -r command deploy_id expected_sha archive_sha extra <<< "${SSH_ORIGINAL_COMMAND:-}"
if [[ "$command" == check && -z "${deploy_id:-}" ]]; then
  [[ "$(id -un)" == deploy ]] || exit 1
  printf 'china-airlines-production-ready\n'
  exit 0
fi
[[ "$command" == publish && -z "${extra:-}" ]] || exit 1
[[ "$expected_sha" =~ ^[0-9a-f]{40}$ ]] || exit 1
[[ "$deploy_id" =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ && "$deploy_id" == "$expected_sha-"* ]] || exit 1
[[ "$archive_sha" =~ ^[0-9a-f]{64}$ ]] || exit 1
[[ "$(id -un)" == deploy ]] || exit 1

readonly incoming_root=/var/www/riversoft-games/incoming
readonly incoming_dir="$incoming_root/$deploy_id"
[[ -d "$incoming_root" && ! -L "$incoming_root" && "$(readlink -f "$incoming_root")" == "$incoming_root" ]] || exit 1
[[ ! -e "$incoming_dir" ]] || exit 1
install -d -m 700 "$incoming_dir"
timeout 180 dd bs=1M count=100 iflag=fullblock status=none of="$incoming_dir/china-airlines.tgz"
[[ "$(sha256sum "$incoming_dir/china-airlines.tgz" | cut -d' ' -f1)" == "$archive_sha" ]] || exit 1
printf '%s  china-airlines.tgz\n' "$archive_sha" > "$incoming_dir/china-airlines.tgz.sha256"
exec /usr/local/libexec/china-airlines-production-release "$incoming_dir" "$deploy_id" "$expected_sha"
