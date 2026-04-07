import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  FlatList,
} from 'react-native';
import OriginalImageViewer from '../components/OriginalImageViewer';
import LoadingMask from '../components/LoadingMask';
import { useFocusEffect } from '@react-navigation/native';
import { createOrder } from '../api/orders';
import { getGood } from '../api/goods';
import { likeAdd, likeRemove, collectAdd, collectRemove } from '../api/social';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import SocialActionRow from '../components/SocialActionRow';
import { colors, space } from '../theme/colors';
import { cacheGet, cacheSet } from '../utils/cacheStorage';

const EXT_GOODS = 4;

const W = Dimensions.get('window').width;
const HERO_H = 360;

function formatPrice(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

function discountPercent(marked: number, price: number): number {
  if (marked <= price) {
    return 0;
  }
  return Math.min(99, Math.round((1 - price / marked) * 100));
}

export default function GoodDetailScreen({ route, navigation }: any) {
  const id = Number(route.params?.id);
  const [g, setG] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wantBusy, setWantBusy] = useState(false);
  const [imgViewerVisible, setImgViewerVisible] = useState(false);
  const [imgViewerIndex, setImgViewerIndex] = useState(0);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [liked, setLiked] = useState(false);
  const [collected, setCollected] = useState(false);

  const cacheKey = `good:detail:v1:${id}`;
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 55,
  }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      const i = viewableItems[0]?.index;
      if (i != null) {
        setGalleryIndex(i);
      }
    },
  ).current;

  const load = useCallback(async () => {
    let hadCache = false;
    try {
      const cached = await cacheGet<any>(cacheKey);
      if (cached && typeof cached === 'object') {
        hadCache = true;
        setG(cached);
        setLiked(Boolean(cached.is_liked ?? cached.liked));
        setCollected(Boolean(cached.is_collected ?? cached.collected));
        setLoading(false);
      } else {
        setLoading(true);
      }
    } catch {
      setLoading(true);
    }
    try {
      const row = await getGood(id);
      setG(row);
      setLiked(Boolean(row.is_liked ?? row.liked));
      setCollected(Boolean(row.is_collected ?? row.collected));
      await cacheSet(cacheKey, row);
    } catch (e: any) {
      if (!hadCache) {
        Alert.alert('加载失败', e?.message || '网络异常');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, cacheKey]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleLike = async () => {
    try {
      if (liked) {
        await likeRemove(EXT_GOODS, id);
        setLiked(false);
      } else {
        await likeAdd(EXT_GOODS, id);
        setLiked(true);
      }
      load();
    } catch (e: any) {
      Alert.alert('操作失败', e?.message || '');
    }
  };

  const toggleCollect = async () => {
    try {
      if (collected) {
        await collectRemove(EXT_GOODS, id, 0);
        setCollected(false);
      } else {
        await collectAdd(EXT_GOODS, id, 0);
        setCollected(true);
      }
      load();
    } catch (e: any) {
      Alert.alert('操作失败', e?.message || '');
    }
  };

  const goWant = async () => {
    if (!g) {
      return;
    }
    try {
      setWantBusy(true);
      const { id: orderId } = await createOrder({ goods_id: id });
      navigation.navigate('OrderChat', {
        orderId,
        goodTitle: g.title,
        counterpartRole: 'seller',
      });
    } catch (e: any) {
      Alert.alert('创建订单失败', e?.message || '');
    } finally {
      setWantBusy(false);
    }
  };

  if (!g) {
    return (
      <Screen scroll={false}>
        <LoadingMask visible={loading} hint="加载中…" />
        {!loading ? (
          <Text style={styles.muted}>暂无数据，请下拉重试</Text>
        ) : null}
      </Screen>
    );
  }

  const marked = g.marked_price as number | undefined;
  const hasDisc = marked != null && marked > g.price;
  const pct = hasDisc ? discountPercent(marked, g.price) : 0;

  const galleryUrls = ((g.images as string[] | undefined)?.filter(Boolean) ?? []) as string[];

  return (
    <Screen scroll={false}>
      <ScrollView
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
        {galleryUrls.length ? (
          <View style={styles.galleryWrap}>
            <FlatList
              data={galleryUrls}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(u, i) => `${u}-${i}`}
              getItemLayout={(_, index) => ({
                length: W,
                offset: W * index,
                index,
              })}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              renderItem={({ item: u, index }) => (
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() => {
                    setImgViewerIndex(index);
                    setImgViewerVisible(true);
                  }}>
                  <Image source={{ uri: u }} style={[styles.hero, { width: W }]} />
                </TouchableOpacity>
              )}
            />
            {galleryUrls.length > 1 ? (
              <View style={styles.galleryBadge} pointerEvents="none">
                <Text style={styles.galleryBadgeText}>
                  {galleryIndex + 1} / {galleryUrls.length}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.hero, styles.ph, { width: W }]} />
        )}

        <View style={styles.priceBlock}>
          <View style={styles.priceMainRow}>
            <Text style={styles.price}>{formatPrice(g.price)}</Text>
            {hasDisc ? (
              <>
                <Text style={styles.old}>{formatPrice(marked)}</Text>
                <View style={styles.discTag}>
                  <Text style={styles.discTagText}>省{pct}%</Text>
                </View>
              </>
            ) : null}
          </View>
          <Text style={styles.title}>{g.title}</Text>
          <View style={styles.chips}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{g.goods_type_label || '商品'}</Text>
            </View>
            <Text style={styles.meta}>库存 {g.stock}</Text>
          </View>
          <Text style={styles.addr}>
            {g.goods_addr || g.pickup_addr || '见详情'}
          </Text>
          {g.view_count != null || g.like_count != null || g.collect_count != null ? (
            <Text style={styles.statsLine}>
              {[
                g.view_count != null ? `${g.view_count} 浏览` : null,
                g.like_count != null ? `${g.like_count} 赞` : null,
                g.collect_count != null ? `${g.collect_count} 收藏` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <SocialActionRow
            liked={liked}
            collected={collected}
            onLike={toggleLike}
            onCollect={toggleCollect}
            gap={14}
          />
        </View>

        <Text style={styles.body}>{g.content}</Text>
        <View style={styles.seller}>
          <Text style={styles.sellerLabel}>卖家</Text>
          <Text style={styles.sellerName}>{g.author?.username || '匿名'}</Text>
        </View>
        <PrimaryButton title="我想要" onPress={goWant} loading={wantBusy} style={styles.buy} />
      </ScrollView>

      <OriginalImageViewer
        uris={galleryUrls}
        initialIndex={imgViewerIndex}
        visible={imgViewerVisible}
        onRequestClose={() => setImgViewerVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingBottom: 40 },
  galleryWrap: { position: 'relative' },
  galleryBadge: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  galleryBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  hero: { height: HERO_H, backgroundColor: colors.border },
  ph: { backgroundColor: colors.bg },
  priceBlock: { paddingHorizontal: space.md, marginTop: space.md },
  priceMainRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 },
  price: { fontSize: 32, fontWeight: '800', color: colors.accent },
  old: {
    fontSize: 16,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  discTag: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  discTagText: { fontSize: 12, fontWeight: '800', color: '#DC2626' },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 12 },
  chips: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10, flexWrap: 'wrap' },
  chip: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  meta: { fontSize: 13, color: colors.textSecondary },
  addr: { fontSize: 14, color: colors.textSecondary, marginTop: 8, lineHeight: 20 },
  statsLine: {
    marginTop: 10,
    fontSize: 12,
    color: colors.textMuted,
  },
  actions: {
    marginTop: 12,
    paddingHorizontal: space.md,
  },
  body: { fontSize: 15, lineHeight: 22, color: colors.text, paddingHorizontal: space.md, marginTop: 16 },
  seller: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: space.md,
    gap: 8,
  },
  sellerLabel: { fontSize: 13, color: colors.textMuted },
  sellerName: { fontSize: 15, fontWeight: '600', color: colors.primary },
  buy: { marginHorizontal: space.md, marginTop: 24 },
  muted: { color: colors.textMuted, padding: space.md },
});
