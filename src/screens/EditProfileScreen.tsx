import React, { useState } from 'react'
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Text,
  Alert,
  ActivityIndicator
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const BASE_URL = 'http://api.xiaoen.xyz/api/v1'

export default function EditProfileScreen({ route, navigation }: any) {
  const { user } = route.params

  const [bindQQ, setBindQQ] = useState('')
  const [bindWX, setBindWX] = useState('')
  const [bindPhone, setBindPhone] = useState('')
  const [schoolId, setSchoolId] = useState('')   // 新增
  const [loading, setLoading] = useState(false)

  const getToken = async () => {
    return await AsyncStorage.getItem('token')
  }

  const handleSave = async () => {
    try {
      setLoading(true)
      const token = await getToken()
      if (!token) {
        Alert.alert('请先登录')
        return
      }

      // 1️⃣ 更新基础信息
      const res = await fetch(`${BASE_URL}/user/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          avatar: user.avatar,
          background: user.background,
          bind_qq: bindQQ,
          bind_wx: bindWX,
          bind_phone: bindPhone
        })
      })

      const json = await res.json()

      if (json.code !== 200) {
        Alert.alert(json.message || '更新失败')
        return
      }

      // 2️⃣ 如果填写了学校ID，调用绑定接口
      if (schoolId !== '') {
        const bindRes = await fetch(`${BASE_URL}/user/bind/school`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            school_id: Number(schoolId)  // 0 表示解绑
          })
        })

        const bindJson = await bindRes.json()

        if (bindJson.code !== 200) {
          Alert.alert(bindJson.message || '学校绑定失败')
          return
        }
      }

      Alert.alert('更新成功')
      navigation.goBack()

    } catch (e) {
      console.log('error:', e)
      Alert.alert('网络异常')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <TextInput
        placeholder="绑定QQ"
        style={styles.input}
        value={bindQQ}
        onChangeText={setBindQQ}
      />
      <TextInput
        placeholder="绑定微信"
        style={styles.input}
        value={bindWX}
        onChangeText={setBindWX}
      />
      <TextInput
        placeholder="绑定手机号"
        style={styles.input}
        value={bindPhone}
        onChangeText={setBindPhone}
      />

      <TextInput
        placeholder="学校ID（填0解绑）"
        style={styles.input}
        value={schoolId}
        onChangeText={setSchoolId}
        keyboardType="numeric"
      />

      <TouchableOpacity style={styles.button} onPress={handleSave}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color:'#fff' }}>保存</Text>
        )}
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  input: {
    borderBottomWidth: 1,
    marginBottom: 20,
    paddingVertical: 10
  },
  button: {
    backgroundColor: '#111',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center'
  }
})