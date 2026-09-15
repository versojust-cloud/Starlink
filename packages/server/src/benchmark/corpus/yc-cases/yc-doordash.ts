/**
 * DoorDash (S13) — logistics / marketplace.
 *
 * Public IPO 2020. Reference for "three-sided marketplace with thin
 * margins and large variable costs (driver pay, fuel)."
 */

import type { YcCompanyCase } from './yc-company-schema.js'

export const ycDoorDashCase: YcCompanyCase = {
  case_id: 'yc-doordash-2020',
  company_name: 'DoorDash',
  yc_batch: 'S13',
  source_url: 'https://www.ycombinator.com/companies/doordash',
  fetched_at: '2026-04-27',

  one_liner: 'On-demand delivery of food, groceries, and convenience items.',
  description:
    'DoorDash is a logistics platform that connects customers with merchants (restaurants, grocers, retailers) and delivery couriers (Dashers). Started with restaurant food delivery and expanded into convenience, grocery, and retail; runs DashPass subscription, ad placements for merchants, and fulfillment-as-a-service for chains.',
  website: 'https://doordash.com',

  sector: 'logistics',
  outcome: 'public',
  stage_at_outcome: 'late-stage',
  outcome_year: 2020,

  ground_truth_bmc: {
    CUSTOMER_SEGMENTS: {
      ground_truth:
        'Three-sided market: (1) consumers ordering, (2) merchants (restaurants, grocers, retailers) wanting delivery channel, (3) Dashers (independent couriers) earning income.',
      must_cover: ['consumers', 'merchants', 'couriers'],
      must_not_cover: ['only-restaurants']
    },
    VALUE_PROPOSITIONS: {
      ground_truth:
        'For consumers: convenience + speed + selection. For merchants: incremental orders without building delivery ops. For Dashers: flexible gig income with on-demand activation.',
      must_cover: ['convenience', 'incremental orders', 'flexible income'],
      must_not_cover: []
    },
    CHANNELS: {
      ground_truth:
        'Mobile app (primary), web, paid digital + TV, partnerships with chain restaurants for in-app placement, geographic city-by-city expansion playbook.',
      must_cover: ['app', 'paid acquisition', 'partnerships'],
      must_not_cover: []
    },
    CUSTOMER_RELATIONSHIPS: {
      ground_truth:
        'Self-service for consumers + Dashers; dedicated merchant operations for chains; trust-and-safety for refund/redelivery; DashPass subscription engagement loop.',
      must_cover: ['self-service', 'subscription', 'merchant ops'],
      must_not_cover: []
    },
    REVENUE_STREAMS: {
      ground_truth:
        'Commission from merchants (~15-30% per order, the dominant line), delivery + service fees from consumers, DashPass subscription, in-app advertising for merchants, fulfillment-as-a-service contracts.',
      must_cover: ['commission', 'delivery fee', 'subscription'],
      must_not_cover: []
    },
    KEY_RESOURCES: {
      ground_truth:
        'Liquid three-sided marketplace with city-level density, Dasher network, routing/dispatching tech, merchant integrations, brand, data on order patterns + courier behaviour.',
      must_cover: ['marketplace', 'dasher network', 'routing tech'],
      must_not_cover: []
    },
    KEY_ACTIVITIES: {
      ground_truth:
        'Marketplace operations (matching couriers ↔ orders ↔ merchants), dispatching algorithms, courier acquisition + retention, merchant on-boarding, regulatory engagement (gig-worker classification), trust-and-safety.',
      must_cover: ['marketplace operations', 'dispatching', 'regulatory'],
      must_not_cover: []
    },
    KEY_PARTNERSHIPS: {
      ground_truth:
        'Restaurant chains + grocery chains as priority merchants, payment processors, insurance for couriers, regulators (state-by-state gig-worker laws), large enterprises for fulfillment-as-a-service.',
      must_cover: ['restaurant chains', 'payments', 'insurance'],
      must_not_cover: []
    },
    COST_STRUCTURE: {
      ground_truth:
        'Dasher pay + incentives (the largest variable cost — typically the majority of every order), customer support, engineering, marketing for consumer + Dasher acquisition, merchant onboarding, insurance + claims.',
      must_cover: ['courier pay', 'marketing', 'customer support'],
      must_not_cover: ['inventory cost']
    }
  },

  annotator_id: 'sheng-internal',
  annotation_quality: 'draft',
  notes:
    'Three-sided marketplace with razor-thin margins. The pipeline must capture courier pay as the dominant cost line; underweighting this is a common BMC mistake (treating DoorDash like a SaaS).'
}
