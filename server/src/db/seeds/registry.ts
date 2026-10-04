import * as database from '../connection.js';

/**
 * Defines and upserts authored categories, fields and sets. Registry seeds update metadata;
 * existing Thing values require separate migrations.
 */

import type { FieldDefinition, FieldSet, Schema } from '../../../../shared/model.js';
import type { Database } from '../connection.js';
import { Registry } from '../../application/registry/registry.js';

const names = [
  'Appliances',
  'Devices',
  'Vehicles',
  'Memberships',
  'Subscriptions',
  'Utilities',
  'Insurance',
  'Other',
];

export const categories = names.map(
  (name, i) =>
    ({
      id: name.toLowerCase(),
      name,
      description: `${name} you own or use.`,
      icon: [
        'appliance',
        'device',
        'vehicle',
        'membership',
        'subscription',
        'utility',
        'insurance',
        'other',
      ][i],
      defaultImage: null,
      sortOrder: i,
      thingCount: 0,
    }) satisfies Schema['Category'],
);

const field = (
  id: string,
  name: string,
  schema: FieldDefinition['schema'] = { type: 'string', maxLength: 500 },
  extra: Partial<FieldDefinition> = {},
): FieldDefinition => ({
  id,
  name,
  description: name,
  keywords: [],
  schema,
  uiHint: 'TEXT',
  sensitive: false,
  icon: 'fieldDefault',
  ...extra,
});

// Amounts use integer minor units; the supported currencies currently have two decimal places.
export const moneySchema: FieldDefinition['schema'] = {
  type: 'object',
  additionalProperties: false,
  required: ['amountMinor', 'currency'],
  properties: {
    amountMinor: {
      type: 'integer',
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    },
    currency: {
      type: 'string',
      pattern: '^[A-Z]{3}$',
      enum: ['GBP', 'EUR', 'USD'],
    },
  },
};

export const fields: FieldDefinition[] = [
  field(
    'common.acquiredOn',
    'Acquired on',
    { type: 'string', format: 'date' },
    {
      description: 'Date ownership began, including purchase, gift or transfer.',
      keywords: ['purchase date', 'purchased on', 'acquisition date'],
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field('common.seller', 'Seller', undefined, {
    description: 'Seller.',
    keywords: ['retailer', 'vendor', 'store', 'shop'],
    uiHint: 'TEXT',
    icon: 'fieldRetailer',
  }),
  field('common.pricePaid', 'Price paid', moneySchema, {
    description: 'Amount paid for the item, including currency.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('common.orderReference', 'Order reference', undefined, {
    description: 'Order reference.',
    uiHint: 'TEXT',
    icon: 'fieldModel',
  }),
  field('common.manufacturer', 'Manufacturer', undefined, {
    description: 'Manufacturer.',
    uiHint: 'TEXT',
    icon: 'fieldManufacturer',
  }),
  field('common.model', 'Model', undefined, {
    description: 'Manufacturer model name or number.',
    keywords: ['model number', 'model name'],
    uiHint: 'TEXT',
    icon: 'fieldModel',
  }),
  field('common.serialNumber', 'Serial number', undefined, {
    description:
      'Identifier assigned to an individual unit. Preserve leading zeroes; manufacturer-specific markings may require a dedicated field.',
    keywords: ['serial number', 'serial', 'S/N', 'SN'],
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('common.warrantyProvider', 'Warranty provider', undefined, {
    description: 'Warranty provider.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field(
    'common.warrantyStarts',
    'Warranty starts',
    { type: 'string', format: 'date' },
    { description: 'Warranty starts.', uiHint: 'DATE', icon: 'fieldDate' },
  ),
  field(
    'common.warrantyEnds',
    'Warranty ends',
    { type: 'string', format: 'date' },
    {
      description: 'Warranty ends.',
      keywords: ['warranty end', 'warranty expiry', 'guarantee end'],
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field('common.extendedWarrantyProvider', 'Extended warranty provider', undefined, {
    description: 'Extended warranty provider.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field(
    'common.extendedWarrantyStarts',
    'Extended warranty starts',
    { type: 'string', format: 'date' },
    { description: 'Extended warranty starts.', uiHint: 'DATE', icon: 'fieldDate' },
  ),
  field(
    'common.extendedWarrantyEnds',
    'Extended warranty ends',
    { type: 'string', format: 'date' },
    { description: 'Extended warranty ends.', uiHint: 'DATE', icon: 'fieldDate' },
  ),
  field('common.supportUrl', 'Support website', undefined, {
    description: 'Support website.',
    uiHint: 'TEXT',
    icon: 'fieldSupport',
  }),
  field('common.supportPhone', 'Support phone', undefined, {
    description: 'Support phone.',
    uiHint: 'TEXT',
    icon: 'fieldPhone',
  }),
  field('common.supportReference', 'Support reference', undefined, {
    description: 'Support reference.',
    uiHint: 'TEXT',
    icon: 'fieldSupport',
  }),
  field('common.serviceInterval', 'Service interval', undefined, {
    description:
      'Documented recurring service interval, including its unit and operating conditions.',
    uiHint: 'TEXT',
    icon: 'fieldTime',
  }),
  field('appliances.applianceType', 'Appliance type', undefined, {
    description: 'Household appliances with a rating plate or product label.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('appliances.productCode', 'Product code', undefined, {
    description:
      'Manufacturer product or variant code. Use Model when the label identifies the model; retain a separate code only when it has a distinct meaning.',
    keywords: ['product code', 'variant', 'type number'],
    uiHint: 'TEXT',
    icon: 'fieldModel',
  }),
  field('appliances.manufacturedOn', 'Manufactured on', undefined, {
    description:
      'Manufacturing date or month as supplied by the manufacturer (YYYY-MM-DD or YYYY-MM).',
    uiHint: 'TEXT',
    icon: 'fieldDate',
  }),
  field('appliances.finish', 'Finish', undefined, {
    description: 'Household appliances with a rating plate or product label.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('appliances.eNumber', 'E-number (E-Nr)', undefined, {
    description:
      'BSH household appliances, including Bosch, Neff and Siemens models, whose rating plate uses the named identifier. Model identifier; retain the slash variant suffix.',
    keywords: ['E-Nr', 'model'],
    uiHint: 'TEXT',
    icon: 'fieldModel',
  }),
  field('appliances.fdNumber', 'FD number', undefined, {
    description:
      'BSH household appliances, including Bosch, Neff and Siemens models, whose rating plate uses the named identifier. Production identifier; preserve as text.',
    keywords: ['FD'],
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('appliances.zNumber', 'Z-number (Z-Nr)', undefined, {
    description:
      'BSH manufacturer-specific serial marking (Z-Nr), often only two or three digits. Preserve leading zeroes and the accompanying E-number and FD number.',
    keywords: ['Z-Nr', 'serial'],
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('appliances.pnc', 'Product number (PNC)', undefined, {
    description:
      'AEG, Electrolux or Zanussi appliances whose product label provides a PNC. Retain any variant suffix printed on the label.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field(
    'appliances.installedOn',
    'Installed on',
    { type: 'string', format: 'date' },
    { description: 'Installed or fitted appliances.', uiHint: 'DATE', icon: 'fieldDate' },
  ),
  field('appliances.installer', 'Installer', undefined, {
    description: 'Installed or fitted appliances.',
    uiHint: 'TEXT',
    icon: 'fieldService',
  }),
  field('appliances.installationType', 'Installation type', undefined, {
    description: 'Installed or fitted appliances.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('common.width', 'Width', undefined, {
    description:
      'Overall width, including its unit. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('common.height', 'Height', undefined, {
    description:
      'Overall height, including its unit. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('common.depth', 'Depth', undefined, {
    description:
      'Overall depth, including its unit. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('appliances.requiredRecessWidth', 'Required recess width', undefined, {
    description:
      'Built-in appliances with a specified installation opening width. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('appliances.requiredRecessHeight', 'Required recess height', undefined, {
    description:
      'Built-in appliances with a specified installation opening height. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('appliances.requiredRecessDepth', 'Required recess depth', undefined, {
    description:
      'Built-in appliances with a specified installation opening depth. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('appliances.ventilationClearance', 'Ventilation clearance', undefined, {
    description:
      'Installed or fitted appliances. Appliances with installation clearance requirements. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('appliances.supplyVoltage', 'Supply voltage', undefined, {
    description: 'Electrically powered appliances with manufacturer supply requirements.',
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field('appliances.supplyFrequency', 'Supply frequency', undefined, {
    description: 'Electrically powered appliances with manufacturer supply requirements.',
    uiHint: 'TEXT',
    icon: 'fieldTime',
  }),
  field('appliances.ratedInputPower', 'Rated input power', undefined, {
    description: 'Electrically powered appliances with manufacturer supply requirements.',
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field('appliances.electricalConnection', 'Electrical connection', undefined, {
    description: 'Electrically powered appliances with manufacturer supply requirements.',
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field('appliances.requiredCircuitRating', 'Required circuit rating', undefined, {
    description:
      'Electrically powered appliances with manufacturer supply requirements. Use the installation instructions for the model.',
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field('appliances.energyLabelScheme', 'Energy label scheme', undefined, {
    description:
      'Appliances carrying an energy label. Record the region and scheme so ratings from different scales remain distinguishable.',
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field('appliances.energyClass', 'Energy class', undefined, {
    description:
      'Appliances carrying an energy label. Appliances with one overall class; combination products may have separate cycle classes.',
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field('appliances.washingCapacity', 'Washing capacity', undefined, {
    description:
      'Washing machines and the washing component of washer-dryers. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldWeight',
  }),
  field('appliances.maximumSpinSpeed', 'Maximum spin speed', undefined, {
    description:
      'Washing machines and the washing component of washer-dryers. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldAccessCode',
  }),
  field('appliances.washEnergyClass', 'Wash energy class', undefined, {
    description:
      'Washing machines and the washing component of washer-dryers. Where the energy label gives a separate washing-cycle class.',
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field('appliances.washEnergyUse', 'Wash energy use', undefined, {
    description:
      "Washing machines and the washing component of washer-dryers. Retain the label's programme and measurement basis. Retain units, precision and any measurement or allowance basis.",
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field('appliances.washWaterUse', 'Wash water use', undefined, {
    description:
      'Washing machines and the washing component of washer-dryers. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldWater',
  }),
  field('appliances.dryingCapacity', 'Drying capacity', undefined, {
    description:
      'Tumble dryers and the drying component of washer-dryers. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldWeight',
  }),
  field('appliances.dryingTechnology', 'Drying technology', undefined, {
    description: 'Tumble dryers and the drying component of washer-dryers.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('appliances.washAndDryEnergyClass', 'Wash-and-dry energy class', undefined, {
    description: 'Washer-dryers with complete wash-and-dry cycle measurements.',
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field('appliances.washAndDryEnergyUse', 'Wash-and-dry energy use', undefined, {
    description:
      'Washer-dryers with complete wash-and-dry cycle measurements. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field('appliances.washAndDryWaterUse', 'Wash-and-dry water use', undefined, {
    description:
      'Washer-dryers with complete wash-and-dry cycle measurements. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldWater',
  }),
  field('appliances.dishwasherWaterUse', 'Dishwasher water use', undefined, {
    description: 'Dishwashers. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldWater',
  }),
  field('appliances.dishwasherEnergyUse', 'Dishwasher energy use', undefined, {
    description: 'Dishwashers. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field('appliances.fridgeCapacity', 'Fridge capacity', undefined, {
    description:
      'Refrigerators and the chilled compartment of fridge-freezers. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('appliances.waterFilterModel', 'Water filter model', undefined, {
    description:
      'Refrigerators and the chilled compartment of fridge-freezers. Models with a replaceable drinking-water filter.',
    uiHint: 'TEXT',
    icon: 'fieldWater',
  }),
  field('appliances.freezerCapacity', 'Freezer capacity', undefined, {
    description:
      'Freezers and the frozen compartment of fridge-freezers. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('appliances.defrostSystem', 'Defrost system', undefined, {
    description: 'Freezers and the frozen compartment of fridge-freezers.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('appliances.mainOvenCapacity', 'Main oven capacity', undefined, {
    description:
      'Ovens, range cookers and combination ovens with the corresponding cooking component. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('appliances.secondOvenCapacity', 'Second oven capacity', undefined, {
    description:
      'Ovens, range cookers and combination ovens with the corresponding cooking component. Models with a second oven cavity. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('appliances.hobType', 'Hob type', undefined, {
    description:
      'Ovens, range cookers and combination ovens with the corresponding cooking component. Models with a hob component.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field(
    'appliances.numberOfCookingZones',
    'Number of cooking zones',
    { type: 'integer', minimum: 0 },
    {
      description:
        'Ovens, range cookers and combination ovens with the corresponding cooking component. Models with a hob component.',
      uiHint: 'NUMBER',
      icon: 'fieldCount',
    },
  ),
  field('appliances.outputPower', 'Output power', undefined, {
    description:
      'Ovens, range cookers and combination ovens with the corresponding cooking component. output power has separate meaning from electrical input power.',
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field('appliances.heatingOutput', 'Heating output', undefined, {
    description:
      'Boilers, heat pumps, water heaters and air conditioners with the corresponding function. Space-heating equipment. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldTemperature',
  }),
  field('appliances.coolingOutput', 'Cooling output', undefined, {
    description:
      'Boilers, heat pumps, water heaters and air conditioners with the corresponding function. Equipment providing cooling. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldTemperature',
  }),
  field('appliances.tankCapacity', 'Tank capacity', undefined, {
    description:
      'Boilers, heat pumps, water heaters and air conditioners with the corresponding function. Equipment with a hot water storage cylinder. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldWater',
  }),
  field('appliances.fuelType', 'Fuel type', undefined, {
    description:
      'Boilers, heat pumps, water heaters and air conditioners with the corresponding function. Fuel-burning equipment.',
    uiHint: 'TEXT',
    icon: 'fieldFuel',
  }),
  field('appliances.refrigerant', 'Refrigerant', undefined, {
    description:
      'Boilers, heat pumps, water heaters and air conditioners with the corresponding function. Equipment with a refrigerant circuit.',
    uiHint: 'TEXT',
    icon: 'fieldTemperature',
  }),
  field('appliances.waterTankCapacity', 'Water tank capacity', undefined, {
    description:
      'Small appliances with the corresponding reservoir, consumable or maintenance requirement. Coffee machines, steam appliances and similar reservoir-equipped products. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldWater',
  }),
  field('appliances.dustContainerCapacity', 'Dust container capacity', undefined, {
    description:
      'Small appliances with the corresponding reservoir, consumable or maintenance requirement. Vacuum cleaners and cleaning robots. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('appliances.replacementFilter', 'Replacement filter', undefined, {
    description:
      'Small appliances with the corresponding reservoir, consumable or maintenance requirement. Vacuum cleaners, purifiers and other appliances using replaceable filters.',
    uiHint: 'TEXT',
    icon: 'fieldService',
  }),
  field('appliances.compatibleConsumable', 'Compatible consumable', undefined, {
    description:
      'Small appliances with the corresponding reservoir, consumable or maintenance requirement. Products requiring model-specific bags, cartridges or cleaning supplies.',
    uiHint: 'TEXT',
    icon: 'fieldService',
  }),
  field('appliances.cleaningInstructions', 'Cleaning instructions', undefined, {
    description: 'Appliances with documented cleaning or descaling requirements.',
    uiHint: 'TEXT',
    icon: 'fieldService',
  }),
  field('appliances.cleaningInterval', 'Cleaning interval', undefined, {
    description:
      'Appliances with documented cleaning or descaling requirements. Products with a documented recurring cleaning task.',
    uiHint: 'TEXT',
    icon: 'fieldTime',
  }),
  field('appliances.descalingInterval', 'Descaling interval', undefined, {
    description:
      'Appliances with documented cleaning or descaling requirements. Products whose instructions require descaling.',
    uiHint: 'TEXT',
    icon: 'fieldTime',
  }),
  field('common.serviceProvider', 'Service provider', undefined, {
    description: 'Service provider.',
    uiHint: 'TEXT',
    icon: 'fieldService',
  }),
  field('devices.deviceType', 'Device type', undefined, {
    description: 'Electronic devices with the corresponding identity or ownership detail.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('devices.hardwareRevision', 'Hardware revision', undefined, {
    description: 'Electronic devices with the corresponding identity or ownership detail.',
    uiHint: 'TEXT',
    icon: 'fieldModel',
  }),
  field('devices.assetTag', 'Asset tag', undefined, {
    description:
      'Electronic devices with the corresponding identity or ownership detail. Devices tracked by a household or employer asset label.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('devices.operatingSystem', 'Operating system', undefined, {
    description: 'Electronic devices with the corresponding identity or ownership detail.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('devices.firmwareVersion', 'Firmware version', undefined, {
    description:
      'Electronic devices with the corresponding identity or ownership detail. Devices exposing a firmware version.',
    uiHint: 'TEXT',
    icon: 'fieldModel',
  }),
  field('devices.processor', 'Processor', undefined, {
    description:
      'Computers, tablets, phones, consoles and network storage with the corresponding specification.',
    uiHint: 'TEXT',
    icon: 'fieldDisplay',
  }),
  field('devices.memory', 'Memory', undefined, {
    description:
      'Computers, tablets, phones, consoles and network storage with the corresponding specification. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldStorage',
  }),
  field('devices.builtInStorage', 'Built-in storage', undefined, {
    description:
      'Computers, tablets, phones, consoles and network storage with the corresponding specification. Internal storage capacity as supplied or upgraded. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldStorage',
  }),
  field('devices.expandableStorage', 'Expandable storage', undefined, {
    description:
      'Computers, tablets, phones, consoles and network storage with the corresponding specification. Models with removable or expandable storage. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldStorage',
  }),
  field('devices.imeiLine1', 'IMEI (line 1)', undefined, {
    description:
      'Phones, tablets, wearables and modems with cellular hardware. Synthetic identifier; the first cellular hardware identity.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('devices.imeiLine2', 'IMEI (line 2)', undefined, {
    description:
      'Phones, tablets, wearables and modems with cellular hardware. Devices exposing a second cellular hardware identity.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('devices.eid', 'EID', undefined, {
    description:
      'Phones, tablets, wearables and modems with cellular hardware. eSIM-capable devices exposing an EID; preserve as text.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('devices.simFormat', 'SIM format', undefined, {
    description: 'Phones, tablets, wearables and modems with cellular hardware.',
    uiHint: 'TEXT',
    icon: 'fieldNetwork',
  }),
  field('devices.batteryModel', 'Battery model', undefined, {
    description:
      'Devices with batteries or a charging input. Products with an identifiable replacement battery.',
    uiHint: 'TEXT',
    icon: 'fieldBattery',
  }),
  field('devices.batteryCapacity', 'Battery capacity', undefined, {
    description:
      'Devices with batteries or a charging input. Preserve the manufacturer unit, including mAh where used. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldBattery',
  }),
  field('devices.chargingConnector', 'Charging connector', undefined, {
    description: 'Devices with batteries or a charging input.',
    uiHint: 'TEXT',
    icon: 'fieldBattery',
  }),
  field('devices.wiFiStandard', 'Wi-Fi standard', undefined, {
    description: 'Network-connected devices with the corresponding interface.',
    uiHint: 'TEXT',
    icon: 'fieldNetwork',
  }),
  field('devices.wiFiBands', 'Wi-Fi bands', undefined, {
    description: 'Network-connected devices with the corresponding interface.',
    uiHint: 'TEXT',
    icon: 'fieldNetwork',
  }),
  field('devices.ethernetMacAddress', 'Ethernet MAC address', undefined, {
    description:
      'Network-connected devices with the corresponding interface. The Ethernet interface address; retain interface identity.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('devices.wiFiMacAddress', 'Wi-Fi MAC address', undefined, {
    description:
      'Network-connected devices with the corresponding interface. The Wi-Fi interface address; private addresses can vary by network.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('devices.localHostname', 'Local hostname', undefined, {
    description: 'Network-connected devices with the corresponding interface.',
    uiHint: 'TEXT',
    icon: 'fieldNetwork',
  }),
  field('devices.connectionProtocol', 'Connection protocol', undefined, {
    description:
      'Network-connected devices with the corresponding interface. Smart-home devices with a stated interoperability protocol.',
    uiHint: 'TEXT',
    icon: 'fieldNetwork',
  }),
  field('devices.screenDiagonal', 'Screen diagonal', undefined, {
    description: 'Televisions, monitors and devices with integrated displays.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('devices.displayResolution', 'Display resolution', undefined, {
    description: 'Televisions, monitors and devices with integrated displays.',
    uiHint: 'TEXT',
    icon: 'fieldDisplay',
  }),
  field('devices.displayConnectors', 'Display connectors', undefined, {
    description:
      'Televisions, monitors and devices with integrated displays. Devices exposing video input or output ports.',
    uiHint: 'TEXT',
    icon: 'fieldDisplay',
  }),
  field('devices.vesaMountingWidth', 'VESA mounting width', undefined, {
    description:
      'Displays with a VESA mounting pattern. Horizontal spacing between mounting holes. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('devices.vesaMountingHeight', 'VESA mounting height', undefined, {
    description:
      'Displays with a VESA mounting pattern. Vertical spacing between mounting holes. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('devices.printTechnology', 'Print technology', undefined, {
    description: 'Printers and multifunction devices.',
    uiHint: 'TEXT',
    icon: 'fieldPrint',
  }),
  field('devices.blackCartridge', 'Black cartridge', undefined, {
    description: 'Printers and multifunction devices.',
    uiHint: 'TEXT',
    icon: 'fieldPrint',
  }),
  field('devices.colourCartridgeSet', 'Colour cartridge set', undefined, {
    description:
      'Printers and multifunction devices. Colour printers with separate colour consumables.',
    uiHint: 'TEXT',
    icon: 'fieldPrint',
  }),
  field('devices.maximumPaperSize', 'Maximum paper size', undefined, {
    description: 'Printers and multifunction devices.',
    uiHint: 'TEXT',
    icon: 'fieldPrint',
  }),
  field(
    'devices.automaticDuplexPrinting',
    'Automatic duplex printing',
    { type: 'boolean' },
    {
      description:
        'Printers and multifunction devices. Printing capability; separate from duplex scanning.',
      uiHint: 'CHECKBOX',
      icon: 'fieldPrint',
    },
  ),
  field(
    'devices.automaticDuplexScanning',
    'Automatic duplex scanning',
    { type: 'boolean' },
    {
      description:
        'Printers and multifunction devices. Devices with a scanner and document feeder.',
      uiHint: 'CHECKBOX',
      icon: 'fieldCheck',
    },
  ),
  field('devices.lensMount', 'Lens mount', undefined, {
    description:
      'Cameras, interchangeable lenses and security cameras with the corresponding feature. Cameras and lenses using an interchangeable mount.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('devices.memoryCardFormat', 'Memory card format', undefined, {
    description:
      'Cameras, interchangeable lenses and security cameras with the corresponding feature. Devices using removable recording media.',
    uiHint: 'TEXT',
    icon: 'fieldStorage',
  }),
  field('devices.recordingStorage', 'Recording storage', undefined, {
    description:
      'Cameras, interchangeable lenses and security cameras with the corresponding feature. Security cameras with local or hosted recording.',
    uiHint: 'TEXT',
    icon: 'fieldStorage',
  }),
  field('common.weight', 'Weight', undefined, {
    description: 'Weight, including its unit.',
    uiHint: 'TEXT',
    icon: 'fieldWeight',
  }),
  field('devices.ingressProtection', 'Ingress protection', undefined, {
    description:
      'Portable, outdoor or installed devices with relevant physical specifications. Devices with a manufacturer-declared IP rating.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('devices.operatingTemperature', 'Operating temperature', undefined, {
    description:
      'Portable, outdoor or installed devices with relevant physical specifications. Devices with a stated operating range. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldTemperature',
  }),
  field('vehicles.vehicleType', 'Vehicle type', undefined, {
    description: 'Vehicles with the corresponding identity and registration details.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('vehicles.modelYear', 'Model year', undefined, {
    description: 'Vehicles with the corresponding identity and registration details.',
    uiHint: 'TEXT',
    icon: 'fieldModel',
  }),
  field('vehicles.registration', 'Registration', undefined, {
    description:
      'Vehicles with the corresponding identity and registration details. Vehicles registered with a road or vessel authority; retain jurisdiction-specific format.',
    uiHint: 'TEXT',
    icon: 'fieldVehicle',
  }),
  field('vehicles.registrationCountry', 'Registration country', undefined, {
    description:
      'Vehicles with the corresponding identity and registration details. Registered vehicles.',
    uiHint: 'TEXT',
    icon: 'fieldCount',
  }),
  field('vehicles.vin', 'VIN', undefined, {
    description:
      'Vehicles with the corresponding identity and registration details. Vehicles assigned a VIN; synthetic example.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field(
    'vehicles.firstRegistered',
    'First registered',
    { type: 'string', format: 'date' },
    {
      description:
        'Vehicles with the corresponding identity and registration details. Registered vehicles.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field('vehicles.colour', 'Colour', undefined, {
    description: 'Vehicles with the corresponding identity and registration details.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field(
    'vehicles.seats',
    'Seats',
    { type: 'integer', minimum: 1, maximum: 99 },
    {
      description:
        'Road motor vehicles with the corresponding operating specification. Includes vans fitted with passenger seats.',
      uiHint: 'NUMBER',
      icon: 'fieldSeats',
    },
  ),
  field('vehicles.fuelOrPowerType', 'Fuel or power type', undefined, {
    description: 'Road motor vehicles with the corresponding operating specification.',
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field('vehicles.transmission', 'Transmission', undefined, {
    description: 'Road motor vehicles with the corresponding operating specification.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('vehicles.engineCapacity', 'Engine capacity', undefined, {
    description:
      'Road motor vehicles with the corresponding operating specification. Vehicles with a combustion engine. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldFuel',
  }),
  field('vehicles.fuelTankCapacity', 'Fuel tank capacity', undefined, {
    description:
      'Road motor vehicles with the corresponding operating specification. Vehicles with a fuel tank. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldWater',
  }),
  field('vehicles.emissionStandard', 'Emission standard', undefined, {
    description:
      'Road motor vehicles with the corresponding operating specification. Vehicles with a declared emissions classification.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('vehicles.frontTyreSpecification', 'Front tyre specification', undefined, {
    description: 'Road motor vehicles with the corresponding operating specification.',
    uiHint: 'TEXT',
    icon: 'fieldModel',
  }),
  field('vehicles.rearTyreSpecification', 'Rear tyre specification', undefined, {
    description: 'Road motor vehicles with the corresponding operating specification.',
    uiHint: 'TEXT',
    icon: 'fieldModel',
  }),
  field('vehicles.frontTyrePressure', 'Front tyre pressure', undefined, {
    description:
      "Road motor vehicles with the corresponding operating specification. Use the manufacturer's load-specific value. Retain units, precision and any measurement or allowance basis.",
    uiHint: 'TEXT',
    icon: 'fieldVehicle',
  }),
  field('vehicles.rearTyrePressure', 'Rear tyre pressure', undefined, {
    description:
      "Road motor vehicles with the corresponding operating specification. Use the manufacturer's load-specific value. Retain units, precision and any measurement or allowance basis.",
    uiHint: 'TEXT',
    icon: 'fieldVehicle',
  }),
  field('vehicles.roadworthinessTestScheme', 'Roadworthiness test scheme', undefined, {
    description:
      'Vehicles subject to the named inspection, registration or maintenance requirement.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('vehicles.serviceMileageInterval', 'Service mileage interval', undefined, {
    description:
      'Vehicles subject to the named inspection, registration or maintenance requirement. Vehicles with distance-based maintenance intervals. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldTime',
  }),
  field(
    'vehicles.payloadKg',
    'Payload (kg)',
    { type: 'number', minimum: 0 },
    { description: 'Maximum payload in kilograms.', uiHint: 'NUMBER', icon: 'fieldWeight' },
  ),
  field('vehicles.cargoLength', 'Cargo length', undefined, {
    description:
      'Vans, pickups and other goods-carrying vehicles with manufacturer load specifications. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('vehicles.cargoWidth', 'Cargo width', undefined, {
    description:
      'Vans, pickups and other goods-carrying vehicles with manufacturer load specifications. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('vehicles.cargoWidthBetweenWheelArches', 'Cargo width between wheel arches', undefined, {
    description:
      'Vans, pickups and other goods-carrying vehicles with manufacturer load specifications. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('vehicles.cargoHeight', 'Cargo height', undefined, {
    description:
      'Vans, pickups and other goods-carrying vehicles with manufacturer load specifications. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('vehicles.cargoVolume', 'Cargo volume', undefined, {
    description:
      'Vans, pickups and other goods-carrying vehicles with manufacturer load specifications. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('vehicles.roofLoadLimit', 'Roof load limit', undefined, {
    description:
      'Vans, pickups and other goods-carrying vehicles with manufacturer load specifications. Vehicles with a stated roof load limit. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldWeight',
  }),
  field('vehicles.maximumAuthorisedMass', 'Maximum authorised mass', undefined, {
    description:
      'Vehicles and trailers with plated mass or towing limits. The permitted total laden vehicle mass. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldWeight',
  }),
  field('vehicles.grossTrainWeight', 'Gross train weight', undefined, {
    description:
      'Vehicles and trailers with plated mass or towing limits. Vehicles with a plated combined vehicle-and-trailer mass limit. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldWeight',
  }),
  field('vehicles.brakedTowingLimit', 'Braked towing limit', undefined, {
    description:
      'Vehicles and trailers with plated mass or towing limits. Vehicles approved to tow a braked trailer. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldWeight',
  }),
  field('vehicles.unbrakedTowingLimit', 'Unbraked towing limit', undefined, {
    description:
      'Vehicles and trailers with plated mass or towing limits. Vehicles approved to tow an unbraked trailer. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldWeight',
  }),
  field('vehicles.usableTractionBatteryCapacity', 'Usable traction battery capacity', undefined, {
    description:
      'Battery-electric and plug-in hybrid road vehicles with charging specifications. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldBattery',
  }),
  field('vehicles.acChargingConnector', 'AC charging connector', undefined, {
    description: 'Battery-electric and plug-in hybrid road vehicles with charging specifications.',
    uiHint: 'TEXT',
    icon: 'fieldBattery',
  }),
  field('vehicles.dcChargingConnector', 'DC charging connector', undefined, {
    description:
      'Battery-electric and plug-in hybrid road vehicles with charging specifications. Vehicles supporting DC charging.',
    uiHint: 'TEXT',
    icon: 'fieldBattery',
  }),
  field('vehicles.maximumAcChargePower', 'Maximum AC charge power', undefined, {
    description:
      'Battery-electric and plug-in hybrid road vehicles with charging specifications. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('vehicles.maximumDcChargePower', 'Maximum DC charge power', undefined, {
    description:
      'Battery-electric and plug-in hybrid road vehicles with charging specifications. Vehicles supporting DC charging. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field(
    'vehicles.batteryWarrantyEnds',
    'Battery warranty ends',
    { type: 'string', format: 'date' },
    {
      description:
        'Battery-electric and plug-in hybrid road vehicles with charging specifications. Vehicles with separate traction-battery warranty cover.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field('vehicles.batteryWarrantyDistanceLimit', 'Battery warranty distance limit', undefined, {
    description:
      'Battery-electric and plug-in hybrid road vehicles with charging specifications. Vehicles whose battery warranty includes a distance limit. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldBattery',
  }),
  field('vehicles.frameNumber', 'Frame number', undefined, {
    description: 'Bicycles, cargo cycles and e-bikes with the corresponding specification.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('vehicles.frameSize', 'Frame size', undefined, {
    description:
      'Bicycles, cargo cycles and e-bikes with the corresponding specification. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('vehicles.wheelSize', 'Wheel size', undefined, {
    description: 'Bicycles, cargo cycles and e-bikes with the corresponding specification.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('vehicles.brakeType', 'Brake type', undefined, {
    description: 'Bicycles, cargo cycles and e-bikes with the corresponding specification.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('vehicles.drivetrain', 'Drivetrain', undefined, {
    description: 'Bicycles, cargo cycles and e-bikes with the corresponding specification.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('vehicles.cycleBatteryCapacity', 'Cycle battery capacity', undefined, {
    description:
      'Bicycles, cargo cycles and e-bikes with the corresponding specification. Electrically assisted cycles. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldBattery',
  }),
  field('vehicles.cycleBatteryModel', 'Cycle battery model', undefined, {
    description:
      'Bicycles, cargo cycles and e-bikes with the corresponding specification. Electrically assisted cycles with identifiable battery packs.',
    uiHint: 'TEXT',
    icon: 'fieldBattery',
  }),
  field('vehicles.finalDrive', 'Final drive', undefined, {
    description: 'Motorcycles and scooters with the corresponding service specification.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('vehicles.chainSpecification', 'Chain specification', undefined, {
    description:
      'Motorcycles and scooters with the corresponding service specification. Vehicles with chain final drive.',
    uiHint: 'TEXT',
    icon: 'fieldModel',
  }),
  field(
    'vehicles.berths',
    'Berths',
    { type: 'integer', minimum: 0 },
    {
      description: 'Caravans, motorhomes and campervans with accommodation equipment.',
      uiHint: 'NUMBER',
      icon: 'fieldCount',
    },
  ),
  field('vehicles.freshWaterTankCapacity', 'Fresh-water tank capacity', undefined, {
    description:
      'Caravans, motorhomes and campervans with accommodation equipment. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldWater',
  }),
  field('vehicles.wasteWaterTankCapacity', 'Waste-water tank capacity', undefined, {
    description:
      'Caravans, motorhomes and campervans with accommodation equipment. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldWater',
  }),
  field('vehicles.hullIdentificationNumber', 'Hull identification number', undefined, {
    description:
      'Boats and personal watercraft with the corresponding vessel details. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('vehicles.hullLength', 'Hull length', undefined, {
    description: 'Boats and personal watercraft with the corresponding vessel details.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('vehicles.beam', 'Beam', undefined, {
    description: 'Boats and personal watercraft with the corresponding vessel details.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('vehicles.draft', 'Draft', undefined, {
    description: 'Boats and personal watercraft with the corresponding vessel details.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('vehicles.engineSerialNumber', 'Engine serial number', undefined, {
    description:
      'Boats and personal watercraft with the corresponding vessel details. Craft with an identified propulsion engine.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('vehicles.financeProvider', 'Finance provider', undefined, {
    description: 'Leased or financed vehicles with contractual limits.',
    uiHint: 'TEXT',
    icon: 'fieldManufacturer',
  }),
  field('vehicles.agreementReference', 'Agreement reference', undefined, {
    description: 'Leased or financed vehicles with contractual limits.',
    uiHint: 'TEXT',
    icon: 'fieldModel',
  }),
  field(
    'vehicles.agreementEnds',
    'Agreement ends',
    { type: 'string', format: 'date' },
    {
      description: 'Leased or financed vehicles with contractual limits.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field('vehicles.annualMileageAllowance', 'Annual mileage allowance', undefined, {
    description:
      'Leased or financed vehicles with contractual limits. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldSpeed',
  }),
  field('vehicles.excessMileageCharge', 'Excess mileage charge', undefined, {
    description:
      'Leased or financed vehicles with contractual limits. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('membership.provider', 'Provider', undefined, {
    description: 'Memberships with provider-managed accounts or agreements.',
    uiHint: 'TEXT',
    icon: 'fieldManufacturer',
  }),
  field('common.accountNumber', 'Account number', undefined, {
    description: 'Account number.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('common.accountHolder', 'Account holder', undefined, {
    description: 'Account holder.',
    uiHint: 'TEXT',
    icon: 'fieldPerson',
  }),
  field('common.accountEmail', 'Account email', undefined, {
    description: 'Account email.',
    uiHint: 'TEXT',
    icon: 'fieldEmail',
  }),
  field('common.accountPortal', 'Account portal', undefined, {
    description: 'Account portal.',
    uiHint: 'TEXT',
    icon: 'fieldLink',
  }),
  field(
    'common.startsOn',
    'Starts on',
    { type: 'string', format: 'date' },
    { description: 'Starts on.', uiHint: 'DATE', icon: 'fieldDate' },
  ),
  field('common.recurringCharge', 'Recurring charge', moneySchema, {
    description:
      'Recurring payment amount, including currency. The billing interval specifies the payment period.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('common.billingInterval', 'Billing interval', undefined, {
    description: 'Billing interval.',
    uiHint: 'TEXT',
    icon: 'fieldTime',
  }),
  field('common.paymentMethod', 'Payment method', undefined, {
    description: 'Payment method.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field(
    'common.minimumTermEnds',
    'Minimum term ends',
    { type: 'string', format: 'date' },
    { description: 'Minimum term ends.', uiHint: 'DATE', icon: 'fieldDate' },
  ),
  field('common.cancellationNotice', 'Cancellation notice', undefined, {
    description:
      'Cancellation notice. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldTime',
  }),
  field('common.cancellationInstructions', 'Cancellation instructions', undefined, {
    description: 'Cancellation instructions.',
    uiHint: 'TEXT',
    icon: 'fieldPolicy',
  }),
  field('membership.number', 'Membership number', undefined, {
    description:
      'Memberships issued by museums, clubs, professional bodies, gyms and similar organisations.',
    uiHint: 'TEXT',
    icon: 'fieldMembership',
  }),
  field('membership.level', 'Membership type', undefined, {
    description:
      'Memberships issued by museums, clubs, professional bodies, gyms and similar organisations. Provider-defined plan type; possible types include corporate, student and lifetime.',
    uiHint: 'TEXT',
    icon: 'fieldLevel',
  }),
  field('memberships.membershipTier', 'Membership tier', undefined, {
    description:
      'Memberships issued by museums, clubs, professional bodies, gyms and similar organisations. Where a separate tier or status exists.',
    uiHint: 'TEXT',
    icon: 'fieldAccount',
  }),
  field(
    'memberships.memberSince',
    'Member since',
    { type: 'string', format: 'date' },
    {
      description:
        'Memberships issued by museums, clubs, professional bodies, gyms and similar organisations. Original joining date, which may precede the current membership term.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field(
    'membership.expires',
    'Current term ends',
    { type: 'string', format: 'date' },
    {
      description:
        'Memberships issued by museums, clubs, professional bodies, gyms and similar organisations. Fixed-period memberships.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field(
    'membership.autoRenew',
    'Automatically renew',
    { type: 'boolean' },
    {
      description:
        'Memberships issued by museums, clubs, professional bodies, gyms and similar organisations. Memberships offering automatic renewal.',
      uiHint: 'CHECKBOX',
      icon: 'fieldRenewal',
    },
  ),
  field('memberships.namedMembers', 'Named members', undefined, {
    description:
      'Memberships issued by museums, clubs, professional bodies, gyms and similar organisations. Joint, family or group memberships with named people.',
    uiHint: 'TEXT',
    icon: 'fieldPerson',
  }),
  field(
    'membership.accessPin',
    'Access PIN',
    { type: 'string', minLength: 4, maxLength: 12, pattern: '^[0-9]+$' },
    {
      description:
        'Memberships issued by museums, clubs, professional bodies, gyms and similar organisations. Memberships using a private access code; treat as sensitive.',
      uiHint: 'PASSWORD',
      sensitive: true,
      icon: 'fieldAccessCode',
    },
  ),
  field('memberships.includedVenues', 'Included venues', undefined, {
    description:
      'Museum, gallery, heritage, zoo and attraction memberships with the corresponding benefit.',
    uiHint: 'TEXT',
    icon: 'fieldAddress',
  }),
  field('memberships.guestAllowance', 'Guest allowance', undefined, {
    description:
      'Museum, gallery, heritage, zoo and attraction memberships with the corresponding benefit. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldPerson',
  }),
  field('memberships.childAllowance', 'Child allowance', undefined, {
    description:
      'Museum, gallery, heritage, zoo and attraction memberships with the corresponding benefit. Family plans with child eligibility rules.',
    uiHint: 'TEXT',
    icon: 'fieldPerson',
  }),
  field('memberships.bookingRequirement', 'Booking requirement', undefined, {
    description:
      'Museum, gallery, heritage, zoo and attraction memberships with the corresponding benefit.',
    uiHint: 'TEXT',
    icon: 'fieldPolicy',
  }),
  field('memberships.parkingBenefit', 'Parking benefit', undefined, {
    description:
      'Museum, gallery, heritage, zoo and attraction memberships with the corresponding benefit.',
    uiHint: 'TEXT',
    icon: 'fieldVehicle',
  }),
  field('memberships.reciprocalAccess', 'Reciprocal access', undefined, {
    description:
      'Museum, gallery, heritage, zoo and attraction memberships with the corresponding benefit.',
    uiHint: 'TEXT',
    icon: 'fieldMembership',
  }),
  field('memberships.homeVenue', 'Home venue', undefined, {
    description: 'Gym, pool, sports club and leisure memberships with access conditions.',
    uiHint: 'TEXT',
    icon: 'fieldAddress',
  }),
  field('memberships.otherIncludedVenues', 'Other included venues', undefined, {
    description:
      'Gym, pool, sports club and leisure memberships with access conditions. Memberships with multi-site access.',
    uiHint: 'TEXT',
    icon: 'fieldAddress',
  }),
  field('memberships.accessTimes', 'Access times', undefined, {
    description:
      'Gym, pool, sports club and leisure memberships with access conditions. Memberships with time restrictions.',
    uiHint: 'TEXT',
    icon: 'fieldTime',
  }),
  field('memberships.includedClasses', 'Included classes', undefined, {
    description:
      'Gym, pool, sports club and leisure memberships with access conditions. Plans with a class allowance. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMembership',
  }),
  field('memberships.guestPasses', 'Guest passes', undefined, {
    description:
      'Gym, pool, sports club and leisure memberships with access conditions. Plans granting guest passes. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldPerson',
  }),
  field('memberships.freezeAllowance', 'Freeze allowance', undefined, {
    description:
      'Gym, pool, sports club and leisure memberships with access conditions. Plans allowing suspension. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldTime',
  }),
  field('memberships.lockerNumber', 'Locker number', undefined, {
    description:
      'Gym, pool, sports club and leisure memberships with access conditions. Memberships with an allocated locker. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('memberships.professionalGrade', 'Professional grade', undefined, {
    description:
      'Professional association, union or accreditation memberships with the corresponding requirement.',
    uiHint: 'TEXT',
    icon: 'fieldLevel',
  }),
  field('memberships.registrationNumber', 'Registration number', undefined, {
    description:
      'Professional association, union or accreditation memberships with the corresponding requirement. Where registration has an identifier separate from membership.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('memberships.cpdRequirement', 'CPD requirement', undefined, {
    description:
      'Professional association, union or accreditation memberships with the corresponding requirement. Memberships requiring continuing professional development. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldPolicy',
  }),
  field(
    'memberships.accreditationExpires',
    'Accreditation expires',
    { type: 'string', format: 'date' },
    {
      description:
        'Professional association, union or accreditation memberships with the corresponding requirement. Time-limited accreditation attached to membership.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field('memberships.borrowingLimit', 'Borrowing limit', undefined, {
    description: 'Library and lending-club memberships with borrowing entitlements.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('memberships.standardLoanPeriod', 'Standard loan period', undefined, {
    description:
      'Library and lending-club memberships with borrowing entitlements. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldTime',
  }),
  field('memberships.homeBranch', 'Home branch', undefined, {
    description: 'Library and lending-club memberships with borrowing entitlements.',
    uiHint: 'TEXT',
    icon: 'fieldAddress',
  }),
  field('memberships.loyaltyNumber', 'Loyalty number', undefined, {
    description: 'Loyalty schemes and travel clubs with points or status benefits.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('memberships.statusTier', 'Status tier', undefined, {
    description: 'Loyalty schemes and travel clubs with points or status benefits.',
    uiHint: 'TEXT',
    icon: 'fieldLevel',
  }),
  field('memberships.homeWorkspace', 'Home workspace', undefined, {
    description: 'Coworking, makerspace and workspace memberships with usage allowances.',
    uiHint: 'TEXT',
    icon: 'fieldAddress',
  }),
  field('memberships.includedWorkspaceDays', 'Included workspace days', undefined, {
    description:
      'Coworking, makerspace and workspace memberships with usage allowances. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldAddress',
  }),
  field('memberships.meetingRoomAllowance', 'Meeting room allowance', undefined, {
    description:
      'Coworking, makerspace and workspace memberships with usage allowances. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldTime',
  }),
  field('memberships.equipmentAccess', 'Equipment access', undefined, {
    description:
      'Coworking, makerspace and workspace memberships with usage allowances. Memberships authorising use of specified equipment or spaces.',
    uiHint: 'TEXT',
    icon: 'fieldMembership',
  }),
  field(
    'memberships.inductionCompleted',
    'Induction completed',
    { type: 'string', format: 'date' },
    {
      description:
        'Coworking, makerspace and workspace memberships with usage allowances. Memberships requiring an induction before access.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field('common.provider', 'Provider', undefined, {
    description: 'Provider.',
    uiHint: 'TEXT',
    icon: 'fieldManufacturer',
  }),
  field('subscriptions.subscriptionReference', 'Subscription reference', undefined, {
    description: 'Subscriptions with a named plan and lifecycle terms.',
    uiHint: 'TEXT',
    icon: 'fieldModel',
  }),
  field('subscriptions.planName', 'Plan name', undefined, {
    description: 'Subscriptions with a named plan and lifecycle terms.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field(
    'common.automaticallyRenew',
    'Automatically renew',
    { type: 'boolean' },
    {
      description: 'Whether the agreement renews automatically.',
      uiHint: 'CHECKBOX',
      icon: 'fieldRenewal',
    },
  ),
  field(
    'subscriptions.accessEnds',
    'Access ends',
    { type: 'string', format: 'date' },
    {
      description:
        'Subscriptions with a named plan and lifecycle terms. Fixed-term or cancelled subscriptions with a known access end date.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field(
    'subscriptions.trialEnds',
    'Trial ends',
    { type: 'string', format: 'date' },
    {
      description:
        'Subscriptions with a named plan and lifecycle terms. Subscriptions in a trial period.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field(
    'subscriptions.introductoryPriceEnds',
    'Introductory price ends',
    { type: 'string', format: 'date' },
    {
      description:
        'Subscriptions with a named plan and lifecycle terms. Plans with a limited promotional price.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field('subscriptions.postOfferPrice', 'Post-offer price', undefined, {
    description:
      'Subscriptions with a named plan and lifecycle terms. Plans with a documented post-offer charge. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('subscriptions.billedThrough', 'Billed through', undefined, {
    description:
      'Subscriptions with a named plan and lifecycle terms. Subscriptions billed by an intermediary.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('subscriptions.includedServices', 'Included services', undefined, {
    description:
      'Streaming video, music and gaming subscriptions with the corresponding entitlement. Bundles with more than one service.',
    uiHint: 'TEXT',
    icon: 'fieldService',
  }),
  field(
    'subscriptions.simultaneousStreams',
    'Simultaneous streams',
    { type: 'integer', minimum: 0 },
    {
      description:
        'Streaming video, music and gaming subscriptions with the corresponding entitlement. Streaming plans with a concurrency limit.',
      uiHint: 'NUMBER',
      icon: 'fieldCount',
    },
  ),
  field('subscriptions.maximumVideoQuality', 'Maximum video quality', undefined, {
    description:
      'Streaming video, music and gaming subscriptions with the corresponding entitlement. Video plans.',
    uiHint: 'TEXT',
    icon: 'fieldDisplay',
  }),
  field('subscriptions.advertising', 'Advertising', undefined, {
    description:
      'Streaming video, music and gaming subscriptions with the corresponding entitlement. Plans whose advertising level varies.',
    uiHint: 'TEXT',
    icon: 'fieldDisplay',
  }),
  field('subscriptions.offlineDownloads', 'Offline downloads', undefined, {
    description:
      'Streaming video, music and gaming subscriptions with the corresponding entitlement. Plans supporting offline content.',
    uiHint: 'TEXT',
    icon: 'fieldStorage',
  }),
  field('subscriptions.extraMemberAllowance', 'Extra member allowance', undefined, {
    description:
      'Streaming video, music and gaming subscriptions with the corresponding entitlement. Plans permitting additional members outside the primary account.',
    uiHint: 'TEXT',
    icon: 'fieldAccount',
  }),
  field(
    'subscriptions.licensedUsers',
    'Licensed users',
    { type: 'integer', minimum: 0 },
    {
      description: 'Software and cloud subscriptions with user or resource entitlements.',
      uiHint: 'NUMBER',
      icon: 'fieldCount',
    },
  ),
  field('subscriptions.activatedDeviceLimit', 'Activated device limit', undefined, {
    description:
      'Software and cloud subscriptions with user or resource entitlements. Licences limiting device activation. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('subscriptions.licenceType', 'Licence type', undefined, {
    description: 'Software and cloud subscriptions with user or resource entitlements.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('subscriptions.storageAllowance', 'Storage allowance', undefined, {
    description:
      'Software and cloud subscriptions with user or resource entitlements. Cloud storage plans; preserve whether limits are per user or shared. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldStorage',
  }),
  field('subscriptions.storageRegion', 'Storage region', undefined, {
    description:
      'Software and cloud subscriptions with user or resource entitlements. Plans with a selected or contractually specified data region.',
    uiHint: 'TEXT',
    icon: 'fieldStorage',
  }),
  field('subscriptions.usageAllowance', 'Usage allowance', undefined, {
    description:
      'Software and cloud subscriptions with user or resource entitlements. Metered plans. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldStorage',
  }),
  field('subscriptions.allowanceResets', 'Allowance resets', undefined, {
    description:
      'Software and cloud subscriptions with user or resource entitlements. Plans with renewing quotas.',
    uiHint: 'TEXT',
    icon: 'fieldRenewal',
  }),
  field('subscriptions.overagePrice', 'Overage price', undefined, {
    description:
      'Software and cloud subscriptions with user or resource entitlements. Plans charging above the included quota. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('subscriptions.licenceKey', 'Licence key', undefined, {
    description:
      'Software and cloud subscriptions with user or resource entitlements. Software requiring a private activation key; treat as sensitive.',
    uiHint: 'PASSWORD',
    sensitive: true,
    icon: 'fieldAccessCode',
  }),
  field('subscriptions.deliveryAddress', 'Delivery address', undefined, {
    description: 'Print publications, meal kits, consumables and other delivery subscriptions.',
    uiHint: 'TEXT',
    icon: 'fieldAddress',
  }),
  field('subscriptions.deliveryFrequency', 'Delivery frequency', undefined, {
    description: 'Print publications, meal kits, consumables and other delivery subscriptions.',
    uiHint: 'TEXT',
    icon: 'fieldTime',
  }),
  field('subscriptions.itemsPerDelivery', 'Items per delivery', undefined, {
    description: 'Print publications, meal kits, consumables and other delivery subscriptions.',
    uiHint: 'TEXT',
    icon: 'fieldDelivery',
  }),
  field('subscriptions.deliveryPreferences', 'Delivery preferences', undefined, {
    description:
      'Print publications, meal kits, consumables and other delivery subscriptions. Plans with user-selected delivery contents.',
    uiHint: 'TEXT',
    icon: 'fieldDelivery',
  }),
  field('subscriptions.domainName', 'Domain name', undefined, {
    description: 'Domain registration, hosting and website subscriptions. Domain registrations.',
    uiHint: 'TEXT',
    icon: 'fieldLink',
  }),
  field(
    'subscriptions.domainExpires',
    'Domain expires',
    { type: 'string', format: 'date' },
    {
      description:
        'Domain registration, hosting and website subscriptions. Domain registrations with a stated expiry.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field('subscriptions.registrar', 'Registrar', undefined, {
    description: 'Domain registration, hosting and website subscriptions. Domain registrations.',
    uiHint: 'TEXT',
    icon: 'fieldManufacturer',
  }),
  field('subscriptions.hostingPackage', 'Hosting package', undefined, {
    description:
      'Domain registration, hosting and website subscriptions. Hosting agreements. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('subscriptions.backupRetention', 'Backup retention', undefined, {
    description:
      'Domain registration, hosting and website subscriptions. Hosting or backup plans with a retention policy. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldTime',
  }),
  field('subscriptions.coveredItemOrProperty', 'Covered item or property', undefined, {
    description:
      'Home monitoring, maintenance and other service subscriptions with scheduled benefits.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('subscriptions.includedVisits', 'Included visits', undefined, {
    description:
      'Home monitoring, maintenance and other service subscriptions with scheduled benefits. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldService',
  }),
  field('subscriptions.serviceBookingPage', 'Service booking page', undefined, {
    description:
      'Home monitoring, maintenance and other service subscriptions with scheduled benefits.',
    uiHint: 'TEXT',
    icon: 'fieldLink',
  }),
  field('subscriptions.monitoringLevel', 'Monitoring level', undefined, {
    description:
      'Home monitoring, maintenance and other service subscriptions with scheduled benefits. Alarm or monitoring subscriptions.',
    uiHint: 'TEXT',
    icon: 'fieldLevel',
  }),
  field('subscriptions.recordingRetention', 'Recording retention', undefined, {
    description:
      'Home monitoring, maintenance and other service subscriptions with scheduled benefits. Camera recording subscriptions. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldTime',
  }),
  field('subscriptions.emergencyResponseTerms', 'Emergency response terms', undefined, {
    description:
      'Home monitoring, maintenance and other service subscriptions with scheduled benefits. Plans offering a documented response commitment. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldPolicy',
  }),
  field('utilities.supplyAddress', 'Supply address', undefined, {
    description: 'Utility accounts tied to a supplied property or service location.',
    uiHint: 'TEXT',
    icon: 'fieldAddress',
  }),
  field('utilities.serviceType', 'Service type', undefined, {
    description: 'Utility accounts tied to a supplied property or service location.',
    uiHint: 'TEXT',
    icon: 'fieldService',
  }),
  field('utilities.tariffName', 'Tariff name', undefined, {
    description: 'Utility accounts tied to a supplied property or service location.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('utilities.tariffType', 'Tariff type', undefined, {
    description: 'Utility accounts tied to a supplied property or service location.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field(
    'utilities.tariffStarts',
    'Tariff starts',
    { type: 'string', format: 'date' },
    {
      description: 'Utility accounts tied to a supplied property or service location.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field(
    'utilities.tariffEnds',
    'Tariff ends',
    { type: 'string', format: 'date' },
    {
      description:
        'Utility accounts tied to a supplied property or service location. Time-limited tariffs.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field('utilities.exitFee', 'Exit fee', undefined, {
    description:
      'Utility accounts tied to a supplied property or service location. Tariffs with an early exit charge; preserve its charging basis. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('utilities.electricitySupplier', 'Electricity supplier', undefined, {
    description:
      'Electricity supplies, including the electricity component of dual-fuel accounts. Where the service-specific supplier needs identifying.',
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field('utilities.electricityTariffName', 'Electricity tariff name', undefined, {
    description: 'Electricity supplies, including the electricity component of dual-fuel accounts.',
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field(
    'utilities.electricityTariffEnds',
    'Electricity tariff ends',
    { type: 'string', format: 'date' },
    {
      description:
        'Electricity supplies, including the electricity component of dual-fuel accounts. Electricity tariffs with an expiry date.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field('utilities.electricityMeterPointMpan', 'Electricity meter point (MPAN)', undefined, {
    description:
      'Electricity supplies, including the electricity component of dual-fuel accounts. Great Britain electricity supplies using an MPAN; synthetic identifier.',
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field('utilities.electricitySupplyPointCpe', 'Electricity supply point (CPE)', undefined, {
    description:
      'Electricity supplies, including the electricity component of dual-fuel accounts. Portuguese electricity supplies using a CPE; placeholder identifier.',
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field('utilities.electricityMeterSerial', 'Electricity meter serial', undefined, {
    description: 'Electricity supplies, including the electricity component of dual-fuel accounts.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('utilities.electricityMeterType', 'Electricity meter type', undefined, {
    description: 'Electricity supplies, including the electricity component of dual-fuel accounts.',
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field('utilities.electricityUnitRate', 'Electricity unit rate', undefined, {
    description:
      'Electricity supplies, including the electricity component of dual-fuel accounts. Single-rate electricity tariffs; retain precision beyond whole pence. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('utilities.electricityStandingCharge', 'Electricity standing charge', undefined, {
    description:
      'Electricity supplies, including the electricity component of dual-fuel accounts. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field(
    'utilities.electricityRateEffectiveFrom',
    'Electricity rate effective from',
    { type: 'string', format: 'date' },
    {
      description:
        'Electricity supplies, including the electricity component of dual-fuel accounts. Date the recorded electricity prices take effect.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field('utilities.electricityRateTaxBasis', 'Electricity rate tax basis', undefined, {
    description:
      'Electricity supplies, including the electricity component of dual-fuel accounts. Recorded electricity prices.',
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field('utilities.electricityExitFee', 'Electricity exit fee', moneySchema, {
    description:
      'Electricity supplies, including the electricity component of dual-fuel accounts. Electricity-specific early exit charge in a bundled account.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('utilities.peakElectricityRate', 'Peak electricity rate', undefined, {
    description:
      'Electricity tariffs with time-dependent import or export rates. Multi-rate import tariffs. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('utilities.offPeakElectricityRate', 'Off-peak electricity rate', undefined, {
    description:
      'Electricity tariffs with time-dependent import or export rates. Multi-rate import tariffs. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('utilities.offPeakHours', 'Off-peak hours', undefined, {
    description:
      'Electricity tariffs with time-dependent import or export rates. Include timezone and any seasonal clock rules in the tariff.',
    uiHint: 'TEXT',
    icon: 'fieldTime',
  }),
  field('utilities.dynamicRateSchedule', 'Dynamic rate schedule', undefined, {
    description:
      'Electricity tariffs with time-dependent import or export rates. Tariffs whose rates vary by settlement period.',
    uiHint: 'TEXT',
    icon: 'fieldLink',
  }),
  field('utilities.electricityExportRate', 'Electricity export rate', undefined, {
    description:
      'Electricity tariffs with time-dependent import or export rates. Supplies receiving payment for exported generation. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('utilities.exportMeterPoint', 'Export meter point', undefined, {
    description:
      'Electricity tariffs with time-dependent import or export rates. Export supplies assigned a separate meter-point identifier; synthetic example.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('utilities.contractedPower', 'Contracted power', undefined, {
    description:
      'Electricity supplies whose contract specifies a power tier, including Portuguese electricity contracts.',
    uiHint: 'TEXT',
    icon: 'fieldPower',
  }),
  field('utilities.gasSupplier', 'Gas supplier', undefined, {
    description: 'Gas supplies, including the gas component of dual-fuel accounts.',
    uiHint: 'TEXT',
    icon: 'fieldFuel',
  }),
  field('utilities.gasTariffName', 'Gas tariff name', undefined, {
    description: 'Gas supplies, including the gas component of dual-fuel accounts.',
    uiHint: 'TEXT',
    icon: 'fieldFuel',
  }),
  field(
    'utilities.gasTariffEnds',
    'Gas tariff ends',
    { type: 'string', format: 'date' },
    {
      description:
        'Gas supplies, including the gas component of dual-fuel accounts. Gas tariffs with an expiry date.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field('utilities.gasMeterPointMprn', 'Gas meter point (MPRN)', undefined, {
    description:
      'Gas supplies, including the gas component of dual-fuel accounts. Great Britain gas supplies using an MPRN; synthetic identifier.',
    uiHint: 'TEXT',
    icon: 'fieldFuel',
  }),
  field('utilities.gasMeterSerial', 'Gas meter serial', undefined, {
    description: 'Gas supplies, including the gas component of dual-fuel accounts.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('utilities.gasMeterUnits', 'Gas meter units', undefined, {
    description:
      'Gas supplies, including the gas component of dual-fuel accounts. Retain meter units separately from billed kWh.',
    uiHint: 'TEXT',
    icon: 'fieldFuel',
  }),
  field('utilities.gasUnitRate', 'Gas unit rate', undefined, {
    description:
      'Gas supplies, including the gas component of dual-fuel accounts. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('utilities.gasStandingCharge', 'Gas standing charge', undefined, {
    description:
      'Gas supplies, including the gas component of dual-fuel accounts. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field(
    'utilities.gasRateEffectiveFrom',
    'Gas rate effective from',
    { type: 'string', format: 'date' },
    {
      description: 'Gas supplies, including the gas component of dual-fuel accounts.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field('utilities.gasRateTaxBasis', 'Gas rate tax basis', undefined, {
    description: 'Gas supplies, including the gas component of dual-fuel accounts.',
    uiHint: 'TEXT',
    icon: 'fieldFuel',
  }),
  field('utilities.gasExitFee', 'Gas exit fee', moneySchema, {
    description:
      'Gas supplies, including the gas component of dual-fuel accounts. Gas-specific early exit charge in a bundled account.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('utilities.waterSupplier', 'Water supplier', undefined, {
    description: 'Water and wastewater accounts with the corresponding charging basis.',
    uiHint: 'TEXT',
    icon: 'fieldWater',
  }),
  field('utilities.wastewaterProvider', 'Wastewater provider', undefined, {
    description:
      'Water and wastewater accounts with the corresponding charging basis. Accounts including wastewater services, which may have a different provider.',
    uiHint: 'TEXT',
    icon: 'fieldWater',
  }),
  field('utilities.waterChargingBasis', 'Water charging basis', undefined, {
    description: 'Water and wastewater accounts with the corresponding charging basis.',
    uiHint: 'TEXT',
    icon: 'fieldBattery',
  }),
  field('utilities.waterMeterSerial', 'Water meter serial', undefined, {
    description:
      'Water and wastewater accounts with the corresponding charging basis. Metered supplies.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('utilities.waterUnitRate', 'Water unit rate', undefined, {
    description:
      'Water and wastewater accounts with the corresponding charging basis. Metered water charges. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('utilities.waterFixedCharge', 'Water fixed charge', undefined, {
    description:
      'Water and wastewater accounts with the corresponding charging basis. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('utilities.wastewaterUnitRate', 'Wastewater unit rate', undefined, {
    description:
      'Water and wastewater accounts with the corresponding charging basis. Usage-based wastewater charges. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('utilities.wastewaterFixedCharge', 'Wastewater fixed charge', undefined, {
    description:
      'Water and wastewater accounts with the corresponding charging basis. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field(
    'utilities.waterChargesEffectiveFrom',
    'Water charges effective from',
    { type: 'string', format: 'date' },
    {
      description: 'Water and wastewater accounts with the corresponding charging basis.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field('utilities.rateableValue', 'Rateable value', moneySchema, {
    description:
      'Water and wastewater accounts with the corresponding charging basis. Unmetered accounts using a property rateable value as their charging basis.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('utilities.broadbandPlan', 'Broadband plan', undefined, {
    description: 'Broadband and landline services, including their components within bundles.',
    uiHint: 'TEXT',
    icon: 'fieldNetwork',
  }),
  field('utilities.broadbandTechnology', 'Broadband technology', undefined, {
    description: 'Broadband and landline services, including their components within bundles.',
    uiHint: 'TEXT',
    icon: 'fieldNetwork',
  }),
  field('utilities.advertisedDownloadSpeed', 'Advertised download speed', undefined, {
    description: 'Broadband and landline services, including their components within bundles.',
    uiHint: 'TEXT',
    icon: 'fieldSpeed',
  }),
  field('utilities.estimatedDownloadSpeed', 'Estimated download speed', undefined, {
    description:
      'Broadband and landline services, including their components within bundles. Contracts providing an estimated range.',
    uiHint: 'TEXT',
    icon: 'fieldSpeed',
  }),
  field(
    'utilities.minimumGuaranteedDownloadSpeed',
    'Minimum guaranteed download speed',
    undefined,
    {
      description:
        'Broadband and landline services, including their components within bundles. Contracts providing a guarantee.',
      uiHint: 'TEXT',
      icon: 'fieldSpeed',
    },
  ),
  field('utilities.uploadSpeed', 'Upload speed', undefined, {
    description: 'Broadband and landline services, including their components within bundles.',
    uiHint: 'TEXT',
    icon: 'fieldSpeed',
  }),
  field('utilities.dataAllowance', 'Data allowance', undefined, {
    description: 'Broadband and landline services, including their components within bundles.',
    uiHint: 'TEXT',
    icon: 'fieldStorage',
  }),
  field('utilities.landlineNumber', 'Landline number', undefined, {
    description:
      'Broadband and landline services, including their components within bundles. Services with a telephone number.',
    uiHint: 'TEXT',
    icon: 'fieldPhone',
  }),
  field('utilities.includedCalls', 'Included calls', undefined, {
    description:
      'Broadband and landline services, including their components within bundles. Plans with a call bundle.',
    uiHint: 'TEXT',
    icon: 'fieldPhone',
  }),
  field('utilities.routerOwnership', 'Router ownership', undefined, {
    description:
      'Broadband and landline services, including their components within bundles. Services supplying a router.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('utilities.mobileNumber', 'Mobile number', undefined, {
    description: 'Mobile and mobile-data service contracts.',
    uiHint: 'TEXT',
    icon: 'fieldPhone',
  }),
  field('utilities.mobileNetwork', 'Mobile network', undefined, {
    description: 'Mobile and mobile-data service contracts.',
    uiHint: 'TEXT',
    icon: 'fieldNetwork',
  }),
  field('utilities.simIdentifierIccid', 'SIM identifier (ICCID)', undefined, {
    description:
      'Mobile and mobile-data service contracts. The service SIM identity; synthetic example.',
    uiHint: 'TEXT',
    icon: 'fieldSerial',
  }),
  field('utilities.mobileDataAllowance', 'Mobile data allowance', undefined, {
    description:
      'Mobile and mobile-data service contracts. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldStorage',
  }),
  field('utilities.includedMinutes', 'Included minutes', undefined, {
    description: 'Mobile and mobile-data service contracts.',
    uiHint: 'TEXT',
    icon: 'fieldTime',
  }),
  field('utilities.roamingAllowance', 'Roaming allowance', undefined, {
    description:
      'Mobile and mobile-data service contracts. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldNetwork',
  }),
  field('utilities.roamingDestinations', 'Roaming destinations', undefined, {
    description: 'Mobile and mobile-data service contracts.',
    uiHint: 'TEXT',
    icon: 'fieldNetwork',
  }),
  field('utilities.spendingCap', 'Spending cap', undefined, {
    description:
      'Mobile and mobile-data service contracts. Contracts with an account spending cap. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('utilities.handsetInstalment', 'Handset instalment', undefined, {
    description:
      'Mobile and mobile-data service contracts. Bundles with a separately priced handset repayment. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field(
    'utilities.handsetRepaymentEnds',
    'Handset repayment ends',
    { type: 'string', format: 'date' },
    {
      description:
        'Mobile and mobile-data service contracts. Handset finance bundled with airtime.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field('utilities.heatUnitRate', 'Heat unit rate', undefined, {
    description:
      'Heating networks, delivered fuels and waste-collection services. Metered district or communal heating supplies. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('utilities.heatStandingCharge', 'Heat standing charge', undefined, {
    description:
      'Heating networks, delivered fuels and waste-collection services. Heating networks with a fixed charge. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('utilities.fuelDeliveryUnit', 'Fuel delivery unit', undefined, {
    description:
      'Heating networks, delivered fuels and waste-collection services. Heating oil or LPG delivered by volume.',
    uiHint: 'TEXT',
    icon: 'fieldFuel',
  }),
  field('utilities.fuelTankCapacity', 'Fuel tank capacity', undefined, {
    description:
      'Heating networks, delivered fuels and waste-collection services. Delivered-fuel accounts associated with a storage tank. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldWater',
  }),
  field('utilities.containerSize', 'Container size', undefined, {
    description:
      'Heating networks, delivered fuels and waste-collection services. Waste-collection services with an allocated bin. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('insurance.provider', 'Insurance provider', undefined, {
    description: 'Insurance policies with the corresponding administration or payment detail.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.underwriter', 'Underwriter', undefined, {
    description:
      'Insurance policies with the corresponding administration or payment detail. Where the risk carrier differs from the retail provider.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.broker', 'Broker', undefined, {
    description:
      'Insurance policies with the corresponding administration or payment detail. Broker-arranged policies.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.policyNumber', 'Policy number', undefined, {
    description: 'Insurance policies with the corresponding administration or payment detail.',
    uiHint: 'TEXT',
    icon: 'fieldPolicy',
  }),
  field('insurance.policyholder', 'Policyholder', undefined, {
    description: 'Insurance policies with the corresponding administration or payment detail.',
    uiHint: 'TEXT',
    icon: 'fieldPerson',
  }),
  field('insurance.insuredPeople', 'Insured people', undefined, {
    description:
      'Insurance policies with the corresponding administration or payment detail. Policies covering named people.',
    uiHint: 'TEXT',
    icon: 'fieldPerson',
  }),
  field(
    'insurance.policyStarts',
    'Policy starts',
    { type: 'string', format: 'date' },
    {
      description: 'Insurance policies with the corresponding administration or payment detail.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field(
    'insurance.policyEnds',
    'Policy ends',
    { type: 'string', format: 'date' },
    {
      description: 'Insurance policies with the corresponding administration or payment detail.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field('insurance.annualPremium', 'Annual premium', moneySchema, {
    description:
      'Insurance policies with the corresponding administration or payment detail. The quoted premium for a full policy year.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('insurance.instalmentAmount', 'Instalment amount', moneySchema, {
    description:
      'Insurance policies with the corresponding administration or payment detail. Policies paid in instalments, which may include financing costs.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('insurance.instalmentFrequency', 'Instalment frequency', undefined, {
    description:
      'Insurance policies with the corresponding administration or payment detail. Policies paid in instalments.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('insurance.cancellationTerms', 'Cancellation terms', undefined, {
    description:
      'Insurance policies with the corresponding administration or payment detail. Use the terms stated for the particular policy.',
    uiHint: 'TEXT',
    icon: 'fieldPolicy',
  }),
  field('insurance.claimsPhone', 'Claims phone', undefined, {
    description: 'Insurance policies with the corresponding administration or payment detail.',
    uiHint: 'TEXT',
    icon: 'fieldPhone',
  }),
  field('insurance.claimsPage', 'Claims page', undefined, {
    description: 'Insurance policies with the corresponding administration or payment detail.',
    uiHint: 'TEXT',
    icon: 'fieldLink',
  }),
  field('insurance.emergencyAssistancePhone', 'Emergency assistance phone', undefined, {
    description:
      'Insurance policies with the corresponding administration or payment detail. Policies providing emergency assistance.',
    uiHint: 'TEXT',
    icon: 'fieldPhone',
  }),
  field('insurance.insuredPropertyAddress', 'Insured property address', undefined, {
    description: 'Buildings cover, including the buildings component of combined home insurance.',
    uiHint: 'TEXT',
    icon: 'fieldAddress',
  }),
  field('insurance.sumInsured', 'Sum insured', moneySchema, {
    description: 'Coverage limit, with currency; independent for each cover section.',
    uiHint: 'MONEY',
    icon: 'fieldInsurance',
  }),
  field('insurance.buildingsCoverBasis', 'Buildings cover basis', undefined, {
    description: 'Buildings cover, including the buildings component of combined home insurance.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.excess', 'Excess', moneySchema, {
    description: 'Amount payable per claim, with currency; independent for each cover section.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('insurance.subsidenceExcess', 'Subsidence excess', moneySchema, {
    description:
      'Buildings cover, including the buildings component of combined home insurance. Policies with a separate subsidence excess.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('insurance.buildingsAccidentalDamage', 'Buildings accidental damage', undefined, {
    description: 'Buildings cover, including the buildings component of combined home insurance.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.alternativeAccommodationLimit', 'Alternative accommodation limit', moneySchema, {
    description:
      'Buildings cover, including the buildings component of combined home insurance. Buildings cover providing alternative accommodation.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('insurance.contentsCoverBasis', 'Contents cover basis', undefined, {
    description: 'Contents cover, including the contents component of combined home insurance.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.contentsAccidentalDamage', 'Contents accidental damage', undefined, {
    description: 'Contents cover, including the contents component of combined home insurance.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.singleItemLimit', 'Single-item limit', moneySchema, {
    description:
      'Contents cover, including the contents component of combined home insurance. Contents policies with an unspecified-item cap.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('insurance.valuablesTotalLimit', 'Valuables total limit', moneySchema, {
    description:
      'Contents cover, including the contents component of combined home insurance. Policies with an aggregate valuables cap.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('insurance.awayFromHomeCoverLimit', 'Away-from-home cover limit', moneySchema, {
    description:
      'Contents cover, including the contents component of combined home insurance. Policies covering possessions outside the home.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('insurance.specifiedItem', 'Specified item', undefined, {
    description:
      'Contents cover, including the contents component of combined home insurance. Policies scheduling individual possessions; potentially repeatable per item.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.specifiedItemInsuredValue', 'Specified item insured value', moneySchema, {
    description:
      'Contents cover, including the contents component of combined home insurance. Belongs to the same scheduled item as its description; potentially repeatable per item.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('insurance.insuredVehicle', 'Insured vehicle', undefined, {
    description:
      'Motor insurance, including the motor component of a multi-cover policy. Vehicle registration or other policy-scheduled identity; potentially repeatable per vehicle.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.motorCoverLevel', 'Motor cover level', undefined, {
    description: 'Motor insurance, including the motor component of a multi-cover policy.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.permittedUse', 'Permitted use', undefined, {
    description: 'Motor insurance, including the motor component of a multi-cover policy.',
    uiHint: 'TEXT',
    icon: 'fieldPolicy',
  }),
  field('insurance.namedDrivers', 'Named drivers', undefined, {
    description: 'Motor insurance, including the motor component of a multi-cover policy.',
    uiHint: 'TEXT',
    icon: 'fieldPerson',
  }),
  field('insurance.declaredAnnualMileage', 'Declared annual mileage', undefined, {
    description:
      'Motor insurance, including the motor component of a multi-cover policy. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldSpeed',
  }),
  field('insurance.compulsoryMotorExcess', 'Compulsory motor excess', moneySchema, {
    description: 'Motor insurance, including the motor component of a multi-cover policy.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('insurance.voluntaryMotorExcess', 'Voluntary motor excess', moneySchema, {
    description: 'Motor insurance, including the motor component of a multi-cover policy.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('insurance.windscreenExcess', 'Windscreen excess', moneySchema, {
    description:
      'Motor insurance, including the motor component of a multi-cover policy. Policies with windscreen cover and a separate excess.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('insurance.noClaimsDiscount', 'No-claims discount', undefined, {
    description:
      'Motor insurance, including the motor component of a multi-cover policy. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldSupport',
  }),
  field('insurance.noClaimsProtection', 'No-claims protection', undefined, {
    description: 'Motor insurance, including the motor component of a multi-cover policy.',
    uiHint: 'TEXT',
    icon: 'fieldSupport',
  }),
  field('insurance.courtesyVehicleTerms', 'Courtesy vehicle terms', undefined, {
    description:
      'Motor insurance, including the motor component of a multi-cover policy. Policies providing a replacement vehicle.',
    uiHint: 'TEXT',
    icon: 'fieldVehicle',
  }),
  field('insurance.travelPolicyType', 'Travel policy type', undefined, {
    description: 'Travel insurance, including travel benefits supplied with another product.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('insurance.travelCoverArea', 'Travel cover area', undefined, {
    description: 'Travel insurance, including travel benefits supplied with another product.',
    uiHint: 'TEXT',
    icon: 'fieldAddress',
  }),
  field('insurance.maximumTripLength', 'Maximum trip length', undefined, {
    description:
      'Travel insurance, including travel benefits supplied with another product. Policies limiting individual trip duration. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldDimensions',
  }),
  field('insurance.cancellationLimit', 'Cancellation limit', undefined, {
    description:
      'Travel insurance, including travel benefits supplied with another product. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.emergencyMedicalLimit', 'Emergency medical limit', undefined, {
    description:
      'Travel insurance, including travel benefits supplied with another product. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.baggageLimit', 'Baggage limit', undefined, {
    description:
      'Travel insurance, including travel benefits supplied with another product. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.travelExcess', 'Travel excess', undefined, {
    description:
      "Travel insurance, including travel benefits supplied with another product. Retain the policy's excess basis. Retain units, precision and any measurement or allowance basis.",
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('insurance.winterSportsCover', 'Winter sports cover', undefined, {
    description:
      'Travel insurance, including travel benefits supplied with another product. Policies with winter-sports terms.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.cruiseCover', 'Cruise cover', undefined, {
    description:
      'Travel insurance, including travel benefits supplied with another product. Policies with cruise-specific terms.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.medicalScreeningReference', 'Medical screening reference', undefined, {
    description:
      'Travel insurance, including travel benefits supplied with another product. Policies with a screening decision; sensitive.',
    uiHint: 'PASSWORD',
    sensitive: true,
    icon: 'fieldAccessCode',
  }),
  field('insurance.insuredPet', 'Insured pet', undefined, {
    description:
      'Pet insurance with the corresponding cover structure. Potentially repeatable per insured pet.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.petCoverType', 'Pet cover type', undefined, {
    description: 'Pet insurance with the corresponding cover structure.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.vetFeesLimit', 'Vet fees limit', moneySchema, {
    description: 'Pet insurance with the corresponding cover structure.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('insurance.vetFeesLimitBasis', 'Vet fees limit basis', undefined, {
    description:
      'Pet insurance with the corresponding cover structure. Preserve annual, per-condition or other limit basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('insurance.vetFeesExcess', 'Vet fees excess', undefined, {
    description:
      'Pet insurance with the corresponding cover structure. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('insurance.vetFeesCoPayment', 'Vet fees co-payment', undefined, {
    description:
      'Pet insurance with the corresponding cover structure. Policies requiring a percentage contribution. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('insurance.conditionCoverDuration', 'Condition cover duration', undefined, {
    description: 'Pet insurance with the corresponding cover structure. Time-limited policies.',
    uiHint: 'TEXT',
    icon: 'fieldTime',
  }),
  field('insurance.medicalCoverTier', 'Medical cover tier', undefined, {
    description: 'Private medical and dental insurance with the corresponding benefits.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.hospitalNetwork', 'Hospital network', undefined, {
    description:
      'Private medical and dental insurance with the corresponding benefits. Medical plans restricting providers.',
    uiHint: 'TEXT',
    icon: 'fieldNetwork',
  }),
  field('insurance.outpatientLimit', 'Outpatient limit', undefined, {
    description:
      'Private medical and dental insurance with the corresponding benefits. Medical plans with an outpatient cap. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.medicalExcess', 'Medical excess', undefined, {
    description:
      'Private medical and dental insurance with the corresponding benefits. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldMoney',
  }),
  field('insurance.underwritingBasis', 'Underwriting basis', undefined, {
    description: 'Private medical and dental insurance with the corresponding benefits.',
    uiHint: 'TEXT',
    icon: 'fieldSettings',
  }),
  field('insurance.dentalAnnualLimit', 'Dental annual limit', moneySchema, {
    description:
      'Private medical and dental insurance with the corresponding benefits. Plans including dental cover.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field(
    'insurance.waitingPeriodEnds',
    'Waiting period ends',
    { type: 'string', format: 'date' },
    {
      description:
        'Private medical and dental insurance with the corresponding benefits. Benefits subject to an initial waiting period.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field('insurance.lifeAssured', 'Life assured', undefined, {
    description: 'Life assurance and critical-illness policies with the corresponding benefit.',
    uiHint: 'TEXT',
    icon: 'fieldPerson',
  }),
  field('insurance.lifeCoverAmount', 'Life cover amount', moneySchema, {
    description: 'Life assurance and critical-illness policies with the corresponding benefit.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('insurance.lifeCoverBasis', 'Life cover basis', undefined, {
    description: 'Life assurance and critical-illness policies with the corresponding benefit.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field(
    'insurance.coverTermEnds',
    'Cover term ends',
    { type: 'string', format: 'date' },
    {
      description:
        'Life assurance and critical-illness policies with the corresponding benefit. Term policies.',
      uiHint: 'DATE',
      icon: 'fieldDate',
    },
  ),
  field('insurance.criticalIllnessAmount', 'Critical illness amount', moneySchema, {
    description:
      'Life assurance and critical-illness policies with the corresponding benefit. Policies including a critical-illness benefit.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('insurance.monthlyBenefit', 'Monthly benefit', moneySchema, {
    description: 'Income-protection policies.',
    uiHint: 'MONEY',
    icon: 'fieldMoney',
  }),
  field('insurance.deferredPeriod', 'Deferred period', undefined, {
    description:
      'Income-protection policies. Waiting time after incapacity before benefits become payable.',
    uiHint: 'TEXT',
    icon: 'fieldTime',
  }),
  field('insurance.maximumBenefitPaymentPeriod', 'Maximum benefit payment period', undefined, {
    description:
      'Income-protection policies. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldTime',
  }),
  field('insurance.incapacityDefinition', 'Incapacity definition', undefined, {
    description: 'Income-protection policies.',
    uiHint: 'TEXT',
    icon: 'fieldPolicy',
  }),
  field(
    'insurance.coverCeases',
    'Cover ceases',
    { type: 'string', format: 'date' },
    { description: 'Income-protection policies.', uiHint: 'DATE', icon: 'fieldDate' },
  ),
  field('insurance.breakdownCoverBasis', 'Breakdown cover basis', undefined, {
    description:
      'Breakdown, home-emergency, gadget and liability cover with the corresponding benefit. Breakdown policies covering a person or a named vehicle.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.breakdownTerritory', 'Breakdown territory', undefined, {
    description:
      'Breakdown, home-emergency, gadget and liability cover with the corresponding benefit.',
    uiHint: 'TEXT',
    icon: 'fieldAddress',
  }),
  field('insurance.homeEmergencyLimit', 'Home emergency limit', undefined, {
    description:
      'Breakdown, home-emergency, gadget and liability cover with the corresponding benefit. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.gadgetInsuredItem', 'Gadget insured item', undefined, {
    description:
      'Breakdown, home-emergency, gadget and liability cover with the corresponding benefit. Gadget cover; potentially repeatable per item.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.gadgetCoverLimit', 'Gadget cover limit', undefined, {
    description:
      'Breakdown, home-emergency, gadget and liability cover with the corresponding benefit. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.publicLiabilityLimit', 'Public liability limit', undefined, {
    description:
      'Breakdown, home-emergency, gadget and liability cover with the corresponding benefit. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
  field('insurance.legalExpensesLimit', 'Legal expenses limit', undefined, {
    description:
      'Breakdown, home-emergency, gadget and liability cover with the corresponding benefit. Retain units, precision and any measurement or allowance basis.',
    uiHint: 'TEXT',
    icon: 'fieldInsurance',
  }),
];

const set = (
  id: string,
  name: string,
  eligibility: string,
  fieldIds: string[],
  includes: string[] = [],
  alongside: string[] = [],
  keywords: string[] = name.toLowerCase().split(' '),
): FieldSet => ({
  id,
  categoryId: id.split('.')[0],
  name,
  eligibility,
  fields: fieldIds.map((id) => fields.find((f) => f.id === id)!),
  includes,
  considerAlongside: alongside,
  keywords,
});

export const sets: FieldSet[] = [
  set(
    'appliances.ownership',
    'Ownership',
    'A household appliance acquired by purchase, gift or transfer. Seller, price and order reference apply to purchases.',
    ['common.acquiredOn', 'common.seller', 'common.pricePaid', 'common.orderReference'],
    [],
    ['appliances.warranty', 'appliances.extendedWarranty'],
    ['ownership', 'purchase', 'receipt', 'gift', 'acquisition'],
  ),
  set(
    'appliances.warranty',
    'Warranty',
    'A product covered by a manufacturer warranty, including expired cover retained for reference.',
    ['common.warrantyProvider', 'common.warrantyStarts', 'common.warrantyEnds'],
    [],
    ['appliances.extendedWarranty'],
    ['warranty', 'guarantee', 'manufacturer cover'],
  ),
  set(
    'appliances.extendedWarranty',
    'Extended warranty',
    'A product with a separately purchased extended warranty. Its coverage dates and provider belong to this cover.',
    [
      'common.extendedWarrantyProvider',
      'common.extendedWarrantyStarts',
      'common.extendedWarrantyEnds',
    ],
    [],
    ['appliances.warranty'],
    ['extended', 'warranty', 'extended guarantee'],
  ),
  set(
    'appliances.support',
    'Support',
    'A product with a support channel or manufacturer support registration.',
    ['common.supportUrl', 'common.supportPhone', 'common.supportReference'],
    [],
    ['appliances.maintenance'],
    ['support', 'customer service', 'help'],
  ),
  set(
    'appliances.maintenance',
    'Maintenance',
    'A product with a documented recurring service requirement. Intervals describe the maintenance terms.',
    ['common.serviceInterval'],
    [],
    ['appliances.support'],
    ['maintenance', 'service', 'servicing'],
  ),
  set(
    'appliances.appliance',
    'Appliance',
    'A household appliance, including products with multiple functions.',
    [
      'common.manufacturer',
      'common.model',
      'appliances.applianceType',
      'appliances.productCode',
      'appliances.manufacturedOn',
      'appliances.finish',
    ],
    [],
    [
      'appliances.serial',
      'appliances.ownership',
      'appliances.warranty',
      'appliances.support',
      'appliances.maintenance',
      'appliances.installation',
      'appliances.dimensions',
      'appliances.electrical',
      'appliances.energyLabel',
    ],
    ['appliance', 'white goods', 'household', 'model number'],
  ),
  set(
    'appliances.serial',
    'Serial number',
    'An appliance carrying a unit serial identifier other than a Z-Nr marking. BSH Z-Nr markings belong to the matching manufacturer identifier set.',
    ['common.serialNumber'],
    [],
    ['appliances.appliance'],
    ['serial', 'number', 'S/N'],
  ),
  set(
    'appliances.bosch',
    'Bosch identifiers',
    'A Bosch household appliance whose rating plate provides E-Nr, FD or Z-Nr markings.',
    ['appliances.eNumber', 'appliances.fdNumber', 'appliances.zNumber'],
    ['appliances.appliance'],
    [],
    ['bosch', 'identifiers', 'BSH', 'E-Nr', 'FD', 'Z-Nr'],
  ),
  set(
    'appliances.neff',
    'Neff identifiers',
    'A Neff household appliance whose rating plate provides E-Nr, FD or Z-Nr markings.',
    ['appliances.eNumber', 'appliances.fdNumber', 'appliances.zNumber'],
    ['appliances.appliance'],
    [],
    ['neff', 'identifiers', 'BSH', 'E-Nr', 'FD', 'Z-Nr'],
  ),
  set(
    'appliances.siemens',
    'Siemens identifiers',
    'A Siemens household appliance whose rating plate provides E-Nr, FD or Z-Nr markings.',
    ['appliances.eNumber', 'appliances.fdNumber', 'appliances.zNumber'],
    ['appliances.appliance'],
    [],
    ['siemens', 'identifiers', 'BSH', 'E-Nr', 'FD', 'Z-Nr'],
  ),
  set(
    'appliances.pnc',
    'Product number',
    'An AEG, Electrolux or Zanussi appliance with a PNC on its product label.',
    ['appliances.pnc'],
    ['appliances.appliance'],
    [],
    ['product', 'number', 'AEG', 'Electrolux', 'Zanussi', 'PNC'],
  ),
  set(
    'appliances.installation',
    'Installation',
    'An installed or fitted appliance with installation details or clearance requirements.',
    [
      'appliances.installedOn',
      'appliances.installer',
      'appliances.installationType',
      'appliances.ventilationClearance',
    ],
    [],
    ['appliances.recess', 'appliances.dimensions', 'appliances.electrical'],
    ['installation', 'fitted', 'built-in', 'installer'],
  ),
  set(
    'appliances.dimensions',
    'Dimensions',
    'An appliance with specified external dimensions.',
    ['common.width', 'common.height', 'common.depth'],
    [],
    ['appliances.installation'],
    ['dimensions', 'size', 'width', 'height', 'depth'],
  ),
  set(
    'appliances.recess',
    'Installation opening',
    'A built-in appliance requiring a specified installation opening.',
    [
      'appliances.requiredRecessWidth',
      'appliances.requiredRecessHeight',
      'appliances.requiredRecessDepth',
    ],
    ['appliances.installation'],
    [],
    ['installation', 'opening', 'cabinet', 'niche', 'recess'],
  ),
  set(
    'appliances.electrical',
    'Electrical supply',
    'An electrically powered appliance with specified supply and connection requirements.',
    [
      'appliances.supplyVoltage',
      'appliances.supplyFrequency',
      'appliances.ratedInputPower',
      'appliances.electricalConnection',
      'appliances.requiredCircuitRating',
    ],
    [],
    ['appliances.installation'],
    ['electrical', 'supply', 'voltage', 'frequency', 'wattage', 'circuit'],
  ),
  set(
    'appliances.energyLabel',
    'Energy label',
    'An appliance carrying an energy label. Use the overall energy class only where a single product-level class is provided; separate wash and complete-cycle classes belong to the relevant function sets.',
    ['appliances.energyLabelScheme', 'appliances.energyClass'],
    [],
    ['appliances.washing', 'appliances.washAndDry'],
    ['energy', 'label', 'energy rating', 'efficiency'],
  ),
  set(
    'appliances.washing',
    'Washing',
    'A washing machine or the washing component of a washer-dryer.',
    [
      'appliances.washingCapacity',
      'appliances.maximumSpinSpeed',
      'appliances.washEnergyClass',
      'appliances.washEnergyUse',
      'appliances.washWaterUse',
    ],
    ['appliances.appliance'],
    ['appliances.drying', 'appliances.washAndDry', 'appliances.energyLabel', 'appliances.cleaning'],
    ['washing', 'washing machine', 'washer', 'laundry', 'spin'],
  ),
  set(
    'appliances.drying',
    'Drying',
    'A tumble dryer or the drying component of a washer-dryer.',
    ['appliances.dryingCapacity', 'appliances.dryingTechnology'],
    ['appliances.appliance'],
    [
      'appliances.washing',
      'appliances.washAndDry',
      'appliances.energyLabel',
      'appliances.cleaning',
    ],
    ['drying', 'dryer', 'tumble', 'condenser', 'heat pump'],
  ),
  set(
    'appliances.washAndDry',
    'Wash-and-dry cycle',
    'A combination washer-dryer with measurements for its complete wash-and-dry cycle.',
    [
      'appliances.washAndDryEnergyClass',
      'appliances.washAndDryEnergyUse',
      'appliances.washAndDryWaterUse',
    ],
    ['appliances.washing', 'appliances.drying'],
    ['appliances.energyLabel'],
    ['wash', 'and', 'dry', 'cycle', 'washer-dryer', 'combined laundry'],
  ),
  set(
    'appliances.dishwasher',
    'Dishwasher',
    'A household dishwasher with eco-cycle consumption specifications.',
    ['appliances.dishwasherWaterUse', 'appliances.dishwasherEnergyUse'],
    ['appliances.appliance'],
    ['appliances.energyLabel', 'appliances.cleaning'],
    ['dishwasher', 'dishwashing'],
  ),
  set(
    'appliances.refrigeration',
    'Refrigeration',
    'A refrigerator or the chilled compartment of a fridge-freezer.',
    ['appliances.fridgeCapacity'],
    ['appliances.appliance'],
    ['appliances.freezing', 'appliances.waterFilter', 'appliances.energyLabel'],
    ['refrigeration', 'fridge', 'refrigerator', 'fridge-freezer'],
  ),
  set(
    'appliances.freezing',
    'Freezer',
    'A freezer or the frozen compartment of a fridge-freezer.',
    ['appliances.freezerCapacity', 'appliances.defrostSystem'],
    ['appliances.appliance'],
    ['appliances.refrigeration', 'appliances.energyLabel'],
    ['freezer', 'frost free', 'fridge-freezer'],
  ),
  set(
    'appliances.waterFilter',
    'Water filter',
    'An appliance with a replaceable drinking-water filter, including filtered-water refrigerators.',
    ['appliances.waterFilterModel'],
    [],
    ['appliances.refrigeration'],
    ['water', 'filter', 'filtered water', 'filter cartridge'],
  ),
  set(
    'appliances.oven',
    'Oven',
    'An oven or the oven component of a cooker or combination appliance. Second-oven capacity applies to products with a second cavity.',
    ['appliances.mainOvenCapacity', 'appliances.secondOvenCapacity'],
    ['appliances.appliance'],
    ['appliances.hob', 'appliances.cookingOutput', 'appliances.energyLabel', 'appliances.cleaning'],
    ['oven', 'range', 'cooker'],
  ),
  set(
    'appliances.hob',
    'Hob',
    'A hob or the hob component of a range cooker.',
    ['appliances.hobType', 'appliances.numberOfCookingZones'],
    ['appliances.appliance'],
    ['appliances.oven', 'appliances.electrical', 'appliances.fuel'],
    ['hob', 'cooktop', 'induction'],
  ),
  set(
    'appliances.cookingOutput',
    'Cooking output',
    'A cooking appliance whose specification states delivered output power, including microwave output.',
    ['appliances.outputPower'],
    [],
    ['appliances.oven', 'appliances.electrical'],
    ['cooking', 'output', 'microwave', 'output wattage'],
  ),
  set(
    'appliances.heating',
    'Heating',
    'A boiler, heat pump or other appliance providing space heating.',
    ['appliances.heatingOutput'],
    ['appliances.appliance'],
    ['appliances.cooling', 'appliances.hotWater', 'appliances.fuel', 'appliances.refrigerant'],
    ['heating', 'boiler', 'heat pump', 'heater'],
  ),
  set(
    'appliances.cooling',
    'Cooling',
    'An air conditioner or heat pump providing cooling.',
    ['appliances.coolingOutput'],
    ['appliances.appliance'],
    ['appliances.heating', 'appliances.refrigerant'],
    ['cooling', 'air conditioning', 'reversible heat pump'],
  ),
  set(
    'appliances.hotWater',
    'Hot water storage',
    'An appliance incorporating a hot-water storage cylinder.',
    ['appliances.tankCapacity'],
    ['appliances.appliance'],
    ['appliances.heating', 'appliances.fuel'],
    ['hot', 'water', 'storage', 'cylinder', 'water heater'],
  ),
  set(
    'appliances.fuel',
    'Fuel',
    'A fuel-burning appliance, including cooking and heating equipment.',
    ['appliances.fuelType'],
    [],
    ['appliances.hob', 'appliances.oven', 'appliances.heating'],
    ['fuel', 'gas', 'oil', 'LPG'],
  ),
  set(
    'appliances.refrigerant',
    'Refrigerant',
    'Heating or cooling equipment with a refrigerant circuit.',
    ['appliances.refrigerant'],
    [],
    ['appliances.heating', 'appliances.cooling'],
    ['refrigerant', 'refrigerant gas', 'heat pump'],
  ),
  set(
    'appliances.waterTank',
    'Water reservoir',
    'A small appliance with a refillable water reservoir, including coffee machines and steam appliances.',
    ['appliances.waterTankCapacity'],
    [],
    ['appliances.descaling'],
    ['water', 'reservoir', 'coffee machine', 'steam'],
  ),
  set(
    'appliances.vacuum',
    'Vacuum cleaner',
    'A vacuum cleaner or cleaning robot with a dust container.',
    ['appliances.dustContainerCapacity'],
    ['appliances.appliance'],
    ['appliances.consumables', 'appliances.cleaning'],
    ['vacuum', 'cleaner', 'robot cleaner'],
  ),
  set(
    'appliances.consumables',
    'Consumables',
    'An appliance requiring identifiable replacement filters, bags, cartridges or cleaning supplies.',
    ['appliances.replacementFilter', 'appliances.compatibleConsumable'],
    [],
    ['appliances.cleaning'],
    ['consumables', 'filter', 'bag', 'cartridge', 'refill'],
  ),
  set(
    'appliances.cleaning',
    'Cleaning',
    'An appliance with documented cleaning instructions or a recurring cleaning interval.',
    ['appliances.cleaningInstructions', 'appliances.cleaningInterval'],
    [],
    ['appliances.descaling', 'appliances.consumables'],
    ['cleaning', 'clean', 'care'],
  ),
  set(
    'appliances.descaling',
    'Descaling',
    'An appliance whose instructions require periodic descaling.',
    ['appliances.descalingInterval'],
    [],
    ['appliances.cleaning'],
    ['descaling', 'scale', 'limescale', 'coffee'],
  ),
  set(
    'devices.ownership',
    'Ownership',
    'A device acquired by purchase, gift or transfer. Seller, price and order reference apply to purchases.',
    ['common.acquiredOn', 'common.seller', 'common.pricePaid', 'common.orderReference'],
    [],
    ['devices.warranty', 'devices.extendedWarranty'],
    ['ownership', 'purchase', 'receipt', 'gift', 'acquisition'],
  ),
  set(
    'devices.warranty',
    'Warranty',
    'A product covered by a manufacturer warranty, including expired cover retained for reference.',
    ['common.warrantyProvider', 'common.warrantyStarts', 'common.warrantyEnds'],
    [],
    ['devices.extendedWarranty'],
    ['warranty', 'guarantee', 'manufacturer cover'],
  ),
  set(
    'devices.extendedWarranty',
    'Extended warranty',
    'A product with a separately purchased extended warranty. Its coverage dates and provider belong to this cover.',
    [
      'common.extendedWarrantyProvider',
      'common.extendedWarrantyStarts',
      'common.extendedWarrantyEnds',
    ],
    [],
    ['devices.warranty'],
    ['extended', 'warranty', 'extended guarantee'],
  ),
  set(
    'devices.support',
    'Support',
    'A product with a support channel or manufacturer support registration.',
    ['common.supportUrl', 'common.supportPhone', 'common.supportReference'],
    [],
    ['devices.maintenance'],
    ['support', 'customer service', 'help'],
  ),
  set(
    'devices.maintenance',
    'Maintenance',
    'A product with a documented recurring service requirement. Intervals describe the maintenance terms.',
    ['common.serviceProvider', 'common.serviceInterval'],
    [],
    ['devices.support'],
    ['maintenance', 'service', 'servicing'],
  ),
  set(
    'devices.device',
    'Device',
    'An electronic device with manufacturer and model identity.',
    [
      'common.manufacturer',
      'common.model',
      'common.serialNumber',
      'devices.deviceType',
      'devices.hardwareRevision',
      'devices.assetTag',
    ],
    [],
    [
      'devices.ownership',
      'devices.warranty',
      'devices.support',
      'devices.maintenance',
      'devices.dimensions',
    ],
    ['device', 'electronics', 'hardware'],
  ),
  set(
    'devices.software',
    'System software',
    'A device with an operating system or firmware version that its owner can identify.',
    ['devices.operatingSystem', 'devices.firmwareVersion'],
    [],
    ['devices.device'],
    ['system', 'software', 'OS', 'firmware'],
  ),
  set(
    'devices.computing',
    'Computing and storage',
    'A computer, phone, tablet, console or network storage device with computing or storage specifications.',
    ['devices.processor', 'devices.memory', 'devices.builtInStorage', 'devices.expandableStorage'],
    ['devices.device'],
    ['devices.software'],
    ['computing', 'and', 'storage', 'CPU', 'RAM', 'computer', 'tablet', 'NAS'],
  ),
  set(
    'devices.cellular',
    'Cellular hardware',
    'A phone, tablet, wearable or modem with cellular hardware. Line 2 and EID apply only to devices exposing those identities.',
    ['devices.imeiLine1', 'devices.imeiLine2', 'devices.eid', 'devices.simFormat'],
    ['devices.device'],
    [],
    ['cellular', 'hardware', 'phone', 'eSIM', 'IMEI'],
  ),
  set(
    'devices.battery',
    'Battery and charging',
    'A device powered by a battery or equipped with a charging input.',
    ['devices.batteryModel', 'devices.batteryCapacity', 'devices.chargingConnector'],
    [],
    ['devices.device'],
    ['battery', 'and', 'charging', 'USB-C'],
  ),
  set(
    'devices.network',
    'Network connection',
    'A network-connected device with a hostname or identifiable network interfaces.',
    ['devices.ethernetMacAddress', 'devices.wiFiMacAddress', 'devices.localHostname'],
    [],
    ['devices.wifi', 'devices.smartHome'],
    ['network', 'connection', 'MAC', 'hostname', 'Ethernet'],
  ),
  set(
    'devices.wifi',
    'Wi-Fi',
    'A device with a Wi-Fi radio.',
    ['devices.wiFiStandard', 'devices.wiFiBands'],
    [],
    ['devices.network'],
    ['wi', 'fi', 'wireless', 'Wi-Fi'],
  ),
  set(
    'devices.smartHome',
    'Smart home compatibility',
    'A smart-home device with a declared interoperability or control protocol.',
    ['devices.connectionProtocol'],
    [],
    ['devices.network'],
    ['smart', 'home', 'compatibility', 'Matter', 'Thread', 'Zigbee', 'smart home'],
  ),
  set(
    'devices.display',
    'Display',
    'A television, monitor or device with an integrated display or video connectors.',
    ['devices.screenDiagonal', 'devices.displayResolution', 'devices.displayConnectors'],
    [],
    ['devices.mounting', 'devices.device'],
    ['display', 'screen', 'monitor', 'TV'],
  ),
  set(
    'devices.mounting',
    'Display mounting',
    'A display with a VESA mounting pattern.',
    ['devices.vesaMountingWidth', 'devices.vesaMountingHeight'],
    ['devices.display'],
    [],
    ['display', 'mounting', 'VESA', 'wall mount'],
  ),
  set(
    'devices.printing',
    'Printer',
    'A printer or the printing component of a multifunction device. Colour consumables apply to colour printers.',
    [
      'devices.printTechnology',
      'devices.blackCartridge',
      'devices.colourCartridgeSet',
      'devices.maximumPaperSize',
      'devices.automaticDuplexPrinting',
    ],
    ['devices.device'],
    ['devices.scanning'],
    ['printer', 'ink', 'toner', 'laser'],
  ),
  set(
    'devices.scanning',
    'Scanner',
    'A scanner or the scanning component of a multifunction device with a document feeder.',
    ['devices.automaticDuplexScanning'],
    ['devices.device'],
    ['devices.printing'],
    ['scanner', 'multifunction', 'ADF'],
  ),
  set(
    'devices.camera',
    'Camera',
    'A camera, interchangeable lens or recording device with the relevant lens, card or recording-storage feature.',
    ['devices.lensMount', 'devices.memoryCardFormat', 'devices.recordingStorage'],
    ['devices.device'],
    [],
    ['camera', 'lens', 'security camera'],
  ),
  set(
    'devices.dimensions',
    'Dimensions',
    'A device with declared physical dimensions or weight.',
    ['common.width', 'common.height', 'common.depth', 'common.weight'],
    [],
    ['devices.device'],
    ['dimensions', 'size', 'weight'],
  ),
  set(
    'devices.environment',
    'Operating environment',
    'A device with a declared ingress-protection rating or operating-temperature range.',
    ['devices.ingressProtection', 'devices.operatingTemperature'],
    [],
    ['devices.device'],
    ['operating', 'environment', 'IP rating', 'outdoor', 'temperature'],
  ),
  set(
    'vehicles.ownership',
    'Ownership',
    'A vehicle acquired by purchase, gift or transfer. Seller, price and order reference apply to purchases.',
    ['common.acquiredOn', 'common.seller', 'common.pricePaid', 'common.orderReference'],
    [],
    ['vehicles.warranty', 'vehicles.extendedWarranty'],
    ['ownership', 'purchase', 'receipt', 'gift', 'acquisition'],
  ),
  set(
    'vehicles.warranty',
    'Warranty',
    'A product covered by a manufacturer warranty, including expired cover retained for reference.',
    ['common.warrantyProvider', 'common.warrantyStarts', 'common.warrantyEnds'],
    [],
    ['vehicles.extendedWarranty'],
    ['warranty', 'guarantee', 'manufacturer cover'],
  ),
  set(
    'vehicles.extendedWarranty',
    'Extended warranty',
    'A product with a separately purchased extended warranty. Its coverage dates and provider belong to this cover.',
    [
      'common.extendedWarrantyProvider',
      'common.extendedWarrantyStarts',
      'common.extendedWarrantyEnds',
    ],
    [],
    ['vehicles.warranty'],
    ['extended', 'warranty', 'extended guarantee'],
  ),
  set(
    'vehicles.support',
    'Support',
    'A product with a support channel or manufacturer support registration.',
    ['common.supportUrl', 'common.supportPhone', 'common.supportReference'],
    [],
    ['vehicles.maintenance'],
    ['support', 'customer service', 'help'],
  ),
  set(
    'vehicles.maintenance',
    'Maintenance',
    'A product with a documented recurring service requirement. Intervals describe the maintenance terms.',
    ['common.serviceProvider', 'common.serviceInterval'],
    [],
    ['vehicles.support'],
    ['maintenance', 'service', 'servicing'],
  ),
  set(
    'vehicles.vehicle',
    'Vehicle',
    'A road vehicle, cycle, trailer or watercraft with manufacturer and model identity.',
    [
      'common.manufacturer',
      'common.model',
      'vehicles.vehicleType',
      'vehicles.modelYear',
      'vehicles.colour',
    ],
    [],
    [
      'vehicles.serial',
      'vehicles.ownership',
      'vehicles.warranty',
      'vehicles.support',
      'vehicles.maintenance',
    ],
    ['vehicle', 'transport'],
  ),
  set(
    'vehicles.serial',
    'Manufacturer serial number',
    'A vehicle with a manufacturer serial number distinct from its VIN, frame number or hull identifier.',
    ['common.serialNumber'],
    [],
    ['vehicles.vehicle'],
    ['manufacturer', 'serial', 'number'],
  ),
  set(
    'vehicles.registration',
    'Registration',
    'A vehicle registered with a road or vessel authority.',
    ['vehicles.registration', 'vehicles.registrationCountry', 'vehicles.firstRegistered'],
    [],
    ['vehicles.vin'],
    ['registration', 'registration plate', 'number plate'],
  ),
  set(
    'vehicles.vin',
    'VIN',
    'A vehicle assigned a vehicle identification number.',
    ['vehicles.vin'],
    [],
    ['vehicles.registration'],
    ['vin', 'vehicle identification', 'chassis'],
  ),
  set(
    'vehicles.roadMotor',
    'Road vehicle specifications',
    'A motorised road vehicle, including cars, vans, motorcycles and motorhomes.',
    [
      'vehicles.fuelOrPowerType',
      'vehicles.transmission',
      'vehicles.frontTyreSpecification',
      'vehicles.rearTyreSpecification',
      'vehicles.frontTyrePressure',
      'vehicles.rearTyrePressure',
    ],
    ['vehicles.vehicle'],
    [
      'vehicles.registration',
      'vehicles.vin',
      'vehicles.combustion',
      'vehicles.electric',
      'vehicles.roadworthiness',
      'vehicles.distanceMaintenance',
    ],
    ['road', 'vehicle', 'specifications', 'motor vehicle'],
  ),
  set(
    'vehicles.car',
    'Car',
    'A passenger car. Seating capacity includes the driver.',
    ['vehicles.seats'],
    ['vehicles.roadMotor'],
    ['vehicles.towing', 'vehicles.roofLoad'],
    ['car', 'passenger car', 'hatchback', 'estate', 'SUV'],
  ),
  set(
    'vehicles.van',
    'Van',
    'A van or pickup used to carry goods. Cargo specifications describe its load space.',
    [
      'vehicles.seats',
      'vehicles.payloadKg',
      'vehicles.cargoLength',
      'vehicles.cargoWidth',
      'vehicles.cargoWidthBetweenWheelArches',
      'vehicles.cargoHeight',
      'vehicles.cargoVolume',
    ],
    ['vehicles.roadMotor'],
    ['vehicles.platedMass', 'vehicles.towing', 'vehicles.roofLoad'],
    ['van', 'pickup', 'cargo', 'commercial vehicle'],
  ),
  set(
    'vehicles.combustion',
    'Combustion engine',
    'A road vehicle with a combustion engine, including hybrid vehicles.',
    ['vehicles.engineCapacity', 'vehicles.fuelTankCapacity', 'vehicles.emissionStandard'],
    [],
    ['vehicles.electric'],
    ['combustion', 'engine', 'petrol', 'diesel', 'hybrid'],
  ),
  set(
    'vehicles.roadworthiness',
    'Roadworthiness',
    'A vehicle subject to an applicable roadworthiness inspection scheme.',
    ['vehicles.roadworthinessTestScheme'],
    [],
    ['vehicles.registration'],
    ['roadworthiness', 'MOT', 'inspection'],
  ),
  set(
    'vehicles.distanceMaintenance',
    'Distance-based servicing',
    'A vehicle with a manufacturer service interval expressed as distance.',
    ['vehicles.serviceMileageInterval'],
    [],
    ['vehicles.maintenance'],
    ['distance', 'based', 'servicing', 'mileage', 'kilometres', 'service interval'],
  ),
  set(
    'vehicles.roofLoad',
    'Roof load',
    'A vehicle with a manufacturer-declared roof load limit.',
    ['vehicles.roofLoadLimit'],
    [],
    ['vehicles.platedMass'],
    ['roof', 'load', 'roof rack', 'roof bars'],
  ),
  set(
    'vehicles.platedMass',
    'Permitted mass',
    'A vehicle or trailer with a plated maximum authorised mass. Gross train weight applies to towing vehicles with a combined mass limit.',
    ['vehicles.maximumAuthorisedMass', 'vehicles.grossTrainWeight'],
    [],
    ['vehicles.towing'],
    ['permitted', 'mass', 'MAM', 'GVW', 'GTW', 'weight plate'],
  ),
  set(
    'vehicles.towing',
    'Towing limits',
    'A vehicle approved to tow trailers with stated braked or unbraked limits.',
    ['vehicles.brakedTowingLimit', 'vehicles.unbrakedTowingLimit'],
    [],
    ['vehicles.platedMass'],
    ['towing', 'limits', 'trailer', 'towbar'],
  ),
  set(
    'vehicles.electric',
    'Electric drive',
    'A battery-electric or plug-in hybrid road vehicle. DC specifications apply where DC charging is supported.',
    [
      'vehicles.usableTractionBatteryCapacity',
      'vehicles.acChargingConnector',
      'vehicles.dcChargingConnector',
      'vehicles.maximumAcChargePower',
      'vehicles.maximumDcChargePower',
    ],
    [],
    ['vehicles.batteryWarranty', 'vehicles.combustion'],
    ['electric', 'drive', 'EV', 'PHEV', 'BEV', 'charging'],
  ),
  set(
    'vehicles.batteryWarranty',
    'Traction battery warranty',
    'A road vehicle with separate traction-battery warranty terms.',
    ['vehicles.batteryWarrantyEnds', 'vehicles.batteryWarrantyDistanceLimit'],
    [],
    ['vehicles.electric', 'vehicles.warranty'],
    ['traction', 'battery', 'warranty', 'EV battery cover'],
  ),
  set(
    'vehicles.cycle',
    'Bicycle',
    'A bicycle, cargo cycle or electrically assisted bicycle.',
    [
      'vehicles.frameNumber',
      'vehicles.frameSize',
      'vehicles.wheelSize',
      'vehicles.brakeType',
      'vehicles.drivetrain',
    ],
    ['vehicles.vehicle'],
    ['vehicles.cycleBattery'],
    ['bicycle', 'bike', 'e-bike', 'cargo cycle'],
  ),
  set(
    'vehicles.cycleBattery',
    'E-bike battery',
    'An electrically assisted cycle with a battery pack.',
    ['vehicles.cycleBatteryCapacity', 'vehicles.cycleBatteryModel'],
    ['vehicles.cycle'],
    [],
    ['e', 'bike', 'battery', 'e-bike', 'pedelec'],
  ),
  set(
    'vehicles.motorcycle',
    'Motorcycle',
    'A motorcycle or motor scooter. Chain specification applies to chain-driven models.',
    ['vehicles.seats', 'vehicles.finalDrive', 'vehicles.chainSpecification'],
    ['vehicles.roadMotor'],
    [],
    ['motorcycle', 'motorbike', 'scooter'],
  ),
  set(
    'vehicles.habitation',
    'Living accommodation',
    'A caravan, motorhome or campervan fitted with accommodation. Tank capacities apply where the tanks are fitted.',
    ['vehicles.berths', 'vehicles.freshWaterTankCapacity', 'vehicles.wasteWaterTankCapacity'],
    [],
    ['vehicles.roadMotor', 'vehicles.platedMass'],
    ['living', 'accommodation', 'caravan', 'motorhome', 'camper'],
  ),
  set(
    'vehicles.watercraft',
    'Watercraft',
    'A boat or personal watercraft. Engine serial number applies to motorised craft.',
    [
      'vehicles.hullIdentificationNumber',
      'vehicles.hullLength',
      'vehicles.beam',
      'vehicles.draft',
      'vehicles.engineSerialNumber',
    ],
    ['vehicles.vehicle'],
    ['vehicles.registration'],
    ['watercraft', 'boat', 'vessel', 'jet ski'],
  ),
  set(
    'vehicles.finance',
    'Vehicle finance',
    'A leased or financed vehicle. Mileage terms apply where specified by the agreement.',
    [
      'vehicles.financeProvider',
      'vehicles.agreementReference',
      'vehicles.agreementEnds',
      'vehicles.annualMileageAllowance',
      'vehicles.excessMileageCharge',
    ],
    [],
    ['vehicles.ownership'],
    ['vehicle', 'finance', 'lease', 'PCP', 'hire purchase'],
  ),
  set(
    'memberships.account',
    'Account',
    'A membership with a provider-managed account. Account identity is distinct from the specific plan or membership identity.',
    [
      'membership.provider',
      'common.accountNumber',
      'common.accountHolder',
      'common.accountEmail',
      'common.accountPortal',
    ],
    [],
    ['memberships.support', 'memberships.billing'],
    ['account', 'customer account', 'account holder'],
  ),
  set(
    'memberships.support',
    'Support',
    'An account with customer-support contact information.',
    ['common.supportUrl', 'common.supportPhone'],
    [],
    [],
    ['support', 'customer service', 'help'],
  ),
  set(
    'memberships.billing',
    'Billing',
    'A service with a recurring contractual charge or stated billing and payment terms.',
    ['common.recurringCharge', 'common.billingInterval', 'common.paymentMethod'],
    [],
    ['memberships.commitment'],
    ['billing', 'price', 'payment'],
  ),
  set(
    'memberships.commitment',
    'Commitment and cancellation',
    'A service with a minimum commitment period, cancellation notice or cancellation process.',
    ['common.minimumTermEnds', 'common.cancellationNotice', 'common.cancellationInstructions'],
    [],
    ['memberships.billing'],
    ['commitment', 'and', 'cancellation', 'minimum term', 'cancel', 'notice'],
  ),
  set(
    'memberships.membership',
    'Membership',
    'Membership of an organisation, club or scheme. Term-end and auto-renewal details apply to memberships with those terms.',
    [
      'membership.number',
      'membership.level',
      'memberships.membershipTier',
      'common.startsOn',
      'memberships.memberSince',
      'membership.expires',
      'membership.autoRenew',
    ],
    ['memberships.account'],
    ['memberships.namedMembers', 'memberships.access', 'memberships.commitment'],
    ['membership', 'member', 'join'],
  ),
  set(
    'memberships.namedMembers',
    'Members',
    'A joint, family or group membership with named people.',
    ['memberships.namedMembers'],
    [],
    ['memberships.membership'],
    ['members', 'family', 'joint', 'group'],
  ),
  set(
    'memberships.access',
    'Access code',
    'A membership using a private access PIN.',
    ['membership.accessPin'],
    [],
    ['memberships.membership'],
    ['access', 'code', 'PIN', 'entry code'],
  ),
  set(
    'memberships.museum',
    'Museum and heritage membership',
    'Membership of a museum, gallery, heritage organisation, zoo or attraction offering venue or visitor benefits.',
    [
      'memberships.includedVenues',
      'memberships.guestAllowance',
      'memberships.childAllowance',
      'memberships.bookingRequirement',
      'memberships.parkingBenefit',
      'memberships.reciprocalAccess',
    ],
    ['memberships.membership'],
    ['memberships.namedMembers', 'memberships.access'],
    ['museum', 'and', 'heritage', 'membership', 'gallery', 'zoo', 'attraction'],
  ),
  set(
    'memberships.leisure',
    'Sports and leisure membership',
    'A gym, pool, sports club or leisure membership with venue-access terms. Classes, guests, freezing and lockers apply where offered.',
    [
      'memberships.homeVenue',
      'memberships.otherIncludedVenues',
      'memberships.accessTimes',
      'memberships.includedClasses',
      'memberships.guestPasses',
      'memberships.freezeAllowance',
      'memberships.lockerNumber',
    ],
    ['memberships.membership'],
    ['memberships.access'],
    ['sports', 'and', 'leisure', 'membership', 'gym', 'pool', 'fitness'],
  ),
  set(
    'memberships.professional',
    'Professional membership',
    'A professional association, union or accreditation membership. Registration, CPD and accreditation dates apply where required.',
    [
      'memberships.professionalGrade',
      'memberships.registrationNumber',
      'memberships.cpdRequirement',
      'memberships.accreditationExpires',
    ],
    ['memberships.membership'],
    [],
    ['professional', 'membership', 'professional body', 'union', 'CPD'],
  ),
  set(
    'memberships.lending',
    'Borrowing membership',
    'A library or lending-club membership with borrowing entitlements.',
    ['memberships.borrowingLimit', 'memberships.standardLoanPeriod', 'memberships.homeBranch'],
    ['memberships.membership'],
    [],
    ['borrowing', 'membership', 'library', 'lending', 'borrow'],
  ),
  set(
    'memberships.loyalty',
    'Loyalty programme',
    'A loyalty or travel-club membership with a loyalty identifier or status tier.',
    ['memberships.loyaltyNumber', 'memberships.statusTier'],
    ['memberships.membership'],
    [],
    ['loyalty', 'programme', 'frequent flyer', 'rewards'],
  ),
  set(
    'memberships.workspace',
    'Workspace membership',
    'A coworking space or makerspace membership with access or usage allowances. Induction applies where required.',
    [
      'memberships.homeWorkspace',
      'memberships.includedWorkspaceDays',
      'memberships.meetingRoomAllowance',
      'memberships.equipmentAccess',
      'memberships.inductionCompleted',
    ],
    ['memberships.membership'],
    ['memberships.access'],
    ['workspace', 'membership', 'coworking', 'makerspace', 'workshop'],
  ),
  set(
    'subscriptions.account',
    'Account',
    'A subscription with a provider-managed account. Account identity is distinct from the specific plan or membership identity.',
    [
      'common.provider',
      'common.accountNumber',
      'common.accountHolder',
      'common.accountEmail',
      'common.accountPortal',
    ],
    [],
    ['subscriptions.support', 'subscriptions.billing'],
    ['account', 'customer account', 'account holder'],
  ),
  set(
    'subscriptions.support',
    'Support',
    'An account with customer-support contact information.',
    ['common.supportUrl', 'common.supportPhone'],
    [],
    [],
    ['support', 'customer service', 'help'],
  ),
  set(
    'subscriptions.billing',
    'Billing',
    'A service with a recurring contractual charge or stated billing and payment terms.',
    ['common.recurringCharge', 'common.billingInterval', 'common.paymentMethod'],
    [],
    ['subscriptions.commitment'],
    ['billing', 'price', 'payment'],
  ),
  set(
    'subscriptions.commitment',
    'Commitment and cancellation',
    'A service with a minimum commitment period, cancellation notice or cancellation process.',
    ['common.minimumTermEnds', 'common.cancellationNotice', 'common.cancellationInstructions'],
    [],
    ['subscriptions.billing'],
    ['commitment', 'and', 'cancellation', 'minimum term', 'cancel', 'notice'],
  ),
  set(
    'subscriptions.subscription',
    'Subscription',
    'A recurring or fixed-term subscription with a named plan. Access-end and auto-renewal details apply according to its terms.',
    [
      'subscriptions.subscriptionReference',
      'subscriptions.planName',
      'common.startsOn',
      'common.automaticallyRenew',
      'subscriptions.accessEnds',
      'subscriptions.billedThrough',
    ],
    ['subscriptions.account'],
    ['subscriptions.commitment', 'subscriptions.trial', 'subscriptions.introductoryOffer'],
    ['subscription', 'plan'],
  ),
  set(
    'subscriptions.trial',
    'Trial',
    'A subscription with a fixed trial period.',
    ['subscriptions.trialEnds'],
    [],
    ['subscriptions.subscription'],
    ['trial', 'free trial', 'trial period'],
  ),
  set(
    'subscriptions.introductoryOffer',
    'Introductory offer',
    'A subscription with a time-limited introductory price and a stated subsequent price.',
    ['subscriptions.introductoryPriceEnds', 'subscriptions.postOfferPrice'],
    [],
    ['subscriptions.billing'],
    ['introductory', 'offer', 'promotion', 'introductory price'],
  ),
  set(
    'subscriptions.bundle',
    'Included services',
    'A subscription bundling more than one service. Each service-specific entitlement set applies independently.',
    ['subscriptions.includedServices'],
    ['subscriptions.subscription'],
    ['subscriptions.streaming', 'subscriptions.software', 'subscriptions.cloudStorage'],
    ['included', 'services', 'bundle', 'package'],
  ),
  set(
    'subscriptions.streaming',
    'Streaming',
    'A video, music or gaming-streaming subscription with plan-specific playback entitlements. Video quality applies to video services.',
    [
      'subscriptions.simultaneousStreams',
      'subscriptions.maximumVideoQuality',
      'subscriptions.advertising',
      'subscriptions.offlineDownloads',
      'subscriptions.extraMemberAllowance',
    ],
    ['subscriptions.subscription'],
    [],
    ['streaming', 'video', 'music', 'gaming'],
  ),
  set(
    'subscriptions.software',
    'Software licence',
    'A software subscription with licensed-user, activation or licence-type terms. Licence key applies where activation requires a private key.',
    [
      'subscriptions.licensedUsers',
      'subscriptions.activatedDeviceLimit',
      'subscriptions.licenceType',
      'subscriptions.licenceKey',
    ],
    ['subscriptions.subscription'],
    ['subscriptions.cloudStorage', 'subscriptions.metered'],
    ['software', 'licence', 'SaaS'],
  ),
  set(
    'subscriptions.cloudStorage',
    'Cloud storage',
    'A cloud service with a storage allowance or contractually selected storage region.',
    ['subscriptions.storageAllowance', 'subscriptions.storageRegion'],
    ['subscriptions.subscription'],
    ['subscriptions.software', 'subscriptions.backup'],
    ['cloud', 'storage', 'drive'],
  ),
  set(
    'subscriptions.metered',
    'Usage allowance',
    'A metered subscription with a recurring quota, reset rule or overage price.',
    ['subscriptions.usageAllowance', 'subscriptions.allowanceResets', 'subscriptions.overagePrice'],
    [],
    ['subscriptions.subscription', 'subscriptions.billing'],
    ['usage', 'allowance', 'quota', 'credits', 'metered usage'],
  ),
  set(
    'subscriptions.delivery',
    'Deliveries',
    'A print publication, meal kit, consumable or other subscription supplying regular physical deliveries.',
    [
      'subscriptions.deliveryAddress',
      'subscriptions.deliveryFrequency',
      'subscriptions.itemsPerDelivery',
      'subscriptions.deliveryPreferences',
    ],
    ['subscriptions.subscription'],
    [],
    ['deliveries', 'delivery', 'meal kit', 'magazine', 'refills'],
  ),
  set(
    'subscriptions.domain',
    'Domain registration',
    'A subscription registering a single domain name. Each domain with distinct registration terms needs its own Thing.',
    ['subscriptions.domainName', 'subscriptions.domainExpires', 'subscriptions.registrar'],
    ['subscriptions.subscription'],
    ['subscriptions.hosting'],
    ['domain', 'registration', 'registrar', 'DNS'],
  ),
  set(
    'subscriptions.hosting',
    'Website hosting',
    'A website or application hosting subscription.',
    ['subscriptions.hostingPackage'],
    ['subscriptions.subscription'],
    ['subscriptions.domain', 'subscriptions.backup', 'subscriptions.cloudStorage'],
    ['website', 'hosting'],
  ),
  set(
    'subscriptions.backup',
    'Backups',
    'A subscription providing backups with a defined retention period.',
    ['subscriptions.backupRetention'],
    [],
    ['subscriptions.hosting', 'subscriptions.cloudStorage'],
    ['backups', 'backup', 'retention'],
  ),
  set(
    'subscriptions.servicePlan',
    'Service plan',
    'A maintenance or household-service subscription covering an identified item or property with included visits.',
    [
      'subscriptions.coveredItemOrProperty',
      'subscriptions.includedVisits',
      'subscriptions.serviceBookingPage',
    ],
    ['subscriptions.subscription'],
    ['subscriptions.monitoring', 'subscriptions.emergencyResponse'],
    ['service', 'plan', 'maintenance plan', 'service visits'],
  ),
  set(
    'subscriptions.monitoring',
    'Monitoring',
    'An alarm or monitoring subscription. Recording retention applies to plans storing recordings.',
    ['subscriptions.monitoringLevel', 'subscriptions.recordingRetention'],
    ['subscriptions.subscription'],
    ['subscriptions.emergencyResponse'],
    ['monitoring', 'alarm', 'camera'],
  ),
  set(
    'subscriptions.emergencyResponse',
    'Emergency response',
    'A service subscription with a stated emergency-response commitment.',
    ['subscriptions.emergencyResponseTerms'],
    [],
    ['subscriptions.servicePlan', 'subscriptions.monitoring'],
    ['emergency', 'response', 'response time'],
  ),
  set(
    'utilities.account',
    'Account',
    'A utility service with a provider-managed account. Account identity is distinct from the specific plan or membership identity.',
    [
      'common.provider',
      'common.accountNumber',
      'common.accountHolder',
      'common.accountEmail',
      'common.accountPortal',
    ],
    [],
    ['utilities.support', 'utilities.billing'],
    ['account', 'customer account', 'account holder'],
  ),
  set(
    'utilities.support',
    'Support',
    'An account with customer-support contact information.',
    ['common.supportUrl', 'common.supportPhone'],
    [],
    [],
    ['support', 'customer service', 'help'],
  ),
  set(
    'utilities.billing',
    'Billing',
    'A service with a recurring contractual charge or stated billing and payment terms.',
    ['common.recurringCharge', 'common.billingInterval', 'common.paymentMethod'],
    [],
    ['utilities.commitment'],
    ['billing', 'price', 'payment'],
  ),
  set(
    'utilities.commitment',
    'Commitment and cancellation',
    'A service with a minimum commitment period, cancellation notice or cancellation process.',
    ['common.minimumTermEnds', 'common.cancellationNotice', 'common.cancellationInstructions'],
    [],
    ['utilities.billing'],
    ['commitment', 'and', 'cancellation', 'minimum term', 'cancel', 'notice'],
  ),
  set(
    'utilities.service',
    'Utility service',
    'A utility account serving a property or providing a telecommunications service. Supply address applies to location-bound services.',
    ['common.startsOn', 'utilities.supplyAddress', 'utilities.serviceType'],
    ['utilities.account'],
    ['utilities.commitment'],
    ['utility', 'service', 'supply', 'service address'],
  ),
  set(
    'utilities.tariff',
    'Tariff terms',
    'An account with tariff-wide terms. In a bundle, use this set only for terms shared by all included services; service-specific terms belong to their service sets.',
    [
      'utilities.tariffName',
      'utilities.tariffType',
      'utilities.tariffStarts',
      'utilities.tariffEnds',
      'utilities.exitFee',
    ],
    [],
    ['utilities.service'],
    ['tariff', 'terms', 'fixed', 'variable'],
  ),
  set(
    'utilities.electricity',
    'Electricity supply',
    'An electricity supply, including the electricity component of a dual-fuel account. Meter details apply to the associated import meter.',
    [
      'utilities.electricitySupplier',
      'utilities.electricityTariffName',
      'utilities.electricityTariffEnds',
      'utilities.electricityMeterSerial',
      'utilities.electricityMeterType',
    ],
    ['utilities.service'],
    [
      'utilities.electricityRates',
      'utilities.timeOfUse',
      'utilities.electricityGb',
      'utilities.electricityPt',
      'utilities.export',
      'utilities.contractedPower',
    ],
    ['electricity', 'supply', 'electric power'],
  ),
  set(
    'utilities.electricityRates',
    'Electricity rates',
    'An electricity tariff with contractual import rates and standing charges. The single unit rate applies to single-rate tariffs; effective date and tax basis qualify the prices.',
    [
      'utilities.electricityUnitRate',
      'utilities.electricityStandingCharge',
      'utilities.electricityRateEffectiveFrom',
      'utilities.electricityRateTaxBasis',
      'utilities.electricityExitFee',
    ],
    [],
    ['utilities.electricity', 'utilities.timeOfUse', 'utilities.dynamicRates'],
    ['electricity', 'rates', 'electricity price', 'unit rate'],
  ),
  set(
    'utilities.electricityGb',
    'Electricity supply identity (GB)',
    'An electricity supply in Great Britain identified by an MPAN.',
    ['utilities.electricityMeterPointMpan'],
    ['utilities.electricity'],
    [],
    ['electricity', 'supply', 'identity', 'gb', 'MPAN', 'Great Britain'],
  ),
  set(
    'utilities.electricityPt',
    'Electricity supply identity (Portugal)',
    'An electricity supply in Portugal identified by a CPE.',
    ['utilities.electricitySupplyPointCpe'],
    ['utilities.electricity'],
    ['utilities.contractedPower'],
    ['electricity', 'supply', 'identity', 'portugal', 'CPE', 'Portugal'],
  ),
  set(
    'utilities.timeOfUse',
    'Time-of-use electricity',
    'An electricity tariff with contractual peak and off-peak rates and time windows.',
    ['utilities.peakElectricityRate', 'utilities.offPeakElectricityRate', 'utilities.offPeakHours'],
    [],
    ['utilities.electricity', 'utilities.electricityRates'],
    ['time', 'of', 'use', 'electricity', 'Economy 7', 'off-peak', 'EV tariff'],
  ),
  set(
    'utilities.dynamicRates',
    'Dynamic tariff reference',
    'An electricity tariff whose variable settlement-period prices are published at a stable provider URL. Store the reference URL here.',
    ['utilities.dynamicRateSchedule'],
    [],
    ['utilities.electricity'],
    ['dynamic', 'tariff', 'reference', 'dynamic tariff', 'half-hourly'],
  ),
  set(
    'utilities.export',
    'Electricity export',
    'An electricity supply with an export agreement and any separately assigned export meter point.',
    ['utilities.electricityExportRate', 'utilities.exportMeterPoint'],
    [],
    ['utilities.electricity'],
    ['electricity', 'export', 'solar', 'generation'],
  ),
  set(
    'utilities.contractedPower',
    'Contracted power',
    'An electricity contract specifying a contracted-power tier, including Portuguese electricity contracts.',
    ['utilities.contractedPower'],
    [],
    ['utilities.electricity'],
    ['contracted', 'power', 'kVA', 'potencia contratada'],
  ),
  set(
    'utilities.gas',
    'Gas supply',
    'A gas supply, including the gas component of a dual-fuel account. Meter units describe the physical meter.',
    [
      'utilities.gasSupplier',
      'utilities.gasTariffName',
      'utilities.gasTariffEnds',
      'utilities.gasMeterSerial',
      'utilities.gasMeterUnits',
    ],
    ['utilities.service'],
    ['utilities.gasRates', 'utilities.gasGb'],
    ['gas', 'supply', 'natural gas'],
  ),
  set(
    'utilities.gasRates',
    'Gas rates',
    'A gas tariff with contractual unit rates and standing charges. Effective date and tax basis qualify the prices.',
    [
      'utilities.gasUnitRate',
      'utilities.gasStandingCharge',
      'utilities.gasRateEffectiveFrom',
      'utilities.gasRateTaxBasis',
      'utilities.gasExitFee',
    ],
    [],
    ['utilities.gas'],
    ['gas', 'rates', 'gas price', 'unit rate'],
  ),
  set(
    'utilities.gasGb',
    'Gas supply identity (GB)',
    'A gas supply in Great Britain identified by an MPRN.',
    ['utilities.gasMeterPointMprn'],
    ['utilities.gas'],
    [],
    ['gas', 'supply', 'identity', 'gb', 'MPRN', 'Great Britain'],
  ),
  set(
    'utilities.dualFuel',
    'Electricity and gas',
    'One account supplying both electricity and gas to the same service location.',
    [],
    ['utilities.electricity', 'utilities.gas'],
    ['utilities.electricityRates', 'utilities.gasRates', 'utilities.tariff'],
    ['electricity', 'and', 'gas', 'dual fuel', 'electricity and gas'],
  ),
  set(
    'utilities.water',
    'Water supply',
    'A clean-water supply account. Fixed charge and effective date apply where published.',
    [
      'utilities.waterSupplier',
      'utilities.waterChargingBasis',
      'utilities.waterFixedCharge',
      'utilities.waterChargesEffectiveFrom',
    ],
    ['utilities.service'],
    ['utilities.meteredWater', 'utilities.unmeteredWater', 'utilities.wastewater'],
    ['water', 'supply', 'clean water'],
  ),
  set(
    'utilities.meteredWater',
    'Metered water',
    'A water supply billed using a physical meter.',
    ['utilities.waterMeterSerial', 'utilities.waterUnitRate'],
    ['utilities.water'],
    [],
    ['metered', 'water', 'metered water', 'water meter'],
  ),
  set(
    'utilities.unmeteredWater',
    'Unmetered water',
    'A water account billed using a property rateable value.',
    ['utilities.rateableValue'],
    ['utilities.water'],
    [],
    ['unmetered', 'water', 'rateable value'],
  ),
  set(
    'utilities.wastewater',
    'Wastewater',
    'A service charging for wastewater collection or treatment. Unit rate applies to usage-based charging.',
    [
      'utilities.wastewaterProvider',
      'utilities.wastewaterUnitRate',
      'utilities.wastewaterFixedCharge',
    ],
    ['utilities.service'],
    ['utilities.water'],
    ['wastewater', 'sewerage'],
  ),
  set(
    'utilities.broadband',
    'Broadband',
    'A broadband service, including the broadband component of a telecommunications bundle. Speeds are contractual specifications.',
    [
      'utilities.broadbandPlan',
      'utilities.broadbandTechnology',
      'utilities.advertisedDownloadSpeed',
      'utilities.estimatedDownloadSpeed',
      'utilities.minimumGuaranteedDownloadSpeed',
      'utilities.uploadSpeed',
      'utilities.dataAllowance',
      'utilities.routerOwnership',
    ],
    ['utilities.service'],
    ['utilities.landline', 'utilities.tariff'],
    ['broadband', 'fibre', 'internet', 'FTTP'],
  ),
  set(
    'utilities.landline',
    'Landline',
    'A fixed telephone service, including the landline component of a bundle.',
    ['utilities.landlineNumber', 'utilities.includedCalls'],
    ['utilities.service'],
    ['utilities.broadband'],
    ['landline', 'telephone', 'VoIP'],
  ),
  set(
    'utilities.mobile',
    'Mobile service',
    'A mobile phone or mobile-data contract. Roaming, calls and spending caps apply where offered.',
    [
      'utilities.mobileNumber',
      'utilities.mobileNetwork',
      'utilities.simIdentifierIccid',
      'utilities.mobileDataAllowance',
      'utilities.includedMinutes',
      'utilities.roamingAllowance',
      'utilities.roamingDestinations',
      'utilities.spendingCap',
    ],
    ['utilities.service'],
    ['utilities.handsetFinance', 'utilities.tariff'],
    ['mobile', 'service', 'SIM', 'airtime', 'roaming'],
  ),
  set(
    'utilities.handsetFinance',
    'Handset repayments',
    'A mobile contract with a separately priced handset repayment agreement.',
    ['utilities.handsetInstalment', 'utilities.handsetRepaymentEnds'],
    [],
    ['utilities.mobile'],
    ['handset', 'repayments', 'phone finance'],
  ),
  set(
    'utilities.heat',
    'Heat network',
    'A metered district or communal heating supply.',
    ['utilities.heatUnitRate', 'utilities.heatStandingCharge'],
    ['utilities.service'],
    [],
    ['heat', 'network', 'district heating', 'heat network'],
  ),
  set(
    'utilities.deliveredFuel',
    'Delivered fuel',
    'A heating-oil or LPG supply delivered by volume to an associated storage tank.',
    ['utilities.fuelDeliveryUnit', 'utilities.fuelTankCapacity'],
    ['utilities.service'],
    [],
    ['delivered', 'fuel', 'oil', 'LPG', 'fuel tank'],
  ),
  set(
    'utilities.waste',
    'Waste collection',
    'A waste-collection service with an allocated container.',
    ['utilities.containerSize'],
    ['utilities.service'],
    [],
    ['waste', 'collection', 'bin'],
  ),
  set(
    'insurance.policy',
    'Policy',
    'An insurance policy or separately identified cover agreement. Brokers and underwriters apply where identified.',
    [
      'insurance.provider',
      'insurance.underwriter',
      'insurance.broker',
      'insurance.policyNumber',
      'insurance.policyholder',
      'insurance.policyStarts',
      'insurance.policyEnds',
      'common.automaticallyRenew',
    ],
    [],
    ['insurance.insuredPeople', 'insurance.premium', 'insurance.claims'],
    ['policy', 'insurance'],
  ),
  set(
    'insurance.insuredPeople',
    'Insured people',
    'A policy covering named people.',
    ['insurance.insuredPeople'],
    [],
    ['insurance.policy'],
    ['insured', 'people', 'insured persons', 'family'],
  ),
  set(
    'insurance.premium',
    'Premium and payment',
    'A policy with a quoted annual premium or instalment agreement.',
    [
      'insurance.annualPremium',
      'insurance.instalmentAmount',
      'insurance.instalmentFrequency',
      'common.paymentMethod',
      'insurance.cancellationTerms',
    ],
    [],
    ['insurance.policy'],
    ['premium', 'and', 'payment', 'instalments'],
  ),
  set(
    'insurance.claims',
    'Claims and assistance',
    'A policy with claim-submission or emergency-assistance contact channels.',
    ['insurance.claimsPhone', 'insurance.claimsPage', 'insurance.emergencyAssistancePhone'],
    [],
    ['insurance.policy'],
    ['claims', 'and', 'assistance', 'claim'],
  ),
  set(
    'insurance.property',
    'Insured property',
    'Home cover referring to a single insured property address, shared by any buildings and contents components.',
    ['insurance.insuredPropertyAddress'],
    [],
    ['insurance.buildings', 'insurance.contents'],
    ['insured', 'property', 'home', 'address'],
  ),
  set(
    'insurance.buildings',
    'Buildings cover',
    'Insurance covering a building structure, including the buildings component of combined home cover.',
    [
      'insurance.sumInsured',
      'insurance.buildingsCoverBasis',
      'insurance.excess',
      'insurance.subsidenceExcess',
      'insurance.buildingsAccidentalDamage',
      'insurance.alternativeAccommodationLimit',
    ],
    ['insurance.policy', 'insurance.property'],
    [
      'insurance.contents',
      'insurance.homeEmergency',
      'insurance.publicLiability',
      'insurance.legalExpenses',
    ],
    ['buildings', 'cover', 'rebuild', 'home'],
  ),
  set(
    'insurance.contents',
    'Contents cover',
    'Insurance covering possessions, including the contents component of combined home cover. Limits and excesses apply to this component.',
    [
      'insurance.sumInsured',
      'insurance.contentsCoverBasis',
      'insurance.excess',
      'insurance.contentsAccidentalDamage',
      'insurance.singleItemLimit',
      'insurance.valuablesTotalLimit',
      'insurance.awayFromHomeCoverLimit',
    ],
    ['insurance.policy', 'insurance.property'],
    ['insurance.buildings', 'insurance.specifiedItem', 'insurance.legalExpenses'],
    ['contents', 'cover', 'possessions', 'valuables'],
  ),
  set(
    'insurance.combined',
    'Buildings and contents',
    'One policy covering both a building and its contents at the same insured property.',
    [],
    ['insurance.policy', 'insurance.buildings', 'insurance.contents'],
    ['insurance.homeEmergency', 'insurance.legalExpenses'],
    ['buildings', 'and', 'contents', 'combined home', 'buildings and contents'],
  ),
  set(
    'insurance.specifiedItem',
    'Specified possession',
    'A contents policy with exactly one individually scheduled possession whose description and value are recorded together. Multiple scheduled possessions require a repeated-item model before mapping this section.',
    ['insurance.specifiedItem', 'insurance.specifiedItemInsuredValue'],
    [],
    ['insurance.contents'],
    ['specified', 'possession', 'specified item', 'scheduled item', 'jewellery'],
  ),
  set(
    'insurance.motor',
    'Motor cover',
    'Motor cover for one insured vehicle with one set of cover and excess terms. Per-vehicle differences in multi-vehicle policies require a repeated-vehicle model before mapping this section.',
    [
      'insurance.insuredVehicle',
      'insurance.motorCoverLevel',
      'insurance.permittedUse',
      'insurance.namedDrivers',
      'insurance.declaredAnnualMileage',
      'insurance.compulsoryMotorExcess',
      'insurance.voluntaryMotorExcess',
      'insurance.windscreenExcess',
      'insurance.noClaimsDiscount',
      'insurance.noClaimsProtection',
      'insurance.courtesyVehicleTerms',
    ],
    ['insurance.policy'],
    ['insurance.breakdown', 'insurance.legalExpenses'],
    ['motor', 'cover', 'car insurance', 'motor insurance', 'van insurance'],
  ),
  set(
    'insurance.travel',
    'Travel cover',
    'Travel insurance or the travel component of a bundled policy. Benefit limits retain their per-person or per-claim basis.',
    [
      'insurance.travelPolicyType',
      'insurance.travelCoverArea',
      'insurance.maximumTripLength',
      'insurance.cancellationLimit',
      'insurance.emergencyMedicalLimit',
      'insurance.baggageLimit',
      'insurance.travelExcess',
      'insurance.winterSportsCover',
      'insurance.cruiseCover',
      'insurance.medicalScreeningReference',
    ],
    ['insurance.policy'],
    ['insurance.insuredPeople'],
    ['travel', 'cover', 'holiday', 'annual multi-trip'],
  ),
  set(
    'insurance.pet',
    'Pet cover',
    'Pet insurance for one insured pet and one set of cover terms. Per-pet differences in multi-pet policies require a repeated-pet model before mapping this section.',
    [
      'insurance.insuredPet',
      'insurance.petCoverType',
      'insurance.vetFeesLimit',
      'insurance.vetFeesLimitBasis',
      'insurance.vetFeesExcess',
      'insurance.vetFeesCoPayment',
      'insurance.conditionCoverDuration',
    ],
    ['insurance.policy'],
    ['insurance.publicLiability'],
    ['pet', 'cover', 'vet', 'cat', 'dog'],
  ),
  set(
    'insurance.medical',
    'Medical cover',
    'Private medical insurance, including a medical component with its own benefits and underwriting terms.',
    [
      'insurance.medicalCoverTier',
      'insurance.hospitalNetwork',
      'insurance.outpatientLimit',
      'insurance.medicalExcess',
      'insurance.underwritingBasis',
      'insurance.waitingPeriodEnds',
    ],
    ['insurance.policy'],
    ['insurance.insuredPeople', 'insurance.dental'],
    ['medical', 'cover', 'health', 'hospital'],
  ),
  set(
    'insurance.dental',
    'Dental cover',
    'A policy or policy component providing dental cover with an annual limit. Waiting-period end applies to this dental benefit where specified.',
    ['insurance.dentalAnnualLimit', 'insurance.waitingPeriodEnds'],
    ['insurance.policy'],
    ['insurance.medical'],
    ['dental', 'cover', 'dentist'],
  ),
  set(
    'insurance.life',
    'Life cover',
    'Life assurance with one life-assured value and one set of cover terms. Term-end applies to fixed-term cover.',
    [
      'insurance.lifeAssured',
      'insurance.lifeCoverAmount',
      'insurance.lifeCoverBasis',
      'insurance.coverTermEnds',
    ],
    ['insurance.policy'],
    ['insurance.criticalIllness'],
    ['life', 'cover', 'life assurance', 'term life'],
  ),
  set(
    'insurance.criticalIllness',
    'Critical illness cover',
    'A policy or policy component paying a stated critical-illness benefit.',
    ['insurance.criticalIllnessAmount'],
    ['insurance.policy'],
    ['insurance.life'],
    ['critical', 'illness', 'cover', 'critical illness'],
  ),
  set(
    'insurance.incomeProtection',
    'Income protection',
    'Income protection with monthly benefits, a deferred period and defined payment-duration and incapacity terms.',
    [
      'insurance.monthlyBenefit',
      'insurance.deferredPeriod',
      'insurance.maximumBenefitPaymentPeriod',
      'insurance.incapacityDefinition',
      'insurance.coverCeases',
    ],
    ['insurance.policy'],
    [],
    ['income', 'protection', 'income protection', 'incapacity'],
  ),
  set(
    'insurance.breakdown',
    'Breakdown cover',
    'Standalone breakdown cover or the breakdown component of another policy.',
    ['insurance.breakdownCoverBasis', 'insurance.breakdownTerritory'],
    ['insurance.policy'],
    ['insurance.motor'],
    ['breakdown', 'cover', 'roadside assistance'],
  ),
  set(
    'insurance.homeEmergency',
    'Home emergency cover',
    'Standalone home-emergency cover or an emergency component of home insurance.',
    ['insurance.homeEmergencyLimit'],
    ['insurance.policy'],
    ['insurance.buildings', 'insurance.contents'],
    ['home', 'emergency', 'cover', 'home emergency', 'boiler emergency'],
  ),
  set(
    'insurance.gadget',
    'Gadget cover',
    'Cover for one identified gadget with one per-item limit. Multiple gadgets with different terms require a repeated-item model before mapping this section.',
    ['insurance.gadgetInsuredItem', 'insurance.gadgetCoverLimit'],
    ['insurance.policy'],
    [],
    ['gadget', 'cover', 'phone insurance', 'laptop insurance'],
  ),
  set(
    'insurance.publicLiability',
    'Public liability',
    'A policy or component providing a stated public-liability limit.',
    ['insurance.publicLiabilityLimit'],
    ['insurance.policy'],
    [],
    ['public', 'liability', 'third party'],
  ),
  set(
    'insurance.legalExpenses',
    'Legal expenses',
    'A policy or component providing a stated legal-expenses limit.',
    ['insurance.legalExpensesLimit'],
    ['insurance.policy'],
    [],
    ['legal', 'expenses', 'legal expenses', 'legal protection'],
  ),
];

export async function seedRegistry(db: Database) {
  // Validate definitions and inclusion dependencies before writing registry metadata.
  new Registry(fields, sets);

  for (const c of categories)
    await database.execute(
      db,
      'insert into bt.categories(id,name,description,icon,default_image,sort_order) values($1,$2,$3,$4,$5,$6) on conflict(id) do update set name=excluded.name,description=excluded.description,icon=excluded.icon,default_image=excluded.default_image,sort_order=excluded.sort_order',
      [c.id, c.name, c.description, c.icon, c.defaultImage, c.sortOrder],
    );

  for (const f of fields)
    await database.execute(
      db,
      'insert into bt.field_definitions(id,name,description,keywords,schema,ui_hint,sensitive,icon) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(id) do update set name=excluded.name,description=excluded.description,keywords=excluded.keywords,schema=excluded.schema,ui_hint=excluded.ui_hint,sensitive=excluded.sensitive,icon=excluded.icon',
      [
        f.id,
        f.name,
        f.description,
        f.keywords,
        JSON.stringify(f.schema),
        f.uiHint,
        f.sensitive,
        f.icon ?? null,
      ],
    );

  for (const s of sets)
    await database.execute(
      db,
      'insert into bt.field_sets(id,category_id,name,eligibility,keywords,includes,consider_alongside,field_ids) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(id) do update set category_id=excluded.category_id,name=excluded.name,eligibility=excluded.eligibility,keywords=excluded.keywords,includes=excluded.includes,consider_alongside=excluded.consider_alongside,field_ids=excluded.field_ids',
      [
        s.id,
        s.categoryId,
        s.name,
        s.eligibility,
        s.keywords,
        s.includes,
        s.considerAlongside,
        s.fields.map((f) => f.id),
      ],
    );
}
