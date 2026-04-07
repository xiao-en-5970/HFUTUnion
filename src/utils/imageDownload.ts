/**
 * 使用 XHR 拉取图片，便于跨端展示下载进度（RN 的 Image 在 Android 上往往无 onProgress）。
 * total 为 0 表示长度未知。
 */
export function downloadImageAsDataUrl(
  url: string,
  onProgress: (p: { loaded: number; total: number }) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'blob';
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`HTTP ${xhr.status}`));
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const r = reader.result;
        if (typeof r === 'string') {
          resolve(r);
        } else {
          reject(new Error('读取图片失败'));
        }
      };
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.readAsDataURL(xhr.response as Blob);
    };
    xhr.onerror = () => reject(new Error('网络错误'));
    xhr.onprogress = (e) => {
      const total = e.lengthComputable && e.total > 0 ? e.total : 0;
      onProgress({ loaded: e.loaded, total });
    };
    xhr.send();
  });
}
