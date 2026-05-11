import ActivityKit
import Foundation

/// Delt mellem app-target og Live Activity-widget. Skal være identisk i begge targets.
public struct GymlyActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// Check-in timestamp; bruges til SwiftUI `Text(..., style: .timer)` så tiden tæller live på lock screen og i Dynamic Island.
    public var startedAt: Date

    public init(startedAt: Date) {
      self.startedAt = startedAt
    }
  }

  public var workoutType: String
  public var centerName: String
  public var startedAt: Date

  public init(workoutType: String, centerName: String, startedAt: Date) {
    self.workoutType = workoutType
    self.centerName = centerName
    self.startedAt = startedAt
  }
}
