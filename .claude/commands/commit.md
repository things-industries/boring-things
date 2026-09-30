description: Review local changes write a commit message and commit changes
allowed-tools: Read, Edit, Bash(git *)
---

Review my current git diff, write a clear and descriptive but brief commit message with the appropriate prefix (feat/fix/chore etc.) and context. Do not include a message saying it was authored by claude or any other irrelevant information

Do not write whole paragraphs of text below the main commit message. Include dot point summary if the main commit message cannot address everything in a few words.

An example might be: 
feat(push-notifications): implement Firebase messaging support for iOS

- add remote notification handling in AppDelegate
- create AppRelease.entitlements for entitlements configuration
- update GoogleService-Info.plist with real Firebase config
- modify Info.plist to support background remote notifications
- adjust push-notifications.service.ts to enable iOS messaging
