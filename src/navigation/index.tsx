import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import RootStack from './RootStack';
import { navigationRef } from './rootNavigation';
import { setSessionExpiredHandler } from '../api/client';

export default function Navigation() {
  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (navigationRef.isReady()) {
        navigationRef.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      }
    });
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <RootStack />
    </NavigationContainer>
  );
}