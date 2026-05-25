/**
 * Static navigation for Help screen (not user/demo data)
 */
export type HelpNavItem = {
  id: string;
  titleKey: string;
  icon: string;
  isDestructive?: boolean;
};

export const HELP_NAV_ITEMS: HelpNavItem[] = [
  {id: '1', titleKey: 'help.navSupport', icon: 'help-circle-outline'},
  {id: '2', titleKey: 'help.navAbout', icon: 'information-circle-outline'},
  {id: '3', titleKey: 'help.navTerms', icon: 'document-text-outline'},
  {id: '4', titleKey: 'help.navPrivacy', icon: 'shield-checkmark-outline'},
  {id: '5', titleKey: 'help.navDeleteAccount', icon: 'trash-outline', isDestructive: true},
];
