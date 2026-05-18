/**
 * Bygger alt demo-indhold ud fra faste personas + rigtige center-id'er fra registry.
 */

import type {FeedItem} from '@/store/feedStore';
import type {NotificationRow} from '@/services/notifications/inAppNotificationService';
import type {Chat, ChatMessage, ChatPlan} from '@/store/chatStore';
import type {WorkoutPlanEntry} from '@/store/workoutPlanStore';
import type {ActiveNowFriendRow} from '@/services/supabase/gymlyActiveNowService';
import type {LocalCenterActivity} from '@/services/supabase/localCentersActivityService';
import type {ActivityEvent} from '@/types/activity.types';
import type {MuscleGroup} from '@/types/workout.types';
import {getActiveDanishGyms, getDanishGymDemoFallback, type DanishGym} from '@/data/danishGyms';
import {DEMO_PROFILES, demoProfileAvatarSeed} from '@/demo/demoPersonas';

function pickGym(...needles: string[]): DanishGym {
  const list = getActiveDanishGyms();
  for (const q of needles) {
    const qn = q.toLowerCase();
    const hit = list.find(
      g =>
        g.name.toLowerCase().includes(qn) ||
        (g.brand && g.brand.toLowerCase().includes(qn)),
    );
    if (hit) {
      return hit;
    }
  }
  if (list.length > 0) {
    return list[0]!;
  }
  return getDanishGymDemoFallback();
}

function isoMinsAgo(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString();
}

function feedPhoto(username: string, w = 720, h = 900): string {
  return `https://picsum.photos/seed/gymlyfeed-${encodeURIComponent(username)}/${w}/${h}`;
}

export type DemoPayload = {
  friends: typeof DEMO_PROFILES;
  feedItems: FeedItem[];
  notificationRows: NotificationRow[];
  chats: Chat[];
  messagesByChat: Record<string, ChatMessage[]>;
  /** Synkroniseret med DM-træning-invite (lilla top-banner i ChatScreen). */
  activePlansByChat: Record<string, ChatPlan>;
  plannedWorkouts: WorkoutPlanEntry[];
  totalActiveUsers: number;
  activeFriends: ActiveNowFriendRow[];
  currentUserActive: ActiveNowFriendRow | null;
  localCenters: LocalCenterActivity[];
  activityEvents: ActivityEvent[];
  /** Ekstra centre på kortet (tal) udover `localCenters` */
  demoMapExtraRollups: {gymId: string; total: number; friends: number}[];
};

export function buildDemoPayload(realUserId: string): DemoPayload {
  const friends = DEMO_PROFILES.slice(0, 40);
  const p = (i: number) => friends[i % friends.length]!;

  const gymSats = pickGym('sats', 'frederiksberg', 'frb');
  const gymFrb = pickGym('frederiksberg', 'frb', 'sats');
  const gymValby = pickGym('valby', 'pure');
  const gymFisken = pickGym('fisketorvet', 'sats');
  const gymVan = pickGym('vanløse', 'vanlose', 'pure');
  const gymFx = pickGym('fitness', 'x');
  const gymLoop = pickGym('loop', 'østerbro');
  const gymNorre = pickGym('nørrebro', 'norrebro');
  const gymAdel = pickGym('adelgade', 'sats');

  const muscles = (m: MuscleGroup[]): MuscleGroup[] => m;

  const feedItems: FeedItem[] = [
    {
      id: 'demo-feed-1',
      type: 'photo',
      userId: p(0).id,
      user: p(0).displayName,
      userAvatarUrl: p(0).avatarUrl ?? undefined,
      description: 'Ben dag done — squats + leg press 🔥',
      timestamp: isoMinsAgo(12),
      photoUri: feedPhoto(p(0).username),
      workoutInfo: `${gymValby.name} · Ben`,
      rating: 5,
      muscles: muscles(['ben']),
    },
    {
      id: 'demo-feed-2',
      type: 'photo',
      userId: p(1).id,
      user: p(1).displayName,
      userAvatarUrl: p(1).avatarUrl ?? undefined,
      description: 'Late night cardio — stadig energi 💜',
      timestamp: isoMinsAgo(45),
      photoUri: feedPhoto(p(1).username),
      workoutInfo: `${gymSats.name} · Cardio`,
      muscles: muscles(['cardio']),
    },
    {
      id: 'demo-feed-3',
      type: 'summary',
      userId: p(2).id,
      user: p(2).displayName,
      userAvatarUrl: p(2).avatarUrl ?? undefined,
      description: 'Solid session idag med crewet',
      timestamp: isoMinsAgo(120),
      workoutInfo: `${gymFisken.name} · Bryst & triceps`,
      muscles: muscles(['bryst', 'triceps']),
    },
    {
      id: 'demo-feed-4',
      type: 'photo',
      userId: p(3).id,
      user: p(3).displayName,
      userAvatarUrl: p(3).avatarUrl ?? undefined,
      description: 'Streak 12 — vi holder momentum 🙌',
      timestamp: isoMinsAgo(180),
      photoUri: feedPhoto(p(3).username),
      workoutInfo: `${gymVan.name} · Skulder`,
      muscles: muscles(['skulder']),
    },
    {
      id: 'demo-feed-5',
      type: 'photo',
      userId: p(4).id,
      user: p(4).displayName,
      userAvatarUrl: p(4).avatarUrl ?? undefined,
      description: 'Reformer efter job — ro i kroppen',
      timestamp: isoMinsAgo(360),
      photoUri: feedPhoto(p(4).username),
      workoutInfo: `${gymSats.name} · Reformer`,
      muscles: muscles(['reformer']),
    },
    {
      id: 'demo-feed-6',
      type: 'photo',
      userId: p(5).id,
      user: p(5).displayName,
      userAvatarUrl: p(5).avatarUrl ?? undefined,
      description: 'Mave + core — klar til sommer 😅',
      timestamp: isoMinsAgo(520),
      photoUri: feedPhoto(p(5).username),
      workoutInfo: `${gymFx.name} · Mave`,
      muscles: muscles(['mave']),
    },
    {
      id: 'demo-feed-7',
      type: 'photo',
      userId: p(6).id,
      user: p(6).displayName,
      userAvatarUrl: p(6).avatarUrl ?? undefined,
      description: 'Morgencrew i Nordhavn — locked in 💜',
      timestamp: isoMinsAgo(8),
      photoUri: feedPhoto(p(6).username),
      workoutInfo: `${gymSats.name} · Bryst`,
      rating: 5,
      muscles: muscles(['bryst']),
    },
    {
      id: 'demo-feed-8',
      type: 'summary',
      userId: p(7).id,
      user: p(7).displayName,
      userAvatarUrl: p(7).avatarUrl ?? undefined,
      description: 'København føles lille når alle træner samme vibe',
      timestamp: isoMinsAgo(210),
      workoutInfo: `${gymLoop.name} · Cardio`,
      muscles: muscles(['cardio']),
    },
    {
      id: 'demo-feed-9',
      type: 'photo',
      userId: p(8).id,
      user: p(8).displayName,
      userAvatarUrl: p(8).avatarUrl ?? undefined,
      description: 'Cardio i dag 😭 men vi fik det gjort',
      timestamp: isoMinsAgo(640),
      photoUri: feedPhoto(p(8).username),
      workoutInfo: `${gymNorre.name} · Cardio`,
      rating: 4,
      muscles: muscles(['cardio']),
    },
    {
      id: 'demo-feed-10',
      type: 'photo',
      userId: p(9).id,
      user: p(9).displayName,
      userAvatarUrl: p(9).avatarUrl ?? undefined,
      description: 'PR på rows — tak for spot @crew',
      timestamp: isoMinsAgo(900),
      photoUri: feedPhoto(p(9).username),
      workoutInfo: `${gymFisken.name} · Ryg`,
      rating: 5,
      muscles: muscles(['ryg']),
    },
    {
      id: 'demo-feed-11',
      type: 'photo',
      userId: p(11).id,
      user: p(11).displayName,
      userAvatarUrl: p(11).avatarUrl ?? undefined,
      description: 'Du er syg — god energi i dag 🔥',
      timestamp: isoMinsAgo(24),
      photoUri: feedPhoto(p(11).username),
      workoutInfo: `${gymValby.name} · Ben`,
      rating: 5,
      muscles: muscles(['ben']),
    },
    {
      id: 'demo-feed-12',
      type: 'summary',
      userId: p(12).id,
      user: p(12).displayName,
      userAvatarUrl: p(12).avatarUrl ?? undefined,
      description: 'Planlagt crew session — se jer kl. 17',
      timestamp: isoMinsAgo(95),
      workoutInfo: `${gymAdel.name} · Bryst`,
      muscles: muscles(['bryst', 'triceps']),
    },
  ];

  const notificationRows: NotificationRow[] = [
    {
      id: 'demo-notif-fr',
      user_id: realUserId,
      actor_user_id: p(10).id,
      type: 'friend_request',
      title: 'Venneanmodning',
      body: `${p(10).displayName} vil være venner med dig`,
      data: {},
      is_read: false,
      created_at: isoMinsAgo(3),
    },
    {
      id: 'demo-notif-1',
      user_id: realUserId,
      actor_user_id: p(0).id,
      type: 'workout_reaction',
      title: 'Vibe',
      body: `${p(0).displayName} sendte dig en vibe efter din session`,
      data: {kind: 'vibe'},
      is_read: false,
      created_at: isoMinsAgo(8),
    },
    {
      id: 'demo-notif-2',
      user_id: realUserId,
      actor_user_id: p(1).id,
      type: 'friend_request_accepted',
      title: 'Venneanmodning accepteret',
      body: `${p(1).displayName} accepterede din anmodning`,
      data: {},
      is_read: false,
      created_at: isoMinsAgo(25),
    },
    {
      id: 'demo-notif-3',
      user_id: realUserId,
      actor_user_id: p(2).id,
      type: 'planned_workout_invite',
      title: 'Træningsinvitation',
      body: `${p(2).displayName} inviterede dig · Bryst · i aften kl. 18.00`,
      data: {gym: gymSats.name},
      is_read: false,
      created_at: isoMinsAgo(40),
    },
    {
      id: 'demo-notif-4',
      user_id: realUserId,
      actor_user_id: p(3).id,
      type: 'friend_checked_in',
      title: 'Ven tjekket ind',
      body: `${p(3).displayName} er ved ${gymValby.name}`,
      data: {},
      is_read: true,
      created_at: isoMinsAgo(90),
    },
    {
      id: 'demo-notif-5',
      user_id: realUserId,
      actor_user_id: p(4).id,
      type: 'planned_workout_reminder',
      title: 'Påmindelse',
      body: `I morgen kl. 07.30 · Ben · ${gymVan.name}`,
      data: {},
      is_read: false,
      created_at: isoMinsAgo(200),
    },
    {
      id: 'demo-notif-6',
      user_id: realUserId,
      actor_user_id: p(5).id,
      type: 'badge_unlocked',
      title: 'Badge',
      body: `${p(5).displayName} fejrede en ny streak-milepæl`,
      data: {},
      is_read: true,
      created_at: isoMinsAgo(400),
    },
    {
      id: 'demo-notif-7',
      user_id: realUserId,
      actor_user_id: p(6).id,
      type: 'planned_workout_accepted',
      title: 'Session bekræftet',
      body: `${p(6).displayName} deltager på jeres plan 💪`,
      data: {},
      is_read: false,
      created_at: isoMinsAgo(55),
    },
    {
      id: 'demo-notif-8',
      user_id: realUserId,
      actor_user_id: null,
      type: 'workout_reminder',
      title: 'Husk træningen',
      body: 'Du har en planlagt session om 2 timer',
      data: {},
      is_read: true,
      created_at: isoMinsAgo(600),
    },
    {
      id: 'demo-notif-9',
      user_id: realUserId,
      actor_user_id: p(7).id,
      type: 'dm_message',
      title: 'Besked',
      body: `${p(7).displayName}: Bryst i morgen?`,
      data: {},
      is_read: false,
      created_at: isoMinsAgo(12),
    },
    {
      id: 'demo-notif-10',
      user_id: realUserId,
      actor_user_id: p(8).id,
      type: 'friend_checked_in',
      title: 'Ven tjekket ind',
      body: `${p(8).displayName} checkede ind ved ${gymAdel.name}`,
      data: {},
      is_read: false,
      created_at: isoMinsAgo(33),
    },
    {
      id: 'demo-notif-11',
      user_id: realUserId,
      actor_user_id: p(9).id,
      type: 'streak_milestone',
      title: 'Streak',
      body: `${p(9).displayName} holdt sin streak 🔥`,
      data: {},
      is_read: true,
      created_at: isoMinsAgo(140),
    },
    {
      id: 'demo-notif-12',
      user_id: realUserId,
      actor_user_id: p(11).id,
      type: 'planned_workout_invite',
      title: 'Invitation',
      body: `${p(11).displayName}: Kommer du SATS FRB?`,
      data: {},
      is_read: false,
      created_at: isoMinsAgo(70),
    },
    {
      id: 'demo-notif-13',
      user_id: realUserId,
      actor_user_id: p(12).id,
      type: 'dm_message',
      title: 'Besked',
      body: `${p(12).displayName}: Cardio i dag 😭`,
      data: {},
      is_read: true,
      created_at: isoMinsAgo(300),
    },
    {
      id: 'demo-notif-14',
      user_id: realUserId,
      actor_user_id: p(13).id,
      type: 'planned_workout_accepted',
      title: 'Invitation accepteret',
      body: `${p(13).displayName} accepterede din invitation`,
      data: {},
      is_read: false,
      created_at: isoMinsAgo(48),
    },
    {
      id: 'demo-notif-15',
      user_id: realUserId,
      actor_user_id: p(14).id,
      type: 'workout_reaction',
      title: 'Vibe',
      body: `${p(14).displayName} sendte dig en vibe`,
      data: {kind: 'vibe'},
      is_read: true,
      created_at: isoMinsAgo(520),
    },
    {
      id: 'demo-notif-16',
      user_id: realUserId,
      actor_user_id: p(15).id,
      type: 'badge_unlocked',
      title: 'Badge',
      body: `${p(15).displayName} låste op: Night Grinder`,
      data: {},
      is_read: true,
      created_at: isoMinsAgo(880),
    },
  ];

  const threadEmil = 'demo-thread-emil';
  const threadFreja = 'demo-thread-freja';
  const threadLucas = 'demo-thread-lucas';
  const threadSara = 'demo-thread-sara';
  const threadTobias = 'demo-thread-tobias';
  const threadClara = 'demo-thread-clara';
  const threadLinea = 'demo-thread-linea';

  const chats: Chat[] = [
    {
      id: threadEmil,
      participantIds: [realUserId, p(0).id].sort(),
      participantNames: ['Dig', p(0).displayName],
      lastActivity: new Date(Date.now() - 3 * 60_000),
      unreadCount: 2,
      avatar: p(0).avatarUrl ?? undefined,
      avatarInitials: p(0).displayName.slice(0, 1),
      isActive: true,
    },
    {
      id: threadFreja,
      participantIds: [realUserId, p(6).id].sort(),
      participantNames: ['Dig', p(6).displayName],
      lastActivity: new Date(Date.now() - 22 * 60_000),
      unreadCount: 0,
      avatar: p(6).avatarUrl ?? undefined,
      avatarInitials: p(6).displayName.slice(0, 1),
      isActive: false,
    },
    {
      id: threadLucas,
      participantIds: [realUserId, p(7).id].sort(),
      participantNames: ['Dig', p(7).displayName],
      lastActivity: new Date(Date.now() - 2 * 3600_000),
      unreadCount: 0,
      avatar: p(7).avatarUrl ?? undefined,
      avatarInitials: p(7).displayName.slice(0, 1),
      isActive: true,
    },
    {
      id: threadSara,
      participantIds: [realUserId, p(4).id].sort(),
      participantNames: ['Dig', p(4).displayName],
      lastActivity: new Date(Date.now() - 26 * 3600_000),
      unreadCount: 0,
      avatar: p(4).avatarUrl ?? undefined,
      avatarInitials: p(4).displayName.slice(0, 1),
      isActive: false,
    },
    {
      id: threadTobias,
      participantIds: [realUserId, p(2).id].sort(),
      participantNames: ['Dig', p(2).displayName],
      lastActivity: new Date(Date.now() - 45 * 60_000),
      unreadCount: 1,
      avatar: p(2).avatarUrl ?? undefined,
      avatarInitials: p(2).displayName.slice(0, 1),
      isActive: true,
    },
    {
      id: threadClara,
      participantIds: [realUserId, p(3).id].sort(),
      participantNames: ['Dig', p(3).displayName],
      lastActivity: new Date(Date.now() - 90 * 60_000),
      unreadCount: 0,
      avatar: p(3).avatarUrl ?? undefined,
      avatarInitials: p(3).displayName.slice(0, 1),
      isActive: false,
    },
    {
      id: threadLinea,
      participantIds: [realUserId, p(36).id].sort(),
      participantNames: ['Dig', p(36).displayName],
      lastActivity: new Date(Date.now() - 18 * 60_000),
      unreadCount: 1,
      avatar: p(36).avatarUrl ?? undefined,
      avatarInitials: p(36).displayName.slice(0, 1),
      isActive: true,
    },
  ];

  const mkMsg = (
    id: string,
    text: string,
    senderId: string,
    minsAgo: number,
    extra?: Partial<ChatMessage>,
  ): ChatMessage => ({
    id,
    text,
    senderId,
    timestamp: new Date(Date.now() - minsAgo * 60_000),
    isRead: true,
    ...extra,
  });

  const tobiasInviteAt = new Date(Date.now() + 40 * 3600_000);

  const messagesByChat: Record<string, ChatMessage[]> = {
    [threadEmil]: [
      mkMsg('dm-e-1', 'Skal du bryst idag?', p(0).id, 120),
      mkMsg('dm-e-2', 'Tænker SATS — giver det mening?', realUserId, 115),
      mkMsg('dm-e-3', 'Ja, jeg er der omkring 17.30 💪', p(0).id, 110),
      mkMsg('dm-e-4', 'Locked in 💜', p(0).id, 8),
      mkMsg('dm-e-5', 'Kommer om 20', realUserId, 5, {
        readAt: new Date(Date.now() - 4 * 60_000),
      }),
    ],
    [threadFreja]: [
      mkMsg('dm-f-1', 'Solid session idag 🔥', p(6).id, 400),
      mkMsg('dm-f-2', 'Nice! Jeg tog ben i Valby', realUserId, 380),
    ],
    [threadLucas]: [
      mkMsg('dm-l-1', 'Kommer om 20 — finder squat rack', p(7).id, 150),
      mkMsg('dm-l-2', 'Perfekt, jeg holder plads', realUserId, 148),
    ],
    [threadSara]: [
      mkMsg('dm-s-1', 'Late night cardio crew?', p(4).id, 700),
      mkMsg('dm-s-2', 'Hvis klokken 21 passer, så ja', realUserId, 690),
    ],
    [threadTobias]: [
      mkMsg('dm-t-1', 'Kommer du SATS FRB?', p(2).id, 55),
      mkMsg('dm-t-2', 'Ja — jeg smutter derhen efter møde', realUserId, 50),
      mkMsg('dm-t-3', 'Perfekt, jeg varmer op i maskinen', p(2).id, 20),
      mkMsg(
        'dm-t-inv',
        '',
        p(2).id,
        14,
        {
          plannedWorkoutEmbed: {
            kind: 'invite',
            plannedWorkoutId: 'demo-plan-tobias-invite',
            centerName: gymFrb.name,
            scheduledAt: tobiasInviteAt.toISOString(),
            trainingTypes: ['bryst'],
            status: 'pending',
          },
        },
      ),
    ],
    [threadClara]: [
      mkMsg('dm-c-1', 'Cardio i dag 😭', p(3).id, 88),
      mkMsg('dm-c-2', 'Vi tager den sammen kl. 19?', realUserId, 85),
      mkMsg('dm-c-3', 'Deal', p(3).id, 82),
    ],
    [threadLinea]: [
      mkMsg('dm-li-1', 'Ben søndag kl. 11?', p(36).id, 40),
      mkMsg('dm-li-2', 'Yes — jeg booker', realUserId, 35),
    ],
  };

  chats.forEach(c => {
    const msgs = messagesByChat[c.id];
    const last = msgs?.[msgs.length - 1];
    if (last) {
      c.lastMessage = last;
    }
  });

  const activePlansByChat: Record<string, ChatPlan> = {
    [threadTobias]: {
      id: 'demo-plan-tobias-invite',
      gym: gymFrb,
      muscles: ['bryst'],
      scheduledAt: tobiasInviteAt,
      createdBy: p(2).id,
      joinedIds: [p(2).id],
      invitedIds: [realUserId],
      inviteeResponse: 'pending',
    },
  };

  const in2h = new Date(Date.now() + 2 * 3600_000);
  const tomorrow = new Date(Date.now() + 26 * 3600_000);

  const plannedWorkouts: WorkoutPlanEntry[] = [
    {
      id: 'demo-plan-1',
      creatorUserId: p(0).id,
      gym: gymSats,
      muscles: ['bryst'],
      scheduledAt: in2h,
      invitedFriends: [realUserId],
      acceptedFriends: [realUserId],
      inviteStatusByUserId: {[realUserId]: 'accepted'},
    },
    {
      id: 'demo-plan-2',
      creatorUserId: realUserId,
      gym: gymValby,
      muscles: ['ben'],
      scheduledAt: tomorrow,
      invitedFriends: [p(1).id, p(2).id],
      acceptedFriends: [p(1).id],
      inviteStatusByUserId: {
        [p(1).id]: 'accepted',
        [p(2).id]: 'pending',
      },
    },
    {
      id: 'demo-plan-3',
      creatorUserId: p(3).id,
      gym: gymFisken,
      muscles: ['skulder', 'mave'],
      scheduledAt: new Date(Date.now() + 50 * 3600_000),
      invitedFriends: [realUserId],
      acceptedFriends: [],
      inviteStatusByUserId: {[realUserId]: 'pending'},
    },
    {
      id: 'demo-plan-4',
      creatorUserId: p(1).id,
      gym: gymNorre,
      muscles: ['cardio'],
      scheduledAt: new Date(Date.now() + 3 * 86400_000 + 10 * 3600_000),
      invitedFriends: [realUserId, p(5).id],
      acceptedFriends: [realUserId],
      inviteStatusByUserId: {[realUserId]: 'accepted', [p(5).id]: 'pending'},
    },
    {
      id: 'demo-plan-5',
      creatorUserId: realUserId,
      gym: gymLoop,
      muscles: ['bryst'],
      scheduledAt: new Date(Date.now() + 5 * 86400_000 + 17 * 3600_000),
      invitedFriends: [p(0).id, p(3).id],
      acceptedFriends: [p(0).id, p(3).id],
      inviteStatusByUserId: {[p(0).id]: 'accepted', [p(3).id]: 'accepted'},
    },
  ];

  const started = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

  const activeFriends: ActiveNowFriendRow[] = [
    {
      userId: p(0).id,
      displayName: p(0).displayName,
      gymName: gymSats.name,
      workoutType: 'bryst',
      startedAt: started(14),
      avatarUrl: p(0).avatarUrl,
    },
    {
      userId: p(1).id,
      displayName: p(1).displayName,
      gymName: gymValby.name,
      workoutType: 'ben',
      startedAt: started(22),
      avatarUrl: p(1).avatarUrl,
    },
    {
      userId: p(2).id,
      displayName: p(2).displayName,
      gymName: gymFisken.name,
      workoutType: 'ryg',
      startedAt: started(6),
      avatarUrl: p(2).avatarUrl,
    },
    {
      userId: p(3).id,
      displayName: p(3).displayName,
      gymName: gymVan.name,
      workoutType: 'cardio',
      startedAt: started(41),
      avatarUrl: p(3).avatarUrl,
    },
    {
      userId: p(4).id,
      displayName: p(4).displayName,
      gymName: gymFx.name,
      workoutType: 'reformer',
      startedAt: started(19),
      avatarUrl: p(4).avatarUrl,
    },
    {
      userId: p(5).id,
      displayName: p(5).displayName,
      gymName: gymSats.name,
      workoutType: 'triceps',
      startedAt: started(52),
      avatarUrl: p(5).avatarUrl,
    },
    {
      userId: p(6).id,
      displayName: p(6).displayName,
      gymName: gymLoop.name,
      workoutType: 'biceps',
      startedAt: started(3),
      avatarUrl: p(6).avatarUrl,
    },
    {
      userId: p(7).id,
      displayName: p(7).displayName,
      gymName: gymNorre.name,
      workoutType: 'skulder',
      startedAt: started(31),
      avatarUrl: p(7).avatarUrl,
    },
    {
      userId: p(8).id,
      displayName: p(8).displayName,
      gymName: gymAdel.name,
      workoutType: 'bryst',
      startedAt: started(9),
      avatarUrl: p(8).avatarUrl,
    },
    {
      userId: p(9).id,
      displayName: p(9).displayName,
      gymName: gymLoop.name,
      workoutType: 'cardio',
      startedAt: started(16),
      avatarUrl: p(9).avatarUrl,
    },
    {
      userId: p(10).id,
      displayName: p(10).displayName,
      gymName: gymValby.name,
      workoutType: 'ben',
      startedAt: started(48),
      avatarUrl: p(10).avatarUrl,
    },
    {
      userId: p(11).id,
      displayName: p(11).displayName,
      gymName: gymFisken.name,
      workoutType: 'bryst',
      startedAt: started(27),
      avatarUrl: p(11).avatarUrl,
    },
    {
      userId: p(12).id,
      displayName: p(12).displayName,
      gymName: gymFisken.name,
      workoutType: 'cardio',
      startedAt: started(44),
      avatarUrl: p(12).avatarUrl,
    },
    {
      userId: p(13).id,
      displayName: p(13).displayName,
      gymName: gymNorre.name,
      workoutType: 'mave',
      startedAt: started(39),
      avatarUrl: p(13).avatarUrl,
    },
    {
      userId: p(14).id,
      displayName: p(14).displayName,
      gymName: gymAdel.name,
      workoutType: 'triceps',
      startedAt: started(58),
      avatarUrl: p(14).avatarUrl,
    },
    {
      userId: p(15).id,
      displayName: p(15).displayName,
      gymName: gymNorre.name,
      workoutType: 'bryst',
      startedAt: started(8),
      avatarUrl: p(15).avatarUrl,
    },
    {
      userId: p(16).id,
      displayName: p(16).displayName,
      gymName: gymSats.name,
      workoutType: 'skulder',
      startedAt: started(11),
      avatarUrl: p(16).avatarUrl,
    },
    {
      userId: p(17).id,
      displayName: p(17).displayName,
      gymName: gymFrb.name,
      workoutType: 'reformer',
      startedAt: started(24),
      avatarUrl: p(17).avatarUrl,
    },
    {
      userId: p(18).id,
      displayName: p(18).displayName,
      gymName: gymVan.name,
      workoutType: 'ben',
      startedAt: started(5),
      avatarUrl: p(18).avatarUrl,
    },
    {
      userId: p(19).id,
      displayName: p(19).displayName,
      gymName: gymFx.name,
      workoutType: 'biceps',
      startedAt: started(33),
      avatarUrl: p(19).avatarUrl,
    },
  ];

  const mkFriend = (
    profile: (typeof friends)[0],
    mins: number,
    wt: MuscleGroup = 'biceps',
  ): LocalCenterActivity['activeFriends'][0] => ({
    userId: profile.id,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    workoutType: wt,
    startedAt: started(mins),
  });

  const localCenters: LocalCenterActivity[] = [
    {
      centerId: gymSats.id,
      displayName: gymSats.name,
      brand: gymSats.brand ?? 'SATS',
      address: gymSats.address ?? null,
      totalActiveCount: 38,
      activeFriendsCount: 5,
      activeFriends: [
        mkFriend(p(0), 14, 'bryst'),
        mkFriend(p(5), 52, 'triceps'),
        mkFriend(p(6), 3, 'biceps'),
        mkFriend(p(16), 11, 'skulder'),
        mkFriend(p(20), 18, 'bryst'),
      ],
    },
    {
      centerId: gymFrb.id,
      displayName: gymFrb.name,
      brand: gymFrb.brand ?? 'SATS',
      address: gymFrb.address ?? null,
      totalActiveCount: 22,
      activeFriendsCount: 2,
      activeFriends: [mkFriend(p(17), 24, 'reformer'), mkFriend(p(21), 35, 'ben')],
    },
    {
      centerId: gymValby.id,
      displayName: gymValby.name,
      brand: gymValby.brand ?? 'PureGym',
      address: gymValby.address ?? null,
      totalActiveCount: 26,
      activeFriendsCount: 3,
      activeFriends: [
        mkFriend(p(1), 22, 'ben'),
        mkFriend(p(10), 48, 'ben'),
        mkFriend(p(22), 7, 'triceps'),
      ],
    },
    {
      centerId: gymFisken.id,
      displayName: gymFisken.name,
      brand: gymFisken.brand ?? null,
      address: gymFisken.address ?? null,
      totalActiveCount: 41,
      activeFriendsCount: 4,
      activeFriends: [
        mkFriend(p(2), 6, 'ryg'),
        mkFriend(p(11), 27, 'bryst'),
        mkFriend(p(12), 44, 'cardio'),
        mkFriend(p(23), 15, 'skulder'),
      ],
    },
    {
      centerId: gymLoop.id,
      displayName: gymLoop.name,
      brand: gymLoop.brand ?? 'LOOP',
      address: gymLoop.address ?? null,
      totalActiveCount: 19,
      activeFriendsCount: 2,
      activeFriends: [mkFriend(p(9), 16, 'cardio'), mkFriend(p(24), 4, 'biceps')],
    },
    {
      centerId: gymNorre.id,
      displayName: gymNorre.name,
      brand: gymNorre.brand ?? null,
      address: gymNorre.address ?? null,
      totalActiveCount: 23,
      activeFriendsCount: 3,
      activeFriends: [
        mkFriend(p(7), 31, 'skulder'),
        mkFriend(p(13), 39, 'mave'),
        mkFriend(p(15), 8, 'bryst'),
      ],
    },
    {
      centerId: gymAdel.id,
      displayName: gymAdel.name,
      brand: gymAdel.brand ?? 'SATS',
      address: gymAdel.address ?? null,
      totalActiveCount: 31,
      activeFriendsCount: 3,
      activeFriends: [
        mkFriend(p(8), 9, 'bryst'),
        mkFriend(p(14), 58, 'triceps'),
        mkFriend(p(25), 21, 'ryg'),
      ],
    },
  ];

  const demoMapExtraRollups = [
    {gymId: gymVan.id, total: 18, friends: 2},
    {gymId: gymFx.id, total: 14, friends: 1},
  ];

  const activityEvents: ActivityEvent[] = [
    {
      id: 'demo-act-1',
      type: 'check_in',
      userId: p(0).id,
      displayName: p(0).displayName,
      profileImageUrl: demoProfileAvatarSeed(p(0).username),
      message: `Tjekket ind på ${gymSats.name}`,
      timestamp: new Date(Date.now() - 15 * 60_000),
      gymName: gymSats.name,
      scope: 'friends',
      isFriend: true,
    },
    {
      id: 'demo-act-2',
      type: 'workout_completed',
      userId: p(1).id,
      displayName: p(1).displayName,
      profileImageUrl: demoProfileAvatarSeed(p(1).username),
      message: 'Færdiggjorde en ben-session',
      secondaryInfo: '72 min',
      timestamp: new Date(Date.now() - 3 * 3600_000),
      scope: 'friends',
      isFriend: true,
    },
    {
      id: 'demo-act-3',
      type: 'streak_milestone',
      userId: p(2).id,
      displayName: p(2).displayName,
      profileImageUrl: demoProfileAvatarSeed(p(2).username),
      message: 'Ny streak-milepæl',
      streakCount: 14,
      timestamp: new Date(Date.now() - 8 * 3600_000),
      scope: 'friends',
      isFriend: true,
    },
    {
      id: 'demo-act-4',
      type: 'online_now',
      userId: p(3).id,
      displayName: p(3).displayName,
      profileImageUrl: demoProfileAvatarSeed(p(3).username),
      message: 'Aktiv nu i nærheden',
      timestamp: new Date(Date.now() - 2 * 60_000),
      scope: 'local',
      isFriend: true,
    },
    {
      id: 'demo-act-5',
      type: 'check_in',
      userId: p(7).id,
      displayName: p(7).displayName,
      profileImageUrl: demoProfileAvatarSeed(p(7).username),
      message: `${p(7).displayName} startede skulder for 14 min siden — nær ${gymValby.name}`,
      timestamp: new Date(Date.now() - 14 * 60_000),
      gymName: gymValby.name,
      scope: 'friends',
      isFriend: true,
    },
    {
      id: 'demo-act-6',
      type: 'check_in',
      userId: p(6).id,
      displayName: p(6).displayName,
      profileImageUrl: demoProfileAvatarSeed(p(6).username),
      message: `Tjekket ind på ${gymLoop.name}`,
      timestamp: new Date(Date.now() - 4 * 60_000),
      gymName: gymLoop.name,
      scope: 'friends',
      isFriend: true,
    },
    {
      id: 'demo-act-7',
      type: 'workout_completed',
      userId: p(8).id,
      displayName: p(8).displayName,
      profileImageUrl: demoProfileAvatarSeed(p(8).username),
      message: 'Færdiggjorde skuldre',
      secondaryInfo: '46 min',
      timestamp: new Date(Date.now() - 5 * 3600_000),
      scope: 'friends',
      isFriend: true,
    },
    {
      id: 'demo-act-8',
      type: 'check_in',
      userId: p(15).id,
      displayName: p(15).displayName,
      profileImageUrl: demoProfileAvatarSeed(p(15).username),
      message: `Ven i nærheden ved ${gymNorre.name}`,
      timestamp: new Date(Date.now() - 50 * 60_000),
      gymName: gymNorre.name,
      scope: 'local',
      isFriend: true,
    },
  ];

  /** Tidlig viral vækst i København — mærkbart men ikke overdrevet */
  const totalActiveUsers = 412 + activeFriends.length * 6;

  return {
    friends,
    feedItems,
    notificationRows,
    chats,
    messagesByChat,
    activePlansByChat,
    plannedWorkouts,
    totalActiveUsers,
    activeFriends,
    currentUserActive: null,
    localCenters,
    activityEvents,
    demoMapExtraRollups,
  };
}
