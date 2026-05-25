export type LegalSection = {
  title?: string;
  paragraphs?: string[];
  bullets?: string[];
  paragraphsAfterBullets?: string[];
  subsectionTitle?: string;
};

export type LegalDocument = {
  icon: string;
  headerTitle: string;
  mainTitle: string;
  lastUpdated: string;
  sections: LegalSection[];
};
