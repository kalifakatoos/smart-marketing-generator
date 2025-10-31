// Supabase Edge Function لـ تحليل الصور وتوليد المحتوى التسويقي
// هذا الملف يحل المشكلة الأمنية بإدارة API key بأمان

Deno.serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'false'
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        // استخراج البيانات من الطلب
        const { images, config } = await req.json();

        if (!images || !Array.isArray(images) || images.length === 0) {
            throw new Error('يجب تقديم صور واحدة على الأقل');
        }

        // الحصول على Gemini API key من متغيرات البيئة الآمنة
        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
        
        if (!GEMINI_API_KEY) {
            throw new Error('Gemini API key غير متوفر في إعدادات الخادم');
        }

        // تجهيز البيانات للإرسال إلى Gemini
        const imageParts = images.map(image => ({
            inlineData: {
                mimeType: image.mimeType,
                data: image.base64Data || image.base64
            }
        }));

        const fc = Math.max(1, Math.min(6, Number(config?.featuresCount ?? 3)));
        const hc = Math.max(1, Math.min(8, Number(config?.hashtagsCount ?? 4)));
        const dc = Math.max(1, Math.min(6, Number(config?.descriptionSentences ?? 3)));

        const prompt = `
حلّل هذه الصور وأنشئ JSON موجز باللغة العربية:

1. productName: اسم جذاب ومختصر
2. marketingCopy: جملتين قصيرتين للتسويق
3. productDescription: ${dc} ${dc === 1 ? 'جملة' : 'جمل'} وصفية مختصرة
4. keyFeatures: ${fc} ميزات رئيسية قصيرة
5. hashtags: ${hc} هاشتاقات مناسبة
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

        // إرسال الطلب إلى Gemini API من الخادم (آمن)
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`خطأ في الاتصال مع Gemini API: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            throw new Error('استجابة غير صحيحة من Gemini API');
        }

        const candidate = data.candidates[0];
        const parts = candidate.content?.parts || [];
        const textPart = parts.find((p: any) => typeof p?.text === 'string' && p.text.trim().length > 0);
        let generatedText = textPart?.text || '';
        if (!generatedText) {
            const joined = parts.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('\n');
            const s = joined.indexOf('{');
            const e = joined.lastIndexOf('}');
            if (s !== -1 && e !== -1 && e > s) {
                generatedText = joined.slice(s, e + 1);
            }
        }
        
        // تنظيف الاستجابة من أي نصوص إضافية قد تضاف حول JSON
        let cleanText = generatedText.trim();
        if (cleanText.startsWith('```json')) {
            cleanText = cleanText.replace(/^```json\s*/, '');
        }
        if (cleanText.endsWith('```')) {
            cleanText = cleanText.replace(/\s*```$/, '');
        }

        let parsedContent;
        try {
            parsedContent = JSON.parse(cleanText);
        } catch (err1) {
            const s = cleanText.indexOf('{');
            const e = cleanText.lastIndexOf('}');
            if (s !== -1 && e !== -1 && e > s) {
                const slice = cleanText.slice(s, e + 1);
                parsedContent = JSON.parse(slice);
            } else {
                throw err1;
            }
        }
        
        // إرجاع البيانات بتنسيق منظم
        const result = {
            data: {
                success: true,
                content: parsedContent,
                timestamp: new Date().toISOString(),
                processing_info: {
                    images_count: images.length,
                    model_used: 'gemini-1.5-flash'
                }
            }
        };

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('خطأ في معالجة الصور:', error);

        const errorResponse = {
            error: {
                code: 'IMAGE_PROCESSING_FAILED',
                message: error.message,
                timestamp: new Date().toISOString()
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
