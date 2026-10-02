"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps meeting pages live (answers, notes, action items from teammates):
 * one debounced refresh per burst. Realtime respects RLS.
 */
export function MeetingsRealtime({ teamId, meetingId }: { teamId: string; meetingId?: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 500);
    };
    const filter = meetingId ? `meeting_id=eq.${meetingId}` : `team_id=eq.${teamId}`;
    const channel = supabase
      .channel(`meetings:${teamId}:${meetingId ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings", filter: meetingId ? `id=eq.${meetingId}` : `team_id=eq.${teamId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "meeting_attendees", filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "meeting_actions", filter }, refresh)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [teamId, meetingId, router]);
  return null;
}
