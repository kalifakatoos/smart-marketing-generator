// Supabase Edge Function لإرسال البيانات إلى Webhook بأمان

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
        const { webhookUrl, content, images } = await req.json();

        if (!webhookUrl || !content) {
            throw new Error('Webhook URL والمحتوى مطلوبان');
        }

        // التحقق من صحة URL
        try {
            new URL(webhookUrl);
        } catch (e) {
            throw new Error('URL غير صالح');
        }

        // تجهيز البيانات للإرسال
        const payload = {
            content: content,
            images: images || [],
            timestamp: new Date().toISOString(),
            source: 'smart-marketing-generator',
            version: '1.0.0'
        };

        // إرسال البيانات إلى webhook
        const webhookResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'SmartMarketingGenerator/1.0.0'
            },
            body: JSON.stringify(payload)
        });

        if (!webhookResponse.ok) {
            const errorText = await webhookResponse.text();
            throw new Error(`خطأ في webhook: ${webhookResponse.status} ${webhookResponse.statusText} - ${errorText}`);
        }

        const responseData = await webhookResponse.text();
        let parsedResponse = responseData;
        try {
            parsedResponse = JSON.parse(responseData);
        } catch (e) {
            // Response is not JSON, that's okay
        }

        // إرجاع تأكيد نجاح
        const result = {
            data: {
                success: true,
                webhook_url: webhookUrl,
                sent_at: new Date().toISOString(),
                response: {
                    status: webhookResponse.status,
                    data: parsedResponse
                },
                payload_sent: {
                    content_fields: Object.keys(content),
                    images_count: images?.length || 0
                }
            }
        };

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('خطأ في إرسال webhook:', error);

        const errorResponse = {
            error: {
                code: 'WEBHOOK_SEND_FAILED',
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