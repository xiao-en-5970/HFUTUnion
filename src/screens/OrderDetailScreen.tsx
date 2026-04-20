import React, { useCallback, useState } from 'react';
import {
  Text,
  Image,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import OriginalImageViewer from '../components/OriginalImageViewer';
import { useFocusEffect } from '@react-navigation/native';
import {
  getOrder,
  sellerConfirmPayment,
  confirmDelivery,
  confirmReceipt,
  cancelOrder,
} from '../api/orders';
import { fetchUserInfo } from '../api/user';
import { uploadOssUserFile } from '../api/oss';
import { launchImageLibrary } from 'react-native-image-picker';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, space } from '../theme/colors';
export default function OrderDetailScreen({ route, navigation }: any) {
  const id = Number(route.params?.id);
  const [o, setO] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [imgPreview, setImgPreview] = useState(false);
  const [deliveryBusy, setDeliveryBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const row = await getOrder(id);
      setO(row);
    } catch (e: any) {
      Alert.alert('加载失败', e?.message);
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!o) {
    return (
      <Screen>
        <Text style={styles.muted}>加载中…</Text>
      </Screen>
    );
  }

  const st = o.order_status;

  return (
    <Screen scroll={false}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
        }
        contentContainerStyle={styles.pad}>
        <Text style={styles.status}>{o.order_status_label}</Text>
        {o.good?.images?.[0] ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setImgPreview(true)}
            style={styles.imgTap}>
            <Image source={{ uri: o.good.images[0] }} style={styles.img} />
          </TouchableOpacity>
        ) : null}
        <Text style={styles.title}>{o.good?.title}</Text>
        <Text style={styles.row}>收货：{o.receiver_addr || '—'}</Text>
        <Text style={styles.row}>发货：{o.sender_addr || '—'}</Text>

        <TouchableOpacity
          style={styles.chatBtn}
          onPress={async () => {
            try {
              const me = await fetchUserInfo();
              const isBuyer =
                me?.id != null &&
                o.user_id != null &&
                Number(me.id) === Number(o.user_id);
              navigation.navigate('OrderChat', {
                orderId: id,
                goodTitle: o.good?.title,
                counterpartRole: isBuyer ? 'seller' : 'buyer',
              });
            } catch {
              navigation.navigate('OrderChat', { orderId: id, goodTitle: o.good?.title });
            }
          }}>
          <Text style={styles.chatText}>订单留言 / 协商</Text>
        </TouchableOpacity>

        {st === 1 ? (
          <PrimaryButton
            title="卖家：确认收款"
            onPress={async () => {
              try {
                await sellerConfirmPayment(id);
                load();
              } catch (e: any) {
                Alert.alert(e?.message);
              }
            }}
          />
        ) : null}
        {st === 2 ? (
          <PrimaryButton
            title="卖家：上传凭证并确认发货/自提完成"
            loading={deliveryBusy}
            onPress={async () => {
              let me: Awaited<ReturnType<typeof fetchUserInfo>>;
              try {
                me = await fetchUserInfo();
              } catch {
                Alert.alert('提示', '请先登录');
                return;
              }
              const myId = me?.id != null ? Number(me.id) : NaN;
              if (!Number.isFinite(myId)) {
                Alert.alert('提示', '请先登录');
                return;
              }
              const r = await launchImageLibrary({
                mediaType: 'photo',
                selectionLimit: 9,
              });
              if (r.didCancel || !r.assets?.length) {
                return;
              }
              try {
                setDeliveryBusy(true);
                const urls: string[] = [];
                for (const a of r.assets) {
                  const uri = a.uri;
                  if (!uri) {
                    continue;
                  }
                  const imgUrl = await uploadOssUserFile(
                    myId,
                    uri,
                    a.type || 'image/jpeg',
                    a.fileName || 'delivery.jpg',
                  );
                  urls.push(imgUrl);
                }
                if (urls.length === 0) {
                  Alert.alert('提示', '请至少选择一张送达凭证照片');
                  return;
                }
                await confirmDelivery(id, { delivery_images: urls });
                load();
              } catch (e: any) {
                Alert.alert('操作失败', e?.message || '');
              } finally {
                setDeliveryBusy(false);
              }
            }}
          />
        ) : null}
        {st === 3 ? (
          <PrimaryButton
            title="买家：确认收货"
            onPress={async () => {
              try {
                await confirmReceipt(id);
                load();
              } catch (e: any) {
                Alert.alert(e?.message);
              }
            }}
          />
        ) : null}
        {st !== 4 && st !== 5 ? (
          <PrimaryButton
            title="取消订单"
            variant="outline"
            onPress={async () => {
              try {
                await cancelOrder(id);
                load();
              } catch (e: any) {
                Alert.alert(e?.message);
              }
            }}
            style={styles.cancel}
          />
        ) : null}
      </ScrollView>

      <OriginalImageViewer
        uris={o.good?.images?.[0] ? [o.good.images[0]] : []}
        initialIndex={0}
        visible={imgPreview}
        onRequestClose={() => setImgPreview(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { padding: space.md, paddingBottom: 40 },
  status: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: space.md },
  imgTap: { marginBottom: space.md },
  img: { width: '100%', height: 200, borderRadius: radius.md },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12, color: colors.text },
  row: { fontSize: 14, color: colors.textSecondary, marginBottom: 8 },
  chatBtn: {
    backgroundColor: colors.primaryLight,
    padding: 14,
    borderRadius: radius.md,
    marginVertical: space.md,
    alignItems: 'center',
  },
  chatText: { color: colors.primary, fontWeight: '600' },
  cancel: { marginTop: 12 },
  muted: { color: colors.textMuted, padding: space.md },
});
