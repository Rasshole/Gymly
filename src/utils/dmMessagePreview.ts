import type {PlannedWorkoutDmEmbed} from '@/store/chatStore';

export const GYM_PLAN_INVITE_PREFIX = '[GYM_PLAN_INVITE]';
export const GYM_PLAN_STATUS_PREFIX = '[GYM_PLAN_STATUS]';

/** Fast tekst til lister, notifikationer og tråd-preview (aldrig rå JSON). */
export const TRAINING_INVITE_CHAT_LIST_PREVIEW = '💪 Inviterede dig til træning';

function formatGymPlanStatusWord(status: string | undefined): string {
  switch (status) {
    case 'accepted':
      return 'Accepteret';
    case 'declined':
      return 'Afvist';
    case 'pending':
      return 'Inviteret';
    case 'joined':
      return 'Joinet';
    case 'left':
      return 'Forladt';
    default:
      return 'Træningsinvitation opdateret';
  }
}

/**
 * Menneskelig preview-tekst til beskedlister, sidste besked på tråd m.m.
 * Ræ bodys med [GYM_PLAN_INVITE] / [GYM_PLAN_STATUS] vises aldrig som rå JSON.
 */
export function getMessagePreview(message: {
  text?: string;
  plannedWorkoutEmbed?: PlannedWorkoutDmEmbed | null;
  imageUri?: string | null;
}): string {
  if (message.plannedWorkoutEmbed?.kind === 'invite') {
    return TRAINING_INVITE_CHAT_LIST_PREVIEW;
  }
  if (message.plannedWorkoutEmbed?.kind === 'status') {
    return formatGymPlanStatusWord(message.plannedWorkoutEmbed.status);
  }
  const raw = (message.text ?? '').trim();
  if (raw.startsWith(GYM_PLAN_INVITE_PREFIX)) {
    return TRAINING_INVITE_CHAT_LIST_PREVIEW;
  }
  if (raw.startsWith(GYM_PLAN_STATUS_PREFIX)) {
    try {
      const payload = JSON.parse(raw.slice(GYM_PLAN_STATUS_PREFIX.length)) as {status?: string};
      return formatGymPlanStatusWord(payload.status);
    } catch {
      return 'Træningsinvitation opdateret';
    }
  }
  return raw;
}
