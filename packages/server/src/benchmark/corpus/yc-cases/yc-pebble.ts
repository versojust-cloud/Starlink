/**
 * Pebble (W11) — hardware / consumer
 *
 * Reference case for "shut-down" outcomes. Pebble built early
 * smartwatches, raised >$30M on Kickstarter, was acquired by Fitbit in
 * 2016 then mostly wound down.
 *
 * Including a shut-down case is important — the dataset must contain
 * negative examples for outcome-label-conditioned analysis (does the
 * model produce different BMCs for active vs failed startups?).
 */

import type { YcCompanyCase } from './yc-company-schema.js'

export const ycPebbleCase: YcCompanyCase = {
  case_id: 'yc-pebble-2016',
  company_name: 'Pebble',
  yc_batch: 'W11',
  source_url: 'https://www.ycombinator.com/companies/pebble',
  fetched_at: '2026-04-27',

  one_liner:
    'Customizable e-paper smartwatch that pairs with iPhone and Android via Bluetooth.',
  description:
    'Pebble made one of the first mainstream smartwatches: a low-power e-paper screen, week-long battery life, app store, and developer SDK. Famously raised over $10M on Kickstarter in 2012 (a record at the time), then was acquired by Fitbit in 2016 with most of its software / IP and the consumer business wound down.',
  website: 'https://www.pebble.com',

  sector: 'hardware',
  outcome: 'shut-down',
  stage_at_outcome: 'late-stage',
  outcome_year: 2016,

  ground_truth_bmc: {
    CUSTOMER_SEGMENTS: {
      ground_truth:
        'Tech early adopters and notification-fatigued smartphone owners who valued always-on notifications + week-long battery life over a touch-rich color screen.',
      must_cover: ['early adopters', 'smartphone owners'],
      must_not_cover: ['enterprise IT', 'medical-grade users']
    },
    VALUE_PROPOSITIONS: {
      ground_truth:
        'Always-on e-paper display, multi-day battery life, customizable watch faces, third-party app ecosystem, cross-platform iOS+Android support — all at a price below Apple Watch.',
      must_cover: ['battery life', 'e-paper', 'cross-platform'],
      must_not_cover: ['premium luxury']
    },
    CHANNELS: {
      ground_truth:
        'Direct-to-consumer via own website, crowdfunding (Kickstarter — historically the primary launch channel), retail partners (Best Buy, Amazon), developer-marketing for the SDK community.',
      must_cover: ['Kickstarter', 'retail', 'website'],
      must_not_cover: []
    },
    CUSTOMER_RELATIONSHIPS: {
      ground_truth:
        'Strong community via Kickstarter backers; developer relations for the watchapp ecosystem; direct customer support for hardware issues.',
      must_cover: ['community', 'developer relations'],
      must_not_cover: []
    },
    REVENUE_STREAMS: {
      ground_truth:
        'Hardware sales (one-time purchase, no subscription); accessory sales (bands, chargers); minor revenue from premium watchfaces.',
      must_cover: ['hardware sales', 'one-time'],
      must_not_cover: ['subscription', 'recurring']
    },
    KEY_RESOURCES: {
      ground_truth:
        'Hardware engineering team, e-paper display tech licensing, developer ecosystem, brand among smartwatch enthusiasts, Kickstarter customer mailing list.',
      must_cover: ['hardware engineering', 'e-paper', 'developer ecosystem'],
      must_not_cover: []
    },
    KEY_ACTIVITIES: {
      ground_truth:
        'Hardware design + manufacturing operations, firmware development, mobile companion app development, developer ecosystem maintenance, supply-chain management.',
      must_cover: ['manufacturing', 'firmware', 'companion app'],
      must_not_cover: []
    },
    KEY_PARTNERSHIPS: {
      ground_truth:
        'Contract manufacturers (Foxconn-class), e-paper component suppliers (Sharp / E Ink), retail distribution partners, app developers, Kickstarter as launch platform.',
      must_cover: ['contract manufacturers', 'component suppliers'],
      must_not_cover: []
    },
    COST_STRUCTURE: {
      ground_truth:
        'Component / BOM costs (the largest line — hardware margin pressure), manufacturing + assembly, customer fulfillment / shipping, R&D engineering, support / RMA, marketing.',
      must_cover: ['BOM', 'manufacturing', 'shipping'],
      must_not_cover: ['software-only']
    }
  },

  annotator_id: 'sheng-internal',
  annotation_quality: 'draft',
  notes:
    'Shut-down case. Note the cost structure: hardware-heavy + one-time revenue is a fragile combination. The pipeline should ideally surface this fragility somewhere (perhaps as a high-severity risk in Risk-class output).'
}
