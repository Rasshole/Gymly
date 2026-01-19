/**
 * Mock Friends Data
 * Centralized friend data for development and testing
 */

export type Friend = {
  id: string;
  name: string;
  initials: string;
  isOnline?: boolean;
  gymId?: number;
};

export const MOCK_FRIENDS: Friend[] = [
  {id: '1', name: 'Jeff', initials: 'J', isOnline: true},
  {id: '2', name: 'Marie', initials: 'M', isOnline: false},
  {id: '3', name: 'Lars', initials: 'L', isOnline: true},
  {id: '4', name: 'Sofia', initials: 'S', isOnline: true},
  {id: '5', name: 'Patti', initials: 'P', isOnline: false},
];

// Legacy export for backwards compatibility
export const FRIENDS = MOCK_FRIENDS;




