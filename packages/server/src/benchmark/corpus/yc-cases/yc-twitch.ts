/**
 * Twitch (W07, founded as Justin.tv) — gaming / live-video.
 *
 * Acquired by Amazon for ~$970M in 2014. First "acquired"-outcome case
 * in our Tier-A corpus (all prior cases were active/public/shut-down).
 *
 * Tests the BMC pipeline on a two-sided creator marketplace where the
 * acquirer's strategic value (Amazon AWS pull-through, Prime Video
 * synergy) is part of the business model context but NOT visible in
 * the YC public profile.
 */

import type { YcCompanyCase } from './yc-company-schema.js'

export const ycTwitchCase: YcCompanyCase = {
  case_id: 'yc-twitch-2014',
  company_name: 'Twitch',
  yc_batch: 'W07',
  source_url: 'https://www.ycombinator.com/companies/twitch',
  fetched_at: '2026-04-28',

  one_liner: 'Live-streaming platform primarily for video games and esports.',
  description:
    'Twitch is a live-streaming service where viewers watch and chat with broadcasters in real time, dominated by gaming and esports content. Streamers ("creators") build communities and monetise via subscriptions, bits (virtual tipping), and ad revenue share. Twitch grew out of Justin.tv (W07 YC batch) and was acquired by Amazon in 2014; today it powers a large share of game-watching hours and is integrated with Amazon Prime.',
  website: 'https://twitch.tv',

  sector: 'gaming',
  outcome: 'acquired',
  stage_at_outcome: 'series-b-plus',
  outcome_year: 2014,

  ground_truth_bmc: {
    CUSTOMER_SEGMENTS: {
      ground_truth:
        'Two-sided: (1) viewers — predominantly young, male, gaming-interested global audience; (2) streamers/creators — long tail of hobbyists plus pro esports + Partner/Affiliate creators monetising. Advertisers form an indirect third side.',
      must_cover: ['viewers', 'streamers', 'gamers'],
      must_not_cover: ['enterprise-saas']
    },
    VALUE_PROPOSITIONS: {
      ground_truth:
        'For viewers: live, interactive game-watching with real-time chat and creator personality. For streamers: low-friction broadcasting, monetisation tools (subs/bits/ads), and audience building. For Amazon (post-acquisition): the dominant gaming-attention property.',
      must_cover: ['live streaming', 'interactivity', 'creator monetisation'],
      must_not_cover: ['on-demand video only']
    },
    CHANNELS: {
      ground_truth:
        'Web + mobile + console + smart-TV apps; embedded chat; in-game integrations (e.g. Twitch SDK in titles); creator-driven viral discovery; partnerships with game publishers and esports leagues.',
      must_cover: ['app', 'creator-driven discovery', 'integrations'],
      must_not_cover: []
    },
    CUSTOMER_RELATIONSHIPS: {
      ground_truth:
        'Self-service for the long tail of streamers and viewers; Partner / Affiliate programs for creator economics; community moderation tooling; trust-and-safety for harassment + DMCA.',
      must_cover: ['self-service', 'partner program', 'community'],
      must_not_cover: []
    },
    REVENUE_STREAMS: {
      ground_truth:
        'Channel subscriptions ($4.99/$9.99/$24.99 tiers, revenue-shared with creators), Bits virtual currency, advertising (pre-roll + display), Prime Gaming bundling, sponsored streams + esports media rights.',
      must_cover: ['subscription', 'advertising', 'tipping'],
      must_not_cover: ['hardware sales']
    },
    KEY_RESOURCES: {
      ground_truth:
        'Low-latency live-video infrastructure, brand among gamers, creator network and exclusive contracts, chat + moderation tooling, post-acquisition: Amazon AWS infrastructure leverage.',
      must_cover: ['streaming infrastructure', 'creator network', 'brand'],
      must_not_cover: []
    },
    KEY_ACTIVITIES: {
      ground_truth:
        'Operating the live-streaming platform and chat, recruiting and supporting creators, content moderation and trust-and-safety, ad sales and esports partnership operations, transcoding and CDN scaling.',
      must_cover: ['platform operations', 'creator acquisition', 'moderation'],
      must_not_cover: []
    },
    KEY_PARTNERSHIPS: {
      ground_truth:
        'Game publishers (for content rights, integrations, drops), esports organisations and leagues, Amazon (parent — Prime, AWS, advertising stack), CDN providers, hardware partners (Elgato, Logitech for streaming gear).',
      must_cover: ['game publishers', 'esports', 'Amazon'],
      must_not_cover: []
    },
    COST_STRUCTURE: {
      ground_truth:
        'Bandwidth + transcoding (the dominant variable cost — billions of streamed minutes), creator revenue share, engineering, content moderation operations, marketing, esports media rights deals.',
      must_cover: ['bandwidth', 'creator payouts', 'engineering'],
      must_not_cover: ['inventory cost']
    }
  },

  annotator_id: 'sheng-internal',
  annotation_quality: 'draft',
  notes:
    'First "acquired"-outcome case. Tests whether the pipeline correctly captures bandwidth + creator-payout as dominant cost lines (the classic UGC-video unit-economics trap). The Amazon parent relationship is in the description but the BMC should treat it as a partnership/resource, not erase Twitch as a standalone business.'
}
