import type {AppLanguage} from '@/i18n/types';
import type {LegalDocument} from './types';

const privacyDa: LegalDocument = {
  icon: '🔐',
  headerTitle: 'Privatlivspolitik',
  mainTitle: 'Privatlivspolitik for Gymly',
  lastUpdated: 'Sidst opdateret: 9. sep. 2026',
  sections: [
    {
      paragraphs: [
        'Gymly respekterer dit privatliv. Denne privatlivspolitik forklarer, hvordan vi indsamler, bruger og beskytter dine personoplysninger i overensstemmelse med GDPR og App Store-krav.',
      ],
    },
    {
      title: '1. Hvilke oplysninger indsamler vi?',
      paragraphs: ['Vi kan indsamle følgende oplysninger:'],
      subsectionTitle: 'Oplysninger du selv giver:',
      bullets: [
        'Navn eller brugernavn',
        'E-mailadresse',
        'Profiloplysninger',
        'Træningsdata og check-ins',
      ],
    },
    {
      subsectionTitle: 'Automatisk indsamlede oplysninger:',
      bullets: [
        'Enhedsoplysninger',
        'App-brug og interaktion',
        'Præcis lokation under check-in og aktiv træning (til geofence-verifikation)',
        'Afstand til center under aktiv check-in (gemmes som meter, ikke koordinater)',
      ],
      paragraphs: [
        'Under en aktiv træning kan Gymly bruge placering, mens appen er åben, til at vurdere om du stadig er ved centret, og automatisk tjekke dig ud, når du forlader centerområdet, når appen bliver aktiv igen. Dine præcise GPS-koordinater uploades ikke; vi gemmer typisk kun afstanden til centret sammen med din session.',
        'Placering bruges ikke til reklame.',
      ],
    },
    {
      title: '2. Hvordan bruger vi dine data?',
      paragraphs: ['Vi bruger dine data til at:'],
      bullets: [
        'Drive og forbedre Appen',
        'Muliggøre sociale funktioner',
        'Vise check-ins og aktivitet',
        'Verificere check-in inden for ca. 200 m og automatisk tjek-ud, når appen er aktiv',
        'Sikre appens stabilitet og sikkerhed',
        'Overholde juridiske krav',
      ],
    },
    {
      title: '3. Deling af data',
      paragraphs: [
        'Vi deler ikke dine personoplysninger med tredjeparter til markedsføring.',
        'Data kan deles med:',
      ],
      bullets: [
        'Tekniske serviceudbydere (hosting, analytics)',
        'Myndigheder, hvis loven kræver det',
      ],
      paragraphsAfterBullets: ['Alle partnere er GDPR-compliant.'],
    },
    {
      title: '4. Opbevaring af data',
      paragraphs: ['Vi opbevarer kun dine data, så længe:'],
      bullets: [
        'Din konto er aktiv',
        'Det er nødvendigt af juridiske eller tekniske årsager',
      ],
      paragraphsAfterBullets: ['Du kan til enhver tid anmode om sletning.'],
    },
    {
      title: '5. Dine rettigheder',
      paragraphs: ['Du har ret til:'],
      bullets: [
        'Indsigt i dine data',
        'Rettelse af forkerte oplysninger',
        'Sletning af dine data',
        'Dataportabilitet',
        'At trække samtykke tilbage',
      ],
      paragraphsAfterBullets: ['Kontakt os for at udøve dine rettigheder.'],
    },
    {
      title: '6. Datasikkerhed',
      paragraphs: [
        'Vi anvender tekniske og organisatoriske sikkerhedsforanstaltninger for at beskytte dine data mod misbrug, tab og uautoriseret adgang.',
      ],
    },
    {
      title: '7. Børn',
      paragraphs: [
        'Gymly er ikke rettet mod børn under 13 år.',
        'Vi indsamler ikke bevidst data fra børn under denne alder.',
      ],
    },
    {
      title: '8. Ændringer i privatlivspolitikken',
      paragraphs: [
        'Vi kan opdatere denne privatlivspolitik.',
        'Væsentlige ændringer vil blive kommunikeret i Appen.',
      ],
    },
    {
      title: '9. Kontakt',
      paragraphs: ['📧 gymly@support.com'],
    },
  ],
};

const privacyEn: LegalDocument = {
  icon: '🔐',
  headerTitle: 'Privacy policy',
  mainTitle: 'Privacy Policy for Gymly',
  lastUpdated: 'Last updated: Sep 9, 2026',
  sections: [
    {
      paragraphs: [
        'Gymly respects your privacy. This privacy policy explains how we collect, use, and protect your personal information in accordance with GDPR and App Store requirements.',
      ],
    },
    {
      title: '1. What information do we collect?',
      paragraphs: ['We may collect the following information:'],
      subsectionTitle: 'Information you provide:',
      bullets: [
        'Name or username',
        'Email address',
        'Profile information',
        'Workout data and check-ins',
      ],
    },
    {
      subsectionTitle: 'Automatically collected information:',
      bullets: [
        'Device information',
        'App usage and interaction',
        'Precise location during check-in and active workouts (for geofence verification)',
        'Distance to the gym during an active check-in (stored as meters, not coordinates)',
      ],
      paragraphs: [
        'During an active workout, Gymly may use location while the app is open to verify whether you are still at the gym, and can automatically check you out when you leave the gym area once the app becomes active again. Your exact GPS coordinates are not uploaded; we typically store only the distance to the gym with your session.',
        'Location is not used for advertising.',
      ],
    },
    {
      title: '2. How do we use your data?',
      paragraphs: ['We use your data to:'],
      bullets: [
        'Operate and improve the App',
        'Enable social features',
        'Show check-ins and activity',
        'Verify check-in within about 200 m and automatic check-out when the app is active',
        'Ensure app stability and security',
        'Comply with legal requirements',
      ],
    },
    {
      title: '3. Sharing of data',
      paragraphs: [
        'We do not share your personal information with third parties for marketing.',
        'Data may be shared with:',
      ],
      bullets: [
        'Technical service providers (hosting, analytics)',
        'Authorities when required by law',
      ],
      paragraphsAfterBullets: ['All partners are GDPR-compliant.'],
    },
    {
      title: '4. Data retention',
      paragraphs: ['We only retain your data while:'],
      bullets: [
        'Your account is active',
        'It is necessary for legal or technical reasons',
      ],
      paragraphsAfterBullets: ['You may request deletion at any time.'],
    },
    {
      title: '5. Your rights',
      paragraphs: ['You have the right to:'],
      bullets: [
        'Access your data',
        'Correct inaccurate information',
        'Delete your data',
        'Data portability',
        'Withdraw consent',
      ],
      paragraphsAfterBullets: ['Contact us to exercise your rights.'],
    },
    {
      title: '6. Data security',
      paragraphs: [
        'We use technical and organizational security measures to protect your data against misuse, loss, and unauthorized access.',
      ],
    },
    {
      title: '7. Children',
      paragraphs: [
        'Gymly is not directed at children under 13.',
        'We do not knowingly collect data from children under this age.',
      ],
    },
    {
      title: '8. Changes to this privacy policy',
      paragraphs: [
        'We may update this privacy policy.',
        'Material changes will be communicated in the App.',
      ],
    },
    {
      title: '9. Contact',
      paragraphs: ['📧 gymly@support.com'],
    },
  ],
};

/** Reviewed legal packs by locale; missing → English (unchanged behavior). */
const PRIVACY_BY_LOCALE: Partial<Record<AppLanguage, LegalDocument>> & {
  en: LegalDocument;
} = {
  da: privacyDa,
  en: privacyEn,
};

export function getPrivacyPolicyContent(language: AppLanguage): LegalDocument {
  return PRIVACY_BY_LOCALE[language] ?? PRIVACY_BY_LOCALE.en;
}
