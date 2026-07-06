#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/PuneetGOTO/Ms-Bot-.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/ms-bot}"
INSTALL_DOCKER="${INSTALL_DOCKER:-true}"
START_SERVICES="${START_SERVICES:-true}"
REGISTER_COMMANDS="${REGISTER_COMMANDS:-false}"
NON_INTERACTIVE="${NON_INTERACTIVE:-false}"

SUDO=()
DOCKER_CMD=(docker)

usage() {
  cat <<'USAGE'
Usage: bash scripts/deploy-ubuntu.sh [options]

Options:
  --repo-url URL          Git repository URL. Default: https://github.com/PuneetGOTO/Ms-Bot-.git
  --branch NAME           Git branch to deploy. Default: main
  --app-dir PATH          Install directory. Default: /opt/ms-bot
  --skip-docker           Do not install Docker Engine / Compose plugin
  --no-start              Prepare project and .env, but do not start containers
  --register-commands     Register Discord slash commands after starting bot
  --non-interactive       Do not prompt for Discord credentials
  -h, --help              Show this help

Environment variables with the same names can also be used:
  REPO_URL, BRANCH, APP_DIR, INSTALL_DOCKER, START_SERVICES,
  REGISTER_COMMANDS, NON_INTERACTIVE
USAGE
}

log() {
  printf '\033[1;34m[INFO]\033[0m %s\n' "$*"
}

warn() {
  printf '\033[1;33m[WARN]\033[0m %s\n' "$*"
}

fail() {
  printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2
  exit 1
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo-url)
        REPO_URL="${2:?Missing value for --repo-url}"
        shift 2
        ;;
      --branch)
        BRANCH="${2:?Missing value for --branch}"
        shift 2
        ;;
      --app-dir)
        APP_DIR="${2:?Missing value for --app-dir}"
        shift 2
        ;;
      --skip-docker)
        INSTALL_DOCKER=false
        shift
        ;;
      --no-start)
        START_SERVICES=false
        shift
        ;;
      --register-commands)
        REGISTER_COMMANDS=true
        shift
        ;;
      --non-interactive)
        NON_INTERACTIVE=true
        shift
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        fail "Unknown option: $1"
        ;;
    esac
  done
}

setup_sudo() {
  if [[ "${EUID}" -eq 0 ]]; then
    SUDO=()
    return
  fi

  command -v sudo >/dev/null 2>&1 || fail "sudo is required when not running as root."
  SUDO=(sudo)
}

require_ubuntu() {
  [[ -r /etc/os-release ]] || fail "/etc/os-release was not found. This script targets Ubuntu."
  # shellcheck disable=SC1091
  source /etc/os-release

  if [[ "${ID:-}" != "ubuntu" ]]; then
    fail "This script targets Ubuntu. Detected: ${PRETTY_NAME:-unknown}."
  fi

  log "Detected ${PRETTY_NAME:-Ubuntu}."
}

apt_install_basics() {
  log "Installing base packages."
  "${SUDO[@]}" apt-get update
  "${SUDO[@]}" apt-get install -y ca-certificates curl git gnupg openssl lsb-release
}

install_docker() {
  if [[ "${INSTALL_DOCKER}" != "true" ]]; then
    warn "Skipping Docker installation."
    return
  fi

  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "Docker and Docker Compose plugin are already installed."
    return
  fi

  log "Installing Docker Engine and Docker Compose plugin from Docker apt repository."
  "${SUDO[@]}" install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /tmp/docker.asc
  "${SUDO[@]}" install -m 0644 /tmp/docker.asc /etc/apt/keyrings/docker.asc
  rm -f /tmp/docker.asc

  # shellcheck disable=SC1091
  source /etc/os-release
  local codename="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
  [[ -n "${codename}" ]] || codename="$(lsb_release -cs)"

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${codename} stable" |
    "${SUDO[@]}" tee /etc/apt/sources.list.d/docker.list >/dev/null

  "${SUDO[@]}" apt-get update
  "${SUDO[@]}" apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  if command -v systemctl >/dev/null 2>&1; then
    "${SUDO[@]}" systemctl enable --now docker
  fi

  local target_user="${SUDO_USER:-${USER:-}}"
  if [[ -n "${target_user}" && "${target_user}" != "root" ]]; then
    "${SUDO[@]}" usermod -aG docker "${target_user}" || true
    warn "User ${target_user} was added to the docker group. Re-login later to use docker without sudo."
  fi
}

select_docker_command() {
  if docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    DOCKER_CMD=(docker)
    return
  fi

  if [[ "${EUID}" -ne 0 ]] && sudo docker info >/dev/null 2>&1 && sudo docker compose version >/dev/null 2>&1; then
    DOCKER_CMD=(sudo docker)
    warn "Using sudo docker for this run because current shell has no Docker group access yet."
    return
  fi

  fail "Docker is not running or Docker Compose plugin is unavailable."
}

compose() {
  "${DOCKER_CMD[@]}" compose --project-directory "${APP_DIR}" --env-file "${APP_DIR}/.env" "$@"
}

prepare_project_dir() {
  local parent_dir
  parent_dir="$(dirname "${APP_DIR}")"
  "${SUDO[@]}" mkdir -p "${parent_dir}"

  if [[ ! -e "${APP_DIR}" ]]; then
    log "Cloning ${REPO_URL} into ${APP_DIR}."
    "${SUDO[@]}" git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
  elif [[ -d "${APP_DIR}/.git" ]]; then
    log "Updating existing repository in ${APP_DIR}."
    git -C "${APP_DIR}" fetch origin "${BRANCH}"
    git -C "${APP_DIR}" checkout "${BRANCH}" || git -C "${APP_DIR}" checkout -b "${BRANCH}" "origin/${BRANCH}"
    git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
  else
    fail "${APP_DIR} exists but is not a Git repository. Move it away or choose --app-dir."
  fi

  local target_user="${SUDO_USER:-${USER:-}}"
  if [[ -n "${target_user}" && "${target_user}" != "root" ]]; then
    "${SUDO[@]}" chown -R "${target_user}:${target_user}" "${APP_DIR}" || true
  fi
}

get_env_value() {
  local key="$1"
  local env_file="${APP_DIR}/.env"
  grep -E "^${key}=" "${env_file}" | tail -n 1 | cut -d '=' -f 2- || true
}

escape_sed_replacement() {
  printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
}

set_env_value() {
  local key="$1"
  local value="$2"
  local env_file="${APP_DIR}/.env"
  local escaped
  escaped="$(escape_sed_replacement "${value}")"

  if grep -qE "^${key}=" "${env_file}"; then
    sed -i "s/^${key}=.*/${key}=${escaped}/" "${env_file}"
  else
    printf '\n%s=%s\n' "${key}" "${value}" >>"${env_file}"
  fi
}

is_missing_or_placeholder() {
  local value="$1"
  [[ -z "${value}" || "${value}" == "replace-me" || "${value}" == replace-with-* ]]
}

prompt_secret() {
  local label="$1"
  local value=""
  read -r -s -p "${label}: " value
  printf '\n' >&2
  printf '%s' "${value}"
}

prompt_plain() {
  local label="$1"
  local value=""
  read -r -p "${label}: " value
  printf '%s' "${value}"
}

configure_env() {
  local env_file="${APP_DIR}/.env"

  if [[ ! -f "${env_file}" ]]; then
    log "Creating .env from .env.example."
    cp "${APP_DIR}/.env.example" "${env_file}"
    chmod 600 "${env_file}" || true
  else
    log ".env already exists; keeping existing values."
  fi

  set_env_value NODE_ENV production

  local api_token metrics_token
  api_token="$(get_env_value API_TOKEN)"
  metrics_token="$(get_env_value METRICS_TOKEN)"

  if is_missing_or_placeholder "${api_token}" || [[ "${#api_token}" -lt 16 ]]; then
    set_env_value API_TOKEN "$(openssl rand -hex 32)"
    log "Generated API_TOKEN."
  fi

  if is_missing_or_placeholder "${metrics_token}" || [[ "${#metrics_token}" -lt 16 ]]; then
    set_env_value METRICS_TOKEN "$(openssl rand -hex 32)"
    log "Generated METRICS_TOKEN."
  fi

  local discord_token discord_client_id
  discord_token="$(get_env_value DISCORD_TOKEN)"
  discord_client_id="$(get_env_value DISCORD_CLIENT_ID)"

  if [[ "${NON_INTERACTIVE}" == "true" ]]; then
    if is_missing_or_placeholder "${discord_token}"; then
      warn "DISCORD_TOKEN is not configured. Edit ${env_file} before starting the bot."
    fi
    if is_missing_or_placeholder "${discord_client_id}"; then
      warn "DISCORD_CLIENT_ID is not configured. Edit ${env_file} before registering commands."
    fi
    return
  fi

  if [[ -t 0 ]] && is_missing_or_placeholder "${discord_token}"; then
    local token
    token="$(prompt_secret "Discord Bot Token")"
    [[ -n "${token}" ]] && set_env_value DISCORD_TOKEN "${token}"
  fi

  if [[ -t 0 ]] && is_missing_or_placeholder "${discord_client_id}"; then
    local client_id
    client_id="$(prompt_plain "Discord Client ID")"
    [[ -n "${client_id}" ]] && set_env_value DISCORD_CLIENT_ID "${client_id}"
  fi

  if [[ -t 0 && -z "$(get_env_value DISCORD_GUILD_ID)" ]]; then
    local guild_id
    guild_id="$(prompt_plain "Discord Guild ID for fast command registration (optional, press Enter to skip)")"
    [[ -n "${guild_id}" ]] && set_env_value DISCORD_GUILD_ID "${guild_id}"
  fi
}

start_services() {
  if [[ "${START_SERVICES}" != "true" ]]; then
    warn "Skipping docker compose up."
    return
  fi

  log "Starting services with Docker Compose."
  compose up --build -d
}

wait_for_health() {
  if [[ "${START_SERVICES}" != "true" ]]; then
    return
  fi

  log "Waiting for API health check."
  for _ in $(seq 1 30); do
    if curl -fsS http://localhost:3000/health >/dev/null 2>&1; then
      log "Health check passed."
      return
    fi
    sleep 2
  done

  warn "Health check did not pass within 60 seconds. Showing recent bot logs."
  compose logs --tail=120 bot || true
}

register_commands() {
  if [[ "${REGISTER_COMMANDS}" != "true" ]]; then
    return
  fi

  if [[ "${START_SERVICES}" != "true" ]]; then
    fail "--register-commands requires services to be started."
  fi

  log "Registering Discord slash commands."
  compose exec -T bot node dist/scripts/registerCommands.js
}

print_summary() {
  cat <<SUMMARY

Deployment finished.

Project directory:
  ${APP_DIR}

Useful commands:
  cd ${APP_DIR}
  docker compose ps
  docker compose logs -f bot
  curl http://localhost:3000/health
  curl http://localhost:3000/ready

If this is the first install and you did not use --register-commands:
  docker compose exec -T bot node dist/scripts/registerCommands.js

Keep ${APP_DIR}/.env private. Do not commit it to GitHub.
SUMMARY
}

main() {
  parse_args "$@"
  setup_sudo
  require_ubuntu
  apt_install_basics
  install_docker
  select_docker_command
  prepare_project_dir
  configure_env
  start_services
  wait_for_health
  register_commands
  print_summary
}

main "$@"
