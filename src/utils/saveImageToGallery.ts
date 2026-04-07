import { Platform, PermissionsAndroid } from 'react-native';
import RNFS from 'react-native-fs';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { downloadImageAsDataUrl } from './imageDownload';

async function hasAndroidPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const api = Number(Platform.Version);
  const check = () => {
    if (api >= 33) {
      return Promise.all([
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES),
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO),
      ]).then(([a, b]) => a && b);
    }
    return PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
    );
  };
  if (await check()) {
    return true;
  }
  if (api >= 33) {
    const s = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
      PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
    ]);
    return (
      s[PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES] ===
        PermissionsAndroid.RESULTS.GRANTED &&
      s[PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO] ===
        PermissionsAndroid.RESULTS.GRANTED
    );
  }
  const status = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
  );
  return status === PermissionsAndroid.RESULTS.GRANTED;
}

function dataUrlToBase64AndExt(dataUrl: string): { base64: string; ext: string } {
  const comma = dataUrl.indexOf(',');
  const meta = comma >= 0 ? dataUrl.slice(0, comma) : '';
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const ext = meta.includes('png') ? 'png' : 'jpg';
  return { base64, ext };
}

/**
 * 将远程原图或已缓存的 data URL 保存到系统相册。
 * @param sourceUrl 原图网络地址（用于在未缓存时下载）
 * @param cachedDataUrl 若已通过「查看原图」加载过，可传入以避免重复下载
 */
export async function saveRemoteImageToGallery(
  sourceUrl: string,
  cachedDataUrl?: string | null,
): Promise<void> {
  if (Platform.OS === 'android' && !(await hasAndroidPermission())) {
    throw new Error('需要相册权限才能保存');
  }
  const dataUrl =
    cachedDataUrl && cachedDataUrl.startsWith('data:')
      ? cachedDataUrl
      : await downloadImageAsDataUrl(sourceUrl, () => {});
  const { base64, ext } = dataUrlToBase64AndExt(dataUrl);
  const path = `${RNFS.CachesDirectoryPath}/hfut_save_${Date.now()}.${ext}`;
  await RNFS.writeFile(path, base64, 'base64');
  const fileUri = path.startsWith('file://') ? path : `file://${path}`;
  try {
    await CameraRoll.save(fileUri, { type: 'photo' });
  } finally {
    await RNFS.unlink(path).catch(() => {});
  }
}
