import { aiConfigured, AI_MODEL } from "./ai/assistant";
import { googleOAuthConfigured, hasCalendarWriteScope } from "./google/oauth";
import { getSession, sessionSecretConfigured } from "./session";
import { getAdminClient, storageConfigured } from "./supabase/admin";
import type { Viewer } from "./types";

export async function getViewer(): Promise<Viewer> {
  const base: Viewer = {
    authConfigured: googleOAuthConfigured() && sessionSecretConfigured(),
    signedIn: false,
    userId: null,
    email: null,
    name: null,
    avatarUrl: null,
    connected: false,
    canWrite: false,
    connectionStatus: null,
    googleEmail: null,
    connectedAt: null,
    scopes: [],
    aiConfigured: aiConfigured(),
    aiModel: AI_MODEL,
    storageConfigured: storageConfigured(),
  };

  const session = await getSession();
  if (!session) return base;

  const admin = getAdminClient();
  if (!admin) {
    return {
      ...base,
      signedIn: true,
      userId: session.userId,
      email: session.email || null,
      name: session.name,
      avatarUrl: session.picture,
    };
  }

  const { data: connection } = await admin
    .from("calendar_connections")
    .select("status, google_email, scopes, connected_at")
    .eq("user_id", session.userId)
    .maybeSingle();

  const scopes = (connection?.scopes as string[] | null) ?? [];

  return {
    ...base,
    signedIn: true,
    userId: session.userId,
    email: session.email || null,
    name: session.name,
    avatarUrl: session.picture,
    connected: connection?.status === "connected",
    canWrite:
      connection?.status === "connected" && hasCalendarWriteScope(scopes),
    connectionStatus: connection?.status ?? null,
    googleEmail: connection?.google_email ?? null,
    connectedAt: connection?.connected_at ?? null,
    scopes,
  };
}
