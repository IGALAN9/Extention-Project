/**
 * Fungsi mandiri yang disuntikkan langsung ke tab aktif untuk mode Auto.
 * Tidak boleh memakai closure karena browser menserialisasi fungsi ini ke halaman.
 */
function extractArticleFromActivePage() {
  const removeNoise = (text: string) => text
    // Dateline Kompas muncul langsung di paragraf pertama, terpisah dari
    // variabel keywordBrandSafety yang berada di dalam <script>.
    .replace(/^\s*[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý\s.'’-]{1,60},\s*KOMPAS\.com\s*(?:[–—-]|&ndash;)?\s*/i, '')
    .replace(/ADVERTISEMENT/gi, '')
    .replace(/Scroll ke bawah untuk melanjutkan membaca/gi, '')
    .replace(/SCROLL TO CONTINUE(?: WITH CONTENT)?/gi, '')
    .replace(/GULIR UNTUK LANJUT BACA/gi, '')
    .replace(/\bIklan\b|\bBaca Juga\b|\bBagikan\b|\bDengarkan artikel\b/gi, '')
    .replace(/\bLihat selengkapnya\b|\bSee more\b|\bSee less\b|\bShow more\b|\bShow less\b|\bTampilkan lebih sedikit\b/gi, '')
    // Metadata copy-paste BBC/Liputan6, bukan bagian isi berita.
    .replace(/Sumber gambar,.*?(?=Telah diterbitkan\s+\d{1,2}\s+[A-Za-z]+\s+\d{4})/gi, '')
    .replace(/(?:Penulis|Peranan),.*?(?=(?:Penulis|Peranan|Telah diterbitkan)\s*,?)/gi, '')
    .replace(/Telah diterbitkan\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}/gi, '')
    .replace(/\b(?:Diterbitkan|Diperbarui|Published)\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}(?:,?\s+\d{1,2}:\d{2}\s+WIB)?/gi, '')
    .replace(/\bOleh\s+(?:Liputan6(?:\.com)?|BBC(?:\s+News)?)/gi, '')
    // Metadata dan ajakan kanal SINDOnews, bukan isi berita.
    .replace(/\b(?:Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu),?\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*-\s*\d{1,2}:\d{2}\s+WIB/gi, '')
    .replace(/\bviews?\s*:\s*\d+[\s\S]*?\bFoto\s*\/[^.\n]*\bA\s+A\s+A\b/gi, '')
    .replace(/\bFoto\s*\/[^.\n]*(?:\bA\s+A\s+A\b)?/gi, '')
    .replace(/\bA\s+A\s+A\b/g, '')
    .replace(/Halaman\s*:\s*Lihat\s+Juga\s*:\s*Follow\s+WhatsApp\s+Channel\s+SINDOnews[^.!?]*/gi, '')
    .replace(/Missing context\. Reviewed by third-party fact-checkers\.?/gi, '')
    .replace(/\bSee why\b/gi, '')
    .replace(/Scan the QR code and confirm that the codes match to log in\.?/gi, '')
    .replace(/See more on Facebook/gi, '')
    .replace(/This post is missing context according to third-party fact-checkers\.?/gi, '')
    .replace(/Third-party fact-check/gi, '')
    .replace(/^Thread[\d.,KMB]+\s*views.*?\d{4}/i, '')
    .replace(/\bTranslate\b/gi, '')
    .replace(/\[Gambas:[^\]]+\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const trimLead = (text: string) => {
    const markers = ['VIVA -', 'Jakarta -', 'JAKARTA, KOMPAS.com', 'Jakarta, CNN Indonesia', 'Jakarta (ANTARA)', 'Suara.com -', 'Liputan6.com, Jakarta', 'TRIBUNNEWS.COM'];
    for (const marker of markers) {
      const index = text.indexOf(marker);
      if (index > 0 && index < 300) return text.slice(index);
    }
    return text;
  };
  /** Hapus dateline/redaksi pada awal artikel, bukan isi beritanya. */
  const stripNewsDateline = (text: string) => text
    // Contoh: "TOKYO, KOMPAS.com –" dan "Jakarta, CNN Indonesia --".
    .replace(
      /^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÿ.'\s-]{1,45},\s*(?:KOMPAS\.com|CNN Indonesia|ANTARA(?: News)?|TRIBUNNEWS\.COM|VIVA(?:\.co\.id)?|Suara\.com|SINDOnews|TVRInews)\s*(?:--|[-–—])\s*/i,
      '',
    )
    // Contoh: "Liputan6.com, Bandung -" atau nama media diikuti kota.
    .replace(
      /^(?:Liputan6\.com|KOMPAS\.com|CNN Indonesia|detikcom|ANTARA(?: News)?|TRIBUNNEWS\.COM|VIVA(?:\.co\.id)?|Suara\.com|SINDOnews|TVRInews)(?:,\s*[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÿ.'\s-]{1,45})?\s*(?:--|[-–—])\s*/i,
      '',
    )
    // Contoh: "Jakarta (ANTARA) -".
    .replace(/^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÿ.'\s-]{1,45}\s+\((?:ANTARA|Reuters|AFP|AP)\)\s*(?:--|[-–—])\s*/i, '')
    // Kode reporter/redaktur seperti (thr/isn) atau (naf/naf).
    .replace(/\s*\([a-z]{2,5}(?:\/[a-z]{2,5})+\)\s*$/, '')
    .trim();
  const isInstagram = /(^|\.)instagram\.com$/i.test(location.hostname);
  const isTwitter = /(^|\.)(x|twitter)\.com$/i.test(location.hostname);
  const isFacebook = /(^|\.)facebook\.com$/i.test(location.hostname);
  const isThreads = /(^|\.)(threads\.net|threads\.com)$/i.test(location.hostname);
  const isReddit = /(^|\.)reddit\.com$/i.test(location.hostname);
  const isTurnbackhoax = /(^|\.)turnbackhoax\.id$/i.test(location.hostname);
  const isLiputan6 = /(^|\.)liputan6\.com$/i.test(location.hostname);
  const mostVisible = <T extends Element>(nodes: T[]) => nodes
    .map((node) => {
      const rect = node.getBoundingClientRect();
      const visibleTop = Math.max(rect.top, 0);
      const visibleBottom = Math.min(rect.bottom, window.innerHeight);
      const visibleArea = Math.max(0, visibleBottom - visibleTop) * Math.max(0, rect.width);
      return { node, visibleArea };
    })
    .filter(({ visibleArea }) => visibleArea > 0)
    .sort((a, b) => b.visibleArea - a.visibleArea)[0]?.node;
  const isTrustedNewsSite = [
    'detik.com', 'detik.net', 'liputan6.com', 'cnnindonesia.com',
    'kompas.com', 'tempo.co', 'antaranews.com', 'tirto.id', 'kumparan.com',
  ].some((domain) => location.hostname === domain || location.hostname.endsWith(`.${domain}`));
  /**
   * Cari container isi artikel secara universal. Selector semantik yang paling
   * spesifik diprioritaskan; jika tidak tersedia, pilih article/main dengan
   * kepadatan paragraf tinggi dan kepadatan link rendah.
   */
  const findArticleRoot = () => {
    const preferredSelectors = [
      '#article-content-body', '[itemprop="articleBody"]', '[data-testid="article-body"]',
      '[data-component="article-body"]', '[data-component-name*="article-content"]',
      '.detail__body-text', '.article-content', '.article-body', '.article__body',
      '.article__content', '.entry-content', '.post-content', '.story-body',
      '.story__body', '.news-content', '.read__content-body', '.read__content',
      '.itp_bodycontent', '[class*="bodycontent"]',
      '[class*="article-content"]', '[class*="article_body"]', '[class*="article-body"]',
    ];
    const paragraphLength = (node: Element) => Array.from(node.querySelectorAll('p'))
      .reduce((total, paragraph) => total + (paragraph.textContent?.trim().length ?? 0), 0);

    for (const selector of preferredSelectors) {
      const candidate = Array.from(document.querySelectorAll(selector))
        .map((node) => ({ node, length: paragraphLength(node) }))
        .filter(({ length }) => length >= 150)
        .sort((a, b) => b.length - a.length)[0]?.node;
      if (candidate) return candidate;
    }

    return Array.from(document.querySelectorAll('article, main, [role="main"]'))
      .map((node) => {
        const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        const paragraphs = node.querySelectorAll('p');
        const paragraphChars = paragraphLength(node);
        const linkChars = Array.from(node.querySelectorAll('a'))
          .reduce((total, link) => total + (link.textContent?.trim().length ?? 0), 0);
        const identity = `${node.id} ${node.className}`;
        const semanticBonus = node.tagName === 'ARTICLE' || /article|story|content|detail|post/i.test(identity) ? 1500 : 0;
        const noisePenalty = /related|recommend|comment|sidebar|footer|header|menu|popular|terpopuler|latest/i.test(identity) ? 4000 : 0;
        const linkDensity = text.length ? Math.min(linkChars / text.length, 0.95) : 1;
        const score = paragraphChars * (1 - linkDensity) + paragraphs.length * 80 + semanticBonus - noisePenalty;
        return { node, score, paragraphChars };
      })
      .filter(({ paragraphChars }) => paragraphChars >= 150)
      .sort((a, b) => b.score - a.score)[0]?.node ?? document.body;
  };
  const extractInstagramCaption = () => {
    const article = mostVisible(Array.from(document.querySelectorAll('article'))) || document.querySelector('article');
    const candidates = article
      ? Array.from(article.querySelectorAll('span[dir="auto"], div[dir="auto"], h1'))
          .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
          .filter((text) => text.length >= 25)
          .filter((text) => !/^(View all|Lihat semua|Follow|Following|Balas|Reply|Like|Suka|Translate|Terjemahkan|See translation)/i.test(text))
      : [];
    // Caption biasanya merupakan blok teks terpanjang di dalam article, sedangkan
    // username, tombol, dan komentar hanya berupa teks pendek.
    const caption = candidates.sort((a, b) => b.length - a.length)[0];
    if (caption) return caption;

    // Fallback untuk layout Instagram yang belum merender article secara lengkap.
    const description = document.querySelector('meta[property="og:description"]')?.getAttribute('content') ?? '';
    const colonIndex = description.indexOf(':');
    return colonIndex >= 0 ? description.slice(colonIndex + 1).trim() : description.trim();
  };
  const extractTwitterCaption = () => {
    // X menandai isi post dengan data-testid ini. Ambil post pertama saja,
    // karena tweetText berikutnya biasanya adalah reply/komentar.
    const selectedTweet = mostVisible(Array.from(document.querySelectorAll('article[data-testid="tweet"]')));
    const tweetNodes = Array.from((selectedTweet || document).querySelectorAll(
      '[data-testid="tweetText"]',
    ));
    // Community Post pada beberapa layout hanya memberi dir="auto" tanpa tweetText.
    const fallbackNodes = tweetNodes.length
      ? tweetNodes
      : Array.from((selectedTweet || document).querySelectorAll('div[dir="auto"], span[dir="auto"]'));
    const candidates = fallbackNodes
      .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter((text) => text.length >= 20)
      .filter((text) => !/^(Replying to|Log in|Sign up|Translate|Show more|Show less)/i.test(text));
    return candidates[0] ?? '';
  };
  const extractFacebookCaption = () => {
    // Jangan menganggap dialog login/QR Facebook sebagai caption post.
    if (/Scan the QR code and confirm that the codes match to log in/i.test(document.body.textContent ?? '')) {
      return '';
    }

    // Tutup panel fact-checker Facebook yang menutupi caption Reels.
    const overlayCandidates = Array.from(document.querySelectorAll('[role="dialog"], div'))
      .filter((node) => {
        const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        return /Missing context\. Reviewed by third-party fact-checkers/i.test(text) && text.length < 800;
      })
      .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0));
    const overlay = overlayCandidates[0];
    if (overlay) {
      const closeButton = overlay.querySelector('[aria-label="Close"], [aria-label="Tutup"], button');
      if (closeButton instanceof HTMLElement) closeButton.click();
      else overlay.remove();
    }

    // Caption post Facebook biasanya berada di container ini, termasuk post video.
    const messageRoots = Array.from(document.querySelectorAll(
      '[data-ad-comet-preview="message"], [data-testid="post_message"]',
    ));
    // Feed Facebook mempertahankan post lama di DOM saat pengguna scroll.
    // Pilih caption dengan area paling besar di viewport, bukan elemen pertama.
    const visibleMessageRoots = messageRoots
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const visibleTop = Math.max(rect.top, 0);
        const visibleBottom = Math.min(rect.bottom, window.innerHeight);
        const visibleArea = Math.max(0, visibleBottom - visibleTop) * Math.max(0, rect.width);
        return { node, visibleArea };
      })
      .filter(({ visibleArea }) => visibleArea > 0)
      .sort((a, b) => b.visibleArea - a.visibleArea);
    const messageRoot = visibleMessageRoots[0]?.node ?? messageRoots[0];
    if (messageRoot) {
      const text = messageRoot.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (text) return text;
    }

    // Fallback untuk Feed/Reels: caption dapat berada langsung di overlay
    // tanpa wrapper article, seperti div dir="auto" pada Facebook Reels.
    const post = document.querySelector('[role="article"], article');
    const scope = post || document;
    const candidates = Array.from(scope.querySelectorAll('div[dir="auto"], span[dir="auto"]'))
          .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
          .filter((text) => text.length >= 20)
          .filter((text) => !/Missing context|third-party fact-checkers|See why/i.test(text))
          .filter((text) => !/^(Like|Suka|Comment|Komentar|Share|Bagikan|Follow|Ikuti|See more|See less|Lihat selengkapnya)$/i.test(text));
    return candidates.sort((a, b) => b.length - a.length)[0] ?? '';
  };
  const extractThreadsCaption = () => {
    const post = mostVisible(Array.from(document.querySelectorAll('[role="article"], article')))
      || document.querySelector('[role="article"], article');
    const scope = post || document;
    const candidates = Array.from(scope.querySelectorAll('div[dir="auto"], span[dir="auto"]'))
      .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter((text) => text.length >= 20)
      .filter((text) => !/^(Translate|Follow|Following|Reply|Like|Repost|Share|See translation|Log in|Sign up)/i.test(text))
      .filter((text) => !/third-party fact-check|missing context/i.test(text));
    // Pada halaman Thread, caption muncul lebih dulu sebelum daftar komentar.
    return candidates[0] ?? '';
  };
  const extractTurnbackhoaxQuotes = () => {
    const quoteBlocks = Array.from(document.querySelectorAll('.quoted, blockquote'));
    const quotes: string[] = [];
    for (const block of quoteBlocks) {
      const text = block.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const matches = text.matchAll(/[“"]([^”"]+)[”"]/g);
      for (const match of matches) {
        const quote = match[1].trim();
        if (quote.length >= 20 && !quotes.includes(quote)) quotes.push(quote);
      }
    }
    return quotes.join('\n\n');
  };
  const steps = [{
    key: 'visit_url', label: `Membaca ${location.hostname.replace(/^www\./, '')}`, status: 'success',
  }];
  const title = document.querySelector('meta[property="og:title"]')?.getAttribute('content')
    || document.querySelector('h1')?.textContent?.trim() || document.title.trim() || null;
  steps.push({ key: 'extract_title', label: title ? 'Judul artikel berhasil ditemukan' : 'Judul artikel tidak ditemukan', status: title ? 'success' : 'warning' });

  let rawText: string;
  if (isInstagram) {
    rawText = extractInstagramCaption();
    if (rawText) steps.push({ key: 'extract_content', label: 'Caption Instagram berhasil ditemukan', status: 'success' });
  } else if (isTwitter) {
    rawText = extractTwitterCaption();
    if (rawText) steps.push({ key: 'extract_content', label: 'Caption X berhasil ditemukan', status: 'success' });
  } else if (isFacebook) {
    rawText = extractFacebookCaption();
    if (rawText) steps.push({ key: 'extract_content', label: 'Caption Facebook berhasil ditemukan', status: 'success' });
  } else if (isThreads) {
    rawText = extractThreadsCaption();
    if (rawText) steps.push({ key: 'extract_content', label: 'Caption Threads berhasil ditemukan', status: 'success' });
  } else if (isTurnbackhoax) {
    rawText = extractTurnbackhoaxQuotes();
    if (rawText) steps.push({ key: 'extract_content', label: 'Teks dalam quote Turnbackhoax berhasil ditemukan', status: 'success' });
  } else {
    // Prioritaskan container isi artikel agar sidebar, rekomendasi, dan navigasi
    // Kompas tidak ikut terbaca saat fallback ke main.
    const root = isReddit
      ? (mostVisible(Array.from(document.querySelectorAll('article'))) || findArticleRoot())
      : findArticleRoot();
    const safeRoot = root || document.body;
    const clone = safeRoot.cloneNode(true) as HTMLElement;
    const removableSelectors = [
      'script', 'style', 'noscript', 'iframe', 'nav', 'footer', 'header',
      'aside', 'form', 'button', 'svg', '.noncontent', '.non-content',
      '[class*="noncontent"]', '[aria-hidden="true"]',
      // TVRI dan beberapa portal berita menaruh formulir komentar di dalam
      // container artikel, sehingga tidak cukup hanya menghapus elemen <form>.
      '.comment-section', '.comment-form', '.comments', '.comment-area',
      '[class*="comment"]', '[id*="comment"]',
      // Noise yang berada di dalam #article-content-body CNN Indonesia.
      '.topiksisip', '.paradetail', '[class*="paradetail"]', '.ads-slot',
      '[data-target*="detail/embed"]',
      // Noise umum di dalam container artikel berbagai portal berita.
      '[class*="breadcrumb"]', '[class*="share"]', '[class*="social-share"]',
      '[class*="newsletter"]', '[class*="subscription"]', '[class*="sidebar"]',
      '[data-ad-type]', '[data-info="ad"]', '[class*="advertisement"]', '[id^="div-gpt-ad"]',
      '.parallaxindetail', '.staticdetail_container', '.aevp', '[class*="pip-vid"]',
      'social-actions', '[class*="engagement"]', '.detail__body-tag',
      '[class*="article-tag"]', '.linksisip', '.lihatjg', '[data-itp-widget="related"]',
      '.ads-on-body', '.ads-partner-wrap', '[class*="ads-"]', '.kompasidRec',
      'blockquote.twitter-tweet', 'blockquote[class*="twitter"]',
      'blockquote[class*="instagram"]', '[class*="tiktok-embed"]',
    ];
    // Situs berita tepercaya boleh mempertahankan teks link di dalam artikel.
    // Domain lain menghapus <a> agar link Baca Juga tidak ikut dianalisis.
    if (!isTrustedNewsSite) removableSelectors.push('a');
    clone.querySelectorAll(removableSelectors.join(', ')).forEach((node) => node.remove());
    // Bila situs menyediakan penanda akhir artikel, buang semua elemen setelah
    // penanda tersebut. Ini mencegah komentar dan rekomendasi di wrapper yang
    // sama ikut terbaca tanpa membutuhkan selector khusus domain.
    clone.querySelectorAll(
      '.end-of-article, #EndOfArticle, [class*="end-of-article" i], [class*="endofarticle" i], '
      + '[id*="end-of-article" i], [id*="endofarticle" i], [data-end-of-article]',
    ).forEach((marker) => {
      let sibling = marker.nextElementSibling;
      while (sibling) {
        const next = sibling.nextElementSibling;
        sibling.remove();
        sibling = next;
      }
      marker.remove();
    });
    // Detik dan situs berita lain kadang menaruh related link sebagai <strong>
    // tanpa class khusus, misalnya "Lihat juga Video: ...".
    clone.querySelectorAll('strong').forEach((node) => {
      const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (/^(Baca\s+juga|Lihat\s+juga|Tonton\s+juga)\b/i.test(text)) {
        (node.closest('p, div') ?? node).remove();
      }
    });
    // Hapus seluruh kartu/link "Baca Juga" sebelum mengambil teks paragraf.
    const relatedSelectors = [
      '.read_others', '[class*="read_others"]', '[class*="baca-juga"]', '[class*="baca_juga"]',
      '.related-news', '.relateds-slow', '[class*="related-news"]', '[class*="relateds"]',
      '[data-component*="related"]', '.recommendation', '.rekomendasi', '[class*="rekomendasi"]',
      '[data-component-name*="related"]', '[data-component-name*="recommend"]',
      '[class*="read-page--related"]', '[class*="article-tags"]', '[class*="tag-list"]',
      '[class*="topic-list"]', '[class*="latest-news"]',
    ].join(', ');
    clone.querySelectorAll(relatedSelectors).forEach((node) => node.remove());
    // Hapus metadata header SINDOnews yang kadang dibungkus sebagai satu
    // paragraf bersama judul, jumlah views, dan kredit foto.
    clone.querySelectorAll('h1, h2, h3, p, [class*="meta"], [class*="share"], [class*="channel"]').forEach((node) => {
      const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (/\bviews?\s*:\s*\d+\b/i.test(text)
        || (/\bFoto\s*\//i.test(text) && /\bA\s+A\s+A\b/i.test(text))
        || /Halaman\s*:\s*Lihat\s+Juga\s*:/i.test(text)) {
        (node.closest('p, h1, h2, h3') ?? node).remove();
      }
    });
    // Fallback untuk markup komentar tanpa class yang jelas (contoh TVRI:
    // "Komentar (0)", "Tulis Komentar", dan "Belum ada komentar"). Hapus
    // blok terdekat agar teks UI komentar tidak masuk ke isi artikel.
    clone.querySelectorAll('p, h2, h3, h4, div, section').forEach((node) => {
      const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (/^(Komentar\s*\(\d+\)|Tulis Komentar|Belum ada komentar\.?|Berita\s+Lainnya(?:\s+dari)?\b)/i.test(text)) {
        const block = node.closest('section, [class*="comment"], [id*="comment"], form') ?? node;
        // Pada TVRI, judul "Berita Lainnya dari ..." dan kartu-kartunya
        // berada dalam div pembungkus tanpa class khusus. Naik ke container
        // yang memuat beberapa kartu agar seluruh rekomendasi ikut terhapus.
        const recommendation = /Berita\s+Lainnya(?:\s+dari)?\b/i.test(text)
          ? (node.closest('section, ul, [class*="news"], [class*="related"], [class*="recommend"], div') ?? node)
          : block;
        recommendation.remove();
      }
    });
    const paragraphs = Array.from(clone.querySelectorAll('p, h2, h3, li'))
      .map((node) => node.textContent?.trim() ?? '')
      .filter((text) => text.length > 25);
    rawText = paragraphs.length ? paragraphs.join(' ') : (clone.textContent ?? '');
    if (isLiputan6) {
      // Widget lanjutan Liputan6 kadang masih berada di dalam container isi
      // artikel tanpa class stabil. Potong teks pada penanda akhir artikel.
      const tailMarkers = [
        /\bIkuti berita\b/i,
        /\bArtikel Terkait\b/i,
        /\bTopik Terkait\b/i,
        /\bBerita Terkini\b/i,
      ];
      const cutoff = tailMarkers.reduce((earliest, pattern) => {
        const index = rawText.search(pattern);
        return index >= 250 && index < earliest ? index : earliest;
      }, rawText.length);
      rawText = rawText.slice(0, cutoff).trim();
    }
  }
  const content = stripNewsDateline(trimLead(removeNoise(rawText))).slice(0, 10000);
  const minimumLength = isInstagram || isTwitter || isFacebook || isThreads || isReddit || isTurnbackhoax ? 20 : 300;
  if (content.length < minimumLength) {
    const platform = isInstagram ? 'Instagram' : isTwitter ? 'X' : isFacebook ? 'Facebook' : isThreads ? 'Threads' : isReddit ? 'Reddit' : isTurnbackhoax ? 'Turnbackhoax' : '';
    steps.push({ key: 'extract_content', label: platform ? `Caption ${platform} tidak ditemukan atau terlalu singkat` : 'Konten artikel terlalu singkat', status: 'fail' });
    return { success: false, error: platform ? `Caption ${platform} tidak ditemukan. Silakan gunakan mode Manual.` : 'Artikel terlalu singkat untuk diperiksa otomatis. Silakan gunakan mode Manual.', steps };
  }
  steps.push({ key: 'extract_content', label: 'Isi konten berhasil diekstrak', status: 'success' });
  const noiseHits = (rawText.match(/ADVERTISEMENT|IKLAN|Baca Juga|Bagikan|Dengarkan artikel/gi) ?? []).length;
  const quality = noiseHits >= 6 ? 'dirty' : 'clean';
  steps.push({ key: 'clean_content', label: quality === 'clean' ? 'Konten berhasil dibersihkan' : 'Konten mungkin masih mengandung sedikit noise', status: quality === 'clean' ? 'success' : 'warning' });
  return {
    success: true,
    article: {
      title,
      content,
      url: location.href,
      source: location.hostname.replace(/^www\./, ''),
      published: document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ?? null,
      quality,
      steps,
    },
  };
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender) => {
    const explainText = async (text: string) => {
      const res = await fetch('http://localhost:8000/predict/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.detail || 'Gagal menjalankan penjelasan XAI.');
      return {
        ...payload,
        is_fake: payload.label === 'HOAKS',
        influentialWords: payload.word_scores.slice(0, 5),
        model_scores: { bilstm: 0, gru: 0, cnn_bilstm: 0 },
      };
    };

    const setAutoProgress = (percent: number, label: string) => browser.storage.local.set({
      autoProgress: { percent: Math.max(0, Math.min(100, percent)), label },
    });

    /** Jalankan ekstraksi DOM dan XAI untuk satu tab; dipakai klik popup dan auto saat halaman dibuka. */
    const inspectAutoPage = async (tabId: number, fallbackUrl = '', attempt = 0) => {
      const extractionProgress = Math.min(25 + attempt * 5, 50);
      await setAutoProgress(extractionProgress, 'Membaca struktur halaman...');
      const [injection] = await browser.scripting.executeScript({
        target: { tabId },
        func: extractArticleFromActivePage,
      });
      const extracted = injection?.result;
      if (!extracted?.success || !extracted.article) {
        return { success: false, error: extracted?.error || 'Artikel tidak dapat diekstrak dari halaman ini.' };
      }
      await setAutoProgress(55, 'Isi artikel berhasil ditemukan dan dibersihkan');
      await setAutoProgress(72, 'Mengirim artikel ke model prediksi...');
      const data = await explainText(extracted.article.content);
      await setAutoProgress(90, 'Menyusun hasil prediksi dan penjelasan XAI...');
      const result = {
        text: extracted.article.content,
        url: extracted.article.url ?? fallbackUrl ?? extracted.article.source,
        data: { ...data, article: extracted.article },
        timestamp: Date.now(),
      };
      await browser.storage.local.set({ lastAutoResult: result });
      browser.action.setBadgeText({ text: '1' });
      browser.action.setBadgeBackgroundColor({ color: '#ff5a17' });
      await setAutoProgress(100, 'Pemeriksaan selesai');
      return { success: true, result };
    };

    if (message.type === 'GET_API_STATUS') {
      return fetch('http://localhost:8000/openapi.json', { cache: 'no-store' })
        .then((response) => ({ online: response.ok }))
        .catch(() => ({ online: false }));
    }

    if (message.type === 'CHECK_TEXT') {
      return browser.storage.local.get('extensionEnabled').then((stored) => {
        if (stored.extensionEnabled === false) {
          return { success: false, error: 'Pemeriksaan extension sedang dimatikan.' };
        }

        // Endpoint XAI juga mengembalikan label dan confidence, serta skor SHAP per kata.
        return explainText(message.text)
          .then(async (data) => {
          const result = {
            text: message.text,
            url: sender.tab?.url ?? '',
            data,
            timestamp: Date.now(),
          };
          await browser.storage.local.set({ lastResult: result });
          browser.action.setBadgeText({ text: '1' });
          browser.action.setBadgeBackgroundColor({ color: '#2563eb' });
          return { success: true, data };
        })
        .catch((err) => ({ success: false, error: err.message }));
      });
    }

    if (message.type === 'CHECK_AUTO_PAGE') {
      return browser.storage.local.get('extensionEnabled').then(async (stored) => {
        if (stored.extensionEnabled === false) return { success: false, error: 'Pemeriksaan extension sedang dimatikan.' };
        await browser.storage.local.set({
          autoChecking: true,
          autoProgress: { percent: 10, label: 'Menyiapkan pemeriksaan...' },
        });
        try {
          await browser.storage.local.remove('lastAutoResult');
          return await inspectAutoPage(message.tabId, sender.tab?.url ?? '');
        } catch (err) {
          const message = err instanceof Error ? err.message : '';
          const blockedPage = /Cannot access contents of url|Cannot access a chrome|Missing host permission/i.test(message);
          return {
            success: false,
            error: blockedPage
              ? 'Mode Auto tidak dapat membaca halaman internal browser atau halaman yang dibatasi.'
              : message || 'Gagal membaca artikel pada halaman ini.',
          };
        } finally {
          await browser.storage.local.set({ autoChecking: false });
        }
      });
    }

    // Dikirim segera saat halaman baru terbuka agar hasil artikel sebelumnya tidak tertinggal di popup.
    if (message.type === 'AUTO_PAGE_OPENED') {
      return browser.storage.local.get(['extensionEnabled', 'selectedMode']).then(async (stored) => {
        if (stored.extensionEnabled !== false && stored.selectedMode !== 'manual') {
          await browser.storage.local.remove('lastAutoResult');
          await browser.storage.local.set({
            autoChecking: true,
            autoProgress: { percent: 5, label: 'Menunggu halaman siap diperiksa...' },
          });
          browser.action.setBadgeText({ text: '' });
        }
        return { success: true };
      });
    }

    // Dikirim content script tepat setelah halaman baru selesai dimuat saat mode Auto aktif.
    if (message.type === 'CHECK_AUTO_FROM_PAGE') {
      return browser.storage.local.get(['extensionEnabled', 'selectedMode']).then(async (stored) => {
        // selectedMode yang belum ada diperlakukan sebagai Auto agar pengguna baru langsung mendapat pemeriksaan otomatis.
        if (stored.extensionEnabled === false || stored.selectedMode === 'manual' || !sender.tab?.id) {
          return { success: false, skipped: true };
        }
        try {
          await browser.storage.local.set({
            autoChecking: true,
            autoProgress: { percent: 10, label: 'Menyiapkan pemeriksaan...' },
          });
          await browser.storage.local.remove('lastAutoResult');
          const pageUrl = sender.tab.url ?? '';
          const pageHost = new URL(pageUrl).hostname;
          const isSocialPage = /(^|\.)facebook\.com$/i.test(pageHost)
            || /(^|\.)(x|twitter)\.com$/i.test(pageHost)
            || /(^|\.)(threads\.net|threads\.com)$/i.test(pageHost)
            || /(^|\.)instagram\.com$/i.test(pageHost)
            || /(^|\.)reddit\.com$/i.test(pageHost);
          let latestResult;

          // Platform sosial, terutama X Community Post, sering merender isi post
          // beberapa detik setelah shell halaman muncul.
          // Coba sekarang, lalu ulangi tiap 5 detik maksimal 6 kali (30 detik).
          for (let attempt = 0; attempt < (isSocialPage ? 6 : 1); attempt += 1) {
            latestResult = await inspectAutoPage(sender.tab.id, pageUrl, attempt);
            if (latestResult.success || !isSocialPage || attempt === 5) return latestResult;
            await setAutoProgress(
              Math.min(30 + attempt * 6, 55),
              `Menunggu konten halaman dimuat (${attempt + 1}/6)...`,
            );
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
          return latestResult ?? { success: false, skipped: true };
        } catch {
          // Tidak mengganggu halaman pengguna bila URL bukan artikel atau tidak dapat diekstrak.
          return { success: false, skipped: true };
        } finally {
          await browser.storage.local.set({ autoChecking: false });
        }
      });
    }
  });
});
