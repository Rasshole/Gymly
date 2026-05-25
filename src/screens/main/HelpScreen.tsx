/**
 * Help Screen
 */

import React, {useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  SafeAreaView,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {HELP_NAV_ITEMS} from '@/data/helpNavItems';
import colors from '@/theme/colors';
import {spacing, typography} from '@/theme/designTokens';
import {useTranslation} from '@/i18n';

const HelpScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const {t} = useTranslation();

  const handleHelpItemPress = (itemId: string, itemTitle: string) => {
    switch (itemId) {
      case '1':
        navigation.navigate('Support');
        break;
      case '2':
        navigation.navigate('AboutGymly');
        break;
      case '3':
        navigation.navigate('Terms');
        break;
      case '4':
        navigation.navigate('PrivacyPolicy');
        break;
      case '5':
        Alert.alert(t('help.deleteAccountTitle'), t('help.deleteAccountBody'));
        break;
      default:
        Alert.alert(t('common.comingSoon'), t('help.comingSoon', {title: itemTitle}));
    }
  };

  const helpItems = useMemo(() => [...HELP_NAV_ITEMS], []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('help.title')}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}>
        {helpItems.map((item, index) => {
          const title = t(item.titleKey);
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.helpItem,
                index === helpItems.length - 1 && styles.helpItemLast,
              ]}
              onPress={() => handleHelpItemPress(item.id, title)}
              activeOpacity={0.7}>
              <Text
                style={[
                  styles.helpItemText,
                  item.isDestructive && styles.helpItemTextDestructive,
                ]}>
                {title}
              </Text>
              <Icon
                name="chevron-forward"
                size={20}
                color={item.isDestructive ? colors.error : colors.textMuted}
              />
            </TouchableOpacity>
          );
        })}

        <View style={styles.separator} />

        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>Gymly v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundCard,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    ...typography.h4,
    color: colors.text,
  },
  headerRight: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  helpItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  helpItemLast: {
    borderBottomWidth: 0,
  },
  helpItemText: {
    ...typography.body,
    color: colors.text,
  },
  helpItemTextDestructive: {
    color: colors.error,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: 8,
  },
  versionContainer: {
    paddingHorizontal: 16,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  versionText: {
    ...typography.small,
    color: colors.textMuted,
  },
});

export default HelpScreen;
