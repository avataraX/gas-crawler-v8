// === GAS CRAWLER V8 – CRAWL SEMUA ARTIKEL + JUDUL (100/HALAMAN) ===
// BISA BLOGGER, WORDPRESS, CUSTOM DOMAIN
// FIX: URL, PAGINASI, DUPLIKAT, ERROR

function doGet(e) { return doPost(e); }

function doPost(e) {
  try {
    let baseUrl = e.parameter.url || (e.postData ? JSON.parse(e.postData.contents).url : null);
    if (!baseUrl) {
      return jsonResponse({ error: 'URL required' });
    }

    // Normalisasi URL
    baseUrl = baseUrl.replace(/\/+$/, '').split('?')[0].split('#')[0];
    if (!baseUrl.match(/^https?:\/\//i)) baseUrl = 'https://' + baseUrl;

    const articles = [];
    let nextUrl = baseUrl + '?max-results=100'; // PAKSA 100/HALAMAN
    let pageCount = 0;
    const maxPages = 500;

    // === FUNGSI resolveUrl (gantikan new URL) ===
    function resolveUrl(relative, base) {
      if (!relative) return '';
      if (relative.match(/^https?:\/\//i)) return relative;
      if (relative.startsWith('//')) return 'https:' + relative;
      const parts = base.split('/');
      const domain = parts[0] + '//' + parts[2];
      if (relative.startsWith('/')) return domain + relative;
      const basePath = base.substring(0, base.lastIndexOf('/') + 1);
      return basePath + relative;
    }

    while (nextUrl && pageCount < maxPages) {
      pageCount++;
      const response = UrlFetchApp.fetch(nextUrl, {
        muteHttpExceptions: true,
        followRedirects: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
        timeout: 30000
      });

      const html = response.getContentText();
      const responseCode = response.getResponseCode();
      let currentUrl = nextUrl;
      const location = response.getHeaders()['Location'];
      if (location && responseCode >= 300 && responseCode < 400) {
        currentUrl = resolveUrl(location, nextUrl);
      }

      let found = false;

      // === 1. Blogger: post-title ===
      const bloggerRegex = /<h[1-3][^>]*class=["'][^"']*post-title[^"']*["'][^>]*>\s*<a [^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi;
      let match;
      while ((match = bloggerRegex.exec(html)) !== null) {
        found = true;
        let url = resolveUrl(match[1], currentUrl);
        let title = match[2].replace(/<[^>]*>/g, '').trim();
        if (url.includes('/20') && url.endsWith('.html') && title) {
          articles.push({ url, title });
        }
      }

      // === 2. WordPress / Entry Title ===
      if (!found) {
        const wpRegex = /<h[1-6][^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>\s*<a [^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi;
        while ((match = wpRegex.exec(html)) !== null) {
          found = true;
          let url = resolveUrl(match[1], currentUrl);
          let title = match[2].replace(/<[^>]*>/g, '').trim();
          if (title && url) articles.push({ url, title });
        }
      }

      // === 3. Fallback ===
      if (!found) {
        const fallbackRegex = /<a [^>]*href=["']([^"']*)["'][^>]*>([^<]{10,200})<\/a>/gi;
        while ((match = fallbackRegex.exec(html)) !== null) {
          let url = resolveUrl(match[1], currentUrl);
          let title = match[2].replace(/<[^>]*>/g, '').trim();
          if (url.includes('/20') && (url.endsWith('.html') || url.includes('/post/')) && title.length > 10) {
            articles.push({ url, title });
          }
        }
      }

      // === CARI HALAMAN SELANJUTNYA ===
      let olderLink = null;

      // 1. Older Posts
      const olderRegex = /<a[^>]+class=["'][^"']*older[^"']*["'][^>]+href=["']([^"']+)["']/i;
      const olderMatch = html.match(olderRegex);
      if (olderMatch) {
        olderLink = olderMatch[1].replace(/max-results=\d+/, 'max-results=100');
      } else {
        // 2. ?updated-max atau ?max-results
        const urlRegex = /href=["']([^"']*\?(updated-max|max-results)=[^"']*)["']/i;
        const urlMatch = html.match(urlRegex);
        if (urlMatch) {
          olderLink = urlMatch[1].replace(/max-results=\d+/, 'max-results=100');
        }
      }

      nextUrl = olderLink ? resolveUrl(olderLink, currentUrl) : null;

      Utilities.sleep(1000);
    }

    // Hapus duplikat
    const seen = {};
    const unique = articles.filter(a => {
      if (seen[a.url]) return false;
      seen[a.url] = true;
      return true;
    });

    return jsonResponse({
      articles: unique,
      total: unique.length,
      pages: pageCount
    });

  } catch (err) {
    return jsonResponse({ error: err.toString() });
  }
}

// === HELPER: JSON Response ===
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
