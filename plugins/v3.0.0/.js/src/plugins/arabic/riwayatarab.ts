import { fetchApi } from '@libs/fetch';
import { FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { load as parseHTML } from 'cheerio';

class RiwayatArab {
  id = 'riwayatarab';
  name = 'Riwayat Arab';
  version = '1.2.0';
  icon = "https://github.com/hhht6/riwayatarab-plugin/blob/main/plugins/v3.0.0/public/static/multisrc/madara/arnovel/icon.jpg?raw=true";
  site = 'https://riwayatarab.com/';

  baseApi = 'https://api.riwayatarab.com/api';

  // استخراج الـ slug من مسار الرواية
  extractSlug(novelPath) {
    return novelPath.replace('novel/', '').replace(/\/$/, '');
  }

  // جلب البيانات من API
  async fetchApi(endpoint) {
    const url = `${this.baseApi}/${endpoint}`;
    const response = await fetchApi(url);
    return response.json();
  }

  // جلب الروايات الشائعة أو الأحدث
  async popularNovels(page, { showLatestNovels }) {
    const sort = showLatestNovels ? 'created_at' : 'views';
    const url = `${this.baseApi}/novels?page=${page}&limit=24&sort=${sort}`;
    const response = await fetchApi(url);
    const data = await response.json();

    if (!data.novels) return [];

    return data.novels.map(novel => ({
      name: novel.title || 'بدون عنوان',
      path: `novel/${novel.slug}`,
      cover: novel.cover_image || defaultCover,
    }));
  }

  // جلب تفاصيل رواية معينة
  async parseNovel(novelPath) {
    const slug = this.extractSlug(novelPath);

    // جلب تفاصيل الرواية من API
    const novel = await this.fetchApi(`novels/${slug}`);

    if (!novel || !novel.id) {
      throw new Error('الرواية غير موجودة');
    }

    // حساب عدد الصفحات (كل صفحة 24 فصل)
    const totalChapters = novel.total_chapters || 0;
    const totalPages = Math.ceil(totalChapters / 24);

    return {
      path: novelPath,
      name: novel.title || 'بدون عنوان',
      author: novel.author || 'غير معروف',
      summary: novel.description || '',
      cover: novel.cover_image || defaultCover,
      status: novel.status || 'Unknown',
      genres: novel.tags ? novel.tags.join(', ') : (novel.category_name || ''),
      totalPages: totalPages,
      chapters: [], // سيتم جلبها في parsePage
    };
  }

  // جلب فصول صفحة معينة
  async parsePage(novelPath, page) {
    const slug = this.extractSlug(novelPath);
    const pageNum = parseInt(page, 10) || 1;

    // جلب الفصول من API
    const data = await this.fetchApi(`novels/${slug}/chapters?page=${pageNum}&limit=24`);

    if (!data.chapters) {
      return { chapters: [] };
    }

    const chapters = data.chapters.map(ch => ({
      name: ch.title || `الفصل ${ch.chapter_number}`,
      path: `${novelPath}/chapter/${ch.chapter_number}`,
      releaseTime: ch.created_at || new Date().toISOString(),
      chapterNumber: ch.chapter_number || 0,
    }));

    return { chapters };
  }

  // جلب محتوى الفصل (محاولة API أولاً، ثم HTML كاحتياطي)
  async parseChapter(chapterPath) {
    // استخراج رقم الفصل من المسار
    const match = chapterPath.match(/chapter\/(\d+)/);
    if (!match) {
      throw new Error('رقم الفصل غير صحيح');
    }

    const chapterNumber = match[1];

    // محاولة 1: جلب محتوى الفصل من API (إذا كان متاحاً)
    try {
      // نحاول جلب الفصل باستخدام الـ slug (قد يختلف الـ endpoint)
      const slug = this.extractSlug(chapterPath.split('/chapter/')[0]);
      const data = await this.fetchApi(`novels/${slug}/chapters/${chapterNumber}`);
      if (data && data.content) {
        return data.content;
      }
    } catch (_) {
      // إذا فشل API، ننتقل إلى HTML
    }

    // محاولة 2: جلب محتوى الفصل من HTML (احتياطي)
    const url = `https://riwayatarab.com/${chapterPath}`;
    const response = await fetchApi(url);
    const html = await response.text();
    const $ = parseHTML(html);

    // محاولة استخراج المحتوى من عدة عناصر محتملة
    let content = $('div.chapter-content, div.prose, article div:not(:has(script))').html() || '';

    // إذا لم نجد محتوى، نحاول استخراج النص من الصفحة
    if (!content) {
      content = $('body').html() || '';
      // تنظيف المحتوى من العناصر غير المرغوب فيها
      $('script, style, header, footer, nav').remove();
      content = $('main').html() || $('body').html() || '';
    }

    return content || 'المحتوى غير متوفر';
  }

  // البحث عن روايات
  async searchNovels(searchTerm, page) {
    const url = `${this.baseApi}/novels?search=${encodeURIComponent(searchTerm)}&page=${page}&limit=24`;
    const response = await fetchApi(url);
    const data = await response.json();

    if (!data.novels) return [];

    return data.novels.map(novel => ({
      name: novel.title || 'بدون عنوان',
      path: `novel/${novel.slug}`,
      cover: novel.cover_image || defaultCover,
    }));
  }

  // الفلاتر
  filters = {
    sort: {
      value: 'views',
      label: 'ترتيب حسب',
      options: [
        { label: 'الأكثر مشاهدة', value: 'views' },
        { label: 'الأحدث', value: 'created_at' },
        { label: 'الأكثر تقييماً', value: 'rating' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      value: '',
      label: 'الحالة',
      options: [
        { label: 'الكل', value: '' },
        { label: 'مستمرة', value: 'ongoing' },
        { label: 'مكتملة', value: 'completed' },
        { label: 'متوقفة', value: 'hiatus' },
      ],
      type: FilterTypes.Picker,
    },
  };
}

export default new RiwayatArab();
