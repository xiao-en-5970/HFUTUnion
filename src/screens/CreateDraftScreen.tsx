import React, { useState } from 'react'
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  Alert
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const BASE_URL = 'http://api.xiaoen.xyz/api/v1'

export default function CreateDraftScreen({ navigation }: any) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  const createDraft = async () => {
    const token = await AsyncStorage.getItem('token')
    if (!token) {
      Alert.alert('请先登录')
      return
    }

    const res = await fetch(`${BASE_URL}/post`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title,
        content,
        publish_status: 2,
        is_public: 1
      })
    })

    const text = await res.text()

    let json
    try {
      json = JSON.parse(text)
    } catch {
      Alert.alert('接口返回异常')
      return
    }

    if (json.code === 200) {
      const draftId = json.data.id
      navigation.replace('EditPost', { id: draftId })
    } else {
      Alert.alert(json.message || '创建草稿失败')
    }
  }

  return (
    <View style={{ padding: 15 }}>
      <TextInput
        placeholder="标题"
        value={title}
        onChangeText={setTitle}
        style={{ borderBottomWidth: 1, marginBottom: 15 }}
      />

      <TextInput
        placeholder="内容"
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
        onPress={createDraft}
        style={{
          backgroundColor: '#111',
          padding: 15,
          marginTop: 20
        }}
      >
        <Text style={{ color: '#fff', textAlign: 'center' }}>
          保存草稿
        </Text>
      </TouchableOpacity>
    </View>
  )
}