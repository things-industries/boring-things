/** A page that can hold navigation, such as to confirm discarding unsaved edits. */
export interface LeaveGuarded {
  /** Whether navigation may leave the page; a promise when the owner is asked first. */
  canLeave(): boolean | Promise<boolean>;
}
