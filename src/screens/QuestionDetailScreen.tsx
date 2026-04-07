import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getQuestion,
  listQuestionAnswers,
} from '../api/article';
import { likeAdd, likeRemove, collectAdd, collectRemove } from '../api/social';
import ArticleListTags from '../components/ArticleListTags';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import LoadingMask from '../components/LoadingMask';
import SocialActionRow from '../components/SocialActionRow';
import { colors, radius, space } from '../theme/colors';
import { cacheGet, cacheSet } from '../utils/cacheStorage';

const EXT_Q = 2;

export default function QuestionDetailScreen({ route, navigation }: any) {
  const id = Number(route.params?.id);
  const cacheKey = `question:detail:v2:${id}`;
  const [q, setQ] = useState<any>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [liked, setLiked] = useState(false);
  const [collected, setCollected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    let hadCache = false;
    try {
      const cached = await cacheGet<{
        q: any;
        answers: any[];
      }>(cacheKey);
      if (cached?.q) {
        hadCache = true;
        setQ(cached.q);
        setAnswers(cached.answers || []);
        setLiked(Boolean(cached.q.is_liked ?? cached.q.liked));
        setCollected(Boolean(cached.q.is_collected ?? cached.q.collected));
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
      setLiked(Boolean(qu.is_liked ?? qu.liked));
      setCollected(Boolean(qu.is_collected ?? qu.collected));
      const an = await listQuestionAnswers(id, 1, 50);
      const al = an.list || [];
      setAnswers(al);
      await cacheSet(cacheKey, { q: qu, answers: al });
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

  const toggleLike = async () => {
    try {
      if (liked) {
        await likeRemove(EXT_Q, id);
        setLiked(false);
      } else {
        await likeAdd(EXT_Q, id);
        setLiked(true);
      }
      load();
    } catch (e: any) {
      Alert.alert('操作失败', e?.message);
    }
  };

  const toggleCollect = async () => {
    try {
      if (collected) {
        await collectRemove(EXT_Q, id, 0);
        setCollected(false);
      } else {
        await collectAdd(EXT_Q, id, 0);
        setCollected(true);
      }
      load();
    } catch (e: any) {
      Alert.alert('操作失败', e?.message);
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
        <View style={styles.qHeaderRow}>
          <View style={styles.qTagsWrap}>
            <ArticleListTags
              kind="question"
              schoolId={q.school_id}
              compact
            />
          </View>
          <SocialActionRow
            liked={liked}
            collected={collected}
            onLike={toggleLike}
            onCollect={toggleCollect}
            gap={10}
          />
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
        <Text style={styles.noQuestionComments}>
          求助仅支持通过「写回答」回应，不支持对求助本身发表评论。
        </Text>

        <Text style={styles.section}>回答 · {answers.length}</Text>
        {answers.map((a) => (
          <TouchableOpacity
            key={a.id}
            style={styles.ansCard}
            onPress={() => navigation.navigate('AnswerDetail', { id: a.id })}>
            <ArticleListTags
              kind="answer"
              schoolId={a.school_id}
              compact
            />
            <View style={styles.ansHead}>
              <Text style={styles.ansAuthor}>{a.author?.username}</Text>
            </View>
            <Text numberOfLines={3} style={styles.ansBody}>
              {a.content || a.title}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  emptyWrap: { flex: 1, position: 'relative' },
  emptyScroll: { flexGrow: 1, justifyContent: 'center', padding: space.md },
  pad: { padding: space.md, paddingBottom: 40 },
  qHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  qTagsWrap: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  meta: { marginTop: 8, fontSize: 13, color: colors.textSecondary },
  body: { marginTop: 16, fontSize: 16, lineHeight: 24, color: colors.text },
  images: { marginTop: 12 },
  img: { width: '100%', height: 180, borderRadius: radius.sm, marginBottom: 8 },
  answerBtn: { marginTop: 16 },
  noQuestionComments: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textMuted,
  },
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
  ansHead: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  ansAuthor: { fontSize: 13, fontWeight: '600', color: colors.primary },
  ansBody: { marginTop: 6, fontSize: 15, color: colors.text },
  muted: { color: colors.textMuted },
});
