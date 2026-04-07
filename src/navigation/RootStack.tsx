import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import MainTabs from './MainTabs';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import PostDetailScreen from '../screens/PostDetailScreen';
import QuestionDetailScreen from '../screens/QuestionDetailScreen';
import AnswerDetailScreen from '../screens/AnswerDetailScreen';
import AnswerComposeScreen from '../screens/AnswerComposeScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import CreateDraftScreen from '../screens/CreateDraftScreen';
import EditPostScreen from '../screens/EditPostScreen';
import CreateQuestionScreen from '../screens/CreateQuestionScreen';
import GoodDetailScreen from '../screens/GoodDetailScreen';
import GoodCreateScreen from '../screens/GoodCreateScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import OrderChatScreen from '../screens/OrderChatScreen';
import MyOrdersScreen from '../screens/MyOrdersScreen';
import AddressListScreen from '../screens/AddressListScreen';
import SchoolBindScreen from '../screens/SchoolBindScreen';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  MainTabs: undefined;
  EditProfile: { user?: Record<string, unknown> };
  PostDetail: { id: number };
  QuestionDetail: { id: number };
  AnswerDetail: { id: number };
  AnswerCompose: { questionId: number };
  CreateDraft: undefined;
  EditPost: { id: number };
  CreateQuestion: undefined;
  GoodDetail: { id: number };
  GoodCreate: undefined;
  OrderDetail: { id: number };
  MyOrders: undefined;
  OrderChat: {
    orderId?: number;
    goodTitle?: string;
    counterpartRole?: 'seller' | 'buyer';
  };
  AddressList: undefined;
  SchoolBind: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStack() {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{
        headerShown: true,
        headerTintColor: '#0F766E',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: '#F5F6F8' },
        contentStyle: { backgroundColor: '#F5F6F8' },
      }}>
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ title: '注册' }}
      />
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} options={{ title: '帖子' }} />
      <Stack.Screen name="QuestionDetail" component={QuestionDetailScreen} options={{ title: '问题' }} />
      <Stack.Screen name="AnswerDetail" component={AnswerDetailScreen} options={{ title: '回答' }} />
      <Stack.Screen name="AnswerCompose" component={AnswerComposeScreen} options={{ title: '写回答' }} />
      <Stack.Screen name="CreateDraft" component={CreateDraftScreen} options={{ title: '发帖' }} />
      <Stack.Screen name="EditPost" component={EditPostScreen} options={{ title: '编辑帖子' }} />
      <Stack.Screen name="CreateQuestion" component={CreateQuestionScreen} options={{ title: '提问' }} />
      <Stack.Screen name="GoodDetail" component={GoodDetailScreen} options={{ title: '商品' }} />
      <Stack.Screen name="GoodCreate" component={GoodCreateScreen} options={{ title: '发布闲置' }} />
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: '订单详情' }} />
      <Stack.Screen name="MyOrders" component={MyOrdersScreen} options={{ title: '我的订单' }} />
      <Stack.Screen name="OrderChat" component={OrderChatScreen} options={{ title: '订单沟通' }} />
      <Stack.Screen name="AddressList" component={AddressListScreen} options={{ title: '收货地址' }} />
      <Stack.Screen name="SchoolBind" component={SchoolBindScreen} options={{ title: '学籍认证' }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: '编辑资料' }} />
    </Stack.Navigator>
  );
}
