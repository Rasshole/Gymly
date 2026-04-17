/**
 * Auth stack param list — lives in its own file so auth screens can import types
 * without a circular dependency: AuthNavigator → screens → AuthNavigator (was breaking colors).
 */

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  Terms: undefined;
  PrivacyPolicy: undefined;
};
