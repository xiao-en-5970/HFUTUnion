import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './RootStack';

export const navigationRef =
  createNavigationContainerRef<RootStackParamList>();
