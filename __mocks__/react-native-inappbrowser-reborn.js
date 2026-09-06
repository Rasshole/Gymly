/**
 * Jest stub for react-native-inappbrowser-reborn (no native module in Node).
 * Production behaviour is unchanged; checkout tests inject their own browser port.
 */
module.exports = {
  open: jest.fn(async () => ({type: 'cancel'})),
  openAuth: jest.fn(async () => ({type: 'cancel'})),
  close: jest.fn(async () => undefined),
  closeAuth: jest.fn(async () => undefined),
  isAvailable: jest.fn(async () => false),
  warmup: jest.fn(async () => undefined),
  mayLaunchUrl: jest.fn(async () => undefined),
};
