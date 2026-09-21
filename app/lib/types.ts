export type YearLevel = "1st Year" | "2nd Year" | "3rd Year" | "4th Year";
export type PresentationStatus =
  | "Waiting"
  | "Presenting"
  | "Presented"
  | "Delayed"
  | "Absent";
export type PptStatus = "Pending" | "Received";

export interface Participant {
  id?: string;
  team_id?: string;
  participant_name: string;
  department: string;
  year: YearLevel;
  participant_number: number;
}

export interface Presentation {
  id: string;
  team_id: string;
  original_filename: string;
  stored_filename: string;
  storage_path: string;
  file_size: number;
  uploaded_by: string | null;
  uploader_name?: string | null;
  uploaded_at: string;
}

export interface Team {
  id: string;
  event_id: string;
  team_id: string;
  team_name: string | null;
  college_name: string;
  ppt_status: PptStatus;
  presentation_status: PresentationStatus;
  presentation_order: number;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  participants: Participant[];
  presentations: Presentation[];
}

export interface ActivityLog {
  id: string;
  event_id: string;
  team_id: string | null;
  coordinator_id: string | null;
  action_type: string;
  description: string;
  created_at: string;
  team?: { team_id: string } | null;
  profile?: { full_name: string | null; email: string } | null;
}

export interface EventRecord {
  id: string;
  event_name: string;
  event_code: string;
  event_type: string;
  expected_teams: number;
  allow_new_teams: boolean;
  created_at: string;
}

export interface TeamDraft {
  id?: string;
  team_id: string;
  team_name: string;
  college_name: string;
  participants: Participant[];
  updated_at?: string;
}
