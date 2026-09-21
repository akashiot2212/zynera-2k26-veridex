import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

export const presentationBucket = "veridex-presentations";

export function readableError(error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error || "Unknown error");
  if (/duplicate key|teams_event_id_team_id_key/i.test(message))
    return "This Team ID is already registered.";
  if (/jwt|session|refresh token/i.test(message))
    return "Your session has expired. Please sign in again.";
  if (/fetch|network|offline/i.test(message))
    return "No internet connection. Your draft is still on this device.";
  if (/row-level security|permission/i.test(message))
    return "You do not have permission to perform this action.";
  return message.replace(/^Error:\s*/i, "");
}

export function safeFilename(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^[_\.]+/, "")
      .slice(0, 120) || "presentation.pptx"
  );
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}
