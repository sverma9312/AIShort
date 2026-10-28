import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { captureError } from '@/lib/telemetry';

interface State {
  error?: Error;
}

/** Last line of defense: report the error and offer a retry instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(Object.assign(error, { componentStack: info.componentStack }));
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>The problem has been reported. Please try again.</Text>
        <Pressable
          onPress={() => this.setState({ error: undefined })}
          style={styles.button}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
    backgroundColor: '#FFFFFF',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#111114' },
  message: { fontSize: 15, color: '#5B5B66', textAlign: 'center' },
  button: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
  },
  buttonText: { color: '#FFFFFF', fontWeight: '600' },
});
