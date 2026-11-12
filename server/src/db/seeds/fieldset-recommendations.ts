/** Fieldset candidates for recommendation research, with optional task hints. */

import type { FieldSetRecommendationSuggestions } from '../../application/registry/recommendation-suggestions.js';

export const recommendationSuggestionsByFieldSet = new Map<
  string,
  FieldSetRecommendationSuggestions
>(
  Object.entries({
    'appliances.dishwasher': {
      tasks: [
        {
          title: 'Run the machine care programme',
          description:
            'The machine care programme removes built-up debris and residue from inside the dishwasher.',
          eligibility: 'The dishwasher has a dedicated machine care programme.',
          importance: 'RECOMMENDED',
          recurrence: 'every month',
        },
        {
          title: 'Refill salt and rinse aid',
          description:
            'Dishwasher salt helps the detergent work in hard water. Rinse aid helps dishes dry with fewer water spots.',
          eligibility: 'The dishwasher has refillable salt and rinse aid reservoirs.',
          importance: 'RECOMMENDED',
        },
      ],
      purchasables: [
        {
          name: 'Rinse aid',
          description: 'Rinse aid helps dishes dry and reduces water spots.',
          eligibility: 'The dishwasher has a refillable dispenser for liquid rinse aid.',
          kind: 'CONSUMABLE',
        },
        {
          name: 'Dishwasher salt',
          description:
            'Salt softens the water used by the dishwasher so the detergent works more effectively.',
          eligibility: 'The dishwasher has a refillable water softener that takes dishwasher salt.',
          kind: 'CONSUMABLE',
        },
        {
          name: 'Detergent tablets',
          description:
            'Detergent tablets and capsules come in pre-measured doses to remove grease and food residue from dishes.',
          eligibility:
            'The dishwasher manual permits all-in-one capsules for the intended programme and dispenser, and the capsule fits the dispenser.',
          kind: 'CONSUMABLE',
          purchaseUrl:
            'https://www.amazon.co.uk/Fairy-Platinum-Dishwasher-Capsules-Challenges/dp/B0G6TZ2D1R',
        },
      ],
    },
    'appliances.washing': {
      tasks: [
        {
          title: 'Run the drum-clean programme',
          description:
            'Running the drum-clean programme removes detergent residue and helps prevent odours inside the washing machine.',
          eligibility: 'The washing machine has a dedicated drum-clean programme.',
          importance: 'RECOMMENDED',
          recurrence: 'every month',
        },
        {
          title: 'Clean the drain pump filter',
          description: 'Clearing lint and debris from the filter helps the washing machine drain.',
          eligibility:
            'The washing machine has a drain pump filter that the owner can access and clean.',
          importance: 'RECOMMENDED',
          recurrence: 'every 2 months',
        },
      ],
      purchasables: [
        {
          name: 'Washing machine cleaner',
          description:
            'Washing machine cleaner removes detergent residue and helps reduce odours inside the machine.',
          eligibility:
            'The washing machine manual allows a cleaning product for the intended cycle or cleaning procedure.',
          kind: 'CONSUMABLE',
        },
      ],
    },
    'appliances.drying': {
      tasks: [
        {
          title: 'Clean the lint filter',
          description:
            'Removing lint helps air flow through the dryer so it can dry clothes efficiently.',
          eligibility: 'The dryer has a lint filter that the owner can access and clean.',
          importance: 'IMPORTANT',
        },
        {
          title: 'Empty the condenser tank',
          description:
            'The condenser tank needs emptying since the dryer does not vent moisture to the outside',
          eligibility: 'The dryer collects water in a tank that the owner can empty.',
          importance: 'RECOMMENDED',
        },
      ],
      purchasables: [
        {
          name: 'Lint filter',
          description:
            'A lint filter traps fluff that comes off clothes during drying. A new filter restores that function if the old one is broken or no longer fits properly.',
          eligibility: 'The dryer has a lint filter that the owner can replace.',
          kind: 'CONSUMABLE',
        },
      ],
    },
    'appliances.fridge': {
      tasks: [
        {
          title: 'Replace the water filter',
          description:
            "Replacing the cartridge keeps the fridge's drinking water or ice supply filtered.",
          eligibility: 'The fridge uses a water filter cartridge that the owner can replace.',
          importance: 'RECOMMENDED',
          recurrence: 'every 6 months',
        },
      ],
      purchasables: [
        {
          name: 'Water filter',
          description:
            'The cartridge filters the water the fridge dispenses for drinking or uses to make ice.',
          eligibility: 'The fridge uses a replaceable water filter cartridge.',
          kind: 'CONSUMABLE',
        },
      ],
    },
    'appliances.freezing': {
      tasks: [
        {
          title: 'Defrost the freezer',
          description:
            'Removing built-up ice frees up storage space and makes drawers and shelves easier to use.',
          eligibility:
            'The freezer requires manual defrosting and has a documented defrost procedure.',
          importance: 'RECOMMENDED',
        },
      ],
      purchasables: [],
    },
    'appliances.oven': {
      tasks: [
        {
          title: 'Run pyrolytic cleaning',
          description:
            'This extra hot self-cleaning cycle turns baked-on grease and food residue into ash that can be wiped away.',
          eligibility: 'The oven has a pyrolytic cleaning function.',
          importance: 'NICE_TO_HAVE',
        },
      ],
      purchasables: [
        {
          name: 'Additional oven shelf',
          description: 'An extra shelf lets you cook on another level at the same time.',
          eligibility:
            'The oven has room for another shelf and accepts shelves with the correct dimensions, runner fit and temperature rating.',
          kind: 'ACCESSORY',
        },
        {
          name: 'Oven light bulb',
          description:
            'A working oven light lets you see how food is cooking without opening the door.',
          eligibility:
            'The oven manual permits owner replacement of the light bulb and specifies its fitting, wattage and heat rating.',
          kind: 'CONSUMABLE',
        },
      ],
    },
    'appliances.hob': {
      tasks: [],
      purchasables: [
        {
          name: 'Hob scraper',
          description:
            'A hob scraper lifts dried spills and burnt-on food from a glass cooking surface.',
          eligibility:
            'The hob has a glass cooking surface and its care instructions allow a scraper.',
          kind: 'ACCESSORY',
        },
      ],
    },
    'appliances.heating': {
      tasks: [
        {
          title: 'Book an annual service',
          description:
            'A service checks how the heating system is working and can identify faults before they interrupt heating or hot water.',
          eligibility:
            'The owner is responsible for arranging service for the boiler or heat pump. ',
          importance: 'IMPORTANT',
          recurrence: 'every year',
        },
      ],
      purchasables: [],
    },
    'appliances.spaceCooling': {
      tasks: [
        {
          title: 'Clean or replace the air filter',
          description:
            'A clean filter lets air flow through the unit and keeps dust from accumulating inside it.',
          eligibility:
            'The unit has a user-accessible air filter that the owner can clean or replace.',
          importance: 'RECOMMENDED',
        },
      ],
      purchasables: [
        {
          name: 'Air filter',
          description:
            'A fresh filter traps dust and helps maintain airflow through the indoor unit.',
          eligibility: 'The indoor unit uses a replaceable air filter.',
          kind: 'CONSUMABLE',
        },
      ],
    },
    'appliances.waterTank': {
      tasks: [
        {
          title: 'Descale the water circuit',
          description:
            'Removing limescale helps water flow through the appliance and reach its heating surfaces.',
          eligibility: 'The appliance has a documented procedure for descaling the water circuit.',
          importance: 'RECOMMENDED',
        },
      ],
      purchasables: [
        {
          name: 'Descaler',
          description: 'Descaler dissolves limescale that can build up inside the water circuit.',
          eligibility:
            'The appliance manual specifies or permits a descaling product for its water circuit.',
          kind: 'CONSUMABLE',
        },
      ],
    },
    'appliances.vacuum': {
      tasks: [
        {
          title: 'Replace the exhaust filter',
          description: 'A fresh exhaust filter traps fine dust before air leaves the vacuum.',
          eligibility: 'The vacuum uses an exhaust filter that the owner can replace.',
          importance: 'RECOMMENDED',
        },
      ],
      purchasables: [
        {
          name: 'Dust bags',
          description: 'Spare bags let you keep using the vacuum when the fitted bag fills up.',
          eligibility: 'The vacuum uses disposable dust bags (it is not a bagless model)',
          kind: 'CONSUMABLE',
        },
        {
          name: 'Vacuum filter',
          description: "A fresh filter keeps fine dust from passing through the vacuum's exhaust.",
          eligibility: 'The vacuum uses a replaceable filter.',
          kind: 'CONSUMABLE',
        },
        {
          name: 'Main brush',
          description:
            'A brush with unworn bristles or rollers helps the robot lift dust and debris from the floor.',
          eligibility: 'The vacuum is a robot and uses a replaceable brush or roller.',
          kind: 'CONSUMABLE',
        },
        {
          name: 'Mop pads',
          description: 'Fresh mop pads pick up dirt as the robot mops the floor.',
          eligibility:
            'The vacuum is a robot and has a mop attachment that takes replaceable pads.',
          kind: 'CONSUMABLE',
        },
      ],
    },
    'devices.computing': {
      tasks: [
        {
          title: 'Check backups',
          description:
            'Opening a file restored from backup shows whether you can recover it when you need it.',
          eligibility: 'The device uses a backup system that lets the owner restore a sample file.',
          importance: 'IMPORTANT',
          recurrence: 'every 3 months',
        },
      ],
      purchasables: [
        {
          name: 'Memory upgrade',
          description:
            'More memory can help the computer handle larger files or run more applications at once.',
          eligibility:
            'The computer has upgradeable memory with a specified memory type and capacity limit.',
          kind: 'UPGRADE',
        },
        {
          name: 'Storage upgrade',
          description: 'A higher-capacity drive gives you room for more files and applications.',
          eligibility:
            'The computer accepts an internal storage upgrade with a specified drive size, interface and capacity limit.',
          kind: 'UPGRADE',
        },
      ],
    },
    'devices.battery': {
      tasks: [],
      purchasables: [
        {
          name: 'Battery',
          description: 'A fresh battery restores the time the device can run between charges.',
          eligibility: 'The device uses a battery that the owner can replace.',
          kind: 'CONSUMABLE',
        },
        {
          name: 'Charger',
          description:
            'A spare charger lets you charge the device when its usual charger is missing, faulty or elsewhere.',
          eligibility:
            'The device can be charged with a separate charger with the required connector, charging standard, power output and plug type.',
          kind: 'ACCESSORY',
        },
      ],
    },
    'devices.network': {
      tasks: [
        {
          title: 'Restart the router',
          description:
            'Restarting the router can restore a connection that has dropped or stopped responding.',
          eligibility: 'The device is a router with a restart procedure the owner can carry out.',
          importance: 'RECOMMENDED',
        },
      ],
      purchasables: [],
    },
    'devices.mounting': {
      tasks: [],
      purchasables: [
        {
          name: 'Wall mount',
          description:
            'A wall mount frees up surface space and lets you position the screen at a suitable height.',
          eligibility: 'The display has a mounting pattern and is intended to be wall mountable',
          kind: 'ACCESSORY',
        },
        {
          name: 'Monitor arm',
          description:
            'An articulated arm attaches to a desk and allows the screen to be repositionable',
          eligibility: 'The display has a mounting pattern and weight within the limits of an arm.',
          kind: 'ACCESSORY',
        },
      ],
    },
    'devices.printing': {
      tasks: [
        {
          title: 'Run print-quality maintenance routine',
          description:
            "The printer's maintenance routine can help diagnose or correct defects such as streaks, gaps or misalignment.",
          eligibility:
            'The printer has a documented print-quality maintenance routine that the owner can run.',
          importance: 'NICE_TO_HAVE',
        },
      ],
      purchasables: [
        {
          name: 'Ink cartridges',
          description:
            'Fresh ink lets the printer keep producing pages in the colour that has run low.',
          eligibility:
            'The printer uses replaceable ink cartridges specified by colour and regional model.',
          kind: 'CONSUMABLE',
        },
        {
          name: 'Toner',
          description:
            'Fresh toner lets a laser printer keep printing when its cartridge runs low.',
          eligibility:
            'The printer uses a replaceable toner cartridge with a part number for its regional model.',
          kind: 'CONSUMABLE',
        },
        {
          name: 'Drum unit',
          description:
            'A fresh drum helps the printer transfer toner evenly and can resolve marks caused by a worn drum.',
          eligibility: 'The printer uses a separate replaceable drum unit.',
          kind: 'CONSUMABLE',
        },
      ],
    },
    'devices.camera': {
      tasks: [],
      purchasables: [
        {
          name: 'Camera memory card',
          description: 'A memory card provides more space for photos and video',
          eligibility:
            'The camera accepts removable memory cards and specifies the card type, capacity and write speed it requires.',
          kind: 'ACCESSORY',
        },
      ],
    },
    'devices.lens': {
      tasks: [],
      purchasables: [
        {
          name: 'Camera lens',
          description:
            'An additional lens gives you a different field of view, aperture or focusing distance for the photographs you want to take.',
          eligibility: 'The camera accepts interchangeable lenses and has a specified lens mount.',
          kind: 'ACCESSORY',
        },
      ],
    },
    'vehicles.maintenance': {
      tasks: [
        {
          title: 'Book the next scheduled service',
          description:
            'Scheduled servicing lets a mechanic check for wear and carry out the maintenance due for the vehicle.',
          eligibility: 'The manufacturer specifies a service schedule for the vehicle.',
          importance: 'IMPORTANT',
        },
        {
          title: 'Arrange a recall repair',
          description: 'A recall repair addresses the defect identified by the manufacturer.',
          eligibility: 'A manufacturer recall covers the vehicle and specifies a repair.',
          importance: 'IMPORTANT',
        },
      ],
      purchasables: [],
    },
    'vehicles.roadMotor': {
      tasks: [
        {
          title: 'Check tyre condition and pressures',
          description:
            'Checking the tyres reveals damage, wear or incorrect pressures that can affect grip and handling.',
          eligibility: 'The vehicle uses pneumatic tyres with manufacturer-specified pressures.',
          importance: 'IMPORTANT',
          recurrence: 'every week',
        },
      ],
      purchasables: [
        {
          name: 'Tyres',
          description:
            'New tyres restore tread and grip when the fitted tyres are worn or damaged.',
          eligibility: 'The vehicle uses tyres with a specified size, load index and speed rating.',
          kind: 'CONSUMABLE',
        },
      ],
    },
    'vehicles.car': {
      tasks: [],
      purchasables: [
        {
          name: 'Wiper blades',
          description:
            "Fresh blades clear rain from the car's glass when the old blades streak or miss areas.",
          eligibility:
            'The car has replaceable wiper blades with lengths and fittings specified for its body style and blade positions.',
          kind: 'CONSUMABLE',
        },
      ],
    },
    'vehicles.van': {
      tasks: [],
      purchasables: [
        {
          name: 'Wiper blades',
          description:
            "Fresh blades clear rain from the van's glass when the old blades streak or miss areas.",
          eligibility:
            'The van has replaceable wiper blades with lengths and fittings specified for its body variant and blade positions.',
          kind: 'CONSUMABLE',
        },
      ],
    },
    'vehicles.combustion': {
      tasks: [],
      purchasables: [
        {
          name: 'Engine oil',
          description:
            'Engine oil lubricates moving parts and helps limit wear. A spare supply lets you top up when the level drops.',
          eligibility: 'The vehicle handbook specifies the engine oil viscosity and approval.',
          kind: 'CONSUMABLE',
        },
        {
          name: 'Oil filter',
          description:
            'A fresh oil filter catches particles before they circulate through the engine after an oil change.',
          eligibility: 'The engine uses a replaceable oil filter specified for its variant.',
          kind: 'CONSUMABLE',
        },
        {
          name: 'Engine air filter',
          description:
            'A fresh intake filter keeps dust out of the engine while letting air flow freely.',
          eligibility: 'The engine uses a replaceable air filter specified for its variant.',
          kind: 'CONSUMABLE',
        },
      ],
    },
    'vehicles.roadworthiness': {
      tasks: [
        {
          title: 'Book an MOT test',
          description:
            'Booking ahead gives you time to get the vehicle tested before its MOT expires.',
          eligibility: 'The vehicle is subject to MOT testing in the UK.',
          importance: 'IMPORTANT',
          recurrence: 'every year',
        },
      ],
      purchasables: [],
    },
    'vehicles.roadTax': {
      tasks: [
        {
          title: 'Review or renew vehicle tax',
          description:
            'Checking the status gives you time to renew the tax or make a statutory off-road notification if you plan to take the vehicle off the road.',
          eligibility:
            'The vehicle is subject to UK vehicle tax rules and the owner is the registered keeper.',
          importance: 'IMPORTANT',
        },
      ],
      purchasables: [],
    },
    'vehicles.roofLoad': {
      tasks: [],
      purchasables: [
        {
          name: 'Roof bars',
          description:
            'Roof bars provide mounting points for a roof box, bike carrier or other roof accessories.',
          eligibility:
            'The manufacturer permits roof loads and the vehicle has attachment points for roof bars that fit its body variant.',
          kind: 'ACCESSORY',
        },
      ],
    },
    'vehicles.towing': {
      tasks: [],
      purchasables: [
        {
          name: 'Towbar and wiring kit',
          description:
            "A towbar provides a trailer attachment point, and the wiring connects the trailer's lights to the vehicle.",
          eligibility:
            'The vehicle variant is approved for towing and can accept a towbar and wiring kit compatible with the trailer.',
          kind: 'ACCESSORY',
        },
      ],
    },
    'vehicles.electric': {
      tasks: [],
      purchasables: [
        {
          name: 'Charging cable',
          description:
            'A cable lets you use charge points that have a socket but no attached lead.',
          eligibility:
            'The vehicle accepts a detachable cable for charging at an untethered charge point.',
          kind: 'ACCESSORY',
        },
      ],
    },
    'vehicles.cycle': {
      tasks: [
        {
          title: 'Check brake pad wear',
          description:
            'Checking the pads shows whether they are worn enough to need replacing before braking performance suffers.',
          eligibility:
            "The bicycle has brake pads that can be inspected using the manufacturer's guidance for the fitted brakes.",
          importance: 'IMPORTANT',
        },
      ],
      purchasables: [
        {
          name: 'Brake pads',
          description: 'Fresh pads restore braking when the old pads have worn down.',
          eligibility:
            'The bicycle uses replaceable brake pads of a shape and compound specified for the fitted brakes.',
          kind: 'CONSUMABLE',
        },
        {
          name: 'Inner tubes',
          description:
            'A spare tube lets you get riding again after a puncture that cannot be patched on the road.',
          eligibility: 'The wheel uses an inner tube that matches its tyre size and valve opening.',
          kind: 'CONSUMABLE',
        },
      ],
    },
    'vehicles.cycleBattery': {
      tasks: [],
      purchasables: [
        {
          name: 'E-bike battery',
          description:
            'A fresh battery restores riding range when the existing pack no longer holds enough charge.',
          eligibility:
            'The e-bike uses a replaceable battery approved for its drive system and mount.',
          kind: 'CONSUMABLE',
        },
        {
          name: 'E-bike charger',
          description:
            'A charger keeps the e-bike usable when the original charger is missing, faulty or unavailable.',
          eligibility:
            'The e-bike battery and drive system have an approved charger specification.',
          kind: 'ACCESSORY',
        },
      ],
    },
    'vehicles.motorcycle': {
      tasks: [
        {
          title: 'Inspect and lubricate the drive chain',
          description:
            'Checking wear and slack helps spot when the chain needs attention. Lubrication reduces friction and wear.',
          eligibility:
            'The motorcycle uses a drive chain with a documented inspection and lubrication procedure.',
          importance: 'IMPORTANT',
        },
      ],
      purchasables: [
        {
          name: 'Chain lubricant',
          description:
            "Chain lubricant reduces friction and helps limit wear and corrosion on the motorcycle's drive chain.",
          eligibility:
            'The motorcycle uses a drive chain that requires external lubricant suitable for its chain type.',
          kind: 'CONSUMABLE',
        },
        {
          name: 'Chain and sprocket kit',
          description:
            'A kit renews worn drive components together so the new chain runs on unworn sprockets.',
          eligibility:
            'The motorcycle has a chain final drive with a specified chain pitch and sprocket sizes.',
          kind: 'CONSUMABLE',
        },
      ],
    },
    'vehicles.habitation': {
      tasks: [
        {
          title: 'Prepare the water system for winter storage',
          description:
            'Preparing the water system helps prevent frozen water from damaging tanks and pipes during storage.',
          eligibility:
            'The caravan or motorhome has a fitted water system with a documented winter storage procedure.',
          importance: 'IMPORTANT',
          recurrence: 'every year',
        },
      ],
      purchasables: [],
    },
    'vehicles.watercraft': {
      tasks: [
        {
          title: 'Book an engine service',
          description:
            'Servicing gives you a chance to address wear before using the boat or prepare the engine for a period out of use.',
          eligibility:
            'The boat has an engine with documented service or seasonal storage guidance.',
          importance: 'IMPORTANT',
        },
      ],
      purchasables: [],
    },
    'vehicles.finance': {
      tasks: [
        {
          title: 'Check mileage',
          description:
            'Checking the odometer against the agreement helps you anticipate any excess mileage charge.',
          eligibility:
            'The vehicle lease specifies a mileage allowance or an excess mileage charge on return.',
          importance: 'RECOMMENDED',
        },
      ],
      purchasables: [],
    },
    'memberships.membership': {
      tasks: [
        {
          title: 'Review or renew membership',
          description:
            'Reviewing before renewal gives you time to keep access, change the membership or stop the next payment.',
          eligibility: 'The membership has a fixed term or a renewal process.',
          importance: 'NICE_TO_HAVE',
        },
      ],
      purchasables: [],
    },
    'memberships.professional': {
      tasks: [
        {
          title: 'Complete continuing professional development',
          description:
            'Completing the required development and recording it gives you evidence to submit for the reporting period.',
          eligibility:
            'The professional body requires continuing professional development or evidence of it.',
          importance: 'IMPORTANT',
        },
        {
          title: 'Renew accreditation',
          description:
            'Renewing in time keeps the accreditation current so you can continue to rely on it.',
          eligibility: 'The accreditation can be renewed by the holder.',
          importance: 'IMPORTANT',
        },
      ],
      purchasables: [],
    },
    'memberships.lending': {
      tasks: [
        {
          title: 'Return or renew',
          description:
            'Returning or renewing items on time helps you avoid overdue charges or restrictions on borrowing.',
          eligibility: 'The lending service lets the borrower return or renew borrowed items.',
          importance: 'RECOMMENDED',
        },
      ],
      purchasables: [],
    },
    'subscriptions.trial': {
      tasks: [
        {
          title: 'Decide whether to keep the subscription',
          description:
            'Deciding before the trial ends gives you time to avoid a charge or keep access to the service.',
          eligibility:
            'The subscription has a fixed trial period with terms that specify the charge, renewal or access after the trial.',
          importance: 'RECOMMENDED',
        },
      ],
      purchasables: [],
    },
    'subscriptions.introductoryOffer': {
      tasks: [
        {
          title: 'Review the subscription before the price changes',
          description:
            'Reviewing the new price gives you time to decide whether the subscription is still worth keeping.',
          eligibility:
            'The subscription has an introductory price and a different price that applies after the offer.',
          importance: 'RECOMMENDED',
        },
      ],
      purchasables: [],
    },
    'subscriptions.domain': {
      tasks: [
        {
          title: 'Check domain renewal',
          description:
            'Checking renewal and payment details helps prevent the domain and its website or email from going offline.',
          eligibility: 'The domain registration can be renewed through its registrar.',
          importance: 'IMPORTANT',
          recurrence: 'every year',
        },
      ],
      purchasables: [],
    },
    'subscriptions.backup': {
      tasks: [
        {
          title: 'Test a restore',
          description:
            'Restoring and opening a sample file shows whether you can recover files from the service when needed.',
          eligibility:
            'The subscription includes a backup the owner can access and a way to restore a sample.',
          importance: 'IMPORTANT',
          recurrence: 'every 3 months',
        },
      ],
      purchasables: [],
    },
    'subscriptions.servicePlan': {
      tasks: [
        {
          title: 'Book an included service visit',
          description:
            'Booking uses a benefit already included in the plan and gets the covered item or property serviced.',
          eligibility: 'The service plan includes bookable visits for the item or property.',
          importance: 'NICE_TO_HAVE',
        },
      ],
      purchasables: [],
    },
    'subscriptions.monitoring': {
      tasks: [
        {
          title: 'Test the monitored alarm with the monitoring centre',
          description:
            'A coordinated test confirms that the monitoring centre receives signals from the alarm.',
          eligibility:
            'The alarm is connected to a monitoring centre and the provider offers an owner test with a way to prevent a false callout.',
          importance: 'IMPORTANT',
        },
      ],
      purchasables: [],
    },
    'utilities.tariff': {
      tasks: [
        {
          title: 'Review the tariff',
          description:
            'Reviewing before the end date lets you compare the rates that will follow and factor in any exit fee.',
          eligibility:
            'The tariff has a fixed term and the supplier sets out what happens when it ends.',
          importance: 'NICE_TO_HAVE',
        },
      ],
      purchasables: [],
    },
    'utilities.electricity': {
      tasks: [
        {
          title: 'Submit an electricity meter reading',
          description:
            'An actual reading gives the supplier the figures it needs to bill for the electricity used.',
          eligibility: "The electricity supplier accepts manual readings for the account's meter.",
          importance: 'RECOMMENDED',
        },
      ],
      purchasables: [],
    },
    'utilities.gas': {
      tasks: [
        {
          title: 'Submit a gas meter reading',
          description:
            'An actual reading gives the supplier the figures it needs to bill for the gas used.',
          eligibility: "The gas supplier accepts manual readings for the account's meter.",
          importance: 'RECOMMENDED',
        },
      ],
      purchasables: [],
    },
    'utilities.export': {
      tasks: [
        {
          title: 'Submit an export meter reading',
          description:
            'An export reading lets the supplier calculate payment for the electricity sent to the grid.',
          eligibility:
            "The export supplier accepts manual readings from the meter's export register.",
          importance: 'RECOMMENDED',
        },
      ],
      purchasables: [],
    },
    'utilities.meteredWater': {
      tasks: [
        {
          title: 'Submit a water meter reading',
          description:
            'An actual reading gives the supplier the figures it needs to bill for the water used.',
          eligibility:
            'The water account uses a meter that the owner can read and the supplier accepts manual readings.',
          importance: 'RECOMMENDED',
        },
      ],
      purchasables: [],
    },
    'utilities.unmeteredWater': {
      tasks: [
        {
          title: 'Install a water meter',
          description:
            'Comparing a metered estimate with the current bill could show whether paying for water by usage would save money',
          eligibility:
            'The water account is unmetered and the supplier offers a metered option for the property.',
          importance: 'NICE_TO_HAVE',
        },
      ],
      purchasables: [],
    },
    'insurance.policy': {
      tasks: [
        {
          title: 'Renew policy',
          description:
            'Reviewing the new terms gives you time to adjust the cover or choose another policy before the renewal or expiry date.',
          eligibility: 'The policy has a fixed period of cover or a renewal process.',
          importance: 'IMPORTANT',
          recurrence: 'every year',
        },
      ],
      purchasables: [],
    },
    'insurance.claims': {
      tasks: [
        {
          title: 'Submit a claim',
          description:
            "Submitting the claim and evidence starts the insurer's assessment of the loss.",
          eligibility: 'The policy lets the policyholder submit claims for covered incidents.',
          importance: 'IMPORTANT',
        },
      ],
      purchasables: [],
    },
    'insurance.buildings': {
      tasks: [
        {
          title: 'Reassess the rebuild cost',
          description:
            'Updating the rebuild figure helps keep the insured amount in line with the cost of rebuilding the altered property.',
          eligibility: 'The buildings policy uses a rebuild figure to set the amount insured.',
          importance: 'IMPORTANT',
        },
      ],
      purchasables: [],
    },
    'insurance.contents': {
      tasks: [
        {
          title: 'Recalculate value of possessions',
          description:
            "Reviewing the amount helps keep the policy's total and item limits in line with the belongings you need to cover.",
          eligibility:
            'The contents policy sets a total amount insured or limits for individual possessions.',
          importance: 'RECOMMENDED',
        },
      ],
      purchasables: [],
    },
  }),
);
