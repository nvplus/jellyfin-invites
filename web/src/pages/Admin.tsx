import { useEffect, useState } from "react";
import { api, inviteUrl, type Invite } from "../api";

export default function Admin() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "anon"; configured: boolean } | { kind: "authed" }
  >({ kind: "loading" });

  useEffect(() => {
    api.session().then((s) =>
      setState(s.authenticated ? { kind: "authed" } : { kind: "anon", configured: s.configured }),
    );
  }, []);

  if (state.kind === "loading") return <div className="container">Loading…</div>;
  if (state.kind === "anon")
    return (
      <Login
        configured={state.configured}
        onLoggedIn={() => setState({ kind: "authed" })}
      />
    );
  return <Dashboard onLoggedOut={() => setState({ kind: "anon", configured: true })} />;
}

function Login({
  configured,
  onLoggedIn,
}: {
  configured: boolean;
  onLoggedIn: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [jellyfinUrl, setJellyfinUrl] = useState("");
  const [publicJellyfinUrl, setPublicJellyfinUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.login({
        apiKey: apiKey.trim(),
        jellyfinUrl: configured ? undefined : jellyfinUrl.trim(),
        publicJellyfinUrl:
          configured || !publicJellyfinUrl.trim() ? undefined : publicJellyfinUrl.trim(),
      });
      onLoggedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = apiKey.trim() && (configured || jellyfinUrl.trim());

  return (
    <div className="container">
      <h1>Jellyfin Invites</h1>
      <p className="muted">
        {configured
          ? "Sign in with a Jellyfin API key to manage invites."
          : "First-time setup. Point this at your Jellyfin server and sign in."}
      </p>
      <div className="note">
        Generate an API key in Jellyfin → Dashboard → API Keys. The key is
        admin-equivalent — anyone with it can manage your Jellyfin server.
      </div>
      <form onSubmit={submit}>
        {!configured && (
          <>
            <div className="field">
              <label htmlFor="jellyfinUrl">Jellyfin URL</label>
              <input
                id="jellyfinUrl"
                type="text"
                value={jellyfinUrl}
                onChange={(e) => setJellyfinUrl(e.target.value)}
                placeholder="http://192.168.1.10:8096"
                autoFocus
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Used by this app to talk to Jellyfin (server-to-server).
              </div>
            </div>
            <div className="field">
              <label htmlFor="publicJellyfinUrl">Public Jellyfin URL (optional)</label>
              <input
                id="publicJellyfinUrl"
                type="text"
                value={publicJellyfinUrl}
                onChange={(e) => setPublicJellyfinUrl(e.target.value)}
                placeholder="https://jellyfin.example.com"
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Shown to users after registration. Defaults to the URL above if blank.
              </div>
            </div>
          </>
        )}
        <div className="field">
          <label htmlFor="apiKey">API Key</label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="paste your Jellyfin API key"
            autoFocus={configured}
          />
        </div>
        <button type="submit" disabled={busy || !canSubmit}>
          {busy ? "Verifying…" : configured ? "Sign in" : "Save & sign in"}
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

      <Settings />

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

function Settings() {
  const [jellyfinUrl, setJellyfinUrl] = useState("");
  const [publicJellyfinUrl, setPublicJellyfinUrl] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    api.getConfig().then((c) => {
      setJellyfinUrl(c.jellyfinUrl ?? "");
      setPublicJellyfinUrl(c.publicJellyfinUrl ?? "");
      setLoaded(true);
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await api.updateConfig({
        jellyfinUrl: jellyfinUrl.trim(),
        publicJellyfinUrl: publicJellyfinUrl.trim() || null,
      });
      setMsg({ kind: "ok", text: "Saved." });
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <>
      <h2 style={{ cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        Settings {open ? "▾" : "▸"}
      </h2>
      {open && (
        <form onSubmit={save}>
          <div className="field">
            <label htmlFor="cfg-url">Jellyfin URL</label>
            <input
              id="cfg-url"
              type="text"
              value={jellyfinUrl}
              onChange={(e) => setJellyfinUrl(e.target.value)}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Used by this app to talk to Jellyfin (server-to-server).
            </div>
          </div>
          <div className="field">
            <label htmlFor="cfg-pub">Public Jellyfin URL (optional)</label>
            <input
              id="cfg-pub"
              type="text"
              value={publicJellyfinUrl}
              onChange={(e) => setPublicJellyfinUrl(e.target.value)}
              placeholder="leave blank to reuse the URL above"
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Shown to users after registration.
            </div>
          </div>
          <button type="submit" disabled={saving || !jellyfinUrl.trim()}>
            {saving ? "Saving…" : "Save settings"}
          </button>
          {msg && <div className={msg.kind === "ok" ? "success" : "error"}>{msg.text}</div>}
        </form>
      )}
    </>
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
    await navigator.clipboard.writeText(inviteUrl(invite.token));
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
