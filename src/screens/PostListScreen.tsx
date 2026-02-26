import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const BASE_URL = 'http://api.xiaoen.xyz/api/v1'

export default function PostListScreen({ navigation }: any) {
  const [posts, setPosts] = useState<any[]>([])

  const loadPosts = async () => {
    console.log('开始加载帖子列表')

    const token = await AsyncStorage.getItem('token')
    if (!token) {
      console.log('没有token')
      return
    }

    try {
      const res = await fetch(
        `${BASE_URL}/post?page=1&pageSize=20`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      console.log('列表状态码:', res.status)

      const text = await res.text()
      // console.log('列表原始返回:', text)

      let json
      try {
        json = JSON.parse(text)
      } catch {
        console.log('返回不是JSON')
        return
      }

      if (json.code === 200) {
        setPosts(json.data.list || [])
        console.log('当前posts数量:', json.data.list?.length)
      } else {
        console.log('接口code异常:', json)
      }

    } catch (e) {
      console.log('加载异常:', e)
    }
  }

  useEffect(() => {
    // 首次进入加载
    loadPosts()

    // 每次页面获得焦点重新加载
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('页面获得焦点')
      loadPosts()
    })

    return unsubscribe
  }, [])

  // console.log('渲染时posts数量:', posts.length)

  return (
    <View style={{ flex: 1, padding: 15 }}>
      <TouchableOpacity
        onPress={() => navigation.navigate('CreateDraft')}
        style={{
          backgroundColor: '#111',
          padding: 12,
          marginBottom: 15
        }}
      >
        <Text style={{ color: '#fff', textAlign: 'center' }}>
          发帖
        </Text>
      </TouchableOpacity>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={{ marginBottom: 15 }}>
            <Text style={{ fontWeight: 'bold' }}>
              {item.title}
            </Text>
            <Text>{item.content}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', marginTop: 40 }}>
            暂无帖子
          </Text>
        }
      />
    </View>
  )
}