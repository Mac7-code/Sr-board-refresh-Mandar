// Port of Render-ConfluenceBoard.ps1 / Merge-JiraPages.ps1's logic.
// Keep this in sync with the PowerShell version's rules if either changes:
//   - a ticket stays on the SR list until a support-team member's own comment
//     (internal note or reply) is the most recent human activity
//   - "Automation for Jira" comments never count as the last actor
//   - Closed is excluded from the SR list; every other status (including
//     Resolved) counts, since a customer can still reply to a resolved ticket
//   - Sev-1 sorts first and gets a red row; Critical priority gets a red
//     lozenge only, no reordering, no row background

const { AtlassianClient } = require('./atlassian');
const supportTeam = require('./support-team.json');
const adf = require('./adf');

const FIELDS = [
  'summary', 'status', 'priority', 'assignee', 'reporter', 'updated',
  'project', 'issuetype', 'resolution', 'comment', 'customfield_10541', 'customfield_10560',
];

function buildJqlA() {
  const ids = supportTeam.members.map((m) => `"${m.accountId}"`).join(',');
  return `project = SR AND status != Closed AND assignee in (${ids}) AND updated >= -3d ORDER BY updated DESC`;
}

const JQL_B = 'project in (OVS, BAN, B2C) AND statusCategory = Done AND updated >= -24h ORDER BY updated DESC';

function formatIST(date, pattern) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  if (pattern === 'stamp') return `${get('day')} ${get('month')} ${get('year')} ${get('hour')}:${get('minute')}`;
  return `${get('day')} ${get('month')} ${get('hour')}:${get('minute')}`;
}

function computeRows(issues) {
  const supportIds = new Map(supportTeam.members.map((m) => [m.accountId, m.name]));
  const bots = new Set(supportTeam.botAccounts);
  const rows = [];

  for (const n of issues) {
    if (!n.key) continue;
    const f = n.fields;
    const comments = (f.comment && f.comment.comments) || [];
    const humanComments = comments
      .filter((c) => !bots.has(c.author.displayName))
      .sort((a, b) => new Date(a.created) - new Date(b.created));
    const last = humanComments[humanComments.length - 1];
    const actorId = last ? last.author.accountId : null;
    const actorName = last ? last.author.displayName : null;

    const sev = f.customfield_10541 && f.customfield_10541.value;
    const assigneeId = f.assignee ? f.assignee.accountId : null;

    rows.push({
      key: n.key,
      project: f.project.key,
      severity: sev || '',
      isSev1: sev === 'Sev-1',
      isCritical: !!(f.priority && f.priority.name === 'Critical'),
      status: f.status.name,
      statusCat: f.status.statusCategory.name,
      summary: f.summary,
      assignee: f.assignee ? f.assignee.displayName : 'Unassigned',
      isSupportAssignee: !!(assigneeId && supportIds.has(assigneeId)),
      updated: f.updated ? new Date(f.updated) : null,
      lastActor: actorName,
      externalActivity: !!(actorId && !supportIds.has(actorId)),
      url: `https://raileurope.atlassian.net/browse/${n.key}`,
    });
  }
  return rows;
}

function byUpdatedDesc(a, b) {
  return (b.updated ? b.updated.getTime() : 0) - (a.updated ? a.updated.getTime() : 0);
}

function sevCellContent(r) {
  if (r.isSev1) return [adf.status('SEV-1', 'red')];
  if (r.isCritical) return [adf.status('CRITICAL', 'red')];
  if (r.severity) return [adf.status(r.severity, 'neutral')];
  return [adf.status('-', 'neutral')];
}

function issueRow(r) {
  const bg = r.isSev1 ? '#FFEBE6' : undefined;
  const upd = r.updated ? formatIST(r.updated, 'row') : '-';
  const actorContent = r.lastActor ? [adf.bold(r.lastActor)] : [adf.em('no comment')];
  return adf.tableRow([
    adf.tableCell([adf.link(r.key, r.url)], bg),
    adf.tableCell(sevCellContent(r), bg),
    adf.tableCell([adf.text(r.summary)], bg),
    adf.tableCell([adf.text(r.status)], bg),
    adf.tableCell([adf.text(r.assignee)], bg),
    adf.tableCell(actorContent, bg),
    adf.tableCell([adf.text(upd)], bg),
  ]);
}

const HEADER_ROW = adf.tableRow(
  ['Key', 'Severity', 'Summary', 'Status', 'Assignee', 'Last activity by', 'Updated'].map(adf.tableHeaderCell),
);

function buildDocument({ srExternal, sev1, engDone, scannedCount, windowLabel, engWindowLabel }) {
  const content = [];
  const stamp = formatIST(new Date(), 'stamp');

  content.push(adf.paragraph([
    adf.bold(`Refreshed ${stamp} (IST)`),
    adf.text(` · rebuilt every 15 minutes · SR window: ${windowLabel} · engineering window: ${engWindowLabel}`),
  ]));

  content.push(adf.table([
    adf.tableRow(['SR awaiting support reply', 'of which Sev-1', 'Engineering marked Done'].map(adf.tableHeaderCell)),
    adf.tableRow([
      adf.tableCell([adf.bold(String(srExternal.length))]),
      adf.tableCell([adf.bold(String(sev1.length))]),
      adf.tableCell([adf.bold(String(engDone.length))]),
    ]),
  ], 'default'));

  if (sev1.length > 0) {
    content.push(adf.panel('error', [adf.paragraph([
      adf.bold(`${sev1.length} Sev-1 ticket(s) updated in this window.`),
      adf.text(' Listed first below.'),
    ])]));
  }

  content.push(adf.heading(2, 'SR awaiting a support reply'));
  content.push(adf.paragraph([adf.text(
    'A ticket stays on this list until someone from the support team actually responds - it is not dropped just '
    + 'because the last customer message was a while ago. Open, in progress, waiting for client, waiting for '
    + 'internal, reopen and resolved all count; Closed tickets are excluded, since a closed ticket is not waiting '
    + 'on a reply. Only SRs assigned to a support team member are shown (SRs assigned to other departments, or '
    + 'unassigned, are excluded). The moment a support team member comments - internal note or customer reply - '
    + `the ticket leaves this list. Covers the ${windowLabel}.`,
  )]));

  if (srExternal.length === 0) {
    content.push(adf.panel('success', [adf.paragraph([
      adf.text('Nothing waiting. Every SR in this window has had a support reply since the last outside message.'),
    ])]));
  } else {
    const ordered = [...srExternal.filter((r) => r.isSev1), ...srExternal.filter((r) => !r.isSev1)];
    content.push(adf.table([HEADER_ROW, ...ordered.map(issueRow)], 'full-width'));
  }

  content.push(adf.heading(2, `Engineering marked Done (OVS / BAN / B2C) - ${engWindowLabel}`));
  if (engDone.length === 0) {
    content.push(adf.paragraph([adf.em('Nothing moved to Done in this window.')]));
  } else {
    content.push(adf.table([HEADER_ROW, ...engDone.map(issueRow)], 'full-width'));
  }

  content.push(adf.heading(2, 'How this page works'));
  content.push(adf.bulletList([
    `Rebuilt every 15 minutes. The SR list looks back over the ${windowLabel} and keeps a ticket until support `
    + 'replies, so nothing disappears while it is still waiting on us.',
    '"Last activity by" is the most recent human comment author. Automation for Jira is ignored. A change made '
    + 'without any comment does not count as activity.',
    'Support team excluded from triggering a row: ' + supportTeam.members.map((m) => m.name).join(', ') + '.',
    'Sev-1 rows carry a red lozenge and a red background, and sort to the top.',
  ]));

  return adf.doc(content);
}

async function refreshBoard({ jiraBaseUrl, email, apiToken, pageId, log }) {
  const client = new AtlassianClient({ baseUrl: jiraBaseUrl, email, apiToken });
  const windowLabel = 'last 3 days';
  const engWindowLabel = 'last 24 hours';

  const [issuesA, issuesB] = await Promise.all([
    client.searchAllIssues(buildJqlA(), FIELDS),
    client.searchAllIssues(JQL_B, FIELDS),
  ]);
  (log || console.log)(`Fetched ${issuesA.length} SR issues, ${issuesB.length} eng issues`);

  const rows = computeRows([...issuesA, ...issuesB]);

  const srExternal = rows
    .filter((r) => r.project === 'SR' && r.externalActivity && r.isSupportAssignee && r.status !== 'Closed')
    .sort(byUpdatedDesc);
  const engDone = rows
    .filter((r) => ['OVS', 'BAN', 'B2C'].includes(r.project) && r.statusCat === 'Done')
    .sort(byUpdatedDesc);
  const sev1 = srExternal.filter((r) => r.isSev1);

  const document = buildDocument({ srExternal, sev1, engDone, scannedCount: rows.length, windowLabel, engWindowLabel });

  const stampForMessage = formatIST(new Date(), 'row');
  await client.updatePageAdf(pageId, document, `Refresh ${stampForMessage} IST`);

  const summary = { srExternal: srExternal.length, sev1: sev1.length, engDone: engDone.length, scanned: rows.length };
  (log || console.log)(`srExternal=${summary.srExternal} sev1=${summary.sev1} engDone=${summary.engDone} scanned=${summary.scanned}`);
  return summary;
}

// Fetches + filters the SR side only (no Confluence write) — used by the
// Slack digest, which reports the same "awaiting a reply" list without
// touching the Confluence page.
async function fetchSrExternal({ jiraBaseUrl, email, apiToken }) {
  const client = new AtlassianClient({ baseUrl: jiraBaseUrl, email, apiToken });
  const issues = await client.searchAllIssues(buildJqlA(), FIELDS);
  const rows = computeRows(issues);
  const srExternal = rows
    .filter((r) => r.project === 'SR' && r.externalActivity && r.isSupportAssignee && r.status !== 'Closed')
    .sort(byUpdatedDesc);
  const sev1 = srExternal.filter((r) => r.isSev1);
  return { srExternal, sev1 };
}

module.exports = {
  refreshBoard, computeRows, buildDocument, buildJqlA, JQL_B, FIELDS, formatIST, fetchSrExternal,
};
