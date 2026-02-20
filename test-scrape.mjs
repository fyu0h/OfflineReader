import fetch from 'node-fetch';

async function testFetch() {
    const url = "https://www.lrts.me/search/book/%E4%BA%91%E9%A1%B6%E5%A4%A9%E5%AE%AB";
    const res = await fetch(url, {
        headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Cookie": "Hm_lvt_ada61571fd48bb3f905f5fd1d6ef0ec4=1771577159; HMACCOUNT=548C89D2114F41AC"
        }
    });
    const html = await res.text();
    console.log(html.substring(0, 1000));

    // Try matching images in search results
    const matches = [...html.matchAll(/<div class="book-item">[\s\S]*?<img.*?src="(.*?)".*?alt="(.*?)".*?<\/div>/g)];
    if (matches.length > 0) {
        console.log("Found matches using first regex:", matches.length);
        matches.forEach(m => console.log(m[2], m[1]));
    } else {
        const altMatches = [...html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']+)["'][^>]*>/gi)];
        console.log("Found raw imgs:", altMatches.length);
        altMatches.slice(0, 5).forEach(m => console.log(m[2], m[1]));
    }
}

testFetch();
