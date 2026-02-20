import https from 'https';

const url = "https://www.lrts.me/search/book/%E4%BA%91%E9%A1%B6%E5%A4%A9%E5%AE%AB";
const options = {
    headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Cookie": "Hm_lvt_ada61571fd48bb3f905f5fd1d6ef0ec4=1771577159; HMACCOUNT=548C89D2114F41AC"
    }
};

https.get(url, options, (res) => {
    let html = '';
    res.on('data', chunk => html += chunk);
    res.on('end', () => {
        const matches = [...html.matchAll(/<li[^>]*class="[^"]*book-item[^"]*"[^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']+)["']/gi)];
        if (matches.length > 0) {
            console.log("Found matches using book-item regex:");
            matches.slice(0, 5).forEach(m => console.log(m[2], m[1]));
        } else {
            const altMatches = [...html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']+)["'][^>]*>/gi)];
            console.log("Fallback raw img matches:", altMatches.length);
            altMatches.slice(0, 10).forEach(m => console.log(m[2], m[1]));
        }
    });
}).on('error', e => console.error(e));
