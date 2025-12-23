/**
 * About Gymly Screen
 * Information about Gymly app, its purpose and features
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {TouchableOpacity} from 'react-native';
import {colors} from '@/theme/colors';

const AboutGymlyScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Om Gymly</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>Gymly</Text>
        </View>

        <Text style={styles.title}>Velkommen til Gymly</Text>

        <View style={styles.section}>
          <Text style={styles.text}>
            💪 Gymly er en social fitness-app, der gør træning synlig.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.text}>
            📍 Check ind i dit center, se hvem der træner 👥, track din progression 📊 og bliv motiveret af dit netværk 🔥. Vi er en social fitness-app, der kombinerer træning, fællesskab og progression i én platform.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.text}>
            Med Gymly kan du ✅ checke ind i dit fitnesscenter, se hvem der træner samtidig med dig 👥, tracke dine personlige rekorder 🏆, og følge dig og dine venners udvikling 📈.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.text}>
            👀 Se hvem der er i centeret, 🗺️ find dit center, 🤝 find træningspartnere, og bliv en del af et fællesskab, hvor vi alle arbejder mod at blive bedre 💪.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vores vision er at gøre træning:</Text>
          <View style={styles.visionList}>
            <View style={styles.visionItem}>
              <Text style={styles.visionText}>👥 Mere social</Text>
            </View>
            <View style={styles.visionItem}>
              <Text style={styles.visionText}>⚡ Mere forpligtende</Text>
            </View>
            <View style={styles.visionItem}>
              <Text style={styles.visionText}>🔥 Mere motiverende.</Text>
            </View>
          </View>
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
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  headerRight: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 16,
  },
  logoText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 32,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  text: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  featureList: {
    marginTop: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  featureText: {
    flex: 1,
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    marginLeft: 12,
  },
  visionList: {
    marginTop: 12,
  },
  visionItem: {
    marginBottom: 8,
  },
  visionText: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
  },
});

export default AboutGymlyScreen;


