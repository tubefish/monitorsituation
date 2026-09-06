import { Panel } from './Panel';
import { h } from '@/utils/dom-utils';
import { sanitizeUrl } from '@/utils/sanitize';

import {
  fetchGdeltArticles,
  formatArticleDate,
  extractDomain,
  type GdeltArticle,
} from '@/services/gdelt-intel';

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export class EconomicCorrelationPanel extends Panel {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private hasRendered = false;

  constructor() {
    super({
      id: 'economic-correlation',
      title: 'Iran Watch',
      className: 'panel-wide',
      defaultRowSpan: 2,
      showCount: false,
      infoTooltip:
        'Latest news headlines and developments involving Iran.',
    });

    void this.loadArticles();

    this.refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void this.loadArticles(false);
      }
    }, REFRESH_INTERVAL_MS);
  }

  /**
   * panel-layout.ts still calls this because this slot used to be
   * a correlation panel.
   *
   * Iran Watch does not need map navigation, so this intentionally
   * does nothing.
   */
  public setMapNavigateHandler(
    _handler: (lat: number, lon: number) => void,
  ): void {
    // Compatibility method for the existing economic-correlation slot.
  }

  override destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    super.destroy();
  }

  public async refresh(): Promise<void> {
    await this.loadArticles(false);
  }

  private async loadArticles(
    showLoading = true,
  ): Promise<void> {
    if (showLoading && !this.hasRendered) {
      this.showLoading();
    }

    try {
      /**
       * Use several searches instead of one huge search.
       *
       * Each goes through the same Google News / RSS infrastructure
       * already used by Live Intelligence.
       *
       * This gives us broader publisher coverage while still keeping
       * the final panel as one simple chronological feed.
       */
      const results = await Promise.all([
        fetchGdeltArticles(
          'Iran',
          5,
          '48h',
        ),

        fetchGdeltArticles(
          'Iran nuclear OR IAEA OR IRGC OR missile OR Israel',
          5,
          '48h',
        ),

        fetchGdeltArticles(
          'Iran sanctions OR oil OR diplomacy OR "Strait of Hormuz"',
          5,
          '48h',
        ),
      ]);

      if (!this.element?.isConnected) {
        return;
      }

      const articles = this.prepareArticles(
        results.flat(),
      );

      this.renderArticles(articles);
      this.hasRendered = true;
    } catch (error) {
      console.error(
        '[IranWatch] Failed to load Iran news:',
        error,
      );

      /**
       * If we already have headlines on screen, don't replace them
       * with an error just because one refresh failed.
       */
      if (this.hasRendered) {
        return;
      }

      this.showError(
        'Iran news temporarily unavailable',
        () => void this.loadArticles(),
      );
    }
  }

  private prepareArticles(
    articles: GdeltArticle[],
  ): GdeltArticle[] {
    const seen =
      new Set<string>();

    return articles
      /**
       * You specifically wanted stories that actually mention
       * Iran in the headline.
       *
       * This also naturally includes words such as "Iranian".
       */
      .filter(article =>
        article.title
          .toLowerCase()
          .includes('iran'),
      )

      /**
       * Remove duplicate publisher/headline combinations caused by
       * overlapping Google News searches.
       */
      .filter(article => {
        const key =
          `${article.source}|${article.title}`
            .toLowerCase()
            .trim();

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      })

      /**
       * Newest headline first.
       */
      .sort(
        (a, b) =>
          this.articleTimestamp(b.date) -
          this.articleTimestamp(a.date),
      )

      /**
       * Keep enough stories for scrolling without making the panel
       * unnecessarily heavy.
       */
      .slice(0, 12);
  }

  private renderArticles(
    articles: GdeltArticle[],
  ): void {
    if (articles.length === 0) {
      this.setContentNodes(
        h(
          'div',
          {
            className: 'empty-state',
          },
          'No recent Iran headlines.',
        ),
      );

      return;
    }

    this.setContentNodes(
      h(
        'div',
        {
          className: 'gdelt-intel-articles iran-watch-feed',
        },

        ...articles.map(article =>
          this.buildArticle(article),
        ),
      ),
    );
  }

  private buildArticle(
    article: GdeltArticle,
  ): HTMLElement {
    const source =
      article.source ||
      extractDomain(article.url);

    const timeAgo =
      formatArticleDate(article.date);

    return h(
      'a',
      {
        href: sanitizeUrl(article.url),
        target: '_blank',
        rel: 'noopener',
        className: 'gdelt-intel-article iran-watch-item',
      },

      h(
        'div',
        {
          className: 'article-header',
        },

        h(
          'span',
          {
            className: 'article-source',
          },
          source,
        ),

        h(
          'span',
          {
            className: 'article-time',
          },
          timeAgo,
        ),
      ),

      h(
        'div',
        {
          className: 'article-title',
        },
        article.title,
      ),
    );
  }

  private articleTimestamp(
    value: string,
  ): number {
    const match =
      value.match(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      );

    if (!match) {
      return 0;
    }

    return Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
    );
  }
}