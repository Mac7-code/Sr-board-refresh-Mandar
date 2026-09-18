// Entry point for both local testing and the GitHub Actions workflow.
// In CI, JIRA_EMAIL / JIRA_API_TOKEN come from repo secrets (see
// .github/workflows/refresh.yml). Locally, copy local.env.json.example to
// local.env.json and fill it in.

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

const { refreshBoard } = require('./src/lib/board');

const required = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'];
const missing = required.filter((k) => !process.env[k] || process.env[k].startsWith('REPLACE_WITH'));
if (missing.length) {
  console.error(`Missing/unset env vars: ${missing.join(', ')}`);
  process.exit(1);
}

refreshBoard({
  jiraBaseUrl: process.env.JIRA_BASE_URL,
  email: process.env.JIRA_EMAIL,
  apiToken: process.env.JIRA_API_TOKEN,
  pageId: process.env.CONFLUENCE_PAGE_ID || '2437251078',
})
  .then((summary) => {
    console.log('Done:', summary);
  })
  .catch((err) => {
    console.error('Failed:', err);
    process.exitCode = 1;
  });
