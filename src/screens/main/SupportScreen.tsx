/**
 * Support Screen
 * AI support bot to help users with questions about the Gymly app
 */

import React, {useState, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';

type Message = {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
};

const SupportScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hej! Jeg er Gymly support bot. Hvordan kan jeg hjælpe dig i dag?',
      isUser: false,
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const generateBotResponse = (userMessage: string): string => {
    const lowerMessage = userMessage.toLowerCase();

    // Simple keyword-based responses (can be replaced with actual AI later)
    if (lowerMessage.includes('check') || lowerMessage.includes('tjek')) {
      return 'For at tjekke ind på et gym, gå til "Tjek ind" fanen i bunden af appen og vælg dit gym.';
    } else if (lowerMessage.includes('venn') || lowerMessage.includes('friend')) {
      return 'Du kan tilføje venner ved at gå til "Online" fanen og søge efter brugere. Tryk på deres profil for at sende en venneanmodning.';
    } else if (lowerMessage.includes('pr') || lowerMessage.includes('rekord')) {
      return 'For at tilføje en PR, gå til din profil, tryk på "Dine PR\'s og Reps" og vælg "PR\'s" fanen. Tryk derefter på plus-ikonet for at tilføje en ny PR.';
    } else if (lowerMessage.includes('gruppe') || lowerMessage.includes('group')) {
      return 'Du kan oprette eller deltage i grupper ved at gå til "Grupper" fanen. Her kan du søge efter grupper eller oprette din egen.';
    } else if (lowerMessage.includes('indstilling') || lowerMessage.includes('setting')) {
      return 'Du kan tilgå indstillinger ved at trykke på tandhjulet i venstre hjørne af header\'en. Her kan du ændre dit email, privatlivsindstillinger og meget mere.';
    } else if (lowerMessage.includes('hej') || lowerMessage.includes('hello') || lowerMessage.includes('hjælp')) {
      return 'Hej! Jeg kan hjælpe dig med spørgsmål om:\n• Check-in på gym\n• Tilføje venner\n• PR\'s og Reps\n• Grupper\n• Indstillinger\n\nHvad vil du gerne vide mere om?';
    } else {
      return 'Tak for dit spørgsmål! Jeg arbejder på at forbedre mine svar. For nu kan jeg hjælpe med spørgsmål om check-in, venner, PR\'s, grupper og indstillinger. Prøv at spørge om et af disse emner.';
    }
  };

  const handleSend = () => {
    if (!inputText.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText.trim(),
      isUser: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');

    // Simulate bot thinking time
    setTimeout(() => {
      const botResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: generateBotResponse(userMessage.text),
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botResponse]);
      
      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({animated: true});
      }, 100);
    }, 500);
  };

  const renderMessage = ({item}: {item: Message}) => (
    <View
      style={[
        styles.messageContainer,
        item.isUser ? styles.userMessage : styles.botMessage,
      ]}>
      <Text
        style={[
          styles.messageText,
          item.isUser ? styles.userMessageText : styles.botMessageText,
        ]}>
        {item.text}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}>
            <Icon name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Support</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({animated: true})}
        />

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Skriv dit spørgsmål..."
            placeholderTextColor="#8E8E93"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              !inputText.trim() && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!inputText.trim()}>
            <Icon
              name="send"
              size={20}
              color={inputText.trim() ? '#007AFF' : '#C7C7CC'}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  headerRight: {
    width: 32,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageContainer: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  botMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#fff',
  },
  botMessageText: {
    color: '#000',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  input: {
    flex: 1,
    maxHeight: 100,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    fontSize: 16,
    color: '#000',
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#F0F0F0',
  },
});

export default SupportScreen;


