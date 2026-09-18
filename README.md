# SR Board Refresh (GitHub Actions version)

Same logic as `../Merge-JiraPages.ps1` / `../Render-ConfluenceBoard.ps1`, ported to plain
Node.js (zero dependencies) and run on a GitHub Actions schedule instead of a local
Claude Code task — so the "SD - Support Live Board" Confluence page keeps refreshing
every 15 minutes regardless of anyone's laptop being on.

## Test locally first — before anything goes near GitHub

```bash
cd github-action
cp local.env.json.example local.env.json
# edit local.env.json: fill in JIRA_API_TOKEN
node run.js
```

Compare the resulting Confluence page against what the current local scheduled task
produces. Create the API token at
https://id.atlassian.com/manage-profile/security/api-tokens — ideally for a shared
support-team account rather than one person's login, so the automation doesn't break
if that person leaves or changes their password.

## Setting it up on GitHub

1. Create a new **private** repo (e.g. `raileurope/sr-board-refresh`) — via github.com,
   no `gh` CLI needed. Push this `github-action/` folder as its root.
2. Repo → Settings → Secrets and variables → Actions → add:
   - `JIRA_EMAIL` — the service/shared account's email
   - `JIRA_API_TOKEN` — the API token
3. That's it — `.github/workflows/refresh.yml` is already in the repo and starts running
   on its own once pushed (also has a manual "Run workflow" button under the Actions tab
   for on-demand testing).

## Things to know about GitHub's scheduler

- GitHub explicitly does **not guarantee** scheduled workflows run exactly on time —
  they can be delayed (rarely dropped) during high platform load. A 15-minute cadence
  is fine in practice, just don't expect second-precision.
- **Private repos consume Actions minutes** from your org's monthly quota (public repos
  are unlimited/free). At 96 runs/day this is a small load (each run is a few seconds),
  but check your GitHub plan's included minutes if this is a personal-tier account —
  an org/enterprise GitHub plan (likely, for a company repo) has a much larger quota and
  this won't be a concern.

## Cutover — avoid double-writes

Once this is confirmed working, **disable** the local scheduled task (`sr-board-hourly`
in Claude Code) so two schedulers aren't updating the same Confluence page at once.

## Ownership

This runs entirely on GitHub's infrastructure and won't show up in Claude Code. Anyone
with access to the repo's Actions tab can see run history/logs and re-run manually if
something fails (the page is left unchanged on failure — never overwritten with a blank
body). Rotate the API token before it expires, and update the `JIRA_API_TOKEN` secret
when you do.
