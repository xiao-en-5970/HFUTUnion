import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import MainTabs from './MainTabs';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import PostDetailScreen from '../screens/PostDetailScreen';
import ChatDetail from '../screens/ChatDetail';
import ProfileScreen from '../screens/ProfileScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import CreateDraftScreen from '../screens/CreateDraftScreen';
import EditPostScreen from '../screens/EditPostScreen';
import PostListScreen from '../screens/PostListScreen';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  MainTabs: undefined;
  Profile: undefined;
  EditProfile: undefined;
  PostDetail: { postId: string };
  ChatDetail: { chatId: string };
  CreatePost: undefined; 
  CreateDraft: undefined;
  EditPost: undefined;
  PostList: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStack() {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} />
      <Stack.Screen name="ChatDetail" component={ChatDetail} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="CreateDraft" component={CreateDraftScreen} /> 
      <Stack.Screen name="EditPost" component={EditPostScreen} /> 
      <Stack.Screen name="PostList" component={PostListScreen} /> 
      
    </Stack.Navigator>
  );
}