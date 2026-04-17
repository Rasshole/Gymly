/**
 * Venner ved check-in — stub indtil push/in-app notifikationer er koblet på.
 * Undgår Metro "unknown module" når filen manglede lokalt.
 */

export type NotifyFriendsOfCheckInParams = {
  actorUserId: string;
  displayName: string;
  gymId: number;
  gymName: string;
  city?: string;
  workoutEncoded?: string;
};

export async function notifyFriendsOfCheckIn(
  _params: NotifyFriendsOfCheckInParams,
): Promise<void> {
  /* TODO: Firestore + FCM til venner der følger brugeren */
}
