import { CapacitorHttp } from '@capacitor/core';

export interface ScrapedBook {
    title: string;
    coverUrl: string;
    author?: string;
}

const LRTS_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,zh-TW;q=0.7",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Pragma": "no-cache",
    "Referer": "https://www.lrts.me/",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36",
    "sec-ch-ua": "\"Not:A-Brand\";v=\"99\", \"Google Chrome\";v=\"145\", \"Chromium\";v=\"145\"",
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": "\"Android\"",
    "Cookie": "Hm_lvt_ada61571fd48bb3f905f5fd1d6ef0ec4=1771577159; HMACCOUNT=548C89D2114F41AC; uid=1771577161965230ea79b9aa14fe7acc72ce97bcd0523; Hm_lpvt_ada61571fd48bb3f905f5fd1d6ef0ec4=1771577163"
};

export async function scrapeBookCovers(keyword: string): Promise<ScrapedBook[]> {
    try {
        const url = `https://www.lrts.me/search/book/${encodeURIComponent(keyword)}`;
        const res = await CapacitorHttp.get({
            url,
            headers: LRTS_HEADERS
        });

        const html = res.data;
        if (!html || typeof html !== 'string') return [];

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const items = doc.querySelectorAll('.book-item');
        const results: ScrapedBook[] = [];

        items.forEach(item => {
            const img = item.querySelector('img');
            const authorEl = item.querySelector('.author');

            if (img) {
                let src = img.getAttribute('original') || img.src || img.getAttribute('src');
                if (!src) return;

                let absoluteSrc = src;
                if (src.startsWith('//')) absoluteSrc = `https:${src}`;
                else if (src.startsWith('/')) absoluteSrc = `https://www.lrts.me${src}`;

                results.push({
                    title: img.alt || item.textContent?.trim()?.split('\n')[0] || '未知书名',
                    coverUrl: absoluteSrc,
                    author: authorEl ? authorEl.textContent?.trim() : undefined
                });
            }
        });

        // Deduplicate by URL
        const unique = new Map<string, ScrapedBook>();
        results.forEach(r => {
            if (!unique.has(r.coverUrl)) unique.set(r.coverUrl, r);
        });

        return Array.from(unique.values()).slice(0, 12);
    } catch (err) {
        console.error('Failed to scrape book covers', err);
        return [];
    }
}

export async function fetchImageAsBase64(url: string): Promise<string> {
    const res = await CapacitorHttp.get({
        url,
        headers: { ...LRTS_HEADERS, "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" },
        responseType: 'blob'
    });

    if (res.data) {
        // If Capacitor gives back a raw base64 string
        if (typeof res.data === 'string') {
            if (res.data.startsWith('data:image')) return res.data;
            return `data:image/jpeg;base64,${res.data}`;
        }
    }
    throw new Error('Image fetch failed or invalid format');
}
