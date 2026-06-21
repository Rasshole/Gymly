import type {AppLanguage} from '@/i18n/types';

type SocialNotifInput = {
  type: string;
  actorName?: string;
  likeCount?: number;
  grouped?: boolean;
};

export function formatSocialNotificationBody(
  language: AppLanguage,
  input: SocialNotifInput,
): string {
  const name = input.actorName?.trim() || (language === 'da' ? 'En bruger' : 'Someone');
  const count = input.likeCount ?? 1;

  switch (input.type) {
    case 'post_like':
    case 'biceps_reaction':
      if (count > 10) {
        return language === 'da'
          ? '10+ personer gav din træning 💪'
          : '10+ people liked your workout 💪';
      }
      if (count >= 2) {
        return language === 'da'
          ? `${count} personer gav din træning 💪`
          : `${count} people liked your workout 💪`;
      }
      return language === 'da'
        ? `${name} gav din træning 💪`
        : `${name} liked your workout 💪`;
    case 'post_comment':
      return language === 'da'
        ? `${name} kommenterede på din træning`
        : `${name} commented on your workout`;
    case 'comment_like':
      return language === 'da'
        ? `${name} gav din kommentar 💪`
        : `${name} liked your comment 💪`;
    default:
      return '';
  }
}
