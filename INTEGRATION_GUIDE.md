# دليل التحديث: دمج Gemini API بشكل آمن عبر Supabase Edge Functions

## نظرة عامة

تم تحديث تطبيق "مسوّق المنتجات الذكي" لنقل Gemini API Key من الـ Frontend إلى الباك إند (Supabase Edge Function) لضمان الأمان الكامل.

## التحسينات الأمنية

### قبل التحديث ❌
- API Key موجود في Frontend (متاح للجميع في المتصفح)
- خطر كشف API Key في كود المصدر
- يمكن استخدام API Key من قبل الغير

### بعد التحديث ✅
- API Key محفوظ في Supabase كمتغير بيئة
- معالجة الطلبات في Edge Function (Server-side)
- API Key غير متاح في المتصفح إطلاقاً
- اتصال آمن عبر HTTPS
- Authorization headers مع Supabase

## البنية الجديدة

```
Frontend (React App)
    ↓ يرسل الصور
Edge Function (Supabase)
    ↓ يستخدم API Key من البيئة
Gemini API
    ↓ يرجع النتائج
Edge Function
    ↓ يعيد النتائج
Frontend
```

## الملفات المحدثة

### 1. Edge Function
**المسار**: `/supabase/functions/generate-marketing-content/index.ts`

**الوظيفة**:
- استقبال الصور من Frontend
- استخدام GEMINI_API_KEY من متغيرات البيئة
- إرسال الصور إلى Gemini API
- معالجة الاستجابة وإعادة تنسيقها
- إرجاع النتائج للـ Frontend

### 2. Frontend Application
**المسار**: `/src/App.tsx`

**التغييرات**:
- إزالة استخدام VITE_GEMINI_API_KEY
- إضافة VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY
- تحديث `generateContent()` للاتصال بـ Edge Function
- تحسين معالجة الأخطاء

### 3. Environment Configuration
**المسارات**: `.env` و `.env.example`

**التغييرات**:
- إضافة VITE_SUPABASE_URL
- إضافة VITE_SUPABASE_ANON_KEY
- إزالة VITE_GEMINI_API_KEY من Frontend

## خطوات الإعداد

### 1. متطلبات Supabase

يجب الحصول على:
- `SUPABASE_URL`: عنوان مشروع Supabase
- `SUPABASE_ANON_KEY`: المفتاح العام للاتصال
- `SUPABASE_SERVICE_ROLE_KEY`: لنشر Edge Functions
- `GEMINI_API_KEY`: `AIzaSyA0pKbwyWcpXOJMbDhMMKVv1LB50F_TjyI`

### 2. نشر Edge Function

```bash
# تثبيت Supabase CLI (إذا لم يكن مثبتاً)
npm install -g supabase

# تسجيل الدخول
supabase login

# نشر Edge Function
supabase functions deploy generate-marketing-content

# إضافة Gemini API Key كمتغير بيئة
supabase secrets set GEMINI_API_KEY=AIzaSyA0pKbwyWcpXOJMbDhMMKVv1LB50F_TjyI
```

### 3. تحديث ملف .env

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# إعدادات التطبيق
VITE_APP_NAME=مسوّق المنتجات الذكي
VITE_APP_VERSION=2.0.0

# إعدادات الملفات
VITE_MAX_FILE_SIZE=5242880
VITE_MAX_IMAGES=10
```

### 4. البناء والنشر

```bash
# تثبيت المتطلبات
pnpm install

# بناء التطبيق
pnpm build

# نشر dist/ على الويب
```

## اختبار التكامل

### 1. اختبار Edge Function مباشرة

```bash
curl -X POST https://your-project.supabase.co/functions/v1/generate-marketing-content \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "images": [
      {
        "mimeType": "image/jpeg",
        "base64Data": "BASE64_STRING_HERE"
      }
    ]
  }'
```

### 2. اختبار من Frontend

1. افتح التطبيق في المتصفح
2. ارفع صورة منتج
3. انقر على "أنشئ المحتوى"
4. تأكد من ظهور النتائج بشكل صحيح

### 3. اختبار الميزات

- ✅ رفع صور متعددة
- ✅ تحويل الصور إلى base64
- ✅ إرسال البيانات لـ Edge Function
- ✅ استقبال المحتوى التسويقي
- ✅ عرض النتائج بشكل منظم
- ✅ نسخ النصوص للحافظة
- ✅ تصدير JSON
- ✅ إرسال إلى Webhook

## معالجة الأخطاء

### خطأ "Supabase configuration missing"
**السبب**: لم يتم تعيين VITE_SUPABASE_URL أو VITE_SUPABASE_ANON_KEY
**الحل**: تحديث ملف .env بالقيم الصحيحة

### خطأ "Gemini API key غير متوفر"
**السبب**: لم يتم إضافة GEMINI_API_KEY في Supabase Secrets
**الحل**: تشغيل `supabase secrets set GEMINI_API_KEY=your-key`

### خطأ 500 من Edge Function
**السبب**: مشكلة في معالجة الطلب أو الاتصال بـ Gemini
**الحل**: فحص logs في Supabase Dashboard

### خطأ في تحليل JSON
**السبب**: استجابة غير صحيحة من Gemini API
**الحل**: تحسين معالجة الاستجابة في Edge Function

## الميزات الجديدة

### 1. تحسينات الأمان
- 🔐 API Key محمي بالكامل
- 🔐 لا يمكن الوصول للـ API Key من المتصفح
- 🔐 CORS headers محكمة
- 🔐 Authorization مع كل طلب

### 2. تحسينات الأداء
- ⚡ معالجة أسرع على الخادم
- ⚡ تقليل حجم Bundle في Frontend
- ⚡ Caching أفضل

### 3. تحسينات تجربة المستخدم
- 📱 رسائل خطأ أوضح
- 📱 مؤشرات تحميل محسّنة
- 📱 معالجة أخطاء أفضل

## الصيانة والمراقبة

### مراقبة Edge Function

1. افتح Supabase Dashboard
2. انتقل إلى "Edge Functions"
3. اختر `generate-marketing-content`
4. راجع Logs و Metrics

### تحديث Edge Function

```bash
# تعديل الكود في
supabase/functions/generate-marketing-content/index.ts

# إعادة النشر
supabase functions deploy generate-marketing-content
```

### تحديث API Key

```bash
# إذا احتجت لتحديث Gemini API Key
supabase secrets set GEMINI_API_KEY=new-key-here
```

## الدعم والمساعدة

للمزيد من المعلومات:
- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Gemini API Docs](https://ai.google.dev/docs)
- مشروع GitHub (إذا كان موجوداً)

---

**تم التحديث**: 2025-10-29  
**الإصدار**: 2.0.0  
**الحالة**: جاهز للنشر
