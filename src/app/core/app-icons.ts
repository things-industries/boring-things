import {
  remixAddLine,
  remixArrowRightLine,
  remixUploadLine,
  remixArrowLeftLine,
  remixArrowRightUpLine,
  remixCheckLine,
  remixSearchLine,
  remixStarLine,
  remixStarFill,
  remixHomeLine,
  remixCarLine,
  remixTicketLine,
  remixCameraLine,
  remixImageLine,
  remixFileListLine,
  remixBuildingLine,
  remixHashtag,
  remixBarcodeLine,
  remixCalendarLine,
  remixShieldCheckLine,
  remixStore2Line,
  remixGroupLine,
  remixScalesLine,
  remixMoneyPoundCircleLine,
  remixRefreshLine,
  remixVipCrownLine,
  remixLockPasswordLine,
} from '@ng-icons/remixicon';
export const addThing = remixAddLine;
export const back = remixArrowLeftLine;
export const open = remixArrowRightUpLine;
export const complete = remixCheckLine;
export const searchThings = remixSearchLine;
export const pinField = remixStarLine;
export const pinnedField = remixStarFill;
export const homeExample = remixHomeLine;
export const vehicleExample = remixCarLine;
export const membershipExample = remixTicketLine;

export const scheduleEvent = remixArrowRightLine;
export const uploadFile = remixUploadLine;
export const addTag = remixAddLine;
export const takePhoto = remixCameraLine;
export const choosePhoto = remixImageLine;

export const fieldIcons = {
  fieldDefault: remixFileListLine,
  fieldManufacturer: remixBuildingLine,
  fieldModel: remixHashtag,
  fieldSerial: remixBarcodeLine,
  fieldDate: remixCalendarLine,
  fieldInsurance: remixShieldCheckLine,
  fieldRetailer: remixStore2Line,
  fieldVehicle: remixCarLine,
  fieldSeats: remixGroupLine,
  fieldWeight: remixScalesLine,
  fieldPolicy: remixFileListLine,
  fieldMoney: remixMoneyPoundCircleLine,
  fieldMembership: remixTicketLine,
  fieldRenewal: remixRefreshLine,
  fieldLevel: remixVipCrownLine,
  fieldAccessCode: remixLockPasswordLine,
};

export function fieldIconName(icon?: string | null): keyof typeof fieldIcons {
  return icon && Object.hasOwn(fieldIcons, icon)
    ? (icon as keyof typeof fieldIcons)
    : 'fieldDefault';
}
