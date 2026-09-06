//
// Expose only the React promise block types Swift needs.
// Do not import <React/RCTBridgeModule.h> here: with use_frameworks!
// those headers live in DerivedData and are unavailable during
// Swift bridging-header dependency scanning on a clean build.
// ObjC bridge files (.m) still import React headers directly.
//
#import <Foundation/Foundation.h>

typedef void (^RCTPromiseResolveBlock)(id _Nullable result);
typedef void (^RCTPromiseRejectBlock)(NSString *code, NSString *message, NSError *_Nullable error);
