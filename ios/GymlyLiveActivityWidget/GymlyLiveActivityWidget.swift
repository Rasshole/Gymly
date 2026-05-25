import ActivityKit
import SwiftUI
import WidgetKit

// Gymly primary #8B5CF6
private let gymlyPurple = Color(red: 139 / 255, green: 92 / 255, blue: 246 / 255)
private let gymlyPurpleDark = Color(red: 94 / 255, green: 57 / 255, blue: 198 / 255)
private let secondaryText = Color.white.opacity(0.74)

@main
struct GymlyLiveActivityWidgetBundle: WidgetBundle {
  var body: some Widget {
    GymlyLiveActivityWidget()
  }
}

struct GymlyLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: GymlyActivityAttributes.self) { context in
      GymlyLiveActivityLockScreenCard(
        attributes: context.attributes,
        startedAt: context.state.startedAt
      )
      .activityBackgroundTint(Color.clear)
      .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Color.clear.frame(width: 1, height: 1)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(spacing: 6) {
            Text(context.state.startedAt, style: .timer)
              .font(.system(size: 24, weight: .bold, design: .rounded))
              .monospacedDigit()
              .foregroundStyle(.white)
              .lineLimit(1)
              .minimumScaleFactor(0.75)
              .multilineTextAlignment(.center)
            Text(context.attributes.workoutType)
              .font(.system(size: 16, weight: .semibold, design: .rounded))
              .foregroundStyle(.white)
              .lineLimit(1)
              .minimumScaleFactor(0.8)
              .multilineTextAlignment(.center)
            Text(shortCenterName(context.attributes.centerName))
              .font(.system(size: 13, weight: .medium, design: .rounded))
              .foregroundStyle(secondaryText)
              .lineLimit(1)
              .minimumScaleFactor(0.8)
              .multilineTextAlignment(.center)
              .truncationMode(.tail)
          }
          .frame(maxWidth: .infinity, alignment: .center)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Color.clear.frame(width: 1, height: 1)
        }
      } compactLeading: {
        islandTimerText(context.state.startedAt, size: 13)
      } compactTrailing: {
        Color.clear.frame(width: 1, height: 1)
      } minimal: {
        islandTimerText(context.state.startedAt, size: 12)
      }
      .keylineTint(gymlyPurple)
    }
  }
}

// MARK: - Lock screen

private struct GymlyLiveActivityLockScreenCard: View {
  let attributes: GymlyActivityAttributes
  let startedAt: Date

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .fill(.ultraThinMaterial)
        .overlay(
          RoundedRectangle(cornerRadius: 22, style: .continuous)
            .fill(
              LinearGradient(
                colors: [
                  gymlyPurple.opacity(0.22),
                  gymlyPurpleDark.opacity(0.14),
                  .black.opacity(0.12),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              )
            )
        )
        .overlay(
          RoundedRectangle(cornerRadius: 22, style: .continuous)
            .stroke(.white.opacity(0.18), lineWidth: 0.7)
        )
        .shadow(color: .black.opacity(0.18), radius: 8, y: 5)

      VStack(spacing: 6) {
        Text(startedAt, style: .timer)
          .font(.system(size: 52, weight: .bold, design: .rounded))
          .monospacedDigit()
          .lineLimit(1)
          .minimumScaleFactor(0.75)
          .multilineTextAlignment(.center)
          .foregroundStyle(.white)

        Text(attributes.workoutType)
          .font(.system(size: 22, weight: .semibold, design: .rounded))
          .foregroundStyle(.white)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
          .multilineTextAlignment(.center)
          .truncationMode(.tail)

        Text(shortCenterName(attributes.centerName))
          .font(.system(size: 18, weight: .medium, design: .rounded))
          .foregroundStyle(secondaryText)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
          .multilineTextAlignment(.center)
          .truncationMode(.tail)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
      .padding(.horizontal, 24)
      .padding(.vertical, 18)
    }
    .frame(maxWidth: .infinity)
  }
}

private func islandTimerText(_ startedAt: Date, size: CGFloat) -> some View {
  Text(startedAt, style: .timer)
    .font(.system(size: size, weight: .semibold, design: .rounded))
    .monospacedDigit()
    .foregroundStyle(.white)
    .lineLimit(1)
    .minimumScaleFactor(0.8)
}

private func shortCenterName(_ full: String) -> String {
  let trimmed = full.trimmingCharacters(in: .whitespacesAndNewlines)
  if let range = trimmed.range(of: " - ", options: .backwards) {
    let prefix = String(trimmed[..<range.lowerBound]).trimmingCharacters(in: .whitespaces)
    if !prefix.isEmpty {
      return prefix
    }
  }
  return trimmed
}
