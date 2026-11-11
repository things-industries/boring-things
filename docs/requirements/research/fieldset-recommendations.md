# Fieldset recommendation candidates

The review covers all 160 fieldsets in the [authored registry](../../../server/src/db/seeds/registry.ts). It proposes candidates where the fieldset points to a recurring task, a decision with a deadline, or a purchase that often depends on model compatibility. The dishwasher candidates are in the seed. The other rows are proposals for review.

| Category      | Fieldsets reviewed |
| ------------- | -----------------: |
| Appliances    |                 30 |
| Devices       |                 22 |
| Vehicles      |                 24 |
| Memberships   |                 13 |
| Subscriptions |                 19 |
| Utilities     |                 29 |
| Insurance     |                 22 |
| Other         |                  1 |

Use the UK wording and processes where they differ. Confirm the Thing's jurisdiction before suggesting a statutory task. Use the applicable manual, contract or policy to establish fit, timing and procedure. The [source register](sources.md#fieldset-recommendations) covers examples of model care and UK-specific processes.

## Appliances

| Fieldset | Task candidates | Purchasable candidates | Eligibility to check |
| --- | --- | --- | --- |
| `appliances.dishwasher` | Run the machine care programme. Refill salt and rinse aid. | Rinse aid, dishwasher salt, detergent tablets. | Confirm the dedicated programme and both reservoirs for the combined task. Check the model's guidance for separate rinse aid, refillable softener and permitted detergent formats for the relevant programme. |
| `appliances.washing` | Run the drum-clean programme. Clean the drain pump filter. | Washing machine cleaner. | Look for a dedicated programme or an owner-serviceable filter. Confirm permitted cleaners and where they go. |
| `appliances.drying` | Clean the condenser or heat exchanger. | Replacement lint filter. | Check that the owner can access the component and follow the instructions for this dryer type. Use a replacement filter only when compatible and replacement is warranted. |
| `appliances.fridge` | Replace the water filter. | Water filter. | Confirm the fridge has a replaceable filter for its water dispenser or ice maker. |
| `appliances.freezing` | Defrost the freezer. | | Confirm that the manual describes manual defrosting and its trigger. |
| `appliances.oven` | Run pyrolytic cleaning. | Additional oven shelf, replacement oven light bulb. | Confirm the cleaning function and its precautions, shelf fit, or an owner-replaceable bulb with the documented rating. |
| `appliances.hob` | | Hob scraper. | Confirm the surface type and that the manufacturer permits a scraper. |
| `appliances.heating` | Book a boiler or heat pump service. | | Confirm equipment type, service guidance, and who is responsible. For a UK gas boiler, verify the applicable engineer qualification and warranty terms. |
| `appliances.spaceCooling` | Clean or replace the air filter. | Replacement air filter. | Determine whether the filter is washable or replaceable and whether the owner can access it. |
| `appliances.waterTank` | Descale the water circuit. | Descaler. | Confirm the model permits descaling and check the specified agent or procedure. |
| `appliances.vacuum` | Replace the exhaust filter. | Dust bags, replacement filters, robot brush or mop pads. | Check whether the model uses bags, has replaceable filters, or accepts the relevant robot consumable. |
| `appliances.consumables` | | Replacement consumable. | Use the recorded consumable or filter model to identify the actual item and verify compatibility. |
| `appliances.maintenance`, `appliances.cleaning` | Book the documented service or carry out the documented maintenance procedure. | | Use the documented procedure and its interval or trigger. Combine with any equivalent subtype candidate. |

## Devices

| Fieldset | Task candidates | Purchasable candidates | Eligibility to check |
| --- | --- | --- | --- |
| `devices.software` | Apply a firmware update. | | Confirm that the manufacturer offers an applicable update and the owner must install it. |
| `devices.computing` | Check that backups can be restored. | Memory or storage upgrade. | Use backup evidence to justify a restore check. Verify that the hardware is upgradeable and supports the capacity and specification. |
| `devices.battery` | | Replacement battery, charger. | Confirm whether the owner can replace the battery and verify the battery part or charger connector, power and UK plug where applicable. |
| `devices.network` | Restart the router to restore a connection. | | Confirm the device is a router and the provider documents a restart for the symptoms. Keep factory resets as a separate procedure with different consequences. |
| `devices.mounting` | | Display wall mount. | Verify the VESA pattern, display weight and mount rating. |
| `devices.printing` | Run the documented print-quality maintenance procedure. | Ink cartridges, toner, drum unit. | Verify the procedure and trigger for the print technology. Match the exact cartridge, region and any separately replaceable drum. |
| `devices.camera`, `devices.lens` | | Memory card, compatible lens. | Check card format and speed requirements or lens mount and body compatibility. |
| `devices.recording` | Check that a recording can be retrieved. | Recorder storage. | Confirm the recorder stores footage locally and supports the card or drive type and capacity. |

## Vehicles

| Fieldset | Task candidates | Purchasable candidates | Eligibility to check |
| --- | --- | --- | --- |
| `vehicles.maintenance` | Book the next scheduled service. Arrange a recall repair. | | Confirm the service schedule against age, mileage and service history. Require evidence of an outstanding recall before proposing a repair. |
| `vehicles.roadMotor` | Check tyre condition and pressures. | Replacement tyres. | Use the manufacturer's axle, load and tyre specifications. Require a reason to replace tyres before proposing a purchase. |
| `vehicles.car`, `vehicles.van` | | Replacement wiper blades. | Check the body style, fitment and whether a rear blade is present. |
| `vehicles.combustion` | | Engine oil, oil filter, air filter. | Match the engine variant, oil approval and filter part. Use the service schedule or documented top-up requirement. |
| `vehicles.roadworthiness` | Book the MOT. | | Confirm UK scheme, vehicle class, jurisdiction, any exemption and due date. Use the appropriate booking process for Great Britain or Northern Ireland. |
| `vehicles.roadTax` | Review or renew vehicle tax. | | Confirm UK tax status and due date. Account for automatic renewal and any off-road declaration before proposing action. |
| `vehicles.roofLoad` | | Roof bars. | Verify body style, roof attachment and load limit. |
| `vehicles.towing` | | Towbar and wiring kit. | Check the manufacturer approves towing for the variant and that the fittings and electrics match. |
| `vehicles.electric` | | Charging cable. | Check connectors at both ends, charging rating and what equipment is already supplied. |
| `vehicles.cycle` | Check brake pad wear. | Brake pads, inner tubes. | Match the brake system or tyre size and valve. Confirm a tube is appropriate for the wheel setup. |
| `vehicles.cycleBattery` | | Replacement battery, charger. | Verify exact pack, mount, voltage and manufacturer-approved charger. |
| `vehicles.motorcycle` | Inspect and lubricate the drive chain. | Chain lubricant, chain and sprocket kit. | Confirm chain final drive and documented service or replacement conditions. |
| `vehicles.habitation` | Book a habitation service. Prepare the water system for winter storage. | | Verify the fitted systems, provider or warranty service terms, and planned storage conditions. |
| `vehicles.watercraft` | Book an engine service before seasonal use or storage. | | Confirm an engine is fitted and consult its service schedule and storage guidance. |
| `vehicles.finance` | Check mileage before lease return. | | Confirm a mileage allowance, agreement end date and that the vehicle is to be returned. |

## Memberships and subscriptions

| Fieldset | Task candidates | Eligibility to check |
| --- | --- | --- |
| `memberships.membership` | Review or renew membership. | Confirm a renewal or expiry date and whether renewal is automatic. |
| `memberships.commitment`, `subscriptions.commitment` | Review the agreement before the cancellation deadline. | Check the minimum term, notice and whether cancellation is being considered. |
| `memberships.professional` | Complete continuing professional development or renew accreditation. | Use the body's documented requirements, evidence and deadline. |
| `memberships.lending` | Return or renew borrowed items. | Confirm a current loan and its due date. |
| `memberships.loyalty` | Use points before they expire. | Confirm that the owner has a balance due to expire under the programme terms. |
| `memberships.workspace` | Book the required equipment induction. | Verify which equipment requires an induction and that the owner has yet to complete it. |
| `subscriptions.trial` | Decide whether to keep the subscription before the trial ends. | Confirm the trial deadline and whether a charge or loss of access follows. |
| `subscriptions.introductoryOffer` | Review the subscription before the price changes. | Confirm the offer end date and the price that follows. Combine with a trial or contract review if the decision and date are the same. |
| `subscriptions.delivery` | Skip or reschedule a delivery. | Confirm a known absence or delivery conflict and the supplier's change deadline. |
| `subscriptions.domain` | Check domain renewal. | Verify expiry and whether the registrar will renew automatically. |
| `subscriptions.backup` | Test a restore. | Confirm that the plan includes backups and a restore process the owner can use. |
| `subscriptions.servicePlan` | Book an included service visit. | Check whether the plan covers the visit and when it can be booked. |
| `subscriptions.monitoring` | Test the monitored alarm with the monitoring centre. | Require an owner test procedure and follow the provider's guidance for preventing a false callout. |

## Utilities

| Fieldset | Task candidates | Eligibility to check |
| --- | --- | --- |
| `utilities.tariff`, `utilities.commitment` | Review the tariff or contract before it ends. | Confirm the end date, renewal price or tariff, and any exit fee. Combine overlapping reviews. |
| `utilities.electricity`, `utilities.gas` | Submit an energy meter reading. | Confirm the supplier requires a manual reading or shows an estimated bill. Use one task when both readings are submitted together. |
| `utilities.export` | Submit an export meter reading. | Confirm the export supplier requests a manual reading and identify the correct register. |
| `utilities.meteredWater` | Submit a water meter reading. | Confirm an estimated bill or supplier request and that the owner can read the meter. |
| `utilities.unmeteredWater` | Check whether a water meter could lower the bill. | Check the supplier's local metering options and compare against the household's documented usage or estimate. |
| `utilities.broadband`, `utilities.mobile` | Review the deal at the end of the minimum term. | Use the UK provider's end-of-contract notice when available. Check bundle terms and any separate handset repayments. |
| `utilities.deliveredFuel` | Arrange the next heating oil or LPG delivery. | Confirm the owner orders fuel and the tank level, expected usage or supplier terms indicate a delivery is needed. |

## Insurance

| Fieldset | Task candidates | Eligibility to check |
| --- | --- | --- |
| `insurance.policy` | Review cover before renewal. | Confirm the renewal or expiry date and whether renewal is automatic. |
| `insurance.claims` | Submit the claim. | Require a known incident, relevant policy terms and an owner action. Use the applicable reporting deadline. |
| `insurance.buildings` | Review the rebuild figure after building work. | Confirm alterations and check how the policy sets the insured amount. |
| `insurance.contents`, `insurance.specifiedItem` | Check the insured amount after a change in possessions or value. | Confirm a known change and whether a single-item limit or specified value applies. |
| `insurance.motor` | Tell the insurer about a change affecting cover. | Require a known change such as mileage, use or drivers and check the policy's notification terms. |
| `insurance.travel` | Check cover for the planned trip. | Confirm there is a trip and check destination, duration, planned activities and exclusions against the policy. |

## Fieldsets without candidates

The remaining fieldsets supply evidence for selecting, checking or refining a recommendation. Examples include identifiers, ownership, account and support records, dimensions, electrical specifications, tariff rates and individual policy benefit limits. Generic billing and warranty records can inform a task when they show an actionable date or condition. Manufacturer identifiers help match a part, while the appliance or device subtype gives the reason to buy it. `other.identity` supplies identifying context without an action tied to a subtype.
