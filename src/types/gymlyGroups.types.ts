export type GymlyGroupRow = {
  id: string;
  name: string;
  description: string | null;
  is_private: boolean;
  center_id: string | null;
  city: string | null;
  focus: string | null;
  image_url: string | null;
  created_by: string;
  member_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
};

export type GymlyGroupMemberRow = {
  group_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
};

export type GymlyGroupInviteRow = {
  id: string;
  group_id: string;
  inviter_id: string;
  invitee_id: string;
  status: string;
  created_at: string;
  responded_at: string | null;
};

export type GymlyGroupMessageRow = {
  id: string;
  group_id: string;
  sender_id: string | null;
  body: string | null;
  message_type: 'text' | 'system' | 'planned_workout' | 'check_in';
  metadata: Record<string, unknown>;
  created_at: string;
};
