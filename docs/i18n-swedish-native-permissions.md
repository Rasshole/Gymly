# Swedish native iOS permission strings (Phase 3)

## Added files
- `ios/GymlyFresh/sv.lproj/InfoPlist.strings`
- `ios/GymlyFresh/en.lproj/InfoPlist.strings`
- `ios/GymlyFresh/da.lproj/InfoPlist.strings`
- `CFBundleLocalizations` = en, da, sv in `Info.plist`

## Remaining Xcode wire-up
The `.lproj/InfoPlist.strings` files are **not yet referenced** in `ios/Gymly.xcodeproj/project.pbxproj`.

To activate system-dialog localization on device builds:

1. Open `ios/Gymly.xcworkspace` in Xcode
2. Add the three `*.lproj` folders (or each `InfoPlist.strings`) to the GymlyFresh target
3. Confirm Project → Info → Localizations includes English, Danish, Swedish

Until then, iOS may still show the base `Info.plist` usage strings (mixed EN/DA).

## Android
App-owned permission *rationale* dialogs use JS `rt('permissions.*')` and are Swedish when `sv` is selected.
OS permission dialogs use Android system copy; no custom `values-sv` permission strings were required for Phase 3.

## Norwegian Bokmål (Phase 4)
- Added `ios/GymlyFresh/nb.lproj/InfoPlist.strings`
- `CFBundleLocalizations` includes `nb`
- Android: `android/app/src/main/res/values-nb/strings.xml` (app_name)
- Xcode `project.pbxproj` membership for `.lproj` folders still required for InfoPlist.strings to ship (same Phase 3 limitation).
