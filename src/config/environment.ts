/**
 * Environment Configuration
 * Centralized configuration for API URLs and app settings
 */

export type Environment = 'development' | 'staging' | 'production';

interface Config {
  apiUrl: string;
  environment: Environment;
  enableLogging: boolean;
  mockApi: boolean;
}

const getEnvironment = (): Environment => {
  // In production, this would read from environment variables or build config
  if (__DEV__) {
    return 'development';
  }
  // You can add logic here to detect staging vs production
  return 'production';
};

const configs: Record<Environment, Config> = {
  development: {
    apiUrl: 'https://api-dev.gymly.app',
    environment: 'development',
    enableLogging: true,
    mockApi: true, // Use mock data in development
  },
  staging: {
    apiUrl: 'https://api-staging.gymly.app',
    environment: 'staging',
    enableLogging: true,
    mockApi: false,
  },
  production: {
    apiUrl: 'https://api.gymly.app',
    environment: 'production',
    enableLogging: false,
    mockApi: false,
  },
};

const currentEnvironment = getEnvironment();
const config = configs[currentEnvironment];

export default config;

// Export individual values for convenience
export const API_URL = config.apiUrl;
export const IS_DEVELOPMENT = config.environment === 'development';
export const IS_PRODUCTION = config.environment === 'production';
export const ENABLE_LOGGING = config.enableLogging;
export const USE_MOCK_API = config.mockApi;




