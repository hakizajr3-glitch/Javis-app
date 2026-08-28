import {
  BaseConnector,
  ConnectorCapability,
  ConnectorHealth,
  ConnectorId,
} from '../types.js';

export class GitHubConnector implements BaseConnector {
  id: ConnectorId;
  name: string;
  type: string;
  version: string;
  private token?: string;
  private baseUrl = 'https://api.github.com';

  constructor() {
    this.id = 'github' as ConnectorId;
    this.name = 'GitHub';
    this.type = 'github';
    this.version = '1.0.0';
  }

  async initialize(config: Record<string, any>): Promise<void> {
    this.token = config.token || config.accessToken;
  }

  async execute(capability: string, parameters: Record<string, any>): Promise<any> {
    switch (capability) {
      case 'search_repositories':
        return this.searchRepositories(parameters.query, parameters.limit);
      case 'get_repository':
        return this.getRepository(parameters.owner, parameters.repo);
      case 'list_issues':
        return this.listIssues(parameters.owner, parameters.repo, parameters.state);
      case 'create_issue':
        return this.createIssue(parameters.owner, parameters.repo, parameters.title, parameters.body);
      case 'get_pull_request':
        return this.getPullRequest(parameters.owner, parameters.repo, parameters.number);
      case 'create_pull_request':
        return this.createPullRequest(
          parameters.owner,
          parameters.repo,
          parameters.title,
          parameters.head,
          parameters.base,
          parameters.body
        );
      case 'search_code':
        return this.searchCode(parameters.query, parameters.limit);
      case 'list_commits':
        return this.listCommits(parameters.owner, parameters.repo, parameters.path, parameters.limit);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  }

  getCapabilities(): ConnectorCapability[] {
    return [
      {
        name: 'search_repositories',
        description: 'Search GitHub repositories',
        parameters: [
          { name: 'query', type: 'string', required: true, description: 'Search query' },
          { name: 'limit', type: 'number', required: false, description: 'Max results' },
        ],
        returns: 'array',
      },
      {
        name: 'get_repository',
        description: 'Get repository details',
        parameters: [
          { name: 'owner', type: 'string', required: true, description: 'Repository owner' },
          { name: 'repo', type: 'string', required: true, description: 'Repository name' },
        ],
        returns: 'object',
      },
      {
        name: 'list_issues',
        description: 'List repository issues',
        parameters: [
          { name: 'owner', type: 'string', required: true, description: 'Repository owner' },
          { name: 'repo', type: 'string', required: true, description: 'Repository name' },
          { name: 'state', type: 'string', required: false, description: 'open, closed, all' },
        ],
        returns: 'array',
      },
      {
        name: 'create_issue',
        description: 'Create a repository issue',
        parameters: [
          { name: 'owner', type: 'string', required: true, description: 'Repository owner' },
          { name: 'repo', type: 'string', required: true, description: 'Repository name' },
          { name: 'title', type: 'string', required: true, description: 'Issue title' },
          { name: 'body', type: 'string', required: false, description: 'Issue body' },
        ],
        returns: 'object',
      },
      {
        name: 'get_pull_request',
        description: 'Get a pull request',
        parameters: [
          { name: 'owner', type: 'string', required: true, description: 'Repository owner' },
          { name: 'repo', type: 'string', required: true, description: 'Repository name' },
          { name: 'number', type: 'number', required: true, description: 'PR number' },
        ],
        returns: 'object',
      },
      {
        name: 'create_pull_request',
        description: 'Create a pull request',
        parameters: [
          { name: 'owner', type: 'string', required: true, description: 'Repository owner' },
          { name: 'repo', type: 'string', required: true, description: 'Repository name' },
          { name: 'title', type: 'string', required: true, description: 'PR title' },
          { name: 'head', type: 'string', required: true, description: 'Head branch' },
          { name: 'base', type: 'string', required: true, description: 'Base branch' },
          { name: 'body', type: 'string', required: false, description: 'PR body' },
        ],
        returns: 'object',
      },
      {
        name: 'search_code',
        description: 'Search code across GitHub',
        parameters: [
          { name: 'query', type: 'string', required: true, description: 'Search query' },
          { name: 'limit', type: 'number', required: false, description: 'Max results' },
        ],
        returns: 'array',
      },
      {
        name: 'list_commits',
        description: 'List repository commits',
        parameters: [
          { name: 'owner', type: 'string', required: true, description: 'Repository owner' },
          { name: 'repo', type: 'string', required: true, description: 'Repository name' },
          { name: 'path', type: 'string', required: false, description: 'File path filter' },
          { name: 'limit', type: 'number', required: false, description: 'Max results' },
        ],
        returns: 'array',
      },
    ];
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const start = Date.now();
    try {
      await this.request('/user');
      return {
        connectorId: this.id,
        status: 'healthy',
        lastCheck: new Date(),
        latency: Date.now() - start,
        errorRate: 0,
      };
    } catch {
      return {
        connectorId: this.id,
        status: 'unhealthy',
        lastCheck: new Date(),
        latency: Date.now() - start,
        errorRate: 1,
      };
    }
  }

  async dispose(): Promise<void> {}

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers as Record<string, string> || {}),
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    const response = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
    if (!response.ok) {
      throw new Error(`GitHub API error ${response.status}: ${await response.text()}`);
    }
    return response.status === 204 ? undefined : await response.json();
  }

  private searchRepositories(query: string, limit = 10): Promise<any> {
    return this.request(`/search/repositories?q=${encodeURIComponent(query)}&per_page=${limit}`);
  }

  private getRepository(owner: string, repo: string): Promise<any> {
    return this.request(`/repos/${owner}/${repo}`);
  }

  private listIssues(owner: string, repo: string, state = 'open'): Promise<any> {
    return this.request(`/repos/${owner}/${repo}/issues?state=${state}`);
  }

  private createIssue(owner: string, repo: string, title: string, body?: string): Promise<any> {
    return this.request(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title, body }),
    });
  }

  private getPullRequest(owner: string, repo: string, number: number): Promise<any> {
    return this.request(`/repos/${owner}/${repo}/pulls/${number}`);
  }

  private createPullRequest(
    owner: string,
    repo: string,
    title: string,
    head: string,
    base: string,
    body?: string
  ): Promise<any> {
    return this.request(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify({ title, head, base, body }),
    });
  }

  private searchCode(query: string, limit = 10): Promise<any> {
    return this.request(`/search/code?q=${encodeURIComponent(query)}&per_page=${limit}`);
  }

  private listCommits(owner: string, repo: string, path?: string, limit = 10): Promise<any> {
    let url = `/repos/${owner}/${repo}/commits?per_page=${limit}`;
    if (path) url += `&path=${encodeURIComponent(path)}`;
    return this.request(url);
  }
}
