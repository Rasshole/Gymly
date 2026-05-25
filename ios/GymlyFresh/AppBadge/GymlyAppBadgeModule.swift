import Foundation
import UIKit

@objc(GymlyAppBadgeModule)
class GymlyAppBadgeModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc func setBadgeCount(_ count: NSNumber) {
    DispatchQueue.main.async {
      let value = max(0, count.intValue)
      UIApplication.shared.applicationIconBadgeNumber = value
    }
  }
}
