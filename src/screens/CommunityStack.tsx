import React from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import CommunityTabs from './CommunityTabs'
import PostDetailScreen from './PostDetailScreen'
import CreatePostScreen from './CreatePostScreen'

const Stack = createStackNavigator()

export default function CommunityStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="CommunityHome"
        component={CommunityTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PostDetail"
        component={PostDetailScreen}
        options={{ title: '帖子详情' }}
      />
      <Stack.Screen
        name="CreatePost"
        component={CreatePostScreen}
        options={{ title: '发帖' }}
      />
    </Stack.Navigator>
  )
}