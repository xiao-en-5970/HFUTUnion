import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import ImageViewing from 'react-native-image-viewing'
import ImagePicker from 'react-native-image-crop-picker'

const BASE_URL = 'http://api.xiaoen.xyz/api/v1'

const defaultAvatar = require('../assets/default-avatar.png')
const defaultBg = require('../assets/default-bg.jpg')

export default function ProfileScreen({ navigation }: any) {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewType, setPreviewType] = useState<'avatar' | 'background'>(
    'avatar'
  )

  const getToken = async () => {
    return await AsyncStorage.getItem('token')
  }

  const loadUserInfo = useCallback(async () => {
    try {
      setLoading(true)
      const token = await getToken()
      if (!token) return

      const res = await fetch(`${BASE_URL}/user/info`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      const json = await res.json()
      if (json.code === 200) {
        setUser(json.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUserInfo()
  }, [loadUserInfo])

  // 监听页面是否返回，刷新数据
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadUserInfo() // 页面返回时刷新数据
    })
    return unsubscribe
  }, [navigation, loadUserInfo])

  const openPreview = (type: 'avatar' | 'background') => {
    setPreviewType(type)
    setPreviewVisible(true)
  }

  const pickAndCropImage = async () => {
    try {
      const image = await ImagePicker.openPicker({
        width: previewType === 'avatar' ? 400 : 1200,
        height: previewType === 'avatar' ? 400 : 600,
        cropping: true,
        cropperCircleOverlay: previewType === 'avatar',
        mediaType: 'photo'
      })

      const formData = new FormData()
      formData.append('file', {
        uri: image.path,
        type: image.mime,
        name: 'upload.jpg'
      } as any)

      const token = await getToken()
      if (!token) return

      const url =
        previewType === 'avatar'
          ? `${BASE_URL}/user/avatar`
          : `${BASE_URL}/user/background`

      setUploading(true)

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      })

      const json = await res.json()

      if (json.code === 200) {
        Alert.alert('上传成功')
        loadUserInfo() // 上传成功后刷新页面
      } else {
        Alert.alert('上传失败', json.message)
      }
    } catch (e) {
      console.log(e)
    } finally {
      setUploading(false)
      setPreviewVisible(false)
    }
  }

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} />
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <Text>未登录</Text>
      </View>
    )
  }

  const avatarSource = user.avatar
    ? { uri: `${user.avatar}?t=${Date.now()}` }
    : defaultAvatar

  const bgSource = user.background
    ? { uri: `${user.background}?t=${Date.now()}` }
    : defaultBg

  return (
    <>
      <ScrollView style={styles.container}>
        <TouchableOpacity onPress={() => openPreview('background')}>
          <Image source={bgSource} style={styles.bg} />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => openPreview('avatar')}>
          <Image source={avatarSource} style={styles.avatar} />
        </TouchableOpacity>

        <Text style={styles.username}>{user.username}</Text>

        <View style={styles.infoBox}>
          <Text>绑定QQ：{user.bind_qq || '未绑定'}</Text>
          <Text>绑定微信：{user.bind_wx || '未绑定'}</Text>
          <Text>绑定手机号：{user.bind_phone || '未绑定'}</Text>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('EditProfile', { user })}
        >
          <Text style={{ color: '#fff' }}>编辑资料</Text>
        </TouchableOpacity>
      </ScrollView>

      <ImageViewing
        images={[previewType === 'avatar' ? avatarSource : bgSource]}
        imageIndex={0}
        visible={previewVisible}
        onRequestClose={() => setPreviewVisible(false)}
        HeaderComponent={() => (
          <View style={styles.header}>
            <TouchableOpacity onPress={pickAndCropImage}>
              <Text style={styles.changeText}>
                {uploading ? '上传中...' : '更换'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  bg: { width: '100%', height: 150, borderRadius: 3 },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginTop: -50,
    alignSelf: 'center'
  },
  username: {
    textAlign: 'center',
    fontSize: 18,
    marginTop: 10
  },
  infoBox: { marginTop: 20, gap: 8 },
  button: {
    marginTop: 25,
    backgroundColor: '#111',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  header: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10
  },
  changeText: {
    color: '#fff',
    fontSize: 16
  }
})