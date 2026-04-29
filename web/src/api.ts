export type Invite = {
  token: string;
  createdAt: number;
  expiresAt: number | null;
  maxUses: number;
  uses: number;
  revoked: boolean;
  label: string | null;
};

export function inviteUrl(token: string): string {
  return `${window.location.origin}/register/${token}`;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  session: () =>
    fetch("/api/session").then(json<{ authenticated: boolean; configured: boolean }>),
  login: (input: { apiKey: string; jellyfinUrl?: string }) =>
    fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then(json<{ ok: true }>),
  logout: () => fetch("/api/session", { method: "DELETE" }).then(json<{ ok: true }>),

  listInvites: () => fetch("/api/invites").then(json<{ invites: Invite[] }>),
  createInvite: (input: { expiresInHours?: number; maxUses?: number; label?: string }) =>
    fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then(json<Invite>),
  revokeInvite: (token: string) =>
    fetch(`/api/invites/${encodeURIComponent(token)}`, { method: "DELETE" }).then(json<{ ok: true }>),

  getInvite: (token: string) =>
    fetch(`/api/invite/${encodeURIComponent(token)}`).then(
      json<{ status: "valid" | "expired" | "exhausted" | "revoked"; expiresAt: number | null; remaining: number }>,
    ),
  register: (input: { token: string; username: string; password: string }) =>
    fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then(json<{ ok: true; jellyfinUrl: string }>),
};
