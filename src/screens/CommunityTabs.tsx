import React from 'react'
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs'
import PostListScreen from './PostListScreen'
import QuestionListScreen from './QuestionListScreen'

const Tab = createMaterialTopTabNavigator()

export default function CommunityTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="帖子" component={PostListScreen} />
      <Tab.Screen name="提问" component={QuestionListScreen} />
    </Tab.Navigator>
  )
}