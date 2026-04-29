import { env } from "./env.js";

function headers(apiKey: string) {
  return {
    "Content-Type": "application/json",
    "X-Emby-Token": apiKey,
  };
}

export async function verifyApiKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${env.JELLYFIN_URL}/System/Info`, { headers: headers(apiKey) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function userExists(apiKey: string, username: string): Promise<boolean> {
  const res = await fetch(`${env.JELLYFIN_URL}/Users`, { headers: headers(apiKey) });
  if (!res.ok) throw new Error(`Jellyfin /Users failed: ${res.status}`);
  const users = (await res.json()) as Array<{ Name: string }>;
  return users.some((u) => u.Name.toLowerCase() === username.toLowerCase());
}

export async function createUser(
  apiKey: string,
  username: string,
  password: string,
): Promise<{ id: string }> {
  const res = await fetch(`${env.JELLYFIN_URL}/Users/New`, {
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
