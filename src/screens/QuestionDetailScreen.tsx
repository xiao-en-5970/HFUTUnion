import React, { useState, useCallback } from 'react';
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
import {
  getQuestion,
  listQuestionAnswers,
} from '../api/article';
import { listComments, postComment, likeAdd, likeRemove, collectAdd, collectRemove } from '../api/social';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import LoadingMask from '../components/LoadingMask';
import { colors, radius, space } from '../theme/colors';
import { cacheGet, cacheSet } from '../utils/cacheStorage';

const EXT_Q = 2;

export default function QuestionDetailScreen({ route, navigation }: any) {
  const id = Number(route.params?.id);
  const cacheKey = `question:detail:v1:${id}`;
  const [q, setQ] = useState<any>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    let hadCache = false;
    try {
      const cached = await cacheGet<{
        q: any;
        answers: any[];
        comments: any[];
      }>(cacheKey);
      if (cached?.q) {
        hadCache = true;
        setQ(cached.q);
        setAnswers(cached.answers || []);
        setComments(cached.comments || []);
        setLoading(false);
      }
    } catch {
      /* noop */
    }
    if (!hadCache) {
      setLoading(true);
    }
    try {
      const qu = await getQuestion(id);
      setQ(qu);
      const an = await listQuestionAnswers(id, 1, 50);
      const al = an.list || [];
      setAnswers(al);
      const c = await listComments(EXT_Q, id, 1, 50);
      const cl = c.list || [];
      setComments(cl);
      await cacheSet(cacheKey, { q: qu, answers: al, comments: cl });
    } catch (e: any) {
      if (!hadCache) {
        Alert.alert('加载失败', e?.message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [id]),
  );

  const sendComment = async () => {
    if (!text.trim()) {
      return;
    }
    try {
      await postComment(EXT_Q, id, { content: text.trim() });
      setText('');
      load();
    } catch (e: any) {
      Alert.alert('失败', e?.message);
    }
  };

  const likeQ = async () => {
    try {
      await likeAdd(EXT_Q, id);
      load();
    } catch (e: any) {
      try {
        await likeRemove(EXT_Q, id);
        load();
      } catch {
        Alert.alert(e?.message);
      }
    }
  };

  if (!q) {
    return (
      <Screen scroll={false}>
        <View style={styles.emptyWrap}>
          <LoadingMask visible={loading} hint="正在加载问答…" />
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.emptyScroll}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  load();
                }}
                tintColor={colors.primary}
              />
            }>
            {!loading ? (
              <Text style={styles.muted}>加载失败，下拉重试</Text>
            ) : null}
          </ScrollView>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <ScrollView
        style={styles.flex}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={styles.pad}>
        <View style={styles.row}>
          <Text style={styles.badge}>问</Text>
          <TouchableOpacity onPress={likeQ} style={styles.likeRow}>
            <Ionicons name="heart-outline" size={20} color={colors.accent} />
            <Text style={styles.small}>赞</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              try {
                await collectAdd(EXT_Q, id, 0);
                load();
              } catch (e: any) {
                Alert.alert(e?.message);
              }
            }}>
            <Ionicons name="bookmark-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>{q.title}</Text>
        <Text style={styles.meta}>{q.author?.username}</Text>
        <Text style={styles.body}>{q.content}</Text>
        {q.images?.length ? (
          <View style={styles.images}>
            {q.images.map((u: string, i: number) => (
              <Image key={i} source={{ uri: u }} style={styles.img} resizeMode="cover" />
            ))}
          </View>
        ) : null}

        <PrimaryButton
          title="写回答"
          onPress={() => navigation.navigate('AnswerCompose', { questionId: id })}
          style={styles.answerBtn}
        />

        <Text style={styles.section}>回答 · {answers.length}</Text>
        {answers.map((a) => (
          <TouchableOpacity
            key={a.id}
            style={styles.ansCard}
            onPress={() => navigation.navigate('AnswerDetail', { id: a.id })}>
            <Text style={styles.ansAuthor}>{a.author?.username}</Text>
            <Text numberOfLines={3} style={styles.ansBody}>
              {a.content || a.title}
            </Text>
          </TouchableOpacity>
        ))}

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
            placeholder="评论提问…"
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
          />
          <PrimaryButton title="发送" onPress={sendComment} style={styles.sendBtn} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  emptyWrap: { flex: 1, position: 'relative' },
  emptyScroll: { flexGrow: 1, justifyContent: 'center', padding: space.md },
  pad: { padding: space.md, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 8 },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  small: { fontSize: 13, color: colors.textSecondary },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  meta: { marginTop: 8, fontSize: 13, color: colors.textSecondary },
  body: { marginTop: 16, fontSize: 16, lineHeight: 24, color: colors.text },
  images: { marginTop: 12 },
  img: { width: '100%', height: 180, borderRadius: radius.sm, marginBottom: 8 },
  answerBtn: { marginTop: 16 },
  section: {
    marginTop: 24,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  ansCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ansAuthor: { fontSize: 13, fontWeight: '600', color: colors.primary },
  ansBody: { marginTop: 6, fontSize: 15, color: colors.text },
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
