/**
 * @format
 */

import 'react-native-get-random-values';
import 'react-native-gesture-handler';
import './src/theme/colors';
import {AppRegistry, LogBox} from 'react-native';

const {name: appName} = require('./app.json');

/**
 * TEMPORARY: visible startup QA (no Xcode console required).
 * Set STARTUP_QA_ENABLED=false in src/startup/StartupQaApp.tsx after device confirms.
 */
let Root;
try {
  const qa = require('./src/startup/StartupQaApp');
  if (typeof __DEV__ !== 'undefined' && __DEV__ && qa.STARTUP_QA_ENABLED) {
    Root = qa.default;
  } else {
    Root = require('./App').default;
  }
} catch {
  Root = require('./App').default;
}

if (__DEV__) {
  LogBox.ignoreAllLogs(true);
}

AppRegistry.registerComponent(appName, () => Root);
