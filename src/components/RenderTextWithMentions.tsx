/**
 * RenderTextWithMentions Component
 * Renders text with clickable @mentions
 */

import React from 'react';
import {Text, StyleSheet} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {colors} from '@/theme/colors';

type Friend = {
  id: string;
  name: string;
};

type RenderTextWithMentionsProps = {
  text: string;
  mentionedUsers?: string[];
  friends?: Friend[];
};

const RenderTextWithMentions = ({
  text,
  mentionedUsers,
  friends = [],
}: RenderTextWithMentionsProps) => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const parts: Array<{text: string; isMention: boolean; userId?: string}> = [];
  const mentionRegex = /@(\w+)/g;
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before mention
    if (match.index > lastIndex) {
      parts.push({text: text.substring(lastIndex, match.index), isMention: false});
    }

    // Add mention
    const mentionedName = match[1];
    const friend = friends.find(f => f.name === mentionedName);
    const userId = friend?.id || (mentionedUsers && mentionedUsers.length > 0 ? mentionedUsers[0] : undefined);

    parts.push({
      text: `@${mentionedName}`,
      isMention: true,
      userId: userId,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({text: text.substring(lastIndex), isMention: false});
  }

  return (
    <Text style={styles.text}>
      {parts.map((part, index) => {
        if (part.isMention && part.userId) {
          return (
            <Text
              key={index}
              style={styles.mention}
              onPress={() => {
                navigation.navigate('FriendProfile', {friendId: part.userId});
              }}>
              {part.text}
            </Text>
          );
        }
        return <Text key={index}>{part.text}</Text>;
      })}
    </Text>
  );
};

const styles = StyleSheet.create({
  text: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
  },
  mention: {
    color: colors.primary,
    fontWeight: '600',
  },
});

export default RenderTextWithMentions;




