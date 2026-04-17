import type {ComponentType, PropsWithChildren} from 'react';

declare const safeArea: {
  SafeAreaProvider: ComponentType<PropsWithChildren<Record<string, unknown>>>;
  SafeAreaView: ComponentType<Record<string, unknown>>;
};

export default safeArea;
