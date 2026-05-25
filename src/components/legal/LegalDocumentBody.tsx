import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import type {LegalDocument} from '@/content/legal/types';
import colors from '@/theme/colors';

type Props = {
  document: LegalDocument;
};

export function LegalDocumentBody({document}: Props) {
  return (
    <View style={styles.content}>
      <Text style={styles.documentIcon}>{document.icon}</Text>
      <Text style={styles.mainTitle}>{document.mainTitle}</Text>
      <Text style={styles.lastUpdated}>{document.lastUpdated}</Text>
      {document.sections.map((section, index) => (
        <View key={index} style={styles.section}>
          {section.title ? (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          ) : null}
          {section.paragraphs?.map((paragraph, pIndex) => (
            <Text key={pIndex} style={styles.sectionText}>
              {paragraph}
            </Text>
          ))}
          {section.subsectionTitle ? (
            <Text style={styles.subsectionTitle}>{section.subsectionTitle}</Text>
          ) : null}
          {section.bullets ? (
            <View style={styles.bulletList}>
              {section.bullets.map((bullet, bIndex) => (
                <Text key={bIndex} style={styles.bulletPoint}>
                  • {bullet}
                </Text>
              ))}
            </View>
          ) : null}
          {section.paragraphsAfterBullets?.map((paragraph, pIndex) => (
            <Text key={`after-${pIndex}`} style={styles.sectionText}>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
  },
  documentIcon: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 16,
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  lastUpdated: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 8,
    marginBottom: 8,
  },
  sectionText: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: 12,
  },
  bulletList: {
    marginLeft: 8,
    marginBottom: 12,
  },
  bulletPoint: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: 4,
  },
});
