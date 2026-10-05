// A dated editorial assessment, not a live diagnosis or an automatic headline
// classifier. Refreshing the feeds must never move this review timestamp.
export const RUSSIA_DISEASE_WATCH = {
  reviewedAt: Date.parse('2026-10-05T16:45:00Z'),
  location: 'Irkutsk Oblast · Russia',
  title: 'Pneumonic plague reports',
  status: 'Diagnosis unconfirmed',
  summary: 'A laboratory worker’s death in Siberia has prompted precautionary measures and international attention. The cause was reported as pneumonia of unknown origin; plague has not been confirmed in the sources reviewed.',
  facts: [
    { label: 'Reported event', value: 'Laboratory worker died', detail: 'Reported by Reuters on 5 October; cause unresolved.' },
    { label: 'Plague diagnosis', value: 'Not confirmed', detail: 'Do not interpret people under observation as confirmed cases.' },
    { label: 'Response', value: 'Contacts monitored', detail: 'Russian authorities report precautionary measures.' },
  ],
  sources: [
    { name: 'Reuters · 5 Oct', url: 'https://www.reuters.com/business/healthcare-pharmaceuticals/dozens-quarantined-siberia-after-plague-institute-lab-worker-dies-2026-10-05/' },
    { name: 'AP · 5 Oct', url: 'https://apnews.com/article/9ddc8e3e064637853407bfd24d8937f5' },
    { name: 'WHO · About plague', url: 'https://www.who.int/news-room/fact-sheets/detail/plague' },
  ],
  timeline: [
    { date: '5 Oct 2026', title: 'International monitoring', description: 'U.S. officials say they are monitoring reports with the CDC. Details remain unconfirmed.', source: 'ABC News', url: 'https://www-cdn.abcnews.com/US/state-department-monitoring-reported-fatal-case-pneumonic-plague/story?id=136992734' },
    { date: '4 Oct 2026', title: 'Authorities publish their assessment', description: 'Rospotrebnadzor reports pneumonia of unknown origin and says testing found no pathogens linked to the worker’s professional activity.', source: 'Interfax reporting the agency statement', url: 'https://www.interfax.ru/russia/1120228' },
  ],
} as const;
