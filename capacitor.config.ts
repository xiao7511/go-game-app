import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cn.obsmd.gogame',
  appName: '在线游戏 Pro',
  webDir: 'www', // 更改为指向存放网页资源的文件夹
  server: {
    androidScheme: 'https'
  }
};

export default config;