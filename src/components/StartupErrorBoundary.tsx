import React, {Component, ErrorInfo, ReactNode} from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';

type Props = {children: ReactNode};
type State = {error: Error | null};

/**
 * Fanger render-fejl under navigation/tema så appen ikke kun viser rød LogBox ved simple fejl.
 */
export class StartupErrorBoundary extends Component<Props, State> {
  state: State = {error: null};

  static getDerivedStateFromError(error: Error): State {
    return {error};
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (__DEV__) {
      console.error('[StartupErrorBoundary]', error, info.componentStack);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.root} testID="startup-error-boundary">
          <Text style={styles.title}>Noget gik galt</Text>
          <ScrollView style={styles.scroll}>
            <Text style={styles.body}>{this.state.error.message}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    padding: 24,
  },
  title: {fontSize: 18, fontWeight: '600', marginBottom: 8, color: '#111827'},
  scroll: {maxHeight: '60%'},
  body: {fontSize: 14, color: '#4B5563'},
});
