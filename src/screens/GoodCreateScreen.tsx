import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import DraggableFlatList, {
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { useFocusEffect } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { createGood, getGood, publishGood, updateGood } from '../api/goods';
import { uploadOssUserFile } from '../api/oss';
import { fetchUserInfo, fetchUserLocations, type UserLocation } from '../api/user';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, space } from '../theme/colors';
import {
  ensureAndroidFineLocation,
  formatGpsErrorMessage,
  requestGpsPosition,
} from '../utils/locationGps';
import { awaitMapPickerResult } from '../utils/mapPickerBridge';

type Picked = {
  key: string;
  uri: string;
  type?: string;
  fileName?: string;
};

const MAX_IMAGES = 9;

function newImageKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function isRemoteUrl(uri: string) {
  return /^https?:\/\//i.test(uri);
}

export default function GoodCreateScreen({ navigation, route }: any) {
  const goodId = route.params?.goodId as number | undefined;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priceYuan, setPriceYuan] = useState('');
  const [stock, setStock] = useState('1');
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<Picked[]>([]);

  const [locations, setLocations] = useState<UserLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  /** 为 true 时表示用户选了「当前定位」，焦点刷新地址簿时不覆盖 */
  const [useGpsForGood, setUseGpsForGood] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [gpsAddrLabel, setGpsAddrLabel] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: goodId ? '编辑商品' : '发布闲置' });
  }, [goodId, navigation]);

  useEffect(() => {
    if (!goodId) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [g, rows] = await Promise.all([
          getGood(goodId),
          fetchUserLocations(),
        ]);
        if (cancelled) {
          return;
        }
        setLocations(rows);
        setLocationsLoading(false);
        setTitle(g.title || '');
        setContent(g.content || '');
        setPriceYuan(String((g.price ?? 0) / 100));
        setStock(String(g.stock ?? 1));
        if (g.images?.length) {
          setImages(
            g.images.map((uri) => ({ key: newImageKey(), uri })),
          );
        }
        const addr = (g.goods_addr || g.pickup_addr || '').trim();
        const lat = g.goods_lat ?? null;
        const lng = g.goods_lng ?? null;
        const near = (a: number, b: number) => Math.abs(a - b) < 0.00025;
        const matchSaved = rows.find((l) => {
          if (addr.length > 0) {
            if (l.addr === addr) {
              return true;
            }
            if (addr.length > 4 && (addr.includes(l.addr) || l.addr.includes(addr))) {
              return true;
            }
          }
          if (
            lat != null &&
            lng != null &&
            l.lat != null &&
            l.lng != null
          ) {
            return near(l.lat, lat) && near(l.lng, lng);
          }
          return false;
        });
        if (matchSaved) {
          setUseGpsForGood(false);
          setSelectedLocationId(matchSaved.id);
          setGpsLat(null);
          setGpsLng(null);
          setGpsAddrLabel('');
        } else if (lat != null && lng != null) {
          setUseGpsForGood(true);
          setGpsLat(lat);
          setGpsLng(lng);
          setGpsAddrLabel(addr || `当前定位（${lat.toFixed(5)}, ${lng.toFixed(5)}）`);
          setSelectedLocationId(null);
        } else {
          setUseGpsForGood(false);
          setSelectedLocationId(null);
        }
      } catch (e: any) {
        Alert.alert('加载失败', e?.message || '');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [goodId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLocationsLoading(true);
        try {
          const rows = await fetchUserLocations();
          if (cancelled) {
            return;
          }
          setLocations(rows);
          if (goodId) {
            return;
          }
          if (!useGpsForGood) {
            if (rows.length) {
              setSelectedLocationId((prev) => {
                if (prev != null && rows.some((r) => r.id === prev)) {
                  return prev;
                }
                const def = rows.find((l) => l.is_default) || rows[0];
                return def?.id ?? null;
              });
            } else {
              setSelectedLocationId(null);
            }
          }
        } catch {
          if (!cancelled) {
            setLocations([]);
          }
        } finally {
          if (!cancelled) {
            setLocationsLoading(false);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [goodId, useGpsForGood]),
  );

  const pickImages = async () => {
    const remain = MAX_IMAGES - images.length;
    if (remain <= 0) {
      Alert.alert('提示', `最多 ${MAX_IMAGES} 张图`);
      return;
    }
    const r = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: remain,
    });
    if (r.didCancel || !r.assets?.length) {
      return;
    }
    const next: Picked[] = r.assets
      .filter((a): a is NonNullable<typeof a> & { uri: string } => Boolean(a?.uri))
      .map((a) => ({
        key: newImageKey(),
        uri: a.uri!,
        type: a.type,
        fileName: a.fileName ?? undefined,
      }));
    setImages((prev) => [...prev, ...next].slice(0, MAX_IMAGES));
  };

  const removeByKey = (key: string) => {
    setImages((prev) => prev.filter((p) => p.key !== key));
  };

  const renderImageItem = ({
    item,
    drag,
    isActive,
  }: RenderItemParams<Picked>) => (
    <TouchableOpacity
      style={[styles.thumbWrap, isActive && styles.thumbWrapDragging]}
      onLongPress={drag}
      delayLongPress={160}
      activeOpacity={0.92}>
      <Image source={{ uri: item.uri }} style={styles.thumb} />
      <TouchableOpacity
        style={styles.thumbRemove}
        onPress={() => removeByKey(item.key)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close-circle" size={22} color={colors.danger} />
      </TouchableOpacity>
      <View style={styles.dragHint}>
        <Ionicons name="reorder-three" size={14} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );

  const selectSavedLocation = (loc: UserLocation) => {
    setUseGpsForGood(false);
    setSelectedLocationId(loc.id);
    setGpsLat(null);
    setGpsLng(null);
    setGpsAddrLabel('');
  };

  const pickOnMap = async () => {
    // 选点初始中心优先级：当前已选 GPS/saved 坐标 > 当前 GPS（尝试一次）> picker 内部默认
    let initCenter: { lng: number; lat: number } | undefined;
    if (useGpsForGood && gpsLat != null && gpsLng != null) {
      initCenter = { lng: gpsLng, lat: gpsLat };
    } else if (selectedLocationId != null) {
      const sel = locations.find((l) => l.id === selectedLocationId);
      if (sel?.lat != null && sel?.lng != null) {
        initCenter = { lng: sel.lng, lat: sel.lat };
      }
    }
    const waiter = awaitMapPickerResult();
    navigation.navigate('MapPicker', {
      title: '在地图上选点',
      ...(initCenter ? { initCenter } : {}),
    });
    const result = await waiter;
    if (!result) return;
    setUseGpsForGood(true);
    setSelectedLocationId(null);
    setGpsLat(result.lat);
    setGpsLng(result.lng);
    setGpsAddrLabel(
      `地图选点（${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}）`,
    );
  };

  const fetchCurrentPosition = async () => {
    const ok = await ensureAndroidFineLocation();
    if (!ok) {
      Alert.alert('提示', '需要定位权限才能使用当前位置作为商品地址');
      return;
    }
    setGpsLoading(true);
    try {
      const { latitude, longitude } = await requestGpsPosition();
      setUseGpsForGood(true);
      setSelectedLocationId(null);
      setGpsLat(latitude);
      setGpsLng(longitude);
      setGpsAddrLabel(
        `当前定位（${latitude.toFixed(5)}, ${longitude.toFixed(5)}）`,
      );
    } catch (err) {
      Alert.alert('定位失败', formatGpsErrorMessage(err));
    } finally {
      setGpsLoading(false);
    }
  };

  const submit = async () => {
    const py = parseFloat(priceYuan);
    if (!title.trim() || !content.trim() || Number.isNaN(py)) {
      Alert.alert('提示', '请填写标题、描述与价格');
      return;
    }

    const selected = locations.find((l) => l.id === selectedLocationId);

    if (useGpsForGood) {
      if (gpsLat == null || gpsLng == null) {
        Alert.alert('提示', '请先使用「当前定位」，或从地址簿选择一条地址');
        return;
      }
    } else {
      if (!selected) {
        Alert.alert('提示', '请从地址簿选择商品交易地址，或使用「当前定位」', [
          { text: '去添加地址', onPress: () => navigation.navigate('AddressList') },
          { text: '取消', style: 'cancel' },
        ]);
        return;
      }
    }

    try {
      setLoading(true);
      const me = await fetchUserInfo();
      const uid = me?.id;
      if (uid == null) {
        Alert.alert('提示', '请先登录');
        return;
      }
      const urls: string[] = [];
      for (let i = 0; i < images.length; i++) {
        const a = images[i];
        if (isRemoteUrl(a.uri)) {
          urls.push(a.uri);
        } else {
          const url = await uploadOssUserFile(
            uid,
            a.uri,
            a.type || 'image/jpeg',
            a.fileName || `good_${i}.jpg`,
            'goods',
          );
          urls.push(url);
        }
      }
      const cents = Math.round(py * 100);
      const stockNum = Math.max(0, parseInt(stock, 10) || 0);

      const common = {
        title: title.trim(),
        content: content.trim(),
        goods_type: 1,
        price: cents,
        marked_price: 0,
        stock: stockNum,
      } as const;

      if (goodId) {
        await updateGood(
          goodId,
          useGpsForGood
            ? {
                ...common,
                images: urls,
                goods_addr: gpsAddrLabel,
                goods_lat: gpsLat,
                goods_lng: gpsLng,
              }
            : {
                ...common,
                images: urls,
                goods_addr: selected!.addr,
                goods_lat: selected!.lat ?? null,
                goods_lng: selected!.lng ?? null,
              },
        );
        Alert.alert('已保存', '', [
          {
            text: '确定',
            onPress: () => navigation.replace('GoodDetail', { id: goodId }),
          },
        ]);
        return;
      }

      const { id } = await createGood(
        useGpsForGood
          ? {
              ...common,
              ...(urls.length > 0 ? { images: urls } : {}),
              goods_addr: gpsAddrLabel,
              goods_lat: gpsLat,
              goods_lng: gpsLng,
            }
          : {
              ...common,
              ...(urls.length > 0 ? { images: urls } : {}),
              user_location_id: selected!.id,
              goods_addr: selected!.addr,
              goods_lat: selected!.lat ?? null,
              goods_lng: selected!.lng ?? null,
            },
      );
      await publishGood(id);
      Alert.alert('已上架', '', [
        { text: '确定', onPress: () => navigation.replace('GoodDetail', { id }) },
      ]);
    } catch (e: any) {
      Alert.alert('失败', e?.message || '请先在「我的」完成学校认证');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        style={styles.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled>
        <Text style={styles.title}>{goodId ? '编辑商品' : '发布闲置'}</Text>
        <Text style={styles.hint}>
          价格单位：元；上架后出现在市集。商品图可不传（0 张即可发布），有图更易成交。
        </Text>

        <Text style={styles.label}>商品图片（可不传）</Text>
        <Text style={styles.imgDragHint}>长按拖动可调整顺序</Text>
        <DraggableFlatList
          horizontal
          data={images}
          keyExtractor={(item) => item.key}
          onDragEnd={({ data }) => setImages(data)}
          activationDistance={14}
          containerStyle={styles.draggableList}
          contentContainerStyle={styles.draggableListContent}
          renderItem={renderImageItem}
          ListFooterComponent={
            images.length < MAX_IMAGES ? (
              <TouchableOpacity
                style={styles.addTile}
                onPress={() => {
                  pickImages().catch(() => {});
                }}>
                <Ionicons name="add" size={32} color={colors.textMuted} />
                <Text style={styles.addTileText}>添加</Text>
              </TouchableOpacity>
            ) : null
          }
        />

        <Text style={styles.label}>商品交易地址</Text>
        <Text style={styles.addrHint}>
          从地址簿选已保存的地址（有位置信息时，市集能显示距离），或使用「当前定位」。没有地址时请先到「收货地址」里添加。
        </Text>

        <View style={styles.addrActions}>
          <TouchableOpacity
            style={styles.addrManageBtn}
            onPress={() => navigation.navigate('AddressList')}
            activeOpacity={0.85}>
            <Ionicons name="book-outline" size={18} color={colors.primary} />
            <Text style={styles.addrManageText}>地址簿</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addrManageBtn, styles.addrGpsBtn]}
            onPress={() => fetchCurrentPosition()}
            disabled={gpsLoading}
            activeOpacity={0.85}>
            {gpsLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="navigate-outline" size={18} color={colors.primary} />
            )}
            <Text style={styles.addrManageText}>当前定位</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addrManageBtn, styles.addrGpsBtn]}
            onPress={() => {
              pickOnMap().catch(() => {});
            }}
            activeOpacity={0.85}>
            <Ionicons name="map-outline" size={18} color={colors.primary} />
            <Text style={styles.addrManageText}>地图选点</Text>
          </TouchableOpacity>
        </View>

        {locationsLoading ? (
          <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} />
        ) : locations.length === 0 ? (
          <Text style={styles.addrEmpty}>
            暂无保存地址。请先点「地址簿」添加，或使用「当前定位」。
          </Text>
        ) : (
          <View style={styles.addrList}>
            {locations.map((loc) => {
              const on =
                !useGpsForGood && selectedLocationId === loc.id;
              return (
                <TouchableOpacity
                  key={loc.id}
                  style={[styles.addrRow, on && styles.addrRowOn]}
                  onPress={() => selectSavedLocation(loc)}
                  activeOpacity={0.85}>
                  <Ionicons
                    name={on ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={on ? colors.primary : colors.textMuted}
                  />
                  <View style={styles.addrRowBody}>
                    <View style={styles.addrRowTitle}>
                      <Text style={styles.addrRowLabel}>{loc.label || '地址'}</Text>
                      {loc.is_default ? (
                        <Text style={styles.addrDefault}>默认</Text>
                      ) : null}
                    </View>
                    <Text style={styles.addrRowText} numberOfLines={3}>
                      {loc.addr}
                    </Text>
                    {loc.lat != null && loc.lng != null ? (
                      <Text style={styles.addrCoord}>已含地图坐标</Text>
                    ) : (
                      <Text style={styles.addrCoordMuted}>无坐标时距离可能无法展示</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {useGpsForGood && gpsLat != null && gpsLng != null ? (
          <View style={styles.gpsBanner}>
            <Ionicons name="location" size={18} color={colors.primary} />
            <Text style={styles.gpsBannerText} numberOfLines={2}>
              已选：{gpsAddrLabel}
            </Text>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="标题"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={[styles.input, styles.area]}
          placeholder="描述成色、交易方式等"
          placeholderTextColor={colors.textMuted}
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
        />
        <TextInput
          style={styles.input}
          placeholder="价格（元）"
          placeholderTextColor={colors.textMuted}
          value={priceYuan}
          onChangeText={setPriceYuan}
          keyboardType="decimal-pad"
        />
        <TextInput
          style={styles.input}
          placeholder="库存"
          placeholderTextColor={colors.textMuted}
          value={stock}
          onChangeText={setStock}
          keyboardType="number-pad"
        />
        <PrimaryButton
          title={goodId ? '保存修改' : '发布上架'}
          onPress={submit}
          loading={loading}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inner: { flex: 1 },
  scrollContent: {
    padding: space.md,
    paddingBottom: space.xl * 2,
    flexGrow: 1,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  hint: { marginTop: 6, marginBottom: space.md, fontSize: 13, color: colors.textMuted },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  addrHint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: space.sm,
  },
  addrActions: { flexDirection: 'row', gap: 10, marginBottom: space.sm },
  addrManageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  addrGpsBtn: { flex: 1, justifyContent: 'center' },
  addrManageText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  addrEmpty: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: space.md,
    lineHeight: 20,
  },
  addrList: { gap: 8, marginBottom: space.md },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  addrRowOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  addrRowBody: { flex: 1, minWidth: 0 },
  addrRowTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addrRowLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  addrDefault: { fontSize: 11, color: colors.primary, fontWeight: '700' },
  addrRowText: { marginTop: 4, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  addrCoord: { marginTop: 6, fontSize: 11, color: colors.primary, fontWeight: '600' },
  addrCoordMuted: { marginTop: 6, fontSize: 11, color: colors.textMuted },
  gpsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight,
    marginBottom: space.md,
  },
  gpsBannerText: { flex: 1, fontSize: 13, color: colors.text, fontWeight: '500' },
  imgDragHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 8,
  },
  draggableList: {
    minHeight: 96,
    marginBottom: space.md,
  },
  draggableListContent: {
    gap: 10,
    paddingRight: 4,
    alignItems: 'center',
  },
  thumbWrap: {
    width: 88,
    height: 88,
    marginRight: 10,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  thumbWrapDragging: {
    opacity: 0.95,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  dragHint: {
    position: 'absolute',
    bottom: 2,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  thumb: { width: '100%', height: '100%', backgroundColor: colors.border },
  thumbRemove: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  addTile: {
    width: 88,
    height: 88,
    marginRight: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  addTileText: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    marginBottom: space.md,
  },
  area: { minHeight: 120, maxHeight: 280 },
});
