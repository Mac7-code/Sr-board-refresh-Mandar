// Minimal Atlassian Document Format (ADF) node builders.
//
// The Claude Code Atlassian connector accepts a convenience "HTML+" subset
// (data-type="status", data-type="panel-*", data-background=...) and translates
// it to real Confluence content server-side. Calling the Confluence REST API
// directly does not get that translation, so this port builds ADF directly —
// the format Confluence's v2 API natively accepts as `representation: "atlas_doc_format"`.

let localIdCounter = 0;
function localId() {
  localIdCounter += 1;
  return `sr-board-${Date.now()}-${localIdCounter}`;
}

function text(str, marks) {
  const node = { type: 'text', text: String(str) };
  if (marks && marks.length) node.marks = marks;
  return node;
}

function bold(str) {
  return text(str, [{ type: 'strong' }]);
}

function em(str) {
  return text(str, [{ type: 'em' }]);
}

function link(str, href) {
  return text(str, [{ type: 'link', attrs: { href } }]);
}

function paragraph(children) {
  return { type: 'paragraph', content: children };
}

function heading(level, str) {
  return { type: 'heading', attrs: { level }, content: [text(str)] };
}

// color: 'neutral' | 'purple' | 'blue' | 'red' | 'yellow' | 'green'
function status(txt, color) {
  return { type: 'status', attrs: { text: txt, color, localId: localId() } };
}

function panel(panelType, children) {
  return { type: 'panel', attrs: { panelType }, content: children };
}

function bulletList(items) {
  return {
    type: 'bulletList',
    content: items.map((i) => ({
      type: 'listItem',
      content: [paragraph(Array.isArray(i) ? i : [text(i)])],
    })),
  };
}

function tableHeaderCell(str) {
  return { type: 'tableHeader', attrs: {}, content: [paragraph([text(str)])] };
}

function tableCell(children, background) {
  const attrs = {};
  if (background) attrs.background = background;
  return { type: 'tableCell', attrs, content: [paragraph(children)] };
}

function tableRow(cells) {
  return { type: 'tableRow', content: cells };
}

// layout: 'default' | 'full-width' | 'wide'
function table(rows, layout) {
  return {
    type: 'table',
    attrs: { isNumberColumnEnabled: false, layout: layout || 'default' },
    content: rows,
  };
}

function doc(content) {
  return { version: 1, type: 'doc', content };
}

module.exports = {
  text, bold, em, link, paragraph, heading, status, panel,
  bulletList, tableHeaderCell, tableCell, tableRow, table, doc,
};
