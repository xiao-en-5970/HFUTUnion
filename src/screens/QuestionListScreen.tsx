import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function QuestionListScreen() {
  return (
    <View style={styles.container}>
      <Text style={{ fontSize: 24 }}>question Page</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff'
  },
});
