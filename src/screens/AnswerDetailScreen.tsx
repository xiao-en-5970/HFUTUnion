import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getAnswer } from '../api/article';
import { listComments, postComment, likeAdd, likeRemove, collectAdd } from '../api/social';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, space } from '../theme/colors';

const EXT_A = 3;

export default function AnswerDetailScreen({ route }: any) {
  const id = Number(route.params?.id);
  const [a, setA] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const row = await getAnswer(id);
      setA(row);
      const c = await listComments(EXT_A, id, 1, 50);
      setComments(c.list || []);
    } catch (e: any) {
      Alert.alert('加载失败', e?.message);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [id]),
  );

  const send = async () => {
    if (!text.trim()) {
      return;
    }
    try {
      await postComment(EXT_A, id, { content: text.trim() });
      setText('');
      load();
    } catch (e: any) {
      Alert.alert('失败', e?.message);
    }
  };

  if (!a) {
    return (
      <Screen>
        <Text style={styles.muted}>加载中…</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <ScrollView
        style={styles.flex}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
        }
        contentContainerStyle={styles.pad}>
        <View style={styles.row}>
          <Text style={styles.badge}>答</Text>
          <TouchableOpacity
            onPress={async () => {
              try {
                await likeAdd(EXT_A, id);
                load();
              } catch {
                try {
                  await likeRemove(EXT_A, id);
                  load();
                } catch (e: any) {
                  Alert.alert(e?.message);
                }
              }
            }}>
            <Ionicons name="heart-outline" size={22} color={colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              try {
                await collectAdd(EXT_A, id, 0);
                load();
              } catch (e: any) {
                Alert.alert(e?.message);
              }
            }}>
            <Ionicons name="bookmark-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.meta}>{a.author?.username}</Text>
        <Text style={styles.body}>{a.content}</Text>
        {a.images?.length ? (
          <View style={styles.images}>
            {a.images.map((u: string, i: number) => (
              <Image key={i} source={{ uri: u }} style={styles.img} resizeMode="cover" />
            ))}
          </View>
        ) : null}

        <Text style={styles.section}>评论</Text>
        {comments.map((c) => (
          <View key={c.id} style={styles.cmt}>
            <Text style={styles.cmtUser}>{c.author?.username}</Text>
            <Text style={styles.cmtBody}>{c.content}</Text>
          </View>
        ))}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="评论回答…"
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
          />
          <PrimaryButton title="发送" onPress={send} style={styles.sendBtn} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: space.md, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 8 },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  meta: { fontSize: 13, color: colors.textSecondary },
  body: { marginTop: 12, fontSize: 16, lineHeight: 24, color: colors.text },
  images: { marginTop: 12 },
  img: { width: '100%', height: 180, borderRadius: radius.sm, marginBottom: 8 },
  section: {
    marginTop: 24,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  cmt: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cmtUser: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  cmtBody: { marginTop: 4, fontSize: 15, color: colors.text },
  muted: { color: colors.textMuted },
  inputRow: { marginTop: 16, gap: 10 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 10,
    minHeight: 44,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  sendBtn: { paddingVertical: 10 },
});
