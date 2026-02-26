import React, { useEffect, useState } from 'react'
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  Alert
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const BASE_URL = 'http://api.xiaoen.xyz/api/v1'

export default function EditPostScreen({ route, navigation }: any) {
  const { id } = route.params

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  const loadDraft = async () => {
    const token = await AsyncStorage.getItem('token')
    if (!token) return

    const res = await fetch(
      `${BASE_URL}/post/drafts?page=1&pageSize=10`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      return
    }

    if (json.code === 200) {
      const draft = json.data.list.find(
        (item: any) => item.id === id
      )
      if (draft) {
        setTitle(draft.title)
        setContent(draft.content)
      }
    }
  }

  useEffect(() => {
    loadDraft()
  }, [])

  const publish = async () => {
    const token = await AsyncStorage.getItem('token')
    if (!token) return

    const res = await fetch(
      `${BASE_URL}/post/${id}/publish`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    )

    console.log('发布状态码:', res.status)
    console.log('发布的ID:', id)

    const text = await res.text()
    console.log('发布原始返回:', text)

    try {
      const json = JSON.parse(text)

      if (json.code === 200) {
        Alert.alert('发布成功')
        navigation.popToTop()
      } else {
        Alert.alert(json.message || '发布失败')
      }
    } catch (e) {
      Alert.alert('接口不是JSON')
    }
  }

  return (
    <View style={{ padding: 15 }}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        style={{ borderBottomWidth: 1, marginBottom: 15 }}
      />

      <TextInput
        value={content}
        onChangeText={setContent}
        multiline
        style={{
          borderWidth: 1,
          height: 120,
          padding: 10
        }}
      />

      <TouchableOpacity
        onPress={publish}
        style={{
          backgroundColor: '#111',
          padding: 15,
          marginTop: 20
        }}
      >
        <Text style={{ color: '#fff', textAlign: 'center' }}>
          发布
        </Text>
      </TouchableOpacity>
    </View>
  )
}