#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

readonly script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$script_dir/china-airlines-server.conf"

artifact_dir="${1:-}"
deploy_id="${2:-}"
expected_sha="${3:-}"
[[ "$expected_sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid game revision' >&2; exit 1; }
[[ "$deploy_id" =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ && "$deploy_id" == "$expected_sha-"* ]] || {
  echo 'Invalid deployment ID' >&2; exit 1;
}
[[ "$(id -un)" == deploy ]] || { echo 'Deployment must run as deploy' >&2; exit 1; }

readonly web_root="$GAME_WEB_ROOT"
readonly releases_root="$GAME_DATA_ROOT/releases"
readonly release_dir="$releases_root/$deploy_id"
readonly live_link="$web_root/china-airlines"
readonly candidate_link="$web_root/.china-airlines-$deploy_id"
[[ -d "$web_root" && ! -L "$web_root" && "$(readlink -f "$web_root")" == "$web_root" ]] || exit 1
[[ -d "$releases_root" && ! -L "$releases_root" && "$(readlink -f "$releases_root")" == "$releases_root" ]] || exit 1
[[ ! -e "$release_dir" && ! -e "$candidate_link" && ! -L "$candidate_link" ]] || exit 1
[[ ! -e "$live_link" || -L "$live_link" ]] || { echo 'Existing game path is not a release link' >&2; exit 1; }
exec 9>"$GAME_DATA_ROOT/deploy.lock"
flock -x 9

previous_release=''
if [[ -L "$live_link" ]]; then
  previous_release="$(readlink -f "$live_link")"
  [[ "$previous_release" == "$releases_root/"* && -d "$previous_release" ]] || {
    echo 'Existing game release is outside its protected directory' >&2; exit 1;
  }
fi

cd "$artifact_dir"
sha256sum --check --strict china-airlines.tgz.sha256
python3 - <<'PY'
import tarfile
with tarfile.open('china-airlines.tgz', 'r:gz') as archive:
    for item in archive:
        name = item.name.removeprefix('./').rstrip('/')
        if name in ('', '.') and item.isdir():
            continue
        if not name or item.name.startswith('/') or any(part in ('', '.', '..') for part in name.split('/')):
            raise SystemExit('Unsafe release archive path')
        if not (item.isfile() or item.isdir()):
            raise SystemExit('Unsupported release archive entry')
PY

install -d -m 755 "$release_dir"
tar -xzf china-airlines.tgz -C "$release_dir" --no-same-owner --no-same-permissions
[[ -f "$release_dir/index.html" && -f "$release_dir/sw.js" && -f "$release_dir/manifest.webmanifest" ]] || exit 1
[[ "$(tr -d '\r\n' < "$release_dir/release.txt")" == "$expected_sha" ]] || exit 1
find "$release_dir" -type d -exec chmod 755 {} +
find "$release_dir" -type f -exec chmod 644 {} +

rollback() {
  local status=$?
  trap - EXIT
  if [[ -L "$candidate_link" ]]; then rm -- "$candidate_link"; fi
  if [[ -n "$previous_release" ]]; then
    ln -s "$previous_release" "$candidate_link.rollback"
    mv -Tf -- "$candidate_link.rollback" "$live_link"
  elif [[ -L "$live_link" && "$(readlink -f "$live_link")" == "$release_dir" ]]; then
    rm -- "$live_link"
  fi
  echo 'Game release failed; the previous public revision was restored.' >&2
  exit "$status"
}

ln -s "$release_dir" "$candidate_link"
trap rollback EXIT
mv -Tf -- "$candidate_link" "$live_link"

for game_file in index.html sw.js manifest.webmanifest release.txt; do
  expected_hash="$(sha256sum "$release_dir/$game_file" | cut -d' ' -f1)"
  live_hash="$(curl --fail --silent --show-error --retry 6 --retry-delay 2 \
    --header 'Cache-Control: no-cache' \
    "$GAME_PUBLIC_URL$game_file?release=$expected_sha" | sha256sum | cut -d' ' -f1)"
  [[ "$live_hash" == "$expected_hash" ]] || {
    echo "Public game file differs: $game_file" >&2; exit 1;
  }
done
trap - EXIT
printf 'Published China Airlines %s at %s\n' "$expected_sha" "$GAME_PUBLIC_URL"
