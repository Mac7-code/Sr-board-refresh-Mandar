// Posts the "SR awaiting a support reply" summary to Slack via an Incoming
// Webhook. Same filtering rules as the Confluence board (see board.js) —
// this only reports the SR list, not the engineering "Done" section.
//
// Slack has no real table block for regular messages, so this fakes one with
// a monospace-aligned code block (the standard Slack workaround). Emoji are
// avoided inside the table itself — most render double-width, which breaks
// column alignment across clients.

const { formatIST } = require('./board');

const COLS = [
  ['KEY', 9],
  ['SEV', 6],
  ['STATUS', 19],
  ['ASSIGNEE', 17],
  ['LAST ACTIVITY', 17],
  ['UPDATED', 13],
];

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

function tableHeader() {
  const header = COLS.map(([label, w]) => pad(label, w)).join(' ');
  const rule = COLS.map(([, w]) => '-'.repeat(w)).join(' ');
  return `${header}\n${rule}`;
}

function tableRow(r) {
  const values = [
    r.key,
    sevLabel(r),
    r.status,
    r.assignee,
    r.lastActor || 'no comment',
    r.updated ? formatIST(r.updated, 'row') : '-',
  ];
  return COLS.map(([, w], i) => pad(values[i], w)).join(' ');
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
    const rowChunks = chunk(ordered, 20);
    rowChunks.forEach((group) => {
      const lines = [tableHeader(), ...group.map(tableRow)].join('\n');
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '```' + lines + '\n```' } });
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
