#import "RCTBridgeModule.h"

@interface RCT_EXTERN_MODULE(GymlyContactPicker, NSObject)

RCT_EXTERN_METHOD(pickContacts:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
