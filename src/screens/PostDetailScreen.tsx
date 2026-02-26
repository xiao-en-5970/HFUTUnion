import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const BASE_URL = 'http://api.xiaoen.xyz/api/v1'

export default function PostDetailScreen({ route }: any) {
  const { id } = route.params
  const [data, setData] = useState<any>(null)

  const loadDetail = async () => {
    const token = await AsyncStorage.getItem('token')
    const res = await fetch(
      `${BASE_URL}/post/${id}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    )
    const json = await res.json()
    if (json.code === 200) {
      setData(json.data)
    }
  }

  useEffect(() => {
    loadDetail()
  }, [])

  if (!data) return null

  return (
    <ScrollView style={{ padding: 15 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold' }}>
        {data.title}
      </Text>
      <Text style={{ marginTop: 10 }}>
        {data.content}
      </Text>
    </ScrollView>
  )
}