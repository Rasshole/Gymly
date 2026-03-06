/**
 * Gymly Cloud Functions
 * Opdaterer leaderboard stats ved check-in, workout, PR
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

const db = admin.firestore();
const FIELD = admin.firestore.FieldValue;

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

function getMonthStart(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split('T')[0];
}

/** Aktivitetsscore: (checkIns*2) + (prs*5) + (trainingMinutes/30) + (socialWorkouts*3) */
function calcActivityScore(
  checkIns: number,
  prs: number,
  trainingMinutes: number,
  socialWorkouts: number
): number {
  return checkIns * 2 + prs * 5 + Math.floor(trainingMinutes / 30) + socialWorkouts * 3;
}

/**
 * onCheckIn – når bruger tjekker ind
 * Trigger: Firestore onCreate på checkIns/{checkInId}
 */
export const onCheckIn = functions.firestore
  .document('checkIns/{checkInId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const userId = data.userId;
    const gymId = data.gymId;

    if (!userId || !gymId) return;

    const statsRef = db.collection('leaderboardStats').doc(userId);
    const gymRef = db.collection('gyms').doc(String(gymId))
      .collection('leaderboardEntries').doc(userId);

    await db.runTransaction(async (tx) => {
      const statsSnap = await tx.get(statsRef);
      const stats = statsSnap.exists ? statsSnap.data()! : {};

      const inc = (obj: any, key: string, subkey: string) => {
        const val = obj?.[key]?.[subkey] ?? 0;
        return {[key]: {[subkey]: val + 1, ...stats[key]}};
      };

      const checkInsWeekly = (stats.checkIns?.weekly ?? 0) + 1;
      const checkInsMonthly = (stats.checkIns?.monthly ?? 0) + 1;
      const checkInsAllTime = (stats.checkIns?.allTime ?? 0) + 1;

      tx.set(statsRef, {
        userId,
        displayName: data.displayName || stats.displayName,
        photoURL: data.photoURL || stats.photoURL,
        checkIns: {weekly: checkInsWeekly, monthly: checkInsMonthly, allTime: checkInsAllTime},
        prs: stats.prs || {weekly: 0, monthly: 0, allTime: 0},
        trainingMinutes: stats.trainingMinutes || {weekly: 0, monthly: 0, allTime: 0},
        socialWorkouts: stats.socialWorkouts || {weekly: 0, monthly: 0, allTime: 0},
        streak: stats.streak ?? 0,
        muscleGroupsTrained: stats.muscleGroupsTrained || {weekly: 0, monthly: 0, allTime: 0},
        strengthPRs: stats.strengthPRs || {bench: 0, squat: 0, deadlift: 0},
        activityScore: stats.activityScore || {weekly: 0, monthly: 0, allTime: 0},
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});

      const gymEntrySnap = await tx.get(gymRef);
      const gymEntry = gymEntrySnap.exists ? gymEntrySnap.data()! : {};
      const gymCheckIns = (gymEntry.checkIns ?? 0) + 1;
      const activityScore = calcActivityScore(gymCheckIns, 0, 0, 0);

      tx.set(gymRef, {
        userId,
        displayName: data.displayName || gymEntry.displayName,
        photoURL: data.photoURL || gymEntry.photoURL,
        checkIns: gymCheckIns,
        score: activityScore,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});
    });
  });

/**
 * onWorkoutComplete – når træning afsluttes
 * Trigger: Firestore onCreate på workouts/{workoutId}
 */
export const onWorkoutComplete = functions.firestore
  .document('workouts/{workoutId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const userId = data.userId;
    const durationMinutes = data.duration ?? 0;
    const muscleGroup = data.muscleGroup;
    const friendIds = data.friendIds || [];

    if (!userId) return;

    const statsRef = db.collection('leaderboardStats').doc(userId);
    const gymId = data.gymId;

    await db.runTransaction(async (tx) => {
      const statsSnap = await tx.get(statsRef);
      const stats = statsSnap.exists ? statsSnap.data()! : {};

      const trainingMinutes = stats.trainingMinutes || {weekly: 0, monthly: 0, allTime: 0};
      const socialWorkouts = stats.socialWorkouts || {weekly: 0, monthly: 0, allTime: 0};
      const socialInc = friendIds.length > 0 ? 1 : 0;

      tx.set(statsRef, {
        userId,
        displayName: stats.displayName,
        photoURL: stats.photoURL,
        checkIns: stats.checkIns || {weekly: 0, monthly: 0, allTime: 0},
        prs: stats.prs || {weekly: 0, monthly: 0, allTime: 0},
        trainingMinutes: {
          weekly: trainingMinutes.weekly + durationMinutes,
          monthly: trainingMinutes.monthly + durationMinutes,
          allTime: trainingMinutes.allTime + durationMinutes,
        },
        socialWorkouts: {
          weekly: socialWorkouts.weekly + socialInc,
          monthly: socialWorkouts.monthly + socialInc,
          allTime: socialWorkouts.allTime + socialInc,
        },
        streak: stats.streak ?? 0,
        muscleGroupsTrained: stats.muscleGroupsTrained || {weekly: 0, monthly: 0, allTime: 0},
        strengthPRs: stats.strengthPRs || {bench: 0, squat: 0, deadlift: 0},
        activityScore: stats.activityScore || {weekly: 0, monthly: 0, allTime: 0},
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});

      if (gymId) {
        const gymRef = db.collection('gyms').doc(String(gymId))
          .collection('leaderboardEntries').doc(userId);
        const gymSnap = await tx.get(gymRef);
        const gymEntry = gymSnap.exists ? gymSnap.data()! : {};
        const checkIns = gymEntry.checkIns ?? 0;
        const activityScore = calcActivityScore(checkIns, 0, durationMinutes, socialInc);
        tx.set(gymRef, {
          userId,
          displayName: gymEntry.displayName,
          photoURL: gymEntry.photoURL,
          checkIns: gymEntry.checkIns ?? 0,
          score: activityScore,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
      }
    });
  });

/**
 * onPRSet – når PR slås
 * Trigger: Firestore onCreate på personalRecords/{prId}
 */
export const onPRSet = functions.firestore
  .document('personalRecords/{prId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const userId = data.userId;
    const exercise = (data.exercise || '').toLowerCase();
    const weight = data.weight ?? 0;

    if (!userId) return;

    const statsRef = db.collection('leaderboardStats').doc(userId);
    const gymId = data.gymId;

    const strengthKey = exercise.includes('bænk') || exercise.includes('bench') ? 'bench'
      : exercise.includes('squat') ? 'squat'
      : exercise.includes('dødløft') || exercise.includes('deadlift') ? 'deadlift'
      : null;

    await db.runTransaction(async (tx) => {
      const statsSnap = await tx.get(statsRef);
      const stats = statsSnap.exists ? statsSnap.data()! : {};

      const prs = stats.prs || {weekly: 0, monthly: 0, allTime: 0};
      const strengthPRs = stats.strengthPRs || {bench: 0, squat: 0, deadlift: 0};

      const updates: any = {
        prs: {
          weekly: prs.weekly + 1,
          monthly: prs.monthly + 1,
          allTime: prs.allTime + 1,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (strengthKey) {
        updates.strengthPRs = {
          ...strengthPRs,
          [strengthKey]: Math.max(strengthPRs[strengthKey] ?? 0, weight),
        };
      }

      tx.set(statsRef, updates, {merge: true});
    });
  });

/**
 * updateWeeklyChampion – kør hver dag eller ved check-out
 * Finder bruger med højeste weekly activityScore per gym
 */
export const updateWeeklyChampions = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('Europe/Copenhagen')
  .onRun(async () => {
    const gymsSnap = await db.collection('gyms').get();
    const weekStart = getWeekStart();

    for (const gymDoc of gymsSnap.docs) {
      const gymId = gymDoc.id;
      const gymName = gymDoc.data()?.name || `Center ${gymId}`;
      const entriesSnap = await db.collection('gyms').doc(gymId)
        .collection('leaderboardEntries')
        .orderBy('score', 'desc')
        .limit(1)
        .get();

      const top = entriesSnap.docs[0];
      if (!top) continue;

      const d = top.data();
      await db.collection('gyms').doc(gymId).collection('meta').doc('weeklyChampion').set({
        gymId: parseInt(gymId, 10) || gymId,
        gymName,
        userId: top.id,
        displayName: d.displayName || 'Bruger',
        photoURL: d.photoURL,
        activityScore: d.score ?? 0,
        weekStart,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });
