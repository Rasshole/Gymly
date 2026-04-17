/**
 * Statisk navigation til Hjælp-skærmen (ikke bruger-/demo-data)
 */
export type HelpNavItem = {
  id: string;
  title: string;
  icon: string;
  isDestructive?: boolean;
};

export const HELP_NAV_ITEMS: HelpNavItem[] = [
  {id: '1', title: 'Support', icon: 'help-circle-outline'},
  {id: '2', title: 'Om Gymly', icon: 'information-circle-outline'},
  {id: '3', title: 'Vilkår og betingelser', icon: 'document-text-outline'},
  {id: '4', title: 'Privatlivspolitik', icon: 'shield-checkmark-outline'},
  {id: '5', title: 'Slet din konto', icon: 'trash-outline', isDestructive: true},
];
