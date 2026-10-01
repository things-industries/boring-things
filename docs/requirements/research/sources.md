# Sources

## Fieldset catalogue — 30 September 2026

- [fieldsets-review.csv](fieldsets-review.csv): reviewed contents of `bt.field_sets`, using its eight columns in table order. Contains 154 new sets and revisions to all 11 existing seeded sets. Array columns use PostgreSQL `text[]` literals; `{}` is an empty array. Field order in `field_ids` is display order.
- [fieldset-field-map.csv](fieldset-field-map.csv): each of the 484 reviewed field rows, its proposed definition ID and the sets directly containing it. Original labels, scopes, examples and annotations are preserved. `definition_status` records the comparison with the registry at review time. The proposal references 413 distinct definitions: 20 existing IDs and 393 proposed IDs. The implementation in `server/src/db/seeds/registry.ts` supplies schemas, UI hints and semantic icon keys; the migration snapshot installs the same metadata.
- `includes` contains required dependencies. `consider_alongside` contains optional discovery suggestions whose eligibility must be checked separately. Parent fields are stored once in their owning set. Independent dimensions such as ownership, warranty, fuel type and connectivity can combine with product-specific sets.
- Manufacturer identifiers retain their own meanings. Bosch and Neff keep their existing set IDs; Siemens uses the same BSH field definitions in its own set. Generic appliance serial numbers have a separate eligibility rule. `appliances.productCode` applies to a distinct product or variant code; model labels use `common.model`. The review annotation is retained in the CSV.
- Buildings and contents reuse `insurance.sumInsured` and `insurance.excess`, with separate values in each component set. Medical and dental waiting periods similarly belong to their respective benefits. Combined home cover shares one policy and one property set. Electricity and gas components share one utility account and service context.
- The CSV is a proposed upsert target. Existing set IDs included for revision are `appliances.appliance`, `appliances.bosch`, `appliances.neff`, `vehicles.vehicle`, `vehicles.car`, `vehicles.van`, `memberships.museum`, `insurance.policy`, `insurance.buildings`, `insurance.contents` and `insurance.combined`.
- `20260930040000_expanded_fieldsets.sql` maps stored values, provenance, explicit clears and pins when fields move between sets. In particular, vehicle registration and VIN move out of the general vehicle set; museum account, membership and access fields move into shared membership sets. Retired `insurance.renewalDate` values and destination conflicts become custom fields. Appliance purchase date, retailer and warranty end migrate to shared acquisition, seller and warranty definitions, including standalone values. The seed command alone does not perform these data transformations.
- `membership.provider` is labelled Provider, and `membership.level` accepts provider-specific membership types. `vehicles.payloadKg` retains its kilogram-based definition. Rates and benefit limits with per-person/per-period bases use text to preserve precision and units; simple monetary amounts use the existing money schema.
- Each Thing currently permits one occurrence of each set. Specified possessions, insured vehicles, pets and gadgets are therefore eligible only for a single separately described item in the corresponding proposed set. Multi-item policies with differing terms need a repeated-record design before those details can be mapped. One domain registration per Thing is the proposed scope for domain-specific terms.
- Proposed counts: Appliances 36, Devices 20, Vehicles 26, Memberships 13, Subscriptions 19, Utilities 29 and Insurance 22. The edited field review contains no Other rows, so this proposal adds no Other sets.

## Field review — 30 September 2026

[field-review.csv](field-review.csv) contains proposed fields for the reviewed categories in `server/src/db/seeds/registry.ts`. Each row describes one field and its applicability within a category; the notes column preserves review annotations. Repeated concepts across categories make each category independently reviewable. Labels and scopes are research synthesis for manual review; examples are synthetic and do not describe real accounts, current prices, product specifications or recommended limits.

The review covers [issue #6](https://github.com/things-industries/boring-things/issues/6), the authored registry, `shared/model.ts`, the field editor and `src/app/utils/sections.util.ts`. The implemented catalogue has 413 definitions and 165 fieldsets across Appliances, Devices, Vehicles, Memberships, Subscriptions, Utilities and Insurance. Other uses custom fields.

The CSV preserves manufacturer-specific identifier meanings, separate components of combined products, inherited vehicle details and features shared by selected subtypes. Scopes identify potential repeated records, such as scheduled insured items. Fields capture durable attributes and contractual terms. Upcoming payments, renewals, services, deliveries and deadlines belong to the event primitive; documents belong to attachments. Account balances, physical-item locations and other transient observations are excluded. Acquisition uses `Acquired on`. Physical dimensions use separate width, height, length and depth measurements as applicable. These rows are candidates for subsequent modelling. Fieldset grouping, stable IDs, validation, storage types and UI implementation remain subject to the edited review.

The sources below establish representative distinctions and applicability across the registry categories. General ownership, support, maintenance and administrative fields are proposed from issue #6 and the review. Country-specific fields name their jurisdiction. Import the CSV's example column as text to preserve identifier zeroes and example date formats.

- **Appliances — manufacturer identifiers:** [Bosch registration](https://www.bosch-home.co.uk/en/productregistration) distinguishes E-Nr, FD and Z-Nr; [AEG spare-part guide](https://shop.aeg.co.uk/spare-part-guide) describes PNC identification. The short Z-number example follows the task's stated case. Brand-specific rows apply when the corresponding identifier appears on the product label.
- **Appliances — combination products and measurements:** [European Commission washer-dryer guidance](https://energy-efficient-products.ec.europa.eu/product-list/washer-dryers_en) distinguishes washing and complete-cycle classes, capacities and measurement bases. [Energy-label overview](https://europa.eu/youreurope/citizens/consumers/shopping/energy-labels/index_en.htm) establishes product-dependent label applicability.
- **Devices — cellular identities:** [Apple identifier guidance](https://support.apple.com/en-gb/108037) distinguishes serial number, IMEI and EID and their applicability to device variants.
- **Vehicles — load terminology:** [GOV.UK vehicle weights](https://www.gov.uk/vehicle-weights-explained) distinguishes laden vehicle limits and gross train weight. Cargo dimensions, towing limits and payload are separate candidate measurements whose values must come from the vehicle's documentation.
- **Memberships — membership variants:** [National Trust membership FAQs](https://www.nationaltrust.org.uk/membership/enquiries/membership-faqs) illustrates individual, joint, family and lifetime variants. [PureGym membership options](https://www.puregym.com/membership-options/) and [access guidance](https://www.puregym.com/gym-access/) illustrate home-gym, multi-site and suspension applicability. [PureGym terms](https://www.puregym.com/terms-and-conditions/) identify personal access credentials.
- **Subscriptions — entitlements:** [Netflix plans](https://help.netflix.com/en/node/24926) illustrates concurrency, resolution and additional-member distinctions. [Microsoft subscription sharing](https://support.microsoft.com/en-us/accounts-billing/subscriptions/share-your-microsoft-365-subscription) illustrates named-user and shared-plan applicability. CSV values are invented examples.
- **Utilities — energy pricing and identifiers:** [Ofgem billing guidance](https://www.ofgem.gov.uk/your-energy-supply/your-energy-bill/how-your-electricity-or-gas-bill-calculated) distinguishes unit rates and standing charges. [Ofgem account-data specification](https://www.ofgem.gov.uk/sites/default/files/docs/2017/11/20171113_open_letter_cma_database_remedy.pdf) illustrates electricity meter points, service-specific tariff dates, payment intervals and time-of-use fields; used for field concepts, not current regulatory requirements.
- **Utilities — Portuguese electricity:** [E-REDES meter specification](https://www.e-redes.pt/sites/eredes/files/2020-07/DEF-C44-506_0.pdf) identifies CPE and contracted-power fields. [ERSE contracted-power guidance](https://www.erse.pt/en/energy-consumers/simulators/contracted-power/) supports a separate power-tier field.
- **Utilities — water:** [Thames Water billing guidance](https://www.thameswater.co.uk/help/account-and-billing/understand-your-bill) distinguishes metered and rateable-value charging, clean water and wastewater.
- **Utilities — telecoms:** [Ofcom contracts](https://www.ofcom.org.uk/phones-and-broadband/service-quality/contracts) identifies charges, term and cancellation information for individual and bundled services. [Ofcom broadband speeds](https://www.ofcom.org.uk/phones-and-broadband/coverage-and-speeds/broadband-speeds-code-practice) distinguishes the minimum guaranteed speed.
- **Insurance — home components:** [Aviva home cover](https://www.aviva.co.uk/insurance/home-products/home-insurance/) and [summary of cover](https://www.aviva.co.uk/content/dam/aviva-public/gb/pdfs/personal/insurance/home/home-insurance/summary_of_cover_insurance_home_nhdhg6081_012017_140617.pdf) illustrate separate buildings and contents sections, limits, excesses and optional benefits. The summary is an example policy document; its terms are not universal.
- **Insurance — travel:** [Aviva travel cover](https://www.aviva.co.uk/insurance/travel-insurance/) illustrates single-trip and annual cover with separate cancellation and medical benefits.
- **Insurance — pets:** [Petplan cover types](https://www.petplan.co.uk/pet-insurance/covered-for-life-vs-time-limited.html) distinguishes lifetime and time-limited cover. [Petplan example wording](https://www.petplan.co.uk/pdf/PP_Essential_TCs.pdf) illustrates excess and contribution conditions. Limits require a basis such as per pet, per condition or per policy year.
- **Insurance — life and income protection:** [MoneyHelper life insurance](https://www.moneyhelper.org.uk/en/everyday-money/insurance/what-is-life-insurance) and [income protection](https://www.moneyhelper.org.uk/en/everyday-money/insurance/what-is-income-protection-insurance) distinguish cover term, benefit amount, deferred period and payment duration.
- **Other — tools:** [Bosch tool service](https://www.boschtoolservice.com/nz/en/boschdiy/spareparts/search) identifies the ten-digit tool type number. This supports manufacturer-specific applicability across selected products.
- **Other — furnishings:** [IKEA care guidance](https://www.ikea.com/se/en/customer-service/knowledge/articles/d277b4gg-6f63-4gd4-g98g-8016cbf6cg50.html) identifies product-dependent materials and care instructions.
- **Other — property:** [HM Land Registry search guidance](https://www.gov.uk/get-information-about-property-and-land/search-the-register) distinguishes title information and tenure for England and Wales.

## Market and problem evidence

- Citizens Advice + Opinium (published 8 Mar 2024): 26% of UK adults accidentally took out a subscription in the prior 12 months.
  Link: https://www.citizensadvice.org.uk/wales/about-us/media-centre/press-releases/consumers-spend-688-million-on-unused-subscriptions-in-the-last-year/

- UK government (DBT impact assessment): estimate that consumers spend around £1.6bn/year on subscriptions they do not consider good value.
  Link: https://assets.publishing.service.gov.uk/media/64464e6f529eda00123b02c4/annex_2-subscription_traps_impact_assessment.pdf

- ONS (UVGH time series): UK spend on repair of household appliances was £733m in 2024 (current prices, seasonally adjusted).
  Link: https://www.ons.gov.uk/economy/nationalaccounts/satelliteaccounts/timeseries/uvgh

- ONS Families and Households (17 Apr 2026): 29.0 million UK households in 2025.
  Link: https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/families/bulletins/familiesandhouseholds/2025

- Resources, Conservation and Recycling (2022): in a Western Europe sample (n=617), 60% replacing a defective device did not consider repair.
  Link: https://www.sciencedirect.com/science/article/pii/S0921344922002919

## Competitor and category references

- Homer app listing: https://apps.apple.com/us/app/homer-the-home-management-app/id1250049341
- About Homer: https://www.homer.co/en/about-homer
- Homer site: https://www.homer.co/
- Homer LinkedIn: https://www.linkedin.com/company/homerco/
- HomeZada site: https://www.homezada.com/
- HomeZada company page: https://www.homezada.com/company
- HomeZada consumer / professional pricing: https://www.homezada.com/professionals/pricing
- HomeZada app listing: https://apps.apple.com/us/app/homezada-mobile/id473722482
- HomeZada LinkedIn: https://www.linkedin.com/company/homezada
- HomeBinder site: https://pages.homebinder.com/
- About HomeBinder: https://pages.homebinder.com/about-homebinder
- HomeBinder LinkedIn: https://www.linkedin.com/company/homebinder-com
- Hartley app listing: https://apps.apple.com/gb/app/hartley-home-management-app/id6751110777
- Hartley Companies House record: https://find-and-update.company-information.service.gov.uk/company/16471418
- HomeNog site: https://homenog.com/
- Homebly site: https://homeblyapp.com/
- Homebly app listing: https://apps.apple.com/us/app/homebly/id6754881345
- Maizon app listing: https://apps.apple.com/us/app/maizon-home-management/id6756460003
- Notion homepage: https://www.notion.com/
- Notion product page: https://www.notion.com/product/notion
- Notion app listing: https://apps.apple.com/us/app/notion-notes-tasks-ai/id1232780281
- 1Password company page: https://1password.com/company
- 1Password app listing: https://apps.apple.com/us/app/1password-password-manager/id1511601750
- Snoop Open Banking explainer: https://snoop.app/open-banking/
- Snoop app listing: https://apps.apple.com/gb/app/budget-planner-l-snoop-finance/id1495077102
- Snoop Google Play listing: https://play.google.com/store/apps/details?id=app.snoop
- Snoop LinkedIn: https://uk.linkedin.com/company/snoop
- Emma about page: https://emma-app.com/about-us
- Emma app listing: https://apps.apple.com/us/app/emma-budget-planner-tracker/id1270062373
- Emma LinkedIn: https://uk.linkedin.com/company/emma-technologies-ltd
- Checkatrade site: https://www.checkatrade.com/
- Checkatrade LinkedIn: https://www.linkedin.com/company/checkatrade
- Rated People site: https://www.ratedpeople.com/
- Rated People LinkedIn: https://www.linkedin.com/company/rated-people
- MyBuilder site: https://www.mybuilder.com/
- About MyBuilder: https://www.mybuilder.com/about-us
- MyBuilder quality checks: https://www.mybuilder.com/quality-check
- MoneySuperMarket about page: https://www.moneysupermarket.com/about-us/
- Compare the Market about page: https://www.comparethemarket.com/about-us/
- Confused.com about page: https://www.confused.com/home/about-us
- itemit site: https://itemit.com/
- itemit about page: https://itemit.com/about-us/
- itemit LinkedIn: https://uk.linkedin.com/company/itemit
- HouseBook app listing: https://apps.apple.com/us/app/housebook-home-inventory/id1489866496
- Centriq shutdown notice: https://mycentriq.com/
- Centriq -> Homer update: https://mycentriq.co/
- Encircle Home Inventory support end notice: https://help.encircleapp.com/hc/en-us/articles/38313668823181-How-to-Export-Your-Encircle-Home-Inventory-Data

## Technology references

- SvelteKit docs: https://svelte.dev/docs/kit/introduction
- Vercel pricing: https://vercel.com/pricing
- Supabase compute/pricing docs: https://supabase.com/docs/guides/platform/compute-add-ons
- pgvector: https://pgxn.org/dist/vector/
- TrueLayer Open Banking overview: https://docs.truelayer.com/docs/what-is-open-banking
- WHATWG HTML Server-sent events: https://html.spec.whatwg.org/multipage/server-sent-events.html
