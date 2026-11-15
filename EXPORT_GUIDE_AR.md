# دليل رفع وتصدير لعبة EcoGrow Mission بدون مشاكل (متصفح + غرف أونلاين + ويندوز + أندرويد)

اللعبة الآن تدعم وضعين:
- **وضع اللعب الفردي (Singleplayer):** يعمل **100% أوفلاين** ويحفظ تقدمك محلياً على جهازك.
- **وضع غرف اللعب الجماعي (Rooms Multiplayer):** يعتمد على سيرفر WebSocket (`server.ts` على المسار `/ws`) لإنشاء الغرف واللعب التعاوني حتى 4 لاعبين.

---

## 1) الرفع على الإنترنت مع تشغيل الغرف الأونلاين (الطريقة الكاملة الموصى بها)
> **تنبيه مهم:** استضافات الملفات الثابتة مثل **Vercel / Netlify / GitHub Pages** تشغّل الوضع الفردي (Singleplayer) فقط لأنها لا تدعم سيرفرات WebSocket الدائمة. لتشغيل **الغرف الأونلاين + المتصفح معاً** ارفع المشروع كـ Node.js App على **Render** أو **Railway** أو **Fly.io**:

1. أنشئ خدمة **Web Service (Node.js)** واربط مستودع GitHub.
2. **Build Command:**
   ```bash
   npm install && npm run build
   ```
3. **Start Command:**
   ```bash
   NODE_ENV=production npm start
   ```
   *(ملاحظة: يفضّل استخدام Node.js 22، والملف `server.ts` يستمع تلقائياً على `0.0.0.0:$PORT` ويخدم الموقع وWebSocket على نفس الرابط).*

---

## 2) نسخة المتصفح الثابتة (Vercel / Netlify / GitHub Pages)
```bash
npm install
npm run build:web
```
* **الناتج:** مجلد `dist/`.
* **لتشغيل الغرف الأونلاين من Vercel:** ارفع السيرفر على Render/Railway كما في الخطوة (1)، ثم أضف متغير البيئة `VITE_MULTIPLAYER_URL=https://your-server.onrender.com` في إعدادات Vercel قبل الـ Build (أو اكتب رابط السيرفر داخل نافذة الغرف من خيار "رابط سيرفر اللعب الجماعي").

---

## 3) نسخة ويندوز (Windows `.exe`)
ملف التشغيل `electron/main.cjs` وإعدادات `electron-builder.json` جاهزان لإنتاج نسخة تثبيت (NSIS) ونسخة محمولة (Portable):
```bash
npm install
npm install --no-save electron electron-builder
npm run build:exe
```
* **الناتج:** ملفات `.exe` داخل مجلد `release/`.
* اللعب الفردي يعمل فوراً دون إنترنت، وللغرف الأونلاين اضبط `VITE_MULTIPLAYER_URL` قبل البناء أو أدخل رابط السيرفر داخل نافذة الغرف.

---

## 4) نسخة أندرويد (Android `.apk`)
```bash
npm install
npm install --no-save @capacitor/core @capacitor/cli @capacitor/android
npm run build:web
npx cap add android
npx cap sync android
```
* إذا تم إضافة أندرويد مسبقاً استخدم فقط: `npm run cap:sync` ثم `npx cap open android` واختر **Build > Build APK(s)** من Android Studio.
* **الناتج:** `android/app/build/outputs/apk/debug/app-debug.apk`.

> **ملاحظة لتفادي أخطاء التصدير الشائعة:**
> - تأكد من تثبيت **Node.js 22+** عند تشغيل `npm start`.
> - في نسخ APK و EXE تأكد أن `"base": "./"` في `vite.config.ts` موجودة (وهي مضبوطة بالفعل).
> - لا تستخدم `npm run dev` في الإنتاج؛ استخدم دائماً `npm run build` ثم `NODE_ENV=production npm start`.
