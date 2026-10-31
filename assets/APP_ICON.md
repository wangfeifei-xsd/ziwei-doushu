# 应用图标

`app-icon.png` 是各平台图标的唯一彩色母版，`app-icon-monochrome.png` 是 Android 13 主题图标遮罩。图案由 **gpt-image-2.5-sunburst** 通过已配置的图片 API 生成：深玉绿底、金色星芒、阴阳与星轨，不含文字或第三方标志。

原始图保存在 `output/imagegen/ziwei-icon-sunburst.png`。请求为 1024 × 1024，服务实际返回 1254 × 1254；母版等比缩小为 1024 × 1024，没有拉伸或裁剪。单色版从生成图的金色图案提取透明遮罩。

生成提示词：

> Use case: logo-brand. Asset type: production mobile app launcher icon for a Chinese Ziwei astrology app called Ziwei. Create one elegant and distinctive centered celestial emblem, a luminous warm antique gold eight-point north star above a small flowing yin-yang crescent, with a simple circular astrolabe orbit and a few tasteful constellation dots. Deep dark jade green background, restrained champagne gold, subtle enamel and brushed metal relief, polished premium Chinese celestial aesthetic, mystical yet calm. Bold clean recognizable silhouette that works at 48 px, generous breathing room, emblem fully inside the central 60 percent of the square. Flat front view, perfectly centered and balanced. Fill the entire square with solid dark jade; do not draw a phone, rounded square outer boundary, drop shadow, text, letters, Chinese characters, logos from other brands, watermark, layout board or mockup. One single app icon artwork only. Square composition 1024 by 1024 pixels.

重新生成各平台尺寸：

```sh
npm run icons:generate
```

`app-icon.manifest.json` 为 Tauri 图标配置，Android 前景缩放为 70%，适配圆形、方圆形等系统蒙版；背景颜色为深玉绿，包含 monochrome 主题图标。产物位于 `apps/native/src-tauri/icons/`。

`scripts/mobile-project.mjs` 每次初始化 Android/iOS 工程后都同步图标。不要依赖初始化模板自带的默认图标。Android 构建完成后用 `scripts/check-android-launcher.mjs` 检查最终 APK 的 MAIN/LAUNCHER、应用名和已打包的四类图标资源。
