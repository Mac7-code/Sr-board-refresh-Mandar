// Entry point for the 2-hourly Slack digest. Reuses the same Jira fetch and
// filtering as the Confluence board (src/lib/board.js) but does not touch
// Confluence — it only posts to Slack.

const path = require('path');

function loadLocalEnv() {
  try {
    const settings = require(path.join(__dirname, 'local.env.json'));
    for (const [k, v] of Object.entries(settings)) {
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    // No local.env.json — assume env vars are already set (this is the case in CI).
  }
}

loadLocalEnv();

const { fetchSrExternal } = require('./src/lib/board');
const { postSrSummary } = require('./src/lib/slack');

const required = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'SLACK_WEBHOOK_URL'];
const missing = required.filter((k) => !process.env[k] || process.env[k].startsWith('REPLACE_WITH'));
if (missing.length) {
  console.error(`Missing/unset env vars: ${missing.join(', ')}`);
  process.exit(1);
}

fetchSrExternal({
  jiraBaseUrl: process.env.JIRA_BASE_URL,
  email: process.env.JIRA_EMAIL,
  apiToken: process.env.JIRA_API_TOKEN,
})
  .then(({ srExternal, sev1 }) => postSrSummary(process.env.SLACK_WEBHOOK_URL, { srExternal, sev1 }).then(() => ({ srExternal, sev1 })))
  .then(({ srExternal, sev1 }) => {
    console.log(`Posted to Slack: srExternal=${srExternal.length} sev1=${sev1.length}`);
  })
  .catch((err) => {
    console.error('Failed:', err);
    process.exitCode = 1;
  });
