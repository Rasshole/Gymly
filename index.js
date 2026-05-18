/**
 * @format
 */

import 'react-native-get-random-values';
import 'react-native-gesture-handler';
import './src/theme/colors';
import {AppRegistry, LogBox} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

/**
 * Under udvikling viser React Native et nederst banner for advarsler (LogBox),
 * fx «Open debugger to view warnings» — det forstyrrer screen recording.
 * Sæt til false når du aktivt vil rette advarsler i Metro/console.
 */
if (__DEV__) {
  LogBox.ignoreAllLogs(true);
}

AppRegistry.registerComponent(appName, () => App);

