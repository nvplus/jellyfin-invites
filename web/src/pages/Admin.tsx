import { useEffect, useState } from "react";
import { api, type Invite } from "../api";

export default function Admin() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    api.session().then((s) => setAuthed(s.authenticated));
  }, []);

  if (authed === null) return <div className="container">Loading…</div>;
  if (!authed) return <Login onLoggedIn={() => setAuthed(true)} />;
  return <Dashboard onLoggedOut={() => setAuthed(false)} />;
}

function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.login(apiKey);
      onLoggedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <h1>Jellyfin Invites</h1>
      <p className="muted">Sign in with a Jellyfin API key to manage invites.</p>
      <div className="note">
        Generate an API key in Jellyfin → Dashboard → API Keys. The key is
        admin-equivalent — anyone with it can manage your Jellyfin server.
      </div>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="apiKey">API Key</label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="paste your Jellyfin API key"
            autoFocus
          />
        </div>
        <button type="submit" disabled={busy || !apiKey.trim()}>
          {busy ? "Verifying…" : "Sign in"}
        </button>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}

function Dashboard({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [maxUses, setMaxUses] = useState(1);
  const [expiresInHours, setExpiresInHours] = useState<number | "">("");
  const [label, setLabel] = useState("");

  async function refresh() {
    try {
      const { invites } = await api.listInvites();
      setInvites(invites);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api.createInvite({
        maxUses: maxUses || 1,
        expiresInHours: typeof expiresInHours === "number" ? expiresInHours : undefined,
        label: label.trim() || undefined,
      });
      setLabel("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function revoke(token: string) {
    await api.revokeInvite(token);
    refresh();
  }

  async function logout() {
    await api.logout();
    onLoggedOut();
  }

  return (
    <div className="container">
      <div className="toolbar">
        <h1>Invites</h1>
        <button className="secondary" onClick={logout}>
          Sign out
        </button>
      </div>

      <h2>Generate invite</h2>
      <form onSubmit={create}>
        <div className="row">
          <div className="field">
            <label htmlFor="label">Label (optional)</label>
            <input
              id="label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Alice"
            />
          </div>
          <div className="field">
            <label htmlFor="maxUses">Max uses</label>
            <input
              id="maxUses"
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="expires">Expires in (hours)</label>
            <input
              id="expires"
              type="number"
              min={1}
              value={expiresInHours}
              onChange={(e) =>
                setExpiresInHours(e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder="never"
            />
          </div>
        </div>
        <button type="submit" disabled={creating}>
          {creating ? "Creating…" : "Create invite"}
        </button>
        {error && <div className="error">{error}</div>}
      </form>

      <h2>Existing</h2>
      {invites.length === 0 ? (
        <p className="muted">No invites yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Label</th>
              <th>Status</th>
              <th>Uses</th>
              <th>Expires</th>
              <th>Link</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invites.map((i) => (
              <InviteRow key={i.token} invite={i} onRevoke={() => revoke(i.token)} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function InviteRow({ invite, onRevoke }: { invite: Invite; onRevoke: () => void }) {
  const [copied, setCopied] = useState(false);

  const status: string = invite.revoked
    ? "revoked"
    : invite.expiresAt && invite.expiresAt < Date.now()
      ? "expired"
      : invite.uses >= invite.maxUses
        ? "exhausted"
        : "valid";

  async function copy() {
    await navigator.clipboard.writeText(invite.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <tr>
      <td>{invite.label ?? "—"}</td>
      <td className={`status-${status}`}>{status}</td>
      <td>
        {invite.uses} / {invite.maxUses}
      </td>
      <td>{invite.expiresAt ? new Date(invite.expiresAt).toLocaleString() : "never"}</td>
      <td className="token">
        <button className="secondary" onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </button>
      </td>
      <td>
        {!invite.revoked && status === "valid" && (
          <button className="secondary" onClick={onRevoke}>
            Revoke
          </button>
        )}
      </td>
    </tr>
  );
}
