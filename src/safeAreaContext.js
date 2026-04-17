'use strict';

/** SafeAreaProvider / SafeAreaView — use `useSafeAreaInsets` from react-native-safe-area-context. */
const safeArea = require('react-native-safe-area-context');

const bundle = {
  SafeAreaProvider: safeArea.SafeAreaProvider,
  SafeAreaView: safeArea.SafeAreaView,
};
module.exports = bundle;
module.exports.default = bundle;
