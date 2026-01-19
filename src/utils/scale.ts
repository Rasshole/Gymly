import {Dimensions} from 'react-native';

const {width: screenWidth} = Dimensions.get('window');
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.2;
const BASE_WIDTH = 390;

const scaleFactor = Math.min(Math.max(screenWidth / BASE_WIDTH, MIN_SCALE), MAX_SCALE);

export const scale = (value: number) => Math.round(value * scaleFactor);

export const getScaleFactor = () => scaleFactor;
