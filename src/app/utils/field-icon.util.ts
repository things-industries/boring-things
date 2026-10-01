import { fieldIcons } from '../core/app-icons';
type FieldIconName = keyof typeof fieldIcons;
/** Catalogue icon name for a registry `Field.icon` key; unknown and missing keys use the default. */
export function fieldIcon(key: string | null | undefined): FieldIconName {
  return key && key in fieldIcons ? (key as FieldIconName) : 'fieldDefault';
}
