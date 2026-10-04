/**
 * Shared header action — opens Messages (stack or tab) with unread badge.
 */
import React, {useMemo} from 'react';
import {TouchableOpacity, View, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import type {NavigationProp, ParamListBase} from '@react-navigation/native';
import colors from '@/theme/colors';
import {radius} from '@/theme/designTokens';
import {useTranslation} from '@/i18n';
import {useChatStore} from '@/store/chatStore';
import NotificationBadge from '@/components/ui/Badge';
import {navigateToRootScreen} from '@/navigation/rootNavigation';
import {totalDmUnread} from '@/utils/dmUnreadTotal';

const HEADER_ICON = 24;

type Props = {
  color?: string;
};

export const MessagesHeaderButton: React.FC<Props> = ({color = colors.text}) => {
  const {t} = useTranslation();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const chats = useChatStore(s => s.chats);
  const unread = useMemo(() => totalDmUnread(chats), [chats]);

  return (
    <TouchableOpacity
      onPress={() => {
        navigateToRootScreen(navigation as never, 'Messages', {});
      }}
      style={styles.iconTap}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={
        unread > 0
          ? t('shop.a11y.messagesWithUnread', {count: String(unread)})
          : t('tabs.messages')
      }>
      <View style={styles.wrap}>
        <Icon name="chatbubbles-outline" size={HEADER_ICON} color={color} />
        {unread > 0 ? (
          <View style={styles.badge} pointerEvents="none">
            <NotificationBadge count={unread} variant="error" maxCount={99} compact />
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  iconTap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrap: {
    position: 'relative',
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
  },
});

export default MessagesHeaderButton;
