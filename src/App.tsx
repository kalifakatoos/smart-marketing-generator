import React, { useState, useRef } from 'react';
import { Upload, X, Download, Send, Copy, Check, Loader2, AlertCircle } from 'lucide-react';
import './App.css';

interface GeneratedContent {
  productName: string;
  marketingCopy: string;
  productDescription: string;
  keyFeatures: string[];
  hashtags: string[];
  imagePrompt: string;
}

interface UploadedImage {
  file: File;
  preview: string;
  base64: string;
}

function App() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isSendingToWebhook, setIsSendingToWebhook] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  // عناصر تحكم قابلة للتعديل
  const [featuresCount, setFeaturesCount] = useState<number>(3);
  const [hashtagsCount, setHashtagsCount] = useState<number>(4);
  const [descriptionSentences, setDescriptionSentences] = useState<number>(3);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const API_MODE = import.meta.env.VITE_API_MODE || 'direct';

  // التحقق من وضع التشغيل
  const useSupabase = API_MODE === 'supabase' && SUPABASE_URL && SUPABASE_ANON_KEY;
  const useDirect = API_MODE === 'direct' && GEMINI_API_KEY;

  // Debug: log configuration
  console.log('App Configuration:', {
    API_MODE,
    hasGeminiKey: !!GEMINI_API_KEY,
    hasSupabaseUrl: !!SUPABASE_URL,
    useSupabase,
    useDirect
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const validFiles = files.filter(file => {
      if (file.size > 5 * 1024 * 1024) {
        setError(`الملف ${file.name} أكبر من 5 ميجابايت`);
        return false;
      }
      return file.type.startsWith('image/');
    });

    const imagePromises = validFiles.map(file => {
      return new Promise<UploadedImage>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          const uploadedImage: UploadedImage = {
            file,
            preview: base64,
            base64
          };
          resolve(uploadedImage);
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(imagePromises).then(newImages => {
      setImages(prev => [...prev, ...newImages]);
      setError(null);
    });
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    const imagePromises = imageFiles.map(file => {
      return new Promise<UploadedImage>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          const uploadedImage: UploadedImage = {
            file,
            preview: base64,
            base64
          };
          resolve(uploadedImage);
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(imagePromises).then(newImages => {
      setImages(prev => [...prev, ...newImages]);
      setError(null);
    });
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const generateContent = async () => {
    if (images.length === 0) {
      setError('يرجى اختيار صورة واحدة على الأقل');
      return;
    }

    if (!useDirect && !useSupabase) {
      setError('يرجى إعداد Gemini API Key أو Supabase في ملف .env');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      let parsedContent;

      if (useSupabase) {
        // الوضع الآمن: استخدام Supabase Edge Function
        const imagesData = images.map(image => ({
          mimeType: image.file.type,
          base64Data: image.base64.split(',')[1]
        }));

        const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/generate-marketing-content`;
        
        const response = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ 
            images: imagesData,
            config: { 
              featuresCount, 
              hashtagsCount, 
              descriptionSentences 
            }
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || `خطأ في الاتصال: ${response.status}`);
        }

        const result = await response.json();
        parsedContent = result.data?.content || result.data;
        
      } else {
        // الوضع المباشر: استخدام Gemini API مباشرة
        const imageParts = images.map(image => ({
          inlineData: {
            mimeType: image.file.type,
            data: image.base64.split(',')[1]
          }
        }));

        const prompt = `
حلّل هذه الصور وأنشئ JSON موجز باللغة العربية:

1. productName: اسم جذاب ومختصر
2. marketingCopy: جملتين قصيرتين للتسويق
3. productDescription: ${descriptionSentences} ${descriptionSentences === 1 ? 'جملة' : 'جمل'} وصفية مختصرة
4. keyFeatures: ${featuresCount} ميزات رئيسية قصيرة
5. hashtags: ${hashtagsCount} هاشتاقات مناسبة
6. imagePrompt: نص إنجليزي موجز ومهني لتوليد صورة

أعد JSON صالح فقط دون أي نص إضافي أو تنسيق.
        `.trim();

        const requestBody = {
          contents: [
            {
              parts: [
                { text: prompt },
                ...imageParts
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            // زيادة الحد لتفادي استجابة مقطوعة بسبب MAX_TOKENS
            maxOutputTokens: 2048,
            // إجبار الخرج أن يكون JSON
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'object',
              properties: {
                productName: { type: 'string' },
                marketingCopy: { type: 'string' },
                productDescription: { type: 'string' },
                keyFeatures: { type: 'array', items: { type: 'string' } },
                hashtags: { type: 'array', items: { type: 'string' } },
                imagePrompt: { type: 'string' }
              },
              required: ['productName','marketingCopy','productDescription','keyFeatures','hashtags','imagePrompt']
            }
          }
        };

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Gemini API Error:', response.status, errorText);
          throw new Error(`خطأ في الاتصال: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Gemini API Response:', data);
        
        if (!data.candidates || data.candidates.length === 0) {
          console.error('No candidates in response:', data);
          throw new Error('استجابة غير صحيحة من Gemini API: لا توجد نتائج');
        }

        const candidate = data.candidates[0];
        const finishReason = candidate.finishReason || data.candidates[0]?.finishReason;
        if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
          console.error('Invalid candidate structure:', candidate);
          throw new Error('استجابة غير صحيحة من Gemini API: بنية غير صحيحة');
        }

        // ابحث عن أول جزء يحتوي على نص فعلي
        const textPart = candidate.content.parts.find((p: any) => typeof p?.text === 'string' && p.text.trim().length > 0);
        let generatedText = textPart?.text;

        if (!generatedText) {
          console.warn('لم يتم العثور على نص مباشر في الأجزاء، محاولة الاستخلاص الاحتياطي', candidate.content.parts);
          // محاولة الاستخلاص الاحتياطي: البحث عن أول وآخر قوسين متوازنين
          const joined = candidate.content.parts.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('\n');
          const start = joined.indexOf('{');
          const end = joined.lastIndexOf('}');
          if (start !== -1 && end !== -1 && end > start) {
            generatedText = joined.slice(start, end + 1);
          }
        }

        if (!generatedText) {
          const reasonInfo = finishReason === 'MAX_TOKENS' ? ' (الاستجابة قد تكون مقطوعة بسبب MAX_TOKENS)' : '';
          console.error('No text in response parts:', candidate.content.parts);
          throw new Error(`استجابة غير صحيحة من Gemini API: لا يوجد نص${reasonInfo}`);
        }

        console.log('Generated Text:', generatedText);
        
        // تنظيف النص من تنسيق Markdown
        if (generatedText.includes('```json')) {
          generatedText = generatedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        }
        if (generatedText.includes('```')) {
          generatedText = generatedText.replace(/```/g, '');
        }
        generatedText = generatedText.trim();
        
        console.log('Cleaned Text:', generatedText);
        
        try {
          parsedContent = JSON.parse(generatedText);
          console.log('Parsed Content:', parsedContent);
        } catch (parseErr) {
          console.warn('JSON Parse Error, محاولة تنظيف/استخلاص JSON...', parseErr);
          // تنظيف شيفرات Markdown إن وُجدت ثم استخلاص JSON بين الأقواس
          let textForParse = generatedText.trim();
          if (textForParse.startsWith('```json')) {
            textForParse = textForParse.replace(/^```json\s*/, '');
          }
          if (textForParse.endsWith('```')) {
            textForParse = textForParse.replace(/\s*```$/, '');
          }

          const s = textForParse.indexOf('{');
          const e = textForParse.lastIndexOf('}');
          if (s !== -1 && e !== -1 && e > s) {
            const slice = textForParse.slice(s, e + 1);
            try {
              parsedContent = JSON.parse(slice);
              console.log('Parsed Content (fallback):', parsedContent);
            } catch (err2) {
              const reasonInfo = finishReason === 'MAX_TOKENS' ? '؛ يبدو أن الاستجابة مقطوعة (MAX_TOKENS). جرب تقليل عدد الصور أو المحاولة مجدداً.' : '';
              console.error('Fallback JSON Parse Error:', err2, 'Slice:', slice);
              throw new Error(`فشل في تحليل النص المولد كـ JSON${reasonInfo}`);
            }
          } else {
            const reasonInfo = finishReason === 'MAX_TOKENS' ? '؛ يبدو أن الاستجابة مقطوعة (MAX_TOKENS). جرب تقليل عدد الصور أو المحاولة مجدداً.' : '';
            console.error('No JSON braces found in text:', textForParse);
            throw new Error(`فشل في تحليل النص المولد كـ JSON${reasonInfo}`);
          }
        }
      }
      
      if (!parsedContent) {
        throw new Error('استجابة غير صحيحة من الخادم');
      }
      
      setGeneratedContent(parsedContent);
    } catch (err) {
      console.error('تفاصيل الخطأ (المحاولة الأولى):', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      const shouldRetry = /MAX_TOKENS|لا يوجد نص|فشل في تحليل النص/.test(errMsg) && images.length > 0;

      if (shouldRetry) {
        try {
          // محاولة ثانية تلقائية: صورة واحدة وحدود أصغر
          const retryImages = [images[0]];
          const smallFeatures = Math.min(featuresCount, 3);
          const smallHashtags = Math.min(hashtagsCount, 3);
          const smallDesc = Math.min(descriptionSentences, 2);

          let parsedContent;
          if (useSupabase) {
            const imagesData = retryImages.map(image => ({
              mimeType: image.file.type,
              base64Data: image.base64.split(',')[1]
            }));

            const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/generate-marketing-content`;
            const response = await fetch(edgeFunctionUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                images: imagesData,
                config: {
                  featuresCount: smallFeatures,
                  hashtagsCount: smallHashtags,
                  descriptionSentences: smallDesc
                }
              })
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error?.message || `خطأ في الاتصال: ${response.status}`);
            }

            const result = await response.json();
            parsedContent = result.data?.content || result.data;
          } else {
            const imageParts = retryImages.map(image => ({
              inlineData: {
                mimeType: image.file.type,
                data: image.base64.split(',')[1]
              }
            }));

            const prompt = `
حلّل هذه الصور وأنشئ JSON موجز باللغة العربية:

1. productName: اسم جذاب ومختصر
2. marketingCopy: جملة واحدة قصيرة للتسويق
3. productDescription: ${smallDesc} ${smallDesc === 1 ? 'جملة' : 'جمل'} وصفية مختصرة
4. keyFeatures: ${smallFeatures} ميزات رئيسية قصيرة
5. hashtags: ${smallHashtags} هاشتاقات مناسبة
6. imagePrompt: نص إنجليزي موجز ومهني لتوليد صورة

أعد JSON صالح فقط دون أي نص إضافي أو تنسيق.
            `.trim();

            const requestBody = {
              contents: [
                {
                  parts: [
                    { text: prompt },
                    ...imageParts
                  ]
                }
              ],
              generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 1024,
                responseMimeType: 'application/json',
                responseSchema: {
                  type: 'object',
                  properties: {
                    productName: { type: 'string' },
                    marketingCopy: { type: 'string' },
                    productDescription: { type: 'string' },
                    keyFeatures: { type: 'array', items: { type: 'string' } },
                    hashtags: { type: 'array', items: { type: 'string' } },
                    imagePrompt: { type: 'string' }
                  },
                  required: ['productName','marketingCopy','productDescription','keyFeatures','hashtags','imagePrompt']
                }
              }
            };

            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
              }
            );

            if (!response.ok) {
              const errorText = await response.text();
              console.error('Gemini API Retry Error:', response.status, errorText);
              throw new Error(`خطأ في الاتصال: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const candidate = data.candidates?.[0];
            const textPart = candidate?.content?.parts?.find((p: any) => typeof p?.text === 'string' && p.text.trim().length > 0);
            const generatedText = (textPart?.text || '').trim();
            const clean = generatedText
              .replace(/^```json\s*/,'')
              .replace(/\s*```$/,'');
            parsedContent = JSON.parse(clean);
          }

          if (!parsedContent) throw new Error('استجابة غير صحيحة من الخادم بعد إعادة المحاولة');
          setGeneratedContent(parsedContent);
          setError(null);
          return; // أنهِ التنفيذ بعد نجاح إعادة المحاولة
        } catch (retryErr) {
          console.error('فشل إعادة المحاولة:', retryErr);
          setError(`خطأ في توليد المحتوى: ${retryErr instanceof Error ? retryErr.message : 'خطأ غير معروف'}`);
        }
      } else {
        setError(`خطأ في توليد المحتوى: ${errMsg}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('فشل في نسخ النص:', err);
    }
  };

  const exportToJSON = () => {
    if (!generatedContent) return;
    
    const dataStr = JSON.stringify(generatedContent, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${generatedContent.productName.replace(/[^\w\s]/gi, '')}-marketing-content.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const sendToWebhook = async () => {
    if (!generatedContent || !webhookUrl.trim()) {
      setError('يرجى إدخال رابط webhook صحيح');
      return;
    }

    setIsSendingToWebhook(true);
    setError(null);

    try {
      const payload = {
        content: generatedContent,
        images: images.map(image => ({
          base64: image.base64,
          fileName: image.file.name,
          mimeType: image.file.type
        })),
        timestamp: new Date().toISOString()
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`خطأ في الإرسال: ${response.status}`);
      }

      alert('تم إرسال المحتوى بنجاح!');
    } catch (err) {
      setError(`خطأ في إرسال البيانات: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`);
    } finally {
      setIsSendingToWebhook(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white" dir="rtl">
      <div className="container mx-auto px-4 py-8">
        {/* العنوان الرئيسي */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-4">
            مسوّق المنتجات الذكي
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            قم برفع صور منتجاتك ودع الذكاء الاصطناعي ينشئ محتوى تسويقي احترافي ومؤثر
          </p>
          
          {/* شارة الوضع */}
          <div className="mt-4 inline-flex items-center px-4 py-2 bg-gray-800 rounded-full text-sm">
            <span className="text-gray-400">الوضع:</span>
            <span className={`mr-2 font-semibold ${useDirect ? 'text-green-400' : useSupabase ? 'text-blue-400' : 'text-red-400'}`}>
              {useDirect ? '✓ Gemini API مباشر' : useSupabase ? '✓ Supabase Edge Function' : '✗ غير مُعد'}
            </span>
          </div>
        </div>

        {/* منطقة رفع الصور */}
        <div className="mb-8">
          <div 
            className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mx-auto mb-4 h-12 w-12 text-gray-400" />
            <p className="text-lg mb-2">اسحب الصور هنا أو انقر للاختيار</p>
            <p className="text-sm text-gray-400">يدعم JPG, PNG, GIF (حتى 5 ميجابايت)</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* معاينة الصور */}
          {images.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-3">الصور المختارة:</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {images.map((image, index) => (
                  <div key={index} className="relative group">
                    <img 
                      src={image.preview} 
                      alt={`صورة ${index + 1}`}
                      className="w-full h-32 object-cover rounded-lg border border-gray-600"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage(index);
                      }}
                      className="absolute top-2 left-2 bg-red-500 hover:bg-red-600 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* عناصر التحكم في المخرجات */}
        <div className="mb-6 bg-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">التحكم بالمخرجات</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">عدد الميزات</label>
              <input type="number" min={1} max={6} value={featuresCount}
                onChange={(e) => setFeaturesCount(Math.max(1, Math.min(6, Number(e.target.value))))}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">عدد الهاشتاقات</label>
              <input type="number" min={1} max={8} value={hashtagsCount}
                onChange={(e) => setHashtagsCount(Math.max(1, Math.min(8, Number(e.target.value))))}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">عدد جمل الوصف</label>
              <input type="number" min={1} max={6} value={descriptionSentences}
                onChange={(e) => setDescriptionSentences(Math.max(1, Math.min(6, Number(e.target.value))))}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            </div>
          </div>
        </div>

        {/* زر توليد المحتوى */}
        <div className="text-center mb-8">
          <button
            onClick={generateContent}
            disabled={images.length === 0 || isGenerating}
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed px-8 py-3 rounded-lg font-semibold transition-all flex items-center mx-auto"
          >
            {isGenerating ? (
              <>
                <Loader2 className="animate-spin ml-2 h-5 w-5" />
                جاري التوليد...
              </>
            ) : (
              'أنشئ المحتوى'
            )}
          </button>
        </div>

        {/* رسائل الخطأ */}
        {error && (
          <div className="mb-6 bg-red-900/50 border border-red-700 rounded-lg p-4 flex items-center">
            <AlertCircle className="h-5 w-5 text-red-400 ml-2" />
            <span className="text-red-200">{error}</span>
          </div>
        )}

        {/* النتائج */}
        {generatedContent && (
          <div className="space-y-8">
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-2xl font-bold mb-4 text-center">{generatedContent.productName}</h2>
            </div>

            {/* النسخ التسويقي */}
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xl font-semibold">النسخ التسويقي</h3>
                <button
                  onClick={() => copyToClipboard(generatedContent.marketingCopy, 'marketingCopy')}
                  className="flex items-center px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                >
                  {copiedField === 'marketingCopy' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4 ml-1" />}
                  نسخ
                </button>
              </div>
              <p className="text-gray-300 leading-relaxed">{generatedContent.marketingCopy}</p>
            </div>

            {/* الوصف التفصيلي */}
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xl font-semibold">الوصف التفصيلي</h3>
                <button
                  onClick={() => copyToClipboard(generatedContent.productDescription, 'productDescription')}
                  className="flex items-center px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                >
                  {copiedField === 'productDescription' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4 ml-1" />}
                  نسخ
                </button>
              </div>
              <p className="text-gray-300 leading-relaxed">{generatedContent.productDescription}</p>
            </div>

            {/* الميزات الرئيسية */}
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xl font-semibold">الميزات الرئيسية</h3>
                <button
                  onClick={() => copyToClipboard(generatedContent.keyFeatures.join('\n'), 'keyFeatures')}
                  className="flex items-center px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                >
                  {copiedField === 'keyFeatures' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4 ml-1" />}
                  نسخ
                </button>
              </div>
              <ul className="space-y-2">
                {generatedContent.keyFeatures.map((feature, index) => (
                  <li key={index} className="text-gray-300 flex items-start">
                    <span className="text-blue-400 ml-2">•</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {/* الهاشتاغات */}
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xl font-semibold">الهاشتاغات</h3>
                <button
                  onClick={() => copyToClipboard(generatedContent.hashtags.join(' '), 'hashtags')}
                  className="flex items-center px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                >
                  {copiedField === 'hashtags' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4 ml-1" />}
                  نسخ
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {generatedContent.hashtags.map((hashtag, index) => (
                  <span key={index} className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-full text-sm transition-colors">
                    {hashtag}
                  </span>
                ))}
              </div>
            </div>

            {/* موجه الصورة */}
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xl font-semibold">موجه إنشاء الصورة</h3>
                <button
                  onClick={() => copyToClipboard(generatedContent.imagePrompt, 'imagePrompt')}
                  className="flex items-center px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                >
                  {copiedField === 'imagePrompt' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4 ml-1" />}
                  نسخ
                </button>
              </div>
              <pre className="bg-gray-900 p-4 rounded border border-gray-600 text-sm text-gray-300 whitespace-pre-wrap font-mono">
                {generatedContent.imagePrompt}
              </pre>
            </div>

            {/* أزرار التصدير والإرسال */}
            <div className="flex flex-wrap gap-4 justify-center">
              <button
                onClick={exportToJSON}
                className="flex items-center bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                <Download className="h-5 w-5 ml-2" />
                تصدير المحتوى إلى JSON
              </button>

              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="رابط Webhook (مثل n8n)"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="bg-gray-800 border border-gray-600 rounded px-4 py-3 text-white placeholder-gray-400 min-w-[300px]"
                />
                <button
                  onClick={sendToWebhook}
                  disabled={!webhookUrl.trim() || isSendingToWebhook}
                  className="flex items-center bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-semibold transition-colors"
                >
                  {isSendingToWebhook ? (
                    <Loader2 className="animate-spin h-5 w-5 ml-2" />
                  ) : (
                    <Send className="h-5 w-5 ml-2" />
                  )}
                  إرسال إلى Webhook
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
