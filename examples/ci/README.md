# CI Integration Examples

Drop-in pipeline templates for running **Bright Agent** in your own CI. Each
example downloads the prebuilt binary from
[Releases](https://github.com/NeuraLegion/bright-agent-dist/releases),
verifies its checksum, and runs a scan against your repository. The agent opens
a pull request with verified fixes.

| Platform                       | File                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------- |
| GitHub Actions                 | [`github-actions.yml`](./github-actions.yml)                                     |
| GitHub Actions — CodeQL validation | [`github-actions-codeql-validation.yml`](./github-actions-codeql-validation.yml) |
| CircleCI                       | [`circleci-config.yml`](./circleci-config.yml)                                   |
| Jenkins                        | [`Jenkinsfile`](./Jenkinsfile)                                                   |

### Modes

The default examples run the full **scan → fix → validate** loop and open a PR
with fixes. The **CodeQL validation** example instead runs `RUN_MODE=validation`:
it takes a CodeQL SARIF file and confirms which static findings are actually
exploitable against the live app (no fix loop), posting a CodeQL → DAST summary
to a PR.

## How it works

Bright Agent clones `REPOSITORY_URL` itself, builds and starts the app, scans
the live endpoints, generates fixes, and opens a PR — so the CI job only needs
to **download the binary and run it** with the right environment variables.

## Runner prerequisites

- **Docker** and **Docker Compose** — to build and run the target app and its services
- **Git** — to clone the repo and push the fix branch
- **curl** + **sha256sum** — to fetch and verify the binary

GitHub-hosted `ubuntu-latest` and the CircleCI `ubuntu-2404` machine image
include all of these. Self-hosted runners and Jenkins nodes must provide them.

> **CircleCI:** use the `machine` executor (a full VM). The `docker` executor
> with remote Docker can't reach the app on `localhost`, so scanning fails.

## Required secrets / environment variables

Store these in your CI's secret manager — never commit them.

| Variable            | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `BRIGHT_TOKEN`      | Bright API token from https://app.brightsec.com                |
| `REPO_ACCESS_TOKEN` | Token that can clone, push branches, and open PRs on the repo  |
| `INFERENCE_TOKEN`   | API token for your OpenAI-compatible inference endpoint        |
| `INFERENCE_URL`     | That endpoint's base URL (OpenAI, GitHub Models, Ollama, a Bedrock-compatible gateway, …). Not secret — store as a CI variable |
| `REPOSITORY_URL`    | The repository to scan (https form)                            |

Bring your own inference provider — anything exposing an OpenAI-compatible API.
If you use OpenAI directly, you may set `OPENAI_API_KEY` instead of `INFERENCE_TOKEN`.

> **GitHub Actions:** you can skip the `REPO_ACCESS_TOKEN` PAT and use the
> built-in `GITHUB_TOKEN` — set `REPO_ACCESS_TOKEN: ${{ secrets.GITHUB_TOKEN }}`
> and grant `contents: write` + `pull-requests: write` (see the example).
> Caveat: PRs opened with `GITHUB_TOKEN` won't trigger your other workflows, so
> use a PAT if you need the fix PR to run your CI.

The binary **redacts these from all log output**, including its log file.

## Choosing the binary

Pick the asset matching the runner OS/arch:

- `bright-agent-linux-x64` (most CI runners)
- `bright-agent-linux-arm64`
- `bright-agent-darwin-x64`, `bright-agent-darwin-arm64` (macOS runners)

Always **pin `BRIGHT_AGENT_VERSION`** to a released tag for reproducible runs.

## Scheduling

Scans build and run your whole app and can take many minutes. Run them
**on a schedule (nightly) or on demand**, not on every push.
