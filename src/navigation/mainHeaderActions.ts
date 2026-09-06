/**
 * Contextual main-tab header actions — avoids overcrowding the right header.
 * Shop uses its own stack header (Saved + Messages).
 */

export type MainTabHeaderKey =
  | 'Home'
  | 'Friends'
  | 'CheckIn'
  | 'Shop'
  | 'Profile'
  | 'Messages';

export type MainHeaderActionConfig = {
  messages: boolean;
  calendar: boolean;
  settings: boolean;
};

export function getMainHeaderActions(
  tab: MainTabHeaderKey,
): MainHeaderActionConfig {
  switch (tab) {
    case 'Home':
      return {messages: true, calendar: true, settings: false};
    case 'Friends':
      return {messages: true, calendar: false, settings: false};
    case 'CheckIn':
      return {messages: true, calendar: false, settings: false};
    case 'Profile':
      return {messages: true, calendar: false, settings: true};
    case 'Shop':
      return {messages: false, calendar: false, settings: false};
    case 'Messages':
      return {messages: false, calendar: false, settings: false};
    default:
      return {messages: true, calendar: false, settings: false};
  }
}

export function countHeaderActions(config: MainHeaderActionConfig): number {
  return Number(config.messages) + Number(config.calendar) + Number(config.settings);
}
