/**
 * Airbnb (W09) — marketplace / travel
 *
 * Public IPO'd marketplace. Reference case for "two-sided marketplace
 * with strong network effects".
 */

import type { YcCompanyCase } from './yc-company-schema.js'

export const ycAirbnbCase: YcCompanyCase = {
  case_id: 'yc-airbnb-2024',
  company_name: 'Airbnb',
  yc_batch: 'W09',
  source_url: 'https://www.ycombinator.com/companies/airbnb',
  fetched_at: '2026-04-27',

  one_liner: 'Book unique homes and experiences from local hosts worldwide.',
  description:
    'Airbnb operates an online marketplace that connects people who want to rent out their homes with people looking for accommodations in that locale. Listings cover a wide range — apartments, houses, castles, treehouses, igloos — across roughly 100,000 cities and 220+ countries.',
  website: 'https://airbnb.com',

  sector: 'marketplace',
  outcome: 'public',
  stage_at_outcome: 'late-stage',
  outcome_year: 2020,

  ground_truth_bmc: {
    CUSTOMER_SEGMENTS: {
      ground_truth:
        'Two-sided market: (1) travelers seeking unique, often cheaper-than-hotel accommodations, (2) property owners ("hosts") wanting supplemental income from their homes.',
      must_cover: ['travelers', 'hosts', 'two-sided'],
      must_not_cover: ['only travelers', 'only hosts']
    },
    VALUE_PROPOSITIONS: {
      ground_truth:
        'For travelers: unique local stays, often cheaper or better-located than hotels. For hosts: monetize spare space with no upfront capital.',
      must_cover: ['unique stays', 'monetize'],
      must_not_cover: []
    },
    CHANNELS: {
      ground_truth:
        'Mobile apps, web search, SEO-driven listings, paid acquisition, referral programs, host-acquired travelers (network growth).',
      must_cover: ['app', 'search', 'referral'],
      must_not_cover: []
    },
    CUSTOMER_RELATIONSHIPS: {
      ground_truth:
        'Self-service product, customer-support escalation for disputes (damages, cancellations), trust-and-safety reviews on both sides.',
      must_cover: ['self-service', 'reviews', 'trust-and-safety'],
      must_not_cover: []
    },
    REVENUE_STREAMS: {
      ground_truth:
        'Service fee from guests (~14%) and host fee (~3%) on each booking. Premium listings + Airbnb Plus upgrade fees.',
      must_cover: ['service fee', 'commission', 'booking'],
      must_not_cover: ['ads-only']
    },
    KEY_RESOURCES: {
      ground_truth:
        'Liquid two-sided marketplace at global scale, brand, host community, trust-and-safety + payments infrastructure, search/ranking algorithms.',
      must_cover: ['marketplace', 'brand', 'trust-and-safety'],
      must_not_cover: []
    },
    KEY_ACTIVITIES: {
      ground_truth:
        'Marketplace operations (listing quality, search ranking), trust-and-safety, regulatory engagement with cities, payments processing, host onboarding.',
      must_cover: ['marketplace operations', 'regulatory'],
      must_not_cover: []
    },
    KEY_PARTNERSHIPS: {
      ground_truth:
        'Payment processors (Stripe, Adyen, etc), insurance underwriters (Host Protection Insurance), city regulatory bodies for short-term-rental rules, photographers / experience providers.',
      must_cover: ['payments', 'insurance'],
      must_not_cover: []
    },
    COST_STRUCTURE: {
      ground_truth:
        'Engineering + product, marketing / customer acquisition (very high — competitive marketplace), trust-and-safety / customer support, payments processing fees, insurance / damage claims, regulatory + legal.',
      must_cover: ['marketing', 'engineering', 'customer support'],
      must_not_cover: ['inventory cost'] // Airbnb doesn't buy/own homes
    }
  },

  annotator_id: 'sheng-internal',
  annotation_quality: 'draft',
  notes:
    'Reference for marketplace-pattern BMCs. Watch for the "must_not_cover: inventory cost" — common BMC mistake is treating Airbnb like a hotel chain.',

  // Stage 6: KB seed for the citation eval. Public/paraphrased Airbnb
  // disclosures + general marketplace economics. Each doc carries one
  // concrete claim agents can plausibly cite.
  workspace_knowledge: [
    {
      doc_id: 'airbnb-fees-2024',
      title: 'Airbnb Service Fee Breakdown (2024)',
      content:
        'Airbnb operates a split-fee model: guests pay a service fee of approximately 13–14% on top of the host\'s nightly rate, plus applicable taxes. Hosts under the split-fee plan pay 3% of the booking subtotal. Hosts can opt into a "host-only" plan (common for hotels and large operators) where they absorb a 14–16% fee and the guest sees no separate service charge. The exact percentage varies by region, listing type, and length of stay.'
    },
    {
      doc_id: 'two-sided-marketplace-economics-2022',
      title: 'Network Effects in Two-Sided Marketplaces',
      content:
        'Two-sided marketplaces face a "cold-start" problem: guests won\'t come without listings, hosts won\'t list without guests. Airbnb famously bootstrapped the supply side first by scraping Craigslist listings (later legally enjoined) and offering professional photography to early hosts. Once liquidity passes a per-city threshold (often >2,000 active listings), organic search demand sustains both sides and CAC drops 40–60%. This is why Airbnb prioritises city-level launch density over global breadth.'
    },
    {
      doc_id: 'airbnb-trust-safety-2023',
      title: 'Airbnb Host Protection Insurance and Trust & Safety',
      content:
        'Airbnb\'s "AirCover for Hosts" provides up to $3M in primary damage protection and $1M in liability coverage per booking, underwritten through partnerships with major insurance carriers. The trust-and-safety operation employs over 2,000 staff handling reviews, identity verification, and dispute mediation. Host and guest ratings (1-5 stars on multiple dimensions) are the primary reputation signal — listings below 4.7 average rating face suppressed search ranking.'
    },
    {
      doc_id: 'airbnb-regulatory-friction-2023',
      title: 'Short-Term Rental Regulation Across Cities',
      content:
        'Cities including New York, Paris, Barcelona, and Amsterdam have passed strict short-term rental rules requiring host registration, primary-residence-only restrictions, or 30/60/90-day annual caps. NYC\'s Local Law 18 (effective 2023) requires hosts to register and removed an estimated 80% of unregistered Airbnb listings overnight. Airbnb\'s public-policy team engages with city governments and lobbies for proportionate rules; failed engagement can shrink supply by 40–60% in a market within a quarter.'
    }
  ]
}
