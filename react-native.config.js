module.exports = {
  project: {
    // Skip CLI's automatic `pod install` (expects Gemfile + bundle on RN 0.76+).
    // Run `cd ios && pod install` manually after dependency changes.
    ios: {automaticPodsInstallation: false},
    android: {},
  },
  assets: ['./node_modules/react-native-vector-icons/Fonts/'],
};
