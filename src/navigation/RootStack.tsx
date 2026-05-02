import React from 'react';
import { Platform } from 'react-native';
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
import MyContentScreen from '../screens/MyContentScreen';
import MyCollectsScreen from '../screens/MyCollectsScreen';
import EditQuestionScreen from '../screens/EditQuestionScreen';
import EditAnswerScreen from '../screens/EditAnswerScreen';
import CommentRepliesScreen from '../screens/CommentRepliesScreen';
import BootstrapScreen from '../screens/BootstrapScreen';
import MapPickerScreen from '../screens/MapPickerScreen';
import MapRouteScreen from '../screens/MapRouteScreen';
import SettingsScreen from '../screens/SettingsScreen';
import MessagesScreen from '../screens/MessagesScreen';
import type { LngLat } from '../utils/mapHtml';

export type RootStackParamList = {
  Bootstrap: undefined;
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
  EditQuestion: { id: number };
  EditAnswer: { id: number };
  CreateQuestion: undefined;
  GoodDetail: { id: number };
  GoodCreate: { goodId?: number; initialCategory?: 1 | 2 } | undefined;
  MyContent: undefined;
  MyCollects: undefined;
  OrderDetail: { id: number };
  MyOrders: undefined;
  OrderChat: {
    orderId?: number;
    goodTitle?: string;
    counterpartRole?: 'seller' | 'buyer';
  };
  AddressList: undefined;
  CommentReplies: {
    extType: number;
    extId: number;
    commentId: number;
    commentAuthor?: string;
    commentContent?: string;
    commentLikeCount?: number;
    commentIsLiked?: boolean;
  };
  SchoolBind: undefined;
  MapPicker: {
    initCenter?: LngLat;
    title?: string;
    minPickZoom?: number;
  } | undefined;
  MapRoute: {
    dest: LngLat;
    origin?: LngLat;
    destLabel?: string;
    originLabel?: string;
    profile?: string;
    title?: string;
  };
  Settings: undefined;
  Messages: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStack() {
  return (
    <Stack.Navigator
      initialRouteName="Bootstrap"
      screenOptions={{
        headerShown: true,
        headerTintColor: '#0F766E',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: '#F5F6F8' },
        contentStyle: { backgroundColor: '#F5F6F8' },
        animation: 'slide_from_right',
        gestureEnabled: true,
        fullScreenGestureEnabled: Platform.OS === 'ios',
        ...(Platform.OS === 'ios' ? { animationDuration: 300 } : {}),
      }}>
      <Stack.Screen
        name="Bootstrap"
        component={BootstrapScreen}
        options={{ headerShown: false }}
      />
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
      <Stack.Screen name="QuestionDetail" component={QuestionDetailScreen} options={{ title: '求助' }} />
      <Stack.Screen name="AnswerDetail" component={AnswerDetailScreen} options={{ title: '回答' }} />
      <Stack.Screen name="AnswerCompose" component={AnswerComposeScreen} options={{ title: '写回答' }} />
      <Stack.Screen name="CreateDraft" component={CreateDraftScreen} options={{ title: '发帖' }} />
      <Stack.Screen name="EditPost" component={EditPostScreen} options={{ title: '编辑帖子' }} />
      <Stack.Screen name="EditQuestion" component={EditQuestionScreen} options={{ title: '编辑求助' }} />
      <Stack.Screen name="EditAnswer" component={EditAnswerScreen} options={{ title: '编辑回答' }} />
      <Stack.Screen name="CreateQuestion" component={CreateQuestionScreen} options={{ title: '发布求助' }} />
      <Stack.Screen name="GoodDetail" component={GoodDetailScreen} options={{ title: '商品' }} />
      <Stack.Screen name="GoodCreate" component={GoodCreateScreen} options={{ title: '发布闲置' }} />
      <Stack.Screen name="MyContent" component={MyContentScreen} options={{ title: '我的内容' }} />
      <Stack.Screen name="MyCollects" component={MyCollectsScreen} options={{ title: '我的收藏' }} />
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: '订单详情' }} />
      <Stack.Screen name="MyOrders" component={MyOrdersScreen} options={{ title: '我的订单' }} />
      <Stack.Screen name="OrderChat" component={OrderChatScreen} options={{ title: '订单沟通' }} />
      <Stack.Screen name="AddressList" component={AddressListScreen} options={{ title: '收货地址' }} />
      <Stack.Screen name="CommentReplies" component={CommentRepliesScreen} options={{ title: '回复' }} />
      <Stack.Screen name="SchoolBind" component={SchoolBindScreen} options={{ title: '学籍认证' }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: '编辑资料' }} />
      <Stack.Screen name="MapPicker" component={MapPickerScreen} options={{ title: '选择位置' }} />
      <Stack.Screen name="MapRoute" component={MapRouteScreen} options={{ title: '路线' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: '设置' }} />
      <Stack.Screen name="Messages" component={MessagesScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
