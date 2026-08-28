import { open } from '@tauri-apps/plugin-shell';

const COMPOSIO_BASE_URL = 'https://backend.composio.dev/api/v1';
const COMPOSIO_DOCS_BASE = 'https://docs.composio.dev/docs/tools';

const toolNameMap: Record<string, string> = {
  gmail: 'gmail',
  slack: 'slack',
  discord: 'discord',
  telegram: 'telegram',
  whatsapp: 'whatsapp-business',
  'google-calendar': 'google-calendar',
  'outlook-calendar': 'outlook-calendar',
  calendly: 'calendly',
  'google-drive': 'google-drive',
  dropbox: 'dropbox',
  onedrive: 'onedrive',
  github: 'github',
  gitlab: 'gitlab',
  jira: 'jira',
  notion: 'notion',
  trello: 'trello',
  asana: 'asana',
  salesforce: 'salesforce',
  hubspot: 'hubspot',
  stripe: 'stripe',
  quickbooks: 'quickbooks',
  composio: 'composio',
  zapier: 'zapier',
  make: 'make',
  zoom: 'zoom',
  'google-meet': 'google-meet',
  teams: 'microsoft-teams',
};

export function getComposioDocsUrl(integrationId: string): string {
  const tool = toolNameMap[integrationId] ?? integrationId;
  return `${COMPOSIO_DOCS_BASE}/${tool}`;
}

export async function openComposioAuthDocs(integrationId: string): Promise<void> {
  const url = getComposioDocsUrl(integrationId);
  try {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      await open(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch (e) {
    console.warn('[composioAuth] failed to open auth docs:', e);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

interface AuthLinkRequest {
  apiKey: string;
  authConfigId: string;
  userId: string;
  callbackUrl: string;
}

export async function initiateComposioAuthLink({
  apiKey,
  authConfigId,
  userId,
  callbackUrl,
}: AuthLinkRequest): Promise<string> {
  const res = await fetch(`${COMPOSIO_BASE_URL}/connectedAccounts/link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      userId,
      authConfigId,
      callbackUrl,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Composio auth link failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const redirectUrl = data?.redirectUrl || data?.redirect_url;
  if (!redirectUrl) {
    throw new Error('Composio response did not include a redirect URL');
  }
  return redirectUrl as string;
}

export async function openComposioAuthLink(redirectUrl: string): Promise<void> {
  try {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      await open(redirectUrl);
    } else {
      window.open(redirectUrl, '_blank', 'noopener,noreferrer');
    }
  } catch (e) {
    console.warn('[composioAuth] failed to open auth link:', e);
    window.open(redirectUrl, '_blank', 'noopener,noreferrer');
  }
}

export async function openComposioSignup(): Promise<void> {
  const url = 'https://app.composio.dev/signup';
  try {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      await open(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch (e) {
    console.warn('[composioAuth] failed to open signup:', e);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export async function openComposioMcp(): Promise<void> {
  const url = 'https://connect.composio.dev/mcp';
  try {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      await open(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch (e) {
    console.warn('[composioAuth] failed to open mcp:', e);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
