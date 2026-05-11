#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(GymlyLiveActivityModule, NSObject)

RCT_EXTERN_METHOD(startLiveActivity:(NSString *)workoutType
                  centerName:(NSString *)centerName
                  startedAtMs:(nonnull NSNumber *)startedAtMs
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endLiveActivity:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(cleanupAllLiveActivities:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
