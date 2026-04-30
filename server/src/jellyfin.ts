function headers(apiKey: string) {
  return {
    "Content-Type": "application/json",
    "X-Emby-Token": apiKey,
  };
}

function url(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path}`;
}

export async function verifyApiKey(jellyfinUrl: string, apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(url(jellyfinUrl, "/System/Info"), { headers: headers(apiKey) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function userExists(
  jellyfinUrl: string,
  apiKey: string,
  username: string,
): Promise<boolean> {
  const res = await fetch(url(jellyfinUrl, "/Users"), { headers: headers(apiKey) });
  if (!res.ok) throw new Error(`Jellyfin /Users failed: ${res.status}`);
  const users = (await res.json()) as Array<{ Name: string }>;
  return users.some((u) => u.Name.toLowerCase() === username.toLowerCase());
}

export async function createUser(
  jellyfinUrl: string,
  apiKey: string,
  username: string,
  password: string,
): Promise<{ id: string }> {
  const res = await fetch(url(jellyfinUrl, "/Users/New"), {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ Name: username, Password: password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jellyfin user creation failed (${res.status}): ${text}`);
  }
  const user = (await res.json()) as { Id: string };
  return { id: user.Id };
}

export type Library = { id: string; name: string };

export async function getLibraries(jellyfinUrl: string, apiKey: string): Promise<Library[]> {
  const res = await fetch(url(jellyfinUrl, "/Library/MediaFolders?IsHidden=false"), {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`Jellyfin /Library/MediaFolders failed: ${res.status}`);
  const data = (await res.json()) as { Items: Array<{ Id: string; Name: string }> };
  return data.Items.map((i) => ({ id: i.Id, name: i.Name }));
}

export async function setUserLibraries(
  jellyfinUrl: string,
  apiKey: string,
  userId: string,
  libraryIds: string[] | null,
): Promise<void> {
  // Fetch the user so we keep their current policy intact, then patch the
  // library-related fields.
  const userRes = await fetch(url(jellyfinUrl, `/Users/${userId}`), { headers: headers(apiKey) });
  if (!userRes.ok) throw new Error(`Jellyfin GET /Users/${userId} failed: ${userRes.status}`);
  const user = (await userRes.json()) as { Policy?: Record<string, unknown> };
  const policy = { ...(user.Policy ?? {}) };
  if (libraryIds === null) {
    policy.EnableAllFolders = true;
    policy.EnabledFolders = [];
  } else {
    policy.EnableAllFolders = false;
    policy.EnabledFolders = libraryIds;
  }
  const res = await fetch(url(jellyfinUrl, `/Users/${userId}/Policy`), {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(policy),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jellyfin set policy failed (${res.status}): ${text}`);
  }
}
