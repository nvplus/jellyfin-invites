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
