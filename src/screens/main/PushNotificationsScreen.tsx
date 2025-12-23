/**
 * Push Notifications Screen
 * Manage push notification preferences
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {colors} from '@/theme/colors';

interface NotificationSetting {
  id: string;
  title: string;
  description?: string;
  enabled: boolean;
}

interface NotificationSection {
  id: string;
  title: string;
  settings: NotificationSetting[];
}

const PushNotificationsScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();

  const [notificationSections, setNotificationSections] = useState<
    NotificationSection[]
  >([
    {
      id: 'workouts',
      title: 'TRÆNINGER',
      settings: [
        {
          id: 'workout_reminder',
          title: 'Træningspåmindelse',
          description: 'Notificer mig 24 timer før en af mine træninger',
          enabled: true,
        },
        {
          id: 'workout_change',
          title: 'Træning ændret',
          description:
            'Notificer mig når en af mine træninger bliver ændret eller aflyst',
          enabled: true,
        },
        {
          id: 'workout_rsvp',
          title: 'Træning RSVP',
          description:
            'Notificer mig når nogen melder sig til en træning jeg organiserer',
          enabled: true,
        },
        {
          id: 'workout_invitation',
          title: 'Træningsinvitation',
          description:
            'Notificer mig når en ven inviterer mig til at deltage i en træning',
          enabled: true,
        },
      ],
    },
    {
      id: 'posts',
      title: 'POSTS',
      settings: [
        {
          id: 'post_kudos_likes',
          title: 'Post likes',
          description:
            'Notificer mig når jeg modtager likes på et post eller mine kommentarer',
          enabled: true,
        },
        {
          id: 'post_comments',
          title: 'Post kommentarer',
          description:
            'Notificer mig når nogen kommenterer på mit post eller svarer på min kommentar på et post',
          enabled: true,
        },
        {
          id: 'post_mentions',
          title: 'Omtaler i posts',
          description:
            'Notificer mig når nogen nævner mig i en kommentar eller svarer direkte til min kommentar',
          enabled: true,
        },
      ],
    },
    {
      id: 'activities',
      title: 'TRÆNING',
      settings: [
        {
          id: 'activity_kudos_likes',
          title: 'Likes',
          description:
            'Notificer mig når jeg modtager likes på mine træninger eller mine kommentarer',
          enabled: true,
        },
        {
          id: 'activity_comments',
          title: 'Kommentarer',
          description: 'Notificer mig når nogen kommenterer på min træning',
          enabled: true,
        },
        {
          id: 'activity_comments_others',
          title: 'Kommentarer på andres træninger',
          description:
            'Notificer mig når nogen kommenterer på en træning jeg har kommenteret på',
          enabled: false,
        },
        {
          id: 'activity_mentions',
          title: 'Omtaler i træninger',
          description: 'Notificer mig når nogen nævner mig i en træning',
          enabled: true,
        },
      ],
    },
    {
      id: 'friends',
      title: 'VENNER',
      settings: [
        {
          id: 'friends_activities',
          title: 'Venners træninger',
          description:
            'Notificer mig når mine venner poster interessante træninger (f.eks. NY PR, træning med video eller træning med andre), eller venner jeg har favoriteret poster træninger',
          enabled: true,
        },
        {
          id: 'suggested_friend',
          title: 'Foreslået ven',
          description: 'Notificer mig for at foreslå venner at følge',
          enabled: true,
        },
        {
          id: 'friend_joins',
          title: 'Ven bliver medlem',
          description: 'Notificer mig når nogen jeg kender bliver medlem af Gymly',
          enabled: true,
        },
        {
          id: 'new_follower',
          title: 'Ny følger',
          description: 'Notificer mig når nogen følger mig på Gymly',
          enabled: true,
        },
        {
          id: 'new_friend_request',
          title: 'Ny venneanmodning',
          description: 'Notificer mig når nogen anmoder om at blive min ven',
          enabled: true,
        },
      ],
    },
    {
      id: 'messages',
      title: 'BESKED',
      settings: [
        {
          id: 'message_received',
          title: 'Besked modtaget',
          description: 'Notificer mig når jeg har modtaget en besked',
          enabled: true,
        },
        {
          id: 'message_request',
          title: 'Besked anmodning',
          description: 'Notificer mig når jeg har modtaget en beskedanmodning',
          enabled: true,
        },
        {
          id: 'group_chat_message',
          title: 'Gruppechat besked',
          description: 'Notificer mig når en besked bliver sendt i en af mine grupper',
          enabled: true,
        },
      ],
    },
    {
      id: 'clubs',
      title: 'GRUPPER',
      settings: [
        {
          id: 'club_invitation',
          title: 'Gruppeinvitation',
          description: 'Notificer mig når en ven inviterer mig til at blive medlem af en gruppe',
          enabled: true,
        },
        {
          id: 'club_new_event',
          title: 'Gruppe træning',
          description:
            'Notificer mig når en træning bliver tilføjet i en af mine grupper',
          enabled: true,
        },
        {
          id: 'club_join_request',
          title: 'Anmodning om medlemskab',
          description:
            'Notificer mig når nogen anmoder om at blive medlem af en af mine grupper',
          enabled: true,
        },
      ],
    },
    {
      id: 'media',
      title: 'MEDIER',
      settings: [
        {
          id: 'videos',
          title: 'Videoer',
          description: 'Notificer mig når nogen jeg følger har uploadet en video',
          enabled: true,
        },
      ],
    },
    {
      id: 'other',
      title: 'ANDET',
      settings: [
        {
          id: 'marketing',
          title: 'Marketing',
          description:
            'Tillad Gymly at sende mig push notifikationer om tilbud eller andre marketing bekendtgørelser',
          enabled: false,
        },
        {
          id: 'feature_tips',
          title: 'Funktioner og abonnementstips',
          description:
            'Modtag bekendtgørelser om nye funktioner og tips til, hvordan man bedst bruger dem',
          enabled: true,
        },
      ],
    },
  ]);

  const handleToggle = async (sectionId: string, settingId: string, value: boolean) => {
    try {
      setNotificationSections(prevSections =>
        prevSections.map(section =>
          section.id === sectionId
            ? {
                ...section,
                settings: section.settings.map(setting =>
                  setting.id === settingId
                    ? {...setting, enabled: value}
                    : setting,
                ),
              }
            : section,
        ),
      );

      // TODO: Implement actual API call to save notification preferences
      // await updateNotificationPreference(settingId, value);
    } catch (error) {
      Alert.alert('Fejl', 'Kunne ikke opdatere indstilling');
      // Revert on error
      setNotificationSections(prevSections =>
        prevSections.map(section =>
          section.id === sectionId
            ? {
                ...section,
                settings: section.settings.map(setting =>
                  setting.id === settingId
                    ? {...setting, enabled: !value}
                    : setting,
                ),
              }
            : section,
        ),
      );
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header Section */}
        <View style={styles.headerSection}>
          <Icon name="notifications-outline" size={48} color={colors.primary} />
          <Text style={styles.headerTitle}>Push Notifikationer</Text>
          <Text style={styles.headerDescription}>
            Vælg hvilke push notifikationer du vil modtage
          </Text>
        </View>

        {/* Notification Settings */}
        {notificationSections.map((section, sectionIndex) => (
          <View
            key={section.id}
            style={[
              styles.section,
              sectionIndex > 0 && styles.sectionSpacing,
            ]}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.settings.map((setting, settingIndex) => (
              <View
                key={setting.id}
                style={[
                  styles.settingItem,
                  settingIndex === section.settings.length - 1 &&
                    styles.settingItemLast,
                ]}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>{setting.title}</Text>
                  {setting.description && (
                    <Text style={styles.settingDescription}>
                      {setting.description}
                    </Text>
                  )}
                </View>
                <Switch
                  value={setting.enabled}
                  onValueChange={value =>
                    handleToggle(section.id, setting.id, value)
                  }
                  trackColor={{false: '#E5E5EA', true: '#34C759'}}
                  thumbColor="#fff"
                />
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  headerSection: {
    alignItems: 'center',
    paddingVertical: 32,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  headerDescription: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  section: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: 16,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionSpacing: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F9FA',
  },
  settingItemLast: {
    borderBottomWidth: 0,
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});

export default PushNotificationsScreen;

