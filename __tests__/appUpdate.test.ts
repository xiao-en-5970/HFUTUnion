/**
 * appUpdate utils 单元测试。
 *
 * 不测网络部分（fetchAppLatestVersion）——纯 IO，靠手测。
 *
 * AsyncStorage / api 模块靠 jest.mock 桩掉，避免拉 native 依赖（jest 跑在 node 里没 native 桥）。
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../src/api/appUpdate', () => ({
  __esModule: true,
  fetchAppLatestVersion: jest.fn().mockResolvedValue(null),
}));

import { versionToCode } from '../src/utils/appUpdate';

describe('appUpdate utils', () => {
  describe('versionToCode', () => {
    it('标准 X.Y.Z → X*10000 + Y*100 + Z', () => {
      expect(versionToCode('1.0.0')).toBe(10000);
      expect(versionToCode('1.0.1')).toBe(10001);
      expect(versionToCode('1.0.2')).toBe(10002);
      expect(versionToCode('1.2.3')).toBe(10203);
      expect(versionToCode('2.0.0')).toBe(20000);
      expect(versionToCode('99.99.99')).toBe(999999);
    });

    it('"1.10.0" 大于 "1.9.0"——避免字符串比较坑', () => {
      // 这就是用整数 versionCode 而不是字符串比的核心理由
      expect(versionToCode('1.10.0')).toBe(11000);
      expect(versionToCode('1.9.0')).toBe(10900);
      expect(versionToCode('1.10.0') > versionToCode('1.9.0')).toBe(true);
    });

    it('段不够 3 段补 0', () => {
      expect(versionToCode('1')).toBe(10000);
      expect(versionToCode('1.2')).toBe(10200);
    });

    it('带 -alpha / -rc1 / +meta 等后缀的丢掉', () => {
      expect(versionToCode('1.2.3-alpha')).toBe(10203);
      expect(versionToCode('1.2.3-rc1')).toBe(10203);
      expect(versionToCode('1.2.3+build.42')).toBe(10203);
    });

    it('解析失败返 0', () => {
      expect(versionToCode('')).toBe(0);
      expect(versionToCode('abc')).toBe(0);
      expect(versionToCode('  ')).toBe(0);
    });

    it('整数版本号比对——大版本一定大于小版本', () => {
      expect(versionToCode('2.0.0') > versionToCode('1.99.99')).toBe(true);
      expect(versionToCode('1.1.0') > versionToCode('1.0.99')).toBe(true);
    });
  });
});
