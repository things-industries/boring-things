import { rows, type Database } from './connection.js';
import type { Schema } from '../../../shared/model.js';
export async function profile(db: Database, owner: string) {
  return (
    await rows<Schema['Profile']>(
      db,
      'select id,display_name,samples_added from bt.users where id=$1',
      [owner],
    )
  )[0];
}

export async function ownerForSubject(
  db: Database,
  subject: string,
  name?: string,
): Promise<string> {
  const [user] = await rows<{ id: string }>(
    db,
    `insert into bt.users(auth_subject,display_name) values($1,$2) on conflict(auth_subject) do update set auth_subject=excluded.auth_subject returning id`,
    [subject, name ?? 'You'],
  );
  return user.id;
}
