import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

type Status = "loading" | "valid" | "expired" | "exhausted" | "revoked" | "not_found";

export default function Register() {
  const { token = "" } = useParams();
  const [status, setStatus] = useState<Status>("loading");
  const [remaining, setRemaining] = useState<number>(0);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ jellyfinUrl: string } | null>(null);

  useEffect(() => {
    api
      .getInvite(token)
      .then((r) => {
        setStatus(r.status);
        setRemaining(r.remaining);
      })
      .catch(() => setStatus("not_found"));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.register({ token, username, password });
      setDone({ jellyfinUrl: r.jellyfinUrl });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return <div className="container">Loading…</div>;

  if (status !== "valid") {
    return (
      <div className="container">
        <h1>Invite unavailable</h1>
        <p className="muted">This invite is {status.replace("_", " ")}.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="container">
        <h1>Account created</h1>
        <p className="success">You can now sign in to Jellyfin.</p>
        <p>
          <a href={done.jellyfinUrl}>{done.jellyfinUrl}</a>
        </p>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Create your Jellyfin account</h1>
      <p className="muted">
        {remaining > 1 ? `${remaining} uses remaining on this invite.` : "Single-use invite."}
      </p>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}
