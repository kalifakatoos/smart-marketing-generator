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

// بنية جديدة للنتائج المتعددة
interface ProductMarketing {
  imageIndex: number;
  imageName: string;
  product: GeneratedContent;
}

interface GeneratedContentArray {
  products: ProductMarketing[];
  totalProducts: number;
  processedImages: number;
  skippedImages: number;
  errors: string[];
}

interface UploadedImage {
  file: File;
  preview: string;
  base64: string;
}

function App() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [generatedContents, setGeneratedContents] = useState<GeneratedContentArray | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isSendingToWebhook, setIsSendingToWebhook] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  // عناصر تحكم قابلة للتعديل
  const [featuresCount, setFeaturesCount] = useState<number>(3);
  const [hashtagsCount, setHashtagsCount] = useState<number>(4);
  const [descriptionSentences, setDescriptionSentences] = useState<number>(10);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

  // التحقق من توفر Gemini API Key
  const hasGeminiKey = !!GEMINI_API_KEY;

  // Debug: log configuration
  console.log('App Configuration:', {
    hasGeminiKey,
    apiMode: 'direct (Gemini API)',
    geminiKeyPreview: GEMINI_API_KEY ? GEMINI_API_KEY.substring(0, 10) + '...' : 'undefined',
    fullEnvCheck: import.meta.env
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

  const generateContentForImage = async (image: UploadedImage, imageIndex: number, imageName: string): Promise<ProductMarketing | null> => {
    try {
      const imagePart = {
        inlineData: {
          mimeType: image.file.type,
          data: image.base64.split(',')[1]
        }
      };

      const prompt = `
قم بتحليل هذه الصورة بشكل تفصيلي ودقيق وأنشئ محتوى تسويقي احترافي للمنتج المعروض.

المطلوب:
1. productName: اسم جذاب ومختصر للمنتج في الصورة
2. marketingCopy: جملتين قصيرتين وواضحتين للتسويق
3. productDescription: وصف شامل ومفصل يتراوح بين ${descriptionSentences} ${descriptionSentences === 1 ? 'جملة' : 'جمل'} يتضمن جميع جوانب المنتج - الشكل واللون والحجم والفوائد والمزايا والاستخدامات والجودة والتصميم
4. keyFeatures: ${featuresCount} ميزات رئيسية مع شرح مختصر لكل ميزة
5. hashtags: ${hashtagsCount} هاشتاقات مناسبة للمحتوى
6. imagePrompt: نص إنجليزي مهني وواضح لتوليد صورة مشابهة

مهم: احلل الصورة بدقة ولا تتجاهل أي تفاصيل مرئية. اذكر كل ما تراه في الصورة.

أعد JSON صالح فقط دون أي نص إضافي أو تنسيق.
      `.trim();

      const requestBody = {
        contents: [
          {
            parts: [
              { text: prompt },
              imagePart
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 4096,
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
        console.error('Gemini API Error for image', imageIndex + 1, ':', response.status, errorText);
        throw new Error(`خطأ في الاتصال: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const textPart = candidate?.content?.parts?.find((p: any) => typeof p?.text === 'string' && p.text.trim().length > 0);
      let generatedText = (textPart?.text || '').trim();
      
      // تنظيف النص من تنسيق Markdown
      if (generatedText.includes('```json')) {
        generatedText = generatedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      if (generatedText.includes('```')) {
        generatedText = generatedText.replace(/```/g, '');
      }
      
      // محاولة تنظيف JSON
      const s = generatedText.indexOf('{');
      const e = generatedText.lastIndexOf('}');
      if (s !== -1 && e !== -1 && e > s) {
        generatedText = generatedText.slice(s, e + 1);
      }

      const parsedContent = JSON.parse(generatedText);

      if (!parsedContent) {
        throw new Error('استجابة غير صحيحة من الخادم');
      }

      return {
        imageIndex,
        imageName,
        product: parsedContent
      };
    } catch (err) {
      console.error(`فشل في معالجة الصورة ${imageIndex + 1} (${imageName}):`, err);
      return null;
    }
  };

  const generateContent = async () => {
    if (images.length === 0) {
      setError('يرجى اختيار صورة واحدة على الأقل');
      return;
    }

    if (!hasGeminiKey) {
      setError('يرجى إعداد Gemini API Key في ملف .env');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const products: ProductMarketing[] = [];
      const errors: string[] = [];
      let processedCount = 0;

      // معالجة كل صورة على حدة
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        console.log(`معالجة الصورة ${i + 1}/${images.length}: ${image.file.name}`);
        
        const result = await generateContentForImage(image, i, image.file.name);
        
        if (result) {
          products.push(result);
        } else {
          errors.push(`فشل في معالجة الصورة ${image.file.name}`);
        }
        
        processedCount++;
        
        // إظهار تقدم المعالجة
        setError(null);
      }

      const result: GeneratedContentArray = {
        products,
        totalProducts: images.length,
        processedImages: processedCount,
        skippedImages: images.length - products.length,
        errors
      };

      setGeneratedContents(result);

      if (products.length === 0) {
        setError('فشل في معالجة جميع الصور. يرجى المحاولة مرة أخرى.');
      } else if (errors.length > 0) {
        setError(`تم معالجة ${products.length} من ${images.length} صورة. بعض الصور فشلت: ${errors.join(', ')}`);
      } else {
        setError(null);
      }

    } catch (err) {
      console.error('خطأ عام في توليد المحتوى:', err);
      setError(`خطأ في توليد المحتوى: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`);
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
    if (!generatedContents) return;
    
    const dataStr = JSON.stringify(generatedContents, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `multiple-products-marketing-content.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const sendToWebhook = async () => {
    if (!generatedContents || !webhookUrl.trim()) {
      setError('يرجى إدخال رابط webhook صحيح');
      return;
    }

    setIsSendingToWebhook(true);
    setError(null);

    try {
      // إنشاء FormData لإرسال جميع المنتجات
      const formData = new FormData();
      
      // إنشاء محتوى JSON شامل لجميع المنتجات
      const allProductsData = {
        ...generatedContents,
        metadata: {
          totalImages: images.length,
          generatedAt: new Date().toISOString(),
          apiMode: 'direct (Gemini API)',
          descriptionSentences: descriptionSentences,
          featuresCount: featuresCount,
          hashtagsCount: hashtagsCount,
          imageInfo: images.map(image => ({
            fileName: image.file.name,
            mimeType: image.file.type,
            fileSize: image.file.size,
            sizeFormatted: `${(image.file.size / 1024 / 1024).toFixed(2)} MB`
          }))
        }
      };
      
      const contentBlob = new Blob([JSON.stringify(allProductsData, null, 2)], {
        type: 'application/json'
      });
      formData.append('all-products-marketing-content.json', contentBlob, 'all-products-marketing-content.json');
      
      // إضافة جميع الصور الأصلية كملفات
      images.forEach((image, index) => {
        formData.append(`image_${index + 1}`, image.file, image.file.name);
      });

      const response = await fetch(webhookUrl, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`خطأ في الإرسال: ${response.status}`);
      }

      alert(`تم إرسال ${generatedContents.products.length} منتج بنجاح إلى Webhook!`);
    } catch (err) {
      setError(`خطأ في إرسال البيانات: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`);
    } finally {
      setIsSendingToWebhook(false);
    }
  };

  const renderProductCard = (productData: ProductMarketing) => {
    const { imageIndex, imageName, product } = productData;
    
    return (
      <div key={imageIndex} className="bg-gray-800 rounded-lg p-6 mb-6">
        <div className="flex items-center mb-4">
          <img 
            src={images[imageIndex].preview} 
            alt={`صورة ${imageIndex + 1}`}
            className="w-16 h-16 object-cover rounded-lg ml-4"
          />
          <div>
            <h2 className="text-xl font-bold">{product.productName}</h2>
            <p className="text-gray-400 text-sm">الصورة {imageIndex + 1}: {imageName}</p>
          </div>
        </div>

        {/* النسخ التسويقي */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold">النسخ التسويقي</h3>
            <button
              onClick={() => copyToClipboard(product.marketingCopy, `marketingCopy_${imageIndex}`)}
              className="flex items-center px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
            >
              {copiedField === `marketingCopy_${imageIndex}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4 ml-1" />}
              نسخ
            </button>
          </div>
          <p className="text-gray-300 leading-relaxed">{product.marketingCopy}</p>
        </div>

        {/* الوصف التفصيلي */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold">الوصف التفصيلي الشامل</h3>
            <button
              onClick={() => copyToClipboard(product.productDescription, `productDescription_${imageIndex}`)}
              className="flex items-center px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
            >
              {copiedField === `productDescription_${imageIndex}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4 ml-1" />}
              نسخ
            </button>
          </div>
          <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{product.productDescription}</p>
        </div>

        {/* الميزات الرئيسية */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold">الميزات الرئيسية</h3>
            <button
              onClick={() => copyToClipboard(product.keyFeatures.join('\n'), `keyFeatures_${imageIndex}`)}
              className="flex items-center px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
            >
              {copiedField === `keyFeatures_${imageIndex}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4 ml-1" />}
              نسخ
            </button>
          </div>
          <ul className="space-y-1">
            {product.keyFeatures.map((feature, index) => (
              <li key={index} className="text-gray-300 flex items-start">
                <span className="text-blue-400 ml-2">•</span>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/* الهاشتاغات */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold">الهاشتاغات</h3>
            <button
              onClick={() => copyToClipboard(product.hashtags.join(' '), `hashtags_${imageIndex}`)}
              className="flex items-center px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
            >
              {copiedField === `hashtags_${imageIndex}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4 ml-1" />}
              نسخ
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {product.hashtags.map((hashtag, index) => (
              <span key={index} className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-full text-sm transition-colors">
                {hashtag}
              </span>
            ))}
          </div>
        </div>

        {/* موجه الصورة */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold">موجه إنشاء الصورة</h3>
            <button
              onClick={() => copyToClipboard(product.imagePrompt, `imagePrompt_${imageIndex}`)}
              className="flex items-center px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
            >
              {copiedField === `imagePrompt_${imageIndex}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4 ml-1" />}
              نسخ
            </button>
          </div>
          <pre className="bg-gray-900 p-3 rounded border border-gray-600 text-sm text-gray-300 whitespace-pre-wrap font-mono">
            {product.imagePrompt}
          </pre>
        </div>
      </div>
    );
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
            قم برفع صور منتجاتك المختلفة ودع الذكاء الاصطناعي ينشئ محتوى تسويقي منفصل لكل منتج
          </p>
          
          {/* شارة الوضع */}
          <div className="mt-4 inline-flex items-center px-4 py-2 bg-gray-800 rounded-full text-sm">
            <span className="text-gray-400">الوضع:</span>
            <span className={`mr-2 font-semibold ${hasGeminiKey ? 'text-green-400' : 'text-red-400'}`}>
              {hasGeminiKey ? '✓ Gemini API مباشر' : '✗ غير مُعد'}
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
              <h3 className="text-lg font-semibold mb-3">
                الصور المختارة: {images.length}
              </h3>
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
                    <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 px-2 py-1 rounded text-xs">
                      {image.file.name.length > 10 ? image.file.name.substring(0, 10) + '...' : image.file.name}
                    </div>
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
              <label className="block text-sm text-gray-300 mb-1">عدد جمل الوصف (1-10)</label>
              <input type="number" min={1} max={10} value={descriptionSentences}
                onChange={(e) => setDescriptionSentences(Math.max(1, Math.min(10, Number(e.target.value))))}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            </div>
          </div>
        </div>

        {/* زر توليد المحتوى */}
        <div className="text-center mb-8">
          <button
            onClick={generateContent}
            disabled={images.length === 0 || isGenerating || !hasGeminiKey}
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed px-8 py-3 rounded-lg font-semibold transition-all flex items-center mx-auto"
          >
            {isGenerating ? (
              <>
                <Loader2 className="animate-spin ml-2 h-5 w-5" />
                جاري معالجة الصور... ({generatedContents?.processedImages || 0}/{images.length})
              </>
            ) : (
              `أنشئ المحتوى للمنتجات (${images.length} صور)`
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
        {generatedContents && (
          <div className="space-y-6">
            {/* ملخص النتائج */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-2xl font-bold mb-4 text-center">
                نتائج معالجة المنتجات
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div className="bg-gray-700 rounded p-4">
                  <div className="text-2xl font-bold text-green-400">{generatedContents.products.length}</div>
                  <div className="text-sm text-gray-300">منتج تم معالجته بنجاح</div>
                </div>
                <div className="bg-gray-700 rounded p-4">
                  <div className="text-2xl font-bold text-blue-400">{generatedContents.totalProducts}</div>
                  <div className="text-sm text-gray-300">إجمالي المنتجات</div>
                </div>
                <div className="bg-gray-700 rounded p-4">
                  <div className="text-2xl font-bold text-red-400">{generatedContents.skippedImages}</div>
                  <div className="text-sm text-gray-300">منتجات فشلت</div>
                </div>
              </div>
            </div>

            {/* عرض جميع المنتجات */}
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-center">جميع المنتجات المُولدة</h3>
              {generatedContents.products.map(renderProductCard)}
            </div>

            {/* أزرار التصدير والإرسال */}
            <div className="flex flex-wrap gap-4 justify-center mt-8">
              <button
                onClick={exportToJSON}
                className="flex items-center bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                <Download className="h-5 w-5 ml-2" />
                تصدير جميع المنتجات إلى JSON
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
                  disabled={!webhookUrl.trim() || isSendingToWebhook || generatedContents.products.length === 0}
                  className="flex items-center bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-semibold transition-colors"
                >
                  {isSendingToWebhook ? (
                    <Loader2 className="animate-spin h-5 w-5 ml-2" />
                  ) : (
                    <Send className="h-5 w-5 ml-2" />
                  )}
                  إرسال جميع المنتجات ({generatedContents.products.length}) للـ Webhook
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
