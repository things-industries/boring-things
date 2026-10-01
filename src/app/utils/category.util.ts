import type { categoryIcons } from '../core/app-icons';
type CategoryIconName = keyof typeof categoryIcons;
const icons: Record<string, CategoryIconName> = {
  appliance: 'categoryAppliance',
  device: 'categoryDevice',
  vehicle: 'categoryVehicle',
  membership: 'categoryMembership',
  subscription: 'categorySubscription',
  utility: 'categoryUtility',
  insurance: 'categoryInsurance',
  other: 'categoryOther',
};
/** Catalogue icon name for a registry `Category.icon` key; unknown keys use the Other icon. */
export function categoryIcon(key: string | null | undefined): CategoryIconName {
  return (key && icons[key]) || 'categoryOther';
}
