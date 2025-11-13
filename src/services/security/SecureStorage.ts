/**
 * Secure Storage Service
 * Handles secure storage of sensitive data using React Native Keychain
 */

import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AuthTokens} from '@/types/auth.types';
import {User} from '@/types/user.types';

class SecureStorageService {
  private readonly SERVICE_NAME = 'com.gymly.app';
  
  // Keys for secure storage
  private readonly TOKENS_KEY = 'auth_tokens';
  private readonly USER_KEY = 'user_data';
  
  /**
   * Save authentication tokens securely
   */
  async saveTokens(tokens: AuthTokens): Promise<boolean> {
    try {
      const success = await Keychain.setGenericPassword(
        this.TOKENS_KEY,
        JSON.stringify(tokens),
        {
          service: this.SERVICE_NAME,
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
        }
      );
      return !!success;
    } catch (error) {
      console.error('Error saving tokens:', error);
      return false;
    }
  }

  /**
   * Retrieve authentication tokens
   */
  async getTokens(): Promise<AuthTokens | null> {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: this.SERVICE_NAME,
      });
      
      if (credentials) {
        return JSON.parse(credentials.password);
      }
      return null;
    } catch (error) {
      console.error('Error retrieving tokens:', error);
      return null;
    }
  }

  /**
   * Delete authentication tokens
   */
  async deleteTokens(): Promise<boolean> {
    try {
      return await Keychain.resetGenericPassword({
        service: this.SERVICE_NAME,
      });
    } catch (error) {
      console.error('Error deleting tokens:', error);
      return false;
    }
  }

  /**
   * Save user data (non-sensitive parts can go to AsyncStorage)
   */
  async saveUserData(user: User): Promise<void> {
    try {
      await AsyncStorage.setItem(this.USER_KEY, JSON.stringify(user));
    } catch (error) {
      console.error('Error saving user data:', error);
      throw error;
    }
  }

  /**
   * Retrieve user data
   */
  async getUserData(): Promise<User | null> {
    try {
      const userData = await AsyncStorage.getItem(this.USER_KEY);
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('Error retrieving user data:', error);
      return null;
    }
  }

  /**
   * Delete user data
   */
  async deleteUserData(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.USER_KEY);
    } catch (error) {
      console.error('Error deleting user data:', error);
    }
  }

  /**
   * Clear all stored data (for logout and account deletion)
   */
  async clearAll(): Promise<void> {
    try {
      await this.deleteTokens();
      await this.deleteUserData();
    } catch (error) {
      console.error('Error clearing all data:', error);
      throw error;
    }
  }

  /**
   * Check if tokens are expired
   */
  async areTokensValid(): Promise<boolean> {
    const tokens = await this.getTokens();
    if (!tokens) return false;
    
    const now = Date.now();
    return tokens.expiresAt > now;
  }
}

export default new SecureStorageService();

