// Direct Jira/Confluence Cloud REST API access, using an API token instead of
// the Claude Code Atlassian connector (which only exists inside a Claude session).
// No external dependencies — uses Node's built-in fetch (Node 18+).

function authHeader(email, token) {
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

class AtlassianClient {
  constructor({ baseUrl, email, apiToken }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.headers = {
      Authorization: authHeader(email, apiToken),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async request(method, path, body) {
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`${method} ${path} -> ${res.status} ${res.statusText}: ${errText.slice(0, 500)}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // Paginates https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-search-jql-post
  // NOTE: verify this endpoint path is still current at deploy time — Atlassian
  // has been migrating search off the older /rest/api/3/search endpoint.
  async searchAllIssues(jql, fields, maxResults = 100) {
    const issues = [];
    let nextPageToken;
    for (;;) {
      const body = { jql, fields, maxResults };
      if (nextPageToken) body.nextPageToken = nextPageToken;
      const data = await this.request('POST', '/rest/api/3/search/jql', body);
      issues.push(...(data.issues || []));
      if (data.isLast || !data.nextPageToken) break;
      nextPageToken = data.nextPageToken;
    }
    return issues;
  }

  async getPage(pageId) {
    return this.request('GET', `/wiki/api/v2/pages/${pageId}`);
  }

  async updatePageAdf(pageId, adfDoc, versionMessage) {
    const current = await this.getPage(pageId);
    const body = {
      id: String(pageId),
      status: 'current',
      title: current.title,
      body: {
        representation: 'atlas_doc_format',
        value: JSON.stringify(adfDoc),
      },
      version: {
        number: current.version.number + 1,
        message: versionMessage,
      },
    };
    return this.request('PUT', `/wiki/api/v2/pages/${pageId}`, body);
  }
}

module.exports = { AtlassianClient };
