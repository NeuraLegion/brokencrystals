# CI Integration Examples

Drop-in pipeline templates for running **Bright Agent** in your own CI. Each
example downloads the prebuilt binary from
[GitHub Releases](https://github.com/NeuraLegion/bright-agent/releases),
verifies its checksum, and runs a scan against your repository. The agent opens
a pull request with verified fixes.

| Platform       | File                                         |
| -------------- | -------------------------------------------- |
| GitHub Actions | [`github-actions.yml`](./github-actions.yml) |
| CircleCI       | [`circleci-config.yml`](./circleci-config.yml) |
| Jenkins        | [`Jenkinsfile`](./Jenkinsfile)               |

## How it works

Bright Agent clones `REPOSITORY_URL` itself, builds and starts the app, scans
the live endpoints, generates fixes, and opens a PR — so the CI job only needs
to **download the binary and run it** with the right environment variables. You
do not need to check out your repo first.

## Runner prerequisites

The agent drives your local toolchain, so the runner/node must have:

- **Docker** and **Docker Compose** — to build and run the target app and its services
- **Git** — to clone the repo and push the fix branch
- **curl** + **sha256sum** — to fetch and verify the binary

GitHub-hosted `ubuntu-latest` and the CircleCI `ubuntu-2404` machine image
include all of these. Self-hosted runners and Jenkins nodes must provide them,
and the build user must be allowed to run Docker.

> **CircleCI:** use the `machine` executor (a full VM). The `docker` executor
> with remote Docker can't reach the app on `localhost`, so scanning fails.

## Required secrets / environment variables

Store these in your CI's secret manager (GitHub Actions secrets, CircleCI
project env vars/contexts, Jenkins credentials) — never commit them.

| Variable            | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `BRIGHT_TOKEN`      | Bright API token from https://app.brightsec.com                |
| `REPO_ACCESS_TOKEN` | PAT that can clone, push branches, and open PRs on the repo    |
| `OPENAI_API_KEY`    | AI provider key (or use `INFERENCE_TOKEN` for GitHub Models, etc.) |
| `REPOSITORY_URL`    | The repository to scan (https form)                            |

The binary **redacts these from all log output**, including its log file. See
the main [Configuration](../../README.md#configuration) section for the full
list of variables (`AI_MODEL`, `RUN_MODE`, `BRIGHT_HOSTNAME`, `BRIGHT_DEBUG`, …).

## Choosing the binary

Pick the asset matching the runner OS/arch:

- `bright-agent-linux-x64` (most CI runners)
- `bright-agent-linux-arm64`
- `bright-agent-darwin-x64`, `bright-agent-darwin-arm64` (macOS runners)

Always **pin `BRIGHT_AGENT_VERSION`** to a released tag for reproducible runs.

## Scheduling

Scans build and run your whole app and can take many minutes. Run them
**on a schedule (nightly) or on demand**, not on every push. All three examples
default to a nightly cron plus a manual trigger.
