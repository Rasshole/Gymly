/**
 * @jest-environment node
 */

describe('demoContentGate', () => {
  const originalDev = (global as {__DEV__?: boolean}).__DEV__;

  afterEach(() => {
    (global as {__DEV__?: boolean}).__DEV__ = originalDev;
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadGate(opts: {
    surface: boolean;
    localQa: string;
    dev: boolean;
  }) {
    (global as {__DEV__?: boolean}).__DEV__ = opts.dev;
    jest.doMock('@/config/launchSurfaceConfig', () => ({
      SURFACE_DEMO_MODE_IN_SETTINGS: opts.surface,
    }));
    jest.doMock('react-native-config', () => ({
      GYMLY_LOCAL_QA: opts.localQa,
    }));
    jest.doMock('@/demo/demoModeStore', () => ({
      useDemoModeStore: {
        getState: () => ({enabled: true, hydrated: true}),
      },
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@/demo/demoContentGate') as typeof import('@/demo/demoContentGate');
  }

  it('hides demo Settings in Release even if surface flag is true', () => {
    const {shouldShowDemoSettingsSection, canUseDemoContentControls, isDemoContentMode} =
      loadGate({
        surface: true,
        localQa: 'true',
        dev: false,
      });
    expect(canUseDemoContentControls()).toBe(false);
    expect(shouldShowDemoSettingsSection()).toBe(false);
    expect(isDemoContentMode()).toBe(false);
  });

  it('hides demo Settings in __DEV__ when SURFACE_DEMO_MODE_IN_SETTINGS is false (launch default)', () => {
    const {shouldShowDemoSettingsSection} = loadGate({
      surface: false,
      localQa: 'true',
      dev: true,
    });
    expect(shouldShowDemoSettingsSection()).toBe(false);
  });

  it('shows demo Settings in __DEV__ only when SURFACE_DEMO_MODE_IN_SETTINGS is true', () => {
    const {shouldShowDemoSettingsSection} = loadGate({
      surface: true,
      localQa: 'false',
      dev: true,
    });
    expect(shouldShowDemoSettingsSection()).toBe(true);
  });

  it('never activates demo content mode in Release even if store says enabled', () => {
    const {isDemoContentMode} = loadGate({
      surface: true,
      localQa: 'true',
      dev: false,
    });
    expect(isDemoContentMode()).toBe(false);
  });
});
