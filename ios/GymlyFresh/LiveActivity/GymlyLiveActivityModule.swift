import ActivityKit
import Foundation

@objc(GymlyLiveActivityModule)
class GymlyLiveActivityModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc func endLiveActivity(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor in
      await Self.endAllActivities()
      resolve(nil)
    }
  }

  @objc func cleanupAllLiveActivities(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor in
      await Self.endAllActivities()
      resolve(nil)
    }
  }

  @objc func startLiveActivity(
    _ workoutType: String,
    centerName: String,
    startedAtMs: NSNumber,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 16.2, *) else {
      resolve(["ok": false, "reason": "os"])
      return
    }
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      resolve(["ok": false, "reason": "disabled"])
      return
    }
    let started = Date(timeIntervalSince1970: startedAtMs.doubleValue / 1000.0)
    Task { @MainActor in
      do {
        await Self.endAllActivities()
        let attrs = GymlyActivityAttributes(
          workoutType: workoutType,
          centerName: centerName,
          startedAt: started
        )
        let state = GymlyActivityAttributes.ContentState(startedAt: started)
        _ = try Activity<GymlyActivityAttributes>.request(
          attributes: attrs,
          contentState: state,
          pushType: nil
        )
        resolve(["ok": true])
      } catch {
        resolve(["ok": false, "reason": "error", "message": error.localizedDescription])
      }
    }
  }

  @MainActor
  private static func endAllActivities() async {
    guard #available(iOS 16.2, *) else { return }
    for activity in Activity<GymlyActivityAttributes>.activities {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }
}
