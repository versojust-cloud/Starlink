/**
 * Segment (S11) — b2b-saas / customer data infrastructure.
 *
 * Acquired by Twilio for $3.2B in November 2020. Reference for
 * developer-led b2b-saas infrastructure that becomes a CDP (customer
 * data platform) and then gets bought by a communications API
 * incumbent for the data layer.
 *
 * First b2b-saas case in the Tier-A corpus.
 */

import type { YcCompanyCase } from './yc-company-schema.js'

export const ycSegmentCase: YcCompanyCase = {
  case_id: 'yc-segment-2020',
  company_name: 'Segment',
  yc_batch: 'S11',
  source_url: 'https://www.ycombinator.com/companies/segment',
  fetched_at: '2026-04-28',

  one_liner: 'Customer data platform — collect, clean, and route first-party data to every downstream tool.',
  description:
    'Segment provides a single API for collecting customer behavioural data from web, mobile, and server, then routing it to 300+ analytics, marketing, and warehouse destinations. Started as a JavaScript analytics library (analytics.js) and grew into a full Customer Data Platform with Personas (real-time audience segmentation) and Protocols (data governance). Acquired by Twilio in 2020 for $3.2B and now sold as Twilio Segment.',
  website: 'https://segment.com',

  sector: 'b2b-saas',
  outcome: 'acquired',
  stage_at_outcome: 'series-b-plus',
  outcome_year: 2020,

  ground_truth_bmc: {
    CUSTOMER_SEGMENTS: {
      ground_truth:
        'Product, growth, marketing, and data engineering teams at digital-native companies (mid-market SaaS, e-commerce, media); enterprises wanting a unified customer-data layer rather than per-tool integrations.',
      must_cover: ['product teams', 'marketing teams', 'data engineering'],
      must_not_cover: ['consumers']
    },
    VALUE_PROPOSITIONS: {
      ground_truth:
        'One API to instrument once and ship clean event data anywhere — eliminates N×M integration sprawl. Adds governance (Protocols) and identity resolution / audience activation (Personas) to become the single source of truth for customer data.',
      must_cover: ['single API', 'integrations', 'data governance'],
      must_not_cover: ['ad inventory']
    },
    CHANNELS: {
      ground_truth:
        'Developer-led adoption (free tier + open-source libraries), content + technical SEO, integration marketplace partner co-marketing, inside + enterprise sales for larger accounts, conference presence (SaaStr / Segment Synapse).',
      must_cover: ['developer-led', 'free tier', 'enterprise sales'],
      must_not_cover: []
    },
    CUSTOMER_RELATIONSHIPS: {
      ground_truth:
        'Self-service onboarding for SMB; technical account managers for mid-market+; solutions architects for enterprise implementations; community + docs / Slack for developer relations.',
      must_cover: ['self-service', 'technical AM', 'community'],
      must_not_cover: []
    },
    REVENUE_STREAMS: {
      ground_truth:
        'Tiered subscription priced on monthly tracked users (MTUs) + add-on modules (Personas, Protocols); enterprise contracts; expansion-led ARR growth via volume + module attach.',
      must_cover: ['subscription', 'usage-based', 'enterprise contracts'],
      must_not_cover: ['ads', 'hardware']
    },
    KEY_RESOURCES: {
      ground_truth:
        'Tracking SDKs across every major platform, the 300+ destination integrations library, identity-resolution + audience-segmentation engine, brand among developers, post-acquisition: Twilio distribution.',
      must_cover: ['SDKs', 'integrations library', 'identity engine'],
      must_not_cover: []
    },
    KEY_ACTIVITIES: {
      ground_truth:
        'Maintaining + extending SDKs, building + certifying destination integrations, identity resolution and audience computation, security/SOC2/HIPAA compliance work, developer relations.',
      must_cover: ['SDK maintenance', 'integrations engineering', 'compliance'],
      must_not_cover: []
    },
    KEY_PARTNERSHIPS: {
      ground_truth:
        'Destination tools (Mixpanel, Amplitude, Salesforce, Snowflake — cooperative integrations), warehouses (Snowflake, Redshift, BigQuery), Twilio (parent post-2020), systems integrators for enterprise.',
      must_cover: ['SaaS destinations', 'data warehouses', 'integrators'],
      must_not_cover: []
    },
    COST_STRUCTURE: {
      ground_truth:
        'Engineering (largest line — SDKs + integrations + Personas), cloud infrastructure scaling with event volume, sales + marketing (heavy in mid-market+), customer success, compliance and security operations.',
      must_cover: ['engineering', 'cloud infrastructure', 'sales and marketing'],
      must_not_cover: ['inventory cost']
    }
  },

  annotator_id: 'sheng-internal',
  annotation_quality: 'draft',
  notes:
    'First b2b-saas case. Tests whether the pipeline picks up developer-led GTM as a distinct channel motion (vs Stripe-style API tooling), whether MTU-based usage pricing surfaces in REVENUE_STREAMS, and whether the integrations-library-as-moat shows up in KEY_RESOURCES.'
}
