#!/usr/bin/env bash

set -u
set -o pipefail

CI_AGENT_PAYLOAD_TAIL_BYTES=12000

log() {
  printf '[bright-step-repair] %s\n' "$*" >&2
}

log_block() {
  local prefix="$1"
  local content="$2"
  local line

  [[ -n "$content" ]] || return 0
  while IFS= read -r line; do
    log "${prefix}${line}"
  done <<<"$content"
}

debug_enabled() {
  case "${CI_AGENT_DEBUG:-}" in
    1|true|TRUE|yes|YES|on|ON)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

debug_log() {
  debug_enabled || return 0
  log "$@"
}

debug_log_block() {
  debug_enabled || return 0
  log_block "$@"
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    log "missing required env: ${name}"
    exit 1
  fi
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    log "missing required command: ${name}"
    exit 1
  fi
}

sleep_ms() {
  local millis="${1:-0}"
  if [[ ! "$millis" =~ ^[0-9]+$ ]] || [[ "$millis" -le 0 ]]; then
    return 0
  fi

  awk "BEGIN { exit !($millis > 0) }" >/dev/null 2>&1 || return 0
  sleep "$(awk "BEGIN { printf \"%.3f\", ${millis} / 1000 }")"
}

step_repair_root() {
  local base_dir
  base_dir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
  printf '%s/bright-step-repair' "$base_dir"
}

step_repair_steps_dir() {
  printf '%s/steps' "$(step_repair_root)"
}

find_readiness_probe_step_index() {
  local steps_dir dir base name_file step_name readiness_step_name found=""

  steps_dir="$(step_repair_steps_dir)"
  readiness_step_name="${CI_AGENT_READINESS_STEP_NAME:-}"
  [[ -n "$readiness_step_name" ]] || return 1
  [[ -d "$steps_dir" ]] || return 1

  shopt -s nullglob
  for dir in "$steps_dir"/*; do
    [[ -d "$dir" ]] || continue
    base="$(basename "$dir")"
    [[ "$base" =~ ^[0-9]+$ ]] || continue
    name_file="${dir}/step_name"
    [[ -f "$name_file" ]] || continue
    step_name="$(cat "$name_file")"
    if [[ "$step_name" == "$readiness_step_name" ]]; then
      found="$base"
      break
    fi
  done
  shopt -u nullglob

  [[ -n "$found" ]] || return 1
  printf '%s' "$found"
}

current_step_dir() {
  printf '%s/%s' "$(step_repair_steps_dir)" "${CURRENT_STEP_INDEX}"
}

persist_current_step_metadata() {
  local step_dir

  step_dir="$(current_step_dir)"
  mkdir -p "$step_dir" || return 1

  cp "$STEP_SCRIPT_PATH" "${step_dir}/script.sh" || return 1
  printf '%s' "$CURRENT_STEP_NAME" >"${step_dir}/step_name" || return 1
  printf '%s' "$CURRENT_STEP_INDEX" >"${step_dir}/step_index" || return 1
  printf '%s' "$CURRENT_STEP_CWD" >"${step_dir}/cwd" || return 1
  env -0 >"${step_dir}/env.snapshot" || return 1

  CURRENT_STEP_SCRIPT_SOURCE="${step_dir}/script.sh"
  return 0
}

load_step_metadata() {
  local step_dir="$1"
  local name_file="${step_dir}/step_name"
  local index_file="${step_dir}/step_index"
  local cwd_file="${step_dir}/cwd"
  local script_file="${step_dir}/script.sh"
  local env_file="${step_dir}/env.snapshot"

  [[ -f "$name_file" ]] || return 1
  [[ -f "$index_file" ]] || return 1
  [[ -f "$cwd_file" ]] || return 1
  [[ -f "$script_file" ]] || return 1
  [[ -f "$env_file" ]] || return 1

  REPLAY_STEP_NAME="$(cat "$name_file")"
  REPLAY_STEP_INDEX="$(cat "$index_file")"
  REPLAY_STEP_CWD="$(cat "$cwd_file")"
  REPLAY_STEP_SCRIPT_PATH="$script_file"
  REPLAY_STEP_ENV_FILE="$env_file"

  return 0
}

run_script_capture_with_env_snapshot() {
  local script_path="$1"
  local env_file="$2"
  local cwd="$3"
  local stdout_file="$4"
  local stderr_file="$5"
  local accumulated_env_file="$6"
  local accumulated_path_file="$7"
  local step_github_env_file="$8"
  local step_github_path_file="$9"

  env -i bash -c '
    set -u

    is_valid_env_entry() {
      local entry="$1"
      local name

      [[ -n "$entry" ]] || return 1
      [[ "$entry" == *=* ]] || return 1

      name="${entry%%=*}"
      [[ "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]
    }

    import_env_snapshot_file() {
      local file="$1"
      local entry

      [[ -f "$file" ]] || return 0
      while IFS= read -r -d "" entry; do
        is_valid_env_entry "$entry" || continue
        export "$entry"
      done < "$file"
    }

    apply_accumulated_github_path() {
      local file="$1"
      local line

      [[ -f "$file" ]] || return 0

      while IFS= read -r line || [[ -n "$line" ]]; do
        [[ -n "$line" ]] || continue
        PATH="${line}${PATH:+:${PATH}}"
      done < "$file"
      export PATH
    }

    env_file="$1"
    cwd="$2"
    script_path="$3"
    stdout_file="$4"
    stderr_file="$5"
    accumulated_env_file="$6"
    accumulated_path_file="$7"
    step_github_env_file="$8"
    step_github_path_file="$9"

    import_env_snapshot_file "$env_file"
    import_env_snapshot_file "$accumulated_env_file"
    apply_accumulated_github_path "$accumulated_path_file"

    export GITHUB_ENV="$step_github_env_file"
    export GITHUB_PATH="$step_github_path_file"

    cd "$cwd"
    bash -eo pipefail "$script_path" > >(tee "$stdout_file") 2> >(tee "$stderr_file" >&2)
  ' bash "$env_file" "$cwd" "$script_path" "$stdout_file" "$stderr_file" "$accumulated_env_file" "$accumulated_path_file" "$step_github_env_file" "$step_github_path_file"
}

is_valid_github_env_name() {
  local name="$1"
  [[ "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]
}

append_github_env_commands() {
  local commands_file="$1"
  local target_file="$2"
  local line name delimiter value next_line first_line

  [[ -f "$commands_file" ]] || return 0

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -n "$line" ]] || continue

    if [[ "$line" == *"<<"* ]]; then
      name="${line%%<<*}"
      is_valid_github_env_name "$name" || continue
      delimiter="${line#*<<}"
      value=""
      first_line=1

      while IFS= read -r next_line || [[ -n "$next_line" ]]; do
        if [[ "$next_line" == "$delimiter" ]]; then
          break
        fi
        if (( first_line )); then
          value="$next_line"
          first_line=0
        else
          value+=$'\n'"$next_line"
        fi
      done

      printf '%s\0' "${name}=${value}" >>"$target_file" || return 1
      continue
    fi

    [[ "$line" == *=* ]] || continue
    name="${line%%=*}"
    is_valid_github_env_name "$name" || continue
    printf '%s\0' "$line" >>"$target_file" || return 1
  done < "$commands_file"
}

append_github_path_commands() {
  local commands_file="$1"
  local target_file="$2"
  local line

  [[ -f "$commands_file" ]] || return 0

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -n "$line" ]] || continue
    printf '%s\n' "$line" >>"$target_file" || return 1
  done < "$commands_file"
}

collect_replay_step_dirs() {
  local steps_dir current_index dir base

  steps_dir="$(step_repair_steps_dir)"
  current_index="${CURRENT_STEP_INDEX:-0}"

  [[ -d "$steps_dir" ]] || return 0

  shopt -s nullglob
  for dir in "$steps_dir"/*; do
    [[ -d "$dir" ]] || continue
    base="$(basename "$dir")"
    [[ "$base" =~ ^[0-9]+$ ]] || continue
    if (( 10#$base <= 10#$current_index )); then
      printf '%s\n' "$dir"
    fi
  done | sort -V
  shopt -u nullglob
}

replay_managed_steps() {
  local replay_dir
  local stdout_file="$1"
  local stderr_file="$2"
  local accumulated_env_file
  local accumulated_path_file

  accumulated_env_file="$(mktemp)"
  accumulated_path_file="$(mktemp)"
  : >"$accumulated_env_file"
  : >"$accumulated_path_file"

  while IFS= read -r replay_dir; do
    [[ -n "$replay_dir" ]] || continue

    if ! load_step_metadata "$replay_dir"; then
      log "failed to load replay metadata from ${replay_dir}"
      rm -f "$accumulated_env_file" "$accumulated_path_file"
      return 1
    fi

    CURRENT_STEP_NAME="$REPLAY_STEP_NAME"
    CURRENT_STEP_INDEX="$REPLAY_STEP_INDEX"
    CURRENT_STEP_CWD="$REPLAY_STEP_CWD"
    CURRENT_STEP_SCRIPT_SOURCE="$REPLAY_STEP_SCRIPT_PATH"
    debug_log "replaying managed step index=${CURRENT_STEP_INDEX} name=${CURRENT_STEP_NAME} cwd=${CURRENT_STEP_CWD} script=${CURRENT_STEP_SCRIPT_SOURCE}"

      local step_github_env_file
      local step_github_path_file
      step_github_env_file="$(mktemp)"
      step_github_path_file="$(mktemp)"

    if run_script_capture_with_env_snapshot \
      "$REPLAY_STEP_SCRIPT_PATH" \
      "$REPLAY_STEP_ENV_FILE" \
      "$REPLAY_STEP_CWD" \
      "$stdout_file" \
      "$stderr_file" \
        "$accumulated_env_file" \
        "$accumulated_path_file" \
        "$step_github_env_file" \
        "$step_github_path_file"; then
        if ! append_github_env_commands "$step_github_env_file" "$accumulated_env_file"; then
          rm -f "$step_github_env_file" "$step_github_path_file" "$accumulated_env_file" "$accumulated_path_file"
          return 1
        fi
        if ! append_github_path_commands "$step_github_path_file" "$accumulated_path_file"; then
          rm -f "$step_github_env_file" "$step_github_path_file" "$accumulated_env_file" "$accumulated_path_file"
          return 1
        fi
        rm -f "$step_github_env_file" "$step_github_path_file"
        debug_log "replay step index=${CURRENT_STEP_INDEX} name=${CURRENT_STEP_NAME} completed successfully"
        :
    else
      local replay_exit_code=$?
        rm -f "$step_github_env_file" "$step_github_path_file" "$accumulated_env_file" "$accumulated_path_file"
      debug_log "replay step index=${CURRENT_STEP_INDEX} name=${CURRENT_STEP_NAME} failed exit_code=${replay_exit_code}"
      return "$replay_exit_code"
    fi
  done < <(collect_replay_step_dirs)

  rm -f "$accumulated_env_file" "$accumulated_path_file"
  return 0
}

run_script_capture() {
  local script_path="$1"
  local stdout_file="$2"
  local stderr_file="$3"

  bash -eo pipefail "$script_path" > >(tee "$stdout_file") 2> >(tee "$stderr_file" >&2)
}

trim_file_to_payload() {
  local source_file="$1"
  local target_file="$2"

  if [[ ! -f "$source_file" ]]; then
    : >"$target_file"
    return 0
  fi

  tail -c "$CI_AGENT_PAYLOAD_TAIL_BYTES" "$source_file" >"$target_file" 2>/dev/null || cp "$source_file" "$target_file"
}

post_sync() {
  local payload_file="$1"
  local response_file="$2"
  local url="${CI_AGENT_BASE_URL%/}/ci-agent/repair"
  local http_code
  local curl_exit
  local attempt=1
  local max_attempts=4
  local backoff_seconds=1
  local refreshed_oidc_token=0
  local connect_timeout_seconds=5
  local max_time_seconds=15
  local -a curl_args

  ensure_github_oidc_token || return 90

  while true; do
    curl_args=(
      --silent
      --show-error
      --output "$response_file"
      --write-out '%{http_code}'
      --connect-timeout "$connect_timeout_seconds"
      --max-time "$max_time_seconds"
      -H 'Content-Type: application/json'
      -H "Authorization: Bearer ${CI_AGENT_OIDC_TOKEN}"
      --data-binary "@${payload_file}"
      "$url"
    )

    if http_code="$(curl "${curl_args[@]}")"; then
      if [[ "$http_code" == "401" ]] && (( refreshed_oidc_token == 0 )); then
        log "ci-agent repair returned HTTP 401; refreshing GitHub OIDC token and retrying once"
        refresh_github_oidc_token || return 90
        refreshed_oidc_token=1
        continue
      fi

      case "$http_code" in
        408|429|500|502|503|504)
          if (( attempt < max_attempts )); then
            log "ci-agent repair returned transient HTTP ${http_code}; retrying in ${backoff_seconds}s (attempt ${attempt}/${max_attempts})"
            sleep "$backoff_seconds"
            attempt=$((attempt + 1))
            backoff_seconds=$((backoff_seconds * 2))
            continue
          fi
          ;;
      esac

      if [[ ! "$http_code" =~ ^2 ]]; then
        log "ci-agent repair returned HTTP ${http_code}"
        cat "$response_file" >&2 || true
        return 91
      fi

      return 0
    fi

    curl_exit=$?
    if (( attempt < max_attempts )); then
      log "ci-agent repair request failed (curl exit ${curl_exit}); retrying in ${backoff_seconds}s (attempt ${attempt}/${max_attempts})"
      sleep "$backoff_seconds"
      attempt=$((attempt + 1))
      backoff_seconds=$((backoff_seconds * 2))
      continue
    fi

    return 90
  done

}

build_payload() {
  local request_id="$1"
  local kind="$2"
  local exit_code="$3"
  local stdout_file="$4"
  local stderr_file="$5"
  local cwd="$6"
  local session_id="${7:-}"

  jq -n \
    --argjson request_id "$request_id" \
    --arg session_id "$session_id" \
    --argjson run_id "${CI_AGENT_RUN_ID}" \
    --arg repository "${CI_AGENT_REPOSITORY:-}" \
    --arg workflow_branch "${CI_AGENT_WORKFLOW_BRANCH:-}" \
    --arg job_name "${CI_AGENT_JOB_NAME:-test}" \
    --arg step_name "${CURRENT_STEP_NAME:-${CI_AGENT_STEP_NAME:-Managed run step}}" \
    --argjson step_index "${CURRENT_STEP_INDEX:-${CI_AGENT_STEP_INDEX:-0}}" \
    --argjson attempt "${CI_AGENT_WORKFLOW_ATTEMPT:-0}" \
    --arg script_path "${CURRENT_STEP_SCRIPT_SOURCE:-$STEP_SCRIPT_PATH}" \
    --rawfile script "${CURRENT_STEP_SCRIPT_SOURCE:-$STEP_SCRIPT_PATH}" \
    --arg cwd "${CURRENT_STEP_CWD:-$cwd}" \
    --arg kind "$kind" \
    --argjson exit_code "$exit_code" \
    --rawfile stdout "$stdout_file" \
    --rawfile stderr "$stderr_file" '
      {
        request_id: $request_id,
        session: {
          run_id: $run_id,
          repository: $repository,
          workflow_branch: $workflow_branch,
          job_name: $job_name,
          step_name: $step_name,
          step_index: $step_index,
          attempt: $attempt,
          script_path: $script_path,
          script: $script,
          cwd: $cwd
        },
        result: {
          kind: $kind,
          exit_code: $exit_code,
          stdout: $stdout,
          stderr: $stderr
        }
      }
      | if ($session_id | length) > 0
        then .session.session_id = $session_id
        else .
        end
    '
}

build_github_oidc_url() {
  local audience encoded_audience request_url separator

  request_url="${ACTIONS_ID_TOKEN_REQUEST_URL:-}"
  audience="${CI_AGENT_BASE_URL%/}"
  [[ -n "$request_url" ]] || return 1
  [[ -n "$audience" ]] || return 1

  encoded_audience="$(jq -rn --arg v "$audience" '$v|@uri')" || return 1
  separator='?'
  if [[ "$request_url" == *\?* ]]; then
    separator='&'
  fi

  printf '%s%saudience=%s' "$request_url" "$separator" "$encoded_audience"
}

refresh_github_oidc_token() {
  local oidc_url response token

  if [[ -z "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}" ]]; then
    log "missing ACTIONS_ID_TOKEN_REQUEST_TOKEN for GitHub OIDC auth"
    return 1
  fi
  oidc_url="$(build_github_oidc_url)" || {
    log "failed to build GitHub OIDC token request URL"
    return 1
  }

  response="$(
    curl --silent --show-error \
      --connect-timeout 5 \
      --max-time 15 \
      -H "Authorization: Bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
      "$oidc_url"
  )" || return 1
  token="$(printf '%s' "$response" | jq -r '.value // ""')" || return 1
  if [[ -z "$token" ]]; then
    log "GitHub OIDC token response did not contain value"
    return 1
  fi

  CI_AGENT_OIDC_TOKEN="$token"
  return 0
}

ensure_github_oidc_token() {
  if [[ -n "${CI_AGENT_OIDC_TOKEN:-}" ]]; then
    return 0
  fi
  refresh_github_oidc_token
}

sync_with_result() {
  local request_id="$1"
  local kind="$2"
  local exit_code="$3"
  local stdout_file="$4"
  local stderr_file="$5"
  local cwd="$6"

  local payload_file response_file
  payload_file="$(mktemp)"
  response_file="$(mktemp)"

  if ! build_payload "$request_id" "$kind" "$exit_code" "$stdout_file" "$stderr_file" "$cwd" "${SESSION_ID:-}" >"$payload_file"; then
    rm -f "$payload_file" "$response_file"
    return 1
  fi

  debug_log "sync request request_id=${request_id} session_id=${SESSION_ID:-<new>} kind=${kind} step_index=${CURRENT_STEP_INDEX} step_name=${CURRENT_STEP_NAME} exit_code=${exit_code} cwd=${CURRENT_STEP_CWD:-$cwd}"

  if ! post_sync "$payload_file" "$response_file"; then
    rm -f "$payload_file" "$response_file"
    return 1
  fi

  SESSION_ID="$(jq -r '.session_id // ""' "$response_file")"
  LAST_RESPONSE_FILE="$response_file"
  log_sync_response "$response_file"
  rm -f "$payload_file"
  return 0
}

log_sync_response() {
  local response_file="$1"
  local action_type poll_after file_count
  local run_command prepare_command

  action_type="$(jq -r '.action.type // ""' "$response_file")"
  poll_after="$(jq -r '.action.poll_after_ms // 0' "$response_file")"
  file_count="$(jq -r '(.action.files // []) | length' "$response_file")"
  if [[ "$action_type" == "wait" ]]; then
    debug_log "sync response session_id=${SESSION_ID:-<none>} action=${action_type} poll_after_ms=${poll_after} files=${file_count}"
  else
    log "sync response session_id=${SESSION_ID:-<none>} action=${action_type} poll_after_ms=${poll_after} files=${file_count}"
  fi

  if [[ "$file_count" != "0" ]]; then
    while IFS= read -r path; do
      [[ -n "$path" ]] || continue
      debug_log "response file path=${path}"
    done < <(jq -r '.action.files[]?.path // empty' "$response_file")
  fi

  run_command="$(jq -r '.action.run_command.command // ""' "$response_file")"
  if [[ -n "$run_command" ]]; then
    debug_log_block "response run_command> " "$run_command"
  fi

  prepare_command="$(jq -r '.action.prepare_for_rerun_command // ""' "$response_file")"
  if [[ -n "$prepare_command" ]]; then
    debug_log_block "response prepare_for_rerun_command> " "$prepare_command"
  fi
}

is_safe_repo_path() {
  local path="$1"
  local IFS='/'
  local parts

  [[ -n "$path" ]] || return 1
  [[ "$path" != /* ]] || return 1
  [[ "$path" != *\\* ]] || return 1
  [[ "$path" != *$'\n'* ]] || return 1
  [[ "$path" != *$'\r'* ]] || return 1

  read -r -a parts <<<"$path"
  for part in "${parts[@]}"; do
    [[ -n "$part" && "$part" != "." && "$part" != ".." ]] || return 1
  done

  return 0
}

apply_files_payload() {
  local response_file="$1"
  local item path dir tmp

  while IFS= read -r item; do
    path="$(printf '%s' "$item" | jq -r '.path')"
    if ! is_safe_repo_path "$path"; then
      log "invalid patch path returned by CI Agent: ${path}"
      return 1
    fi

    dir="$(dirname -- "$path")"
    mkdir -p -- "$dir" || return 1

    tmp="$(mktemp)"
    if ! printf '%s' "$item" | jq -j '.content' >"$tmp"; then
      rm -f "$tmp"
      return 1
    fi

    mv -- "$tmp" "$path" || {
      rm -f "$tmp"
      return 1
    }
  done < <(jq -c '.action.files[]?' "$response_file")
}

require_env CI_AGENT_BASE_URL
require_env CI_AGENT_RUN_ID
require_env CI_AGENT_REPOSITORY

STEP_SCRIPT_PATH="${1:-}"
if [[ -z "$STEP_SCRIPT_PATH" ]] || [[ ! -f "$STEP_SCRIPT_PATH" ]]; then
  log "missing or invalid step script path"
  exit 1
fi

CURRENT_STEP_NAME="${CI_AGENT_STEP_NAME:-Managed run step}"
CURRENT_STEP_INDEX="${CI_AGENT_STEP_INDEX:-0}"
CURRENT_STEP_CWD="$(pwd)"
CURRENT_STEP_SCRIPT_SOURCE="$STEP_SCRIPT_PATH"

if ! persist_current_step_metadata; then
  log "failed to persist step replay metadata"
  exit 1
fi

debug_log "starting managed step index=${CURRENT_STEP_INDEX} name=${CURRENT_STEP_NAME} cwd=${CURRENT_STEP_CWD} script=${CURRENT_STEP_SCRIPT_SOURCE}"

INITIAL_STDOUT="$(mktemp)"
INITIAL_STDERR="$(mktemp)"
if run_script_capture "$STEP_SCRIPT_PATH" "$INITIAL_STDOUT" "$INITIAL_STDERR"; then
  debug_log "managed step index=${CURRENT_STEP_INDEX} name=${CURRENT_STEP_NAME} completed successfully without step repair"
  rm -f "$INITIAL_STDOUT" "$INITIAL_STDERR"
  exit 0
else
  ORIGINAL_EXIT_CODE=$?
  log "managed step index=${CURRENT_STEP_INDEX} name=${CURRENT_STEP_NAME} failed exit_code=${ORIGINAL_EXIT_CODE}; entering step repair loop"
fi

READINESS_PROBE_STEP_INDEX="$(find_readiness_probe_step_index || true)"
if [[ -n "$READINESS_PROBE_STEP_INDEX" ]] && (( 10#${CURRENT_STEP_INDEX} > 10#${READINESS_PROBE_STEP_INDEX} )); then
  log "skipping step repair for step index=${CURRENT_STEP_INDEX} name=${CURRENT_STEP_NAME} because it is after readiness probe step index=${READINESS_PROBE_STEP_INDEX}"
  rm -f "$INITIAL_STDOUT" "$INITIAL_STDERR"
  exit "$ORIGINAL_EXIT_CODE"
fi

require_command curl
require_command jq

WORK_DIR="$(pwd)"
PAYLOAD_STDOUT="$(mktemp)"
PAYLOAD_STDERR="$(mktemp)"
trim_file_to_payload "$INITIAL_STDOUT" "$PAYLOAD_STDOUT"
trim_file_to_payload "$INITIAL_STDERR" "$PAYLOAD_STDERR"

REQUEST_ID=1
SESSION_ID=""
LAST_RESPONSE_FILE=""

if ! sync_with_result "$REQUEST_ID" "failed_step" "$ORIGINAL_EXIT_CODE" "$PAYLOAD_STDOUT" "$PAYLOAD_STDERR" "$WORK_DIR"; then
  rm -f "$INITIAL_STDOUT" "$INITIAL_STDERR" "$PAYLOAD_STDOUT" "$PAYLOAD_STDERR"
  exit "$ORIGINAL_EXIT_CODE"
fi

rm -f "$PAYLOAD_STDOUT" "$PAYLOAD_STDERR"

MAX_SYNC_TURNS=50
MAX_WAIT_CYCLES=30
SYNC_TURNS=0
WAIT_CYCLES=0

while (( SYNC_TURNS < MAX_SYNC_TURNS )); do
  action_type="$(jq -r '.action.type // ""' "$LAST_RESPONSE_FILE")"
  case "$action_type" in
    wait)
      WAIT_CYCLES=$((WAIT_CYCLES + 1))
      if (( WAIT_CYCLES > MAX_WAIT_CYCLES )); then
        log "no live step-repair action received in time; preserving original failure"
        rm -f "$INITIAL_STDOUT" "$INITIAL_STDERR" "$LAST_RESPONSE_FILE"
        exit "$ORIGINAL_EXIT_CODE"
      fi
      poll_after_ms="$(jq -r '.action.poll_after_ms // 1000' "$LAST_RESPONSE_FILE")"
      sleep_ms "$poll_after_ms"

      REQUEST_ID=$((REQUEST_ID + 1))
      empty_stdout="$(mktemp)"
      empty_stderr="$(mktemp)"
      if ! sync_with_result "$REQUEST_ID" "session_poll" 0 "$empty_stdout" "$empty_stderr" "$WORK_DIR"; then
        rm -f "$INITIAL_STDOUT" "$INITIAL_STDERR" "$empty_stdout" "$empty_stderr" "$LAST_RESPONSE_FILE"
        exit "$ORIGINAL_EXIT_CODE"
      fi
      rm -f "$empty_stdout" "$empty_stderr"
      ;;
    run_command)
      WAIT_CYCLES=0
      SYNC_TURNS=$((SYNC_TURNS + 1))

      cmd_file="$(mktemp)"
      cwd_file="$(mktemp)"
      jq -r '.action.run_command.command // ""' "$LAST_RESPONSE_FILE" >"$cmd_file"
      jq -r '(.action.run_command.cwd // ".") | if . == "" then "." else . end' "$LAST_RESPONSE_FILE" >"$cwd_file"

      command_stdout="$(mktemp)"
      command_stderr="$(mktemp)"
      tmp_script="$(mktemp)"
      cat "$cmd_file" >"$tmp_script"
      log "executing run_command for session_id=${SESSION_ID} request_id=${REQUEST_ID} cwd=$(cat "$cwd_file")"
      debug_log_block "run_command> " "$(cat "$cmd_file")"
      if [[ "$(cat "$cwd_file")" != "." ]]; then
        (
          cd "$(cat "$cwd_file")" &&
          bash -eo pipefail "$tmp_script"
        ) > >(tee "$command_stdout") 2> >(tee "$command_stderr" >&2)
      else
        bash -eo pipefail "$tmp_script" > >(tee "$command_stdout") 2> >(tee "$command_stderr" >&2)
      fi
      command_exit_code=$?
      log "run_command completed exit_code=${command_exit_code}"
      rm -f "$tmp_script" "$cmd_file" "$cwd_file"

      payload_stdout="$(mktemp)"
      payload_stderr="$(mktemp)"
      trim_file_to_payload "$command_stdout" "$payload_stdout"
      trim_file_to_payload "$command_stderr" "$payload_stderr"

      REQUEST_ID=$((REQUEST_ID + 1))
      if ! sync_with_result "$REQUEST_ID" "command_result" "$command_exit_code" "$payload_stdout" "$payload_stderr" "$WORK_DIR"; then
        rm -f "$INITIAL_STDOUT" "$INITIAL_STDERR" "$command_stdout" "$command_stderr" "$payload_stdout" "$payload_stderr" "$LAST_RESPONSE_FILE"
        exit "$ORIGINAL_EXIT_CODE"
      fi
      rm -f "$command_stdout" "$command_stderr" "$payload_stdout" "$payload_stderr"
      ;;
    apply_files)
      WAIT_CYCLES=0
      SYNC_TURNS=$((SYNC_TURNS + 1))
      log "applying runtime patch from STAR for session_id=${SESSION_ID} request_id=${REQUEST_ID}"

      if ! apply_files_payload "$LAST_RESPONSE_FILE"; then
        rm -f "$INITIAL_STDOUT" "$INITIAL_STDERR" "$LAST_RESPONSE_FILE"
        exit "$ORIGINAL_EXIT_CODE"
      fi
      log "runtime patch files applied successfully"

      prepare_command_file="$(mktemp)"
      jq -r '.action.prepare_for_rerun_command // ""' "$LAST_RESPONSE_FILE" >"$prepare_command_file"

      payload_stdout="$(mktemp)"
      payload_stderr="$(mktemp)"

      if [[ -n "$(cat "$prepare_command_file")" ]]; then
        prepare_stdout="$(mktemp)"
        prepare_stderr="$(mktemp)"
        prepare_script="$(mktemp)"
        cat "$prepare_command_file" >"$prepare_script"
        log "executing prepare_for_rerun_command for session_id=${SESSION_ID} request_id=${REQUEST_ID}"
        debug_log_block "prepare_for_rerun_command> " "$(cat "$prepare_command_file")"

        (
          cd "$WORK_DIR" &&
          bash -eo pipefail "$prepare_script"
        ) > >(tee "$prepare_stdout") 2> >(tee "$prepare_stderr" >&2)
        prepare_exit_code=$?
        log "prepare_for_rerun_command completed exit_code=${prepare_exit_code}"
        rm -f "$prepare_script" "$prepare_command_file"

        trim_file_to_payload "$prepare_stdout" "$payload_stdout"
        trim_file_to_payload "$prepare_stderr" "$payload_stderr"
        rm -f "$prepare_stdout" "$prepare_stderr"

        REQUEST_ID=$((REQUEST_ID + 1))
        if [[ "$prepare_exit_code" -ne 0 ]]; then
          if ! sync_with_result "$REQUEST_ID" "command_result" "$prepare_exit_code" "$payload_stdout" "$payload_stderr" "$WORK_DIR"; then
            rm -f "$INITIAL_STDOUT" "$INITIAL_STDERR" "$payload_stdout" "$payload_stderr" "$LAST_RESPONSE_FILE"
            exit "$ORIGINAL_EXIT_CODE"
          fi
          rm -f "$payload_stdout" "$payload_stderr"
          continue
        fi
      else
        rm -f "$prepare_command_file"
        : >"$payload_stdout"
        : >"$payload_stderr"
        REQUEST_ID=$((REQUEST_ID + 1))
      fi

      if ! sync_with_result "$REQUEST_ID" "session_poll" 0 "$payload_stdout" "$payload_stderr" "$WORK_DIR"; then
        rm -f "$INITIAL_STDOUT" "$INITIAL_STDERR" "$payload_stdout" "$payload_stderr" "$LAST_RESPONSE_FILE"
        exit "$ORIGINAL_EXIT_CODE"
      fi
      rm -f "$payload_stdout" "$payload_stderr"
      ;;
    rerun_step)
      WAIT_CYCLES=0
      SYNC_TURNS=$((SYNC_TURNS + 1))
      log "rerunning managed steps for session_id=${SESSION_ID} request_id=${REQUEST_ID} up_to_step_index=${CURRENT_STEP_INDEX}"

      rerun_stdout="$(mktemp)"
      rerun_stderr="$(mktemp)"
      if replay_managed_steps "$rerun_stdout" "$rerun_stderr"; then
        rerun_exit_code=0
      else
        rerun_exit_code=$?
      fi
      log "managed-step replay completed exit_code=${rerun_exit_code} effective_step_index=${CURRENT_STEP_INDEX} effective_step_name=${CURRENT_STEP_NAME}"

      payload_stdout="$(mktemp)"
      payload_stderr="$(mktemp)"
      trim_file_to_payload "$rerun_stdout" "$payload_stdout"
      trim_file_to_payload "$rerun_stderr" "$payload_stderr"

      REQUEST_ID=$((REQUEST_ID + 1))
      if ! sync_with_result "$REQUEST_ID" "step_rerun" "$rerun_exit_code" "$payload_stdout" "$payload_stderr" "$WORK_DIR"; then
        rm -f "$INITIAL_STDOUT" "$INITIAL_STDERR" "$rerun_stdout" "$rerun_stderr" "$payload_stdout" "$payload_stderr" "$LAST_RESPONSE_FILE"
        if [[ "$rerun_exit_code" -eq 0 ]]; then
          exit 0
        fi
        exit "$ORIGINAL_EXIT_CODE"
      fi
      if [[ "$rerun_exit_code" -eq 0 ]]; then
        rm -f "$INITIAL_STDOUT" "$INITIAL_STDERR" "$rerun_stdout" "$rerun_stderr" "$payload_stdout" "$payload_stderr" "$LAST_RESPONSE_FILE"
        exit 0
      fi
      rm -f "$rerun_stdout" "$rerun_stderr" "$payload_stdout" "$payload_stderr"
      ;;
    stop)
      log "ci-agent requested stop; preserving original failure"
      rm -f "$INITIAL_STDOUT" "$INITIAL_STDERR" "$LAST_RESPONSE_FILE"
      exit "$ORIGINAL_EXIT_CODE"
      ;;
    *)
      log "unsupported CI Agent action: ${action_type}"
      rm -f "$INITIAL_STDOUT" "$INITIAL_STDERR" "$LAST_RESPONSE_FILE"
      exit "$ORIGINAL_EXIT_CODE"
      ;;
  esac
done

log "step-repair loop budget exhausted; preserving original failure"
rm -f "$INITIAL_STDOUT" "$INITIAL_STDERR" "$LAST_RESPONSE_FILE"
exit "$ORIGINAL_EXIT_CODE"
