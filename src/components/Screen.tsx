import React from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, space } from '../theme/colors';

type Props = {
  children: React.ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
};

export default function Screen({ children, scroll, edges }: Props) {
  const content = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {children}
    </KeyboardAvoidingView>
  );

  return (
    <SafeAreaView
      style={styles.safe}
      edges={edges ?? ['top', 'left', 'right']}>
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scrollContent: {
    padding: space.md,
    paddingBottom: space.xl * 2,
  },
});
