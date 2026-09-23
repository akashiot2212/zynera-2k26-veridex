"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Archive,
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  CloudOff,
  Download,
  FileArchive,
  FileText,
  FileSpreadsheet,
  Info,
  LayoutDashboard,
  ListOrdered,
  Loader2,
  Menu,
  Pencil,
  Play,
  Plus,
  Presentation,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  UserRoundPlus,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Toaster } from "@/components/ui/sonner";
import { demoActivity, demoEvent, demoTeams } from "../lib/demo";
import {
  formatBytes,
  isSupabaseConfigured,
  presentationBucket,
  readableError,
  supabase,
} from "../lib/supabase";
import type {
  ActivityLog,
  EventRecord,
  Participant,
  PresentationStatus,
  Team,
  TeamDraft,
} from "../lib/types";

type View =
  | "dashboard"
  | "collection"
  | "teams"
  | "presentation"
  | "activity"
  | "export"
  | "settings"
  | "about";
type SortKey = "team_id" | "participant" | "college" | "uploaded" | "order";
const statusOptions: PresentationStatus[] = [
  "Waiting",
  "Presenting",
  "Presented",
  "Delayed",
  "Absent",
];
const emptyParticipant = (n: number): Participant => ({
  participant_name: "",
  participant_number: n,
});
const emptyDraft = (): TeamDraft => ({
  team_id: "",
  team_name: "",
  college_name: "",
  participants: [emptyParticipant(1)],
});
const draftKey = "veridex-team-draft-v1";
function initials(value?: string | null) {
  return (value || "Coordinator")
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((v) => v[0]?.toUpperCase())
    .join("");
}
function when(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function VeridexApp() {
  const [participantMode] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("participant-upload") ===
        "1",
  );
  const [onSpotMode] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("onsite-registration") ===
        "1",
  );
  const [authLoading, setAuthLoading] = useState(false);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [view, setView] = useState<View>("dashboard");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [event, setEvent] = useState<EventRecord>(demoEvent);
  const [teams, setTeams] = useState<Team[]>(
    isSupabaseConfigured ? [] : demoTeams,
  );
  const [activity, setActivity] = useState<ActivityLog[]>(
    isSupabaseConfigured ? [] : demoActivity,
  );
  const [profileName, setProfileName] = useState("Akash");
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All Teams");
  const [college, setCollege] = useState("All colleges");
  const [sort, setSort] = useState<SortKey>("team_id");
  const [collectionTab, setCollectionTab] = useState("Pending");
  const [formOpen, setFormOpen] = useState(false);
  const [detailTeam, setDetailTeam] = useState<Team | null>(null);
  const [draft, setDraft] = useState<TeamDraft>(emptyDraft());
  const [savingTeam, setSavingTeam] = useState(false);
  const [uploading, setUploading] = useState<Record<string, number>>({});
  const [confirmDelete, setConfirmDelete] = useState<{
    type: "team" | "ppt";
    team: Team;
  } | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [expectedInput, setExpectedInput] = useState("50");
  const [resetText, setResetText] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const coordinatorId = null;
  const coordinatorEmail = "Shared coordinator workspace";
  const demoMode = !isSupabaseConfigured;

  const loadData = useCallback(
    async (quiet = false) => {
      if (!supabase) return;
      if (!quiet) setLoading(true);
      try {
        const { data: eventRows, error: eventError } = await supabase
          .from("events")
          .select("*")
          .eq("event_code", "VERIDEX")
          .limit(1);
        if (eventError) throw eventError;
        const currentEvent = eventRows?.[0] as EventRecord | undefined;
        if (!currentEvent)
          throw new Error("Your account is not assigned to the VERIDEX event.");
        setEvent(currentEvent);
        setExpectedInput(String(currentEvent.expected_teams));
        const [
          { data: teamRows, error: teamError },
          { data: logRows, error: logError },
        ] = await Promise.all([
          supabase
            .from("teams")
            .select("*,participants(*),presentations(*)")
            .eq("event_id", currentEvent.id)
            .order("presentation_order"),
          supabase
            .from("activity_logs")
            .select("*,team:teams(team_id)")
            .eq("event_id", currentEvent.id)
            .order("created_at", { ascending: false })
            .limit(100),
        ]);
        if (teamError) throw teamError;
        if (logError) throw logError;
        const normalizedTeams = (teamRows || []).map((team) => ({
          ...team,
          participants: Array.isArray(team.participants)
            ? team.participants
            : team.participants
              ? [team.participants]
              : [],
          presentations: Array.isArray(team.presentations)
            ? team.presentations
            : team.presentations
              ? [team.presentations]
              : [],
        })) as Team[];
        setTeams(normalizedTeams);
        setActivity((logRows || []) as ActivityLog[]);
        setProfileName("Coordinator");
      } catch (error) {
        toast.error(readableError(error));
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [],
  );
  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => {
      setOnline(true);
      setSyncing(true);
      void loadData(true);
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [loadData]);
  useEffect(() => {
    if (supabase) void loadData();
  }, [loadData]);
  useEffect(() => {
    if (!supabase || !event.id) return;
    const client = supabase;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      timer && clearTimeout(timer);
      timer = setTimeout(() => void loadData(true), 180);
    };
    const channel = supabase
      .channel(`veridex-${event.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "teams",
          filter: `event_id=eq.${event.id}`,
        },
        (payload) => {
          refresh();
          const next = payload.new as { team_id?: string };
          if (next?.team_id)
            toast.info(`${next.team_id} was updated by another coordinator.`);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "presentations" },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_logs",
          filter: `event_id=eq.${event.id}`,
        },
        (payload) => {
          const row = payload.new as ActivityLog;
          if (row.coordinator_id !== coordinatorId) toast.info(row.description);
          refresh();
        },
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [event.id, coordinatorId, loadData]);

  const logAction = async (
    team: Team | null,
    type: string,
    description: string,
  ) => {
    if (!supabase || demoMode) {
      setActivity((old) => [
        {
          id: crypto.randomUUID(),
          event_id: event.id,
          team_id: team?.id || null,
          coordinator_id: coordinatorId,
          action_type: type,
          description,
          created_at: new Date().toISOString(),
          team: team ? { team_id: team.team_id } : null,
          profile: { full_name: profileName, email: coordinatorEmail },
        },
        ...old,
      ]);
      return;
    }
    const { error } = await supabase
      .from("activity_logs")
      .insert({
        event_id: event.id,
        team_id: team?.id || null,
        coordinator_id: coordinatorId,
        action_type: type,
        description,
      });
    if (error) console.error("Activity log failed", error);
  };
  const stats = useMemo(
    () => ({
      total: teams.length,
      participants: teams.reduce((sum, t) => sum + t.participants.length, 0),
      received: teams.filter((t) => t.ppt_status === "Received").length,
      pending: teams.filter((t) => t.ppt_status === "Pending").length,
      presented: teams.filter((t) => t.presentation_status === "Presented")
        .length,
      delayed: teams.filter((t) => t.presentation_status === "Delayed").length,
      absent: teams.filter((t) => t.presentation_status === "Absent").length,
      waiting: teams.filter((t) => t.presentation_status === "Waiting").length,
    }),
    [teams],
  );
  const percent = Math.min(
    100,
    Math.round((stats.received / Math.max(1, event.expected_teams)) * 100),
  );
  const visibleTeams = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = teams.filter((team) => {
      const haystack = [
        team.team_id,
        team.team_name,
        team.college_name,
        ...team.participants.map((p) => p.participant_name),
        team.presentations[0]?.original_filename,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const primary =
        filter === "All Teams" ||
        (filter === "PPT Received" && team.ppt_status === "Received") ||
        (filter === "PPT Pending" && team.ppt_status === "Pending") ||
        team.presentation_status === filter;
      return (
        (!q || haystack.includes(q)) &&
        primary &&
        (college === "All colleges" || team.college_name === college)
      );
    });
    return list.sort((a, b) => {
      if (sort === "order") return a.presentation_order - b.presentation_order;
      if (sort === "college")
        return a.college_name.localeCompare(b.college_name);
      if (sort === "participant")
        return (a.participants[0]?.participant_name || "").localeCompare(
          b.participants[0]?.participant_name || "",
        );
      if (sort === "uploaded")
        return (b.presentations[0]?.uploaded_at || "").localeCompare(
          a.presentations[0]?.uploaded_at || "",
        );
      return a.team_id.localeCompare(b.team_id, undefined, { numeric: true });
    });
  }, [teams, search, filter, college, sort]);
  const colleges = useMemo(
    () => Array.from(new Set(teams.map((t) => t.college_name))).sort(),
    [teams],
  );
  const queue = useMemo(
    () =>
      [...teams].sort((a, b) => a.presentation_order - b.presentation_order),
    [teams],
  );
  const currentTeam =
    queue[currentIndex] ||
    queue.find((t) => t.presentation_status === "Presenting") ||
    queue[0];
  const navigate = (next: View) => {
    setView(next);
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const nextTeamCode = () =>
    `VER${String(Math.max(0, ...teams.map((t) => Number(t.team_id.replace(/\D/g, "")) || 0)) + 1).padStart(3, "0")}`;
  const openTeamForm = (team?: Team) => {
    const saved = !team ? localStorage.getItem(draftKey) : null;
    const value = team
      ? {
          id: team.id,
          team_id: team.team_id,
          team_name: team.team_name || "",
          college_name: team.college_name,
          participants: team.participants.map((p) => ({ ...p })),
          updated_at: team.updated_at,
        }
      : saved
        ? JSON.parse(saved)
        : { ...emptyDraft(), team_id: nextTeamCode() };
    setDraft(value);
    setFormOpen(true);
  };
  const updateDraft = (next: TeamDraft) => {
    setDraft(next);
    if (!next.id) localStorage.setItem(draftKey, JSON.stringify(next));
  };

  async function saveTeam() {
    if (!draft.team_id) updateDraft({ ...draft, team_id: nextTeamCode() });
    if (
      !draft.college_name.trim() ||
      !draft.team_id ||
      draft.participants.some(
        (p) => !p.participant_name.trim(),
      )
    ) {
      toast.error(
        "Add a valid Team ID, college, and every participant name.",
      );
      return;
    }
    if (teams.some((t) => t.team_id === draft.team_id && t.id !== draft.id)) {
      toast.error(`${draft.team_id} is already registered.`);
      return;
    }
    setSavingTeam(true);
    try {
      if (demoMode) {
        const now = new Date().toISOString();
        if (draft.id)
          setTeams((old) =>
            old.map((t) =>
              t.id === draft.id
                ? {
                    ...t,
                    team_id: draft.team_id,
                    team_name: draft.team_name || null,
                    college_name: draft.college_name,
                    participants: draft.participants,
                    updated_at: now,
                    updated_by: coordinatorId,
                  }
                : t,
            ),
          );
        else
          setTeams((old) => [
            ...old,
            {
              id: crypto.randomUUID(),
              event_id: event.id,
              team_id: draft.team_id,
              team_name: draft.team_name || null,
              college_name: draft.college_name,
              ppt_status: "Pending",
              presentation_status: "Waiting",
              presentation_order: old.length + 1,
              created_by: coordinatorId,
              created_at: now,
              updated_by: coordinatorId,
              updated_at: now,
              participants: draft.participants,
              presentations: [],
            },
          ]);
      } else if (supabase) {
        let teamId = draft.id;
        if (draft.id) {
          const { data, error } = await supabase
            .from("teams")
            .update({
              team_id: draft.team_id,
              team_name: draft.team_name || null,
              college_name: draft.college_name,
              updated_by: coordinatorId,
            })
            .eq("id", draft.id)
            .eq("updated_at", draft.updated_at)
            .select("id");
          if (error) throw error;
          if (!data?.length)
            throw new Error(
              "This team was updated by another coordinator. Reload and review their changes before saving yours.",
            );
          const { error: removeError } = await supabase
            .from("participants")
            .delete()
            .eq("team_id", draft.id);
          if (removeError) throw removeError;
        } else {
          const { data, error } = await supabase
            .from("teams")
            .insert({
              event_id: event.id,
              team_id: draft.team_id,
              team_name: draft.team_name || null,
              college_name: draft.college_name,
              presentation_order: teams.length + 1,
              created_by: coordinatorId,
              updated_by: coordinatorId,
            })
            .select("id")
            .single();
          if (error) throw error;
          teamId = data.id;
        }
        const { error } = await supabase
          .from("participants")
          .insert(
            draft.participants.map((p, i) => ({
              team_id: teamId,
              participant_name: p.participant_name.trim(),
              participant_number: i + 1,
            })),
          );
        if (error) throw error;
        await loadData(true);
      }
      await logAction(
        teams.find((t) => t.id === draft.id) || null,
        draft.id ? "team_edited" : "team_created",
        `${draft.team_id} ${draft.id ? "details updated" : "registered"} by ${profileName}`,
      );
      localStorage.removeItem(draftKey);
      setFormOpen(false);
      toast.success(`${draft.team_id} saved successfully.`);
    } catch (error) {
      toast.error(readableError(error));
    } finally {
      setSavingTeam(false);
    }
  }
  async function uploadPpt(team: Team, file?: File) {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["ppt", "pptx"].includes(ext)) {
      toast.error("Unsupported file. Choose a .ppt or .pptx presentation.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("The presentation is larger than the 50 MB limit.");
      return;
    }
    setUploading((v) => ({ ...v, [team.id]: 15 }));
    try {
      // Keep the original name as metadata, but give every stored presentation
      // one predictable Paper ID filename for easy event-day identification.
      const stored = `${team.team_id}.${ext}`;
      const path = `${event.id}/${team.team_id}/${stored}`;
      if (demoMode) {
        await new Promise((r) => setTimeout(r, 450));
        setUploading((v) => ({ ...v, [team.id]: 65 }));
        await new Promise((r) => setTimeout(r, 350));
        const presentation = {
          id: crypto.randomUUID(),
          team_id: team.id,
          original_filename: file.name,
          stored_filename: stored,
          storage_path: path,
          file_size: file.size,
          uploaded_by: coordinatorId,
          uploader_name: profileName,
          uploaded_at: new Date().toISOString(),
        };
        setTeams((old) =>
          old.map((t) =>
            t.id === team.id
              ? {
                  ...t,
                  ppt_status: "Received",
                  presentations: [presentation],
                  updated_at: new Date().toISOString(),
                }
              : t,
          ),
        );
      } else if (supabase) {
        const existing = team.presentations[0];
        setUploading((v) => ({ ...v, [team.id]: 42 }));
        const { error: storageError } = await supabase.storage
          .from(presentationBucket)
          .upload(path, file, {
            upsert: true,
            contentType:
              file.type ||
              (ext === "ppt"
                ? "application/vnd.ms-powerpoint"
                : "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
          });
        if (storageError) throw storageError;
        setUploading((v) => ({ ...v, [team.id]: 76 }));
        const record = {
          team_id: team.id,
          original_filename: file.name,
          stored_filename: stored,
          storage_path: path,
          file_size: file.size,
          uploaded_by: coordinatorId,
          uploaded_at: new Date().toISOString(),
        };
        const { error: metaError } = await supabase
          .from("presentations")
          .upsert(record, { onConflict: "team_id" });
        if (metaError) throw metaError;
        const { error: teamError } = await supabase
          .from("teams")
          .update({ ppt_status: "Received", updated_by: coordinatorId })
          .eq("id", team.id);
        if (teamError) throw teamError;
        if (existing && existing.storage_path !== path)
          await supabase.storage
            .from(presentationBucket)
            .remove([existing.storage_path]);
        await loadData(true);
      }
      await logAction(
        team,
        team.ppt_status === "Received" ? "ppt_replaced" : "ppt_uploaded",
        `${team.team_id} PPT ${team.ppt_status === "Received" ? "replaced" : "uploaded"} by ${profileName}`,
      );
      setUploading((v) => ({ ...v, [team.id]: 100 }));
      toast.success(`${team.team_id} PPT uploaded successfully.`);
    } catch (error) {
      toast.error(`Upload failed. ${readableError(error)}`);
    } finally {
      setTimeout(
        () =>
          setUploading((v) => {
            const n = { ...v };
            delete n[team.id];
            return n;
          }),
        700,
      );
    }
  }
  async function openPpt(team: Team, download = false) {
    const ppt = team.presentations[0];
    if (!ppt) {
      toast.error("No PPT has been uploaded for this team.");
      return;
    }
    if (demoMode) {
      toast.info(
        "Presentation files become available after Supabase is connected.",
      );
      return;
    }
    if (!supabase) return;
    const { data, error } = await supabase.storage
      .from(presentationBucket)
      .createSignedUrl(
        ppt.storage_path,
        300,
        download ? { download: ppt.stored_filename } : undefined,
      );
    if (error) {
      toast.error(readableError(error));
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  async function removePpt(team: Team) {
    const ppt = team.presentations[0];
    if (!ppt) return;
    try {
      if (demoMode)
        setTeams((old) =>
          old.map((t) =>
            t.id === team.id
              ? { ...t, ppt_status: "Pending", presentations: [] }
              : t,
          ),
        );
      else if (supabase) {
        const { error: storageError } = await supabase.storage
          .from(presentationBucket)
          .remove([ppt.storage_path]);
        if (storageError) throw storageError;
        const { error } = await supabase
          .from("presentations")
          .delete()
          .eq("team_id", team.id);
        if (error) throw error;
        await supabase
          .from("teams")
          .update({ ppt_status: "Pending", updated_by: coordinatorId })
          .eq("id", team.id);
        await loadData(true);
      }
      await logAction(
        team,
        "ppt_removed",
        `${team.team_id} PPT removed by ${profileName}`,
      );
      toast.success(`${team.team_id} PPT removed.`);
    } catch (error) {
      toast.error(readableError(error));
    } finally {
      setConfirmDelete(null);
    }
  }
  async function deleteTeam(team: Team) {
    try {
      if (demoMode) setTeams((old) => old.filter((t) => t.id !== team.id));
      else if (supabase) {
        if (team.presentations[0])
          await supabase.storage
            .from(presentationBucket)
            .remove([team.presentations[0].storage_path]);
        const { error } = await supabase
          .from("teams")
          .delete()
          .eq("id", team.id);
        if (error) throw error;
        await loadData(true);
      }
      await logAction(
        null,
        "team_deleted",
        `${team.team_id} deleted by ${profileName}`,
      );
      toast.success(`${team.team_id} deleted.`);
    } catch (error) {
      toast.error(readableError(error));
    } finally {
      setConfirmDelete(null);
    }
  }
  async function changeStatus(team: Team, status: PresentationStatus) {
    try {
      if (demoMode)
        setTeams((old) =>
          old.map((t) =>
            t.id === team.id
              ? {
                  ...t,
                  presentation_status: status,
                  updated_at: new Date().toISOString(),
                }
              : status === "Presenting" &&
                  t.presentation_status === "Presenting"
                ? { ...t, presentation_status: "Waiting" }
                : t,
          ),
        );
      else if (supabase) {
        if (status === "Presenting")
          await supabase
            .from("teams")
            .update({
              presentation_status: "Waiting",
              updated_by: coordinatorId,
            })
            .eq("event_id", event.id)
            .eq("presentation_status", "Presenting");
        const { error } = await supabase
          .from("teams")
          .update({ presentation_status: status, updated_by: coordinatorId })
          .eq("id", team.id);
        if (error) throw error;
        await loadData(true);
      }
      await logAction(
        team,
        "presentation_status_changed",
        `${team.team_id} marked as ${status} by ${profileName}`,
      );
      toast.success(`${team.team_id} marked as ${status}.`);
    } catch (error) {
      toast.error(readableError(error));
    }
  }
  async function moveTeam(team: Team, direction: "up" | "down" | "end") {
    const ordered = [...queue];
    const from = ordered.findIndex((t) => t.id === team.id);
    if (from < 0) return;
    const to =
      direction === "end"
        ? ordered.length - 1
        : Math.max(
            0,
            Math.min(ordered.length - 1, from + (direction === "up" ? -1 : 1)),
          );
    if (from === to) return;
    ordered.splice(to, 0, ordered.splice(from, 1)[0]);
    const changed = ordered.map((t, i) => ({
      ...t,
      presentation_order: i + 1,
    }));
    setTeams(changed);
    try {
      if (!demoMode && supabase) {
        const client = supabase;
        const results = await Promise.all(
          changed.map((t) =>
            client
              .from("teams")
              .update({
                presentation_order: t.presentation_order,
                updated_by: coordinatorId,
              })
              .eq("id", t.id),
          ),
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;
      }
      await logAction(
        team,
        "queue_reordered",
        `${team.team_id} presentation order updated by ${profileName}`,
      );
      toast.success("Presentation order updated.");
    } catch (error) {
      toast.error(readableError(error));
      await loadData(true);
    }
  }

  async function buildExcel() {
    const XLSX = await import("xlsx");
    const headers = [
      "S.No",
      "Team ID",
      "Team Name",
      "Participant Names",
      "College Name",
      "PPT Status",
      "PPT Filename",
      "Paper ID",
      "Presentation Status",
      "Presentation Order",
      "Uploaded By",
      "Upload Date",
      "Upload Time",
      "Last Modified By",
      "Last Modified Time",
    ];
    const rows = [...teams]
      .sort((a, b) => a.presentation_order - b.presentation_order)
      .map((t, i) => {
        const p = [...t.participants].sort(
          (a, b) => a.participant_number - b.participant_number,
        );
        const ppt = t.presentations[0];
        const uploaded = ppt ? new Date(ppt.uploaded_at) : null;
        return [
          i + 1,
          t.team_id.replace(/^VER/i, ""),
          t.team_name || "",
          p.map((participant) => participant.participant_name).join(", "),
          t.college_name,
          t.ppt_status,
          ppt?.stored_filename || "",
          ppt ? t.team_id : "",
          t.presentation_status,
          t.presentation_order,
          ppt?.uploader?.full_name || ppt?.uploader?.email || ppt?.uploader_name || profileName,
          uploaded ? uploaded.toLocaleDateString("en-IN") : "",
          uploaded ? uploaded.toLocaleTimeString("en-IN") : "",
          profileName,
          when(t.updated_at),
        ];
      });
    const ws = XLSX.utils.aoa_to_sheet([
      ["ZYNERA 2K26"],
      ["VERIDEX – Paper Presentation"],
      ["Participant & Presentation List"],
      [],
      headers,
      ...rows,
    ]);
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: headers.length - 1 } },
    ];
    ws["!cols"] = headers.map((h, i) => ({
      wch: i === 15 ? 34 : Math.max(12, Math.min(28, h.length + 3)),
    }));
    ws["!autofilter"] = {
      ref: `A5:${XLSX.utils.encode_col(headers.length - 1)}${rows.length + 5}`,
    };
    ws["!freeze"] = { xSplit: 0, ySplit: 5 } as never;
    rows.forEach((row, index) => {
      const cell = ws[XLSX.utils.encode_cell({ r: index + 5, c: 18 })];
      if (cell?.v)
        cell.l = {
          Target: String(cell.v),
          Tooltip: "Open private presentation link (expires in one hour)",
        };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "VERIDEX Teams");
    return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  }
  async function exportExcel() {
    try {
      const bytes = await buildExcel();
      downloadBlob(
        new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        "VERIDEX_ZYNERA_2K26.xlsx",
      );
      await logAction(
        null,
        "excel_exported",
        `Excel participant list exported by ${profileName}`,
      );
      toast.success("Excel participant list downloaded.");
    } catch (error) {
      toast.error(readableError(error));
    }
  }
  async function downloadPpts(complete = false) {
    if (demoMode || !supabase) {
      toast.info(
        "PPT ZIP export becomes available after Supabase is connected.",
      );
      return;
    }
    const id = toast.loading("Preparing presentation archive…");
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const folder = complete
        ? zip.folder("ZYNERA_2K26_VERIDEX")?.folder("Presentations")
        : zip;
      const receivedTeams = teams.filter((t) => t.presentations[0]);
      if (!receivedTeams.length) {
        toast.info("There are no uploaded PPT files to include yet.", { id });
        return;
      }
      for (const team of receivedTeams) {
        const ppt = team.presentations[0];
        let { data, error } = await supabase.storage
          .from(presentationBucket)
          .download(ppt.storage_path);
        if (error || !data) {
          const publicUrl = supabase.storage
            .from(presentationBucket)
            .getPublicUrl(ppt.storage_path).data.publicUrl;
          const response = await fetch(publicUrl);
          if (!response.ok)
            throw error || new Error("Could not download " + ppt.stored_filename);
          data = await response.blob();
        }
        folder?.file(ppt.stored_filename, data);
      }
      if (complete) {
        const bytes = await buildExcel();
        zip
          .folder("ZYNERA_2K26_VERIDEX")
          ?.file("VERIDEX_Participant_List.xlsx", bytes);
      }
      const blob = await zip.generateAsync(
        { type: "blob", compression: "DEFLATE" },
        (meta) =>
          toast.loading(`Preparing archive · ${Math.round(meta.percent)}%`, {
            id,
          }),
      );
      downloadBlob(
        blob,
        complete ? "ZYNERA_2K26_VERIDEX.zip" : "VERIDEX_PPTs.zip",
      );
      toast.success("Archive downloaded.", { id });
    } catch (error) {
      toast.error(readableError(error), { id });
    }
  }
  function downloadBackup() {
    const payload = {
      format: "veridex-backup",
      version: 1,
      exported_at: new Date().toISOString(),
      event,
      teams,
      activity,
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
      `VERIDEX_Backup_${new Date().toISOString().slice(0, 10)}.json`,
    );
    toast.success("Backup downloaded.");
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (
        payload?.format !== "veridex-backup" ||
        payload?.version !== 1 ||
        !Array.isArray(payload.teams)
      )
        throw new Error("This is not a valid VERIDEX backup.");
      if (
        !confirm(
          `Restore ${payload.teams.length} teams? Existing matching Team IDs may be updated. PPT file references will be restored only when the stored files still exist.`,
        )
      )
        return;
      if (demoMode) {
        setTeams(payload.teams);
        setActivity(payload.activity || []);
        toast.success("Backup restored in preview mode.");
        return;
      }
      if (!supabase) return;
      setSyncing(true);
      for (const item of payload.teams as Team[]) {
        const { data: saved, error } = await supabase
          .from("teams")
          .upsert(
            {
              event_id: event.id,
              team_id: item.team_id,
              team_name: item.team_name,
              college_name: item.college_name,
              ppt_status: item.ppt_status,
              presentation_status: item.presentation_status,
              presentation_order: item.presentation_order,
              updated_by: coordinatorId,
            },
            { onConflict: "event_id,team_id" },
          )
          .select("id")
          .single();
        if (error) throw error;
        await supabase.from("participants").delete().eq("team_id", saved.id);
        const participants = item.participants.map((p, i) => ({
          team_id: saved.id,
          participant_name: p.participant_name,
          participant_number: i + 1,
        }));
        if (participants.length) {
          const { error: partError } = await supabase
            .from("participants")
            .insert(participants);
          if (partError) throw partError;
        }
      }
      await loadData(true);
      await logAction(
        null,
        "backup_restored",
        `Backup restored by ${profileName}`,
      );
      toast.success("Backup restored successfully.");
    } catch (error) {
      toast.error(readableError(error));
    } finally {
      setSyncing(false);
      if (importRef.current) importRef.current.value = "";
    }
  }
  async function saveSettings() {
    const expected = Number(expectedInput);
    if (!Number.isInteger(expected) || expected < teams.length) {
      toast.error(
        `Expected teams must be a whole number of at least ${teams.length}.`,
      );
      return;
    }
    try {
      if (demoMode) setEvent((e) => ({ ...e, expected_teams: expected }));
      else if (supabase) {
        const { error } = await supabase
          .from("events")
          .update({
            expected_teams: expected,
            allow_new_teams: event.allow_new_teams,
          })
          .eq("id", event.id);
        if (error) throw error;
        await loadData(true);
      }
      toast.success("Event settings saved.");
    } catch (error) {
      toast.error(readableError(error));
    }
  }
  async function resetEvent() {
    if (resetText !== "DELETE VERIDEX DATA") return;
    try {
      if (demoMode) {
        setTeams([]);
        setActivity([]);
      } else if (supabase) {
        const paths = teams.flatMap((t) =>
          t.presentations.map((p) => p.storage_path),
        );
        if (paths.length)
          await supabase.storage.from(presentationBucket).remove(paths);
        const { error } = await supabase
          .from("teams")
          .delete()
          .eq("event_id", event.id);
        if (error) throw error;
        await loadData(true);
      }
      setResetText("");
      toast.success("Event data was reset.");
    } catch (error) {
      toast.error(readableError(error));
    }
  }

  useEffect(() => {
    const context =
      typeof document === "undefined"
        ? undefined
        : (
            document as Document & {
              modelContext?: {
                registerTool: (tool: unknown, options?: unknown) => unknown;
              };
            }
          ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: unknown) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => undefined);
      } catch {}
    };
    register({
      name: "search_veridex_teams",
      title: "Search VERIDEX teams",
      description:
        "Search teams by team ID, participant, college, or PPT filename.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input: unknown) => {
        const q = String(
          (input as { query?: string }).query || "",
        ).toLowerCase();
        return teams
          .filter((t) =>
            [
              t.team_id,
              t.team_name,
              t.college_name,
              ...t.participants.map((p) => p.participant_name),
            ]
              .join(" ")
              .toLowerCase()
              .includes(q),
          )
          .slice(0, 20)
          .map((t) => ({
            teamId: t.team_id,
            college: t.college_name,
            pptStatus: t.ppt_status,
            presentationStatus: t.presentation_status,
          }));
      },
    });
    register({
      name: "list_pending_presentations",
      title: "List pending PPTs",
      description:
        "List teams whose PowerPoint presentation has not been collected.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () =>
        teams
          .filter((t) => t.ppt_status === "Pending")
          .map((t) => ({
            teamId: t.team_id,
            college: t.college_name,
            participants: t.participants.map((p) => p.participant_name),
          })),
    });
    return () => lifecycle.abort();
  }, [teams]);

  if (authLoading)
    return (
      <div className="full-loader">
        <Loader2 className="animate-spin" />
        <p>Opening VERIDEX…</p>
      </div>
    );
  if (onSpotMode) return <OnSpotRegistrationPage />;
  if (participantMode) return <ParticipantUploadPage />;
  const navItems: {
    id: View;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: number;
  }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    {
      id: "collection",
      label: "PPT Collection",
      icon: Archive,
      badge: stats.pending,
    },
    { id: "teams", label: "Teams", icon: Users },
    { id: "presentation", label: "Presentation Mode", icon: Presentation },
    { id: "activity", label: "Activity", icon: Activity },
    { id: "export", label: "Export", icon: Download },
    { id: "settings", label: "Settings", icon: Settings },
    { id: "about", label: "About", icon: Info },
  ];

  return (
    <main className="app-shell">
      <Toaster position="top-right" richColors closeButton />
      <header className="topbar">
        <button
          className="icon-button menu-button"
          onClick={() => setMobileMenu((v) => !v)}
          aria-label="Open navigation"
        >
          <Menu />
        </button>
        <div className="brand-mark">
          <Presentation size={21} />
        </div>
        <div className="brand-copy">
          <p>ZYNERA 2K26</p>
          <h1>
            VERIDEX <span>· Paper Presentation</span>
          </h1>
        </div>
        <div
          className={`connection ${!online ? "offline" : syncing ? "syncing" : ""}`}
        >
          {!online ? (
            <CloudOff />
          ) : syncing ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Wifi />
          )}
          <span>
            {!online ? "Offline" : syncing ? "Syncing…" : "Online · Synced"}
          </span>
        </div>
        {demoMode && <span className="preview-pill">Preview data</span>}
        <button className="avatar" title={coordinatorEmail}>
          {initials(profileName)}
        </button>
      </header>
      <div className="app-grid">
        <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
          <nav>
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${view === item.id ? "active" : ""}`}
                onClick={() => navigate(item.id)}
              >
                <item.icon />
                <span>{item.label}</span>
                {item.badge ? <b>{item.badge}</b> : null}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <span>Created by Akash</span>
          </div>
        </aside>
        {mobileMenu && (
          <button
            className="menu-backdrop"
            aria-label="Close navigation"
            onClick={() => setMobileMenu(false)}
          />
        )}
        <section className="workspace">
          {loading ? <LoadingView /> : renderView()}
        </section>
      </div>
      <nav className="mobile-nav">
        {navItems.slice(0, 4).map((item) => (
          <button
            key={item.id}
            className={view === item.id ? "active" : ""}
            onClick={() => navigate(item.id)}
          >
            <item.icon />
            <span>
              {item.label === "PPT Collection"
                ? "Collect"
                : item.label === "Presentation Mode"
                  ? "Present"
                  : item.label}
            </span>
          </button>
        ))}
      </nav>
      {TeamForm()}
      {TeamDetails()}
      {ConfirmDialog()}
    </main>
  );

  function renderView() {
    if (view === "dashboard") return <Dashboard />;
    if (view === "collection") return <Collection />;
    if (view === "teams") return <TeamsView />;
    if (view === "presentation") return <PresentationMode />;
    if (view === "activity") return <ActivityView />;
    if (view === "export") return <ExportView />;
    if (view === "settings") return <SettingsView />;
    return <AboutView />;
  }

  function PageHeading({
    eyebrow,
    title,
    copy,
    action,
  }: {
    eyebrow: string;
    title: string;
    copy?: string;
    action?: React.ReactNode;
  }) {
    return (
      <div className="page-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          {copy && <p>{copy}</p>}
        </div>
        {action}
      </div>
    );
  }
  function ProgressCard({ compact = false }: { compact?: boolean }) {
    return (
      <section className={`progress-card ${compact ? "compact" : ""}`}>
        <div className="progress-copy">
          <div>
            <p className="eyebrow pale">PPT collection progress</p>
            <div className="progress-number">
              <strong>{stats.received}</strong>
              <span>/ {event.expected_teams} received</span>
            </div>
          </div>
          <div className="complete-badge">
            {percent === 100 ? "100% complete" : `${percent}% complete`}
          </div>
        </div>
        <Progress
          value={percent}
          className="h-3 bg-white/20 [&>div]:bg-[#56d7a0]"
        />
        <p className="progress-note">
          {stats.pending} registered teams are pending.{" "}
          {Math.max(0, event.expected_teams - stats.received)} presentations
          remain against the event target.
        </p>
      </section>
    );
  }

  function Dashboard() {
    const cards = [
      { label: "Total teams", value: stats.total, icon: Users, tone: "navy" },
      {
        label: "Participants",
        value: stats.participants,
        icon: UserRoundPlus,
        tone: "blue",
      },
      {
        label: "PPTs received",
        value: stats.received,
        icon: Check,
        tone: "green",
      },
      {
        label: "PPTs pending",
        value: stats.pending,
        icon: Clock3,
        tone: "amber",
      },
      {
        label: "Presented",
        value: stats.presented,
        icon: Presentation,
        tone: "purple",
      },
      {
        label: "Delayed / absent",
        value: stats.delayed + stats.absent,
        icon: CircleAlert,
        tone: "red",
      },
    ];
    return (
      <>
        <PageHeading
          eyebrow="Coordinator workspace"
          title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, ${profileName}.`}
          copy="Here’s where VERIDEX stands right now."
          action={
            <Button onClick={() => openTeamForm()}>
              <Plus /> Add team
            </Button>
          }
        />
        <ProgressCard />
        <div className="stat-grid six">
          {cards.map((card) => (
            <article className="stat-card" key={card.label}>
              <span className={`stat-icon ${card.tone}`}>
                <card.icon />
              </span>
              <strong>{card.value}</strong>
              <p>{card.label}</p>
            </article>
          ))}
        </div>
        <div className="quick-grid">
          <button onClick={() => navigate("collection")}>
            <Archive />
            <span>
              <b>Collect PPTs</b>
              <small>Find a pending team and upload</small>
            </span>
            <ChevronRight />
          </button>
          <button onClick={() => navigate("presentation")}>
            <Play />
            <span>
              <b>Start presentation mode</b>
              <small>Open the live queue</small>
            </span>
            <ChevronRight />
          </button>
          <button onClick={() => navigate("export")}>
            <FileArchive />
            <span>
              <b>Export event data</b>
              <small>Excel, PPTs, complete ZIP</small>
            </span>
            <ChevronRight />
          </button>
          <button
            onClick={() => {
              const link = window.location.origin + "/?participant-upload=1";
              void navigator.clipboard?.writeText(link);
              toast.success("Participant upload link copied.");
            }}
          >
            <Upload />
            <span>
              <b>Participant upload link</b>
              <small>Copy one link for every team</small>
            </span>
            <ChevronRight />
          </button>
          <button
            onClick={() => {
              const link = window.location.origin + "/?onsite-registration=1";
              void navigator.clipboard?.writeText(link);
              toast.success("On-spot registration link copied.");
            }}
          >
            <UserRoundPlus />
            <span>
              <b>On-spot registration link</b>
              <small>Register walk-in teams as VEROS IDs</small>
            </span>
            <ChevronRight />
          </button>
        </div>
        <div className="content-grid">
          <section className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Live queue</p>
                <h3>Presentation order</h3>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("presentation")}
              >
                <ListOrdered /> Manage
              </Button>
            </div>
            <div className="queue-list">
              {queue.slice(0, 5).map((item, index) => (
                <QueueRow key={item.id} item={item} index={index} />
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Recent activity</p>
                <h3>Latest updates</h3>
              </div>
              <button
                className="text-link"
                onClick={() => navigate("activity")}
              >
                View all
              </button>
            </div>
            {activity.slice(0, 5).map((log) => (
              <ActivityRow key={log.id} log={log} />
            ))}
          </section>
        </div>
      </>
    );
  }

  function Collection() {
    const rows = teams
      .filter((t) => t.ppt_status === collectionTab)
      .filter((t) => {
        const q = search.toLowerCase();
        return (
          !q ||
          [
            t.team_id,
            t.team_name,
            t.college_name,
            ...t.participants.map((p) => p.participant_name),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)
        );
      });
    return (
      <>
        <PageHeading
          eyebrow="File intake"
          title="PPT Collection"
          copy="Search a team, upload its presentation, and move on."
          action={
            <Button variant="outline" onClick={() => openTeamForm()}>
              <Plus /> New team
            </Button>
          }
        />
        <ProgressCard compact />
        <div className="toolbar">
          <div className="search-box">
            <Search />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Team ID, participant, college…"
            />
          </div>
          <Tabs value={collectionTab} onValueChange={setCollectionTab}>
            <TabsList>
              <TabsTrigger value="Pending">
                Pending <b>{stats.pending}</b>
              </TabsTrigger>
              <TabsTrigger value="Received">
                Received <b>{stats.received}</b>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="collection-list">
          {rows.length ? (
            rows.map((team) => (
              <TeamCard key={team.id} team={team} collection />
            ))
          ) : (
            <Empty
              icon={collectionTab === "Pending" ? Check : Archive}
              title={
                collectionTab === "Pending"
                  ? "All registered PPTs collected"
                  : "No presentations received yet"
              }
              copy={
                search
                  ? "Try a different search."
                  : "New uploads will appear here automatically."
              }
            />
          )}
        </div>
      </>
    );
  }

  function TeamsView() {
    return (
      <>
        <PageHeading
          eyebrow="Registration"
          title="Teams"
          copy={`${visibleTeams.length} of ${teams.length} registered teams`}
          action={
            <Button onClick={() => openTeamForm()}>
              <Plus /> Add team
            </Button>
          }
        />
        <div className="team-tools">
          <div className="search-box">
            <Search />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Team ID, participant, college, or PPT…"
            />
          </div>
          <div className="filter-row">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  "All Teams",
                  "PPT Received",
                  "PPT Pending",
                  ...statusOptions,
                ].map((v) => (
                  <SelectItem value={v} key={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={college} onValueChange={setCollege}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All colleges">All colleges</SelectItem>
                {colleges.map((v) => (
                  <SelectItem value={v} key={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="team_id">Sort: Team ID</SelectItem>
                <SelectItem value="participant">Participant</SelectItem>
                <SelectItem value="college">College</SelectItem>
                <SelectItem value="uploaded">Submission time</SelectItem>
                <SelectItem value="order">Presentation order</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="desktop-table">
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th>Participants</th>
                <th>College</th>
                <th>PPT</th>
                <th>Presentation</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleTeams.map((team) => (
                <TeamRow key={team.id} team={team} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="mobile-cards">
          {visibleTeams.map((team) => (
            <TeamCard key={team.id} team={team} />
          ))}
        </div>
        {!visibleTeams.length && (
          <Empty
            icon={Search}
            title="No matching teams"
            copy="Clear a filter or try another search."
          />
        )}
      </>
    );
  }

  function PresentationMode() {
    if (!currentTeam)
      return (
        <>
          <PageHeading eyebrow="Live event" title="Presentation Mode" />
          <Empty
            icon={Presentation}
            title="No teams in the queue"
            copy="Add a team to begin."
          />
        </>
      );
    return (
      <>
        <PageHeading
          eyebrow="Live event"
          title="Presentation Mode"
          copy="One-touch controls for the presentation desk."
        />
        <section className="present-stage">
          <div className="stage-kicker">
            Current team · {currentIndex + 1} of {queue.length}
          </div>
          <div className="stage-main">
            <div>
              <span
                className={`status ${currentTeam.presentation_status.toLowerCase()}`}
              >
                {currentTeam.presentation_status}
              </span>
              <h2>{currentTeam.team_id}</h2>
              <h3>
                {currentTeam.team_name ||
                  currentTeam.participants
                    .map((p) => p.participant_name)
                    .join(" & ")}
              </h3>
              <p>{currentTeam.college_name}</p>
              <div className="stage-meta">
                <span>
                  <Users />{" "}
                  {currentTeam.participants
                    .map((p) => p.participant_name)
                    .join(", ")}
                </span>
                <span>
                  <FileText />{" "}
                  {currentTeam.presentations[0]?.stored_filename ||
                    "PPT pending"}
                </span>
              </div>
            </div>
            <Button
              className="open-presentation"
              disabled={!currentTeam.presentations[0]}
              onClick={() => void openPpt(currentTeam)}
            >
              <Play /> Open presentation
            </Button>
          </div>
          <div className="stage-actions">
            <Button
              variant="outline"
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
            >
              <ArrowLeft /> Previous
            </Button>
            <div>
              <Button
                variant="outline"
                onClick={() => void changeStatus(currentTeam, "Delayed")}
              >
                <Clock3 /> Delayed
              </Button>
              <Button
                variant="outline"
                onClick={() => void changeStatus(currentTeam, "Absent")}
              >
                <X /> Absent
              </Button>
              <Button
                onClick={() => {
                  void changeStatus(currentTeam, "Presented");
                  setCurrentIndex((i) => Math.min(queue.length - 1, i + 1));
                }}
              >
                <Check /> Mark presented
              </Button>
            </div>
            <Button
              variant="outline"
              onClick={() =>
                setCurrentIndex((i) => Math.min(queue.length - 1, i + 1))
              }
              disabled={currentIndex >= queue.length - 1}
            >
              Next <ArrowRight />
            </Button>
          </div>
        </section>
        <section className="panel queue-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Presentation queue</p>
              <h3>Order and status</h3>
            </div>
            <span className="helper">Use arrows on any device</span>
          </div>
          <div className="queue-list manage">
            {queue.map((team, index) => (
              <article
                className={`queue-item ${index === currentIndex ? "selected" : ""}`}
                key={team.id}
                onClick={() => setCurrentIndex(index)}
              >
                <span className="queue-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <strong>
                    {team.team_id} ·{" "}
                    {team.team_name || team.participants[0]?.participant_name}
                  </strong>
                  <p>{team.college_name}</p>
                </div>
                <span
                  className={`status ${team.presentation_status.toLowerCase()}`}
                >
                  {team.presentation_status}
                </span>
                <div className="reorder">
                  <button
                    title="Move up"
                    onClick={(e) => {
                      e.stopPropagation();
                      void moveTeam(team, "up");
                    }}
                  >
                    <ArrowUp />
                  </button>
                  <button
                    title="Move down"
                    onClick={(e) => {
                      e.stopPropagation();
                      void moveTeam(team, "down");
                    }}
                  >
                    <ArrowDown />
                  </button>
                  <button
                    title="Move to end"
                    onClick={(e) => {
                      e.stopPropagation();
                      void moveTeam(team, "end");
                    }}
                  >
                    <ArrowDownToLine />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </>
    );
  }

  function ActivityView() {
    return (
      <>
        <PageHeading
          eyebrow="Audit trail"
          title="Activity"
          copy="A shared record of coordinator actions."
          action={
            <Button variant="outline" onClick={() => void loadData(true)}>
              <RefreshCw /> Refresh
            </Button>
          }
        />
        <section className="panel activity-panel">
          {activity.length ? (
            activity.map((log) => <ActivityRow key={log.id} log={log} />)
          ) : (
            <Empty
              icon={Activity}
              title="No activity yet"
              copy="Team and presentation updates will appear here."
            />
          )}
        </section>
      </>
    );
  }
  function ExportView() {
    return (
      <>
        <PageHeading
          eyebrow="Event handoff"
          title="Export"
          copy="Download clean event files for reporting and presentation day."
        />
        <div className="export-grid">
          <ExportCard
            icon={FileSpreadsheet}
            title="Excel Participant List"
            copy="Formatted .xlsx with participant, PPT, queue, and audit fields."
            action="Export to Excel"
            onClick={() => void exportExcel()}
          />
          <ExportCard
            icon={FileArchive}
            title="All PPT Files"
            copy={`${stats.received} collected presentations in one ZIP archive.`}
            action="Download all PPTs"
            onClick={() => void downloadPpts(false)}
          />
          <ExportCard
            icon={Download}
            title="Complete Event Data"
            copy="Participant Excel and every PPT in a transfer-ready folder."
            action="Download complete ZIP"
            onClick={() => void downloadPpts(true)}
          />
          <ExportCard
            icon={ShieldCheck}
            title="Backup"
            copy="JSON backup of event records and secure presentation references."
            action="Download backup"
            onClick={downloadBackup}
          />
        </div>
        <section className="panel restore-panel">
          <div>
            <p className="eyebrow">Restore</p>
            <h3>Restore a backup</h3>
            <p>
              Validated backups can add or update team records. Presentation
              bytes must already exist in secure storage.
            </p>
          </div>
          <input
            ref={importRef}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            onChange={(e) => void importBackup(e.target.files?.[0])}
          />
          <Button variant="outline" onClick={() => importRef.current?.click()}>
            <Upload /> Choose backup
          </Button>
        </section>
      </>
    );
  }
  function SettingsView() {
    return (
      <>
        <PageHeading
          eyebrow="Configuration"
          title="Settings"
          copy="Event controls and data protection."
        />
        <div className="settings-grid">
          <section className="panel">
            <h3>Event settings</h3>
            <div className="field-stack">
              <Label>Event name</Label>
              <Input value={event.event_name} disabled />
              <Label>Expected total teams</Label>
              <Input
                inputMode="numeric"
                value={expectedInput}
                onChange={(e) => setExpectedInput(e.target.value)}
              />
              <div className="switch-row">
                <div>
                  <Label>Allow new team registration</Label>
                  <p>Coordinators can add walk-in teams.</p>
                </div>
                <Switch
                  checked={event.allow_new_teams}
                  onCheckedChange={(checked) =>
                    setEvent((e) => ({ ...e, allow_new_teams: checked }))
                  }
                />
              </div>
              <Button onClick={() => void saveSettings()}>Save settings</Button>
            </div>
          </section>
          <section className="panel danger-panel">
            <h3>Reset event data</h3>
            <p>
              This removes every team, participant, presentation reference, and
              stored PPT. This action cannot be undone.
            </p>
            <Label>Type DELETE VERIDEX DATA to continue</Label>
            <Input
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              placeholder="DELETE VERIDEX DATA"
            />
            <Button
              variant="destructive"
              disabled={resetText !== "DELETE VERIDEX DATA"}
              onClick={() => void resetEvent()}
            >
              <Trash2 /> Reset event data
            </Button>
          </section>
        </div>
      </>
    );
  }
  function AboutView() {
    return (
      <section className="about-card">
        <div className="about-icon">
          <Presentation />
        </div>
        <p className="eyebrow">ZYNERA 2K26</p>
        <h2>VERIDEX</h2>
        <h3>Paper Presentation Management System</h3>
        <p>
          Developed to simplify participant registration, PPT collection,
          coordinator collaboration and presentation management for the VERIDEX
          Paper Presentation event of ZYNERA 2K26.
        </p>
        <div className="about-credit">
          Created by <strong>Akash</strong>
        </div>
      </section>
    );
  }

  function TeamRow({ team }: { team: Team }) {
    return (
      <tr>
        <td>
          <button className="team-link" onClick={() => setDetailTeam(team)}>
            {team.team_id}
          </button>
          <small>{team.team_name || "—"}</small>
        </td>
        <td>
          {team.participants.map((p) => p.participant_name).join(", ")}
        </td>
        <td>{team.college_name}</td>
        <td>
          <span className={`status ${team.ppt_status.toLowerCase()}`}>
            {team.ppt_status}
          </span>
          {team.presentations[0] && (
            <small>{team.presentations[0].stored_filename}</small>
          )}
        </td>
        <td>
          <Select
            value={team.presentation_status}
            onValueChange={(v) =>
              void changeStatus(team, v as PresentationStatus)
            }
          >
            <SelectTrigger className="status-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((v) => (
                <SelectItem value={v} key={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
        <td>
          <div className="row-actions">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDetailTeam(team)}
            >
              View
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => openTeamForm(team)}
              title="Edit"
            >
              <Pencil />
            </Button>
            {team.ppt_status === "Received" ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void openPpt(team)}
                title="Open PPT"
              >
                <Play />
              </Button>
            ) : (
              <UploadButton team={team} iconOnly />
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              className="danger"
              onClick={() => setConfirmDelete({ type: "team", team })}
              title="Delete"
            >
              <Trash2 />
            </Button>
          </div>
        </td>
      </tr>
    );
  }
  function TeamCard({
    team,
    collection = false,
  }: {
    team: Team;
    collection?: boolean;
  }) {
    const ppt = team.presentations[0];
    return (
      <article className="team-card">
        <div className="team-card-head">
          <div>
            <button className="team-link" onClick={() => setDetailTeam(team)}>
              {team.team_id}
            </button>
            <h3>
              {team.team_name ||
                team.participants.map((p) => p.participant_name).join(" & ")}
            </h3>
          </div>
          <span className={`status ${team.ppt_status.toLowerCase()}`}>
            {team.ppt_status}
          </span>
        </div>
        <p className="college">{team.college_name}</p>
        <div className="participant-chips">
          {team.participants.map((p) => (
            <span key={`${p.participant_number}-${p.participant_name}`}>
              {p.participant_name}
            </span>
          ))}
        </div>
        {ppt && (
          <div className="file-line">
            <FileText />
            <span>
              <b>{ppt.stored_filename}</b>
              <small>
                {formatBytes(ppt.file_size)} ·{" "}
                {ppt.uploader?.full_name || ppt.uploader?.email || ppt.uploader_name || "Coordinator"} · {when(ppt.uploaded_at)}
              </small>
            </span>
          </div>
        )}
        {uploading[team.id] !== undefined && (
          <div className="upload-progress">
            <div>
              <span>Uploading {team.team_id}</span>
              <b>{uploading[team.id]}%</b>
            </div>
            <Progress value={uploading[team.id]} />
          </div>
        )}
        <div className="team-card-actions">
          {team.ppt_status === "Pending" ? (
            <UploadButton team={team} />
          ) : (
            <>
              <Button onClick={() => void openPpt(team)}>
                <Play /> Open PPT
              </Button>
              <Button
                variant="outline"
                onClick={() => void openPpt(team, true)}
              >
                <Download /> Download
              </Button>
              <UploadButton team={team} replace />
              <Button
                variant="ghost"
                className="danger"
                onClick={() => setConfirmDelete({ type: "ppt", team })}
              >
                <Trash2 /> Remove
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => setDetailTeam(team)}>
            View details
          </Button>
          {!collection && (
            <Button variant="ghost" onClick={() => openTeamForm(team)}>
              <Pencil /> Edit
            </Button>
          )}
        </div>
      </article>
    );
  }
  function UploadButton({
    team,
    replace = false,
    iconOnly = false,
  }: {
    team: Team;
    replace?: boolean;
    iconOnly?: boolean;
  }) {
    return (
      <label
        className={`upload-label ${iconOnly ? "icon-only" : ""}`}
        title={replace ? "Replace PPT" : "Upload PPT"}
      >
        <Upload />
        {!iconOnly && (replace ? "Replace PPT" : "Upload PPT")}
        <input
          type="file"
          accept=".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          disabled={uploading[team.id] !== undefined}
          onChange={(e) => {
            void uploadPpt(team, e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
    );
  }
  function QueueRow({ item, index }: { item: Team; index: number }) {
    return (
      <article
        className={`queue-item ${item.presentation_status === "Presenting" ? "now" : ""}`}
      >
        <span className="queue-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div>
          <strong>
            {item.team_id} ·{" "}
            {item.team_name || item.participants[0]?.participant_name}
          </strong>
          <p>{item.college_name}</p>
        </div>
        <span className={`status ${item.presentation_status.toLowerCase()}`}>
          {item.presentation_status}
        </span>
      </article>
    );
  }
  function ActivityRow({ log }: { log: ActivityLog }) {
    return (
      <article className="activity-item">
        <span>{initials(log.profile?.full_name || log.profile?.email)}</span>
        <p>
          <strong>{log.description}</strong>
          <small>
            {log.profile?.full_name || log.profile?.email || "Coordinator"} ·{" "}
            {when(log.created_at)}
          </small>
        </p>
      </article>
    );
  }
  function ExportCard({
    icon: Icon,
    title,
    copy,
    action,
    onClick,
  }: {
    icon: typeof Download;
    title: string;
    copy: string;
    action: string;
    onClick: () => void;
  }) {
    return (
      <article className="export-card">
        <span>
          <Icon />
        </span>
        <h3>{title}</h3>
        <p>{copy}</p>
        <Button onClick={onClick}>
          {action}
          <Download />
        </Button>
      </article>
    );
  }
  function Empty({
    icon: Icon,
    title,
    copy,
  }: {
    icon: typeof Search;
    title: string;
    copy: string;
  }) {
    return (
      <div className="empty">
        <Icon />
        <h3>{title}</h3>
        <p>{copy}</p>
      </div>
    );
  }

  function TeamForm() {
    return (
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="team-dialog">
          <DialogHeader>
            <DialogTitle>
              {draft.id ? `Edit ${draft.team_id}` : "Add team"}
            </DialogTitle>
            <DialogDescription>
              College and every participant field are required. The form is
              saved locally while unfinished.
            </DialogDescription>
          </DialogHeader>
          <div className="form-grid">
            <div className="full generated-id-note">
              <Label>Team ID</Label>
              <p>{draft.team_id || "Generated automatically when saved"}</p>
            </div>
            <div>
              <Label htmlFor="team-name">
                Team name <span>optional</span>
              </Label>
              <Input
                id="team-name"
                value={draft.team_name}
                onChange={(e) =>
                  updateDraft({ ...draft, team_name: e.target.value })
                }
              />
            </div>
            <div className="full">
              <Label htmlFor="college-name">College name</Label>
              <Input
                id="college-name"
                value={draft.college_name}
                onChange={(e) =>
                  updateDraft({ ...draft, college_name: e.target.value })
                }
              />
            </div>
            <div className="full">
              <Label>Number of participants</Label>
              <Select
                value={String(draft.participants.length)}
                onValueChange={(v) => {
                  const count = Number(v);
                  const participants = Array.from(
                    { length: count },
                    (_, i) => draft.participants[i] || emptyParticipant(i + 1),
                  );
                  updateDraft({ ...draft, participants });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="participants-form">
            {draft.participants.map((p, index) => (
              <section key={index}>
                <h4>Participant {index + 1}</h4>
                <div className="form-grid">
                  <div className="full">
                    <Label>Name</Label>
                    <Input
                      value={p.participant_name}
                      onChange={(e) => {
                        const participants = [...draft.participants];
                        participants[index] = {
                          ...p,
                          participant_name: e.target.value,
                        };
                        updateDraft({ ...draft, participants });
                      }}
                    />
                  </div>
                </div>
              </section>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveTeam()} disabled={savingTeam}>
              {savingTeam ? <Loader2 className="animate-spin" /> : <Check />}
              {savingTeam ? "Saving…" : "Save team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  function TeamDetails() {
    const team = detailTeam;
    if (!team) return null;
    const ppt = team.presentations[0];
    return (
      <Dialog
        open={!!detailTeam}
        onOpenChange={(open) => !open && setDetailTeam(null)}
      >
        <DialogContent className="detail-dialog">
          <DialogHeader>
            <p className="eyebrow">Team details</p>
            <DialogTitle>
              {team.team_id} · {team.team_name || "Untitled team"}
            </DialogTitle>
            <DialogDescription>{team.college_name}</DialogDescription>
          </DialogHeader>
          <div className="detail-status">
            <span className={`status ${team.ppt_status.toLowerCase()}`}>
              PPT {team.ppt_status}
            </span>
            <span
              className={`status ${team.presentation_status.toLowerCase()}`}
            >
              {team.presentation_status}
            </span>
            <span>Queue #{team.presentation_order}</span>
          </div>
          <section>
            <h4>Participants</h4>
            {team.participants.map((p) => (
              <div className="detail-person" key={p.participant_number}>
                <b>{p.participant_number}</b>
                <span>
                  <strong>{p.participant_name}</strong>
                </span>
              </div>
            ))}
          </section>
          <section>
            <h4>Presentation</h4>
            {ppt ? (
              <div className="detail-file">
                <FileText />
                <span>
                  <strong>{ppt.stored_filename}</strong>
                  <small>
                    {formatBytes(ppt.file_size)} · uploaded by{" "}
                    {ppt.uploader?.full_name || ppt.uploader?.email || ppt.uploader_name || "Coordinator"}
                    <br />
                    {when(ppt.uploaded_at)}
                  </small>
                </span>
              </div>
            ) : (
              <p className="muted">No PPT collected yet.</p>
            )}
          </section>
          <section className="detail-meta">
            <span>Last modified by {profileName}</span>
            <span>{when(team.updated_at)}</span>
          </section>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDetailTeam(null);
                openTeamForm(team);
              }}
            >
              <Pencil /> Edit
            </Button>
            {ppt ? (
              <Button onClick={() => void openPpt(team)}>
                <Play /> Open presentation
              </Button>
            ) : (
              <UploadButton team={team} />
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  function ConfirmDialog() {
    const target = confirmDelete;
    return (
      <AlertDialog
        open={!!target}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {target?.type === "team"
                ? `Delete ${target.team.team_id}?`
                : `Remove ${target?.team.team_id} PPT?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {target?.type === "team"
                ? `Are you sure you want to delete ${target.team.team_id} and its associated PPT? This cannot be undone.`
                : "The team will remain registered and return to PPT Pending."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                target &&
                (target.type === "team"
                  ? void deleteTeam(target.team)
                  : void removePpt(target.team))
              }
            >
              {target?.type === "team" ? "Delete team" : "Remove PPT"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }
}

function LoadingView() {
  return (
    <div className="view-loader">
      <Loader2 className="animate-spin" />
      <h2>Loading event data</h2>
      <p>Synchronizing the latest coordinator updates…</p>
    </div>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) toast.error(readableError(error));
    setBusy(false);
  }
  return (
    <main className="login-page">
      <Toaster position="top-right" richColors />
      <section className="login-brand">
        <div className="login-mark">
          <Presentation />
        </div>
        <p className="eyebrow pale">ZYNERA 2K26</p>
        <h1>VERIDEX</h1>
        <h2>Paper Presentation</h2>
        <p>Participant & PPT Management System</p>
        <span>Created by Akash</span>
      </section>
      <section className="login-panel">
        <form onSubmit={login}>
          <div>
            <p className="eyebrow">Coordinator access</p>
            <h2>Welcome back</h2>
            <p>Sign in with your authorized event account.</p>
          </div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <small>
            Only authorized VERIDEX coordinators can modify event data.
          </small>
        </form>
      </section>
    </main>
  );
}

function ParticipantUploadPage() {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [teamId, setTeamId] = useState("");
  const [team, setTeam] = useState<Team | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    async function load() {
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data: events } = await supabase
        .from("events").select("*").eq("event_code", "VERIDEX").limit(1);
      const current = (events?.[0] as EventRecord | undefined) || null;
      setEvent(current);
      setLoading(false);
    }
    void load();
  }, []);

  async function findTeam() {
    if (!supabase || !event) return;
    const enteredId = teamId.trim().toUpperCase();
    if (!/^VER\d{3,}$/.test(enteredId)) {
      toast.error("Enter the Team ID given by the coordinator, for example VER001.");
      return;
    }
    setLookingUp(true);
    setTeam(null);
    setConfirmed(false);
    setFile(null);
    try {
      const { data, error } = await supabase
        .from("teams")
        .select("*,participants(*),presentations(*)")
        .eq("event_id", event.id)
        .eq("team_id", enteredId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.error(`${enteredId} was not found. Please check your Team ID.`);
        return;
      }
      const savedTeam = {
        ...data,
        participants: Array.isArray(data.participants)
          ? data.participants
          : data.participants
            ? [data.participants]
            : [],
        presentations: Array.isArray(data.presentations)
          ? data.presentations
          : data.presentations
            ? [data.presentations]
            : [],
      } as Team;
      setTeam(savedTeam);
      setTeamId(savedTeam.team_id);
    } catch (error) {
      toast.error(readableError(error));
    } finally {
      setLookingUp(false);
    }
  }

  async function submit() {
    if (!supabase || !event || !team || !file || !confirmed) {
      toast.error("Verify your team details, confirm them, and choose your PPT.");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["ppt", "pptx"].includes(ext)) {
      toast.error("Please choose a .ppt or .pptx file.");
      return;
    }
    setUploading(true);
    try {
      // Participant uploads use the same Paper ID naming convention as
      // coordinator uploads, irrespective of the original file name.
      const stored = team.team_id + "." + ext;
      const path = event.id + "/" + team.team_id + "/" + stored;
      const { error: uploadError } = await supabase.storage
        .from(presentationBucket).upload(path, file, {
          upsert: true,
          contentType: file.type || (ext === "ppt"
            ? "application/vnd.ms-powerpoint"
            : "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        });
      if (uploadError) throw uploadError;
      const { error: recordError } = await supabase.from("presentations").upsert({
        team_id: team.id, original_filename: file.name, stored_filename: stored,
        storage_path: path, file_size: file.size, uploaded_by: null,
        uploaded_at: new Date().toISOString(),
      }, { onConflict: "team_id" });
      if (recordError) throw recordError;
      const previousPpt = team.presentations[0];
      if (previousPpt && previousPpt.storage_path !== path) {
        await supabase.storage
          .from(presentationBucket)
          .remove([previousPpt.storage_path]);
      }
      const { error: teamError } = await supabase.from("teams")
        .update({ ppt_status: "Received" }).eq("id", team.id);
      if (teamError) throw teamError;
      await supabase.from("activity_logs").insert({
        event_id: event.id, team_id: team.id,
        action_type: "ppt_uploaded_by_participant",
        description: team.team_id + " PPT uploaded by participant",
      });
      setDone(true);
      toast.success(team.team_id + " PPT upload complete.");
    } catch (error) {
      toast.error(readableError(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="login-page participant-upload-page">
      <section className="login-brand">
        <div className="login-mark"><Upload /></div>
        <p className="eyebrow pale">ZYNERA 2K26</p>
        <h1>VERIDEX</h1>
        <h2>Team Verification & PPT</h2>
        <p>Enter the Team ID given by your coordinator, verify your details, then submit your presentation.</p>
        <span>Created by Akash</span>
      </section>
      <section className="login-panel">
        {loading ? (
          <div className="view-loader"><Loader2 className="animate-spin" /><p>Loading teams…</p></div>
        ) : done ? (
          <div className="upload-success">
            <Check /><h2>Upload complete</h2>
            <p>Your presentation has been received by the VERIDEX coordinators.</p>
            <Button onClick={() => { setDone(false); setTeam(null); setTeamId(""); setConfirmed(false); setFile(null); }}>Verify another Team ID</Button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <p className="eyebrow">Shared participant link</p>
            <h2>Verify your Team ID</h2>
            <p>Coordinators create teams. Participants only verify saved details and upload the PPT.</p>
            <Label htmlFor="participant-team-id">Team ID</Label>
            <div className="inline-actions">
              <Input id="participant-team-id" placeholder="VER001" value={teamId} onChange={(e) => setTeamId(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void findTeam(); } }} />
              <Button type="button" onClick={() => void findTeam()} disabled={lookingUp}>
                {lookingUp ? <Loader2 className="animate-spin" /> : <Search />}
                {lookingUp ? "Checking…" : "Verify"}
              </Button>
            </div>
            {team && (
              <>
                <section className="participant-public-card">
                  <p className="eyebrow">Verified team</p>
                  <h3>{team.team_id}{team.team_name ? ` — ${team.team_name}` : ""}</h3>
                  <p><b>College:</b> {team.college_name}</p>
                  <h4>Participants</h4>
                  {team.participants.slice().sort((a, b) => a.participant_number - b.participant_number).map((participant) => (
                    <p key={participant.id || participant.participant_number}><b>{participant.participant_name}</b></p>
                  ))}
                </section>
                <label className="confirmation-row">
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  I confirm that these saved team details are correct.
                </label>
                <Label htmlFor="participant-ppt">PowerPoint file for {team.team_id}</Label>
                <Input id="participant-ppt" type="file" accept=".ppt,.pptx" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
                <p className="muted">Your file will be stored as <b>{team.team_id}.pptx</b> (or <b>{team.team_id}.ppt</b>).</p>
                <Button type="submit" disabled={uploading || !file || !confirmed}>
                  {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                  {uploading ? "Uploading…" : `Upload ${team.team_id} PPT`}
                </Button>
              </>
            )}
          </form>
        )}
      </section>
    </main>
  );
}

function OnSpotRegistrationPage() {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [teamName, setTeamName] = useState("");
  const [collegeName, setCollegeName] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([
    emptyParticipant(1),
  ]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savedTeamId, setSavedTeamId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("event_code", "VERIDEX")
        .maybeSingle();
      if (error) toast.error(readableError(error));
      setEvent((data as EventRecord | null) || null);
      setLoading(false);
    }
    void load();
  }, []);

  function resetForm() {
    setTeamName("");
    setCollegeName("");
    setParticipants([emptyParticipant(1)]);
    setFile(null);
    setSavedTeamId(null);
  }

  async function submit() {
    if (!supabase || !event || !file || !collegeName.trim()) {
      toast.error("Enter the college name, participant details, and PPT.");
      return;
    }
    if (
      participants.some((participant) => !participant.participant_name.trim())
    ) {
      toast.error("Complete every participant name.");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["ppt", "pptx"].includes(ext)) {
      toast.error("Please choose a .ppt or .pptx file.");
      return;
    }
    setUploading(true);
    try {
      const { data: latestOnSpot, error: latestError } = await supabase
        .from("teams")
        .select("team_id")
        .eq("event_id", event.id)
        .like("team_id", "VEROS%")
        .order("team_id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw latestError;
      const lastNumber = Number(
        latestOnSpot?.team_id?.replace(/^VEROS/i, "") || 0,
      );
      const teamId = `VEROS${String(lastNumber + 1).padStart(3, "0")}`;
      const { count, error: countError } = await supabase
        .from("teams")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id);
      if (countError) throw countError;
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .insert({
          event_id: event.id,
          team_id: teamId,
          team_name: teamName.trim() || null,
          college_name: collegeName.trim(),
          presentation_order: (count || 0) + 1,
        })
        .select("id,team_id")
        .single();
      if (teamError) throw teamError;
      const { error: participantError } = await supabase
        .from("participants")
        .insert(
          participants.map((participant, index) => ({
            team_id: team.id,
            participant_name: participant.participant_name.trim(),
            participant_number: index + 1,
          })),
        );
      if (participantError) throw participantError;
      const stored = `${team.team_id}.${ext}`;
      const path = `${event.id}/${team.team_id}/${stored}`;
      const { error: uploadError } = await supabase.storage
        .from(presentationBucket)
        .upload(path, file, {
          upsert: true,
          contentType:
            file.type ||
            (ext === "ppt"
              ? "application/vnd.ms-powerpoint"
              : "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        });
      if (uploadError) throw uploadError;
      const { error: presentationError } = await supabase
        .from("presentations")
        .insert({
          team_id: team.id,
          original_filename: file.name,
          stored_filename: stored,
          storage_path: path,
          file_size: file.size,
          uploaded_by: null,
        });
      if (presentationError) throw presentationError;
      const { error: statusError } = await supabase
        .from("teams")
        .update({ ppt_status: "Received" })
        .eq("id", team.id);
      if (statusError) throw statusError;
      await supabase.from("activity_logs").insert({
        event_id: event.id,
        team_id: team.id,
        action_type: "onsite_team_registered",
        description: `${team.team_id} registered and PPT uploaded on spot`,
      });
      setSavedTeamId(team.team_id);
      toast.success(`${team.team_id} registered successfully.`);
    } catch (error) {
      toast.error(readableError(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="login-page participant-upload-page">
      <Toaster position="top-right" richColors />
      <section className="login-brand">
        <div className="login-mark"><UserRoundPlus /></div>
        <p className="eyebrow pale">ZYNERA 2K26</p>
        <h1>VERIDEX</h1>
        <h2>On-Spot Registration</h2>
        <p>Register a walk-in team and upload its presentation in one step.</p>
        <span>Created by Akash</span>
      </section>
      <section className="login-panel">
        {loading ? (
          <div className="view-loader"><Loader2 className="animate-spin" /><p>Loading registration portal…</p></div>
        ) : savedTeamId ? (
          <div className="upload-success">
            <Check /><h2>Registration complete</h2>
            <p>Your Team ID is <b>{savedTeamId}</b>. Your PPT was saved as <b>{savedTeamId}.{file?.name.split(".").pop()?.toLowerCase()}</b>.</p>
            <Button onClick={resetForm}>Register another team</Button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <p className="eyebrow">Walk-in team portal</p>
            <h2>Register on spot</h2>
            <p>A new Paper ID such as <b>VEROS001</b> is generated automatically after submission.</p>
            <Label htmlFor="onsite-team-name">Team name <span className="muted">(optional)</span></Label>
            <Input id="onsite-team-name" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
            <Label htmlFor="onsite-college">College name</Label>
            <Input id="onsite-college" value={collegeName} onChange={(e) => setCollegeName(e.target.value)} required />
            <Label>Number of participants</Label>
            <Select value={String(participants.length)} onValueChange={(value) => {
              const count = Number(value);
              setParticipants(Array.from({ length: count }, (_, index) => participants[index] || emptyParticipant(index + 1)));
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[1, 2, 3, 4, 5, 6].map((value) => <SelectItem value={String(value)} key={value}>{value}</SelectItem>)}</SelectContent>
            </Select>
            {participants.map((participant, index) => (
              <section className="participant-public-card" key={index}>
                <h4>Participant {index + 1}</h4>
                <Label>Name</Label>
                <Input value={participant.participant_name} onChange={(e) => setParticipants((old) => old.map((item, i) => i === index ? { ...item, participant_name: e.target.value } : item))} required />
              </section>
            ))}
            <Label htmlFor="onsite-ppt">PowerPoint file</Label>
            <Input id="onsite-ppt" type="file" accept=".ppt,.pptx" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
            <Button type="submit" disabled={uploading || !file}>
              {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
              {uploading ? "Registering & uploading…" : "Register team & upload PPT"}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
