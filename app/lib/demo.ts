import type { ActivityLog, EventRecord, Team } from "./types";

export const demoEvent: EventRecord = {
  id: "demo-event",
  event_name: "ZYNERA 2K26 – VERIDEX",
  event_code: "VERIDEX",
  event_type: "Paper Presentation",
  expected_teams: 50,
  allow_new_teams: true,
  created_at: new Date().toISOString(),
};

const colleges = [
  "Apollo Institute of Technology",
  "St. Joseph Engineering College",
  "National College of Engineering",
  "Crescent College of Technology",
  "Riverview Engineering College",
];
const topics = [
  "Visionary Coders",
  "Circuit Minds",
  "Future Forge",
  "Data Pioneers",
  "Green Circuit",
  "Nexus Labs",
  "Quantum Crew",
  "Tech Titans",
];
export const demoTeams: Team[] = Array.from({ length: 12 }, (_, index) => {
  const n = index + 1;
  const received = index < 7;
  const status =
    index === 0
      ? "Presenting"
      : index < 4
        ? "Presented"
        : index === 9
          ? "Delayed"
          : "Waiting";
  const iso = new Date(Date.now() - index * 37 * 60_000).toISOString();
  return {
    id: `demo-team-${n}`,
    event_id: demoEvent.id,
    team_id: `VER${String(n).padStart(3, "0")}`,
    team_name: topics[index % topics.length],
    college_name: colleges[index % colleges.length],
    ppt_status: received ? "Received" : "Pending",
    presentation_status: status,
    presentation_order: n,
    created_by: "demo-user",
    created_at: iso,
    updated_by: "demo-user",
    updated_at: iso,
    participants: [
      {
        id: `demo-part-${n}-1`,
        team_id: `demo-team-${n}`,
        participant_name: [
          "Arun Kumar",
          "Meera S",
          "Harish R",
          "Nisha K",
          "Vijay P",
          "Divya M",
        ][index % 6],
        department: ["CSE", "ECE", "IT", "EEE"][index % 4],
        year: `${(index % 4) + 1}${["st", "nd", "rd", "th"][index % 4]} Year` as never,
        participant_number: 1,
      },
    ],
    presentations: received
      ? [
          {
            id: `demo-ppt-${n}`,
            team_id: `demo-team-${n}`,
            original_filename: `${topics[index % topics.length].replaceAll(" ", "_")}.pptx`,
            stored_filename: `VER${String(n).padStart(3, "0")}_${topics[index % topics.length].replaceAll(" ", "_")}.pptx`,
            storage_path: "demo",
            file_size: 2_400_000 + index * 120_000,
            uploaded_by: "demo-user",
            uploader_name: index % 2 ? "Sanjay" : "Akash",
            uploaded_at: iso,
          },
        ]
      : [],
  } as Team;
});

export const demoActivity: ActivityLog[] = demoTeams
  .slice(0, 8)
  .map((team, index) => ({
    id: `activity-${index}`,
    event_id: demoEvent.id,
    team_id: team.id,
    coordinator_id: "demo-user",
    action_type: index < 4 ? "presentation_status_changed" : "ppt_uploaded",
    description:
      index < 4
        ? `${team.team_id} marked as ${team.presentation_status}`
        : `${team.team_id} PPT uploaded`,
    created_at: team.updated_at,
    team: { team_id: team.team_id },
    profile: {
      full_name: index % 2 ? "Sanjay" : "Akash",
      email: "coordinator@veridex.test",
    },
  }));
