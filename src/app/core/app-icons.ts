import {
  remixAddLine,
  remixArrowRightLine,
  remixUploadLine,
  remixArrowLeftLine,
  remixArrowRightUpLine,
  remixArrowRightSLine,
  remixArrowUpLine,
  remixAttachment2,
  remixBookOpenLine,
  remixBox3Fill,
  remixBox3Line,
  remixCalendarEventLine,
  remixCalendarFill,
  remixCalendarLine,
  remixChat3Fill,
  remixChat3Line,
  remixCheckLine,
  remixCloseLine,
  remixDeleteBinLine,
  remixDownloadLine,
  remixErrorWarningLine,
  remixExchangeLine,
  remixFileCopyLine,
  remixFileLine,
  remixFileSearchLine,
  remixFileTextLine,
  remixHome5Fill,
  remixHome5Line,
  remixImageEditLine,
  remixLinkUnlink,
  remixLoader4Line,
  remixLock2Line,
  remixMoreLine,
  remixPencilLine,
  remixPriceTag3Line,
  remixSearchLine,
  remixShieldCheckLine,
  remixShoppingBagLine,
  remixStarLine,
  remixStarFill,
  remixText,
  remixTimeLine,
  remixToolsLine,
  remixCameraLine,
  remixImageLine,
  remixMailLine,
  remixAppleFill,
  remixInformationLine,
  remixAccountCircleLine,
  remixAlertLine,
  remixFridgeLine,
  remixMacbookLine,
  remixCarLine,
  remixIdCardLine,
  remixLoopRightLine,
  remixFlashlightLine,
  remixShieldLine,
} from '@ng-icons/remixicon';
export const addThing = remixAddLine;
export const back = remixArrowLeftLine;
export const open = remixArrowRightUpLine;
export const complete = remixCheckLine;
export const searchThings = remixSearchLine;
export const pinField = remixStarLine;
export const pinnedField = remixStarFill;

export const scheduleEvent = remixArrowRightLine;
export const uploadFile = remixUploadLine;
export const addTag = remixAddLine;
export const takePhoto = remixCameraLine;
export const choosePhoto = remixImageLine;

// Navigation and page controls
export const navHome = remixHome5Line;
export const navHomeActive = remixHome5Fill;
export const navThings = remixBox3Line;
export const navThingsActive = remixBox3Fill;
export const navTimeline = remixCalendarLine;
export const navTimelineActive = remixCalendarFill;
export const navAsk = remixChat3Line;
export const navAskActive = remixChat3Fill;
export const openProfile = remixAccountCircleLine;
export const moreActions = remixMoreLine;
export const openRow = remixArrowRightSLine;
export const close = remixCloseLine;
export const loading = remixLoader4Line;

// Sign in
export const signInWithEmail = remixMailLine;
export const signInWithApple = remixAppleFill;
export const setupNotice = remixInformationLine;

// Home
export const askQuestion = remixChat3Line;
export const issueRenewal = remixAlertLine;
export const issueWarranty = remixShieldCheckLine;
export const issueFault = remixErrorWarningLine;
export const issueOther = remixInformationLine;
export const upcomingEvent = remixCalendarEventLine;

// Add Thing
export const chooseFile = remixFileLine;
export const pasteText = remixText;
export const privacyNotice = remixLock2Line;

// Thing detail
export const warrantyStatus = remixShieldCheckLine;
export const ageStatus = remixTimeLine;
export const manualStatus = remixBookOpenLine;
export const copyDetails = remixFileCopyLine;
export const maintenanceTask = remixToolsLine;
export const compatibleProduct = remixShoppingBagLine;
export const attachmentDocument = remixFileTextLine;
export const downloadAttachment = remixDownloadLine;
export const editDetails = remixPencilLine;
export const changeCategory = remixExchangeLine;
export const editTags = remixPriceTag3Line;
export const deleteItem = remixDeleteBinLine;
export const setAsImage = remixImageEditLine;
export const extractDetails = remixFileSearchLine;
export const unlinkAttachment = remixLinkUnlink;

// Chat
export const attachToMessage = remixAttachment2;
export const sendMessage = remixArrowUpLine;

// Categories, keyed by the registry's `Category.icon`. Read through `categoryIcon()`.
export const categoryIcons = {
  categoryAppliance: remixFridgeLine,
  categoryDevice: remixMacbookLine,
  categoryVehicle: remixCarLine,
  categoryMembership: remixIdCardLine,
  categorySubscription: remixLoopRightLine,
  categoryUtility: remixFlashlightLine,
  categoryInsurance: remixShieldLine,
  categoryOther: remixFileTextLine,
};
