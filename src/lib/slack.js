// Posts the "SR awaiting a support reply" summary to Slack via an Incoming
// Webhook. Same filtering rules as the Confluence board (see board.js) —
// this only reports the SR list, not the engineering "Done" section.

const { formatIST } = require('./board');

function sevLabel(r) {
  if (r.isSev1) return '🔴 Sev-1';
  if (r.isCritical) return '🔴 CRITICAL';
  if (r.severity) return r.severity;
  return '-';
}

function ticketLine(r) {
  const upd = r.updated ? formatIST(r.updated, 'row') : '-';
  const actor = r.lastActor || 'no comment';
  return `${r.isSev1 ? '🔴' : '•'} <${r.url}|${r.key}> _${sevLabel(r)}_ — *${r.status}* — ${r.assignee} — last: ${actor} — ${upd}`;
}

// Slack section blocks cap out at 3000 chars of text; batch rows into
// chunks so a busy window doesn't get silently truncated.
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
    for (const group of chunk(ordered.map(ticketLine), 10)) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: group.join('\n') } });
    }
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
