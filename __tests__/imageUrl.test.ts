import { thumbnailImageUrl, originalImageUrl } from '../src/utils/imageUrl';

describe('imageUrl', () => {
  describe('thumbnailImageUrl', () => {
    it('七牛裸 URL → 加 imageView2 query', () => {
      expect(thumbnailImageUrl('https://oss.xiaoen.xyz/good/1/img.jpg'))
        .toBe('https://oss.xiaoen.xyz/good/1/img.jpg?imageView2/2/w/720/q/75');
      expect(thumbnailImageUrl('https://oss.xiaoen.xyz/p.png'))
        .toBe('https://oss.xiaoen.xyz/p.png?imageView2/2/w/720/q/75');
    });

    it('已是七牛缩略图（带 imageView2）→ idempotent 原样返回', () => {
      const u = 'https://oss.xiaoen.xyz/good/1/img.jpg?imageView2/2/w/720/q/75';
      expect(thumbnailImageUrl(u)).toBe(u);
    });

    it('七牛 URL 已带其它 query → & 拼接 imageView2', () => {
      const u = 'https://oss.xiaoen.xyz/img.jpg?v=2';
      expect(thumbnailImageUrl(u))
        .toBe('https://oss.xiaoen.xyz/img.jpg?v=2&imageView2/2/w/720/q/75');
    });

    it('老的相对路径 / .small 形式 → 加 .small', () => {
      expect(thumbnailImageUrl('img.jpg')).toBe('img.jpg.small');
      expect(thumbnailImageUrl('a/b/c.png')).toBe('a/b/c.png.small');
      expect(thumbnailImageUrl('a.jpg.small')).toBe('a.jpg.small');
    });

    it('空 / null / 非图片扩展名 → 安全返回', () => {
      expect(thumbnailImageUrl('')).toBe('');
      expect(thumbnailImageUrl(null)).toBe('');
      expect(thumbnailImageUrl(undefined)).toBe('');
      expect(thumbnailImageUrl('https://x.com/file.pdf')).toBe('https://x.com/file.pdf');
    });
  });

  describe('originalImageUrl', () => {
    it('七牛缩略图（带 imageView2）→ 去掉整个 query 拿原图', () => {
      expect(
        originalImageUrl('https://oss.xiaoen.xyz/good/1/img.jpg?imageView2/2/w/720/q/75'),
      ).toBe('https://oss.xiaoen.xyz/good/1/img.jpg');
    });

    it('七牛 URL 多 query 含 imageView2 → 整 query 一并去掉', () => {
      // 后端 ToFullURL 实际只会出单 imageView2 query；这里测兜底兼容
      expect(
        originalImageUrl('https://x.com/a.jpg?imageView2/2/w/720/q/75&hash=xx'),
      ).toBe('https://x.com/a.jpg');
    });

    it('七牛已是原图（无 query）→ 原样返回', () => {
      const u = 'https://oss.xiaoen.xyz/p.jpg';
      expect(originalImageUrl(u)).toBe(u);
    });

    it('老 .small 后缀 → 剥掉后缀拿原图', () => {
      expect(originalImageUrl('a.jpg.small')).toBe('a.jpg');
      expect(originalImageUrl('a/b.png.small')).toBe('a/b.png');
      expect(originalImageUrl('foo.small')).toBe('foo');
    });

    it('七牛 URL 有 fragment → 保留 fragment', () => {
      expect(
        originalImageUrl('https://x.com/a.jpg?imageView2/2/w/720/q/75#section'),
      ).toBe('https://x.com/a.jpg#section');
    });

    it('空 / null → 安全返回', () => {
      expect(originalImageUrl('')).toBe('');
      expect(originalImageUrl(null)).toBe('');
      expect(originalImageUrl(undefined)).toBe('');
    });
  });

  describe('thumbnail/original 互转', () => {
    it('七牛模式：thumbnail → original → thumbnail 还原', () => {
      const orig = 'https://oss.xiaoen.xyz/good/1/img.jpg';
      const t1 = thumbnailImageUrl(orig);
      expect(originalImageUrl(t1)).toBe(orig);
      expect(thumbnailImageUrl(originalImageUrl(t1))).toBe(t1);
    });

    it('本地模式：thumbnail → original → thumbnail 还原', () => {
      const orig = 'a/b/c.jpg';
      const t1 = thumbnailImageUrl(orig);
      expect(originalImageUrl(t1)).toBe(orig);
      expect(thumbnailImageUrl(originalImageUrl(t1))).toBe(t1);
    });
  });
});
