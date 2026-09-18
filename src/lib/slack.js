// Posts the "SR awaiting a support reply" summary to Slack via an Incoming
// Webhook. Same filtering rules as the Confluence board (see board.js) —
// this only reports the SR list, not the engineering "Done" section.
//
// Slack has no real table block for regular messages, so this fakes one with
// a monospace-aligned code block (the standard Slack workaround). Emoji are
// avoided inside the table itself — most render double-width, which breaks
// column alignment across clients.

const { formatIST } = require('./board');

const HEADERS = ['KEY', 'SEV', 'STATUS', 'ASSIGNEE', 'LAST ACTIVITY', 'UPDATED'];
// Safety cap only — real column widths are sized to the longest actual value
// (see computeColumnWidths), so typical names/statuses are never cut off.
const MAX_COL_WIDTH = 30;

function pad(value, width) {
  const str = String(value);
  if (str.length > width) return str.slice(0, width - 1) + '…';
  return str.padEnd(width);
}

function sevLabel(r) {
  if (r.isSev1) return 'SEV-1';
  if (r.isCritical) return 'CRIT';
  if (r.severity) return r.severity;
  return '-';
}

function rowValues(r) {
  return [
    r.key,
    sevLabel(r),
    r.status,
    r.assignee,
    r.lastActor || 'no comment',
    r.updated ? formatIST(r.updated, 'row') : '-',
  ];
}

function computeColumnWidths(rows) {
  return HEADERS.map((h, i) => {
    const longest = rows.reduce((max, r) => Math.max(max, String(rowValues(r)[i]).length), h.length);
    return Math.min(longest, MAX_COL_WIDTH);
  });
}

function tableHeader(widths) {
  const header = HEADERS.map((h, i) => pad(h, widths[i])).join(' ');
  const rule = widths.map((w) => '-'.repeat(w)).join(' ');
  return `${header}\n${rule}`;
}

function tableRow(r, widths) {
  return rowValues(r).map((v, i) => pad(v, widths[i])).join(' ');
}

// Keeps each code block comfortably under Slack's 3000-char section limit.
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildMessage({ srExternal, sev1 }) {
  const stamp = formatIST(new Date(), 'row');
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `SR awaiting a support reply — ${srExternal.length} open (${sev1.length} Sev-1)`, emoji: true },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `As of ${stamp} IST · last 3 days · <https://raileurope.atlassian.net/wiki/spaces/SR/pages/2437251078/SD+-+Support+Live+Board|full board>` }],
    },
  ];

  if (srExternal.length === 0) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'Nothing waiting. Every SR has had a support reply since the last outside message.' } });
  } else {
    const ordered = [...sev1, ...srExternal.filter((r) => !r.isSev1)];
    const widths = computeColumnWidths(ordered);
    const rowChunks = chunk(ordered, 20);
    // Header only appears once, on the first block, so a split table still
    // reads as one continuous table rather than several separate ones.
    rowChunks.forEach((group, idx) => {
      const lines = idx === 0
        ? [tableHeader(widths), ...group.map((r) => tableRow(r, widths))]
        : group.map((r) => tableRow(r, widths));
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '```' + lines.join('\n') + '\n```' } });
    });
    // Ticket links aren't clickable inside a code block, so list them
    // separately, compact, underneath the table.
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: ordered.map((r) => `<${r.url}|${r.key}>`).join('  ') }],
    });
  }

  return {
    text: `SR awaiting a support reply — ${srExternal.length} open (${sev1.length} Sev-1)`, // fallback for notifications
    blocks,
  };
}

async function postSrSummary(webhookUrl, { srExternal, sev1 }) {
  const payload = buildMessage({ srExternal, sev1 });
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Slack webhook POST failed: ${res.status} ${res.statusText}: ${errText.slice(0, 300)}`);
  }
}

module.exports = { buildMessage, postSrSummary };
