import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import RootStack from './RootStack';
import { navigationRef } from './rootNavigation';
import { setSessionExpiredHandler } from '../api/client';
import { MessagesUnreadProvider } from '../context/MessagesUnreadContext';

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
      {/* 未读 Provider 提到最顶层：Stack 里的 Messages/Profile 都能共享同一份轮询 */}
      <MessagesUnreadProvider>
        <RootStack />
      </MessagesUnreadProvider>
    </NavigationContainer>
  );
}